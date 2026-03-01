#!/bin/bash
# =============================================================================
# run-compute-comparison.sh — Build, deploy, and run compute comparison test
#
# Builds and deploys both the Stylus WASM and Solidity compute benchmark
# contracts, then runs the iterated keccak256 comparison test.
#
# Prerequisites:
#   - Foundry (forge, cast) installed
#   - Cargo Stylus installed (cargo stylus)
#   - Running L2 chain at L2_CHAIN_RPC
#   - .env with DEPLOYER_PRIVATE_KEY / TEST_USER_PRIVATE_KEY
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STYLUS_DIR="$PROJECT_ROOT/contracts/compute-stylus"
EVM_DIR="$PROJECT_ROOT/contracts/compute-evm"
LOAD_DIR="$PROJECT_ROOT/tests/load"
CONFIG_DIR="$PROJECT_ROOT/chain-config"

# Load environment
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  source "$PROJECT_ROOT/.env"
  set +a
fi

RPC="${L2_CHAIN_RPC:-http://localhost:8449}"
DEPLOYER_KEY="${CONTRACT_DEPLOYER_KEY:-${DEPLOYER_PRIVATE_KEY:-}}"

echo "============================================================"
echo "  Compute Comparison: Stylus WASM vs EVM — Iterated Keccak256"
echo "============================================================"
echo "  L2 RPC:        $RPC"
echo "  Stylus source: $STYLUS_DIR"
echo "  EVM source:    $EVM_DIR/ComputeEVM.sol"
echo ""

# ── Step 1: Build Stylus contract ──────────────────────────────────────────

echo "[1/6] Building Stylus compute contract..."
cd "$STYLUS_DIR"
cargo generate-lockfile 2>/dev/null || true
cargo stylus check --endpoint "$RPC"
echo "  Stylus WASM validation OK."
echo ""

# ── Step 2: Build Solidity contract ────────────────────────────────────────

echo "[2/6] Building Solidity compute contract..."
cd "$EVM_DIR"
forge build --force
echo "  Forge build OK."
echo ""

# ── Step 3: Deploy Stylus contract ─────────────────────────────────────────

echo "[3/6] Deploying Stylus compute contract to L2..."
if [ -z "$DEPLOYER_KEY" ]; then
  echo "ERROR: No deployer key. Set CONTRACT_DEPLOYER_KEY or DEPLOYER_PRIVATE_KEY in .env"
  exit 1
fi

cd "$STYLUS_DIR"
STYLUS_OUTPUT=$(cargo stylus deploy \
  --endpoint "$RPC" \
  --private-key "$DEPLOYER_KEY" \
  2>&1) || {
  echo "  cargo stylus deploy failed:"
  echo "$STYLUS_OUTPUT"
  exit 1
}

echo "$STYLUS_OUTPUT"

# Parse deployed address from cargo stylus output
STYLUS_ADDRESS=$(echo "$STYLUS_OUTPUT" | grep -oE 'deployed code at address: 0x[0-9a-fA-F]+' | grep -oE '0x[0-9a-fA-F]+' || \
                 echo "$STYLUS_OUTPUT" | grep -oE '0x[0-9a-fA-F]{40}' | tail -1)
if [ -z "$STYLUS_ADDRESS" ]; then
  echo "  Could not parse Stylus deployed address."
  echo "  Set COMPUTE_STYLUS_ADDRESS manually and re-run."
  exit 1
fi

echo "  Stylus deployed at: $STYLUS_ADDRESS"
mkdir -p "$CONFIG_DIR"
echo "$STYLUS_ADDRESS" > "$CONFIG_DIR/computeStylusAddress.txt"
export COMPUTE_STYLUS_ADDRESS="$STYLUS_ADDRESS"

# Verify deployment
CALL_COUNT=$(cast call "$STYLUS_ADDRESS" "callCount()(uint256)" --rpc-url "$RPC" 2>&1) || true
echo "  callCount() = $CALL_COUNT"
echo ""

# ── Step 4: Deploy EVM contract ────────────────────────────────────────────

echo "[4/6] Deploying ComputeEVM to L2..."
cd "$EVM_DIR"
DEPLOY_OUTPUT=$(forge create \
  --rpc-url "$RPC" \
  --private-key "$DEPLOYER_KEY" \
  --broadcast \
  ComputeEVM \
  2>&1) || {
  echo "  forge create failed:"
  echo "$DEPLOY_OUTPUT"
  exit 1
}

echo "$DEPLOY_OUTPUT"

# Parse "Deployed to: 0x..." from text output
EVM_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep -oE 'Deployed to: 0x[0-9a-fA-F]+' | awk '{print $3}')
if [ -z "$EVM_ADDRESS" ]; then
  echo "  Could not parse deployed address from forge output."
  exit 1
fi

echo "  EVM deployed at: $EVM_ADDRESS"
echo "$EVM_ADDRESS" > "$CONFIG_DIR/computeEvmAddress.txt"
export COMPUTE_EVM_ADDRESS="$EVM_ADDRESS"

# Verify deployment
CALL_COUNT=$(cast call "$EVM_ADDRESS" "callCount()(uint256)" --rpc-url "$RPC" 2>&1) || true
echo "  callCount() = $CALL_COUNT"
echo ""

# ── Step 5: Fund burst accounts ───────────────────────────────────────────

echo "[5/6] Funding burst accounts (Anvil #3–#9)..."
ACCOUNTS=(
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
  "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"
  "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc"
  "0x976EA74026E726554dB657fA54763abd0C3a0aa9"
  "0x14dC79964da2C08dA15Fd60A5BA34eFe21B7Adb9"
  "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f"
  "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720"
)

for ACCT in "${ACCOUNTS[@]}"; do
  BALANCE=$(cast balance "$ACCT" --rpc-url "$RPC" 2>/dev/null || echo "0")
  # Fund if balance is low (less than 0.5 ETH = 500000000000000000 wei)
  if [ "$(echo "$BALANCE" | tr -d '[:space:]')" = "0" ] || \
     [ "$(python3 -c "print(int('${BALANCE}'.strip() or '0') < 500000000000000000)" 2>/dev/null)" = "True" ]; then
    cast send "$ACCT" --value 1ether --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" > /dev/null 2>&1 || true
    echo "  Funded: $ACCT"
  else
    echo "  OK:     $ACCT (already funded)"
  fi
done
echo ""

# ── Step 6: Run compute comparison ────────────────────────────────────────

echo "[6/6] Running compute comparison test..."
cd "$LOAD_DIR"

# Install deps if needed
if [ ! -d "node_modules" ]; then
  npm install --silent
fi

npx ts-node src/compute-comparison.ts

echo ""
echo "Done. Results at: $LOAD_DIR/compute-results.json"

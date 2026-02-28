#!/bin/bash
# =============================================================================
# run-burst-comparison.sh — Deploy EVM contract, fund accounts, run comparison
#
# Deploys the Solidity messaging contract via forge, funds Anvil accounts #3–#9
# on L2, then runs the Stylus-vs-EVM burst comparison test.
#
# Prerequisites:
#   - Foundry (forge, cast) installed
#   - Running L2 chain at L2_CHAIN_RPC
#   - Stylus contract already deployed (MESSAGING_CONTRACT_ADDRESS set)
#   - .env with DEPLOYER_PRIVATE_KEY / TEST_USER_PRIVATE_KEY
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
EVM_DIR="$PROJECT_ROOT/contracts/messaging-evm"
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
echo "  Burst Comparison: Stylus WASM vs EVM Solidity"
echo "============================================================"
echo "  L2 RPC:     $RPC"
echo "  EVM source: $EVM_DIR/MessagingEVM.sol"
echo ""

# ── Step 1: Build the Solidity contract ──────────────────────────────────────

echo "[1/4] Building Solidity contract..."
cd "$EVM_DIR"
forge build --force
echo "  Build OK."
echo ""

# ── Step 2: Deploy the EVM contract ─────────────────────────────────────────

echo "[2/4] Deploying MessagingEVM to L2..."
if [ -z "$DEPLOYER_KEY" ]; then
  echo "ERROR: No deployer key. Set CONTRACT_DEPLOYER_KEY or DEPLOYER_PRIVATE_KEY in .env"
  exit 1
fi

DEPLOY_OUTPUT=$(forge create \
  --rpc-url "$RPC" \
  --private-key "$DEPLOYER_KEY" \
  --broadcast \
  MessagingEVM \
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

echo "  Deployed at: $EVM_ADDRESS"

# Save address for the test script
mkdir -p "$CONFIG_DIR"
echo "$EVM_ADDRESS" > "$CONFIG_DIR/evmContractAddress.txt"
export EVM_CONTRACT_ADDRESS="$EVM_ADDRESS"

# Verify deployment
MSG_COUNT=$(cast call "$EVM_ADDRESS" "messageCount()(uint256)" --rpc-url "$RPC" 2>&1) || true
echo "  messageCount() = $MSG_COUNT"
echo ""

# ── Step 3: Fund burst accounts ─────────────────────────────────────────────

echo "[3/4] Funding burst accounts (Anvil #3–#9)..."
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

# ── Step 4: Run burst comparison ────────────────────────────────────────────

echo "[4/4] Running burst comparison test..."
cd "$LOAD_DIR"

# Install deps if needed
if [ ! -d "node_modules" ]; then
  npm install --silent
fi

npx ts-node src/burst-comparison.ts

echo ""
echo "Done. Results at: $LOAD_DIR/burst-results.json"

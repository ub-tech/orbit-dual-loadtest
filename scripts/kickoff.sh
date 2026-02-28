#!/usr/bin/env bash
# =============================================================================
# kickoff.sh — Run the full Arbitrum L2 chain + load test pipeline
#
# Walks through all 8 steps interactively, pausing for user confirmation
# at each stage. Can also be run non-interactively with --yes.
#
# Usage:
#   ./scripts/kickoff.sh              # Interactive (pauses between steps)
#   ./scripts/kickoff.sh --yes        # Non-interactive (runs all steps)
#   ./scripts/kickoff.sh --from 5     # Start from step N
#
# Prerequisites:
#   - Node.js >= 18, Docker, Rust + cargo-stylus, Foundry
#   - Anvil forking Sepolia (plain Anvil won't work — needs Orbit contracts)
#   - .env configured (see .env.example)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# Parse args
AUTO_YES=false
START_FROM=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y) AUTO_YES=true; shift ;;
    --from) START_FROM="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Load environment
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  source "$PROJECT_ROOT/.env"
  set +a
fi

RPC="${PARENT_CHAIN_RPC:-http://localhost:8545}"
L2_RPC="${L2_CHAIN_RPC:-http://localhost:8449}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

step_header() {
  local num="$1"
  local title="$2"
  echo ""
  echo "================================================================"
  echo "  Step $num: $title"
  echo "================================================================"
}

wait_for_user() {
  if [ "$AUTO_YES" = true ]; then
    return 0
  fi
  echo ""
  read -rp "  Press Enter to continue (or Ctrl-C to abort)... "
}

check_command() {
  if ! command -v "$1" &> /dev/null; then
    echo "  ERROR: '$1' is not installed or not in PATH."
    return 1
  fi
  echo "  OK: $1"
}

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------

echo ""
echo "================================================================"
echo "  Orbit Dual Load Test — Full Pipeline"
echo "================================================================"
echo "  Project:     $PROJECT_ROOT"
echo "  Parent RPC:  $RPC"
echo "  L2 RPC:      $L2_RPC"
echo ""

if [ ! -f "$PROJECT_ROOT/.env" ]; then
  echo "  WARNING: No .env file found."
  echo "  Run:  cp .env.example .env"
  echo "  Then fill in your private keys."
  echo ""
fi

echo "  Checking prerequisites..."
MISSING=false
check_command node || MISSING=true
check_command npm || MISSING=true
check_command docker || MISSING=true
check_command rustc || MISSING=true
check_command cargo || MISSING=true
check_command forge || MISSING=true
check_command cast || MISSING=true
check_command anvil || MISSING=true

if ! cargo stylus --version &>/dev/null 2>&1; then
  echo "  MISSING: cargo-stylus (install: cargo install cargo-stylus)"
  MISSING=true
else
  echo "  OK: cargo-stylus"
fi

if [ "$MISSING" = true ]; then
  echo ""
  echo "  Some prerequisites are missing. Install them before continuing."
  wait_for_user
fi

# ==========================================================================
# Step 1: Start Anvil
# ==========================================================================

if [ "$START_FROM" -le 1 ]; then
  step_header 1 "Start Anvil (forking Sepolia)"

  # Check if Anvil is already running
  if curl -s -X POST "$RPC" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
    2>/dev/null | grep -q "result"; then
    echo "  Anvil is already running at $RPC"
  else
    echo "  Anvil is NOT running at $RPC."
    echo ""
    echo "  Start it in another terminal:"
    echo "    anvil --fork-url https://sepolia.infura.io/v3/<YOUR_KEY>"
    echo ""
    echo "  IMPORTANT: Plain 'anvil' won't work — Orbit SDK needs"
    echo "  the RollupCreator contract deployed on Sepolia."
    wait_for_user

    # Re-check
    if ! curl -s -X POST "$RPC" \
      -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
      2>/dev/null | grep -q "result"; then
      echo "  ERROR: Still can't reach Anvil at $RPC. Aborting."
      exit 1
    fi
  fi

  echo "  Anvil is reachable."
fi

# ==========================================================================
# Step 2: Install dependencies
# ==========================================================================

if [ "$START_FROM" -le 2 ]; then
  step_header 2 "Install dependencies"

  echo "  Installing root dependencies (Orbit SDK)..."
  npm install --silent

  echo "  Installing load test dependencies..."
  cd tests/load && npm install --silent && cd "$PROJECT_ROOT"

  if [ -d "frontend" ]; then
    echo "  Installing frontend dependencies..."
    cd frontend && npm install --silent && cd "$PROJECT_ROOT"
  fi

  echo "  All dependencies installed."
fi

# ==========================================================================
# Step 3: Deploy L2 chain
# ==========================================================================

if [ "$START_FROM" -le 3 ]; then
  step_header 3 "Deploy L2 chain"

  if [ -f "chain-config/nodeConfig.json" ]; then
    echo "  chain-config/nodeConfig.json already exists."
    echo "  Skipping chain deployment (delete chain-config/ to re-deploy)."
  else
    echo "  Deploying Arbitrum L2 chain via Orbit SDK..."
    npx ts-node scripts/deploy-chain.ts
    echo ""
    echo "  Chain deployed. Outputs:"
    echo "    chain-config/nodeConfig.json"
    echo "    chain-config/coreContracts.json"
  fi
fi

# ==========================================================================
# Step 4: Start L2 node
# ==========================================================================

if [ "$START_FROM" -le 4 ]; then
  step_header 4 "Start L2 node"

  # Check if already running
  if curl -s -X POST "$L2_RPC" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
    2>/dev/null | grep -q "result"; then
    echo "  L2 node is already running at $L2_RPC"
  else
    echo "  Starting Nitro node via Docker..."
    ./scripts/start-node.sh
  fi
fi

# ==========================================================================
# Step 5: Deploy Stylus messaging contract
# ==========================================================================

if [ "$START_FROM" -le 5 ]; then
  step_header 5 "Deploy Stylus messaging contract"

  if [ -f "chain-config/contractAddress.txt" ]; then
    ADDR=$(cat chain-config/contractAddress.txt)
    echo "  Contract already deployed at: $ADDR"
    echo "  Skipping (delete chain-config/contractAddress.txt to re-deploy)."
  else
    ./scripts/deploy-contract.sh
  fi
fi

# ==========================================================================
# Step 6: Set contract address in .env
# ==========================================================================

if [ "$START_FROM" -le 6 ]; then
  step_header 6 "Set contract address in .env"

  if [ -f "chain-config/contractAddress.txt" ]; then
    ADDR=$(cat chain-config/contractAddress.txt)

    if grep -q "^MESSAGING_CONTRACT_ADDRESS=" "$PROJECT_ROOT/.env" 2>/dev/null; then
      echo "  MESSAGING_CONTRACT_ADDRESS is already set in .env"
    else
      echo "" >> "$PROJECT_ROOT/.env"
      echo "MESSAGING_CONTRACT_ADDRESS=$ADDR" >> "$PROJECT_ROOT/.env"
      echo "NEXT_PUBLIC_MESSAGING_CONTRACT=$ADDR" >> "$PROJECT_ROOT/.env"
      echo "  Added to .env:"
      echo "    MESSAGING_CONTRACT_ADDRESS=$ADDR"
      echo "    NEXT_PUBLIC_MESSAGING_CONTRACT=$ADDR"
    fi

    # Also set TEST_USER_PRIVATE_KEY if not present
    if ! grep -q "^TEST_USER_PRIVATE_KEY=" "$PROJECT_ROOT/.env" 2>/dev/null; then
      DEPLOYER="${DEPLOYER_PRIVATE_KEY:-}"
      if [ -n "$DEPLOYER" ]; then
        echo "TEST_USER_PRIVATE_KEY=$DEPLOYER" >> "$PROJECT_ROOT/.env"
        echo "    TEST_USER_PRIVATE_KEY=(set to DEPLOYER_PRIVATE_KEY)"
      fi
    fi

    # Set CONTRACT_DEPLOYER_KEY if not present
    if ! grep -q "^CONTRACT_DEPLOYER_KEY=" "$PROJECT_ROOT/.env" 2>/dev/null; then
      DEPLOYER="${DEPLOYER_PRIVATE_KEY:-}"
      if [ -n "$DEPLOYER" ]; then
        echo "CONTRACT_DEPLOYER_KEY=$DEPLOYER" >> "$PROJECT_ROOT/.env"
      fi
    fi
  else
    echo "  No contract address file found. Run step 5 first."
  fi
fi

# ==========================================================================
# Step 7: Start frontend (optional)
# ==========================================================================

if [ "$START_FROM" -le 7 ]; then
  step_header 7 "Start frontend (optional)"

  if [ -d "frontend" ]; then
    echo "  Frontend is available at: frontend/"
    echo "  To start it, run in another terminal:"
    echo "    cd frontend && npm run dev"
    echo ""
    echo "  Skipping (run manually if needed)."
  else
    echo "  No frontend directory found. Skipping."
  fi
fi

# ==========================================================================
# Step 8: Run load tests
# ==========================================================================

if [ "$START_FROM" -le 8 ]; then
  step_header 8 "Run load tests"

  # Reload .env to pick up any changes from step 6
  if [ -f "$PROJECT_ROOT/.env" ]; then
    set -a
    source "$PROJECT_ROOT/.env"
    set +a
  fi

  MODE="${LOAD_TEST_MODE:-messaging}"
  echo "  Test mode: $MODE (set LOAD_TEST_MODE in .env to change)"
  echo ""
  echo "  Available modes:"
  echo "    messaging  — TPS tests against messaging contract"
  echo "    burst      — Stylus vs EVM messaging burst comparison"
  echo "    compute    — Stylus vs EVM keccak256 compute comparison"
  echo "    all        — Run everything"
  echo ""

  wait_for_user

  ./scripts/run-load-tests.sh "$MODE"
fi

# ==========================================================================
# Done
# ==========================================================================

echo ""
echo "================================================================"
echo "  Pipeline complete!"
echo "================================================================"
echo ""
echo "  Results:"
[ -f "tests/load/results.json" ] && echo "    Messaging:  tests/load/results.json"
[ -f "tests/load/burst-results.json" ] && echo "    Burst:      tests/load/burst-results.json"
[ -f "tests/load/compute-results.json" ] && echo "    Compute:    tests/load/compute-results.json"
echo ""
echo "  Re-run specific tests:"
echo "    ./scripts/run-load-tests.sh messaging"
echo "    ./scripts/run-load-tests.sh burst"
echo "    ./scripts/run-load-tests.sh compute"
echo ""

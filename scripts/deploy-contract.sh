#!/bin/bash
# Deploy Stylus messaging contract to L2
#
# Prerequisites:
#   - Rust toolchain with wasm32-unknown-unknown target
#   - cargo-stylus CLI installed (cargo install cargo-stylus)
#   - .env file with CONTRACT_DEPLOYER_KEY and L2_CHAIN_RPC set
#   - L2 chain running and reachable at L2_CHAIN_RPC
#
# Usage:
#   ./scripts/deploy-contract.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load environment variables
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo "ERROR: .env file not found at $PROJECT_ROOT/.env"
    echo "Copy .env.example and fill in values: cp .env.example .env"
    exit 1
fi
source "$PROJECT_ROOT/.env"

# Validate required env vars
if [ -z "${CONTRACT_DEPLOYER_KEY:-}" ]; then
    echo "ERROR: CONTRACT_DEPLOYER_KEY is not set in .env"
    exit 1
fi

if [ -z "${L2_CHAIN_RPC:-}" ]; then
    echo "ERROR: L2_CHAIN_RPC is not set in .env"
    exit 1
fi

CONTRACT_DIR="$PROJECT_ROOT/contracts/messaging"

if [ ! -f "$CONTRACT_DIR/Cargo.toml" ]; then
    echo "ERROR: Contract not found at $CONTRACT_DIR/Cargo.toml"
    exit 1
fi

echo "============================================"
echo "  Omega Messaging — Stylus Contract Deploy"
echo "============================================"
echo ""
echo "Endpoint: $L2_CHAIN_RPC"
echo "Contract: $CONTRACT_DIR"
echo ""

# Step 1: Export ABI for verification
echo "[1/3] Exporting contract ABI..."
cargo run --features export-abi --target-dir /tmp/omega-abi 2>/dev/null || echo "  (ABI export skipped — verify manually against frontend/src/abi/MessagingContract.ts)"
echo ""

# Step 2: Check WASM validity
echo "[2/3] Checking Stylus contract (cargo stylus check)..."
cd "$CONTRACT_DIR"
cargo stylus check --endpoint "$L2_CHAIN_RPC" 2>&1
echo "Check passed."
echo ""

# Step 3: Deploy and capture contract address
echo "[3/3] Deploying contract (cargo stylus deploy)..."
DEPLOY_OUTPUT=$(cargo stylus deploy \
    --private-key "$CONTRACT_DEPLOYER_KEY" \
    --endpoint "$L2_CHAIN_RPC" \
    2>&1)

echo "$DEPLOY_OUTPUT"

# Extract and persist the deployed contract address
CONTRACT_ADDR=$(echo "$DEPLOY_OUTPUT" | grep -oE '0x[0-9a-fA-F]{40}' | tail -1)
if [ -n "$CONTRACT_ADDR" ]; then
    mkdir -p "$PROJECT_ROOT/chain-config"
    echo "$CONTRACT_ADDR" > "$PROJECT_ROOT/chain-config/contractAddress.txt"
    echo ""
    echo "Contract address saved to chain-config/contractAddress.txt: $CONTRACT_ADDR"
    echo ""
    echo "To configure the frontend and load tests, add to your .env:"
    echo "  MESSAGING_CONTRACT_ADDRESS=$CONTRACT_ADDR"
    echo "  NEXT_PUBLIC_MESSAGING_CONTRACT=$CONTRACT_ADDR"
else
    echo ""
    echo "WARNING: Could not extract contract address from deploy output."
    echo "Check the output above and manually set MESSAGING_CONTRACT_ADDRESS in .env"
fi

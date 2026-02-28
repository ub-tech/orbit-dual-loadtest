#!/usr/bin/env bash
# =============================================================================
# kickoff.sh — Run the full Arbitrum L2 chain + Stylus DApp pipeline
#
# End-to-end process:
#
#   1. Start Anvil (forking Sepolia)
#        anvil --fork-url https://sepolia.infura.io/v3/<YOUR_KEY>
#
#   2. Install dependencies
#        npm install                           # Root: Orbit SDK + chain deploy
#        cd tests/load && npm install && cd -  # Load tests
#        cd frontend && npm install && cd -    # Frontend (optional)
#
#   3. Deploy L2 chain
#        npx ts-node scripts/deploy-chain.ts
#        → Outputs: chain-config/nodeConfig.json, chain-config/coreContracts.json
#
#   4. Start L2 node
#        ./scripts/start-node.sh
#        → Nitro node on http://localhost:8449
#        → Enables interval mining on Anvil (required for Nitro initialization)
#
#   5. Deploy Stylus messaging contract
#        ./scripts/deploy-contract.sh
#        → Outputs: chain-config/contractAddress.txt
#
#   6. Set contract address in .env
#        MESSAGING_CONTRACT_ADDRESS=<address from step 5>
#        NEXT_PUBLIC_MESSAGING_CONTRACT=<same address>
#
#   7. Start frontend (optional)
#        cd frontend && npm run dev
#
#   8. Run load tests
#        ./scripts/run-load-tests.sh                  # Default: messaging tests
#        ./scripts/run-load-tests.sh burst             # Stylus vs EVM burst
#        ./scripts/run-load-tests.sh compute           # Stylus vs EVM keccak256
#        ./scripts/run-load-tests.sh all               # Run everything
#        → Set LOAD_TEST_MODE in .env to change the default
#
# Prerequisites:
#   - Node.js >= 18
#   - Docker (for Nitro node)
#   - Rust + cargo-stylus (for Stylus contracts)
#   - Foundry (forge, cast) (for Solidity contracts)
#   - Anvil forking Sepolia (plain Anvil won't work — needs Orbit contracts)
#   - .env configured (see .env.example)
#
# Usage:
#   ./scripts/kickoff.sh              # Run via Claude CLI
#   ./scripts/kickoff.sh --manual     # Print steps only (no Claude)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

if [ "${1:-}" = "--manual" ]; then
  # Print the steps from the header comment and exit
  sed -n '/^# End-to-end process:/,/^# Prerequisites:/p' "$0" | sed 's/^# //' | sed 's/^#//'
  exit 0
fi

echo "Starting SDLC pipeline..."
echo "Project: $PROJECT_ROOT"
echo ""

# Check claude CLI is available
if ! command -v claude &> /dev/null; then
  echo "Error: claude CLI is not installed or not in PATH."
  echo "Install from: https://claude.ai/download"
  echo ""
  echo "To see the manual steps instead, run:"
  echo "  ./scripts/kickoff.sh --manual"
  exit 1
fi

# Launch Claude with the kickoff command
cd "$PROJECT_ROOT"
claude "/kickoff"

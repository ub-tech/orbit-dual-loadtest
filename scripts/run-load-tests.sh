#!/bin/bash
# =============================================================================
# run-load-tests.sh — Omega Load Test Runner (PRD-003)
#
# Runs load test scenarios against the deployed contracts on L2.
#
# Usage:
#   ./scripts/run-load-tests.sh              # Run mode from LOAD_TEST_MODE (default: messaging)
#   ./scripts/run-load-tests.sh messaging    # Messaging contract tests (sequential, concurrent, etc.)
#   ./scripts/run-load-tests.sh burst        # Stylus vs EVM messaging burst comparison
#   ./scripts/run-load-tests.sh compute      # Stylus vs EVM compute (keccak256) comparison
#   ./scripts/run-load-tests.sh all          # Run all test suites
#
# Messaging sub-scenarios (pass as second arg when mode=messaging):
#   ./scripts/run-load-tests.sh messaging sequential
#   ./scripts/run-load-tests.sh messaging concurrent
#   ./scripts/run-load-tests.sh messaging sustained
#   ./scripts/run-load-tests.sh messaging message-size
#
# Environment:
#   LOAD_TEST_MODE  — Default test mode if no arg given (messaging|burst|compute|all)
#   See .env.example for full variable list
#
# Prerequisites:
#   - Node.js >= 18, Foundry (forge/cast), cargo-stylus
#   - Running L2 chain at L2_CHAIN_RPC
#   - .env file with keys and contract addresses
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOAD_DIR="$PROJECT_ROOT/tests/load"

# Load environment
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  source "$PROJECT_ROOT/.env"
  set +a
fi

# Determine mode: CLI arg > env var > default
MODE="${1:-${LOAD_TEST_MODE:-messaging}}"
SUB_SCENARIO="${2:-all}"

echo "========================================"
echo "  Omega Load Tests (PRD-003)"
echo "========================================"
echo "  Mode:         $MODE"
echo "  Project root: $PROJECT_ROOT"
echo "  L2 RPC:       ${L2_CHAIN_RPC:-http://localhost:8449}"
echo ""

# Check for .env
if [ ! -f "$PROJECT_ROOT/.env" ]; then
  echo "WARNING: No .env file found at $PROJECT_ROOT/.env"
  echo "  Copy .env.example to .env and fill in values."
  echo ""
fi

# Install load test dependencies
cd "$LOAD_DIR"
if [ ! -d "node_modules" ]; then
  echo "Installing load test dependencies..."
  npm install --silent
  echo ""
fi

# ---------------------------------------------------------------------------
# Run the requested mode
# ---------------------------------------------------------------------------

run_messaging() {
  local scenario="${1:-all}"
  echo "── Messaging Contract Tests ──────────────────────────────────"
  case "$scenario" in
    sequential)
      echo "Running: Sequential throughput test"
      npx ts-node src/sequential.ts
      ;;
    concurrent)
      echo "Running: Concurrent throughput test"
      npx ts-node src/concurrent.ts
      ;;
    sustained)
      echo "Running: Sustained load test"
      npx ts-node src/sustained.ts
      ;;
    message-size)
      echo "Running: Message size impact test"
      npx ts-node src/message-size.ts
      ;;
    all)
      echo "Running: All messaging scenarios"
      npx ts-node src/run-all.ts
      ;;
    *)
      echo "Unknown messaging scenario: $scenario"
      echo "Options: sequential | concurrent | sustained | message-size | all"
      exit 1
      ;;
  esac
}

run_burst() {
  echo "── Burst Comparison: Stylus vs EVM (Messaging) ───────────────"
  "$SCRIPT_DIR/run-burst-comparison.sh"
}

run_compute() {
  echo "── Compute Comparison: Stylus vs EVM (Keccak256) ─────────────"
  "$SCRIPT_DIR/run-compute-comparison.sh"
}

case "$MODE" in
  messaging)
    run_messaging "$SUB_SCENARIO"
    ;;
  burst)
    run_burst
    ;;
  compute)
    run_compute
    ;;
  all)
    echo "Running ALL test suites..."
    echo ""
    run_messaging "all"
    echo ""
    run_burst
    echo ""
    run_compute
    echo ""
    echo "========================================"
    echo "  All test suites complete."
    echo "========================================"
    echo "  Results:"
    echo "    Messaging:  $LOAD_DIR/results.json"
    echo "    Burst:      $LOAD_DIR/burst-results.json"
    echo "    Compute:    $LOAD_DIR/compute-results.json"
    ;;
  *)
    echo "Unknown mode: $MODE"
    echo ""
    echo "Usage: $0 [messaging|burst|compute|all] [sub-scenario]"
    echo ""
    echo "Modes:"
    echo "  messaging  — TPS tests against messaging contract (default)"
    echo "  burst      — Stylus vs EVM messaging burst comparison"
    echo "  compute    — Stylus vs EVM iterated keccak256 comparison"
    echo "  all        — Run all test suites"
    echo ""
    echo "Set LOAD_TEST_MODE in .env to change the default."
    exit 1
    ;;
esac

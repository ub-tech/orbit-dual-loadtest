#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# start-node.sh — Start the Arbitrum Nitro L2 node
#
# Prerequisites:
#   1. Anvil must be running, forking Sepolia:
#        anvil --fork-url https://sepolia.gateway.tenderly.co/5NjRfgC8tfKE9gozLvyymP
#   2. chain-config/nodeConfig.json must exist (run deploy-chain.ts first)
#
# Usage:
#   ./scripts/start-node.sh
# ---------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
NODE_CONFIG="$PROJECT_DIR/chain-config/nodeConfig.json"
NITRO_IMAGE="offchainlabs/nitro-node:v3.9.5-66e42c4"
CONTAINER_NAME="nitro-node"
PARENT_CHAIN_RPC="${PARENT_CHAIN_RPC:-http://localhost:8545}"
L2_PORT=8449

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
if [ ! -f "$NODE_CONFIG" ]; then
  echo "ERROR: $NODE_CONFIG not found."
  echo "Run 'npx ts-node scripts/deploy-chain.ts' first."
  exit 1
fi

echo "Checking parent chain at $PARENT_CHAIN_RPC ..."
if ! curl -s -X POST "$PARENT_CHAIN_RPC" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
  | grep -q "result"; then
  echo "ERROR: Parent chain is not reachable at $PARENT_CHAIN_RPC"
  echo "Start Anvil first:  anvil --fork-url https://sepolia.gateway.tenderly.co/5NjRfgC8tfKE9gozLvyymP"
  exit 1
fi
echo "  Parent chain is reachable."

# ---------------------------------------------------------------------------
# Enable interval mining on Anvil
#
# Anvil defaults to automine (blocks only when transactions arrive).
# The Nitro node requires fresh L1 blocks to initialize. Without regular
# block production, the node hangs with "latest L1 block is old" errors.
# ---------------------------------------------------------------------------
echo "Enabling interval mining on Anvil (1 block/second)..."
curl -s -X POST "$PARENT_CHAIN_RPC" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"evm_setIntervalMining","params":[1],"id":1}' \
  > /dev/null
echo "  Interval mining enabled."

# ---------------------------------------------------------------------------
# Stop existing container if running
# ---------------------------------------------------------------------------
if docker ps -q --filter "name=$CONTAINER_NAME" | grep -q .; then
  echo "Stopping existing $CONTAINER_NAME container..."
  docker stop "$CONTAINER_NAME" > /dev/null
fi

# Also remove any stopped container with the same name
docker rm "$CONTAINER_NAME" 2>/dev/null || true

# ---------------------------------------------------------------------------
# Start Nitro node
# ---------------------------------------------------------------------------
echo ""
echo "Starting Nitro node ($NITRO_IMAGE)..."
echo "  Config : $NODE_CONFIG"
echo "  L2 RPC : http://localhost:$L2_PORT"
echo ""

docker run --rm -d \
  --name "$CONTAINER_NAME" \
  -v "$NODE_CONFIG":/config/nodeConfig.json \
  -p "$L2_PORT":8449 \
  "$NITRO_IMAGE" \
  --conf.file /config/nodeConfig.json \
  --parent-chain.connection.url http://host.docker.internal:8545 \
  --node.dangerous.disable-blob-reader \
  --node.staker.enable=false \
  --node.block-validator.enable=false \
  --init.force

# ---------------------------------------------------------------------------
# Wait for HTTP server to start
# ---------------------------------------------------------------------------
echo "Waiting for L2 HTTP server..."
for i in $(seq 1 30); do
  if curl -s -X POST "http://localhost:$L2_PORT" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
    2>/dev/null | grep -q "result"; then
    echo "  L2 node is ready!"
    echo ""
    echo "Chain ID : $(curl -s -X POST "http://localhost:$L2_PORT" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' | python3 -c "import sys,json; print(int(json.load(sys.stdin)['result'],16))" 2>/dev/null || echo "?")"
    echo "RPC URL  : http://localhost:$L2_PORT"
    echo ""
    echo "View logs: docker logs -f $CONTAINER_NAME"
    echo "Stop    : docker stop $CONTAINER_NAME"
    exit 0
  fi
  sleep 1
done

echo "ERROR: L2 node did not start within 30 seconds."
echo "Check logs: docker logs $CONTAINER_NAME"
exit 1

# Orbit Dual Load Test

Arbitrum Orbit L2 chain deployment with Stylus WASM vs EVM Solidity gas cost benchmarking. Deploys identical smart contracts in both runtimes and measures gas consumption under burst load to quantify Stylus's ink metering advantage.

## Results Summary

| Test | Stylus Gas | EVM Gas | Discount | Notes |
|------|-----------|---------|----------|-------|
| Messaging burst (storage-heavy) | 167K | 120K | -39% | Stylus adds host-call overhead on SSTORE |
| Compute 100 iters (keccak256) | 67K | 52K | -27% | Overhead dominates at low compute |
| Compute 500 iters | 73K | 150K | **51%** | Ink metering advantage emerges |
| Compute 1,000 iters | 81K | 277K | **70%** | Clear WASM computation win |
| Compute 2,000 iters | 97K | 541K | **82%** | Discount scales with compute intensity |

**Key finding:** Stylus is cheaper for compute-heavy workloads (51-82% gas savings) but more expensive for storage-heavy workloads due to host-call overhead on SSTORE operations.

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Docker](https://docs.docker.com/get-docker/)
- [Rust](https://rustup.rs/) + `cargo install cargo-stylus` + `rustup target add wasm32-unknown-unknown`
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge`, `cast`, `anvil`)
- A Sepolia RPC endpoint (set `SEPOLIA_RPC_URL` in `.env`)

### Setup & Run

```bash
# 1. Clone and configure
git clone https://github.com/ub-tech/orbit-dual-loadtest.git
cd orbit-dual-loadtest
cp .env.example .env
# Edit .env — set SEPOLIA_RPC_URL to your Sepolia RPC endpoint

# 2. Run the guided pipeline
./scripts/kickoff.sh
```

The kickoff script walks through all 8 steps interactively. Or run each step manually:

### Manual Steps

```bash
# 1. Start Anvil forking Sepolia (set SEPOLIA_RPC_URL in .env first)
source .env && anvil --fork-url $SEPOLIA_RPC_URL

# 2. Install dependencies
npm install                            # Root: Orbit SDK + chain deploy
cd tests/load && npm install && cd -   # Load test dependencies
cd frontend && npm install && cd -     # Frontend (optional)

# 3. Deploy L2 chain
npx ts-node scripts/deploy-chain.ts
# → Outputs: chain-config/nodeConfig.json, chain-config/coreContracts.json

# 4. Start L2 node
./scripts/start-node.sh
# → Nitro node on http://localhost:8449
# → Enables interval mining on Anvil (required for Nitro initialization)

# 5. Deploy Stylus messaging contract
./scripts/deploy-contract.sh
# → Outputs: chain-config/contractAddress.txt

# 6. Set contract address in .env
#    MESSAGING_CONTRACT_ADDRESS=<address from step 5>
#    NEXT_PUBLIC_MESSAGING_CONTRACT=<same address>

# 7. Start frontend (optional)
cd frontend && npm run dev

# 8. Run load tests
./scripts/run-load-tests.sh              # Default: messaging tests
./scripts/run-load-tests.sh burst        # Stylus vs EVM messaging burst
./scripts/run-load-tests.sh compute      # Stylus vs EVM keccak256 compute
./scripts/run-load-tests.sh all          # Run everything
```

## Load Tests

### Messaging Tests (PRD-003)

| Scenario | Description | Target |
|----------|-------------|--------|
| Sequential | 100 TXs, one at a time | >= 10 TPS |
| Concurrent | 50 TXs, simultaneous | >= 20 TPS |
| Sustained | 60 seconds continuous | >= 8 TPS |
| Message Size | 32B, 256B, 1KB, 4KB payloads | Informational |

```bash
./scripts/run-load-tests.sh messaging           # All messaging scenarios
./scripts/run-load-tests.sh messaging sequential # Single scenario
```

### Burst Comparison (Stylus vs EVM)

Compares `sendMessage()` gas cost between Stylus WASM and EVM Solidity under burst load (50-500 TXs). Storage-dominated workload.

```bash
./scripts/run-burst-comparison.sh
```

### Compute Comparison (Stylus vs EVM)

Compares iterated `keccak256` gas cost (100-2000 iterations per TX, 100 TXs per tier). Computation-dominated workload — this is where Stylus's ink metering shines.

```bash
./scripts/run-compute-comparison.sh
```

## Contracts

### Messaging Contracts
- **Stylus** (`contracts/messaging/`): `sendMessage(string)`, `getMessage(uint256)`, `messageCount()`, `bridgeMessage(uint256)`
- **EVM** (`contracts/messaging-evm/`): Same ABI, pure Solidity

### Compute Contracts
- **Stylus** (`contracts/compute-stylus/`): `computeHash(uint256 iterations)` → iterated keccak256, `callCount()`
- **EVM** (`contracts/compute-evm/`): Same ABI, pure Solidity

Both contract pairs use identical seeds and algorithms so gas measurements are directly comparable.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Chain Deployment | Arbitrum Orbit SDK (TypeScript) |
| Smart Contracts | Stylus Rust SDK + Solidity 0.8.20 |
| Bridge | Arbitrum ArbSys precompile |
| Settlement | Anvil (Sepolia fork) |
| Frontend | React / Next.js + wagmi + viem |
| Load Testing | TypeScript + viem (multi-account burst) |
| Tooling | cargo-stylus, Foundry, Docker |

## Project Documentation

| Document | Purpose |
|----------|---------|
| `docs/functional/top-level-prd.md` | Master PRD |
| `docs/functional/func-prd-001-chain-deployment.md` | Chain deployment spec |
| `docs/functional/func-prd-002-stylus-messaging.md` | Stylus contract spec |
| `docs/functional/func-prd-003-tps-load-test.md` | Load testing spec |
| `docs/testing/reports/` | Test execution reports |

## License

MIT

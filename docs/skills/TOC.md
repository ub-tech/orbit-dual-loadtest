# Scripts — Table of Contents

## Script Index

| Script | Purpose | Usage |
|--------|---------|-------|
| `kickoff.sh` | Full pipeline runner (interactive) | `./scripts/kickoff.sh` |
| `deploy-chain.ts` | Deploy L2 chain via Orbit SDK | `npx ts-node scripts/deploy-chain.ts` |
| `start-node.sh` | Launch Nitro node in Docker | `./scripts/start-node.sh` |
| `verify-chain.ts` | Post-deploy health check | `npx ts-node scripts/verify-chain.ts` |
| `deploy-contract.sh` | Deploy Stylus messaging contract | `./scripts/deploy-contract.sh` |
| `run-load-tests.sh` | Run load tests (configurable mode) | `./scripts/run-load-tests.sh [mode]` |
| `run-burst-comparison.sh` | Deploy EVM messaging + burst comparison | `./scripts/run-burst-comparison.sh` |
| `run-compute-comparison.sh` | Deploy both compute contracts + comparison | `./scripts/run-compute-comparison.sh` |
| `check-status.sh` | Display pipeline status (requires jq) | `./scripts/check-status.sh` |

## Load Test Modes

| Mode | Description | Command |
|------|-------------|---------|
| `messaging` | Sequential, concurrent, sustained, message-size | `./scripts/run-load-tests.sh messaging` |
| `burst` | Stylus vs EVM messaging burst (50-500 TXs) | `./scripts/run-load-tests.sh burst` |
| `compute` | Stylus vs EVM keccak256 (100-2000 iterations) | `./scripts/run-load-tests.sh compute` |
| `all` | Run all test suites | `./scripts/run-load-tests.sh all` |

Set `LOAD_TEST_MODE` in `.env` to change the default.

# Orbit Dual Load Test — Arbitrum L2 + Stylus vs EVM

## What This Is

An Arbitrum Orbit L2 chain deployment with side-by-side Stylus WASM vs EVM Solidity gas cost benchmarking. Deploys identical contracts in both runtimes and measures gas consumption under load.

## Quick Start

```bash
cp .env.example .env        # Fill in private keys
./scripts/kickoff.sh         # Run guided setup (steps 1-8)
```

## Project Structure

```
contracts/
  messaging/         — Stylus WASM messaging contract (sendMessage, getMessage, bridge)
  messaging-evm/     — Solidity equivalent (same ABI)
  compute-stylus/    — Stylus WASM iterated keccak256 benchmark
  compute-evm/       — Solidity equivalent (same ABI)
scripts/
  kickoff.sh         — Full pipeline runner (interactive)
  deploy-chain.ts    — Deploy L2 chain via Orbit SDK
  start-node.sh      — Launch Nitro node in Docker
  verify-chain.ts    — Post-deploy health check
  deploy-contract.sh — Deploy Stylus messaging contract
  run-load-tests.sh  — Run load tests (messaging | burst | compute | all)
  run-burst-comparison.sh  — Deploy EVM messaging + run burst comparison
  run-compute-comparison.sh — Deploy both compute contracts + run comparison
tests/load/
  src/sequential.ts       — Sequential throughput (100 TXs, one at a time)
  src/concurrent.ts       — Concurrent throughput (50 TXs, simultaneous)
  src/sustained.ts        — Sustained load (60 seconds continuous)
  src/message-size.ts     — Payload size impact (32B–4KB)
  src/burst-comparison.ts — Stylus vs EVM messaging burst (50–500 TXs)
  src/compute-comparison.ts — Stylus vs EVM keccak256 (100–2000 iterations)
  src/run-all.ts          — Run all messaging scenarios
frontend/                 — React/Next.js messaging UI with wagmi
docs/
  functional/        — PRDs (chain deployment, messaging, load testing)
  testing/           — Test specs and reports
```

## Environment Variables

See `.env.example` for the full list. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `DEPLOYER_PRIVATE_KEY` | Yes | Chain deployer / contract deployer |
| `BATCH_POSTER_PRIVATE_KEY` | Yes | Batch poster for L2 sequencer |
| `VALIDATOR_PRIVATE_KEY` | Yes | Validator for L2 |
| `PARENT_CHAIN_RPC` | No | Default: `http://localhost:8545` |
| `L2_CHAIN_RPC` | No | Default: `http://localhost:8449` |
| `MESSAGING_CONTRACT_ADDRESS` | After deploy | Stylus contract address |
| `TEST_USER_PRIVATE_KEY` | For tests | Defaults to deployer key |
| `LOAD_TEST_MODE` | No | `messaging` \| `burst` \| `compute` \| `all` |

## Prerequisites

- **Node.js** >= 18
- **Docker** (for Nitro node)
- **Rust** + `cargo-stylus` (`cargo install cargo-stylus`)
- **wasm32 target** (`rustup target add wasm32-unknown-unknown`)
- **Foundry** (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)
- **Anvil** forking Sepolia (plain Anvil lacks Orbit contracts)

## Arbitrum Conventions

### Cargo Stylus Workflow
1. Write contract with `stylus-sdk` macros (`#[entrypoint]`, `#[storage]`, `#[public]`)
2. `cargo stylus check` — validate WASM
3. `cargo stylus deploy` — deploy to L2
4. Verify via `cast call`

### Bridge Patterns
- L2→L1: `ArbSys.sendTxToL1()` via `sol_interface!`
- Always `flush_storage_cache()` before cross-contract calls
- Messages finalize after challenge period on L1

## Code Quality
- No `unsafe` Rust without documented justification
- Private keys from environment variables only
- Solidity-compatible ABIs from Stylus `#[public]` macro
- Events use `sol!` macro for ABI compatibility

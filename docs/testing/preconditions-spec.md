# Test Preconditions Specification

**Status:** Approved

## Purpose
Defines prerequisites that must be satisfied before any testing phase can begin.

## Environment Prerequisites

### Rust / Stylus Toolchain
- Rust toolchain installed (`rustup` with `nightly` channel)
- `cargo-stylus` CLI installed: `cargo install cargo-stylus`
- WASM target added: `rustup target add wasm32-unknown-unknown`
- Stylus SDK crate available: `stylus-sdk` in `Cargo.toml`

### Node.js / TypeScript
- Node.js >= 18.x
- Package manager: npm or yarn
- Arbitrum Chain SDK dependencies installed (`@arbitrum/orbit-sdk`)
- Viem and wagmi packages for chain interaction

### Foundry / Anvil
- Foundry installed (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)
- Anvil available as local settlement chain
- Anvil running with sufficient block gas limit for rollup deployment

### Arbitrum Chain SDK
- Chain SDK scripts configured with correct parent chain RPC
- Deployer account funded on parent chain (ETH for gas + rollup deployment costs)
- Chain configuration parameters defined (chainId, owner, DAC flag)

## Account Prerequisites

| Account | Purpose | Funding Required |
|---|---|---|
| Chain Deployer | Calls `createRollup` on parent chain | ~0.5 ETH (testnet) |
| Batch Poster | Posts L2 batches to parent chain | ~0.1 ETH (ongoing gas) |
| Validator | Validates state assertions | Stake amount + gas |
| Contract Deployer | Deploys Stylus contracts on L2 | L2 ETH for gas |
| Test User | Sends messages, bridges transactions | Small L2 ETH balance |

## Network Prerequisites

| Check | Verification Command | Expected Result |
|---|---|---|
| Anvil running | `curl -X POST http://localhost:8545 -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'` | Returns block number |
| L2 RPC accessible | `curl -X POST <L2_RPC> -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'` | Returns configured chainId |
| Chain producing blocks | `cast block-number --rpc-url <L2_RPC>` (repeat after 5s) | Block number increments |
| Deployer funded | `cast balance <DEPLOYER_ADDR> --rpc-url <PARENT_RPC>` | >= required amount |

## Contract Prerequisites

Before integration and system testing:
- Stylus contract compiled: `cargo stylus check`
- Contract deployed to L2: `cargo stylus deploy --private-key <KEY>`
- Contract address recorded in test configuration
- Bridge contracts accessible on both L1 and L2

## Data Prerequisites

- No prior test messages in contract (clean state) OR known baseline state
- Test message payloads defined (short message, max-length message, empty message)
- Expected gas costs baselined for comparison

## Pre-Test Checklist

```markdown
- [ ] Rust nightly + cargo-stylus installed
- [ ] WASM target added
- [ ] Node.js >= 18 installed
- [ ] Anvil running on localhost:8545
- [ ] Chain SDK dependencies installed
- [ ] Deployer account funded
- [ ] L2 chain deployed and producing blocks (if testing post-deployment)
- [ ] Stylus contract compiled and deployed (if testing contract)
- [ ] Test accounts funded on both L1 and L2
```

# Top-Level PRD: Arbitrum Chain Deployment + Cross-Chain Messaging DApp

**Status:** Approved
**Date:** 2026-02-27
**Author:** EM (CLAUDE.md Orchestrator)

## Vision

Build a working Arbitrum L2 chain deployed via the Chain SDK with a Stylus-based messaging contract that enables cross-chain message passing between the settlement chain (Anvil/Sepolia) and the new L2.

The end result is a functional DApp where users can:
1. Connect a wallet to the L2 chain
2. Send and retrieve messages stored in a Stylus Rust contract
3. Bridge messages from L2 to the settlement chain (L1)
4. Monitor bridge transaction status through a React frontend

## Problem Statement

Cross-chain messaging requires coordinating chain deployment, smart contract development, bridge integration, and frontend UX — each with distinct toolchains and failure modes. This project demonstrates a full-stack approach using Arbitrum's newest tooling (Chain SDK + Stylus) in a structured SDLC framework.

## Goals

1. **Deploy an Arbitrum chain** using `createRollup` from the Chain SDK on a parent chain (local Anvil or Sepolia testnet)
2. **Build a Stylus messaging contract** in Rust with send, retrieve, and bridge functions
3. **Bridge messages** between L2 and the settlement chain using Arbitrum bridge contracts
4. **Provide a frontend** for wallet connection, messaging, and bridge monitoring

## Success Criteria

| Criteria | Verification |
|---|---|
| Chain deploys successfully | `createRollup` TX confirmed; chain ID matches config |
| Chain produces blocks | Block number increments over time via RPC |
| RPC endpoint accessible | `eth_chainId` returns expected value |
| Stylus contract deploys | `cargo stylus deploy` succeeds; contract address on L2 |
| Messages store and retrieve | `send_message` + `get_message` return correct data |
| Events emit correctly | Message events visible in transaction logs |
| Bridge message arrives on L1 | Cross-chain message confirmed on settlement chain after challenge period |
| Frontend connects wallet | wagmi wallet connection to both L1 and L2 |
| Frontend sends messages | Transaction submitted and confirmed via UI |
| Frontend shows bridge status | Pending → confirmed state tracked in UI |
| TPS meets targets | Sequential >= 10 TPS, concurrent >= 20 TPS, sustained >= 8 TPS |

## Scope

### In Scope
- Chain deployment via Arbitrum Chain SDK (TypeScript)
- Stylus smart contract development (Rust)
- Cross-chain bridge messaging (L2 → L1)
- React/Next.js frontend with wallet integration
- Automated testing framework via Claude subagents

### Out of Scope
- Production mainnet deployment
- Custom token bridge (using native ETH bridge only)
- L1 → L2 messaging (retryable tickets — future PRD)
- Mobile frontend
- Multi-tenant messaging

## Functional PRDs

| PRD | Title | Status |
|---|---|---|
| [func-prd-001](func-prd-001-chain-deployment.md) | Chain Deployment via Chain SDK | Approved |
| [func-prd-002](func-prd-002-stylus-messaging.md) | Stylus Messaging Contract + Bridge | Approved |
| [func-prd-003](func-prd-003-tps-load-test.md) | TPS Load Testing | Approved |

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│              React / Next.js UI             │
│         (wagmi + viem, dual-chain)          │
└──────────────┬───────────────┬──────────────┘
               │               │
        L2 RPC │        L1 RPC │
               ▼               ▼
┌──────────────────┐  ┌──────────────────────┐
│  Arbitrum L2     │  │  Settlement Chain    │
│  (new chain)     │  │  (Anvil / Sepolia)   │
│                  │  │                      │
│  ┌────────────┐  │  │  ┌────────────────┐  │
│  │ Stylus     │──┼──┼─→│ Bridge         │  │
│  │ Messaging  │  │  │  │ Contracts      │  │
│  │ Contract   │  │  │  └────────────────┘  │
│  └────────────┘  │  │                      │
└──────────────────┘  └──────────────────────┘
```

## Dependencies

- Arbitrum Chain SDK (`@arbitrum/orbit-sdk`)
- Stylus SDK (`stylus-sdk` Rust crate)
- Foundry (Anvil for local parent chain)
- cargo-stylus CLI
- Node.js >= 18, Rust nightly

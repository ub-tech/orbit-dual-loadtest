# Omega AI Dev Planning

An AI-driven SDLC framework for building an Arbitrum L2 chain with a Stylus-based cross-chain messaging DApp. Uses Claude Code as the orchestration platform with skills for implementation and subagents for testing.

## What This Project Builds

1. **Arbitrum Chain** — Deploy a custom L2 rollup via the Arbitrum Chain SDK
2. **Stylus Messaging Contract** — Rust smart contract compiled to WASM for message storage and cross-chain bridging
3. **Bridge Integration** — L2-to-L1 message passing via Arbitrum bridge contracts
4. **Messaging Frontend** — React/Next.js UI with dual-chain wallet support

## Framework Architecture

```
CLAUDE.md (Engineering Manager)
├── Pipeline Orchestration
│   ├── /kickoff       — Run full SDLC pipeline end-to-end
│   ├── /status        — Check pipeline progress and agent gates
│   └── .claude/state/ — Shared state bus (pipeline.json, context, agent status)
├── Skills (Implementation)
│   ├── /front-end     — React/Next.js, wagmi, bridge UI
│   ├── /security      — Stylus safety, bridge security
│   ├── /api           — Node config, RPC, infrastructure
│   ├── /data-integrity — Cross-chain state, storage
│   ├── /application-privacy — Key management
│   └── agent-teams    — Testing orchestration (internal)
├── Subagents (Testing & Analysis)
│   ├── read-code            — Codebase exploration, context generation
│   ├── functional-tester    — Contract CRUD, chain ops
│   ├── integration-tester   — Cross-chain round-trips
│   ├── security-tester      — Vulnerability analysis
│   ├── performance-tester   — Gas costs, latency
│   ├── system-uat-tester    — User journeys, PRD validation
│   ├── deployment-tester    — Deploy verification, smoke tests
│   └── load-tester          — TPS throughput, bottleneck analysis
└── Docs (Specifications)
    ├── functional/    — PRDs (what to build)
    ├── testing/       — Test specs (how to verify)
    └── skills/        — Skill reference (who does what)
```

## Prerequisites

- **Rust** — nightly toolchain via rustup
- **cargo-stylus** — `cargo install cargo-stylus`
- **WASM target** — `rustup target add wasm32-unknown-unknown`
- **Node.js** — >= 18.x
- **Foundry** — `curl -L https://foundry.paradigm.xyz | bash && foundryup`
- **Arbitrum Chain SDK** — `npm install @arbitrum/orbit-sdk`

## Getting Started

### 1. Run the Full Pipeline
Start everything with a single command:
```
/kickoff
```
Or from the terminal:
```bash
./scripts/kickoff.sh
```

### 2. Check Pipeline Status
From Claude:
```
/status
```
From the terminal:
```bash
./scripts/check-status.sh
```

### 3. Review the PRDs
Start with the master PRD to understand the full scope:
```
docs/functional/top-level-prd.md
```

### 4. Use Skills for Implementation
Invoke skills by name to get domain-specific guidance:
```
/front-end   — Build the messaging UI
/security    — Review contract security
/api         — Configure chain infrastructure
```

### 5. Run Testing Phases
Delegate to subagents sequentially:
```
read-code → functional → integration → security → performance → system-uat → deployment → load-test
```

### 6. Check Test Prerequisites
Before testing, verify the environment:
```
docs/testing/preconditions-spec.md
```

## Pipeline

The `/kickoff` command runs 8 phases with automatic gate checking:

```
Phase 0:   Initialize    — Set up run ID, reset state
Phase 0.5: Configure     — Target chain, env vars, tooling validation
Phase 1:   Read Code     — Scan codebase, generate context
Phase 2:   Requirements  — Verify all PRDs approved
Phase 3:   Implementation — Run skills (/api, /security, /front-end)
Phase 4:   Testing Gates — 6 sequential test agents
Phase 5:   Load Test     — TPS measurement (PRD-003)
Phase 6:   Final Push    — Commit + push (only if all gates pass)
```

The Configure phase asks for your target chain (Anvil or Sepolia), validates `.env` configuration, and checks that all required tools are installed before any work begins.

Git push is blocked until all gates pass. Status is checkable at any time via `/status` or `./scripts/check-status.sh`.

## Key Documents

| Document | Purpose |
|---|---|
| `CLAUDE.md` | EM orchestrator — role, navigation, conventions |
| `docs/functional/top-level-prd.md` | Master PRD — vision and success criteria |
| `docs/functional/func-prd-001-chain-deployment.md` | Chain SDK deployment spec |
| `docs/functional/func-prd-002-stylus-messaging.md` | Stylus contract + bridge spec |
| `docs/functional/func-prd-003-tps-load-test.md` | TPS load testing spec |
| `.claude/state/pipeline.json` | Pipeline state and progress |
| `docs/documentation-spec.md` | Document templates and standards |
| `docs/testing/reporting-results-spec.md` | Test report format |
| `docs/testing/preconditions-spec.md` | Environment prerequisites |

## Tech Stack

| Layer | Technology |
|---|---|
| Chain Deployment | Arbitrum Chain SDK (TypeScript) |
| Smart Contracts | Stylus Rust SDK (`stylus-sdk`) |
| Bridge | Arbitrum bridge + `sol_interface!` |
| Settlement | Anvil (local) or Sepolia (testnet) |
| Frontend | React / Next.js + wagmi + viem |
| Tooling | cargo-stylus, Foundry, Arbitrum SDK |

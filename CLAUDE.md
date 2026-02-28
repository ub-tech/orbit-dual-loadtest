# Engineering Manager — Arbitrum Chain + Stylus Messaging DApp

## Role
You are the Engineering Manager orchestrating the development of an Arbitrum L2 chain deployment with a Stylus-based cross-chain messaging DApp. You coordinate implementation through skills and testing through subagents.

## SDLC Phases

1. **Configure** — Capture target chain, env vars, validate tooling
2. **Requirements** — PRDs define what to build
3. **Engineering Plan** — Break PRDs into implementation tasks
4. **Implementation** — Skills handle domain-specific development
5. **Testing** — Subagents run sequential test phases
6. **Load Testing** — TPS measurement and bottleneck analysis
7. **Deployment** — Deploy to target environment, smoke test

## Pipeline State

The pipeline is coordinated through shared state files:
- Pipeline progress: `.claude/state/pipeline.json`
- Codebase context: `.claude/state/codebase-context.md`
- Agent status: `.claude/state/agent-status/<agent>.json`

### Pipeline Commands
- `/kickoff` — Run the full SDLC pipeline end-to-end
- `/status` — Check pipeline progress, agent gates, findings summary
- `./scripts/check-status.sh` — Terminal status display (requires jq)
- `./scripts/kickoff.sh` — Terminal kickoff via Claude CLI

### Git Push Control
- `git_push_allowed` starts `false` in pipeline.json
- **Commits** happen at each phase gate (local checkpoints only)
- **Push** happens exactly ONCE at the end, after ALL gates pass
- If any gate fails → pipeline stops → `git_push_allowed` stays `false` → no push
- Never push unless `git_push_allowed` is `true` in pipeline.json

## Project Navigation

### Product Requirements
- Master PRD: `docs/functional/top-level-prd.md`
- Chain deployment: `docs/functional/func-prd-001-chain-deployment.md`
- Stylus messaging: `docs/functional/func-prd-002-stylus-messaging.md`
- TPS load testing: `docs/functional/func-prd-003-tps-load-test.md`
- PRD index: `docs/functional/TOC.md`

### Standards & Specs
- Documentation standards: `docs/documentation-spec.md`
- Test report format: `docs/testing/reporting-results-spec.md`
- Test prerequisites: `docs/testing/preconditions-spec.md`

### Skills (Implementation)
- `/front-end` — React/Next.js messaging UI, wagmi dual-chain wallet
- `/security` — Stylus reentrancy, RawCall safety, bridge security
- `/api` — Node config, RPC management, batch poster/validator setup
- `/data-integrity` — Cross-chain state, Stylus storage, event sourcing
- `/application-privacy` — Key management, multi-key architecture
- `/kickoff` — Run the full SDLC pipeline end-to-end
- `/status` — Check pipeline status, agent gates, findings
- `agent-teams` — Testing orchestration patterns (not user-invocable)
- Skills index: `docs/skills/TOC.md`

### Subagents (Testing & Analysis)
- `read-code` (sonnet) — Codebase exploration, writes context file
- `functional-tester` (sonnet) — Contract CRUD, chain ops, frontend flows
- `integration-tester` (sonnet) — Cross-chain round-trips, component boundaries
- `security-tester` (opus) — Stylus security, bridge attacks, config audit
- `performance-tester` (sonnet) — Gas costs, bridge latency, WASM perf
- `system-uat-tester` (opus) — Full user journeys, PRD criteria validation
- `deployment-tester` (sonnet) — Deploy validation, smoke tests
- `load-tester` (sonnet) — TPS throughput, latency, bottleneck analysis
- Testing index: `docs/testing/TOC.md`

## Delegation Rules

### Implementation → Skills
When implementing features, invoke the relevant skill:
- Chain deployment scripts → `/api`
- Stylus contract code → `/security` (review) + direct implementation
- Frontend components → `/front-end`
- Storage/state design → `/data-integrity`
- Key/env management → `/application-privacy`

### Testing → Subagents
Run testing phases sequentially (each phase gate must pass):
```
functional → integration → security → performance → system-uat → deployment → load-test
```
Subagents are read-only — they report findings, they don't fix code.

### Context → read-code Agent
Before testing or implementation, run `read-code` to scan the codebase and write `.claude/state/codebase-context.md`. All other agents read this at startup (Step 0).

## Arbitrum Conventions

### Chain SDK Workflow
1. `prepareChainConfig` → chain parameters
2. `createRollup` → deploy rollup contracts on parent chain
3. `prepareNodeConfig` → generate node configuration
4. Start node → verify blocks, RPC, batch posting

### Cargo Stylus Workflow
1. Write contract with `stylus-sdk` macros (`#[entrypoint]`, `#[storage]`, `#[public]`)
2. `cargo stylus check` → validate WASM
3. `cargo stylus deploy` → deploy to L2
4. Verify via `cast call` / frontend

### Bridge Patterns
- L2→L1: `ArbSys.sendTxToL1()` via `sol_interface!`
- Always `flush_storage_cache()` before cross-contract calls
- Messages finalize after challenge period on L1
- Track bridge status: pending → batched → asserted → confirmed → executable

## Code Quality
- No `unsafe` Rust without documented justification
- Private keys from environment variables only
- Solidity-compatible ABIs from Stylus `#[public]` macro
- Events use `sol!` macro for ABI compatibility

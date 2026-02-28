# Testing — Table of Contents

## Specifications

| Document | Purpose | Status |
|---|---|---|
| [reporting-results-spec.md](reporting-results-spec.md) | Test report format, severity levels, finding template | Approved |
| [preconditions-spec.md](preconditions-spec.md) | Environment, account, and network prerequisites | Approved |

## Agents

| Agent | Model | Focus | Location |
|---|---|---|---|
| read-code | sonnet | Codebase exploration, context generation | [.claude/agents/read-code.md](../../.claude/agents/read-code.md) |
| functional-tester | sonnet | Contract CRUD, chain deployment, frontend flows | [.claude/agents/functional-tester.md](../../.claude/agents/functional-tester.md) |
| integration-tester | sonnet | Cross-chain round-trips, component boundaries | [.claude/agents/integration-tester.md](../../.claude/agents/integration-tester.md) |
| security-tester | opus | Stylus security, bridge attacks, chain config | [.claude/agents/security-tester.md](../../.claude/agents/security-tester.md) |
| performance-tester | sonnet | Gas costs, bridge latency, storage efficiency | [.claude/agents/performance-tester.md](../../.claude/agents/performance-tester.md) |
| system-uat-tester | opus | Full user journeys, PRD criteria validation | [.claude/agents/system-uat-tester.md](../../.claude/agents/system-uat-tester.md) |
| deployment-tester | sonnet | cargo stylus deploy, createRollup, smoke tests | [.claude/agents/deployment-tester.md](../../.claude/agents/deployment-tester.md) |
| load-tester | sonnet | TPS throughput, latency, bottleneck analysis | [.claude/agents/load-tester.md](../../.claude/agents/load-tester.md) |

## Pipeline

```
Phase 0: Read Code     → Gate: codebase-context.md generated
Phase 1: Functional    → Gate: core functions work
Phase 2: Integration   → Gate: component boundaries verified
Phase 3: Security      → Gate: zero S1, S2 mitigated
Phase 4: Performance   → Gate: gas within budget
Phase 5: System/UAT    → Gate: PRD criteria met
Phase 6: Deployment    → Gate: smoke tests pass
Phase 7: Load Test     → Gate: TPS meets PRD-003 targets
```

## Pipeline State

| File | Purpose |
|---|---|
| `.claude/state/pipeline.json` | Pipeline progress, phase statuses, push control |
| `.claude/state/codebase-context.md` | Repository context (written by read-code agent) |
| `.claude/state/agent-status/<agent>.json` | Per-agent status, findings, gate result |

## Reports

Test reports are stored in `docs/testing/reports/` with naming convention:
`<agent>-<YYYY-MM-DD>.md`

Example: `security-tester-2026-02-27.md`

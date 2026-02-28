# Testing — Table of Contents

## Specifications

| Document | Purpose | Status |
|---|---|---|
| [reporting-results-spec.md](reporting-results-spec.md) | Test report format, severity levels, finding template | Approved |
| [preconditions-spec.md](preconditions-spec.md) | Environment, account, and network prerequisites | Approved |

## Test Phases

```
Phase 1: Functional    → Core functions work (contract CRUD, chain ops)
Phase 2: Integration   → Component boundaries verified (cross-chain round-trips)
Phase 3: Security      → Zero S1, S2 mitigated (Stylus safety, bridge attacks)
Phase 4: Performance   → Gas within budget (costs, latency, storage efficiency)
Phase 5: System/UAT    → PRD criteria met (full user journeys)
Phase 6: Deployment    → Smoke tests pass (deploy + verify)
Phase 7: Load Test     → TPS meets PRD-003 targets
```

## Reports

Test reports are stored in `docs/testing/reports/` with naming convention:
`<phase>-<YYYY-MM-DD>.md`

| Report | Phase | Date |
|--------|-------|------|
| [functional-tester-2026-02-27.md](reports/functional-tester-2026-02-27.md) | Functional | 2026-02-27 |
| [integration-tester-2026-02-27.md](reports/integration-tester-2026-02-27.md) | Integration | 2026-02-27 |
| [security-tester-2026-02-27.md](reports/security-tester-2026-02-27.md) | Security | 2026-02-27 |
| [performance-tester-2026-02-27.md](reports/performance-tester-2026-02-27.md) | Performance | 2026-02-27 |
| [system-uat-tester-2026-02-27.md](reports/system-uat-tester-2026-02-27.md) | System/UAT | 2026-02-27 |
| [deployment-tester-2026-02-27.md](reports/deployment-tester-2026-02-27.md) | Deployment | 2026-02-27 |
| [load-tester-2026-02-27.md](reports/load-tester-2026-02-27.md) | Load Test | 2026-02-27 |

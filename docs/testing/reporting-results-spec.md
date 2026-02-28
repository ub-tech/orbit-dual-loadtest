# Test Reporting & Results Specification

**Status:** Approved

## Purpose
Standardizes how test findings are reported across all testing roles (functional, security, performance, integration, system/UAT, deployment).

## Severity Levels

| Level | Label | Description | Action Required |
|---|---|---|---|
| S1 | Critical | Blocks deployment; security breach or data loss risk | Immediate fix before any release |
| S2 | High | Core functionality broken; workaround may exist | Fix before release |
| S3 | Medium | Non-core feature issue; degraded experience | Fix in next sprint |
| S4 | Low | Cosmetic or minor UX issue | Backlog |

## Finding Template

Each test finding must follow this structure:

```markdown
### Finding: <SHORT-TITLE>

- **ID:** <AGENT>-<NNN> (e.g., SEC-001, FUNC-003)
- **Severity:** S1 | S2 | S3 | S4
- **Category:** Security | Functional | Performance | Integration | Deployment
- **Component:** <file or module affected>
- **Description:** <What was found>
- **Steps to Reproduce:** <Numbered steps>
- **Expected Behavior:** <What should happen>
- **Actual Behavior:** <What does happen>
- **Evidence:** <Logs, screenshots, code references>
- **Recommendation:** <Suggested fix>
```

## Test Report Structure

Each testing agent produces a report with:

```markdown
# <Test Type> Report
**Date:** <YYYY-MM-DD>
**Agent:** <agent-name>
**Scope:** <What was tested>
**Status:** Pass | Fail | Partial

## Summary
- Total checks: N
- Passed: N
- Failed: N
- Blocked: N

## Findings
<Finding entries per template above>

## Sign-Off
- [ ] All S1/S2 findings resolved or waived
- [ ] Report reviewed
- [ ] Ready for next phase gate
```

## Phase Gate Criteria

Testing phases proceed sequentially. A phase gate passes when:

1. **Functional**: All S1/S2 functional findings resolved
2. **Integration**: Cross-chain round-trips verified end-to-end
3. **Security**: Zero open S1 findings; S2 findings have documented mitigations
4. **Performance**: Gas costs within budget; bridge latency within SLA
5. **System/UAT**: Full user journey completes without error
6. **Deployment**: Smoke tests pass on target environment

## Report Delivery

- Reports are written to `docs/testing/reports/<agent>-<date>.md`
- Summary findings surfaced to EM via agent output
- EM decides phase gate pass/fail based on sign-off criteria

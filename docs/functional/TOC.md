# Functional Requirements — Table of Contents

## PRD Index

| ID | Title | Status | Link |
|---|---|---|---|
| — | Top-Level PRD | Approved | [top-level-prd.md](top-level-prd.md) |
| PRD-001 | Chain Deployment via Chain SDK | Approved | [func-prd-001-chain-deployment.md](func-prd-001-chain-deployment.md) |
| PRD-002 | Stylus Messaging Contract + Bridge | Approved | [func-prd-002-stylus-messaging.md](func-prd-002-stylus-messaging.md) |
| PRD-003 | TPS Load Testing | Approved | [func-prd-003-tps-load-test.md](func-prd-003-tps-load-test.md) |

## Status Key

| Status | Meaning |
|---|---|
| Draft | Initial creation, open for edits |
| In Review | Content complete, under review |
| Approved | Signed off, ready for implementation |
| Implemented | Delivered and verified |
| Deprecated | No longer applicable |

## Dependency Map

```
top-level-prd.md
├── PRD-001: Chain Deployment (no dependencies)
├── PRD-002: Stylus Messaging (depends on PRD-001 — needs running chain)
└── PRD-003: TPS Load Testing (depends on PRD-001 + PRD-002 — needs running chain + deployed contract)
```

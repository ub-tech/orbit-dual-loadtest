# Documentation Standards

## Purpose
Defines document templates, formatting rules, and lifecycle management for all project documentation.

## Document Types

| Type | Location | Naming Convention |
|---|---|---|
| PRD | `docs/functional/` | `func-prd-NNN-<slug>.md` |
| Test Spec | `docs/testing/` | `<topic>-spec.md` |
| Skill Spec | `.claude/skills/<domain>/SKILL.md` | Fixed name per skill |
| Agent Spec | `.claude/agents/` | `<role>-tester.md` |

## Template: PRD

```markdown
# PRD-NNN: <Title>
**Status:** Draft | In Review | Approved | Implemented
**Author:** <name>
**Date:** <YYYY-MM-DD>
**Parent:** top-level-prd.md

## Problem Statement
## Goals & Success Criteria
## Functional Requirements
## Non-Functional Requirements
## Technical Approach
## Dependencies
## Acceptance Criteria
## Open Questions
```

## Template: Test Spec

```markdown
# <Test Type> Specification
**Status:** Draft | Active | Deprecated

## Scope
## Preconditions
## Test Cases
## Expected Results
## Reporting Format
```

## Status Lifecycle

```
Draft → In Review → Approved → Implemented → Deprecated
```

- **Draft**: Initial creation, open for major edits
- **In Review**: Content complete, under peer review
- **Approved**: Signed off, ready for implementation
- **Implemented**: Requirements delivered and verified
- **Deprecated**: Superseded or no longer applicable

## Formatting Rules

1. Use ATX-style headers (`#`, `##`, `###`)
2. Tables for structured data; bullet lists for sequences
3. Code blocks with language annotation (```rust, ```typescript)
4. Cross-reference other docs with relative paths: `[Chain Deployment PRD](functional/func-prd-001-chain-deployment.md)`
5. Keep line length under 120 characters where practical
6. Every document must have a Status field in the header

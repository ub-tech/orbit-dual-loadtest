# Skills — Table of Contents

## Skill Index

| Skill | Domain | User-Invocable | Location |
|---|---|---|---|
| front-end | React/Next.js messaging UI | Yes | [.claude/skills/front-end/SKILL.md](../../.claude/skills/front-end/SKILL.md) |
| security | Stylus/Rust + bridge security | Yes | [.claude/skills/security/SKILL.md](../../.claude/skills/security/SKILL.md) |
| api | Node config & RPC management | Yes | [.claude/skills/api/SKILL.md](../../.claude/skills/api/SKILL.md) |
| data-integrity | Cross-chain state consistency | Yes | [.claude/skills/data-integrity/SKILL.md](../../.claude/skills/data-integrity/SKILL.md) |
| application-privacy | Key management & privacy | Yes | [.claude/skills/application-privacy/SKILL.md](../../.claude/skills/application-privacy/SKILL.md) |
| kickoff | Full SDLC pipeline execution | Yes | [.claude/skills/kickoff/SKILL.md](../../.claude/skills/kickoff/SKILL.md) |
| status | Pipeline status display | Yes | [.claude/skills/status/SKILL.md](../../.claude/skills/status/SKILL.md) |
| agent-teams | Testing orchestration | No | [.claude/skills/agent-teams/SKILL.md](../../.claude/skills/agent-teams/SKILL.md) |

## Usage Matrix

| Skill | Read | Grep | Glob | Bash | Write | Edit |
|---|---|---|---|---|---|---|
| front-end | x | x | x | x | x | x |
| security | x | x | x | x | x | x |
| api | x | x | x | x | x | x |
| data-integrity | x | x | x | x | x | x |
| application-privacy | x | x | x | x | x | x |
| kickoff | x | x | x | x | x | x |
| status | x | x | x | — | — | — |
| agent-teams | x | x | x | — | — | — |

## Skill Relationships

```
front-end ←→ api (RPC endpoints, contract ABI)
front-end ←→ data-integrity (event sourcing, state display)
security ←→ application-privacy (key management review)
security ←→ data-integrity (storage layout, bridge state)
api ←→ data-integrity (node config, event indexing)
agent-teams → all (orchestrates testing across all domains)
kickoff → agent-teams (runs full pipeline)
status → agent-teams (reads pipeline state)
```

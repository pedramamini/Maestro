# Maestro PM Handbook

This is the **Maestro PM Handbook** — the authoritative reference for the Maestro `/PM` mode delivery pipeline. It describes, step by step, how to move work from raw idea to merged PR using Maestro Board / Work Graph as the source of truth.

The `/PM` mode system prompt loads `pm-mode-system.md` and appends the paths to these files so the agent can read them on demand. You should read the relevant file when you need procedure-level detail rather than relying on the summary in the system prompt.

---

## Table of Contents

| File                                                       | Covers                                                                              |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [01-prd-creation.md](01-prd-creation.md)                   | PRD interview process, output template, project item creation, status transitions   |
| [02-epic-decomposition.md](02-epic-decomposition.md)       | Splitting a PRD into an epic, dependency graph, AI Stage and AI Priority guidance   |
| [03-task-breakdown.md](03-task-breakdown.md)               | Turning an epic into tasks, sizing rules, acceptance criteria template              |
| [04-github-sync.md](04-github-sync.md)                     | Optional GitHub mirror behavior and issue/PR sync                                   |
| [05-dispatch-claim.md](05-dispatch-claim.md)               | runner/fixer/reviewer/merger roles, slot semantics, heartbeat, stale claim recovery |
| [06-review-merge.md](06-review-merge.md)                   | PR opens → AI Status=In Review → reviewer slot → merger slot                        |
| [07-status-and-standup.md](07-status-and-standup.md)       | Querying board state, formatting status and standup replies                         |
| [08-blocked-and-recovery.md](08-blocked-and-recovery.md)   | Blocked items, audit, /PM migrate-labels, unstick procedures                        |
| [09-state-source-of-truth.md](09-state-source-of-truth.md) | Field-vs-label rule, anti-patterns, examples                                        |
| [10-cheatsheet.md](10-cheatsheet.md)                       | PM command quick reference for common operations                                    |
| [11-dispatch-health.md](11-dispatch-health.md)             | Check / repair dispatch from PM mode — what you can see vs. what you can't          |

---

## Pipeline Overview

```
User idea
    │
    ▼
PRD (docs/pm/prds/<slug>.md)          AI Status = PRD Draft
    │
    ▼
Epic decomposition                     AI Status = Refinement → Tasks Ready
    │
    ▼
Task work items                         Work Graph status = ready
    │
    ▼
Dispatch Engine claims work             Work Graph status = claimed/in_progress
    │
    ▼
PR opened                              Work Graph status = review
    │
    ▼
Reviewer approves                      (PR approved)
    │
    ▼
Merger merges + closes task             Work Graph status = done
```

---

## Configuration Requirements

Before any PM operations can run, the following must be configured:

1. **Local PM initialization**: run `/PM-init` once per project so Maestro Board tags and Work Graph conventions are ready.

2. **Role slots** (for automated dispatch): `projectRoleSlots[projectPath]` should define `runner`, `fixer`, `reviewer`, and `merger` slots. Each slot is `{ agentId, modelOverride?, effortOverride?, enabled? }`. Set via Maestro Symphony → Roles tab.

3. **gh CLI authenticated**: Run `gh auth status` to verify. If not logged in: `gh auth login`.

---

## What Is NOT in This Handbook

- How to configure Maestro itself (see `CLAUDE.md` and `CLAUDE-AGENT-DISPATCH.md`)
- Auto Run / Playbook authoring (see `src/prompts/` and Maestro docs)
- Cue automation (see `CLAUDE-CUE.md`)
- Symphony group chat (see `CLAUDE-AGENTS.md`)

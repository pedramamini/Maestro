> **State source-of-truth**: Work Graph is the canonical PM data model; Maestro Board is the UI for that data. Use concrete local actions such as `/PM status`, `/PM prd-list`, `/PM epic-list`, `/PM issue-show <id>`, `/PM issue-status <id>`, `/PM epic-sync <id>`, `/PM issue-sync <id>`, `/PM issue-start <id>`, or the app IPC channels listed in `pm-mode-system.md`. Shell agents can inspect dispatch with `maestro-cli fleet board --project <path> --json` and `maestro-cli fleet list --json`. Do NOT use GitHub labels, GitHub issues, or GitHub Projects fields as runtime PM state.

# /PM epic-show

Show full detail for a specific epic, including all tasks.

Epic ID: {{ARGS}}

## Output format

### Epic header

```
## Epic: <Title>
ID: `<id>` | Status: **<status>** | Source: <source>
Created: YYYY-MM-DD | Updated: YYYY-MM-DD
```

If there is a description, show it here (truncated to 3 sentences).

### Task list

Show all tasks in a checklist format:

```
### Tasks (<done>/<total>)

- [x] `task-id` Task title — **done**
- [ ] `task-id` Task title — **in_progress** — Runner: <agent-id>
- [ ] `task-id` Task title — **ready**
- [ ] `task-id` Task title — **blocked** — Reason: ...
```

### Progress bar (text)

```
Progress: ████████░░░░░░░░ 50% (4/8 tasks done)
```

## Next steps

Based on the epic status, suggest the most useful next action:

- Has `ready` tasks → `/PM issue-start <task-id>` to claim one
- Has `blocked` tasks → list them with reasons
- All `done` → suggest `/PM epic-sync {{ARGS}}` to reconcile Work Graph and the local mirror

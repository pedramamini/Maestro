> **State source-of-truth**: Work Graph is the canonical PM data model; Maestro Board is the UI for that data. Use concrete local actions such as `/PM status`, `/PM prd-list`, `/PM epic-list`, `/PM issue-show <id>`, `/PM issue-status <id>`, `/PM epic-sync <id>`, `/PM issue-sync <id>`, `/PM issue-start <id>`, or the app IPC channels listed in `pm-mode-system.md`. Shell agents can inspect dispatch with `{{MAESTRO_CLI_PATH}} fleet board --project <path> --json` and `{{MAESTRO_CLI_PATH}} fleet list --json`. Shell agents must create or update board items with `{{MAESTRO_CLI_PATH}} pm work ...`; if that bridge is unavailable, stop and report the blocker instead of creating markdown-only work. Do NOT use GitHub labels, GitHub issues, or GitHub Projects fields as runtime PM state.

# /PM issue-show

Show full detail for a specific Work Graph task item.

Task ID: {{ARGS}}

## Output format

### Task header

```
## Task: <Title>
ID: `<id>` | Status: **<status>** | Type: <type>
Created: YYYY-MM-DD | Updated: YYYY-MM-DD
```

### Fields

| Field      | Value                   |
| ---------- | ----------------------- |
| Source     | <source>                |
| Priority   | <priority or —>         |
| Claimed by | <agent-id or unclaimed> |
| Claimed at | YYYY-MM-DD HH:MM or —   |
| Trace ID   | Work Graph/Maestro ID   |

### Description

Show the full description (up to 600 characters, with "..." if truncated).

### Dependencies

If the task has dependencies, list them:

- `<dep-id>` Dependent task title — **<status>**

### Acceptance criteria

If present in the description, extract and format as a checklist.

## Next steps

Based on status:

- `ready` → `/PM issue-start {{ARGS}}` to claim
- `in_progress` → show remaining work estimate if available
- `blocked` → show blocking reason
- `done` → suggest `/PM issue-sync {{ARGS}}` to reconcile Work Graph and the local mirror

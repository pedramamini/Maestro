> **State source-of-truth**: Work Graph is the canonical PM data model; Maestro Board is the UI for that data. Use concrete local actions such as `/PM status`, `/PM prd-list`, `/PM epic-list`, `/PM issue-show <id>`, `/PM issue-status <id>`, `/PM epic-sync <id>`, `/PM issue-sync <id>`, `/PM issue-start <id>`, or the app IPC channels listed in `pm-mode-system.md`. Shell agents can inspect dispatch with `maestro-cli fleet board --project <path> --json` and `maestro-cli fleet list --json`. Do NOT use GitHub labels, GitHub issues, or GitHub Projects fields as runtime PM state.

# /PM prd-status

Show a quick status summary for a specific PRD.

PRD ID: {{ARGS}}

## Output format

Present the following fields in a compact table:

| Field   | Value        |
| ------- | ------------ |
| ID      | `<id>`       |
| Title   | <title>      |
| Status  | **<status>** |
| Source  | <source>     |
| Created | YYYY-MM-DD   |
| Updated | YYYY-MM-DD   |

If the PRD has a description, include the first 2-3 sentences below the table.

## Next steps

Suggest the most relevant next action based on status:

- `planned` / `ready` → `/PM epic-decompose <id>` to break it into an epic
- `in_progress` → `/PM epic-list` to see the current epic
- `blocked` → explain the blocking reason if available
- `done` → congratulate and suggest archiving or creating a new PRD

Keep the response under 20 lines total.

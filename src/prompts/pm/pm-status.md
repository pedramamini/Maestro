> **State source-of-truth**: Work Graph is the canonical PM data model; Maestro Board is the UI for that data. Use concrete local actions such as `/PM status`, `/PM prd-list`, `/PM epic-list`, `/PM issue-show <id>`, `/PM issue-status <id>`, `/PM epic-sync <id>`, `/PM issue-sync <id>`, `/PM issue-start <id>`, or the app IPC channels listed in `pm-mode-system.md`. Shell agents can inspect dispatch with `{{MAESTRO_CLI_PATH}} fleet board --project <path> --json` and `{{MAESTRO_CLI_PATH}} fleet list --json`. Shell agents must create or update board items with `{{MAESTRO_CLI_PATH}} pm work ...`; if that bridge is unavailable, stop and report the blocker instead of creating markdown-only work. Do NOT use GitHub labels, GitHub issues, or GitHub Projects fields as runtime PM state.

# /PM status

Show a current project board snapshot for the active project.

Present the data as a compact summary:

## Project Status

| Status      | Count |
| ----------- | ----- |
| Planned     | N     |
| Ready       | N     |
| In Progress | N     |
| Blocked     | N     |
| Done        | N     |

**Ready items** (up to 5): list title + ID
**Blocked items** (up to 5): list title + blocking reason if available
**Overdue items** (up to 5): list title + due date

If the board is empty, say so and suggest starting with `/PM prd-new <name>`.

> **State source-of-truth**: Work Graph is the canonical PM data model; Maestro Board is the UI for that data. Use concrete local actions such as `/PM status`, `/PM prd-list`, `/PM epic-list`, `/PM issue-show <id>`, `/PM issue-status <id>`, `/PM epic-sync <id>`, `/PM issue-sync <id>`, `/PM issue-start <id>`, or the app IPC channels listed in `pm-mode-system.md`. Shell agents can inspect dispatch with `maestro-cli fleet board --project <path> --json` and `maestro-cli fleet list --json`. Do NOT use GitHub labels, GitHub issues, or GitHub Projects fields as runtime PM state.

# /PM next

Show the next eligible work item ready for implementation.

Selection criteria (in priority order):

1. Status is `ready` and not currently claimed
2. All blocking dependencies are `done` or `canceled`
3. Highest-priority task by due date (soonest first), then by creation date

Present the result as a short card:

- **Title**
- **Description** (first 2 sentences)
- **Status / Priority**
- Suggested action: "Run `/dispatch assign <id>` to claim this item" (if Agent Dispatch is active)

If no eligible items exist, say so and suggest checking `/PM status` for blocked items.

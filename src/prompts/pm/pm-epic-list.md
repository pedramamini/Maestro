> **State source-of-truth**: Work Graph is the canonical PM data model; Maestro Board is the UI for that data. Use concrete local actions such as `/PM status`, `/PM prd-list`, `/PM epic-list`, `/PM issue-show <id>`, `/PM issue-status <id>`, `/PM epic-sync <id>`, `/PM issue-sync <id>`, `/PM issue-start <id>`, or the app IPC channels listed in `pm-mode-system.md`. Shell agents can inspect dispatch with `maestro-cli fleet board --project <path> --json` and `maestro-cli fleet list --json`. Do NOT use GitHub labels, GitHub issues, or GitHub Projects fields as runtime PM state.

# /PM epic-list

Show a table of all epics in the Work Graph for the current project.

## Output format

Present the data as a markdown table:

| ID     | Title        | Status          | Tasks   | Updated    |
| ------ | ------------ | --------------- | ------- | ---------- |
| `<id>` | Feature Name | **in_progress** | 8 tasks | YYYY-MM-DD |

## Status legend

- **planned** — decomposed but not started
- **in_progress** — at least one task is claimed or in progress
- **review** — all tasks done, awaiting final review
- **done** — all tasks completed
- **blocked** — at least one task is blocked

## After the table

If there are epics in progress, show a quick summary:

- Number of tasks done vs total for each in-progress epic
- Any blocked tasks

If there are no epics, say so and suggest `/PM epic-decompose <prd-id>` to create one.

Keep the response concise — one table and a brief summary paragraph is enough.

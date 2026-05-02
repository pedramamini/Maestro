> **State source-of-truth**: Work Graph is the canonical PM data model; Maestro Board is the UI for that data. Use concrete local actions such as `/PM status`, `/PM prd-list`, `/PM epic-list`, `/PM issue-show <id>`, `/PM issue-status <id>`, `/PM epic-sync <id>`, `/PM issue-sync <id>`, `/PM issue-start <id>`, or the app IPC channels listed in `pm-mode-system.md`. Shell agents can inspect dispatch with `{{MAESTRO_CLI_PATH}} fleet board --project <path> --json` and `{{MAESTRO_CLI_PATH}} fleet list --json`. Shell agents must create or update board items with `{{MAESTRO_CLI_PATH}} pm work ...`; if that bridge is unavailable, stop and report the blocker instead of creating markdown-only work. Do NOT use GitHub labels, GitHub issues, or GitHub Projects fields as runtime PM state.

# /PM epic-edit

Open the Delivery Planner to edit an existing epic.

Epic ID: {{ARGS}}

## Your role

Present the current state of this epic and its tasks, then help the user make targeted edits.

## Editing options

- Add or remove tasks
- Change task titles or descriptions
- Adjust task dependencies
- Update the epic title or description
- Change task types or priorities
- Reorder the suggested implementation sequence

## Workflow

1. Show the current epic summary (title, status, task count)
2. List all tasks in a compact table: ID | Title | Status | Type
3. Ask what the user wants to change
4. Apply the edit and confirm before saving

## Constraints

- Do not delete tasks that are already `in_progress`, `review`, or `done` — only the user can force that
- When adding tasks, check for duplicate intent before creating
- Warn if a new dependency would create a circular chain

When edits are confirmed, suggest `/PM epic-sync {{ARGS}}` to update Work Graph and the local markdown mirror.

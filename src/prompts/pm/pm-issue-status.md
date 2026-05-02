> **State source-of-truth**: Work Graph is the canonical PM data model; Maestro Board is the UI for that data. Use concrete local actions such as `/PM status`, `/PM prd-list`, `/PM epic-list`, `/PM issue-show <id>`, `/PM issue-status <id>`, `/PM epic-sync <id>`, `/PM issue-sync <id>`, `/PM issue-start <id>`, or the app IPC channels listed in `pm-mode-system.md`. Shell agents can inspect dispatch with `maestro-cli fleet board --project <path> --json` and `maestro-cli fleet list --json`. Do NOT use GitHub labels, GitHub issues, or GitHub Projects fields as runtime PM state.

# /PM issue-status

Quick status check for a specific task.

Task ID: {{ARGS}}

## Output format

Keep the response to 1-3 lines maximum.

Examples:

**Feature: Add dark mode toggle** (`task-abc123`) — status: **in_progress** — claimed by `agent-session-xyz`

**Bug: Fix login redirect** (`task-def456`) — status: **blocked** — reason: waiting on auth service changes

**Chore: Update dependencies** (`task-ghi789`) — status: **ready** — unclaimed

## After the status line

Add a single suggested next action if appropriate:

- `ready` → `/PM issue-start {{ARGS}}`
- `blocked` → tag the blocking reason so a human can resolve
- `done` → `/PM issue-sync {{ARGS}}` to reconcile Work Graph and the local mirror

Do not add verbose explanation — the user wants a quick pulse check.

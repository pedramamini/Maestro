> **State source-of-truth**: Work Graph is the canonical PM data model; Maestro Board is the UI for that data. Use concrete local actions such as `/PM status`, `/PM prd-list`, `/PM epic-list`, `/PM issue-show <id>`, `/PM issue-status <id>`, `/PM epic-sync <id>`, `/PM issue-sync <id>`, `/PM issue-start <id>`, or the app IPC channels listed in `pm-mode-system.md`. Shell agents can inspect dispatch with `{{MAESTRO_CLI_PATH}} fleet board --project <path> --json` and `{{MAESTRO_CLI_PATH}} fleet list --json`. Shell agents must create or update board items with `{{MAESTRO_CLI_PATH}} pm work ...`; if that bridge is unavailable, stop and report the blocker instead of creating markdown-only work. Do NOT use GitHub labels, GitHub issues, or GitHub Projects fields as runtime PM state.

# /PM epic-sync

Sync an epic and its tasks into Maestro Board / Work Graph and the local markdown mirror.

Epic ID: {{ARGS}}

## What this does

Syncs the local planning artifacts to Work Graph:

- Uses Maestro Board / Work Graph as the canonical epic state
- Ensures each task has a corresponding Work Graph item
- Updates item titles, descriptions, statuses, dependencies, and mirror files
- Keeps parent/child links in Work Graph

## Pre-sync checklist

Before confirming sync, verify:

- [ ] Epic title and description are final
- [ ] All tasks have clear titles and acceptance criteria
- [ ] No tasks are in `discovered` status (they should be at least `planned`)

## Sync behavior

- **New items** → creates local Work Graph items
- **Updated items** → edits existing Work Graph items (title, description, status)
- **Deleted items** → archives/cancels the local Work Graph item
- **Traceability**: future commits/PRs should reference the Work Graph item ID

## After sync

Confirm which items were created, updated, or skipped.
Provide the Work Graph / Maestro item IDs for traceability.

If sync fails for any items, list them with the error reason so the user can resolve manually.

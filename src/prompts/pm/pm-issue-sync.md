> **State source-of-truth**: Work Graph is the canonical PM data model; Maestro Board is the UI for that data. Use concrete local actions such as `/PM status`, `/PM prd-list`, `/PM epic-list`, `/PM issue-show <id>`, `/PM issue-status <id>`, `/PM epic-sync <id>`, `/PM issue-sync <id>`, `/PM issue-start <id>`, or the app IPC channels listed in `pm-mode-system.md`. Shell agents can inspect dispatch with `{{MAESTRO_CLI_PATH}} fleet board --project <path> --json` and `{{MAESTRO_CLI_PATH}} fleet list --json`. Shell agents must create or update board items with `{{MAESTRO_CLI_PATH}} pm work ...`; if that bridge is unavailable, stop and report the blocker instead of creating markdown-only work. Do NOT use GitHub labels, GitHub issues, or GitHub Projects fields as runtime PM state.

# /PM issue-sync

Local PM sync for a specific task.

Task ID: {{ARGS}}

## What this does

Reconciles local task files, Work Graph item state, and Maestro Board metadata.

**Local files → Work Graph**:

- Updates the Work Graph item title and description if changed locally
- Syncs Work Graph status, type, priority, dependencies, and role
- Records a Work Graph event if status changed

**Work Graph → local files**:

- Reflects current status and metadata in the local task file if needed
- Updates the sync timestamp

## After sync

Confirm what changed in Work Graph and local files.
If there are conflicts (both sides changed the same field), show a diff and ask which version to keep.

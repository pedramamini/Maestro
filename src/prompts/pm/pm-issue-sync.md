> **State source-of-truth**: This project uses Maestro Board/Work Graph for all PM and dispatch state. Do NOT use GitHub labels or GitHub Projects fields as runtime state. Query and update state through Maestro PM IPC/commands such as `pm:setStatus`.

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

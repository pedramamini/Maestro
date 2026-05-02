> **State source-of-truth**: This project uses Maestro Board/Work Graph for all PM and dispatch state. Do NOT use GitHub labels or GitHub Projects fields as runtime state. Query and update state through Maestro PM IPC/commands such as `pm:setStatus`.

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

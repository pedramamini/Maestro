> **State source-of-truth**: Work Graph is the canonical PM data model; Maestro Board is the UI for that data. Use concrete local actions such as `/PM status`, `/PM prd-list`, `/PM epic-list`, `/PM issue-show <id>`, `/PM issue-status <id>`, `/PM epic-sync <id>`, `/PM issue-sync <id>`, `/PM issue-start <id>`, or the app IPC channels listed in `pm-mode-system.md`. Shell agents can inspect dispatch with `{{MAESTRO_CLI_PATH}} fleet board --project <path> --json` and `{{MAESTRO_CLI_PATH}} fleet list --json`. Shell agents must create or update board items with `{{MAESTRO_CLI_PATH}} pm work ...`; if that bridge is unavailable, stop and report the blocker instead of creating markdown-only work. Do NOT use GitHub labels, GitHub issues, or GitHub Projects fields as runtime PM state.

# /PM migrate-labels

Compatibility check for legacy Symphony-runner `agent:*` labels. Modern PM state is already local in Work Graph.

Run this once per repository after adopting the Maestro dispatch system.

## What it does

For older repositories that still mention legacy `agent:*` labels:

1. Acknowledges that legacy `agent:*` labels came from older repository issue workflows.
2. Maps the legacy label to the corresponding Work Graph status:

   | Legacy label              | Work Graph status |
   | ------------------------- | ----------------- |
   | `agent:ready`             | `ready`           |
   | `agent:running`           | `in_progress`     |
   | `agent:review`            | `review`          |
   | `agent:failed-validation` | `blocked`         |

3. Leaves runtime PM state in Work Graph; the compatibility endpoint does not call GitHub.
4. Reports that the labels are obsolete and ignored by dispatch.

## Result

Returns a summary: `{ migrated: N, errors: [] }`.

Issues with no `agent:*` labels are skipped silently. Issues that fail (e.g., field option not found) are listed in `errors` — they are not retried automatically.

## After migration

Legacy `agent:*` labels are decorative and can be deleted from the repo's label list. **Maestro Board / Work Graph is authoritative** for all dispatch state going forward. Do NOT re-add `agent:*` labels — they will be ignored by the dispatch engine.

## Notes

- Safe to run multiple times.
- Does not create, close, label, or edit GitHub issues.
- Does not change any other field (AI Role, AI Stage, AI Priority, etc.).

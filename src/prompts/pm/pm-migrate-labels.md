> **State source-of-truth**: This project uses Maestro Board/Work Graph for all PM and dispatch state. Do NOT use GitHub labels or GitHub Projects fields as runtime state. Query and update state through Maestro PM IPC/commands such as `pm:setStatus`.

# /PM migrate-labels

Migrate legacy Symphony-runner `agent:*` labels to the corresponding local Maestro Board / Work Graph status.

Run this once per repository after adopting the Maestro dispatch system.

## What it does

For each open issue in the repository that has one or more legacy `agent:*` labels:

1. Finds legacy `agent:*` labels from older repository issue workflows.
2. Maps the legacy label to the corresponding Work Graph status:

   | Legacy label              | Work Graph status |
   | ------------------------- | ----------------- |
   | `agent:ready`             | `ready`           |
   | `agent:running`           | `in_progress`     |
   | `agent:review`            | `review`          |
   | `agent:failed-validation` | `blocked`         |

3. Updates local PM state through Maestro PM tooling.
4. Removes the legacy `agent:*` label from the issue.

## Result

Returns a summary: `{ migrated: N, errors: [] }`.

Issues with no `agent:*` labels are skipped silently. Issues that fail (e.g., field option not found) are listed in `errors` — they are not retried automatically.

## After migration

Legacy `agent:*` labels are decorative and can be deleted from the repo's label list. **Maestro Board / Work Graph is authoritative** for all dispatch state going forward. Do NOT re-add `agent:*` labels — they will be ignored by the dispatch engine.

## Notes

- Safe to run multiple times — already-migrated issues have no `agent:*` labels and are skipped.
- Does not touch issues that are already `closed`.
- Does not change any other field (AI Role, AI Stage, AI Priority, etc.).

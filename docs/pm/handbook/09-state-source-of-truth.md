# 09 — State Source Of Truth

The most important rule in the Maestro PM system: **Work Graph is the canonical data model for all dispatch and lifecycle state; Maestro Board is the UI for it**. Not GitHub labels. Not GitHub Projects fields. Not issue comments. Not markdown files by themselves.

GitHub may be mirrored later for external visibility, but dispatch must continue to work when GitHub issues or GitHub Projects are unavailable or rate limited.

---

## The Rule

> Read and write Work Graph item status, pipeline role, priority, parent links, and claim rows through concrete local commands: `/PM status`, `/PM issue-show <id>`, `/PM issue-status <id>`, `/PM epic-sync <id>`, `/PM issue-sync <id>`, `/PM issue-start <id>`, `{{MAESTRO_CLI_PATH}} fleet board --project <path> --json`, `{{MAESTRO_CLI_PATH}} fleet claim <workItemId> --to <fleetEntryId> --json`, `{{MAESTRO_CLI_PATH}} fleet release <workItemId> --json`, or the named Maestro IPC channels.
>
> Do NOT read or write GitHub labels or GitHub Projects fields for runtime PM state.

---

## Core State

### `status` — lifecycle gate

The Dispatch Engine queries Work Graph status to determine what to do next.

| Status        | Meaning                  |
| ------------- | ------------------------ |
| `ready`       | Eligible for dispatch    |
| `claimed`     | Claimed by a slot        |
| `in_progress` | Work is actively running |
| `review`      | Waiting for review       |
| `blocked`     | Skipped until unblocked  |
| `done`        | Terminal complete state  |

### `pipeline.currentRole` — which slot picks up

- `runner` -> runner slot picks up
- `fixer` -> fixer slot picks up
- `reviewer` -> reviewer slot picks up
- `merger` -> merger slot picks up

### Work Graph claim rows — exclusive ownership

An active claim row means the item is owned by one agent slot. Heartbeat updates renew the claim lease; stale claims are released back to `ready`.

### Legacy labels — ignored

The old Symphony fork-runner used `agent:*` labels:

- `agent:ready`
- `agent:running`
- `agent:review`
- `agent:failed-validation`

These labels are ignored. Convert them to Work Graph state instead of using them for dispatch.

---

## Commit And PR Traceability

Every agent commit and PR must reference the local Work Graph item it worked on. External tracker items are not required for issue work.

Use this rule:

- Always include the Work Graph/Maestro item ID, for example `Maestro: <workItemId>` or `Work-Graph: <workItemId>`.
- If the item happens to have an external tracker mirror, the commit or PR may also include that reference.
- Do not require or create external tracker items for dispatch or PM execution. GitHub is for git hosting mechanics: branches, commits, PRs, reviews, and merges.

This keeps local PM resilient while preserving GitHub history when a mirror exists.

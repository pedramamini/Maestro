# 09 — State Source Of Truth

The most important rule in the Maestro PM system: **Maestro Board / Work Graph is the source of truth for all dispatch and lifecycle state**. Not GitHub labels. Not GitHub Projects fields. Not issue comments.

GitHub may be mirrored later for external visibility, but dispatch must continue to work when GitHub Projects is unavailable or rate limited.

---

## The Rule

> Read and write Work Graph item status, pipeline role, priority, parent links, and claim rows.
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

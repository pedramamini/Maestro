# 08 — Blocked Items & Recovery

Blocked items are the most common cause of delivery stalls. Maestro Board / Work Graph is the authority for blocked state, stale claims, and recovery actions.

---

## Marking An Item Blocked

When the user says a task is blocked:

1. Set the Work Graph item status to `blocked`.
2. Record the blocking reason as a Work Graph event.
3. If an agent owns the item, release or retain the claim based on whether the agent can continue after the blocker clears.

Do not use external tracker labels or project fields for blocked state.

---

## Unblocking

When the blocker is resolved:

1. Add a Work Graph event with the resolution.
2. Set status back to `ready` if the work should be picked up again.
3. Set status to `in_progress` only if the same agent is still actively working.

---

## Stale Claims

A stale claim is an active Work Graph claim whose heartbeat/lease has expired.

Recovery:

1. Run PM audit/health.
2. Release stale claims.
3. Return unfinished items to `ready`.
4. Preserve an audit event explaining the release.

---

## Legacy Labels

Older workflows may still contain `agent:*` labels. They are ignored by dispatch. `/PM migrate-labels` is now a compatibility endpoint and does not call GitHub.

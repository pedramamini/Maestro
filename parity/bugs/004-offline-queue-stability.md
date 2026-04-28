# Bug 004 — Offline queue retry without connection-stability check

## Severity

P1 — data consistency risk; commands may be sent multiple times or lost during reconnect.

## What's wrong

In `src/web/hooks/useOfflineQueue.ts` (~lines 177-200), the queue auto-flushes the moment `isConnected` flips true. If a WebSocket reconnects then immediately disconnects (flapping connection on cellular, lift, etc.), commands fire mid-flap — duplicates on success, lost on failure.

## Acceptance criteria

- [ ] On reconnect, queue waits ~500ms of stable connection before flushing
- [ ] If connection drops within that window, queue does NOT flush (waits for next stable window)
- [ ] No duplicate sends across reconnect cycles
- [ ] No lost commands if user is patient (the queue should flush eventually)
- [ ] Lint, ESLint, tests all green

## Implementation tasks

- [ ] Read `useOfflineQueue.ts` lines 50-200
- [ ] Add a `connectedSince` ref that captures the timestamp `isConnected` became true
- [ ] Gate the flush: only proceed if `Date.now() - connectedSince >= STABILITY_DELAY_MS`
- [ ] Use a 500ms `setTimeout` to schedule the flush; cancel if disconnected before it fires
- [ ] Consider idempotency tokens (uuid per queued command) so the desktop side can dedup if a duplicate slips through — note in Follow-ups if this requires desktop changes
- [ ] Run validation
- [ ] Commit: `fix(web): add connection-stability gate to offline queue flush`

## Verify-first

```bash
git log --oneline -20 -- src/web/hooks/useOfflineQueue.ts
```

## Test plan

- [ ] Manual: kill `npm run dev` (desktop) while web is open with queued commands. Restart. Observe single flush.
- [ ] Manual: rapid kill/restart cycle (within 200ms). Confirm no flush during instability.
- [ ] Manual: long offline (30s+), reconnect, confirm flush eventually happens.

## Pitfalls

- Don't make `STABILITY_DELAY_MS` configurable — keep it a const, 500ms
- The flush may run multiple times legitimately (queue grows during stability wait) — make sure each command is flushed exactly once per its lifetime in the queue
- This is the bug most likely to hide a regression — be thorough

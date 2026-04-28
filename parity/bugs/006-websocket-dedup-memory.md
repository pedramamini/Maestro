# Bug 006 — WebSocket dedup set unbounded growth

## Severity

P2 — memory creep on long-lived sessions with high message volume.

## What's wrong

In `src/web/hooks/useWebSocket.ts` (~lines 513, 648-660), the message-ID dedup set grows to 1000 entries, then trims the oldest 500. Memory grows linearly with throughput; no LRU, no time-based expiry. For a 24/7 session, this isn't catastrophic but isn't tidy.

## Acceptance criteria

- [ ] Dedup data structure is bounded — no unbounded growth pattern
- [ ] Old entries are evicted predictably (LRU or TTL)
- [ ] Dedup correctness preserved — no false duplicates within the recent window
- [ ] Memory profile is flat under sustained load
- [ ] Lint, ESLint, tests all green

## Implementation tasks

- [ ] Read `useWebSocket.ts` lines 500-700
- [ ] Choose a strategy: (a) bounded LRU (use a `Map` and rotate by insertion order), (b) TTL-based (each ID gets a timestamp, evict on access if older than 5min)
- [ ] Prefer (a) — LRU with a fixed cap of 500 entries. Simpler, no time math, predictable memory.
- [ ] Implement: when adding an ID, if size >= 500, delete the first (oldest) entry from the Map
- [ ] Verify the dedup logic still rejects duplicates within the window
- [ ] Run validation
- [ ] Commit: `fix(web): bound WebSocket message dedup set with LRU eviction`

## Verify-first

```bash
git log --oneline -20 -- src/web/hooks/useWebSocket.ts
```

## Pitfalls

- Don't add a third-party LRU library — Map preserves insertion order natively in JS
- 500 is plenty for normal use; if duplicates are frequent enough that 500 is too few, the real bug is upstream

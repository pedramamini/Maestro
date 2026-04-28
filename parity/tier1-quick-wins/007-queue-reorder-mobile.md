# Task 007 — Drag-to-reorder queued items (mobile)

## Context

Once task 001 ships the read-only mobile queue list, users will want to reorder items. Desktop's `QueuedItemsList` uses `dragIndex`/`dropIndex` state with mouse drag; mobile needs touch-friendly equivalent (long-press + drag, or up/down arrows).

## Depends on

**Task 001 must be merged first.** Build on top of `MobileQueuedItemsList.tsx`.

## Desktop reference

- `src/renderer/components/QueuedItemsList.tsx` — search for `onReorderItems` callback path
- WebSocket message handler for queue reorder (find `reorder_queue` or similar)

## Web target

- Modify: `src/web/mobile/MobileQueuedItemsList.tsx` (from task 001)
- Modify: WebSocket message dispatcher in `src/web/hooks/useWebSocket.ts` to send reorder messages

## Acceptance criteria

- [ ] Each queued item has a drag handle (visible on mobile — not hover-only)
- [ ] Long-press initiates drag; drag follows finger; release commits reorder
- [ ] OR: simple up/down chevron buttons per item (faster to ship; pick this if drag is fiddly)
- [ ] Reorder sends WebSocket message that desktop processes (existing path — don't add a new handler)
- [ ] Optimistic UI update; reverts if desktop rejects
- [ ] Cancel button per item also works
- [ ] Lint, ESLint, tests all green

## Implementation tasks

- [ ] Read desktop `QueuedItemsList.tsx` reorder logic
- [ ] Trace the reorder WebSocket message path — find the message type name and payload shape
- [ ] **Decision: drag vs. chevrons.** Prefer chevrons for v1 (simpler, more accessible, no touch-target dance). Drag can come in a follow-up.
- [ ] Add chevron buttons (or drag handles) to each item in `MobileQueuedItemsList.tsx`
- [ ] Wire to existing WebSocket reorder handler (mirrors the existing `reorder_tab` handler if there is one)
- [ ] Add optimistic update + revert-on-error
- [ ] Run validation
- [ ] Commit: `feat(web): reorder queued items on mobile`

## Pitfalls

- Don't add a new WebSocket message type — reuse the existing reorder path (probably `reorder_queue`)
- Touch drag on iOS is finicky — chevrons sidestep the whole problem
- Make sure rapid taps don't cause double-reorders (debounce or disable during in-flight)

# Task 004 — Multi-tab thinking status awareness

## Context

Desktop's `ThinkingStatusPill` shows a pulsing indicator with tab name, current token count, elapsed time, and a dropdown when multiple tabs are thinking simultaneously. Mobile has `AutoRunIndicator` but it only covers AutoRun batch progress — not individual tab thinking state with token/time data.

## Desktop reference

- `src/renderer/components/ThinkingStatusPill.tsx`
- `AITabData.thinkingStartTime`, `AITabData.currentCycleTokens` (already broadcast)

## Web target

- Modify: existing `AutoRunIndicator` in `src/web/mobile/` (find via grep) to render thinking state when no AutoRun batch is active
- Or: new `MobileThinkingPill.tsx` that coexists with `AutoRunIndicator`

## Acceptance criteria

- [ ] When current tab is thinking: pill shows "thinking… {N} tokens, {Ts}"
- [ ] Token count updates live as the agent streams
- [ ] Elapsed time updates every second
- [ ] When multiple tabs are thinking: pill shows count, tap to see list of tabs and their states
- [ ] When idle: pill hidden
- [ ] AutoRun progress still works (don't break existing behavior)
- [ ] Lint, ESLint, tests all green

## Implementation tasks

- [ ] Read desktop `ThinkingStatusPill.tsx` (~585 lines — focus on the data binding, skip the dropdown polish for v1)
- [ ] Locate the existing mobile `AutoRunIndicator` and review its render path
- [ ] **Decision point:** extend or coexist? Extending is one component but more complex; coexisting keeps logic separate but takes more vertical space. Prefer coexist for v1.
- [ ] Build the thinking pill — read `thinkingStartTime` and `currentCycleTokens` from session context
- [ ] Add a 1-second tick for elapsed-time display (use `useEffect` + `setInterval`, clean up on unmount)
- [ ] Multi-tab dropdown: list tabs in thinking state, show name + tokens + elapsed
- [ ] Match existing mobile pill styling
- [ ] Run validation
- [ ] Commit: `feat(web): show per-tab thinking status with tokens and elapsed time on mobile`

## Pitfalls

- The 1-second tick can cause re-render storms if not scoped correctly — only the elapsed-time text should re-render, not the whole pill
- If `thinkingStartTime` is `null`, the tab isn't thinking — bail early
- Multi-tab dropdown is the polish layer; ship the single-tab case first if scope creeps

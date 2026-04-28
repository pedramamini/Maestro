# Bug 003 — iOS keyboard offset race condition

## Severity

P1 — UI jarring on iOS; input bar briefly overlaps keyboard.

## What's wrong

In `src/web/hooks/useKeyboardVisibility.ts` (~lines 68-87), `calculateOffset` runs on every `resize` and `scroll` event from `window.visualViewport` without debouncing. On iOS, rapid keyboard show/hide cycles cause the fixed input bar to lag or jump, briefly overlapping content or the keyboard itself.

## Acceptance criteria

- [ ] Open mobile web on iOS, focus an input — keyboard rises smoothly, input bar tracks above it without flicker
- [ ] Tap-away dismiss → keyboard slides down, input bar follows smoothly
- [ ] Rapid focus/blur → no visual jitter, no overlap
- [ ] No regression on Android Chrome (where this hook is also used)
- [ ] Lint, ESLint, tests all green

## Implementation tasks

- [ ] Read `useKeyboardVisibility.ts` (lines 68-103 specifically)
- [ ] Add a small debounce (~50ms) to `handleResize`. Use a simple `setTimeout`/`clearTimeout` pattern; don't pull in lodash for this
- [ ] Verify `scroll` event needs the same treatment — likely yes
- [ ] Test on iOS Safari (if accessible) — if not, simulate via Chrome devtools mobile mode + viewport toggle
- [ ] Confirm input bar position math is still correct after debounce (last calculation wins)
- [ ] Run validation
- [ ] Commit: `fix(web): debounce keyboard visibility recalculation on iOS`

## Verify-first

```bash
git log --oneline -20 -- src/web/hooks/useKeyboardVisibility.ts
gh issue list --state open --search "keyboard ios mobile"
```

## Pitfalls

- 50ms is a starting point — too short = no benefit, too long = laggy. Adjust if needed
- `clearTimeout` on unmount is critical — leaking timers is a real bug
- Some Android browsers also fire spurious resize events; debouncing helps them too

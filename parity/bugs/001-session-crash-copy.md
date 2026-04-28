# Bug 001 — Session crash on copy-to-clipboard

## Severity

**P0** — full app crash, user must reload.

## Reference

GitHub issue #913 (verify still open: `gh issue view 913`).

## What's wrong

In `src/web/mobile/SessionStatusBanner.tsx` (~lines 368-408), `handleShare()` accesses `lastResponse.text` via stale closure. When a session is removed from state between the user's tap and the callback firing, `lastResponse` references deleted data and crashes the app.

## Root cause

Closure captures `lastResponse` at render time. Session deletion (e.g. user closes the tab on desktop, broadcast removes it from state) leaves the closure holding a reference to data that is no longer valid for the current session context.

## Acceptance criteria

- [ ] Reproducer confirmed: open a session, send a command, get a response, close the session from desktop while mobile is rendering — tap copy, observe crash
- [ ] After fix: same flow shows a graceful "Session unavailable" toast (or silently no-ops), no crash
- [ ] No regression on the happy path (copy works when session is alive)
- [ ] Lint, ESLint, tests all green

## Implementation tasks

- [ ] Verify the bug reproduces — if not, mark this task ~~obsolete~~
- [ ] Read `SessionStatusBanner.tsx` lines 368-408
- [ ] Choose fix: (a) re-read current session from context inside the handler, or (b) early-return if session is null/missing, or (c) ref-based snapshot of session at click time
- [ ] Prefer option (a) — single source of truth
- [ ] Add a defensive `if (!currentSession?.lastResponse?.text) return;` guard at handler entry
- [ ] Verify other handlers in the same file have the same issue (handleEdit, handleShare variants) — fix them too if so, scope-permitting
- [ ] Add a regression test if testing is set up (or note in Follow-ups if blocked by bug 007)
- [ ] Run validation
- [ ] Commit: `fix(web): null-check session in SessionStatusBanner copy handler`

## Verify-first

```bash
gh issue view 913
git log --oneline -20 -- src/web/mobile/SessionStatusBanner.tsx
```

If recent commits already fixed this, mark obsolete.

## Pitfalls

- Don't refactor the whole component — surgical fix only
- The closure pattern may exist in other handlers in the same file. Note them in Follow-ups; fixing all in one PR is fine if scope-light

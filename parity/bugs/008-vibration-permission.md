# Bug 008 — Android vibration permission silent fallback

## Severity

P2 — Android-only polish; users assume haptics are broken when permission is denied.

## What's wrong

In `src/web/hooks/useVoiceInput.ts` (~lines 110-121), the Vibration API call is wrapped in a try/catch that silently no-ops if permission is denied or the API is unavailable. Android users granting permissions piecemeal think haptics are broken.

## Acceptance criteria

- [ ] First call to vibrate: if permission unavailable, show a toast: "Haptics unavailable in this browser."
- [ ] Subsequent calls: silent no-op (we already informed the user)
- [ ] Permission state cached for the session lifetime
- [ ] No regression on browsers where vibration works (iOS Safari, modern Chrome on Android)
- [ ] Lint, ESLint, tests all green

## Implementation tasks

- [ ] Read `useVoiceInput.ts` lines 110-130
- [ ] Add a `hapticsAvailable` ref/state, initialized to `null` (unknown)
- [ ] First vibrate attempt: try, catch — set `hapticsAvailable` to true/false based on outcome
- [ ] If false on first attempt: show single toast (reuse mechanism from bug 002 if landed)
- [ ] Subsequent attempts: short-circuit if `hapticsAvailable === false`
- [ ] Run validation
- [ ] Commit: `fix(web): inform Android users when haptics permission unavailable`

## Verify-first

```bash
git log --oneline -20 -- src/web/hooks/useVoiceInput.ts
```

## Pitfalls

- Don't toast on every render — once per session is plenty
- Don't gate on `userAgent` sniffing — feature-detect via `navigator.vibrate` instead
- This may overlap with bug 002 (voice input errors); coordinate if both are in flight

# Bug 002 — Voice input swallows errors silently

## Severity

P1 — degraded UX; users repeatedly tap a broken feature without feedback.

## What's wrong

In `src/web/hooks/useVoiceInput.ts` (~lines 264-295), error handlers use empty catch blocks (no logging, no user-facing feedback). Speech recognition failures (permission denied, browser unsupported, network error) silently no-op; users don't know the feature is broken.

## Acceptance criteria

- [ ] Permission denied → user sees a toast/notification: "Microphone access denied. Enable in browser settings."
- [ ] Browser unsupported → "Voice input not supported in this browser."
- [ ] Network/transient error → "Voice input failed. Try again."
- [ ] On error, the input button visually returns to idle state (not stuck listening)
- [ ] Existing happy path unaffected
- [ ] Lint, ESLint, tests all green

## Implementation tasks

- [ ] Read `useVoiceInput.ts` lines 230-295 (focus on `onerror`, the `catch` blocks at 266-268, 292-295)
- [ ] Identify a toast/notification mechanism used elsewhere in `src/web/` — reuse it; do NOT add a new toast library
- [ ] Replace silent catches with `captureException` (if Sentry is wired into web — verify in `src/web/` first) OR direct user-facing notification
- [ ] Differentiate error types from the SpeechRecognition API: `not-allowed`, `no-speech`, `network`, `aborted`, etc.
- [ ] Cache permission state once known so we don't re-prompt repeatedly on every tap
- [ ] Run validation
- [ ] Commit: `fix(web): show user-facing errors on voice input failures`

## Verify-first

```bash
git log --oneline -20 -- src/web/hooks/useVoiceInput.ts
grep -r "useVoiceInput" src/web/         # confirm hook is still in use
```

## Pitfalls

- Don't pollute production with `console.error` — use the project's existing error reporting
- Some users may have disabled voice input intentionally — don't toast on every render, only on user-initiated activation that fails

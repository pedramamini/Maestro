# Task 008 — Max-output-lines truncation indicator

## Context

Desktop respects the `maxOutputLines` setting — when output exceeds the cap, it shows a "Output capped at N lines" notice. The setting was recently ported to mobile (synced from desktop), but mobile doesn't display the truncation indicator. Users on mobile see partial output without knowing it's truncated.

## Desktop reference

- `src/renderer/components/TerminalOutput.tsx` — uses `maxOutputLines` from `useSettingsStore`
- The truncation rendering (search for "capped" or "max" within `TerminalOutput.tsx`)

## Web target

- Modify: `src/web/mobile/ResponseViewer.tsx` (or whichever component renders agent output)
- Read: settings broadcast for `maxOutputLines` value

## Acceptance criteria

- [ ] When output is truncated: footer shows "Showing last {N} lines of {total}" with a subtle styling
- [ ] Tap the badge → opens info sheet explaining why (and link to the setting if reachable)
- [ ] When not truncated: no badge
- [ ] Respects user's `maxOutputLines` setting — uses the synced value, not a hardcoded one
- [ ] Lint, ESLint, tests all green

## Implementation tasks

- [ ] Verify `maxOutputLines` is reachable from mobile (search `src/web/` for the setting name)
- [ ] Read desktop's truncation logic in `TerminalOutput.tsx` — copy the truncation math (last N lines)
- [ ] Add the badge to `ResponseViewer.tsx` mobile footer
- [ ] Style: muted text, small caps, doesn't dominate the viewport
- [ ] Run validation
- [ ] Commit: `feat(web): show output truncation indicator on mobile`

## Pitfalls

- Don't truncate twice — if desktop already truncates the broadcast, mobile just renders the warning. If mobile receives full output and renders a window, mobile owns the truncation logic.
- "Total" line count may not be available if desktop pre-truncates — fall back to "Output truncated to {N} lines" without the total
- Setting key name may differ from `maxOutputLines` — verify exact key in `src/shared/settingsMetadata.ts`

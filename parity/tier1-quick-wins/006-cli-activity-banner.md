# Task 006 — Playbook execution status banner (mobile)

## Context

Desktop shows when a session is running a playbook via `CliActivity` payload (`{ playbookId, playbookName, startedAt }`) inside `SessionStateChange` broadcasts. Mobile receives this data but doesn't render it — users see the agent working without knowing it's a playbook run vs. a manual command.

## Desktop reference

- `SessionStateChange` broadcast handler — search for `cliActivity` in `src/main/web-server/` and `src/shared/`
- Wherever desktop renders the "running playbook X" banner (likely a session header indicator)

## Web target

- Modify: `src/web/mobile/SessionStatusBanner.tsx` — add a conditional row for playbook execution state
- (Or new component if banner is already crowded)

## Acceptance criteria

- [ ] When `cliActivity` is present: banner shows "Running: {playbookName}" with elapsed time
- [ ] Elapsed updates every second
- [ ] When playbook ends: banner clears
- [ ] Visually distinct from the regular thinking state (different icon or color tint)
- [ ] Doesn't conflict with task 002 (tool call cards) — it's a banner, not inline content
- [ ] Lint, ESLint, tests all green

## Implementation tasks

- [ ] Search for `cliActivity` and `CliActivity` to confirm the type and where it's broadcast
- [ ] Verify the data lands on the mobile session — `console.log` it once if needed (then remove)
- [ ] Edit `SessionStatusBanner.tsx` to conditionally render the playbook row
- [ ] Add the elapsed-time tick (reuse pattern from task 004 if it landed first)
- [ ] Run validation
- [ ] Commit: `feat(web): show playbook execution banner on mobile`

## Pitfalls

- This file is touched by other tasks (002 tool cards is one possibility) — sequence after parallel batch A merges
- Don't query the desktop for playbook details — `playbookName` should already be in `cliActivity`
- If `cliActivity` doesn't include `playbookName`, surface the gap in a Follow-ups section and use `playbookId` as fallback display

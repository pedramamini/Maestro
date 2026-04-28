# Task 005 — Achievement / Conductor badge card

## Context

Desktop has `AchievementCard` showing a circular SVG progress ring, conductor level, breakdown stats, and download/share buttons. Mobile has nothing — users on mobile can't see their progress. Data is available via `AutoRunStats` and `MaestroUsageStats`, both already cached/broadcast to web.

## Desktop reference

- `src/renderer/components/AchievementCard.tsx`
- `src/shared/` for `AutoRunStats`, `MaestroUsageStats` types

## Web target

- New: `src/web/mobile/MobileAchievementCard.tsx`
- Wire-up: render somewhere in the dashboard view (`AllSessionsView` or a new "Profile" sheet)

## Acceptance criteria

- [ ] Mobile-sized card (no horizontal scroll on 375px viewport)
- [ ] Circular progress ring (SVG, no canvas) with current level + progress to next
- [ ] Stats below: total runs, total tokens, total cost, days active
- [ ] No download/share on mobile (skip the buttons — those are desktop-only file ops)
- [ ] Tap to see breakdown details (separate sheet)
- [ ] Lint, ESLint, tests all green

## Implementation tasks

- [ ] Read desktop `AchievementCard.tsx` — focus on the level calculation logic and SVG ring math (steal it directly)
- [ ] Confirm `AutoRunStats` and `MaestroUsageStats` are accessible from mobile (probably via session context or a stats hook)
- [ ] Build the SVG progress ring — segment count matches desktop's 11 (or whatever current value is)
- [ ] Build the stats grid (2x2 or vertical stack on mobile)
- [ ] Place card in dashboard — find a logical home (above session pills?)
- [ ] Run validation
- [ ] Commit: `feat(web): add Conductor achievement badge to mobile dashboard`

## Pitfalls

- Don't use a charting library — SVG ring is ~30 lines hand-written
- Theme colors must come from CSS vars (themed correctly across user themes)
- Numbers can be huge ("12,345,678 tokens") — use compact formatter from `src/shared/` if it exists, otherwise format inline

## Out of scope

- Download/share (desktop-only — file system access)
- Editing achievements (read-only display)
- Leaderboard registration (Tier 4)

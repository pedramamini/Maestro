# Task 003 — Git status widget (compact mobile)

## Context

Desktop's `GitStatusWidget` shows file counts (+/-), file list with diff bars on hover, and surfaces the working-tree state at a glance. Mobile has nothing. The desktop already broadcasts `isGitRepo` to web, but file change counts may not yet be in the broadcast.

## Desktop reference

- `src/renderer/components/GitStatusWidget.tsx`
- Whatever git context provider feeds it (search for `isGitRepo` usage)

## Web target

- New: `src/web/mobile/MobileGitStatusBadge.tsx` — compact "📝 N" badge in session header
- New: `src/web/mobile/MobileGitStatusSheet.tsx` — modal showing changed files (read-only)
- Possibly modify: `src/main/web-server/` broadcast to include `gitChangedFileCount`

## Acceptance criteria

- [ ] Badge appears in mobile session header only when `isGitRepo === true` and there are changes
- [ ] Tapping the badge opens a modal listing changed files with their status (M/A/D/?)
- [ ] No diff content rendered — file list only (full diffs are heavier; defer to Tier 2)
- [ ] If no changes: badge hidden
- [ ] Read-only — no stage/unstage buttons
- [ ] Lint, ESLint, tests all green

## Implementation tasks

- [ ] Read desktop `GitStatusWidget.tsx` and trace its data source
- [ ] Inspect `src/main/web-server/` to confirm what git data is currently broadcast
- [ ] **Decision point:** if file count + file list is already in the broadcast, frontend-only change. If not, add it minimally to the broadcast payload (and update the `SessionBroadcastData` type in `src/shared/`)
- [ ] Build `MobileGitStatusBadge.tsx`
- [ ] Build `MobileGitStatusSheet.tsx`
- [ ] Wire into mobile session header
- [ ] Run validation
- [ ] Commit: `feat(web): add compact git status widget to mobile`

## Pitfalls

- Avoid running git commands client-side — desktop owns git, web reads broadcast state
- Don't add polling — push-based updates only; subscribe to whatever event already triggers desktop updates
- File counts can be huge in some repos — paginate or cap at first 100 entries with a "+N more" footer

## Out of scope

- Diff viewer (Tier 2)
- Stage/unstage actions (architectural — desktop-only)
- Commit creation (admin-tier)

# PRD 02 — PR Workflow

How work flows from a parity task to a merged contribution upstream.

## Remotes

```
origin    https://github.com/HumpfTech/Maestro.git    (your fork — push here)
upstream  https://github.com/RunMaestro/Maestro.git   (canonical — PR target)
```

## Per-task lifecycle

```
parity-ccpm-planning (this branch, planning docs)
        │
        │  (one branch per task, off origin/main)
        ▼
parity/<task-slug>  ─┐
parity/<task-slug>   │
parity/<task-slug>   ├─→  PR to origin:main (your fork's main, for self-review)
parity/<task-slug>  ─┘
        │
        │  (after squash-merge into origin/main, batch upstream)
        ▼
upstream/main       ─→  PR from HumpfTech:main → RunMaestro:main
```

## Why two-stage (fork main → upstream main)

1. **Self-review buffer.** Catch problems on your fork before exposing them upstream.
2. **Smaller upstream PRs.** Bundle 1-3 related task PRs into one upstream PR with a tight scope.
3. **CI on your fork first.** GitHub Actions run on your fork; failures don't pollute upstream.

## Branch naming

- `parity/<task-slug>` for parity tasks (e.g. `parity/execution-queue-mobile`)
- `fix/web/<bug-slug>` for bug fixes (e.g. `fix/web/session-crash-copy`)

## Commit message conventions

Follow the repo's existing pattern (run `git log --oneline -20` to verify):

- `feat(web): port execution queue indicator to mobile`
- `fix(web): null-check session in SessionStatusBanner copy handler`
- `refactor(web): extract truncation badge into shared util`

## PR description template (per task)

```markdown
## Summary

<1-2 sentences: what changed and why>

Closes parity task: `parity/tier1-quick-wins/001-execution-queue-mobile.md`

## Changes

- <bullet 1>
- <bullet 2>

## Test plan

- [ ] `npm run lint` passes
- [ ] `npm run lint:eslint` passes
- [ ] `npm run test` passes
- [ ] Visually verified at `npm run dev:web` (port 5174)
- [ ] Tested on mobile viewport (375x812)

## Screenshots

<before / after for UI changes>
```

## Upstream PR ("batch") description

When you batch fork→upstream:

```markdown
## Summary

Tier 1 web/mobile parity batch — ports N display features from desktop.

## Tasks merged

- #PR-X — Execution queue indicator
- #PR-Y — Tool call card display
- #PR-Z — Git status widget

## Why

<1 paragraph: what the user gets>

## Test plan

<inherits from individual PRs; spot-check on mobile>
```

## When NOT to PR upstream

- Task turned out to be already-done (cancel the branch, mark task ~~obsolete~~ in the epic)
- Task scope ballooned and the implementation is too large for a clean review (split it, refile)
- CI failing and not yours to fix (file an upstream issue first)

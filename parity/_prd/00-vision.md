# PRD 00 — Vision

## Goal

Bring Maestro's web/mobile interface (`src/web/`) to feature parity with the desktop app (`src/renderer/`) where the architecture allows, and fix outstanding web-app bugs along the way. Land contributions back upstream (`RunMaestro/Maestro:main`) as small, scoped PRs.

## Why now

The web/mobile interface is the user's escape hatch from a workstation — phone in pocket, laptop closed, etc. Today it covers core session interaction (command in, response out, history) but is missing display features that exist on desktop: tool-call rendering, execution queue visibility, git status, achievement display, output truncation indicators, and more. Users routinely hit "I can see the agent is doing something but I don't know what" on mobile.

## Non-goals

- Full settings UI on web (architecture mismatch — IPC-heavy, settings already broadcast read-only)
- Marketplace, Symphony, Leaderboard editors on web (admin-tier features)
- Playbook editor, Process Monitor, worktree management (admin-tier, desktop-anchored)
- Achieving 100% feature parity. Web is mobile-first remote control, not a desktop replacement.

## Success criteria

1. All 8 Tier 1 parity tasks merged to `RunMaestro/Maestro:main`
2. All 8 web-app bug fixes merged
3. No regression in existing web functionality (lint, typecheck, test all green)
4. Each PR is small, focused, and reviewable in <15 minutes by a maintainer

## Architectural ground rules

- **Read-only by default.** Web shows desktop state; desktop owns mutation. The few writes web does (sending commands, reordering queue) go via existing WebSocket message handlers — do not add new write paths casually.
- **Lean on existing data flow.** Most parity gaps are UI-only — the data is already in `SessionData`/`AITabData` broadcasts. If a task requires new desktop→web data, flag it and reconsider effort estimate.
- **Mobile-first.** Touch targets, viewport-aware, no hover-only interactions. Reuse `src/web/components/` primitives (Badge, Button, Card, Input).
- **Code-share via `src/shared/`.** Constants, types, formatters. Do not try to share React components between desktop and mobile — different architectures.

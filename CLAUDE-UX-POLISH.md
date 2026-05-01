# CLAUDE-UX-POLISH.md

Epic summary for the UX Polish epic (epic #182). Covers issues 183–200 (tasks 001–018).

---

## Epic Summary

The UX Polish epic wires consistent, accessible, discoverable UX across Agent Dispatch, Living Wiki, and Delivery Planner. It covers five themes:

| Theme | Issues | Status |
| ---- | ------ | ------ |
| Shared empty-state primitives | 183, 184, 185, 186 | Merged |
| Wizard chapters for new subsystems | 187, 188, 189 | 187 + 189 open |
| Contextual help (? key, tooltips) | 190, 191, 192 | 190 open |
| Error UX hardening | 193, 194 | 193 open |
| Settings discoverability | 193 | open |
| Mintlify documentation | 195, 196, 197, 198, 199 | Merged |
| Tests, docs, validation entry-points | 200 | This PR |

---

## What Was Delivered

### UX Polish 001 — Shared empty-state + inline-help primitives (issue #183)

New shared UI primitives for zero-data states and contextual inline help.

**Files added:**
- `src/renderer/components/ui/EmptyState.tsx` — icon + heading + body + optional CTA button
- `src/renderer/components/ui/EmptyStatePlaceholder.tsx` — lightweight dashed-border variant for panels
- `src/renderer/components/ui/InlineHelp.tsx` — `?` icon that opens a tooltip or modal
- `src/renderer/components/ui/GhostIconButton.tsx` — accessible ghost-icon CTA
- `src/renderer/components/ui/Spinner.tsx` — unified loading spinner
- `src/renderer/components/ui/index.ts` — barrel export for all ui primitives

**Tests:**
- `src/__tests__/renderer/components/ui/EmptyState.test.tsx`
- `src/__tests__/renderer/components/ui/EmptyStatePlaceholder.test.tsx`
- `src/__tests__/renderer/components/ui/InlineHelp.test.tsx`
- `src/__tests__/renderer/components/ui/GhostIconButton.test.tsx`
- `src/__tests__/renderer/components/ui/Spinner.test.tsx`

### UX Polish 002 — Agent Dispatch empty states (issue #184)

First-run and empty-data states wired into the Kanban Board and Fleet View.

**Files changed:**
- `src/renderer/components/AgentDispatch/KanbanBoard.tsx`
- `src/renderer/components/AgentDispatch/FleetView.tsx`
- `src/web/mobile/AgentDispatchBoard.tsx`
- `src/web/mobile/AgentDispatchFleet.tsx`

**Tests added:**
- `src/__tests__/renderer/components/AgentDispatch/EmptyStates.test.tsx`
- `src/__tests__/renderer/components/AgentDispatch/FleetView.test.tsx`
- `src/__tests__/renderer/components/AgentDispatch/KanbanBoard.test.tsx`

### UX Polish 003 — Living Wiki empty states + first-run prompts (issue #185)

Empty state, first-run enroll prompt, and "no results" state in the wiki panel and tree.

**Files changed:**
- `src/renderer/components/LivingWiki/LivingWikiPanel.tsx`
- `src/renderer/components/LivingWiki/WikiTree.tsx`
- `src/web/mobile/LivingWikiReader.tsx`
- `src/web/mobile/LivingWikiView.tsx`

**Tests added:**
- `src/__tests__/renderer/components/LivingWiki/EmptyStates.test.tsx`

### UX Polish 004 — Delivery Planner empty states (issue #186)

Empty state wired into Dashboard (no PRDs) and PlannerShell (no project).

**Files changed:**
- `src/renderer/components/DeliveryPlanner/Dashboard.tsx`
- `src/renderer/components/DeliveryPlanner/PlannerShell.tsx`
- `src/web/mobile/DeliveryPlannerView.tsx`

**Tests added:**
- `src/__tests__/renderer/components/DeliveryPlanner/EmptyStates.test.tsx`

### UX Polish 006 — Wizard chapter: Living Wiki (issue #188)

Tour step and inline wizard chapter for Living Wiki first-run flow.

**Files changed:**
- `src/renderer/components/Wizard/tour/tourSteps.tsx`

**Tests added:**
- `src/__tests__/renderer/components/Wizard/LivingWikiChapter.test.tsx`

### UX Polish 009 — Keyboard shortcuts pass (issue #191)

`goToDispatch`, `goToWiki`, `goToPlanner` keyboard shortcuts added to the main handler and web shortcuts map.

**Files changed:**
- `src/renderer/constants/shortcuts.ts`
- `src/renderer/hooks/keyboard/useMainKeyboardHandler.ts`
- `src/renderer/components/RightPanel.tsx`
- `src/renderer/types/index.ts`
- `src/web/constants/webShortcuts.ts`

**Tests added:**
- `src/__tests__/renderer/constants/shortcuts.test.ts`

### UX Polish 010 — ? key contextual help + tooltip pass (issue #192)

`?` key opens a `ContextualHelpPanel` modal. `InlineHelp` tooltips wired to major subsystem headers.

**Files changed / added:**
- `src/renderer/components/ContextualHelpPanel.tsx` (new)
- `src/renderer/App.tsx`
- `src/renderer/constants/modalPriorities.ts`
- `src/renderer/constants/shortcuts.ts`
- `src/renderer/hooks/keyboard/useMainKeyboardHandler.ts`
- `src/renderer/stores/modalStore.ts`

**Tests added:**
- `src/__tests__/renderer/components/ContextualHelpPanel.test.tsx`

### UX Polish 012 — Error UX hardening (issue #194)

Subsystem init failures (DB init, SSH watcher, coverage gate) surfaced as dismissible toast notifications instead of silent errors.

**Files changed / added:**
- `src/renderer/hooks/ui/useSubsystemInitFailures.ts` (new)
- `src/renderer/stores/notificationStore.ts`
- `src/main/index.ts`

**Tests added:**
- `src/__tests__/renderer/hooks/useSubsystemInitFailures.test.ts`

### UX Polish 013–017 — Mintlify documentation pages (issues #195–199)

Five new user-facing Mintlify pages registered in `docs/docs.json`:

| Issue | Page | File |
| ----- | ---- | ---- |
| #195 | Agent Dispatch | `docs/agent-dispatch.md` |
| #196 | Living Wiki | `docs/living-wiki.md` |
| #197 | Delivery Planner | `docs/delivery-planner.md` |
| #198 | Work Graph CLI | `docs/work-graph-cli.md` |
| #199 | Mobile Parity | `docs/mobile-parity.md` |

---

## Open Tasks (not yet merged)

These UX Polish tasks are tracked as future work.

| Issue | Title |
| ----- | ----- |
| #187 | UX Polish 005: Wizard chapter: Agent Dispatch |
| #189 | UX Polish 007: Wizard chapter: Delivery Planner |
| #190 | UX Polish 008: What's new since v0.16 first-run surface |
| #193 | UX Polish 011: Settings discoverability for new toggles |

---

## File Index (all UX Polish source files)

### Shared UI primitives (`src/renderer/components/ui/`)

| File | Purpose |
| ---- | ------- |
| `EmptyState.tsx` | Full-bleed empty state: icon + heading + body + CTA |
| `EmptyStatePlaceholder.tsx` | Lightweight dashed-border panel variant |
| `InlineHelp.tsx` | Inline `?` help trigger with tooltip/modal |
| `GhostIconButton.tsx` | Accessible ghost-icon button |
| `Spinner.tsx` | Unified loading spinner |
| `index.ts` | Barrel export |

### Subsystem empty-state wiring

| File | Surface |
| ---- | ------- |
| `src/renderer/components/AgentDispatch/KanbanBoard.tsx` | Agent Dispatch kanban |
| `src/renderer/components/AgentDispatch/FleetView.tsx` | Agent Dispatch fleet |
| `src/renderer/components/LivingWiki/LivingWikiPanel.tsx` | Living Wiki panel |
| `src/renderer/components/LivingWiki/WikiTree.tsx` | Wiki tree |
| `src/renderer/components/DeliveryPlanner/Dashboard.tsx` | Delivery Planner dashboard |
| `src/renderer/components/DeliveryPlanner/PlannerShell.tsx` | Delivery Planner shell |
| `src/web/mobile/AgentDispatchBoard.tsx` | Mobile agent dispatch board |
| `src/web/mobile/AgentDispatchFleet.tsx` | Mobile fleet view |
| `src/web/mobile/LivingWikiView.tsx` | Mobile Living Wiki view |
| `src/web/mobile/LivingWikiReader.tsx` | Mobile Living Wiki reader |
| `src/web/mobile/DeliveryPlannerView.tsx` | Mobile Delivery Planner view |

### Wizard + tour

| File | Purpose |
| ---- | ------- |
| `src/renderer/components/Wizard/tour/tourSteps.tsx` | Tour steps including Living Wiki chapter |

### Keyboard + contextual help

| File | Purpose |
| ---- | ------- |
| `src/renderer/constants/shortcuts.ts` | goToDispatch / goToWiki / goToPlanner + `?` shortcut |
| `src/renderer/hooks/keyboard/useMainKeyboardHandler.ts` | Handler wiring |
| `src/renderer/components/ContextualHelpPanel.tsx` | `?` key help panel |
| `src/renderer/constants/modalPriorities.ts` | Modal priority registration |
| `src/web/constants/webShortcuts.ts` | Web shortcut map |

### Error UX hardening

| File | Purpose |
| ---- | ------- |
| `src/renderer/hooks/ui/useSubsystemInitFailures.ts` | Surfaces toast on DB/watcher/coverage-gate init failure |
| `src/renderer/stores/notificationStore.ts` | `notifyToast()` consumer |
| `src/main/index.ts` | IPC emit on subsystem failure |

### Mintlify documentation

| File | Purpose |
| ---- | ------- |
| `docs/agent-dispatch.md` | Agent Dispatch user-facing reference |
| `docs/living-wiki.md` | Living Wiki user-facing reference |
| `docs/delivery-planner.md` | Delivery Planner user-facing reference |
| `docs/work-graph-cli.md` | Work Graph CLI reference |
| `docs/mobile-parity.md` | Mobile parity reference |
| `docs/docs.json` | Navigation registration for all five pages |

### Tests

| File | Covers |
| ---- | ------ |
| `src/__tests__/renderer/components/ui/EmptyState.test.tsx` | EmptyState primitive |
| `src/__tests__/renderer/components/ui/EmptyStatePlaceholder.test.tsx` | EmptyStatePlaceholder |
| `src/__tests__/renderer/components/ui/InlineHelp.test.tsx` | InlineHelp primitive |
| `src/__tests__/renderer/components/ui/GhostIconButton.test.tsx` | GhostIconButton |
| `src/__tests__/renderer/components/ui/Spinner.test.tsx` | Spinner |
| `src/__tests__/renderer/components/AgentDispatch/EmptyStates.test.tsx` | Agent Dispatch empty states |
| `src/__tests__/renderer/components/AgentDispatch/FleetView.test.tsx` | Fleet view |
| `src/__tests__/renderer/components/AgentDispatch/KanbanBoard.test.tsx` | Kanban board |
| `src/__tests__/renderer/components/LivingWiki/EmptyStates.test.tsx` | Living Wiki empty states |
| `src/__tests__/renderer/components/DeliveryPlanner/EmptyStates.test.tsx` | Delivery Planner empty states |
| `src/__tests__/renderer/components/Wizard/LivingWikiChapter.test.tsx` | Living Wiki wizard chapter |
| `src/__tests__/renderer/constants/shortcuts.test.ts` | Keyboard shortcuts |
| `src/__tests__/renderer/components/ContextualHelpPanel.test.tsx` | Contextual help panel |
| `src/__tests__/renderer/hooks/useSubsystemInitFailures.test.ts` | Error UX hook |

---

## Validation Steps

```bash
# 1. Lint (type-check all configs)
npm run lint

# 2. Run all UX Polish audit suites
npm run audit:ux-all

# Equivalently, run each suite individually:
npm run audit:ux-primitives        # EmptyState, InlineHelp, GhostIconButton, Spinner, etc.
npm run audit:ux-empty-states      # AgentDispatch, LivingWiki, DeliveryPlanner empty states
npm run audit:ux-wizard-chapters   # Wizard context, integration, keyboard, LivingWikiChapter

# 3. Full test suite
npm run test

# 4. Web build (catches web/mobile regressions)
npm run build:web
```

### Targeted quick-checks

```bash
# Verify a specific subsystem
npx vitest run src/__tests__/renderer/components/AgentDispatch/EmptyStates.test.tsx
npx vitest run src/__tests__/renderer/components/LivingWiki/EmptyStates.test.tsx
npx vitest run src/__tests__/renderer/components/DeliveryPlanner/EmptyStates.test.tsx

# Verify keyboard shortcuts
npx vitest run src/__tests__/renderer/constants/shortcuts.test.ts

# Verify error UX hook
npx vitest run src/__tests__/renderer/hooks/useSubsystemInitFailures.test.ts
```

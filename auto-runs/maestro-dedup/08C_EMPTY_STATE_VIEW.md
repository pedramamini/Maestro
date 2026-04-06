# Phase 08-C: Extend and Adopt EmptyStateView

## Objective

Extend the existing `EmptyStateView` component (currently used only in `App.tsx:3340`) to accept configurable props, then adopt it across 26+ empty state locations.

**Evidence:** `docs/agent-guides/scans/SCAN-COMPONENTS.md`, "Empty State Pattern Locations"
**Risk:** Low - UI consolidation
**Estimated savings:** ~150 lines

---

## Pre-flight Checks

- [x] Phase 08-B (Spinner) is complete - **All 8 sections checked off, 86 spinning Loader2 instances migrated, 0 raw patterns remain**
- [x] `rtk npm run lint` passes

---

## Tasks

### 1. Read the existing EmptyStateView

- [x] Read `src/renderer/components/EmptyStateView.tsx` to understand its current API and render output
- [x] Note what props it currently accepts and what it renders
  - **Finding:** The existing `EmptyStateView` is a 310-line specialized welcome/landing page component with top bar, hamburger menu, WelcomeContent, and action buttons. It accepts `theme`, `shortcuts`, and 7 callback props. This is NOT a generic empty state - it's the app's "no agents" welcome screen.
  - **Decision:** Created a NEW generic `EmptyState` component in `src/renderer/components/ui/EmptyState.tsx` instead of extending the specialized welcome page. The existing `EmptyStateView` remains untouched (backward-compatible).
  - **Also found:** `UsageDashboard/EmptyState.tsx` - a dashboard-specific empty state with chart illustration. Kept as-is since it serves a different purpose.

### 2. Survey existing empty state patterns

- [x] Run: `rtk grep "No .* found|No .* available|No .* yet|Nothing to show|Empty|Get started" src/renderer/components/ --glob "*.tsx"` - **129 matches across 40+ files**
- [x] Categorize patterns: icon+message, icon+message+action button, centered message only, message+subtitle
  - **A. Centered message only (12 sites):** AboutModal, GitLogViewer, GroupChatList, LogViewer, ShortcutsHelpModal, QuickActionsModal, TerminalOutput, TabSwitcherModal, CueModal/ActivityLog, DocumentsPanel, UsageDashboard charts (7)
  - **B. Icon + message (6 sites):** FileExplorerPanel, DocumentGraphView, SessionList, MarketplaceModal, AgentSessionsBrowser, AutoRunStats
  - **C. Icon + message + description (3 sites):** GroupChatRightPanel, GroupChatHistoryPanel, AutoRunStats (empty state)
  - **D. Message + action (2 sites):** HistoryPanel, DocumentGenerationView
  - **E. Complex/unique (skipped):** WorktreeRunSection (uses `<option>` element, not visual empty state)

### 3. Create generic EmptyState component with flexible props

- [x] Created `src/renderer/components/ui/EmptyState.tsx` with props: `theme` (Theme), `icon` (ReactNode), `message` (string, required), `description` (string, optional), `action` (`{ label: string; onClick: () => void }`, optional), `className` (string, optional), `testId` (string, optional)
- [x] Implement conditional rendering for each optional prop - icon wrapped in `mb-3 opacity-30`, description in `text-xs mt-1`, action button with accent color
- [x] Ensure backward compatibility with existing usage in `App.tsx:3340` - **Preserved: existing `EmptyStateView` component untouched, new generic `EmptyState` is a separate component in `ui/`**
- [x] Exported `EmptyState`, `EmptyStateProps`, `EmptyStateAction` from `ui/index.ts`

### 4. Write tests for all prop combinations

- [x] Created tests at `src/__tests__/renderer/components/ui/EmptyState.test.tsx` - **14 tests**
- [x] Test message-only rendering - **3 tests: renders text, applies textDim color, no icon/description/action rendered**
- [x] Test icon + message rendering - **2 tests: icon present, opacity-30 wrapper**
- [x] Test icon + message + description rendering - **2 tests: all elements present, description has text-xs**
- [x] Test full props: icon + message + description + action button - **1 test: all 4 elements render**
- [x] Test action button `onClick` fires correctly - **2 tests: onClick fires, accent color applied**
- [x] Test className passthrough - **2 tests: extra classes applied, flex centering always present**
- [x] Test custom testId - **1 test: custom data-testid applied**
- [x] Run tests: `CI=1 rtk vitest run src/__tests__/renderer/components/ui/EmptyState.test.tsx` - **14/14 pass**

### 5. Migrate empty state locations (26+ sites)

- [x] Start with the simplest cases (message-only) and replace inline markup with `<EmptyState message="..." />`
  - **Batch 1 (10 files):** AboutModal, GitLogViewer, LogViewer, ShortcutsHelpModal, QuickActionsModal, TerminalOutput, CueModal/ActivityLog, DocumentsPanel, GroupChatList, TabSwitcherModal
- [x] Migrate icon+message patterns: `<EmptyState icon={<SomeIcon />} message="..." />`
  - **Batch 2 (8 files):** FileExplorerPanel, DocumentGraphView, SessionList, MarketplaceModal, GroupChatRightPanel, GroupChatHistoryPanel, MergeSessionModal, SendToAgentModal
- [x] Migrate remaining patterns with descriptions and actions
  - **Batch 3 (13 files):** HistoryPanel, DirectorNotes/UnifiedHistoryTab, DocumentGenerationView, AgentComparisonChart, AgentUsageChart, AgentEfficiencyChart, DurationTrendsChart, LocationDistributionChart, PeakHoursChart, SourceDistributionChart, WeekdayComparisonChart, AutoRunStats (2 sites), AgentSessionsBrowser
- [x] Run targeted tests after each batch of migrations - **All batches compile cleanly, 0 new test failures**
- **WorktreeRunSection skipped:** uses `<option>` element (not a visual empty state)
- **Total: 33 `<EmptyState>` usages across 31 migrated files** (AutoRunStats has 2 sites)

### 6. Verify full build

- [x] Run lint: `rtk npm run lint` - **passes**
- [x] Run tests: `CI=1 rtk vitest run` - **23,416 passed, 55 failed (all pre-existing), 0 new failures from EmptyState migration**
- [x] Verify types: `rtk tsc -p tsconfig.main.json --noEmit && rtk tsc -p tsconfig.lint.json --noEmit` - **both pass**

---

## Verification

After completing changes, run targeted tests for the files you modified:

```bash
CI=1 rtk vitest run <path-to-relevant-test-files>
```

**Rule: Zero new test failures from your changes.** Pre-existing failures on the baseline are acceptable.

Find related test files:

```bash
rtk grep "import.*from.*<module-you-changed>" --glob "*.test.*"
```

Also verify types:

```bash
rtk tsc -p tsconfig.main.json --noEmit
rtk tsc -p tsconfig.lint.json --noEmit
```

---

## Success Criteria

- `EmptyStateView` extended with icon, description, action props
- 26+ inline empty states replaced
- Tests cover all variants
- Lint and tests pass

# Phase 07-B: Replace sessions.find with Store Selectors

## Objective

Replace 71 inline `sessions.find(s => s.id === ...)` calls with the existing store selectors `getActiveSession` and `getSessionById`.

**Evidence:** `docs/agent-guides/scans/SCAN-STATE.md`, "sessions.find calls"
**Risk:** Low - replacing inline lookups with equivalent store selectors
**Estimated savings:** ~100 lines

---

## Pre-flight Checks

- [x] Phase 07-A (session update helpers) is complete
- [x] `rtk npm run lint` passes

---

## Tasks

### 1. Verify store selectors exist

- [x] Read `src/renderer/stores/sessionStore.ts` and confirm `getActiveSession` exists (~line 320)
- [x] Confirm `getSessionById` exists (~line 331) and takes an ID, returns session or undefined
- [x] Note the exact import paths and function signatures

**Findings (Task 1):**
- The actual names are `selectActiveSession` (line 412) and `selectSessionById` (line 421), not `getActiveSession`/`getSessionById`.
- `selectActiveSession`: `(state: SessionStore) => Session | null` - finds session matching `state.activeSessionId`, falls back to first session, then null.
- `selectSessionById`: `(id: string) => (state: SessionStore) => Session | undefined` - curried selector, finds session by ID.
- Both exported from `src/renderer/stores/sessionStore.ts`.
- A private `getActiveSession()` helper exists in `tabStore.ts:242` that calls `selectActiveSession(useSessionStore.getState())`.
- Usage in hooks/components: `useSessionStore(selectActiveSession)` or `useSessionStore(selectSessionById(id))`.
- Usage in callbacks: `selectActiveSession(useSessionStore.getState())` or `selectSessionById(id)(useSessionStore.getState())`.

### 2. Find all inline sessions.find calls

- [x] Run: `rtk grep "sessions\.find" src/ --glob "*.{ts,tsx}"` (exclude `__tests__` and `sessionStore`)
- [x] Count total instances and categorize by pattern (active session lookup vs specific ID lookup)

**Findings (Task 2):**

Total `sessions.find` calls across all `src/**/*.{ts,tsx}`: **178** (across 54 files)
- In `__tests__/`: 84 calls (across 14 test files) - excluded from migration scope
- In `sessionStore.ts`: 2 calls (canonical definitions) - excluded
- `sessions.findIndex` calls: 4 (in `useKeyboardNavigation.ts`) - not `sessions.find`, excluded

**Production code `sessions.find` calls: 88** (across 38 files)

Categorized by pattern:

| Pattern | Count | Files | Selector replacement |
|---------|-------|-------|---------------------|
| **A. Active session lookup** (`s.id === activeSessionId`) | 30 | 8 files | `selectActiveSession` |
| **B. Active session (variant)** (`x.id === s.activeSessionId` in zustand selector) | 1 | RightPanel.tsx | `selectActiveSession` |
| **C. Wizard re-lookups** (`s.id === activeSession?.id`) | 9 | useWizardHandlers.ts | Remove - already in scope |
| **D. Specific ID lookups** (`s.id === someVariable`) | 36 | 24 files | `selectSessionById(id)` |
| **E. Non-standard lookups** (by name, sessionId prop, startsWith, projectRoot, complex) | 12 | 7 files | Not replaceable with standard selectors |
| **Total** | **88** | **38 files** | |

**Active session hotspots (Pattern A - 30 calls):**
- `useTabHandlers.ts`: 21 calls (biggest single file - all `s.id === activeSessionId`)
- `useFileTreeManagement.ts`: 3 calls
- `AppModals.tsx`, `ExecutionQueueBrowser.tsx`, `QuickActionsModal.tsx`: 1 each
- Web: `SessionPillBar.tsx`, `useSessions.ts`, `useMobileSessionManagement.ts`: 1 each

**Specific ID hotspots (Pattern D - 36 calls):**
- `QuickActionsModal.tsx`: 3 calls
- `web-server-factory.ts` (main process): 3 calls
- `storage.ts` (CLI), `AllSessionsView.tsx`, `SessionList.tsx`, `useSessionCrud.ts`, `list-playbooks.ts`, `useSessions.ts`, `useMobileSessionManagement.ts`: 2 each
- 15 other files: 1 each

**Non-standard lookups (Pattern E - 12 calls, NOT candidates for standard selectors):**
- `yamlToPipeline.ts`: 3 by `s.name`, 1 by `s.id`
- `group-chat-router.ts`: 4 complex multi-field matching
- `AgentSessionsBrowser.tsx`: 1 by `s.sessionId` (not `s.id`)
- `usePipelineState.ts`: 1 by `s.projectRoot` (truthy check)
- `AgentUsageChart.tsx`: 1 by `sessionId.startsWith(s.id)`
- `useGroupChatHandlers.ts`: 1 complex matching

**Note:** The original estimate of 71 inline calls was conservative. Actual count is 88, or 76 if excluding the 12 non-standard lookups. The `useTabHandlers.ts` file alone accounts for 21 calls (Task 6 targets these). The CLI (6 calls) and main process (7 calls) files don't have access to zustand store selectors - they use their own `sessions` arrays passed as parameters.

### 3. Migrate activeSession re-derivations (28 files)

- [x] For files using hooks: replace `sessions.find(s => s.id === activeSessionId)` with `getActiveSession()` or the equivalent store selector
- [x] For files in callbacks/event handlers: replace `useSessionStore.getState().sessions.find(...)` with `getActiveSession()`
- [x] Run targeted tests after each batch of files

**Findings (Task 3):**
Migrated 5 `sessions.find(s => s.id === activeSessionId)` calls across 3 files to use `selectActiveSession` or the pre-computed `activeSession` parameter:

| File | Change | Calls replaced |
|------|--------|---------------|
| `AppModals.tsx` | `useMemo(sessions.find(...))` replaced with `useSessionStore(selectActiveSession)` | 1 |
| `RightPanel.tsx` | Inline zustand selector `(s) => s.sessions.find(...)` replaced with `selectActiveSession` | 1 |
| `useFileTreeManagement.ts` | 3 effect-internal `sessions.find(...)` replaced with pre-computed `activeSession` parameter; deps arrays tightened from `[sessions, activeSessionId]` to `[activeSession]` | 3 |

**Not migrated (prop-based or different store):**
- `QuickActionsModal.tsx`: Receives `sessions`/`activeSessionId` as props - not store-driven. Attempted migration but reverted: breaks 38 tests that mock via props.
- `ExecutionQueueBrowser.tsx`: Fully prop-driven, no store import.
- `SessionPillBar.tsx`, `useMobileSessionManagement.ts`, `useSessions.ts` (web): Web files using different state management, no zustand access.

All 274 targeted tests pass. Lint passes.

### 4. Migrate specific-ID lookups (43 calls)

- [x] Replace `sessions.find(s => s.id === someId)` with `getSessionById(someId)` in each file
- [x] Run targeted tests: `CI=1 rtk vitest run <relevant-test>`

**Findings (Task 4):**
Migrated 6 `sessions.find(s => s.id === someId)` calls across 4 renderer files to use `selectSessionById`:

| File | Change | Calls replaced |
|------|--------|---------------|
| `agentStore.ts` | `getSession()` helper body: `useSessionStore.getState().sessions.find(...)` replaced with `selectSessionById(sessionId)(useSessionStore.getState())` | 1 |
| `useSessionCrud.ts` | `deleteSession` callback and `finishRenamingSession` callback: `.sessions.find(...)` replaced with `selectSessionById(id)(useSessionStore.getState())` | 2 |
| `BatchRunnerModal.tsx` | Inline zustand selector `(state) => state.sessions.find(...)` replaced with `selectSessionById(sessionId)` | 1 |
| `useModalHandlers.ts` | Removed `sessions` reactive subscription (only used for errorSession lookup) + `useMemo` block; replaced with direct `useSessionStore(selectSessionById(...))` selector. Also removed unused `useMemo` import. | 1 (+ eliminated unnecessary full-sessions subscription) |

**Not migrated (by design):**
- `useCycleSession.ts:183`: `sessions` is already subscribed to and needed for 6+ other operations (filtering, mapping) in the same callback; the `.find` is inside a `.filter()` loop where calling the selector repeatedly offers no benefit over the already-available array.
- CLI files (`storage.ts`, `run-playbook.ts`, `list-sessions.ts`, `list-playbooks.ts`): No zustand store access; use local `sessions` arrays passed as parameters.
- Main process files (`web-server-factory.ts`): No zustand store access; use local `sessions` arrays.
- Web/mobile files (`App.tsx`, `AllSessionsView.tsx`, `ContextManagementSheet.tsx`, `SessionPillBar.tsx`, `useSessions.ts`, `useMobileSessionManagement.ts`): Different state management, no zustand.

All 335 targeted tests pass.

### 5. Fix wizard re-lookups (8 wasteful re-finds)

- [x] Identify the 8 instances in wizard code where `activeSession` is re-found despite already being in scope
- [x] Remove redundant lookups and use the existing variable
- [x] Run wizard tests: `CI=1 rtk vitest run` (filter for wizard test files)

**Findings (Task 5):**
Found 9 `sessions.find(s => s.id === activeSession?.id)` re-lookups in `useWizardHandlers.ts` (1 more than the estimated 8). All were redundant since `activeSession` is already reactively subscribed via `useSessionStore(selectActiveSession)` at line 157.

| Location | Handler | Replacement |
|----------|---------|-------------|
| `useEffect` (slash command discovery) | Effect body | Used `activeSession` directly (reactive value is fresh for the current render) |
| `sendWizardMessageWithThinking` | useCallback | `selectActiveSession(useSessionStore.getState())` |
| `handleHistoryCommand` | useCallback | `selectActiveSession(useSessionStore.getState())` |
| `handleSkillsCommand` | useCallback | `selectActiveSession(useSessionStore.getState())` |
| `handleWizardCommand` | useCallback | `selectActiveSession(useSessionStore.getState())` |
| `handleLaunchWizardTab` | useCallback | `selectActiveSession(useSessionStore.getState())` |
| `handleWizardComplete` | useCallback | `selectActiveSession(useSessionStore.getState())` |
| `handleWizardLetsGo` | useCallback | `selectActiveSession(useSessionStore.getState())` |
| `handleToggleWizardShowThinking` | useCallback | `selectActiveSession(useSessionStore.getState())` |

Strategy: For the `useEffect`, used `activeSession` directly since the effect re-runs when the reactive value changes. For `useCallback` bodies, used `selectActiveSession(useSessionStore.getState())` to get fresh state at callback execution time (closures may be stale).

All 246 wizard-related tests pass (67 useWizardHandlers + 179 other wizard tests).

### 6. Fix useTabHandlers.ts (13 identical finds)

- [x] Read `useTabHandlers.ts` to find all 13 `sessions.find` calls
- [x] Hoist a single lookup to the top of each function/handler and reuse throughout
- [x] Run tab handler tests: `CI=1 rtk vitest run` (filter for tab handler test files)

**Findings (Task 6):**
Found 21 `sessions.find(s => s.id === activeSessionId)` calls (not the estimated 13) across 21 callbacks in `useTabHandlers.ts`. All were the identical pattern of destructuring `{ sessions, activeSessionId }` from `useSessionStore.getState()` and then doing `sessions.find(s => s.id === activeSessionId)`.

Replaced all 21 with `selectActiveSession(useSessionStore.getState())`, which was already imported at line 27. Where callbacks also used `activeSessionId` for `updateAiTab()`, `updateSessionWith()`, or `setSessions` updater guards, replaced with `session.id` (safe after the null guard).

| Handler | Calls replaced |
|---------|---------------|
| `handleCloseFileTab` | 1 |
| `handleReloadFileTab` | 1 |
| `handleSelectFileTab` | 1 (also replaced `activeSessionId` in setSessions updater with `currentSession.id`) |
| `handleTabClose` | 1 |
| `handleCloseAllTabs` | 1 |
| `handleCloseOtherTabs` | 1 |
| `handleCloseTabsLeft` | 1 |
| `handleCloseTabsRight` | 1 |
| `handleCloseCurrentTab` | 1 (also replaced `activeSessionId` in setSessions updater with `session.id`) |
| `handleDeleteLog` | 1 |
| `handleRequestTabRename` | 1 (also replaced `activeSessionId` in `updateAiTab` with `session.id`) |
| `handleTabStar` | 1 (also replaced `activeSessionId` in `updateSessionWith` with `session.id`) |
| `handleToggleTabReadOnlyMode` | 1 (also replaced `activeSessionId` in `updateAiTab` with `session.id`) |
| `handleToggleTabSaveToHistory` | 1 (also replaced `activeSessionId` in `updateAiTab` with `session.id`) |
| `handleToggleTabShowThinking` | 1 (also replaced `activeSessionId` in `updateAiTab` with `session.id`) |
| `handleScrollPositionChange` | 1 (also replaced `activeSessionId` in `updateAiTab`/`updateSessionWith` with `session.id`) |
| `handleAtBottomChange` | 1 (also replaced `activeSessionId` in `updateAiTab` with `session.id`) |
| `handleClearFilePreviewHistory` | 1 |
| `handleFileTabNavigateBack` | 1 |
| `handleFileTabNavigateForward` | 1 |
| `handleFileTabNavigateToIndex` | 1 |
| **Total** | **21** |

**Not changed:** Callbacks that use `activeSessionId` only within `setSessions` updater functions (e.g., `handleTabSelect`, `forceCloseFileTab`, `performCloseAllTabs`, etc.) - these don't do a `sessions.find` and correctly reference `activeSessionId` at the time the updater runs.

All 86 useTabHandlers tests pass. 2 pre-existing failures in unrelated files (useInputMode, useLayerStack).

### 7. Consolidate getSshRemoteById (6 definitions, 5 redundant)

- [ ] Verify canonical location: `main/stores/getters.ts:115`
- [ ] Remove local copy in `agentSessions.ts:82` and replace with import
- [ ] Remove local copy in `agents.ts:202` and replace with import
- [ ] Remove local copy in `autorun.ts:43` and replace with import
- [ ] Remove local copy in `git.ts:54` and replace with import
- [ ] Remove local copy in `marketplace.ts:66` and replace with import
- [ ] Run targeted tests for each changed file

### 8. Verify full build

- [ ] Run lint: `rtk npm run lint`
- [ ] Run tests: `CI=1 rtk vitest run`
- [ ] Verify types: `rtk tsc -p tsconfig.main.json --noEmit && rtk tsc -p tsconfig.lint.json --noEmit`

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

- 71 inline `sessions.find` calls replaced with store selectors
- 8 wizard re-lookups eliminated
- 5 redundant `getSshRemoteById` definitions removed
- Lint and tests pass

# Phase 01-B: Remove Dead Store Selectors

## Objective

Remove 53 exported store selectors/helpers that have zero external references. These exports exist in store files but are never imported anywhere.

**Evidence:** `docs/agent-guides/scans/SCAN-DEADCODE.md`, "Dead Store Selectors"
**Risk:** Very low - exports have zero external references. Store files remain (only removing unused exports).
**Estimated savings:** ~200 lines across 9 store files

---

## Pre-flight Checks

- [x] Phase 01-A (dead components) is complete (all 7 files deleted, committed)
- [x] `rtk npm run lint` passes
- [x] `rtk vitest run` passes (7 pre-existing failures in main/shared unrelated to stores)

---

## Tasks

### Task 1: Remove dead exports from agentStore.ts

- [x] Completed 2026-04-02. All 4 exports removed: `selectAvailableAgents`, `selectAgentsDetected`, `getAgentState`, `getAgentActions`. Test file updated.

### Task 2: Remove dead exports from batchStore.ts

- [x] Completed 2026-04-02. All 3 exports removed: `selectStoppingBatchSessionIds`, `selectBatchRunState`, `getBatchActions`. Test file updated.

### Task 3: Remove dead exports from fileExplorerStore.ts

- [x] Completed 2026-04-02. Both exports removed: `getFileExplorerState`, `getFileExplorerActions`. Test file updated.

### Task 4: Remove dead exports from groupChatStore.ts

- [x] Completed 2026-04-02. Both exports removed: `getGroupChatState`, `getGroupChatActions`. Test file updated.

### Task 5: Remove dead exports from modalStore.ts

- [x] Completed 2026-04-02. `selectModal` removed. `selectModalOpen` was NOT removed - it is actively used in `AppSessionModals.tsx` and internally via `useModalSelectors()`. The scan was incorrect for this export. 1 of 2 removed.

### Task 6: Remove dead exports from notificationStore.ts

- [x] Completed 2026-04-02. All 6 exports removed: `selectToasts`, `selectToastCount`, `selectConfig`, `resetToastIdCounter`, `getNotificationState`, `getNotificationActions`. Test file updated (counter test rewritten to not depend on absolute counter values).

### Task 7: Remove dead exports from operationStore.ts

- [x] Completed 2026-04-02. All 3 exports removed: `selectIsAnyOperationInProgress`, `getOperationState`, `getOperationActions`. Test file updated.

### Task 8: Remove dead exports from sessionStore.ts

- [x] Completed 2026-04-02. All 9 exports removed: `selectBookmarkedSessions`, `selectSessionsByGroup`, `selectUngroupedSessions`, `selectGroupById`, `selectSessionCount`, `selectIsReady`, `selectIsAnySessionBusy`, `getSessionState`, `getSessionActions`. Test file updated (initialization flow test rewritten to use store state directly).

### Task 9: Remove dead exports from settingsStore.ts

- [x] Completed 2026-04-02. All 11 exports handled:
  - 8 DEFAULT_* constants: `export` keyword removed (constants kept for internal use)
  - `getBadgeLevelForTime`: `export` keyword removed (function kept for internal use)
  - `getSettingsState`, `getSettingsActions`: fully removed
  - 4 test files updated: `settingsStore.test.ts`, `useSettings.test.ts`, `fonts-and-sizing.test.ts`, `SessionList.test.tsx` - replaced constant imports with `useSettingsStore.getState()` pattern.

### Task 10: Remove dead exports from tabStore.ts

- [x] Completed 2026-04-02. All 12 exports removed: `selectActiveTab`, `selectActiveFileTab`, `selectUnifiedTabs`, `selectTabById`, `selectFileTabById`, `selectTabCount`, `selectAllTabs`, `selectAllFileTabs`, `selectActiveTerminalTab`, `selectTerminalTabs`, `getTabState`, `getTabActions`. Unused type imports (`UnifiedTab`, `TerminalTab`) and utility imports (`getActiveTab`, `buildUnifiedTabs`) also cleaned up. Test file updated.

### Task 11: Verify - lint and tests pass

- [x] Completed 2026-04-02. Lint passes (tsc -p tsconfig.lint.json and tsconfig.main.json). All store-related tests pass (139/139 for affected stores). 7 pre-existing test failures remain in unrelated areas (cue-executor, cue-yaml-loader, agents handler, filesystem handler, pathResolver, messageHandlers, pathUtils) - none reference any removed exports.

---

## Verification

After completing changes, run targeted tests for the files you modified:

```bash
rtk vitest run <path-to-relevant-test-files>
```

**Rule: Zero new test failures from your changes.** Pre-existing failures on the baseline are acceptable. If a test you didn't touch starts failing, investigate whether your refactoring broke it. If your change removed code that a test depended on, update that test.

Do NOT run the full test suite (it takes too long). Only run tests relevant to the files you changed. Use `rtk grep` to find related test files:

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

- 53 dead exports removed across 9 store files
- No new lint errors
- All tests pass
- Store files still contain all their USED exports

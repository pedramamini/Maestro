# Phase 07-A: Extract Session Update Helpers

## Objective

Extract `updateAiTab()` and `updateActiveAiTab()` helpers into `sessionStore.ts` to replace 82 instances of nested `aiTabs.map`/`aiTabs.filter` calls inside `setSessions` updaters across 25 files. Also eliminate 14+ `setSessions` prop-drilling sites.

**Evidence:** `docs/agent-guides/scans/SCAN-BLOCKS.md`, "Nested aiTabs.map Calls" and "setSessions Calls by File"
**Risk:** Medium - touches core state management. Must verify each migration preserves exact behavior.
**Estimated savings:** ~600 lines (400 from nested maps + 200 from prop-drilling)

---

## Pre-flight Checks

- [ ] Phase 06 (SpecKit/OpenSpec) is complete
- [ ] `rtk npm run lint` passes
- [ ] `rtk vitest run` passes

---

## Important Context

The current pattern everywhere:

```typescript
setSessions((prev) =>
	prev.map((s) =>
		s.id === sessionId
			? {
					...s,
					aiTabs: s.aiTabs.map((tab) => (tab.id === tabId ? { ...tab, someField: newValue } : tab)),
				}
			: s
	)
);
```

This should become:

```typescript
updateAiTab(sessionId, tabId, (tab) => ({ ...tab, someField: newValue }));
```

---

## Tasks

### 1. Design and add helper API to sessionStore

- [ ] Read `src/renderer/stores/sessionStore.ts` to understand existing store shape
- [ ] Add `updateAiTab(sessionId, tabId, updater)` function that uses `useSessionStore.setState` with nested `sessions.map` + `aiTabs.map`
- [ ] Add `updateActiveAiTab(sessionId, updater)` function that maps over `aiTabs` using `s.activeTabId` to find the active tab
- [ ] Add `updateSession(sessionId, updater)` function that maps over `sessions` by ID
- [ ] Export all three functions from `src/renderer/stores/sessionStore.ts`

### 2. Write unit tests for the helpers

- [ ] Create `src/__tests__/renderer/stores/sessionStoreHelpers.test.ts`
- [ ] Test `updateAiTab` modifies the correct tab and leaves others unchanged
- [ ] Test `updateAiTab` with non-existent session ID is a no-op
- [ ] Test `updateActiveAiTab` modifies only the active tab
- [ ] Test `updateSession` modifies the correct session
- [ ] Test immutability: original state object is not mutated
- [ ] Run tests: `rtk vitest run src/__tests__/renderer/stores/sessionStoreHelpers.test.ts`

### 3. Migrate top offender files (6 files, 49 calls)

- [ ] Migrate `useWizardHandlers.ts` (12 nested aiTabs.map calls)
- [ ] Migrate `useInputProcessing.ts` (10 calls)
- [ ] Migrate `useTabHandlers.ts` (8 calls)
- [ ] Migrate `useAgentListeners.ts` (8 calls)
- [ ] Migrate `useInterruptHandler.ts` (6 calls)
- [ ] Migrate `useBatchedSessionUpdates.ts` (5 calls)
- [ ] For each file: read, replace `setSessions` + `aiTabs.map` with the appropriate helper, verify with `rtk vitest run <relevant-test>`

### 4. Migrate remaining 19 files

- [ ] Find all remaining files: `rtk grep "setSessions.*prev.*map" src/ --glob "*.{ts,tsx}"`
- [ ] For each file: replace `setSessions(prev => prev.map(` patterns with `updateSession`, `updateAiTab`, or `updateActiveAiTab`
- [ ] If an updater does something the helpers don't cover (e.g., updates multiple tabs), keep inline or create a new helper
- [ ] Run targeted tests after each file: `rtk vitest run <relevant-test>`

### 5. Eliminate setSessions prop-drilling (14+ sites)

- [ ] Convert `useTabHandlers.ts` (68 setSessions calls) to use store directly
- [ ] Convert `useWizardHandlers.ts` (25 calls) to use store directly
- [ ] Convert `App.tsx` (22 calls) to use store directly
- [ ] Convert `useInputProcessing.ts` (18 calls) to use store directly
- [ ] Convert `useFileTreeManagement.ts` (18 calls) to use store directly
- [ ] Convert `useRemoteIntegration.ts` (17 calls) to use store directly
- [ ] Convert remaining prop-drilling sites to import helpers from `sessionStore` directly

### 6. Remove setSessions from component prop interfaces

- [ ] Work bottom-up from leaf components: remove `setSessions` from each props interface after migration
- [ ] Remove the prop from parent JSX where it was being passed
- [ ] Verify no TypeScript errors: `rtk tsc -p tsconfig.main.json --noEmit`

### 7. Verify full build

- [ ] Run lint: `rtk npm run lint`
- [ ] Run tests: `rtk vitest run`
- [ ] Verify types: `rtk tsc -p tsconfig.main.json --noEmit && rtk tsc -p tsconfig.lint.json --noEmit`

### 8. Verify reduction in duplication

- [ ] Count remaining setSessions: `rtk grep "setSessions" src/ --glob "*.{ts,tsx}" | wc -l` (exclude `__tests__` and `sessionStore`)
- [ ] Count remaining aiTabs.map: `rtk grep "aiTabs\.map" src/ --glob "*.{ts,tsx}" | wc -l` (exclude `__tests__` and `sessionStore`)
- [ ] Both counts should be significantly reduced from baseline

---

## Verification

After completing changes, run targeted tests for the files you modified:

```bash
rtk vitest run <path-to-relevant-test-files>
```

**Rule: Zero new test failures from your changes.** Pre-existing failures on the baseline are acceptable. If a test you didn't touch starts failing, investigate whether your refactoring broke it.

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

- `updateAiTab`, `updateActiveAiTab`, `updateSession` helpers in sessionStore
- 82 nested `aiTabs.map` patterns replaced with helper calls
- 14+ prop-drilling sites eliminated
- Unit tests for new helpers
- Lint and tests pass

# Phase 13-C: Split Oversized Test Files

## Objective

Address 28 test files exceeding 2,000 lines. Many will shrink naturally after Phase 03 (mock consolidation). Focus on the worst offenders that remain oversized.

**Evidence:** `docs/agent-guides/scans/SCAN-OVERSIZED.md`, "Test Files Over 2000 Lines"
**Risk:** Zero production risk - test-only changes
**Estimated savings:** Improved test maintainability

---

## Pre-flight Checks

- [ ] Phase 13-B (other oversized files) is complete
- [ ] Phase 03 (mock consolidation) is complete
- [ ] `rtk vitest run` passes

---

## Tasks

### 1. Re-measure after mock consolidation

- [ ] Run: `find src/__tests__/ -name "*.test.*" | xargs wc -l | sort -rn | head -30`
- [ ] Only target files still over 2,000 lines
- [ ] Document which files still need splitting

### 2. Split symphony.test.ts (was 6,203 lines)

- [ ] Read the test file to identify logical test groups
- [ ] Extract creation flow tests into `symphony.create.test.ts`
- [ ] Extract participant management tests into `symphony.participants.test.ts`
- [ ] Extract message handling tests into `symphony.messages.test.ts`
- [ ] Extract export/history tests into `symphony.export.test.ts`
- [ ] Ensure shared setup/mocks are imported from a common file
- [ ] Run: `rtk vitest run` (filter for symphony test files)

### 3. Split useBatchProcessor.test.ts (was 5,988 lines)

- [ ] Read the test file to identify logical test groups
- [ ] Extract lifecycle tests into `useBatchProcessor.lifecycle.test.ts`
- [ ] Extract execution tests into `useBatchProcessor.execution.test.ts`
- [ ] Extract worktree tests into `useBatchProcessor.worktree.test.ts`
- [ ] Extract error handling tests into `useBatchProcessor.errors.test.ts`
- [ ] Run: `rtk vitest run` (filter for batch processor test files)

### 4. Split TabBar.test.tsx (was 5,752 lines)

- [ ] Read the test file to identify logical test groups
- [ ] Extract AI tab tests into `TabBar.aiTabs.test.tsx`
- [ ] Extract file tab tests into `TabBar.fileTabs.test.tsx`
- [ ] Extract drag-and-drop tests into `TabBar.dragDrop.test.tsx`
- [ ] Extract keyboard navigation tests into `TabBar.keyboard.test.tsx`
- [ ] Run: `rtk vitest run` (filter for TabBar test files)

### 5. Create shared test utilities if patterns emerge

- [ ] During splitting, identify common test setup/render patterns
- [ ] If common render setup exists: extract to `src/__tests__/helpers/renderWithProviders.ts`
- [ ] If common assertions exist: extract to `src/__tests__/helpers/testUtils.ts`
- [ ] Update split test files to import from shared utilities

### 6. Verify all tests pass after splitting

- [ ] Run full test suite: `rtk vitest run`
- [ ] Run lint: `rtk npm run lint`
- [ ] Verify types: `rtk tsc -p tsconfig.main.json --noEmit && rtk tsc -p tsconfig.lint.json --noEmit`

### 7. Count remaining oversized test files

- [ ] Run: `find src/__tests__/ -name "*.test.*" | xargs wc -l | awk '$1 > 2000' | wc -l`
- [ ] Target: fewer than 10 files over 2,000 lines

---

## Verification

After completing changes, run targeted tests for the files you modified:

```bash
rtk vitest run <path-to-relevant-test-files>
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

- Worst offender test files split into focused modules
- Shared test utilities extracted where applicable
- All tests pass
- Fewer than 10 test files over 2,000 lines

# Phase 13-B: Decompose Other Oversized Files

## Objective

Address the remaining oversized files after App.tsx. Priority targets are files over 2,000 lines that contain significant duplication identified in earlier phases.

**Evidence:** `docs/agent-guides/scans/SCAN-OVERSIZED.md`
**Risk:** Medium-high - these are complex files. Work incrementally.
**Estimated savings:** Improved maintainability

---

## Pre-flight Checks

- [ ] Phase 13-A (App.tsx decomposition) is complete
- [ ] `rtk npm run lint` passes
- [ ] `rtk vitest run` passes

---

## Important Context

Current oversized files status:

- `App.tsx` - 4,034 lines (REGRESSION, addressed in Phase 13-A)
- `symphony.ts` handler - 3,318 lines
- `TabBar.tsx` - FULLY RESOLVED (2,839 to 542)
- `FilePreview.tsx` - PARTIALLY RESOLVED (2,662 to 1,320)
- `SymphonyModal.tsx` - large (check current size)
- `useTabHandlers.ts` - large (should be smaller after Phase 07)
- `useInputProcessing.ts` - large (should be smaller after Phase 07)

---

## Tasks

### 1. Re-measure after prior phases

- [ ] Run: `find src/ -name "*.ts" -o -name "*.tsx" | xargs wc -l | sort -rn | head -30`
- [ ] Only target files still over 1,500 lines
- [ ] Document updated line counts for decision-making

### 2. Decompose symphony.ts handler (3,318 lines)

- [ ] Read `src/main/ipc/handlers/symphony.ts` to identify logical sections
- [ ] Create directory: `src/main/ipc/handlers/symphony/`
- [ ] Extract and create `index.ts` - handler registration (entry point)
- [ ] Extract and create `create.ts` - create group chat handlers
- [ ] Extract and create `manage.ts` - manage/update group chat handlers
- [ ] Extract and create `participants.ts` - participant management handlers
- [ ] Extract and create `messages.ts` - message handling
- [ ] Extract and create `export.ts` - export/history handlers
- [ ] Update imports in any files that referenced the old single-file path
- [ ] Run lint and tests: `rtk npm run lint && rtk vitest run`

### 3. Decompose SymphonyModal.tsx

- [ ] Read the file to identify extractable sub-panels and state logic
- [ ] Extract `SymphonyParticipantList.tsx` component
- [ ] Extract `SymphonyMessageView.tsx` component
- [ ] Extract `SymphonyConfigPanel.tsx` component
- [ ] Extract `useSymphonyModal.ts` state management hook
- [ ] Keep the modal shell as the coordinator that imports and composes these
- [ ] Run lint and tests: `rtk npm run lint && rtk vitest run`

### 4. Finish FilePreview.tsx decomposition (1,320 lines)

- [ ] Read the file to identify remaining extractable sections
- [ ] Extract language-specific renderers into separate components
- [ ] Extract toolbar logic into a component or hook
- [ ] Extract preview mode switching logic
- [ ] Run lint and tests: `rtk npm run lint && rtk vitest run`

### 5. Address useTabHandlers.ts and useInputProcessing.ts

- [ ] Check current size of both files (should be smaller after Phase 07)
- [ ] If `useTabHandlers.ts` still exceeds 800 lines: split by tab operation type (create, close, reorder, activate)
- [ ] If `useInputProcessing.ts` still exceeds 800 lines: split by input type (text, slash commands, file drops)
- [ ] Run lint and tests after any splits: `rtk npm run lint && rtk vitest run`

### 6. Verify full build

- [ ] Run lint: `rtk npm run lint`
- [ ] Run tests: `rtk vitest run`
- [ ] Verify types: `rtk tsc -p tsconfig.main.json --noEmit && rtk tsc -p tsconfig.lint.json --noEmit`

### 7. Final oversized file count

- [ ] Run: `find src/ -name "*.ts" -o -name "*.tsx" | xargs wc -l | awk '$1 > 800' | sort -rn | wc -l`
- [ ] Target: fewer than 40 files over 800 lines (down from 82)

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

- `symphony.ts` handler split into focused modules
- `SymphonyModal.tsx` split into sub-components
- `FilePreview.tsx` further decomposed if still >800 lines
- Post-Phase-07 files re-checked
- Lint and tests pass
- Fewer than 40 files over 800 lines

# Phase 13-A: Decompose App.tsx (4,034 lines)

## Objective

Break down `App.tsx` from 4,034 lines into focused modules. This is the single largest file in the codebase and has been growing (was 3,619, now 4,034 - a REGRESSION).

**Evidence:** `docs/agent-guides/scans/SCAN-OVERSIZED.md`
**Risk:** High - App.tsx is the main coordinator. Changes must be incremental and verified at each step.
**Estimated savings:** Improved maintainability, target <1,000 lines for App.tsx

---

## Pre-flight Checks

- [ ] Phase 12 (constants) is complete
- [ ] `rtk npm run lint` passes
- [ ] `rtk vitest run` passes
- [ ] Create a backup branch: `rtk git checkout -b backup/pre-app-decomposition`

---

## Important Notes

- **Work incrementally.** Extract one concern at a time, verify, then continue.
- **DO NOT change behavior.** This is pure structural refactoring.
- **Keep App.tsx as the coordinator.** It should import and compose extracted modules, not duplicate their logic.
- Previous successful decomposition: TabBar.tsx went from 2,839 to 542 lines by splitting into 4 files.

---

## Tasks

### 1. Read App.tsx and categorize sections

- [ ] Read the entire `src/renderer/App.tsx` file
- [ ] Map out line ranges for: state declarations (useState, useRef), effect hooks (useEffect blocks), event handlers (keyboard, mouse, window), IPC listeners (window.maestro handlers), modal render logic, layout render (main JSX tree), helper functions, constants
- [ ] Identify the largest extractable sections by line count

### 2. Extract keyboard handler logic

- [ ] Check if `useMainKeyboardHandler` already exists: `rtk grep "useMainKeyboardHandler" src/renderer/ --glob "*.{ts,tsx}"`
- [ ] If App.tsx still has inline keyboard handling: extract to `src/renderer/hooks/useAppKeyboardHandler.ts`
- [ ] Import and call the hook from App.tsx
- [ ] Run lint and tests: `rtk npm run lint && rtk vitest run`

### 3. Extract IPC listener setup

- [ ] Create `src/renderer/hooks/useAppIpcListeners.ts`
- [ ] Move all `window.maestro.on(...)` listener registrations from App.tsx into the hook
- [ ] Define a `AppIpcDeps` interface for any dependencies the listeners need
- [ ] Return cleanup function from the useEffect
- [ ] Import and call from App.tsx
- [ ] Run lint and tests: `rtk npm run lint && rtk vitest run`

### 4. Extract modal orchestration

- [ ] Create `src/renderer/components/AppModals.tsx`
- [ ] Move all conditional modal rendering (`{isOpen && <Modal />}` blocks) from App.tsx into AppModals
- [ ] Define `AppModalsProps` interface with all modal open states and handlers
- [ ] Import and render `<AppModals>` from App.tsx
- [ ] Run lint and tests: `rtk npm run lint && rtk vitest run`

### 5. Extract session management effects

- [ ] Create `src/renderer/hooks/useSessionLifecycle.ts`
- [ ] Move effects that manage session lifecycle (creation, deletion, status updates) from App.tsx
- [ ] Import and call from App.tsx
- [ ] Run lint and tests: `rtk npm run lint && rtk vitest run`

### 6. Extract auto-run / batch processing coordination

- [ ] Create `src/renderer/hooks/useAutoRunCoordination.ts`
- [ ] Move auto-run state management and batch processing coordination from App.tsx
- [ ] Import and call from App.tsx
- [ ] Run lint and tests: `rtk npm run lint && rtk vitest run`

### 7. Extract Encore Feature gating logic

- [ ] Create `src/renderer/hooks/useEncoreFeatures.ts`
- [ ] Centralize all Encore Feature conditional logic from App.tsx
- [ ] Import and call from App.tsx
- [ ] Run lint and tests: `rtk npm run lint && rtk vitest run`

### 8. Verify after each extraction

- [ ] After each extraction above: `rtk npm run lint`
- [ ] After each extraction above: `rtk vitest run`
- [ ] After each extraction: verify App.tsx still composes everything correctly
- [ ] After each extraction: confirm no behavior changes

### 9. Verify App.tsx is a thin coordinator

- [ ] App.tsx should contain: minimal state, extracted hook calls, and a clean JSX return with `<AppLayout>`, `<LeftBar>`, `<MainPanel>`, `<RightBar>`, `<AppModals>`
- [ ] No inline event handlers longer than 3 lines
- [ ] No inline effects

### 10. Measure result

- [ ] Run: `wc -l src/renderer/App.tsx`
- [ ] Target: <1,000 lines
- [ ] Verify types: `rtk tsc -p tsconfig.main.json --noEmit && rtk tsc -p tsconfig.lint.json --noEmit`

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

- App.tsx reduced from 4,034 to <1,000 lines
- Extracted modules are focused and self-contained
- No behavior changes
- All extracted hooks have tests
- Lint and tests pass

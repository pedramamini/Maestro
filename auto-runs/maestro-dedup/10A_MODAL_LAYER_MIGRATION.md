# Phase 10-A: Migrate Modal Boilerplate to useModalLayer Hook

## Objective

Migrate 50+ files from manual `registerLayer`/`unregisterLayer` boilerplate to the existing `useModalLayer` hook (currently used by only 1-2 files).

**Evidence:** `docs/agent-guides/scans/SCAN-BLOCKS.md`, "registerLayer/unregisterLayer by File"
**Risk:** Low-medium - modal behavior must be preserved (Escape handling, layer priority)
**Estimated savings:** ~200 lines (4 lines per file x 50 files)

---

## Pre-flight Checks

- [ ] Phase 09 (shared hooks) is complete
- [ ] `rtk npm run lint` passes
- [ ] `rtk vitest run` passes

---

## Tasks

### 1. Read the existing useModalLayer hook

- [ ] Read `src/renderer/hooks/ui/useModalLayer.ts`
- [ ] Document what parameters it accepts
- [ ] Confirm it handles the `isOpen` conditional logic
- [ ] Confirm it accepts priority from `modalPriorities.ts`
- [ ] Confirm it handles the `onCloseRef` pattern internally

### 2. Verify useModalLayer covers all manual patterns

- [ ] Compare the manual boilerplate pattern (`useLayerStack` + `useRef` + `useEffect` with `registerLayer`/`unregisterLayer`) against what `useModalLayer` provides
- [ ] If the hook is missing any capability (e.g., custom layer type, conditional priority), extend it before migration
- [ ] Run hook tests after any extension: `rtk vitest run <hook-test-path>`

### 3. Find all files with manual boilerplate

- [ ] Run: `rtk grep "registerLayer|unregisterLayer" src/renderer/ --glob "*.{ts,tsx}"` (exclude `__tests__`, `useModalLayer`, `LayerStackContext`)
- [ ] List all files and count total instances

### 4. Migrate simple modals (~30 files)

- [ ] For each file with direct `isOpen` + `onClose` props: replace the manual `useLayerStack` + `useRef` + `useEffect` block with `useModalLayer({ isOpen, priority, onEscape: onClose })`
- [ ] Remove now-unused imports of `useLayerStack`, `useRef` (if no longer needed), and `useEffect` (if no longer needed)
- [ ] Run targeted tests after each batch: `rtk vitest run <relevant-test>`

### 5. Migrate complex modals (~15 files)

- [ ] For modals with conditional open states or multiple close paths: adapt the `useModalLayer` call to match the existing behavior
- [ ] Verify each modal's Escape key behavior works correctly after migration
- [ ] Run targeted tests after each file

### 6. Migrate non-modal layers (~5 files)

- [ ] For drawers, panels, or other layers with escape handling: use `useModalLayer` with appropriate type/priority
- [ ] Run targeted tests

### 7. Handle DocumentGraphView.tsx (17 registerLayer calls)

- [ ] Read the file to understand its multiple nested modal layers
- [ ] Migrate each layer to its own `useModalLayer` call with the correct priority
- [ ] Verify stacked modal Escape behavior works correctly
- [ ] Run tests: `rtk vitest run` (filter for DocumentGraphView tests)

### 8. Verify Escape key behavior across migrated modals

- [ ] Escape closes the topmost modal
- [ ] Stacked modals close in correct order (highest priority first)
- [ ] Escape does NOT close modals that are behind other modals

### 9. Verify full build

- [ ] Run lint: `rtk npm run lint`
- [ ] Run tests: `rtk vitest run`
- [ ] Verify types: `rtk tsc -p tsconfig.main.json --noEmit && rtk tsc -p tsconfig.lint.json --noEmit`

### 10. Count remaining manual registrations

- [ ] Run: `rtk grep "registerLayer" src/renderer/ --glob "*.{ts,tsx}"` (exclude `__tests__`, `useModalLayer`, `LayerStackContext`)
- [ ] Target: 0 remaining in component files

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

- 50+ files migrated to `useModalLayer` hook
- All modal Escape behavior preserved
- No manual `registerLayer`/`unregisterLayer` calls remain in components
- Lint and tests pass

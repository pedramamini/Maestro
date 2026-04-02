# Phase 09-A: Extract useFocusAfterRender and useEventListener Hooks

## Objective

Create two shared hooks to replace repetitive patterns:

1. `useFocusAfterRender` - replaces 45 `setTimeout(() => ref.current?.focus(), N)` patterns across 28 files
2. `useEventListener` - replaces manual `addEventListener`/`removeEventListener` pairs in 63+ files

**Evidence:** `docs/agent-guides/scans/SCAN-HOOKS.md`
**Risk:** Low - extracting patterns into hooks with identical behavior
**Estimated savings:** ~340 lines

---

## Pre-flight Checks

- [ ] Phase 08 (UI components) is complete
- [ ] `rtk npm run lint` passes
- [ ] `rtk vitest run` passes

---

## Tasks

### Part 1: useFocusAfterRender

### 1. Survey the setTimeout focus pattern

- [ ] Run: `rtk grep "setTimeout.*focus" src/renderer/ --glob "*.{ts,tsx}"` (exclude `__tests__`)
- [ ] Note delay values used (0ms, 50ms, 100ms are common)
- [ ] Determine the most common default delay

### 2. Create useFocusAfterRender hook

- [ ] Create `src/renderer/hooks/utils/useFocusAfterRender.ts`
- [ ] Implement with params: `ref` (RefObject), `shouldFocus` (boolean, default true), `delay` (number, default 0)
- [ ] Use `useEffect` with `setTimeout` + `clearTimeout` cleanup
- [ ] Export the function

### 3. Write tests for useFocusAfterRender

- [ ] Create test file for the hook
- [ ] Test focuses element after render
- [ ] Test respects delay parameter
- [ ] Test cleans up timeout on unmount
- [ ] Test does nothing when `shouldFocus` is false
- [ ] Run tests: `rtk vitest run <hook-test-path>`

### 4. Migrate setTimeout focus patterns (45 instances across 28 files)

- [ ] For each file: identify whether the `setTimeout(() => ref.current?.focus(), N)` is inside a `useEffect` or an event handler
- [ ] If inside `useEffect`: replace entirely with `useFocusAfterRender(ref, condition, delay)`
- [ ] If inside an event handler: keep inline (the hook is for render-time focus only)
- [ ] Run targeted tests after each batch of files

### Part 2: useEventListener

### 5. Survey addEventListener/removeEventListener pairs

- [ ] Run: `rtk grep "addEventListener" src/renderer/ --glob "*.{ts,tsx}"` (exclude `__tests__`, `node_modules`)
- [ ] Identify top offenders: `activityBus.ts` (10), `MarketplaceModal.tsx` (10), `useMainKeyboardHandler.ts` (8), `SymphonyModal.tsx` (8), `App.tsx` (8)

### 6. Create useEventListener hook

- [ ] Create `src/renderer/hooks/utils/useEventListener.ts`
- [ ] Implement with params: `eventName`, `handler`, `element` (optional, defaults to window), `options` (optional)
- [ ] Use `useRef` for handler to avoid re-attaching on handler changes
- [ ] Handle null/undefined element gracefully
- [ ] Export the function

### 7. Write tests for useEventListener

- [ ] Create test file for the hook
- [ ] Test attaches listener on mount
- [ ] Test removes listener on unmount
- [ ] Test updates handler without re-attaching listener
- [ ] Test works with custom HTML elements
- [ ] Test handles null element gracefully
- [ ] Run tests: `rtk vitest run <hook-test-path>`

### 8. Migrate event listener pairs (63+ files)

- [ ] Start with top offenders: `activityBus.ts`, `MarketplaceModal.tsx`, `useMainKeyboardHandler.ts`, `SymphonyModal.tsx`, `App.tsx`
- [ ] Replace each `useEffect` containing `addEventListener`/`removeEventListener` pair with `useEventListener(eventName, handler)`
- [ ] Run targeted tests after each file

### 9. Export from hooks barrel

- [ ] Add exports to `src/renderer/hooks/utils/index.ts` (create if doesn't exist):
  - `export { useFocusAfterRender } from './useFocusAfterRender';`
  - `export { useEventListener } from './useEventListener';`

### 10. Verify full build

- [ ] Run lint: `rtk npm run lint`
- [ ] Run tests: `rtk vitest run`
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

- `useFocusAfterRender` hook created with tests
- `useEventListener` hook created with tests
- 45 setTimeout-focus patterns migrated
- 63+ addEventListener/removeEventListener pairs migrated
- Lint and tests pass

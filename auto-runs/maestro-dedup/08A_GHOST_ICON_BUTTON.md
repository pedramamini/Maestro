# Phase 08-A: Extract GhostIconButton Component

## Objective

Replace 100+ instances of the ghost icon button pattern (`p-1 rounded hover:bg-white/10 transition-colors`) across 40+ files with a shared `<GhostIconButton>` component.

**Evidence:** `docs/agent-guides/scans/SCAN-COMPONENTS.md`, "Ghost Icon Button Pattern Locations"
**Risk:** Low - pure UI extraction, no logic changes
**Estimated savings:** ~300 lines

---

## Pre-flight Checks

- [ ] Phase 07 (session state) is complete
- [ ] `rtk npm run lint` passes

---

## Tasks

### 1. Survey pattern variations

- [ ] Run: `rtk grep "p-1 rounded hover:bg-white/10" src/renderer/ --glob "*.tsx"`
- [ ] Run: `rtk grep "p-1.5 rounded hover:bg-white/10" src/renderer/ --glob "*.tsx"`
- [ ] Run: `rtk grep "opacity-0 group-hover:opacity-100" src/renderer/ --glob "*.tsx"` (filter for p-1 variants)
- [ ] Categorize variants: Standard (`p-1`), Larger (`p-1.5`), Fade-in (with `opacity-0 group-hover:opacity-100`), With tooltip

### 2. Create the GhostIconButton component

- [ ] Create `src/renderer/components/ui/GhostIconButton.tsx`
- [ ] Define props interface: `icon`, `size` (`'sm' | 'md'`), `showOnHover`, `tooltip`, `className`, `children`, plus `ButtonHTMLAttributes`
- [ ] Implement size mapping: `sm` = `p-1`, `md` = `p-1.5`
- [ ] Implement `showOnHover` via `opacity-0 group-hover:opacity-100` class
- [ ] Implement optional tooltip wrapper
- [ ] Export from the component file

### 3. Write tests for GhostIconButton

- [ ] Create `src/__tests__/renderer/components/ui/GhostIconButton.test.tsx`
- [ ] Test renders with default props
- [ ] Test applies `p-1` for size `sm` and `p-1.5` for size `md`
- [ ] Test applies `opacity-0 group-hover:opacity-100` when `showOnHover` is true
- [ ] Test passes through button props (`onClick`, `disabled`, `aria-label`)
- [ ] Test renders tooltip when `tooltip` prop provided
- [ ] Run tests: `rtk vitest run src/__tests__/renderer/components/ui/GhostIconButton.test.tsx`

### 4. Migrate high-frequency files first

- [ ] Migrate `TabBar.tsx` - find and replace all ghost icon button patterns
- [ ] Migrate `SessionList.tsx`
- [ ] Migrate `RightPanel.tsx`
- [ ] Migrate `SymphonyModal.tsx`
- [ ] For each file: run `rtk vitest run <relevant-test>` after migration

### 5. Migrate remaining 36+ files

- [ ] Search for remaining pattern instances: `rtk grep "p-1 rounded hover:bg-white/10" src/renderer/ --glob "*.tsx"`
- [ ] Replace each instance with `<GhostIconButton>` using appropriate props
- [ ] Ensure the `icon` prop matches (most pass a lucide-react icon as child)
- [ ] Run targeted tests after each batch

### 6. Handle edge cases

- [ ] Check for buttons with additional active state classes - add `active` prop if needed
- [ ] Check for buttons with custom hover colors - accept via `className` prop
- [ ] Verify disabled state looks correct on the component

### 7. Verify full build

- [ ] Run lint: `rtk npm run lint`
- [ ] Run tests: `rtk vitest run`
- [ ] Verify types: `rtk tsc -p tsconfig.main.json --noEmit && rtk tsc -p tsconfig.lint.json --noEmit`

### 8. Count remaining raw patterns

- [ ] Run: `rtk grep "p-1 rounded hover:bg-white/10" src/renderer/ --glob "*.tsx"` (exclude GhostIconButton)
- [ ] Target: fewer than 5 remaining (edge cases only)

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

- `GhostIconButton` component in `src/renderer/components/ui/`
- 100+ inline patterns replaced
- Unit tests for the component
- Lint and tests pass

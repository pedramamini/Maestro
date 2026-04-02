# Phase 08-B: Extract Spinner Component

## Objective

Replace 95+ `<Loader2 className="... animate-spin" />` instances across 43 files with a shared `<Spinner>` component.

**Evidence:** `docs/agent-guides/scans/SCAN-COMPONENTS.md`, "Spinner Instances"
**Risk:** Low - pure UI extraction
**Estimated savings:** ~200 lines

---

## Pre-flight Checks

- [ ] Phase 08-A (GhostIconButton) is complete
- [ ] `rtk npm run lint` passes

---

## Tasks

### 1. Survey spinner variations

- [ ] Run: `rtk grep "Loader2" src/renderer/ --glob "*.tsx"` (filter for `animate-spin`)
- [ ] Categorize by size: xs (`w-3 h-3`), sm (`w-4 h-4`), md (`w-5 h-5`), lg (`w-6 h-6` or `w-8 h-8`)
- [ ] Note any instances with extra classes beyond size (e.g., color)

### 2. Create the Spinner component

- [ ] Create `src/renderer/components/ui/Spinner.tsx`
- [ ] Define props: `size` (`'xs' | 'sm' | 'md' | 'lg'`, default `'sm'`), `className`
- [ ] Define size class map: xs=`w-3 h-3`, sm=`w-4 h-4`, md=`w-5 h-5`, lg=`w-8 h-8`
- [ ] Render `<Loader2>` with `animate-spin` plus the size class and optional className
- [ ] Export from the component file

### 3. Write tests for Spinner

- [ ] Create `src/__tests__/renderer/components/ui/Spinner.test.tsx`
- [ ] Test renders with each size variant (xs, sm, md, lg)
- [ ] Test applies additional className
- [ ] Test renders Loader2 with animate-spin class
- [ ] Run tests: `rtk vitest run src/__tests__/renderer/components/ui/Spinner.test.tsx`

### 4. Migrate top offender files

- [ ] Migrate `SymphonyModal.tsx` (9 instances) - replace `<Loader2 className="w-4 h-4 animate-spin" />` with `<Spinner size="sm" />`
- [ ] Migrate `AgentSessionsBrowser.tsx` (7 instances)
- [ ] Migrate `DocumentGraphView.tsx` (5 instances)
- [ ] Run targeted tests after each file: `rtk vitest run <relevant-test>`

### 5. Migrate remaining 40 files

- [ ] Work through all 43 files, mapping each Loader2 size to the appropriate prop: `w-3 h-3` to `xs`, `w-4 h-4` to `sm`, `w-5 h-5` to `md`, `w-6 h-6`/`w-8 h-8` to `lg`
- [ ] For instances with additional classes beyond size (e.g., color), pass them via `className`
- [ ] Run targeted tests after each batch

### 6. Remove orphaned Loader2 imports

- [ ] Run: `rtk grep "import.*Loader2" src/renderer/ --glob "*.tsx"`
- [ ] For each file: check if Loader2 is still used; if not, remove the import
- [ ] Run lint to catch any missed unused imports: `rtk npm run lint`

### 7. Verify full build

- [ ] Run lint: `rtk npm run lint`
- [ ] Run tests: `rtk vitest run`
- [ ] Verify types: `rtk tsc -p tsconfig.main.json --noEmit && rtk tsc -p tsconfig.lint.json --noEmit`

### 8. Count remaining raw Loader2 usages

- [ ] Run: `rtk grep "Loader2.*animate-spin" src/renderer/ --glob "*.tsx"` (exclude Spinner component file)
- [ ] Target: 0 remaining

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

- `Spinner` component in `src/renderer/components/ui/`
- 95+ inline Loader2 usages replaced
- Orphaned Loader2 imports removed
- Lint and tests pass

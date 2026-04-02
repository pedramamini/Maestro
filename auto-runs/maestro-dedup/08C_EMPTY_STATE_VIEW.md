# Phase 08-C: Extend and Adopt EmptyStateView

## Objective

Extend the existing `EmptyStateView` component (currently used only in `App.tsx:3340`) to accept configurable props, then adopt it across 26+ empty state locations.

**Evidence:** `docs/agent-guides/scans/SCAN-COMPONENTS.md`, "Empty State Pattern Locations"
**Risk:** Low - UI consolidation
**Estimated savings:** ~150 lines

---

## Pre-flight Checks

- [ ] Phase 08-B (Spinner) is complete
- [ ] `rtk npm run lint` passes

---

## Tasks

### 1. Read the existing EmptyStateView

- [ ] Read `src/renderer/components/EmptyStateView.tsx` to understand its current API and render output
- [ ] Note what props it currently accepts and what it renders

### 2. Survey existing empty state patterns

- [ ] Run: `rtk grep "No .* found|No .* available|No .* yet|Nothing to show|Empty|Get started" src/renderer/components/ --glob "*.tsx"`
- [ ] Categorize patterns: icon+message, icon+message+action button, centered message only, message+subtitle

### 3. Extend EmptyStateView with flexible props

- [ ] Update `src/renderer/components/EmptyStateView.tsx` to accept: `icon` (ReactNode), `message` (string, required), `description` (string, optional), `action` (`{ label: string; onClick: () => void }`, optional), `className` (string, optional)
- [ ] Implement conditional rendering for each optional prop
- [ ] Ensure backward compatibility with existing usage in `App.tsx:3340`

### 4. Write tests for all prop combinations

- [ ] Update or create tests at `src/__tests__/renderer/components/EmptyStateView.test.tsx`
- [ ] Test message-only rendering
- [ ] Test icon + message rendering
- [ ] Test icon + message + description rendering
- [ ] Test full props: icon + message + description + action button
- [ ] Test action button `onClick` fires correctly
- [ ] Run tests: `rtk vitest run src/__tests__/renderer/components/EmptyStateView.test.tsx`

### 5. Migrate empty state locations (26+ sites)

- [ ] Start with the simplest cases (message-only) and replace inline markup with `<EmptyStateView message="..." />`
- [ ] Migrate icon+message patterns: `<EmptyStateView icon={<SomeIcon />} message="..." />`
- [ ] Migrate complex patterns with action buttons: `<EmptyStateView icon={...} message="..." action={{ label: "...", onClick: ... }} />`
- [ ] Run targeted tests after each batch of migrations

### 6. Verify full build

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

- `EmptyStateView` extended with icon, description, action props
- 26+ inline empty states replaced
- Tests cover all variants
- Lint and tests pass

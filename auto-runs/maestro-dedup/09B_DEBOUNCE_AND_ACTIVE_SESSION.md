# Phase 09-B: Consolidate Debounce/Throttle and activeSession Re-derivation

## Objective

1. Migrate 15+ files with inline debounce/throttle to use existing shared hooks
2. Consolidate 28 files that re-derive `activeSession` from the store

**Evidence:** `docs/agent-guides/scans/SCAN-HOOKS.md`
**Risk:** Low - using existing hooks
**Estimated savings:** ~150 lines

---

## Pre-flight Checks

- [ ] Phase 09-A (focus and event hooks) is complete
- [ ] `rtk npm run lint` passes

---

## Tasks

### Part 1: Debounce/Throttle Consolidation

### 1. Identify existing shared hooks

- [ ] Run: `rtk grep "useDebounce|useThrottle|useDebouncedPersistence|useSessionDebounce" src/renderer/hooks/ --glob "*.ts"`
- [ ] Read each hook to understand its API and parameters

### 2. Find inline debounce/throttle implementations

- [ ] Run: `rtk grep "setTimeout|debounce|throttle" src/renderer/ --glob "*.{ts,tsx}"` (exclude `__tests__`, `node_modules`, `hooks/utils`)
- [ ] Filter for files implementing their own debounce/throttle rather than importing shared hooks
- [ ] List each file and the pattern it uses

### 3. Migrate to shared hooks (15+ files)

- [ ] For each file: identify the debounce/throttle pattern used
- [ ] Match to the appropriate shared hook (`useDebounce`, `useThrottle`, `useDebouncedPersistence`, or `useSessionDebounce`)
- [ ] Replace the inline implementation with the shared hook import
- [ ] Run file-level tests after each migration: `rtk vitest run <relevant-test>`

### Part 2: activeSession Re-derivation

### 4. Find all re-derivation patterns

- [ ] Run: `rtk grep "sessions\.find.*activeSessionId|sessions\.find.*id === active" src/renderer/ --glob "*.{ts,tsx}"` (exclude `__tests__`, `sessionStore`)
- [ ] Count total instances across files

### 5. Create or promote a useActiveSession hook

- [ ] Check if `useActiveSession` already exists: `rtk grep "useActiveSession" src/renderer/ --glob "*.{ts,tsx}"`
- [ ] If it doesn't exist, create `src/renderer/hooks/useActiveSession.ts` that returns `useSessionStore(state => state.sessions.find(s => s.id === state.activeSessionId))`
- [ ] If it exists, note its location for imports

### 6. Migrate 28 files to useActiveSession

- [ ] For each file that re-derives `activeSession`: replace the derivation with `useActiveSession()` import
- [ ] Remove any local variable that was doing the lookup
- [ ] Handle files that re-derive multiple times internally - replace all occurrences
- [ ] Run targeted tests after each batch

### 7. Verify full build

- [ ] Run lint: `rtk npm run lint`
- [ ] Run tests: `rtk vitest run`
- [ ] Verify types: `rtk tsc -p tsconfig.main.json --noEmit && rtk tsc -p tsconfig.lint.json --noEmit`

### 8. Count remaining derivations

- [ ] Run: `rtk grep "sessions\.find.*activeSessionId" src/renderer/ --glob "*.{ts,tsx}"` (exclude `__tests__`, `sessionStore`, `useActiveSession`)
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

- 15+ inline debounce/throttle implementations migrated to shared hooks
- 28 files using `useActiveSession()` instead of re-derivation
- Lint and tests pass

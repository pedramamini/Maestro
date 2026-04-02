# Phase 07-B: Replace sessions.find with Store Selectors

## Objective

Replace 71 inline `sessions.find(s => s.id === ...)` calls with the existing store selectors `getActiveSession` and `getSessionById`.

**Evidence:** `docs/agent-guides/scans/SCAN-STATE.md`, "sessions.find calls"
**Risk:** Low - replacing inline lookups with equivalent store selectors
**Estimated savings:** ~100 lines

---

## Pre-flight Checks

- [ ] Phase 07-A (session update helpers) is complete
- [ ] `rtk npm run lint` passes

---

## Tasks

### 1. Verify store selectors exist

- [ ] Read `src/renderer/stores/sessionStore.ts` and confirm `getActiveSession` exists (~line 320)
- [ ] Confirm `getSessionById` exists (~line 331) and takes an ID, returns session or undefined
- [ ] Note the exact import paths and function signatures

### 2. Find all inline sessions.find calls

- [ ] Run: `rtk grep "sessions\.find" src/ --glob "*.{ts,tsx}"` (exclude `__tests__` and `sessionStore`)
- [ ] Count total instances and categorize by pattern (active session lookup vs specific ID lookup)

### 3. Migrate activeSession re-derivations (28 files)

- [ ] For files using hooks: replace `sessions.find(s => s.id === activeSessionId)` with `getActiveSession()` or the equivalent store selector
- [ ] For files in callbacks/event handlers: replace `useSessionStore.getState().sessions.find(...)` with `getActiveSession()`
- [ ] Run targeted tests after each batch of files

### 4. Migrate specific-ID lookups (43 calls)

- [ ] Replace `sessions.find(s => s.id === someId)` with `getSessionById(someId)` in each file
- [ ] Run targeted tests: `rtk vitest run <relevant-test>`

### 5. Fix wizard re-lookups (8 wasteful re-finds)

- [ ] Identify the 8 instances in wizard code where `activeSession` is re-found despite already being in scope
- [ ] Remove redundant lookups and use the existing variable
- [ ] Run wizard tests: `rtk vitest run` (filter for wizard test files)

### 6. Fix useTabHandlers.ts (13 identical finds)

- [ ] Read `useTabHandlers.ts` to find all 13 `sessions.find` calls
- [ ] Hoist a single lookup to the top of each function/handler and reuse throughout
- [ ] Run tab handler tests: `rtk vitest run` (filter for tab handler test files)

### 7. Consolidate getSshRemoteById (6 definitions, 5 redundant)

- [ ] Verify canonical location: `main/stores/getters.ts:115`
- [ ] Remove local copy in `agentSessions.ts:82` and replace with import
- [ ] Remove local copy in `agents.ts:202` and replace with import
- [ ] Remove local copy in `autorun.ts:43` and replace with import
- [ ] Remove local copy in `git.ts:54` and replace with import
- [ ] Remove local copy in `marketplace.ts:66` and replace with import
- [ ] Run targeted tests for each changed file

### 8. Verify full build

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

- 71 inline `sessions.find` calls replaced with store selectors
- 8 wizard re-lookups eliminated
- 5 redundant `getSshRemoteById` definitions removed
- Lint and tests pass

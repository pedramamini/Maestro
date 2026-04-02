# Phase 11-B: Add Sentry to Catch Blocks Missing Error Reporting

## Objective

Audit 252 catch blocks that use `console.error` without `captureException`/`captureMessage` and add Sentry reporting where errors are unexpected (not recoverable/expected failures).

**Evidence:** `docs/agent-guides/scans/SCAN-PATTERNS.md`, "try-catch with console.error only"
**Risk:** Low - adding error reporting doesn't change behavior
**Estimated savings:** Improved production error visibility

---

## Pre-flight Checks

- [ ] Phase 11-A (console.log migration) is complete
- [ ] `rtk npm run lint` passes

---

## Important Context

From CLAUDE.md:

- **DO let exceptions bubble up** when they represent unexpected failures
- **DO handle expected/recoverable errors explicitly** (network errors, file not found, etc.)
- **DO use Sentry utilities** for explicit reporting

Sentry imports:

- Main process: `import { captureException, captureMessage } from '../utils/sentry';`
- Renderer: `import { captureException } from '../components/ErrorBoundary';` (or similar)

---

## Tasks

### 1. Prioritize catch blocks by risk category

- [ ] Categorize as MUST add Sentry (unexpected failures): main process IPC handlers, data persistence/storage, agent spawn failures, session state corruption
- [ ] Categorize as SKIP Sentry (expected/recoverable): network timeouts, file not found, parse errors on user input, git operations on non-git directories
- [ ] Create a list of files grouped by priority

### 2. Audit main process files (highest priority)

- [ ] Run: `rtk grep "catch" src/main/ --glob "*.ts" -A 2` (filter for `console.error` without `captureException`)
- [ ] For each catch block: read the try block to understand what can fail
- [ ] If error is unexpected: add `captureException(error, { operation: 'operationName', context })` after the `console.error`
- [ ] If error is expected: add a comment explaining why Sentry is skipped (e.g., `// Expected: file may not exist yet on first run`)
- [ ] Run targeted tests: `rtk vitest run` (filter for main process tests)

### 3. Audit CLI files (14 files)

- [ ] Add Sentry only for internal/system errors, NOT for user input validation failures
- [ ] Run targeted tests after changes

### 4. Audit renderer components (40+ files)

- [ ] For API call catch blocks: add Sentry for unexpected failures
- [ ] For DOM operation catch blocks: usually expected, skip Sentry but add comment
- [ ] For data parsing catch blocks: add Sentry if data comes from our systems, skip if user input
- [ ] Run targeted tests after each batch

### 5. Audit renderer hooks (24 files)

- [ ] Focus on hooks that call IPC or external services
- [ ] Add Sentry for unexpected IPC failures
- [ ] Run targeted tests after changes

### 6. Audit renderer services/stores/utils (14 files)

- [ ] These handle data flow and are often most critical
- [ ] Add Sentry for unexpected data pipeline failures
- [ ] Run targeted tests after changes

### 7. Verify full build

- [ ] Run lint: `rtk npm run lint`
- [ ] Run tests: `rtk vitest run`
- [ ] Verify types: `rtk tsc -p tsconfig.main.json --noEmit && rtk tsc -p tsconfig.lint.json --noEmit`

### 8. Count improvement

- [ ] Count files with `console.error` but no Sentry: `rtk grep "console.error" src/ --glob "*.{ts,tsx}"` and cross-check against `rtk grep "captureException|captureMessage" src/ --glob "*.{ts,tsx}"`
- [ ] Target: fewer than 30 remaining (expected-error-only files)

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

- High-priority catch blocks (main process, data persistence) have Sentry reporting
- Expected/recoverable errors are documented with comments
- No behavioral changes
- Lint and tests pass

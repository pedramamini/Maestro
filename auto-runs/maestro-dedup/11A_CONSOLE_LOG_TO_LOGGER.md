# Phase 11-A: Migrate console.log to Structured Logger

## Objective

Replace 130+ `console.log` calls in the group chat router (and 26 in group-chat-agent) with the structured logger from `main/utils/logger.ts`. Also address high-frequency console.log in other main process files.

**Evidence:** `docs/agent-guides/scans/SCAN-MAIN.md`, "console.log vs logger Usage by File"
**Risk:** Low - logging changes don't affect behavior, only observability
**Estimated savings:** Improved debuggability, no net line count change

---

## Pre-flight Checks

- [ ] Phase 10 (modal/spawn consolidation) is complete
- [ ] `rtk npm run lint` passes

---

## Important Notes

- **DO NOT change log levels blindly.** Read each `console.log` to determine appropriate level:
  - `logger.debug()` - detailed debugging info (most console.logs)
  - `logger.info()` - notable state transitions
  - `logger.warn()` - unexpected but recoverable situations
  - `logger.error()` - actual errors (should already be console.error)
- **Preserve the log message content.** Only change the function call, not the message.
- **DO NOT touch `src/main/cue/` files** - under active development.

---

## Tasks

### 1. Read the logger API

- [ ] Read `src/main/utils/logger.ts` to understand available log levels
- [ ] Note how to create a scoped logger (e.g., `createLogger('group-chat-router')`)
- [ ] Note any structured data parameters (e.g., `logger.info('msg', { key: value })`)

### 2. Create scoped loggers for group chat files

- [ ] Add `import { createLogger } from '../utils/logger';` and `const logger = createLogger('group-chat-router');` at top of `group-chat-router.ts`
- [ ] Add `const logger = createLogger('group-chat-agent');` at top of `group-chat-agent.ts`

### 3. Migrate group-chat-router.ts (130 calls)

- [ ] Work section by section through the file
- [ ] Replace `console.log('[GroupChat] ...')` with `logger.info('...')` or `logger.debug('...')` based on message importance
- [ ] For messages with data objects: use `logger.debug('msg', { data })` instead of `console.log('msg:', data)`
- [ ] Preserve all existing log message content
- [ ] Run targeted tests after completing: `rtk vitest run` (filter for group-chat-router tests)

### 4. Migrate group-chat-agent.ts (26 calls)

- [ ] Apply same pattern as Task 3
- [ ] Run targeted tests: `rtk vitest run` (filter for group-chat-agent tests)

### 5. Migrate other high-frequency files

- [ ] Migrate `useRemoteHandlers.ts` (14 calls) - use `console.debug` or renderer-side logger
- [ ] Migrate `phaseGenerator.ts` (14 calls)
- [ ] Migrate `graphDataBuilder.ts` (11 calls)
- [ ] Migrate `groupChat.ts` IPC handler (11 calls)
- [ ] Run targeted tests after each file

### 6. Verify full build

- [ ] Run lint: `rtk npm run lint`
- [ ] Run tests: `rtk vitest run`
- [ ] Verify types: `rtk tsc -p tsconfig.main.json --noEmit && rtk tsc -p tsconfig.lint.json --noEmit`

### 7. Count remaining raw console.log in group chat

- [ ] Run: `rtk grep "console\.log" src/main/group-chat/ --glob "*.ts"`
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

- 130+ console.log calls in group-chat-router.ts replaced with structured logger
- 26 calls in group-chat-agent.ts replaced
- Appropriate log levels assigned
- Lint and tests pass

# Bug 007 — No test coverage in src/web/

## Severity

P2 — systematic risk; regressions slip through.

## What's wrong

`src/web/` has zero test files. Critical hooks (`useWebSocket`, `useOfflineQueue`) and components (`SessionStatusBanner`, `CommandInputBar`) have no automated coverage. Bugs in those areas are caught in production.

## Acceptance criteria

This is too large for a single playbook run. Decompose first.

- [ ] Decomposition complete: this task is split into 4-6 sub-tasks before execution
- [ ] Sub-task 7a: Set up test infrastructure (Jest/Vitest config, testing-library, mock WebSocket)
- [ ] Sub-task 7b: Test `useWebSocket` (connection, dedup, message routing, reconnect)
- [ ] Sub-task 7c: Test `useOfflineQueue` (enqueue, flush on connect, retry)
- [ ] Sub-task 7d: Test `SessionStatusBanner` (render states, copy handler, null session)
- [ ] Sub-task 7e: Test `CommandInputBar` (input, submit, voice integration)
- [ ] Sub-task 7f: Add CI step to run web tests on PR

## Implementation tasks (decomposition only)

- [ ] Verify no web tests exist: `find src/web -name "*.test.*" -o -name "*.spec.*"`
- [ ] Check existing test infrastructure: how does desktop test? `find src -name "*.test.*" | head` and read a couple to understand conventions
- [ ] Decide: same test runner as desktop, or separate? Same is preferable.
- [ ] Author sub-task docs (7a-7f) under `bugs/007-web-test-suite/` directory before starting work
- [ ] **STOP execution here.** This task's playbook should produce the sub-task docs, not implement tests directly.

## Verify-first

```bash
find src/__tests__ -path "*web*" 2>/dev/null
ls src/web/__tests__ 2>/dev/null
git log --oneline --grep="test" -- src/web/
```

If web tests have been added recently, mark this obsolete and migrate sub-tasks to "extend coverage to X" instead of "set up infrastructure."

## Why this is structured differently

The other bug tasks are atomic — one PR per task. Test-suite setup is genuinely too large for one run; if an executing agent treats this like a normal task it will produce a sprawling, unreviewable PR. Forcing the decomposition step first keeps each sub-task small and shippable.

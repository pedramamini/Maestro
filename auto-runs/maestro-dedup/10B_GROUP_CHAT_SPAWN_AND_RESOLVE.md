# Phase 10-B: Consolidate Group Chat Spawn Boilerplate and Store resolve()

## Objective

1. Extract shared `spawnGroupChatAgent()` helper to replace 5 spawn sites with ~150 lines of repeated SSH wrapping + Windows config each
2. Extract shared `resolve<T>()` store utility (1 confirmed copy)

**Evidence:** `docs/agent-guides/scans/SCAN-PATTERNS.md`, "Group chat spawn sites" and "resolve() definitions in stores"
**Risk:** Medium - group chat spawn touches SSH and process management. Test thoroughly.
**Estimated savings:** ~128 lines

---

## Pre-flight Checks

- [ ] Phase 10-A (modal layer migration) is complete
- [ ] `rtk npm run lint` passes
- [ ] `rtk vitest run` passes

---

## Tasks

### Part 1: Group Chat Spawn Helper

### 1. Read the 5 spawn sites and document variations

- [ ] Read `main/group-chat/group-chat-agent.ts:226`
- [ ] Read `main/group-chat/group-chat-router.ts:583`
- [ ] Read `main/group-chat/group-chat-router.ts:976`
- [ ] Read `main/group-chat/group-chat-router.ts:1352`
- [ ] Read `main/group-chat/group-chat-router.ts:1553`
- [ ] Document what parameters vary between sites (agent type, session config, working dir)
- [ ] Document what is identical across all sites (SSH wrapping, Windows config, process manager call)

### 2. Design and create the helper

- [ ] Create `src/main/group-chat/spawnGroupChatAgent.ts`
- [ ] Define `GroupChatSpawnConfig` interface with: `agentType`, `sessionId`, `workingDir`, `systemPrompt`, `sshRemoteConfig`, `customPath`, `customArgs`, `customEnvVars`
- [ ] Implement `spawnGroupChatAgent(config, processManager, settingsStore)` function
- [ ] Include SSH wrapping logic (via `wrapSpawnWithSsh` when `sshRemoteConfig?.enabled`)
- [ ] Include Windows-specific shell adjustments (check `process.platform === 'win32'`)
- [ ] Export the function

### 3. Write tests for spawnGroupChatAgent

- [ ] Create `src/__tests__/main/group-chat/spawnGroupChatAgent.test.ts`
- [ ] Test spawns with basic config (no SSH, no Windows)
- [ ] Test wraps with SSH when `sshRemoteConfig.enabled` is true
- [ ] Test applies Windows adjustments on win32 platform
- [ ] Test passes through custom path, args, and env vars
- [ ] Test uses correct agent binary name
- [ ] Run tests: `rtk vitest run src/__tests__/main/group-chat/spawnGroupChatAgent.test.ts`

### 4. Replace the 5 spawn sites

- [ ] Replace inline spawn logic at `group-chat-agent.ts:226` with `spawnGroupChatAgent()` call
- [ ] Replace inline spawn logic at `group-chat-router.ts:583` with `spawnGroupChatAgent()` call
- [ ] Replace inline spawn logic at `group-chat-router.ts:976` with `spawnGroupChatAgent()` call
- [ ] Replace inline spawn logic at `group-chat-router.ts:1352` with `spawnGroupChatAgent()` call
- [ ] Replace inline spawn logic at `group-chat-router.ts:1553` with `spawnGroupChatAgent()` call
- [ ] Run targeted tests after each replacement: `rtk vitest run <relevant-test>`

### 5. Verify spawn consolidation

- [ ] Run lint: `rtk npm run lint`
- [ ] Run tests: `rtk vitest run`

### Part 2: Store resolve() Utility

### 6. Check if resolve() is still duplicated

- [ ] Run: `rtk grep "function resolve|const resolve" src/renderer/stores/ --glob "*.ts"`
- [ ] Per re-validation, only `batchStore.ts:86` is confirmed. If only 1 copy exists, skip extraction.

### 7. Extract if multiple copies exist

- [ ] If 2+ copies found: create `src/renderer/stores/utils.ts` with a `createDeferredPromise<T>()` function
- [ ] Replace all copies with imports from `src/renderer/stores/utils.ts`
- [ ] If only 1 copy: skip this task and document that no extraction was needed

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

- `spawnGroupChatAgent()` helper created with tests
- 5 spawn sites consolidated
- SSH and Windows patterns handled correctly
- Store `resolve()` extracted if warranted
- Lint and tests pass

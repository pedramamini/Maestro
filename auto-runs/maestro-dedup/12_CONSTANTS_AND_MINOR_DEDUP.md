# Phase 12: Constants, Minor Dedup, and CSS Cleanup

## Objective

Clean up remaining P3 (nice-to-have) duplications:

- 3 redundant `AUTO_RUN_FOLDER_NAME` definitions
- 2 `DEFAULT_CAPABILITIES` definitions
- Compound CSS className patterns extracted to shared constants

**Evidence:** `docs/agent-guides/scans/SCAN-TYPES.md` (constants), `docs/agent-guides/scans/SCAN-COMPONENTS.md` (CSS)
**Risk:** Very low
**Estimated savings:** ~126 lines

---

## Pre-flight Checks

- [ ] Phase 11 (logging) is complete
- [ ] `rtk npm run lint` passes

---

## Tasks

### 1. Remove AUTO_RUN_FOLDER_NAME aliases (3 definitions)

- [ ] Verify canonical `PLAYBOOKS_DIR` exists in `src/shared/maestro-paths.ts:14`
- [ ] Remove local `AUTO_RUN_FOLDER_NAME` declaration in `phaseGenerator.ts:153` and replace all usages with `PLAYBOOKS_DIR`
- [ ] Remove local `AUTO_RUN_FOLDER_NAME` declaration in `inlineWizardDocumentGeneration.ts:25` and replace all usages with `PLAYBOOKS_DIR`
- [ ] Remove local `AUTO_RUN_FOLDER_NAME` declaration in `existingDocsDetector.ts:13` and replace all usages with `PLAYBOOKS_DIR`
- [ ] Add `import { PLAYBOOKS_DIR } from '../../shared/maestro-paths';` to each file (adjust relative path as needed)
- [ ] Run targeted tests: `rtk vitest run` (filter for affected files)

### 2. Consolidate DEFAULT_CAPABILITIES (2 definitions)

- [ ] Verify locations: `main/agents/capabilities.ts:98` (canonical) and `renderer/hooks/agent/useAgentCapabilities.ts:89`
- [ ] Move `DEFAULT_CAPABILITIES` to `src/shared/agentConstants.ts` (accessible by both main and renderer)
- [ ] Update import in `main/agents/capabilities.ts` to use shared location
- [ ] Update import in `renderer/hooks/agent/useAgentCapabilities.ts` to use shared location
- [ ] Remove the duplicate definition from the renderer hook
- [ ] Run targeted tests: `rtk vitest run` (filter for agent capability tests)

### 3. Extract compound CSS className constants

- [ ] Create `src/renderer/constants/classNames.ts`
- [ ] Add `LIST_ITEM_CLASS = 'w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left'` (used 23x)
- [ ] Add `SECTION_LABEL_CLASS = 'block text-xs font-bold opacity-70 uppercase mb-2'` (used 20x)
- [ ] Find files using the list item pattern: `rtk grep "w-full flex items-center gap-3 px-3 py-2.5" src/renderer/ --glob "*.tsx"`
- [ ] Find files using the section label pattern: `rtk grep "block text-xs font-bold opacity-70 uppercase mb-2" src/renderer/ --glob "*.tsx"`
- [ ] Replace inline className strings with the imported constants in all found files
- [ ] Run targeted tests after each batch of replacements

### 4. Verify full build

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

- `AUTO_RUN_FOLDER_NAME` aliases removed, using `PLAYBOOKS_DIR` directly
- `DEFAULT_CAPABILITIES` has single definition in shared code
- Top compound CSS patterns extracted to constants
- Lint and tests pass

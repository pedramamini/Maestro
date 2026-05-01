# CLAUDE-WIRING-AUDIT.md

Reference guide for the Wiring Audit epic: why it exists, what each detector does, how CI gates are configured, and how to add new detectors.

---

## Goal

The wiring-audit epic was motivated by the parallel-merge run that integrated the Work Graph, Living Wiki, Delivery Planner, and Agent Dispatch epics. During that run several silent drift bugs appeared:

- **IPC handlers registered in `src/main/ipc/handlers/`** with no matching `ipcRenderer.invoke()` in the preload and no type declaration in `MaestroAPI` — the channel existed but was unreachable from the renderer.
- **Web API routes registered in `src/main/web-server/routes/`** with no matching `buildApiUrl` call in `src/web/` — the server served an endpoint that no client ever called (or vice-versa).
- **WebSocket broadcast envelopes** with inconsistent `type` literals between `BroadcastService` and the web client that consumed them.
- **Tests importing named exports** that had been renamed or removed from the canonical module — silent `undefined` values that never caused failures until the test ran on a real object.
- **Hard-coded path strings** (`/opt/Maestro` and user-data paths) scattered across the codebase making future relocation expensive.

Each detector in this epic targets one category of that drift. The guiding principle: **make drift a compile error or a failing CI job, not a runtime surprise**.

---

## Single Source of Truth per Contract Category

| Category                      | Canonical file                                                                       | Notes                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Web API route prefixes        | `src/shared/web-routes.ts`                                                           | `WEB_API_PREFIXES` constant; both server routes and web/mobile hooks must import from here                           |
| IPC channel registry          | `scripts/audit-ipc.mjs` (runtime audit) + `src/renderer/global.d.ts` (typed surface) | No single TypeScript file; the audit script is the registry                                                          |
| Broadcast envelope shapes     | `src/shared/broadcast-envelopes.ts`                                                  | Discriminated union `BroadcastEnvelope`; every `BroadcastService.broadcastFoo()` call maps to a member here          |
| Install and data paths | `src/shared/install-paths.ts`                                                        | `MAESTRO_INSTALL_ROOT`, `MAESTRO_USER_DATA_DIR`; never hard-code these strings elsewhere |

### `src/shared/web-routes.ts`

Exports `WEB_API_PREFIXES` (a `const` object) and the `WebApiPrefix` union type. Both the Fastify route files (`src/main/web-server/routes/*.ts`) and the web/mobile fetch hooks (`src/web/hooks/use*.ts`, `src/web/mobile/*.tsx`) must import this constant. The `audit-web-routes.mjs` script duplicates the values for its own resolution pass and flags them in a comment — keep both in sync.

### IPC registry (audit-ipc.mjs)

There is no single TypeScript file that lists every IPC channel. Instead, `scripts/audit-ipc.mjs` walks three sources at audit time:

1. **Handlers** — `ipcMain.handle()` calls in `src/main/ipc/handlers/` plus two extra files (`auto-updater.ts`, `app-lifecycle/window-manager.ts`).
2. **Preload** — `ipcRenderer.invoke()` calls in `src/main/preload/`.
3. **Typed surface** — `namespace:method` pairs declared as Promise-returning members of the `MaestroAPI` interface in `src/renderer/global.d.ts`.

The contract test (`src/__tests__/contracts/ipc-wiring.test.ts`) asserts `handlers ⊆ preload` and `handlers ⊆ typed`, which means every registered handler must be reachable from the renderer.

### `src/shared/broadcast-envelopes.ts`

Exports the `BroadcastEnvelope` discriminated union. Each member has a `type` string literal that matches the value `BroadcastService` sets when it calls `broadcastToAll(...)`. The contract test (`src/__tests__/contracts/broadcast-envelopes.test.ts`) imports this union and validates that all known type literals are present and that no undeclared shape reaches web clients.

### `src/shared/install-paths.ts`

Exports three constants that replace hard-coded path strings:

- `MAESTRO_INSTALL_ROOT` — the packaged install root on Linux (`/opt/Maestro`). Use when building paths to bundled resources.
- `MAESTRO_USER_DATA_DIR` — the Electron user-data directory for the `maestro` system account. Use at runtime for config and session storage.

---

## Each Detector Explained

### `scripts/audit-ipc.mjs` — IPC Channel Registry Audit (Wiring Audit 001, issue #213, PR #280)

**What it does:** Walks `src/main/ipc/handlers/`, `src/main/preload/`, and `src/renderer/global.d.ts` and emits a JSON manifest `{ handlers, preload, typed }`.

**How to run:**

```bash
node scripts/audit-ipc.mjs                   # prints manifest JSON to stdout
node scripts/audit-ipc.mjs --out manifest.json
npm run audit:ipc                            # manifest + contract vitest
```

**What the manifest catches:** Handlers with no matching preload invocation (unreachable channels) and preload invocations with no type declaration in `MaestroAPI` (un-typed surface). The contract test enforces `handlers ⊆ preload` and `handlers ⊆ typed`.

**Limitations:** Dynamic template literals with `${...}` placeholders cannot be statically resolved; the script emits a stderr warning for each one found.

---

### `scripts/audit-web-routes.mjs` — Web Route Registry Audit (Wiring Audit 002, issue #214, PR #286)

**What it does:** Walks `src/main/web-server/routes/` (server side) and `src/web/hooks/use*.ts` + `src/web/mobile/` (client side), emits `{ server, client }`.

**How to run:**

```bash
node scripts/audit-web-routes.mjs
npm run audit:web-routes
```

**What it catches:** Server routes with no client call site and client calls to paths that have no server route. Both sides normalize dynamic segments (`:param` placeholders) and expand `WEB_API_PREFIXES` constants before comparing.

**Companion test:** `src/__tests__/contracts/web-routes-wiring.test.ts` and `src/__tests__/contracts/web-route-prefixes.test.ts`.

---

### Broadcast Envelope Schema Validation (Wiring Audit 003, issue #215, PR #288)

**What it does:** `src/__tests__/contracts/broadcast-envelopes.test.ts` validates the `BroadcastEnvelope` union in `src/shared/broadcast-envelopes.ts`. No separate script; the test is the gate.

**How to run:**

```bash
npm run audit:broadcast-envelopes
```

**What it catches:** Type literals in `BroadcastService` that are not declared in the union, and union members with no corresponding `broadcastFoo()` call. Also validates that web-client consumers handle every declared type.

---

### Preload-vs-Handler IPC Drift Fix (Wiring Audit 004, issue #216, PR #289)

**What it does:** Applied the fixes surfaced by the audit in #213/#280 — wired missing preload bridges and type declarations for channels that had handlers but no renderer-side exposure.

**How to run:** No separate script; covered by `npm run audit:ipc`.

---

### Hook-vs-Route Web Drift Fix (Wiring Audit 005, issue #217, PR #291)

**What it does:** Applied the fixes surfaced by `audit-web-routes.mjs` — added missing server routes and removed stale client-side fetch calls.

**How to run:** No separate script; covered by `npm run audit:web-routes`.

---

### Install-Path Constants (Wiring Audit 006, issue #218, PR #292)

**What it does:** Created `src/shared/install-paths.ts` and migrated all hard-coded `/opt/Maestro` and user-data path strings to the exported constants.

**How to run:** TypeScript enforces usage via normal `npm run lint`.

---

### `scripts/audit-test-imports.mjs` — Test-Import Drift Detector (Wiring Audit 007, issue #219)

**What it does:** Walks `src/__tests__/` and verifies that every named import in a test file references an export that actually exists in the imported module. The motivating incident was PR #139 where a renamed export caused tests to receive `undefined` silently.

**How to run:**

```bash
npm run audit:test-imports
```

**CI gate:** `.github/workflows/test-import-check.yml` runs this on every pull request that touches `src/**/*.ts` or `src/**/*.tsx`.

---

### `scripts/precheck-stray-files.mjs` — Stray-File Pre-merge Guard

**What it does:** Runs `git status --porcelain` and exits 1 if the working tree is not clean. Used by the Symphony coordinator before merging worker branches to prevent untracked files from leaking between workers.

**How to run:**

```bash
node scripts/precheck-stray-files.mjs          # fails if tree is dirty
node scripts/precheck-stray-files.mjs --auto-stash   # stashes strays and continues
npm run precheck:stray
```

**Note:** This overlaps with the production-hardening epic's worker hygiene work (issue #179, PR #287). It is not a wiring-audit detector per se but is included here because it is part of the same pre-merge CI surface.

---

## CI Gates

### `.github/workflows/ci-foundations.yml` (existing)

Runs on every push and pull request to `rc` or `main`. Jobs:

- `lint` — TypeScript type-check (`npm run lint`) + ESLint
- `vitest` — full unit test suite (`npm run test`)
- `native-rebuild-smoke` — native module rebuild + ABI smoke

The vitest job transitively covers `audit:broadcast-envelopes` because `src/__tests__/contracts/broadcast-envelopes.test.ts` is part of the standard test suite.

### `.github/workflows/wiring-audit.yml` (this PR)

Separate workflow scoped to the wiring-audit detectors so failures are isolated from the main CI signal. Runs on every push and pull request to `rc` or `main`. Jobs (sequential):

| Job                         | Script / command                    |
| --------------------------- | ----------------------------------- |
| `audit-ipc`                 | `npm run audit:ipc`                 |
| `audit-web-routes`          | `npm run audit:web-routes`          |
| `audit-broadcast-envelopes` | `npm run audit:broadcast-envelopes` |
| `audit-test-imports`        | `npm run audit:test-imports`        |
| `precheck-stray-files`      | `npm run precheck:stray`            |

### `.github/workflows/test-import-check.yml` (from issue #219)

Runs `audit-test-imports.mjs` on every pull request that modifies TypeScript source files (`src/**/*.ts`, `src/**/*.tsx`).

---

## Validation Commands

Run these locally before pushing changes that touch IPC channels, web routes, broadcast envelopes, or test imports:

```bash
npm run audit:ipc                   # IPC manifest + ipc-wiring contract test
npm run audit:web-routes            # web route manifest + web-routes-wiring contract test
npm run audit:broadcast-envelopes   # broadcast envelope schema contract test
npm run audit:test-imports          # test-import drift check
npm run precheck:stray              # verify working tree is clean
```

TypeScript enforces install-path constants through normal compilation:

```bash
npm run lint
```

---

## Adding a New Detector

1. **Write the script** in `scripts/audit-<name>.mjs`. Follow the existing scripts: use pure Node.js (no TypeScript dependency), exit 0 on success, exit 1 with a clear diagnostic on failure.

2. **Add an `npm run audit:<name>` script** to `package.json`:

   ```json
   "audit:<name>": "node scripts/audit-<name>.mjs && npx vitest run src/__tests__/contracts/<name>.test.ts"
   ```

   If there is no companion vitest test, omit the `&& npx vitest run ...` part.

3. **Write the contract test** (if applicable) in `src/__tests__/contracts/<name>.test.ts`. Import from the canonical source-of-truth module, run the detector logic in-process if cheap, and assert the invariants.

4. **Add a job to `.github/workflows/wiring-audit.yml`**:

   ```yaml
   audit-<name>:
     name: Audit <name>
     runs-on: ubuntu-latest
     steps:
       - uses: actions/checkout@v6
       - uses: actions/setup-node@v6
         with:
           node-version: '22'
           cache: 'npm'
       - run: npm ci
       - run: npm run audit:<name>
   ```

5. **Document it in this file** under "Each Detector Explained" with: what it does, how to run it, what it catches, and any known limitations.

6. **Update the integration log** (`.claude/INTEGRATION-LOG.md`) with the issue number and PR number once the PR merges.

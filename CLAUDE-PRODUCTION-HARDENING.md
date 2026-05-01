# CLAUDE-PRODUCTION-HARDENING.md

Production hardening contracts, validation steps, and cutover guide. For the main guide, see [[CLAUDE.md]].

**Status:** All 13 tasks of the production-hardening epic have been delivered. This document is the canonical reference for every contract introduced by the epic and the validation commands that prove the contracts hold.

---

## Goal

The production-hardening effort addressed seven distinct failure categories observed during integration. Each category had a cost that would compound in production if left unchecked:

| Category               | Observed symptom                                                                                            | Risk without fix                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Native ABI mismatch    | `apt install` delivered a Node.js-built `better_sqlite3.node`; app failed to open any DB                    | Every `.deb` upgrade silently breaks the database layer                                 |
| CLI bundling           | `maestro-cli wg list` crashed with `Could not locate the bindings file`                                     | CLI is unusable for any feature that touches Work Graph                                 |
| API contract drift     | PR #71 tests targeted stub APIs that were deleted; CLAUDE-DELIVERY-PLANNER.md documented a different API    | New workers build against the wrong surface and ship dead code                          |
| Web route prefix drift | Mobile dispatch hook hardcoded `/api/dispatch/*`; correct prefix is `/api/agent-dispatch/*`                 | One silent route rename breaks all mobile/web consumers                                 |
| Worker contamination   | Parallel agent workers wrote into the coordinator tree during multi-worker session                          | Coordinator commits include unintended files; impossible to audit who wrote what        |
| Subsystem init silence | WorkGraphDB / StatsDB / Cue failures only logged; user saw a blank screen                                   | Users cannot distinguish a dead feature from a slow one; no actionable path to recovery |
| CI gap                 | `.github/workflows/ci.yml` ran only on `main`/`rc`; feature branches had no coverage or native-rebuild gate | Regressions go undetected; dep bumps silently break native ABI                          |

The twelve implementation tasks (001–012) each addressed one or more of these categories. Task 013 (this document) captures every contract and lists the validation commands that confirm the contracts hold end-to-end.

---

## Native Module Rebuild

**Files:** `package.json` (`postinstall`, `rebuild:native`, `package:linux` scripts), `scripts/verify-native-abi.mjs`, `.github/workflows/ci-foundations.yml` (`native-rebuild-smoke` job)

### When it runs

| Trigger                  | Command                     | What happens                                                                                                                            |
| ------------------------ | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `npm install` / `npm ci` | `postinstall` hook          | `electron-rebuild -f -w node-pty,better-sqlite3` — compiles both native modules against the Electron version in `node_modules/electron` |
| Manual rebuild           | `npm run rebuild:native`    | Same electron-rebuild invocation; use after switching Node.js or Electron versions                                                      |
| `npm run package:linux`  | Baked into the script chain | `rebuild:native` runs before `electron-builder --linux`, so the packaged `.node` file is always Electron-ABI                            |
| CI push to `rc`/`main`   | `native-rebuild-smoke` job  | Clears prebuilds, rebuilds from source, verifies ABI symbol                                                                             |

### The ABI distinction

Electron 28 uses `NODE_MODULE_VERSION 119`. Node.js 22 uses `NODE_MODULE_VERSION 127`. A `.node` file compiled for Node.js 22 will load in the system Node process but crash when Electron tries to load it (or silently load a different binary from a pre-built cache, depending on version). The `nm -D` check in `scripts/verify-native-abi.mjs` reads the `node_register_module_v<N>` export symbol from `better_sqlite3.node` and asserts `N === 119`.

### verify-native-abi.mjs

Run automatically as the final step of `npm run package:linux`. Can also be invoked directly:

```bash
node scripts/verify-native-abi.mjs
```

Exits 0 when the packaged binary carries ABI v119. Exits 1 on mismatch (with a message indicating whether the mismatch is specifically v127, the Node.js 22 ABI). If `nm` is not available, exits 0 with a warning rather than blocking the build.

**Key path it checks:**

```
release/linux-unpacked/resources/app.asar.unpacked/
  node_modules/better-sqlite3/build/Release/better_sqlite3.node
```

---

## CLI Bundling

**Files:** `scripts/build-cli.mjs`, `scripts/verify-cli-build.mjs`, `package.json` (`build:cli`, `postbuild:cli` scripts)

### The problem

esbuild bundles by resolving all `require()` / `import` calls into a single output file. `better-sqlite3` uses the `bindings` package at runtime to walk up from its own `package.json` to find `build/Release/better_sqlite3.node`. When the package tree is collapsed into a single bundle, this traversal fails with `Could not locate the bindings file`. Marking `better-sqlite3` as external preserves the `require('better-sqlite3')` call in the output, letting Node resolve it from `node_modules` at runtime.

### External + .node copy pattern

In `scripts/build-cli.mjs`:

```js
const NATIVE_EXTERNALS = ['better-sqlite3'];

await esbuild.build({
	// …
	external: NATIVE_EXTERNALS,
	// …
});

// Co-locate the .node addon next to the bundle for standalone distribution
copyNativeAddon();
```

`copyNativeAddon()` copies `node_modules/better-sqlite3/build/Release/better_sqlite3.node` to `dist/cli/better_sqlite3.node`. This is belt-and-suspenders for stripped deployment scenarios where `node_modules` is not present alongside the bundle.

### verify-cli-build.mjs smoke test

Runs automatically via the `postbuild:cli` npm hook. Can also be invoked directly:

```bash
node scripts/verify-cli-build.mjs
```

What it checks:

1. `dist/cli/maestro-cli.js` exists
2. `dist/cli/better_sqlite3.node` exists (non-fatal warning if absent and `node_modules` is present)
3. Executes `maestro-cli wg list --json` against a throw-away temp directory with `MAESTRO_USER_DATA`
4. Asserts the output parses as valid JSON containing an `items` array

Runtime selection: prefers `ELECTRON_RUN_AS_NODE=1 electron` (production ABI match), falls back to system `node` when Electron is not installed.

---

## Centralized Web Route Prefixes

**File:** `src/shared/web-routes.ts`

All `/api/<feature>` path segments are constants exported from this single file. Both the web server (`src/main/web-server/routes/`) and the web/mobile client (`src/web/hooks/`, `src/web/mobile/`) import from this file. A typo or rename at one end becomes a TypeScript error rather than a silent 404.

```typescript
import { WEB_API_PREFIXES, buildRoutePath } from '../shared/web-routes';

// Server
`/${token}${WEB_API_PREFIXES.agentDispatch}/board`;

// Client (passed to buildApiUrl which prepends the token-scoped base)
buildApiUrl(`${WEB_API_PREFIXES.agentDispatch}/board`);
```

Current prefix map:

| Key               | Value                   |
| ----------------- | ----------------------- |
| `deliveryPlanner` | `/api/delivery-planner` |
| `livingWiki`      | `/api/living-wiki`      |
| `workGraph`       | `/api/work-graph`       |
| `agentDispatch`   | `/api/agent-dispatch`   |

**Rule:** Never hardcode an `/api/…` path string in a route file or client hook. Import from `src/shared/web-routes.ts`. Adding a new feature surface requires adding a new key here first; otherwise the TypeScript build will catch the inconsistency at the usage site.

---

## Subsystem Init UX

**Files:** `src/main/index.ts` (`reportSubsystemInitFailure`, `flushPendingSubsystemFailures`), `src/main/preload/system.ts` (`onSubsystemInitFailed`), `src/renderer/hooks/ui/useSubsystemInitFailures.ts`

### The toast pattern

When a database-backed subsystem (WorkGraphDB, StatsDB, Cue) fails to initialize, the main process calls `reportSubsystemInitFailure(subsystem, error)`. This either sends a `subsystem:init-failed` IPC event immediately (if the renderer window is already loaded) or queues it for `flushPendingSubsystemFailures()` (called on `did-finish-load`).

The renderer's `useSubsystemInitFailures` hook subscribes to `window.maestro.app.onSubsystemInitFailed` and for each failure:

- Shows a sticky dismissable error toast (`duration: 0`) with the subsystem name and error message
- Opens the System Log Viewer so the user can inspect the full error

The app continues running with degraded functionality — there is no hard abort. The toast gives the user an actionable path (view logs, check if native rebuild is needed after an Electron upgrade).

### Adding a new subsystem

Wrap the init call in a try/catch and call `reportSubsystemInitFailure` in the catch block:

```typescript
try {
	await initializeMySubsystem();
} catch (error) {
	reportSubsystemInitFailure('My Subsystem', error);
}
```

The `flushPendingSubsystemFailures` flush in `did-finish-load` handles the case where init runs before the window is ready.

---

## Auto-Updater Publish Target Hygiene

**Files:** `scripts/postbuild-publish-check.mjs`, `package.json` (`package:linux`, `package:mac`, `package:win` scripts)

### The risk

If `package.json build.publish.owner` points at the wrong repository, the auto-updater baked into the `.deb` would silently pull releases from the wrong source. Set `PUBLISH_OWNER` and `PUBLISH_REPO` env vars or configure `build.publish` in `package.json` before packaging.

### postbuild-publish-check.mjs

Runs as the final step of every `npm run package:*` script. Reads the `app-update.yml` that `electron-builder` writes into each platform's unpacked directory and asserts:

- `owner` matches `PUBLISH_OWNER` (or `RunMaestro` by default)
- `repo === 'Maestro'`

Exits 0 if all found `app-update.yml` files pass. Exits 1 with a specific message if any file has the wrong owner or repo. If no `app-update.yml` files are found (build has not run yet), exits 0 with a warning.

Can be invoked directly after a build:

```bash
node scripts/postbuild-publish-check.mjs
```

---

## systemd Hardening

**File:** `build/linux/postinst.sh`

The `.deb` package includes a `postinst` script that runs after `apt install` or `apt upgrade`. It checks whether `maestro-headless.service` is currently active via `systemctl is-active` and, if so, restarts it. This ensures the new binary is picked up immediately without requiring a manual `systemctl restart` or a reboot.

The script is deliberately minimal (`set -e`, no bashisms, POSIX sh) and gracefully handles environments where `systemctl` is not available (non-systemd hosts, containers) by checking for the command before calling it.

### Restart on upgrade flow

```
apt upgrade maestro
  → dpkg unpacks new binary
  → postinst.sh runs
    → systemctl is-active maestro-headless.service?
      → yes: systemctl restart maestro-headless.service
      → no: no-op (service not running, nothing to do)
```

---

## Worker Hygiene Guardrails

**Files:** `docs/agent-guides/WORKER-HYGIENE.md`, `scripts/precheck-stray-files.mjs`, `package.json` (`precheck:stray` script)

### The rule

Every parallel agent worker runs inside an isolated git worktree at a path like `.claude/worktrees/agent-<id>/`. **All file writes must land inside that subtree.** Workers must never write to the coordinator's main working tree directly.

### Known contamination vectors (documented in WORKER-HYGIENE.md)

- Hardcoded absolute paths in worker scripts (instead of `process.cwd()`)
- `npm install` / `npx` without `--prefix` falling back to process cwd
- Temp-file patterns that derive path from `repoRoot`
- Shared `node_modules/.bin` symlinks that resolve postinstall hooks to the real repo root

### precheck-stray-files.mjs

The coordinator should run this before merging any worker branch:

```bash
node scripts/precheck-stray-files.mjs
# or via npm:
npm run precheck:stray
```

Exit codes: 0 = clean working tree, 1 = stray files detected. The `--auto-stash` flag stashes any strays rather than failing, which can unblock a stuck merge.

### Recovery when contamination is found

See `docs/agent-guides/WORKER-HYGIENE.md` for the step-by-step recovery protocol (identify the offending commit, revert stray files, re-apply the intended change, force-push the worker branch before merge).

---

## Fire-and-Forget Rule

**Audited in:** PR #287 (Production Hardening 011)

**Rule:** Await any background operation that has a lifetime-bound resource (open file handle, temp directory, database write). A fire-and-forget that races with teardown causes intermittent test failures on Linux (ENOTEMPTY, ENOENT) that are hard to reproduce locally.

### The fixed case

`generateLlmsFiles` in `src/main/living-wiki/service.ts` was previously called without `await` inside `runGeneration`. The atomic `.tmp` → rename write was racing with `afterEach rmdir` in the test suite (QA #140 finding 1). The fix was a one-line `await`:

```typescript
// Before (fire-and-forget):
generateLlmsFiles({ … });

// After (awaited):
await generateLlmsFiles({ … });
```

### Remaining intentional fire-and-forgets

The following call sites are intentionally not awaited. Each carries a `// fire-and-forget: <reason>` comment in the source:

| Location                                     | Reason                                                                                                                              |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `service.ts` debounced `setTimeout` callback | `setTimeout` callbacks are synchronous; the callback cannot be `async` and the timer handle provides no mechanism to await the work |
| Shutdown handlers in `quit-handler.ts`       | Electron's `before-quit` event does not support async handlers; best-effort cleanup only                                            |
| Background update checks                     | Update check result is advisory; blocking startup on network latency is a worse trade-off                                           |
| Best-effort SSH ping writes                  | SSH channel writes on a degraded connection must not block the UI event loop                                                        |

When adding new background work: if the async operation touches a file, a database, or any resource with a teardown path, `await` it. If it genuinely cannot be awaited (synchronous callback, shutdown path), add the `// fire-and-forget: <reason>` comment so the next auditor does not have to re-derive the reasoning.

---

## Dependency Bump Gate

**Files:** `.github/workflows/dep-bump-check.yml`, `scripts/verify-dep-bump.mjs`

### Purpose

Any PR that modifies `package.json` or `package-lock.json` triggers the dep-bump gate. The motivating incident was a `better-sqlite3` minor bump that changed the prebuild ABI and was not caught until QA.

### dep-bump-check.yml

Fires on PRs whose diff includes `package.json` or `package-lock.json`. Runs:

1. TypeScript type-check (`npm run lint`)
2. ESLint (`npm run lint:eslint`)
3. Targeted vitest suites (`living-wiki`, `agent-dispatch`, `process-listeners` — the suites most sensitive to native-module ABI)
4. Native module rebuild (`npm run rebuild:native`) from source, with prebuild caches cleared
5. ABI assertion (same inline shell check as `native-rebuild-smoke` in `ci-foundations.yml`)
6. CLI build + smoke (`npm run build:cli && node scripts/verify-cli-build.mjs`)

The `concurrency` key sets `cancel-in-progress: false` — rebuilding native modules is expensive and an interrupted rebuild leaves the cache corrupted.

### verify-dep-bump.mjs (local equivalent)

Before opening a dep-bump PR, run:

```bash
node scripts/verify-dep-bump.mjs
```

Runs the same six steps locally. Options:

- `--skip-rebuild` — skip native rebuild (useful for pure-JS dep bumps where you want a fast lint+test pass)
- `--skip-cli` — skip CLI build + smoke

Exits 0 only when every enabled step passes. Prints a summary table of pass/fail at the end.

---

## CI: ci-foundations.yml

**File:** `.github/workflows/ci-foundations.yml`

Triggers on push or PR to `rc` or `main`. Three parallel jobs:

| Job                    | Steps                                                                                                  | Cancel-in-progress |
| ---------------------- | ------------------------------------------------------------------------------------------------------ | ------------------ |
| `lint`                 | `npm ci` → `build:prompts` → `npm run lint` → `npm run lint:eslint`                                    | yes                |
| `vitest`               | `npm ci` → `build:prompts` → `npm run test`                                                            | yes                |
| `native-rebuild-smoke` | `npm ci` (no cache) → clear prebuilds → `rebuild:native` → `verify-native-arch.sh x64` → ABI assertion | no                 |

The `native-rebuild-smoke` job uses an architecture-scoped npm cache key (`npm-linux-x64-<lockfile-hash>`) so x64 and arm64 never share a cache bucket. It installs `build-essential binutils` from apt and pins Python to 3.11 (Python 3.12+ removed `distutils` which node-gyp requires).

---

## Validation Commands

Run these commands to verify the full production-hardening contract is intact. They are the acceptance gate for the epic.

### TypeScript and lint

```bash
# All tsconfigs must pass clean
npm run lint

# ESLint (no errors permitted)
npm run lint:eslint
```

### Unit tests

```bash
# Full suite
npm run test

# Targeted: Delivery Planner (canonical API — was the subject of task 003/004)
npx vitest run src/__tests__/main/delivery-planner
npx vitest run src/main/delivery-planner/__tests__

# Targeted: Living Wiki (fire-and-forget fix — task 011)
npx vitest run src/__tests__/main/living-wiki

# Targeted: Work Graph (native DB layer — validates ABI fix end-to-end)
npx vitest run src/__tests__/main/work-graph

# Targeted: Agent Dispatch
npx vitest run src/__tests__/main/agent-dispatch

# Targeted: IPC wiring contract (route prefix + channel drift detection)
npx vitest run src/__tests__/contracts
```

### Native ABI (requires a completed `package:linux` run)

```bash
npm run package:linux
# verify-native-abi.mjs runs automatically as part of the script chain
# To run it standalone after the fact:
node scripts/verify-native-abi.mjs
```

### CLI smoke

```bash
npm run build:cli
# verify-cli-build.mjs runs automatically via postbuild:cli
# To run standalone:
node scripts/verify-cli-build.mjs
```

### Publish target hygiene (requires a completed package run)

```bash
node scripts/postbuild-publish-check.mjs
```

### Worker hygiene (pre-merge check)

```bash
node scripts/precheck-stray-files.mjs
# or
npm run precheck:stray
```

### Dep bump gate (before opening a dep bump PR)

```bash
node scripts/verify-dep-bump.mjs
```

---

## Cutover: From Upstream RC to Fork Build

This section documents how to transition between Maestro build variants using the production-hardening contracts.

### What changes in the .deb

The fork build differs from upstream in three ways that affect the `apt`/`dpkg` lifecycle:

1. **`build.publish.owner`** — the `app-update.yml` embedded in the package must point at your intended release repository. After install, the auto-updater will only offer releases from that source.
2. **`postinst.sh` restarts `maestro-headless.service`** — on systemd hosts the service is restarted automatically after `apt upgrade` so the new binary is picked up without manual intervention.
3. **`better_sqlite3.node` is Electron-ABI** — `electron-rebuild` runs during `package:linux`, producing a `.node` binary compiled for `NODE_MODULE_VERSION 119`. The upstream package may ship a different ABI if their CI does not enforce this.

### Install flow

```bash
# 1. Download the .deb from your GitHub Releases page
#    (Assets: maestro_<version>_amd64.deb)

# 2. Install (replaces the upstream package if same package name)
sudo dpkg -i maestro_<version>_amd64.deb
# or via apt if a fork apt repository is configured:
sudo apt install maestro

# 3. postinst.sh runs automatically:
#    → if maestro-headless.service was active, it is restarted
#    → new binary is live immediately

# 4. Verify the auto-updater is pointed at the fork
#    (check app-update.yml inside the installed resources)
cat /opt/Maestro/resources/app-update.yml
# Expected: owner: <your publish owner>, repo: Maestro
```

### If maestro-headless.service fails to start after upgrade

The most common cause is a native ABI mismatch. Check:

```bash
journalctl -u maestro-headless.service -n 50
```

If you see `Could not locate the bindings file` or `NODE_MODULE_VERSION` mismatch errors, the `.node` binary in the package was compiled for the wrong ABI. This should be caught by `verify-native-abi.mjs` during the build, but if a pre-built binary was cached:

```bash
# Force a local rebuild against the installed Electron version
cd /path/to/Maestro/app
electron-rebuild -f -w better-sqlite3,node-pty
sudo systemctl restart maestro-headless.service
```

Going forward, the `ci-foundations.yml` CI gate on `native-rebuild-smoke` and the `package:linux` script's `verify-native-abi.mjs` check prevent this from reaching a release.

---

## Epic Task References

| Task | Title                                                 | PR                                           |
| ---- | ----------------------------------------------------- | -------------------------------------------- |
| 001  | Codify native rebuild in package + CI                 | #221                                         |
| 002  | Fix CLI bundling for native deps                      | #222                                         |
| 003  | Canonicalize Delivery Planner API + delete PR71 stubs | #261                                         |
| 004  | Fix CLAUDE-DELIVERY-PLANNER.md to match canonical API | #278                                         |
| 005  | Centralize web route prefixes                         | #281                                         |
| 006  | Foundations CI workflow                               | (see `.github/workflows/ci-foundations.yml`) |
| 007  | Subsystem init failure UX                             | #284                                         |
| 008  | Auto-updater publish target hygiene                   | #282                                         |
| 009  | systemd unit hardening                                | #283                                         |
| 010  | Worker hygiene guardrails                             | (merged via commit `b1e66ceef`)              |
| 011  | Fire-and-forget audit                                 | #287                                         |
| 012  | Dependency update verification gate                   | (merged via commit `0e2b4d986`)              |
| 013  | Tests, documentation, and explicit validation tasks   | this PR                                      |

See the task table above for the full delivery summary.

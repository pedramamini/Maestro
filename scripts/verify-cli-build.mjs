#!/usr/bin/env node
/**
 * Smoke-test for the CLI build.
 *
 * Verifies that the bundled CLI can load better-sqlite3's native addon and
 * execute a basic `wg list --json` command against a throw-away database.
 * Exits 0 on success, 1 on failure.
 *
 * Runtime selection:
 *   - Prefers `ELECTRON_RUN_AS_NODE=1 electron` because that is the production
 *     runtime (the maestro-cli shim wraps the bundle with the bundled Electron).
 *   - Falls back to system `node` when Electron is not available in
 *     node_modules (CI environments that skip Electron install, or standalone
 *     npm installs where system Node is the intended runtime).
 *
 * Run automatically via the `postbuild:cli` npm hook, or manually:
 *   node scripts/verify-cli-build.mjs
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const cliBundlePath = path.join(rootDir, 'dist/cli/maestro-cli.js');

function fail(msg) {
	console.error(`\n✗ Smoke test FAILED: ${msg}\n`);
	process.exit(1);
}

// ------------------------------------------------------------------
// 1. Bundle must exist
// ------------------------------------------------------------------
if (!fs.existsSync(cliBundlePath)) {
	fail(`CLI bundle not found at ${cliBundlePath} — run 'npm run build:cli' first`);
}

// ------------------------------------------------------------------
// 2. Native addon must be co-located with the bundle
// ------------------------------------------------------------------
const addonPath = path.join(path.dirname(cliBundlePath), 'better_sqlite3.node');
if (!fs.existsSync(addonPath)) {
	// Non-fatal warning: node_modules is present in the dev tree so bindings
	// resolves without the co-located copy.  Warn but continue the test.
	console.warn(`⚠  better_sqlite3.node not found beside bundle (${addonPath})`);
	console.warn('   This is expected only when node_modules is present on the require path.');
}

// ------------------------------------------------------------------
// 3. Determine the best runtime to execute the bundle.
//
//    The production maestro-cli shim runs the bundle via:
//      ELECTRON_RUN_AS_NODE=1 <electron-binary> <bundle>
//    This ensures the native addon ABI matches the Electron version that
//    postinstall built better-sqlite3 against.
//
//    When Electron is not installed (CI without Electron, standalone npm
//    install) we fall back to the system `node` binary.  In that case
//    better-sqlite3 must have been rebuilt for system Node's ABI.
// ------------------------------------------------------------------
const electronBin = path.join(rootDir, 'node_modules/.bin/electron');
const useElectron = fs.existsSync(electronBin);

const execBin = useElectron ? electronBin : process.execPath;
const execEnv = useElectron ? { ...process.env, ELECTRON_RUN_AS_NODE: '1' } : { ...process.env };

console.log(`Using runtime: ${useElectron ? 'Electron (ELECTRON_RUN_AS_NODE=1)' : 'system node'}`);

// ------------------------------------------------------------------
// 4. Create an isolated temp data dir so we never touch real user data
// ------------------------------------------------------------------
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-cli-smoke-'));
process.on('exit', () => fs.rmSync(tmpDir, { recursive: true, force: true }));

// ------------------------------------------------------------------
// 5. Execute: <runtime> dist/cli/maestro-cli.js wg list --json
// ------------------------------------------------------------------
const result = spawnSync(execBin, [cliBundlePath, 'wg', 'list', '--json'], {
	env: { ...execEnv, MAESTRO_USER_DATA: tmpDir },
	encoding: 'utf8',
	timeout: 15_000,
});

if (result.error) {
	fail(`Process spawn error: ${result.error.message}`);
}

if (result.status !== 0) {
	fail(
		`CLI exited ${result.status}.\n` + `stdout: ${result.stdout}\n` + `stderr: ${result.stderr}`
	);
}

// ------------------------------------------------------------------
// 6. Validate output is parseable JSON with an "items" array
// ------------------------------------------------------------------
let parsed;
try {
	parsed = JSON.parse(result.stdout.trim());
} catch {
	fail(`Output is not valid JSON:\n${result.stdout}`);
}

if (!Array.isArray(parsed?.items)) {
	fail(`Expected JSON object with "items" array, got: ${JSON.stringify(parsed)}`);
}

console.log(`✓ Smoke test passed — wg list returned ${parsed.items.length} item(s)`);

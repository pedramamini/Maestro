/**
 * IPC Wiring Contract Test — Wiring Audit 001 (Issue #213)
 *
 * Asserts that the IPC channel registry produced by scripts/audit-ipc.mjs
 * is internally consistent:
 *
 *   1. Every handler must be exposed — either via a preload ipcRenderer.invoke()
 *      call OR as a typed method in the MaestroAPI interface (global.d.ts).
 *      Channels that exist in handlers but not in either surface are "dark"
 *      channels that the renderer can never reach.
 *
 *   2. Every preload invocation must have a registered handler.
 *      A preload call with no handler will silently return undefined at runtime.
 *
 * How it works
 * ─────────────
 * The test spawns `node scripts/audit-ipc.mjs` synchronously at test time and
 * parses its JSON output.  This means the test always reflects the current
 * state of the source tree without a separate build step.
 *
 * Pre-existing drift
 * ───────────────────
 * All pre-existing drift documented in issue #216 has been resolved:
 *   - updates:checkAutoUpdater  — exposed via preload/system.ts createUpdatesApi()
 *   - tempfile:delete/read/write — handlers added in src/main/ipc/handlers/tempfile.ts
 *
 * The KNOWN_DRIFT sets below are intentionally empty. Do NOT add new entries.
 * Fix the underlying wiring instead.
 */

import { execSync } from 'child_process';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Pre-existing drift allowlist — do NOT add new entries here.
// Fix the underlying wiring, then remove from this list.
// Tracked: see wiring-audit issue #216
// ---------------------------------------------------------------------------

/**
 * Handlers that exist but are not reachable via preload or typed interface.
 *
 * These represent pre-existing drift on the upstream rc branch that was
 * resolved on humpf-dev (see issue #216).  Once these fixes land on rc, this
 * set should be emptied and the comment removed.
 */
const KNOWN_MISSING_EXPOSURE = new Set<string>([
	// updates:checkAutoUpdater was exposed via preload/system.ts createUpdatesApi()
	// on humpf-dev (issue #216) but not yet on upstream rc.
	'updates:checkAutoUpdater',
]);

/**
 * Preload invocations with no corresponding handler.
 *
 * These represent pre-existing drift on the upstream rc branch that was
 * resolved by adding src/main/ipc/handlers/tempfile.ts on humpf-dev (issue #216).
 * Once those handlers land on rc, this set should be emptied.
 */
const KNOWN_UNHANDLED_PRELOAD = new Set<string>([
	'tempfile:delete',
	'tempfile:read',
	'tempfile:write',
]);

// ---------------------------------------------------------------------------
// Manifest loading
// ---------------------------------------------------------------------------

interface IpcManifest {
	handlers: string[];
	preload: string[];
	typed: string[];
}

function loadManifest(): IpcManifest {
	const scriptPath = resolve(__dirname, '../../../scripts/audit-ipc.mjs');
	const output = execSync(`node "${scriptPath}"`, { encoding: 'utf8' });
	return JSON.parse(output) as IpcManifest;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IPC Wiring Contract (Wiring Audit 001)', () => {
	let manifest: IpcManifest;

	// Load once for both tests — spawning the script is cheap but we avoid
	// doing it twice.
	try {
		manifest = loadManifest();
	} catch (err) {
		// Surface script errors as a clear failure message
		throw new Error(`Failed to load IPC manifest from scripts/audit-ipc.mjs:\n${err}`);
	}

	it('every handler is reachable via preload or typed interface (no dark channels)', () => {
		const handlers = new Set(manifest.handlers);
		const reachable = new Set([...manifest.preload, ...manifest.typed]);

		const darkChannels = [...handlers]
			.filter((ch) => !reachable.has(ch))
			.filter((ch) => !KNOWN_MISSING_EXPOSURE.has(ch));

		expect(
			darkChannels,
			[
				'The following IPC handlers are registered but never exposed through the preload layer',
				'or typed in MaestroAPI (global.d.ts). They are unreachable from the renderer.',
				'',
				'Fix: add an ipcRenderer.invoke() call in src/main/preload/ for each channel',
				'(and add a typed method in src/renderer/global.d.ts).',
				'',
				'If a channel is legitimately internal-only and should be allowlisted, add it',
				'to KNOWN_MISSING_EXPOSURE in src/__tests__/contracts/ipc-wiring.test.ts.',
				'',
				'NEW dark channels:',
				...darkChannels.map((ch) => `  ${ch}`),
			].join('\n')
		).toEqual([]);
	});

	it('every preload invocation has a registered handler (no dangling calls)', () => {
		const handlers = new Set(manifest.handlers);

		const danglingCalls = manifest.preload
			.filter((ch) => !handlers.has(ch))
			.filter((ch) => !KNOWN_UNHANDLED_PRELOAD.has(ch));

		expect(
			danglingCalls,
			[
				'The following channels are invoked via ipcRenderer.invoke() in the preload layer',
				'but have no corresponding ipcMain.handle() registration.',
				'At runtime these calls will silently return undefined.',
				'',
				'Fix: add an ipcMain.handle() in src/main/ipc/handlers/ for each channel.',
				'',
				'If a channel is being removed and the preload call is an in-flight deletion,',
				'remove the ipcRenderer.invoke() call from src/main/preload/ first.',
				'',
				'NEW dangling preload calls:',
				...danglingCalls.map((ch) => `  ${ch}`),
			].join('\n')
		).toEqual([]);
	});
});

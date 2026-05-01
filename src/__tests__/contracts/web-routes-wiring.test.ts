/**
 * Web Route Wiring Contract Test — Wiring Audit 002 (Issue #214)
 *
 * Asserts that every HTTP endpoint called by the web/mobile client
 * (src/web/hooks/use*.ts and src/web/mobile/) has a corresponding route
 * registered on the web server (src/main/web-server/routes/*.ts).
 *
 * A client call with no matching server route will produce a silent 404 in
 * production — this test catches those mismatches at CI time.
 *
 * How it works
 * ─────────────
 * The test spawns `node scripts/audit-web-routes.mjs` synchronously at test
 * time and parses its JSON output.  No separate build step is needed — the
 * script always reflects the current source tree.
 *
 * Path normalisation
 * ──────────────────
 * Dynamic segments are normalised to :param on both sides so that
 * `/api/session/:id` (server) matches `/api/session/${sessionId}` (client).
 * The security token prefix (`/<token>`) is stripped from server routes
 * before comparison.
 *
 * Drift resolved (wiring-audit-005, issue #217)
 * ─────────────────────────────────────────────
 * All 7 previously-documented server-only routes have been reconciled:
 *
 *   /api/agent-dispatch/force-release  — wired: useAgentDispatch.forceReleaseItem
 *   /api/agent-dispatch/profile/:param — wired: useAgentDispatch.fetchAgentProfile
 *   /api/living-wiki/llms/:param       — wired: useLivingWiki.fetchLlmsContent
 *   /api/living-wiki/validate          — wired: useLivingWiki.validateWiki
 *   /api/sessions                      — deleted: sessions pushed via WebSocket
 *   /api/theme                         — deleted: theme pushed via WebSocket
 *   /api/work-graph/item/:param        — wired: fetchWorkGraphItem() helper
 *
 * There should now be zero server ↔ client drift.
 *
 * To fix genuine drift: add the missing route or remove the client call.
 */

import { execSync } from 'child_process';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Pre-existing drift allowlist — do NOT add new entries here without a ticket.
// Fix the underlying wiring first, then remove from this list.
// Tracked: see wiring-audit issue #217
// ---------------------------------------------------------------------------

/**
 * Client call sites that have no matching server route.
 * Currently empty — there is no client→server drift at the time of writing.
 * Any non-empty entry here must reference a ticket.
 */
const KNOWN_CLIENT_ORPHANS = new Set<string>([
	// Example entry format:
	// '/api/some/endpoint',  // tracked: #NNN — explanation
]);

/**
 * Server routes that intentionally have no hook caller on this branch.
 *
 * On humpf-dev, /api/sessions and /api/theme were deleted (confirmed pushed
 * via WebSocket instead) as part of wiring-audit-005 (issue #217).  Those
 * deletions have not yet landed on the upstream rc branch, so these routes
 * still appear in the server manifest here.  Once the upstream catches up,
 * this set should be emptied.
 */
const KNOWN_SERVER_ONLY = new Set<string>([
	'/api/sessions', // deleted on humpf-dev (pushed via WebSocket); not yet on rc
	'/api/theme', // deleted on humpf-dev (pushed via WebSocket); not yet on rc
]);

// ---------------------------------------------------------------------------
// Manifest loading
// ---------------------------------------------------------------------------

interface WebRouteManifest {
	server: string[];
	client: string[];
}

function loadManifest(): WebRouteManifest {
	const scriptPath = resolve(__dirname, '../../../scripts/audit-web-routes.mjs');
	const output = execSync(`node "${scriptPath}"`, { encoding: 'utf8' });
	return JSON.parse(output) as WebRouteManifest;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Web Route Wiring Contract (Wiring Audit 002)', () => {
	let manifest: WebRouteManifest;

	// Load once — spawning the script is cheap but we avoid doing it twice.
	try {
		manifest = loadManifest();
	} catch (err) {
		throw new Error(`Failed to load web route manifest from scripts/audit-web-routes.mjs:\n${err}`);
	}

	it('every client fetch call has a matching server route (client ⊆ server)', () => {
		const serverSet = new Set(manifest.server);

		const orphanedCalls = manifest.client
			.filter((path) => !serverSet.has(path))
			.filter((path) => !KNOWN_CLIENT_ORPHANS.has(path));

		expect(
			orphanedCalls,
			[
				'The following client fetch call sites have no matching server route.',
				'They will produce silent 404s in production.',
				'',
				'Fix: register the route in src/main/web-server/routes/ or remove the',
				'client call, then update KNOWN_CLIENT_ORPHANS in',
				'src/__tests__/contracts/web-routes-wiring.test.ts.',
				'',
				'New orphaned client calls:',
				...orphanedCalls.map((p) => `  ${p}`),
			].join('\n')
		).toEqual([]);
	});

	it('every server route has a matching client hook caller (server ⊆ client)', () => {
		const clientSet = new Set(manifest.client);

		const serverOnlyRoutes = manifest.server
			.filter((path) => !clientSet.has(path))
			.filter((path) => !KNOWN_SERVER_ONLY.has(path));

		expect(
			serverOnlyRoutes,
			[
				'The following server routes have no client hook caller.',
				'They are dead code (never reached by web/mobile hooks) or need a hook added.',
				'',
				'Fix: add a call site in src/web/hooks/use*.ts or src/web/mobile/, or',
				'delete the server route.  Then update KNOWN_SERVER_ONLY in',
				'src/__tests__/contracts/web-routes-wiring.test.ts if intentionally',
				'server-only.',
				'',
				'Uncovered server routes:',
				...serverOnlyRoutes.map((p) => `  ${p}`),
			].join('\n')
		).toEqual([]);
	});

	it('manifest is non-empty (audit script found routes in both sides)', () => {
		expect(manifest.server.length).toBeGreaterThan(0);
		expect(manifest.client.length).toBeGreaterThan(0);
	});
});

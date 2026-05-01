/**
 * Contract test: web route prefix consistency
 *
 * Verifies that the server-side route registration and the client-side
 * hook fetch calls both reference the same WEB_API_PREFIXES constant from
 * src/shared/web-routes.ts.
 *
 * A failure here means client and server are using different strings, which
 * would produce 404s in production - exactly the class of bug that prompted
 * Issue #173.
 */

import { describe, it, expect } from 'vitest';
import { WEB_API_PREFIXES, buildRoutePath } from '../../shared/web-routes';

// -- Snapshot: constant shape -----------------------------------------------

describe('WEB_API_PREFIXES', () => {
	it('exports all expected prefix entries', () => {
		// Core four prefixes introduced by the wiring-audit epic:
		expect(WEB_API_PREFIXES).toMatchObject({
			deliveryPlanner: '/api/delivery-planner',
			livingWiki: '/api/living-wiki',
			workGraph: '/api/work-graph',
			agentDispatch: '/api/agent-dispatch',
		});
	});

	it('every value starts with /api/', () => {
		for (const [key, value] of Object.entries(WEB_API_PREFIXES)) {
			expect(value, `WEB_API_PREFIXES.${key}`).toMatch(/^\/api\//);
		}
	});

	it('no trailing slash on any prefix', () => {
		for (const [key, value] of Object.entries(WEB_API_PREFIXES)) {
			expect(value, `WEB_API_PREFIXES.${key}`).not.toMatch(/\/$/);
		}
	});
});

// -- buildRoutePath helper ---------------------------------------------------

describe('buildRoutePath', () => {
	it('joins prefix and single segment', () => {
		expect(buildRoutePath(WEB_API_PREFIXES.agentDispatch, 'board')).toBe(
			'/api/agent-dispatch/board'
		);
	});

	it('joins prefix and multiple segments', () => {
		expect(buildRoutePath(WEB_API_PREFIXES.livingWiki, 'doc', 'abc123', 'history')).toBe(
			'/api/living-wiki/doc/abc123/history'
		);
	});

	it('handles segments that already start with /', () => {
		expect(buildRoutePath(WEB_API_PREFIXES.deliveryPlanner, '/dashboard')).toBe(
			'/api/delivery-planner/dashboard'
		);
	});

	it('handles trailing slash on prefix', () => {
		expect(buildRoutePath('/api/work-graph/', 'items')).toBe('/api/work-graph/items');
	});
});
// -- Server-side registration tests -----------------------------------------
//
// These tests verify that each route class imports WEB_API_PREFIXES rather than
// hardcoding path strings.  They are NOT included in this file because the
// feature route files (agentDispatchRoutes, deliveryPlannerRoutes,
// livingWikiRoutes) are delivered as part of later PRs.  Once those routes land
// on rc, a follow-up commit will re-enable these tests.
//
// For reference, the intended test structure is in CLAUDE-WIRING-AUDIT.md
// under "web-route-prefixes.test.ts".

// -- Helper -----------------------------------------------------------------

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


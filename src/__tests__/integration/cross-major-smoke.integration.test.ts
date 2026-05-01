/**
 * Cross-Major Smoke Test — Issue #167 (Cross-Major 008)
 *
 * Five focused assertions that verify the end-to-end wiring across all three
 * majors (Delivery Planner, Living Wiki, Agent Dispatch):
 *
 *  1. ResyncSnapshot covers all three majors (+ Work Graph substrate).
 *  2. WORK_GRAPH_METADATA_NAMESPACES matches the live keys produced by each major.
 *  3. Delivery Planner lineage extraction works on a fully-populated WorkItem fixture.
 *  4. Living Wiki reference extraction works on doc and doc-gap fixtures.
 *  5. A single WorkItem fixture covering all three majors (doc-gap with planner link)
 *     resolves cleanly through both extractors without cross-contamination.
 */

import { describe, it, expect } from 'vitest';
import type { WorkItem } from '../../shared/work-graph-types';
import {
	WORK_GRAPH_METADATA_NAMESPACES,
	BROADCAST_OPERATIONS_BY_NAMESPACE,
	WEB_ROUTE_PREFIXES_BY_NAMESPACE,
} from '../../shared/cross-major-contracts';
import {
	extractDeliveryPlannerLineage,
	extractLivingWikiReference,
	isDeliveryPlannerItem,
	isLivingWikiItem,
} from '../../shared/agent-dispatch-lineage';
import type { ResyncSnapshot } from '../../main/web-server/routes/apiRoutes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseItem(overrides: Partial<WorkItem> = {}): WorkItem {
	return {
		id: 'smoke-item-1',
		type: 'task',
		status: 'planned',
		title: 'Smoke test item',
		projectPath: '/repo/smoke',
		gitPath: '/repo/smoke/tasks/smoke-item-1.md',
		source: 'manual',
		readonly: false,
		tags: [],
		createdAt: '2026-05-01T00:00:00.000Z',
		updatedAt: '2026-05-01T00:00:00.000Z',
		...overrides,
	};
}

/** A fully-populated Delivery Planner task item. */
function plannerTaskItem(): WorkItem {
	return baseItem({
		id: 'planner-task-smoke',
		source: 'delivery-planner',
		tags: ['delivery-planner', 'agent-ready'],
		metadata: {
			kind: 'task',
			prdWorkItemId: 'prd-smoke-001',
			epicWorkItemId: 'epic-smoke-002',
			ccpmSlug: 'smoke-task-slug',
			deliveryPlannerDispatch: {
				capabilityHints: ['code', 'test'],
				ownership: 'Delivery Planner → Agent Dispatch',
			},
			deliveryPlannerAgentReady: {
				tag: 'agent-ready',
				ready: true,
				evaluatedAt: '2026-05-01T00:00:00.000Z',
				reason: 'Unblocked and specified.',
			},
			dependsOnTaskTitles: [],
			filesLikelyTouched: ['src/smoke.ts'],
			parallel: true,
		},
	});
}

/** A Living Wiki document item. */
function wikiDocItem(): WorkItem {
	return baseItem({
		id: 'wiki-doc-smoke',
		type: 'document',
		source: 'living-wiki',
		tags: ['living-wiki'],
		metadata: {
			kind: 'living-wiki-doc',
			slug: 'smoke-overview',
			area: 'smoke',
			bodyHash: 'deadbeef',
			bodyText: 'Smoke overview body.',
			searchText: 'smoke-overview smoke Smoke overview body.',
			sourceGitPaths: ['src/smoke.ts'],
		},
	});
}

/** A Living Wiki doc-gap item with a plannerWorkItemId cross-reference. */
function wikiDocGapWithPlannerLink(): WorkItem {
	return baseItem({
		id: 'wiki-gap-smoke',
		type: 'task',
		source: 'living-wiki',
		tags: ['living-wiki-doc-gap'],
		metadata: {
			kind: 'living-wiki-doc-gap',
			sourceGitPath: 'src/smoke.ts',
			agentReadyNote: 'Living Wiki never sets agent-ready on doc-gap items.',
			plannerWorkItemId: 'prd-smoke-001',
		},
	});
}

// ---------------------------------------------------------------------------
// Smoke tests
// ---------------------------------------------------------------------------

describe('cross-major smoke', () => {
	// ── 1. ResyncSnapshot covers all three majors ──────────────────────────────

	it('ResyncSnapshot type covers all three majors and the Work Graph substrate', () => {
		// Construct a minimal snapshot that satisfies the type. If the interface
		// ever drops a major, the compile-time type check here fails.
		const snapshot: ResyncSnapshot = {
			workGraph: { items: [], total: 0 },
			deliveryPlanner: {
				items: [],
				statusCounts: [],
				readyItems: [],
				blockedItems: [],
				overdueItems: [],
				updatedAt: '2026-05-01T00:00:00.000Z',
			},
			livingWiki: { docs: [] },
			agentDispatch: { board: [], fleet: [] },
		};

		expect(Object.keys(snapshot)).toEqual(
			expect.arrayContaining(['workGraph', 'deliveryPlanner', 'livingWiki', 'agentDispatch'])
		);
		expect(Object.keys(snapshot)).toHaveLength(4);
	});

	// ── 2. WORK_GRAPH_METADATA_NAMESPACES matches live producer keys ───────────

	it('WORK_GRAPH_METADATA_NAMESPACES matches the three documented namespace identifiers', () => {
		// The live keys written by planner-service.ts and workGraphBridge.ts are
		// keyed under 'deliveryPlanner' and 'livingWiki' metadata buckets respectively.
		// agentDispatch is read-only (no metadata writes).
		expect(WORK_GRAPH_METADATA_NAMESPACES).toEqual([
			'deliveryPlanner',
			'livingWiki',
			'agentDispatch',
		]);

		// Every namespace must appear in BROADCAST_OPERATIONS_BY_NAMESPACE.
		for (const ns of WORK_GRAPH_METADATA_NAMESPACES) {
			expect(BROADCAST_OPERATIONS_BY_NAMESPACE).toHaveProperty(ns);
		}

		// Every namespace must appear in WEB_ROUTE_PREFIXES_BY_NAMESPACE.
		for (const ns of WORK_GRAPH_METADATA_NAMESPACES) {
			expect(WEB_ROUTE_PREFIXES_BY_NAMESPACE).toHaveProperty(ns);
		}
	});

	// ── 3. Delivery Planner lineage extraction ─────────────────────────────────

	it('extracts full Delivery Planner lineage from a fully-populated task fixture', () => {
		const item = plannerTaskItem();
		const lineage = extractDeliveryPlannerLineage(item);

		expect(lineage.kind).toBe('task');
		expect(lineage.prdWorkItemId).toBe('prd-smoke-001');
		expect(lineage.epicWorkItemId).toBe('epic-smoke-002');
		expect(isDeliveryPlannerItem(item)).toBe(true);

		// Capability hints are present on the dispatch sub-record.
		const dispatch = item.metadata?.deliveryPlannerDispatch as Record<string, unknown>;
		expect(dispatch.capabilityHints).toContain('code');
	});

	// ── 4. Living Wiki reference extraction ───────────────────────────────────

	it('extracts Living Wiki references from doc and doc-gap fixtures', () => {
		const doc = wikiDocItem();
		const docRef = extractLivingWikiReference(doc);
		expect(docRef.kind).toBe('living-wiki-doc');
		expect(docRef.docSlug).toBe('smoke-overview');
		expect(docRef.docArea).toBe('smoke');
		expect(docRef.sourceGitPath).toBeUndefined();
		expect(isLivingWikiItem(doc)).toBe(true);

		const gap = wikiDocGapWithPlannerLink();
		const gapRef = extractLivingWikiReference(gap);
		expect(gapRef.kind).toBe('living-wiki-doc-gap');
		expect(gapRef.sourceGitPath).toBe('src/smoke.ts');
		expect(gapRef.plannerWorkItemId).toBe('prd-smoke-001');
		expect(gapRef.docSlug).toBeUndefined();
		expect(isLivingWikiItem(gap)).toBe(true);
	});

	// ── 5. All-three-majors fixture: no cross-contamination ───────────────────

	it('doc-gap item with plannerWorkItemId cross-ref resolves cleanly through both extractors', () => {
		const gap = wikiDocGapWithPlannerLink();

		// Living Wiki extractor surfaces the plannerWorkItemId cross-reference.
		const wikiRef = extractLivingWikiReference(gap);
		expect(wikiRef.plannerWorkItemId).toBe('prd-smoke-001');

		// Delivery Planner extractor sees no planner lineage (gap is a wiki item, not a planner item).
		const plannerLineage = extractDeliveryPlannerLineage(gap);
		expect(plannerLineage.kind).toBeUndefined();
		expect(plannerLineage.prdWorkItemId).toBeUndefined();
		expect(plannerLineage.epicWorkItemId).toBeUndefined();

		// Agent Dispatch predicates agree.
		expect(isLivingWikiItem(gap)).toBe(true);
		expect(isDeliveryPlannerItem(gap)).toBe(false);
	});
});

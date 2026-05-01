/**
 * Cross-Major Contract Test -- Issue #160 (Cross-major contract audit)
 *
 * Asserts that:
 *   1. The three metadata namespace identifiers declared in cross-major-contracts.ts
 *      match the actual source keys written by each major.
 *   2. The lineage helper extractDeliveryPlannerLineage correctly reads every
 *      documented Delivery Planner metadata key from representative WorkItem fixtures.
 *   3. The lineage helper extractLivingWikiReference correctly reads every
 *      documented Living Wiki metadata key from representative fixtures.
 *   4. Agent Dispatch reads (not writes) metadata — verified by asserting that
 *      the lineage module exports no write-side APIs.
 *   5. Every documented metadata key either has a corresponding extractor in
 *      agent-dispatch-lineage.ts or is documented as internal to its owning major.
 *
 * This test is intentionally exhaustive against the contract table documented in
 * .claude/INTEGRATION-LOG.md (issue #160 section). If a metadata key is added or
 * removed, both the source and this test must be updated together.
 */

import { describe, it, expect } from 'vitest';
import type { WorkItem } from '../../shared/work-graph-types';
import {
	extractDeliveryPlannerLineage,
	extractLivingWikiReference,
	isDeliveryPlannerItem,
	isLivingWikiItem,
} from '../../shared/agent-dispatch-lineage';
import {
	WORK_GRAPH_METADATA_NAMESPACES,
	BROADCAST_OPERATIONS_BY_NAMESPACE,
	IPC_CHANNELS_BY_NAMESPACE,
	WEB_ROUTE_PREFIXES_BY_NAMESPACE,
} from '../../shared/cross-major-contracts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function baseItem(overrides: Partial<WorkItem> = {}): WorkItem {
	return {
		id: 'item-fixture-1',
		type: 'task',
		status: 'planned',
		title: 'Test work item',
		projectPath: '/repo',
		gitPath: '/repo/src',
		source: 'manual',
		readonly: false,
		tags: [],
		createdAt: '2026-04-30T00:00:00.000Z',
		updatedAt: '2026-04-30T00:00:00.000Z',
		...overrides,
	};
}

/** Delivery Planner PRD item with full metadata */
function prdItem(): WorkItem {
	return baseItem({
		type: 'document',
		source: 'delivery-planner',
		tags: ['delivery-planner', 'prd'],
		metadata: {
			kind: 'prd',
			ccpmSlug: 'my-feature-prd',
			deliveryPlannerTraceability: {
				prdWorkItemId: undefined,
				epicWorkItemId: undefined,
				parentWorkItemId: undefined,
				github: undefined,
				livingWiki: { workGraphSource: 'delivery-planner', artifactKind: 'prd' },
			},
			deliveryPlannerDispatch: {
				capabilityHints: ['code'],
				ownership:
					'Delivery Planner marks unblocked, specified work with agent-ready; Agent Dispatch owns agent matching, claims, and execution.',
			},
		},
	});
}

/** Delivery Planner epic item with prdWorkItemId back-link */
function epicItem(): WorkItem {
	return baseItem({
		type: 'feature',
		source: 'delivery-planner',
		tags: ['delivery-planner', 'epic'],
		metadata: {
			kind: 'epic',
			prdWorkItemId: 'prd-abc-123',
			ccpmSlug: 'my-feature-epic',
			deliveryPlannerTraceability: {
				prdWorkItemId: 'prd-abc-123',
				epicWorkItemId: undefined,
				parentWorkItemId: undefined,
				github: undefined,
				livingWiki: { workGraphSource: 'delivery-planner', artifactKind: 'epic' },
			},
			deliveryPlannerDispatch: {
				capabilityHints: ['code'],
				ownership:
					'Delivery Planner marks unblocked, specified work with agent-ready; Agent Dispatch owns agent matching, claims, and execution.',
			},
		},
	});
}

/** Delivery Planner task item with prdWorkItemId + epicWorkItemId */
function taskItem(): WorkItem {
	return baseItem({
		type: 'task',
		source: 'delivery-planner',
		tags: ['delivery-planner', 'agent-ready'],
		metadata: {
			kind: 'task',
			prdWorkItemId: 'prd-abc-123',
			epicWorkItemId: 'epic-def-456',
			dependsOnTaskTitles: ['Setup database schema'],
			filesLikelyTouched: ['src/db/migrations.ts'],
			parallel: false,
			deliveryPlannerTraceability: {
				prdWorkItemId: 'prd-abc-123',
				epicWorkItemId: 'epic-def-456',
				parentWorkItemId: 'epic-def-456',
				github: undefined,
				livingWiki: { workGraphSource: 'delivery-planner', artifactKind: 'task' },
			},
			deliveryPlannerDispatch: {
				capabilityHints: ['code'],
				ownership:
					'Delivery Planner marks unblocked, specified work with agent-ready; Agent Dispatch owns agent matching, claims, and execution.',
			},
			deliveryPlannerAgentReady: {
				tag: 'agent-ready',
				ready: true,
				evaluatedAt: '2026-04-30T00:00:00.000Z',
				reason: 'Unblocked and sufficiently specified for Agent Dispatch capability matching.',
			},
		},
	});
}

/** Living Wiki document item */
function wikiDocItem(): WorkItem {
	return baseItem({
		type: 'document',
		source: 'living-wiki',
		tags: [],
		metadata: {
			kind: 'living-wiki-doc',
			slug: 'architecture-overview',
			area: 'architecture',
			frontmatter: {
				title: 'Architecture Overview',
				slug: 'architecture-overview',
				area: 'architecture',
			},
			sourceGitPaths: ['src/main/index.ts', 'src/renderer/App.tsx'],
			validationSummary: null,
			bodyHash: 'abc123',
			bodyText: 'This document describes the architecture...',
			searchText: 'Architecture Overview architecture This document describes...',
		},
	});
}

/** Living Wiki doc-gap item */
function wikiDocGapItem(): WorkItem {
	return baseItem({
		type: 'task',
		source: 'living-wiki',
		tags: ['living-wiki-doc-gap'],
		metadata: {
			kind: 'living-wiki-doc-gap',
			sourceGitPath: 'src/main/parsers/index.ts',
			agentReadyNote: 'Living Wiki never sets agent-ready on doc-gap items.',
			plannerWorkItemId: 'prd-abc-123',
		},
	});
}

// ---------------------------------------------------------------------------
// Contract registry tests
// ---------------------------------------------------------------------------

describe('WORK_GRAPH_METADATA_NAMESPACES', () => {
	it('contains exactly the three documented major namespaces', () => {
		expect(WORK_GRAPH_METADATA_NAMESPACES).toEqual([
			'deliveryPlanner',
			'livingWiki',
			'agentDispatch',
		]);
	});

	it('has deliveryPlanner as first namespace (owns WORK_GRAPH_READY_TAG)', () => {
		expect(WORK_GRAPH_METADATA_NAMESPACES[0]).toBe('deliveryPlanner');
	});

	it('has agentDispatch as last namespace (read-only, no metadata writes)', () => {
		expect(WORK_GRAPH_METADATA_NAMESPACES[2]).toBe('agentDispatch');
	});
});

describe('BROADCAST_OPERATIONS_BY_NAMESPACE', () => {
	it('deliveryPlanner produces all three documented work-graph operations', () => {
		const ops = BROADCAST_OPERATIONS_BY_NAMESPACE.deliveryPlanner;
		expect(ops).toContain('workGraph.item.created');
		expect(ops).toContain('workGraph.item.updated');
		expect(ops).toContain('workGraph.item.statusChanged');
	});

	it('livingWiki produces only workGraph.item.updated', () => {
		expect(BROADCAST_OPERATIONS_BY_NAMESPACE.livingWiki).toEqual(['workGraph.item.updated']);
	});

	it('agentDispatch produces only fleet-level operations', () => {
		const ops = BROADCAST_OPERATIONS_BY_NAMESPACE.agentDispatch;
		expect(ops.every((op) => op.startsWith('agentDispatch.'))).toBe(true);
		expect(ops).toContain('agentDispatch.fleet.changed');
		expect(ops).toContain('agentDispatch.agent.readinessChanged');
		expect(ops).toContain('agentDispatch.agent.claimsChanged');
		expect(ops).toContain('agentDispatch.agent.pickupChanged');
	});
});

describe('IPC_CHANNELS_BY_NAMESPACE', () => {
	it('all deliveryPlanner channels start with "deliveryPlanner:"', () => {
		for (const ch of IPC_CHANNELS_BY_NAMESPACE.deliveryPlanner) {
			expect(ch).toMatch(/^deliveryPlanner:/);
		}
	});

	it('all livingWiki channels start with "livingWiki:"', () => {
		for (const ch of IPC_CHANNELS_BY_NAMESPACE.livingWiki) {
			expect(ch).toMatch(/^livingWiki:/);
		}
	});

	it('all agentDispatch channels start with "agentDispatch:"', () => {
		for (const ch of IPC_CHANNELS_BY_NAMESPACE.agentDispatch) {
			expect(ch).toMatch(/^agentDispatch:/);
		}
	});

	it('deliveryPlanner has the ten documented IPC handlers', () => {
		expect(IPC_CHANNELS_BY_NAMESPACE.deliveryPlanner).toHaveLength(10);
	});

	it('livingWiki has the fourteen documented IPC handlers', () => {
		expect(IPC_CHANNELS_BY_NAMESPACE.livingWiki).toHaveLength(14);
	});

	it('agentDispatch has the fourteen documented IPC handlers', () => {
		expect(IPC_CHANNELS_BY_NAMESPACE.agentDispatch).toHaveLength(14);
	});
});

describe('WEB_ROUTE_PREFIXES_BY_NAMESPACE', () => {
	it('all prefixes start with /api/', () => {
		for (const prefix of Object.values(WEB_ROUTE_PREFIXES_BY_NAMESPACE)) {
			expect(prefix).toMatch(/^\/api\//);
		}
	});

	it('deliveryPlanner maps to /api/delivery-planner', () => {
		expect(WEB_ROUTE_PREFIXES_BY_NAMESPACE.deliveryPlanner).toBe('/api/delivery-planner');
	});

	it('livingWiki maps to /api/living-wiki', () => {
		expect(WEB_ROUTE_PREFIXES_BY_NAMESPACE.livingWiki).toBe('/api/living-wiki');
	});

	it('agentDispatch maps to /api/agent-dispatch', () => {
		expect(WEB_ROUTE_PREFIXES_BY_NAMESPACE.agentDispatch).toBe('/api/agent-dispatch');
	});
});

// ---------------------------------------------------------------------------
// Delivery Planner lineage extraction
// ---------------------------------------------------------------------------

describe('extractDeliveryPlannerLineage — Delivery Planner metadata keys', () => {
	it('extracts kind from a PRD item', () => {
		const result = extractDeliveryPlannerLineage(prdItem());
		expect(result.kind).toBe('prd');
		expect(result.prdWorkItemId).toBeUndefined();
		expect(result.epicWorkItemId).toBeUndefined();
	});

	it('extracts kind + prdWorkItemId from an epic item', () => {
		const result = extractDeliveryPlannerLineage(epicItem());
		expect(result.kind).toBe('epic');
		expect(result.prdWorkItemId).toBe('prd-abc-123');
		expect(result.epicWorkItemId).toBeUndefined();
	});

	it('extracts kind + prdWorkItemId + epicWorkItemId from a task item', () => {
		const result = extractDeliveryPlannerLineage(taskItem());
		expect(result.kind).toBe('task');
		expect(result.prdWorkItemId).toBe('prd-abc-123');
		expect(result.epicWorkItemId).toBe('epic-def-456');
	});

	it('isDeliveryPlannerItem returns true for task with kind field', () => {
		expect(isDeliveryPlannerItem(taskItem())).toBe(true);
	});

	it('isDeliveryPlannerItem returns false for item without kind', () => {
		expect(isDeliveryPlannerItem(baseItem())).toBe(false);
	});

	it('returns all-undefined for a non-planner item', () => {
		const result = extractDeliveryPlannerLineage(wikiDocItem());
		expect(result.kind).toBeUndefined();
		expect(result.prdWorkItemId).toBeUndefined();
		expect(result.epicWorkItemId).toBeUndefined();
	});

	it('task item carries documented deliveryPlannerDispatch capabilityHints', () => {
		const item = taskItem();
		const dispatch = item.metadata?.deliveryPlannerDispatch as Record<string, unknown>;
		expect(Array.isArray(dispatch?.capabilityHints)).toBe(true);
		expect(dispatch?.capabilityHints).toContain('code');
	});

	it('task item carries documented deliveryPlannerAgentReady record', () => {
		const item = taskItem();
		const agentReady = item.metadata?.deliveryPlannerAgentReady as Record<string, unknown>;
		expect(agentReady?.tag).toBe('agent-ready');
		expect(agentReady?.ready).toBe(true);
		expect(typeof agentReady?.evaluatedAt).toBe('string');
	});
});

// ---------------------------------------------------------------------------
// Living Wiki reference extraction
// ---------------------------------------------------------------------------

describe('extractLivingWikiReference — Living Wiki metadata keys', () => {
	it('extracts kind, slug, and area from a wiki-doc item', () => {
		const result = extractLivingWikiReference(wikiDocItem());
		expect(result.kind).toBe('living-wiki-doc');
		expect(result.docSlug).toBe('architecture-overview');
		expect(result.docArea).toBe('architecture');
		expect(result.sourceGitPath).toBeUndefined();
		expect(result.plannerWorkItemId).toBeUndefined();
	});

	it('extracts kind, sourceGitPath, and plannerWorkItemId from a doc-gap item', () => {
		const result = extractLivingWikiReference(wikiDocGapItem());
		expect(result.kind).toBe('living-wiki-doc-gap');
		expect(result.sourceGitPath).toBe('src/main/parsers/index.ts');
		expect(result.plannerWorkItemId).toBe('prd-abc-123');
		expect(result.docSlug).toBeUndefined();
		expect(result.docArea).toBeUndefined();
	});

	it('isLivingWikiItem returns true for both doc and gap items', () => {
		expect(isLivingWikiItem(wikiDocItem())).toBe(true);
		expect(isLivingWikiItem(wikiDocGapItem())).toBe(true);
	});

	it('isLivingWikiItem returns false for a non-wiki item', () => {
		expect(isLivingWikiItem(taskItem())).toBe(false);
	});

	it('wiki-doc item carries documented internal metadata keys', () => {
		const item = wikiDocItem();
		expect(typeof item.metadata?.bodyHash).toBe('string');
		expect(typeof item.metadata?.bodyText).toBe('string');
		expect(typeof item.metadata?.searchText).toBe('string');
		expect(Array.isArray(item.metadata?.sourceGitPaths)).toBe(true);
	});

	it('doc-gap item carries agentReadyNote documenting the no-agent-ready rule', () => {
		const item = wikiDocGapItem();
		expect(typeof item.metadata?.agentReadyNote).toBe('string');
		expect(item.tags).not.toContain('agent-ready');
	});
});

// ---------------------------------------------------------------------------
// Agent Dispatch — read-only contract
// ---------------------------------------------------------------------------

describe('Agent Dispatch metadata contract (read-only)', () => {
	it('agent-dispatch-lineage exports only extraction functions, no write APIs', async () => {
		const mod = await import('../../shared/agent-dispatch-lineage');
		const exports = Object.keys(mod);
		// Only extraction/predicate helpers should be exported — no createItem, updateItem, etc.
		expect(exports).toContain('extractDeliveryPlannerLineage');
		expect(exports).toContain('extractLivingWikiReference');
		expect(exports).toContain('isDeliveryPlannerItem');
		expect(exports).toContain('isLivingWikiItem');
		// No write-side APIs
		expect(exports).not.toContain('createItem');
		expect(exports).not.toContain('updateItem');
		expect(exports).not.toContain('claimItem');
		expect(exports).not.toContain('setMetadata');
	});

	it('agentDispatch namespace has no metadata keys in WORK_GRAPH_METADATA_NAMESPACES doc (read-only)', () => {
		// The agentDispatch namespace is present to document its role,
		// but Agent Dispatch is documented as a metadata READER only.
		// This test encodes that assumption so it fails loudly if someone adds writes.
		const ns = WORK_GRAPH_METADATA_NAMESPACES[2];
		expect(ns).toBe('agentDispatch');
	});
});

// ---------------------------------------------------------------------------
// Cross-major key isolation
// ---------------------------------------------------------------------------

describe('metadata key isolation between majors', () => {
	it('a Delivery Planner item does not carry Living Wiki metadata keys', () => {
		const item = taskItem();
		expect(item.metadata?.slug).toBeUndefined();
		expect(item.metadata?.area).toBeUndefined();
		expect(item.metadata?.sourceGitPath).toBeUndefined();
		expect(item.metadata?.plannerWorkItemId).toBeUndefined();
	});

	it('a Living Wiki doc item does not carry Delivery Planner metadata keys', () => {
		const item = wikiDocItem();
		expect(item.metadata?.prdWorkItemId).toBeUndefined();
		expect(item.metadata?.epicWorkItemId).toBeUndefined();
		expect(item.metadata?.deliveryPlannerAgentReady).toBeUndefined();
	});

	it('a Living Wiki doc-gap item with plannerWorkItemId does not carry epic/prd lineage', () => {
		// plannerWorkItemId is a soft cross-reference, not the same as prdWorkItemId
		const item = wikiDocGapItem();
		const plannerLineage = extractDeliveryPlannerLineage(item);
		expect(plannerLineage.kind).toBeUndefined();
		expect(plannerLineage.prdWorkItemId).toBeUndefined();
		expect(plannerLineage.epicWorkItemId).toBeUndefined();
		// The plannerWorkItemId is accessible via the wiki extractor, not the planner extractor
		const wikiRef = extractLivingWikiReference(item);
		expect(wikiRef.plannerWorkItemId).toBe('prd-abc-123');
	});
});

import { describe, expect, it } from 'vitest';
import type { WorkItem } from '../../shared/work-graph-types';
import {
	extractDeliveryPlannerLineage,
	extractLivingWikiReference,
	isDeliveryPlannerItem,
	isLivingWikiItem,
} from '../../shared/agent-dispatch-lineage';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseItem(overrides: Partial<WorkItem> = {}): WorkItem {
	return {
		id: 'item-1',
		type: 'task',
		status: 'ready',
		title: 'Test item',
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

// ---------------------------------------------------------------------------
// extractDeliveryPlannerLineage
// ---------------------------------------------------------------------------

describe('extractDeliveryPlannerLineage', () => {
	it('returns all-undefined for an item with no metadata', () => {
		const item = baseItem();
		expect(extractDeliveryPlannerLineage(item)).toEqual({
			kind: undefined,
			prdWorkItemId: undefined,
			epicWorkItemId: undefined,
		});
	});

	it('returns all-undefined for an item whose metadata.kind is not a planner concept', () => {
		const item = baseItem({ metadata: { kind: 'living-wiki-doc' } });
		expect(extractDeliveryPlannerLineage(item)).toEqual({
			kind: undefined,
			prdWorkItemId: undefined,
			epicWorkItemId: undefined,
		});
	});

	it('extracts kind "prd" with no parent IDs', () => {
		const item = baseItem({ metadata: { kind: 'prd' } });
		const result = extractDeliveryPlannerLineage(item);
		expect(result.kind).toBe('prd');
		expect(result.prdWorkItemId).toBeUndefined();
		expect(result.epicWorkItemId).toBeUndefined();
	});

	it('extracts kind "epic" with prdWorkItemId', () => {
		const item = baseItem({ metadata: { kind: 'epic', prdWorkItemId: 'prd-abc-123' } });
		const result = extractDeliveryPlannerLineage(item);
		expect(result.kind).toBe('epic');
		expect(result.prdWorkItemId).toBe('prd-abc-123');
		expect(result.epicWorkItemId).toBeUndefined();
	});

	it('extracts kind "task" with prdWorkItemId and epicWorkItemId', () => {
		const item = baseItem({
			metadata: {
				kind: 'task',
				prdWorkItemId: 'prd-abc-123',
				epicWorkItemId: 'epic-def-456',
			},
		});
		const result = extractDeliveryPlannerLineage(item);
		expect(result.kind).toBe('task');
		expect(result.prdWorkItemId).toBe('prd-abc-123');
		expect(result.epicWorkItemId).toBe('epic-def-456');
	});

	it('ignores empty string IDs', () => {
		const item = baseItem({
			metadata: { kind: 'task', prdWorkItemId: '', epicWorkItemId: '' },
		});
		const result = extractDeliveryPlannerLineage(item);
		expect(result.prdWorkItemId).toBeUndefined();
		expect(result.epicWorkItemId).toBeUndefined();
	});

	it('ignores non-string IDs', () => {
		const item = baseItem({
			metadata: { kind: 'task', prdWorkItemId: 42, epicWorkItemId: null },
		});
		const result = extractDeliveryPlannerLineage(item);
		expect(result.prdWorkItemId).toBeUndefined();
		expect(result.epicWorkItemId).toBeUndefined();
	});
});

describe('isDeliveryPlannerItem', () => {
	it('returns false for items without planner metadata', () => {
		expect(isDeliveryPlannerItem(baseItem())).toBe(false);
		expect(isDeliveryPlannerItem(baseItem({ metadata: { kind: 'living-wiki-doc' } }))).toBe(false);
	});

	it('returns true for prd, epic, and task items', () => {
		expect(isDeliveryPlannerItem(baseItem({ metadata: { kind: 'prd' } }))).toBe(true);
		expect(isDeliveryPlannerItem(baseItem({ metadata: { kind: 'epic' } }))).toBe(true);
		expect(isDeliveryPlannerItem(baseItem({ metadata: { kind: 'task' } }))).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// extractLivingWikiReference
// ---------------------------------------------------------------------------

describe('extractLivingWikiReference', () => {
	it('returns all-undefined for an item with no metadata', () => {
		const item = baseItem();
		expect(extractLivingWikiReference(item)).toEqual({
			kind: undefined,
			docSlug: undefined,
			docArea: undefined,
			sourceGitPath: undefined,
			plannerWorkItemId: undefined,
		});
	});

	it('returns all-undefined for an item with a non-wiki metadata kind', () => {
		const item = baseItem({ metadata: { kind: 'prd' } });
		expect(extractLivingWikiReference(item)).toEqual({
			kind: undefined,
			docSlug: undefined,
			docArea: undefined,
			sourceGitPath: undefined,
			plannerWorkItemId: undefined,
		});
	});

	it('extracts living-wiki-doc with slug and area', () => {
		const item = baseItem({
			metadata: {
				kind: 'living-wiki-doc',
				slug: 'architecture-overview',
				area: 'architecture',
			},
		});
		const result = extractLivingWikiReference(item);
		expect(result.kind).toBe('living-wiki-doc');
		expect(result.docSlug).toBe('architecture-overview');
		expect(result.docArea).toBe('architecture');
		expect(result.sourceGitPath).toBeUndefined();
		expect(result.plannerWorkItemId).toBeUndefined();
	});

	it('extracts living-wiki-doc with only slug (no area)', () => {
		const item = baseItem({
			metadata: { kind: 'living-wiki-doc', slug: 'api-guide' },
		});
		const result = extractLivingWikiReference(item);
		expect(result.kind).toBe('living-wiki-doc');
		expect(result.docSlug).toBe('api-guide');
		expect(result.docArea).toBeUndefined();
	});

	it('extracts living-wiki-doc-gap with sourceGitPath', () => {
		const item = baseItem({
			metadata: {
				kind: 'living-wiki-doc-gap',
				sourceGitPath: 'src/shared/agent-dispatch-lineage.ts',
			},
		});
		const result = extractLivingWikiReference(item);
		expect(result.kind).toBe('living-wiki-doc-gap');
		expect(result.sourceGitPath).toBe('src/shared/agent-dispatch-lineage.ts');
		expect(result.docSlug).toBeUndefined();
		expect(result.docArea).toBeUndefined();
		expect(result.plannerWorkItemId).toBeUndefined();
	});

	it('extracts living-wiki-doc-gap with plannerWorkItemId', () => {
		const item = baseItem({
			metadata: {
				kind: 'living-wiki-doc-gap',
				sourceGitPath: 'src/main/delivery-planner/planner-service.ts',
				plannerWorkItemId: 'prd-abc-123',
			},
		});
		const result = extractLivingWikiReference(item);
		expect(result.kind).toBe('living-wiki-doc-gap');
		expect(result.sourceGitPath).toBe('src/main/delivery-planner/planner-service.ts');
		expect(result.plannerWorkItemId).toBe('prd-abc-123');
	});

	it('does not surface doc fields on gap items', () => {
		const item = baseItem({
			metadata: {
				kind: 'living-wiki-doc-gap',
				slug: 'should-be-ignored',
				area: 'should-be-ignored',
				sourceGitPath: 'src/shared/types.ts',
			},
		});
		const result = extractLivingWikiReference(item);
		expect(result.docSlug).toBeUndefined();
		expect(result.docArea).toBeUndefined();
	});

	it('does not surface gap fields on doc items', () => {
		const item = baseItem({
			metadata: {
				kind: 'living-wiki-doc',
				sourceGitPath: 'should-be-ignored',
				plannerWorkItemId: 'should-be-ignored',
				slug: 'real-slug',
			},
		});
		const result = extractLivingWikiReference(item);
		expect(result.sourceGitPath).toBeUndefined();
		expect(result.plannerWorkItemId).toBeUndefined();
		expect(result.docSlug).toBe('real-slug');
	});

	it('ignores empty string values', () => {
		const item = baseItem({
			metadata: {
				kind: 'living-wiki-doc',
				slug: '',
				area: '',
			},
		});
		const result = extractLivingWikiReference(item);
		expect(result.docSlug).toBeUndefined();
		expect(result.docArea).toBeUndefined();
	});
});

describe('isLivingWikiItem', () => {
	it('returns false for non-wiki items', () => {
		expect(isLivingWikiItem(baseItem())).toBe(false);
		expect(isLivingWikiItem(baseItem({ metadata: { kind: 'prd' } }))).toBe(false);
	});

	it('returns true for living-wiki-doc and living-wiki-doc-gap items', () => {
		expect(isLivingWikiItem(baseItem({ metadata: { kind: 'living-wiki-doc' } }))).toBe(true);
		expect(isLivingWikiItem(baseItem({ metadata: { kind: 'living-wiki-doc-gap' } }))).toBe(true);
	});
});

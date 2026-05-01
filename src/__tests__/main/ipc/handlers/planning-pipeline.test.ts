/**
 * Tests for Planning Pipeline IPC handlers
 *
 * Verifies that:
 * - `pipeline:getDashboard` is registered on ipcMain
 * - Handler lists all work items from the store
 * - Items are classified by detectCurrentStage() into stage buckets
 * - Items with no pipeline label end up in `unstaged`
 * - Empty store returns all-empty buckets + empty unstaged
 * - Result shape matches PipelineDashboardResult contract
 * - Handler returns { success: true, data } on success
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ipcMain } from 'electron';

// ─────────────────────────────────────────────────────────────────────────────
// Module mocks
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('electron', () => ({
	ipcMain: {
		handle: vi.fn(),
		removeHandler: vi.fn(),
	},
}));

vi.mock('../../../../main/utils/logger', () => ({
	logger: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

const mockListItems = vi.fn();

vi.mock('../../../../main/work-graph', () => ({
	getWorkGraphItemStore: () => ({
		listItems: mockListItems,
	}),
}));

import { registerPlanningPipelineHandlers } from '../../../../main/ipc/handlers/planning-pipeline';
import type { WorkItem } from '../../../../shared/work-graph-types';
import { PIPELINE_STAGES, PIPELINE_FAILURE_STAGES } from '../../../../shared/planning-pipeline-types';

// ─────────────────────────────────────────────────────────────────────────────
// Factories
// ─────────────────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<WorkItem> = {}): WorkItem {
	return {
		id: `item-${Math.random().toString(36).slice(2, 8)}`,
		type: 'task',
		status: 'ready',
		title: 'Test item',
		projectPath: '/project',
		gitPath: '/project/.git',
		source: 'manual',
		readonly: false,
		tags: [],
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		...overrides,
	};
}

/** Extract the handler registered for a given channel. */
function getHandler(channel: string): ((_event: unknown) => Promise<unknown>) | undefined {
	const calls = vi.mocked(ipcMain.handle).mock.calls;
	const match = calls.find(([ch]) => ch === channel);
	return match?.[1] as ((_event: unknown) => Promise<unknown>) | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('registerPlanningPipelineHandlers', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		registerPlanningPipelineHandlers();
	});

	it('registers pipeline:getDashboard on ipcMain', () => {
		const channels = vi.mocked(ipcMain.handle).mock.calls.map(([ch]) => ch);
		expect(channels).toContain('pipeline:getDashboard');
	});

	it('returns success:true with PipelineDashboardResult shape when store is empty', async () => {
		mockListItems.mockResolvedValue({ items: [], total: 0 });

		const handler = getHandler('pipeline:getDashboard')!;
		const response = (await handler({})) as { success: boolean; data: unknown };

		expect(response.success).toBe(true);
		const data = response.data as {
			stages: Record<string, WorkItem[]>;
			unstaged: WorkItem[];
			total: number;
		};
		expect(data.total).toBe(0);
		expect(data.unstaged).toHaveLength(0);

		// All stages should be seeded with empty arrays
		for (const stage of [...PIPELINE_STAGES, ...PIPELINE_FAILURE_STAGES]) {
			expect(Array.isArray(data.stages[stage])).toBe(true);
			expect(data.stages[stage]).toHaveLength(0);
		}
	});

	it('classifies items with a pipeline label into the correct stage bucket', async () => {
		const agentReadyItem = makeItem({ tags: ['pipeline:agent-ready', 'some-other-tag'] });
		const runnerItem = makeItem({ tags: ['pipeline:runner-active'] });
		const needsFixItem = makeItem({ tags: ['pipeline:needs-fix'] });

		mockListItems.mockResolvedValue({
			items: [agentReadyItem, runnerItem, needsFixItem],
			total: 3,
		});

		const handler = getHandler('pipeline:getDashboard')!;
		const response = (await handler({})) as {
			success: boolean;
			data: { stages: Record<string, WorkItem[]>; unstaged: WorkItem[]; total: number };
		};

		expect(response.success).toBe(true);
		expect(response.data.total).toBe(3);
		expect(response.data.stages['agent-ready']).toHaveLength(1);
		expect(response.data.stages['agent-ready'][0].id).toBe(agentReadyItem.id);
		expect(response.data.stages['runner-active']).toHaveLength(1);
		expect(response.data.stages['needs-fix']).toHaveLength(1);
		expect(response.data.unstaged).toHaveLength(0);
	});

	it('places items with no pipeline label into unstaged', async () => {
		const plain = makeItem({ tags: ['feature', 'priority:high'] });
		const staged = makeItem({ tags: ['pipeline:idea'] });

		mockListItems.mockResolvedValue({ items: [plain, staged], total: 2 });

		const handler = getHandler('pipeline:getDashboard')!;
		const response = (await handler({})) as {
			success: boolean;
			data: { stages: Record<string, WorkItem[]>; unstaged: WorkItem[]; total: number };
		};

		expect(response.data.unstaged).toHaveLength(1);
		expect(response.data.unstaged[0].id).toBe(plain.id);
		expect(response.data.stages['idea']).toHaveLength(1);
	});

	it('accumulates multiple items in the same stage bucket', async () => {
		const i1 = makeItem({ tags: ['pipeline:needs-review'] });
		const i2 = makeItem({ tags: ['pipeline:needs-review', 'priority:critical'] });

		mockListItems.mockResolvedValue({ items: [i1, i2], total: 2 });

		const handler = getHandler('pipeline:getDashboard')!;
		const response = (await handler({})) as {
			success: true;
			data: { stages: Record<string, WorkItem[]>; unstaged: WorkItem[]; total: number };
		};

		expect(response.data.stages['needs-review']).toHaveLength(2);
	});

	it('handles failure-loop stage labels (needs-fix, fix-active)', async () => {
		const fixItem = makeItem({ tags: ['pipeline:fix-active'] });
		mockListItems.mockResolvedValue({ items: [fixItem], total: 1 });

		const handler = getHandler('pipeline:getDashboard')!;
		const response = (await handler({})) as {
			success: true;
			data: { stages: Record<string, WorkItem[]> };
		};

		expect(response.data.stages['fix-active']).toHaveLength(1);
		expect(response.data.stages['fix-active'][0].id).toBe(fixItem.id);
	});

	it('returns success:false when the work graph store throws', async () => {
		mockListItems.mockRejectedValue(new Error('DB unavailable'));

		const handler = getHandler('pipeline:getDashboard')!;
		const response = (await handler({})) as { success: boolean; error: string };

		expect(response.success).toBe(false);
		expect(response.error).toMatch(/DB unavailable/);
	});
});

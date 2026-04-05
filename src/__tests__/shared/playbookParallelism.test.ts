import { describe, expect, it } from 'vitest';
import {
	buildParallelDispatchPlan,
	getPlaybookParallelismWarning,
	selectParallelDispatchNodeIds,
} from '../../shared/playbookParallelism';

describe('playbookParallelism helpers', () => {
	it('warns when shared-checkout nodes request parallel execution', () => {
		const warning = getPlaybookParallelismWarning(
			{
				nodes: [
					{ id: 'root', documentIndex: 0, dependsOn: [], isolationMode: 'shared-checkout' },
					{
						id: 'join',
						documentIndex: 1,
						dependsOn: ['root'],
						isolationMode: 'shared-checkout',
					},
				],
			},
			2
		);

		expect(warning).toMatchObject({
			maxParallelism: 2,
			sharedCheckoutNodeCount: 2,
			isolatedWorktreeNodeCount: 0,
		});
		expect(warning?.message).toMatch(/falls back to sequential execution/i);
	});

	it('does not warn when parallel execution only uses isolated worktrees', () => {
		const warning = getPlaybookParallelismWarning(
			{
				nodes: [
					{ id: 'root', documentIndex: 0, dependsOn: [], isolationMode: 'isolated-worktree' },
					{
						id: 'join',
						documentIndex: 1,
						dependsOn: ['root'],
						isolationMode: 'isolated-worktree',
					},
				],
			},
			2
		);

		expect(warning).toBeNull();
	});

	it('selects one shared-checkout node plus isolated siblings for parallel dispatch', () => {
		const selected = selectParallelDispatchNodeIds(
			[
				{
					id: 'shared',
					documentIndex: 0,
					dependsOn: [],
					state: 'ready',
					isolationMode: 'shared-checkout',
					dispatchOrder: null,
				},
				{
					id: 'isolated-a',
					documentIndex: 1,
					dependsOn: [],
					state: 'ready',
					isolationMode: 'isolated-worktree',
					dispatchOrder: null,
				},
				{
					id: 'isolated-b',
					documentIndex: 2,
					dependsOn: [],
					state: 'ready',
					isolationMode: 'isolated-worktree',
					dispatchOrder: null,
				},
			],
			2
		);

		expect(selected).toEqual(['shared', 'isolated-a']);
	});

	it('filters unsafe isolated targets and falls back one isolated node onto the shared checkout lane', () => {
		const plan = buildParallelDispatchPlan(
			[
				{
					id: 'isolated-a',
					documentIndex: 0,
					dependsOn: [],
					state: 'ready',
					isolationMode: 'isolated-worktree',
					dispatchOrder: null,
				},
				{
					id: 'isolated-b',
					documentIndex: 1,
					dependsOn: [],
					state: 'ready',
					isolationMode: 'isolated-worktree',
					dispatchOrder: null,
				},
			],
			2,
			[
				{ sessionId: 'dup-main', cwd: '/repo' },
				{ sessionId: 'safe-a', cwd: '/repo/worktrees/a' },
				{ sessionId: 'dup-safe-a', cwd: '/repo/worktrees/a/' },
			],
			'/repo/'
		);

		expect(plan.selectedNodeIds).toEqual(['isolated-a', 'isolated-b']);
		expect(plan.isolatedTargetsByNodeId['isolated-a']).toEqual({
			sessionId: 'safe-a',
			cwd: '/repo/worktrees/a',
		});
		expect(plan.isolatedTargetsByNodeId['isolated-b']).toBeNull();
		expect(plan.warnings).toEqual([expect.stringMatching(/falling back to shared checkout/i)]);
	});
});

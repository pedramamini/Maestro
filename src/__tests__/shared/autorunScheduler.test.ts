import { describe, expect, it } from 'vitest';
import {
	createAutoRunSchedulerSnapshot,
	finalizeAutoRunSchedulerNode,
	getAutoRunRecordedSchedulerMode,
	getAutoRunSchedulerNode,
	markAutoRunSchedulerNodeRunning,
	resolveAutoRunSchedulerMode,
} from '../../shared/autorunScheduler';
import {
	claimReadyAutoRunNodes,
	claimReadyAutoRunDispatchWork,
	runAutoRunDispatchBatches,
} from '../../shared/autorunDispatch';

describe('autorunScheduler', () => {
	it('resolves sequential mode for implicit linear playbooks', () => {
		expect(
			resolveAutoRunSchedulerMode({
				maxParallelism: 1,
				taskGraph: {
					nodes: [
						{ id: 'a', documentIndex: 0, dependsOn: [] },
						{ id: 'b', documentIndex: 1, dependsOn: ['a'] },
					],
				},
			})
		).toBe('sequential');
	});

	it('resolves dag mode for fan-out graphs', () => {
		expect(
			resolveAutoRunSchedulerMode({
				maxParallelism: 2,
				taskGraph: {
					nodes: [
						{ id: 'root', documentIndex: 0, dependsOn: [] },
						{ id: 'left', documentIndex: 1, dependsOn: ['root'] },
						{ id: 'right', documentIndex: 2, dependsOn: ['root'] },
					],
				},
			})
		).toBe('dag');
	});

	it('treats maxParallelism as dag intent even for a linear graph shape', () => {
		expect(
			resolveAutoRunSchedulerMode({
				maxParallelism: 2,
				taskGraph: {
					nodes: [
						{ id: 'a', documentIndex: 0, dependsOn: [] },
						{ id: 'b', documentIndex: 1, dependsOn: ['a'] },
					],
				},
			})
		).toBe('dag');
	});

	it('computes deterministic ready ordering with maxParallelism', () => {
		let snapshot = createAutoRunSchedulerSnapshot(
			[{ filename: 'a.md' }, { filename: 'b.md' }, { filename: 'c.md' }],
			{
				nodes: [
					{ id: 'root', documentIndex: 0, dependsOn: [] },
					{ id: 'left', documentIndex: 1, dependsOn: ['root'] },
					{ id: 'right', documentIndex: 2, dependsOn: ['root'] },
				],
			},
			2
		);

		expect(snapshot.readyNodeIds).toEqual(['root']);
		snapshot = markAutoRunSchedulerNodeRunning(snapshot, 'root');
		snapshot = finalizeAutoRunSchedulerNode(snapshot, 'root', 'completed');

		expect(snapshot.readyNodeIds).toEqual(['left', 'right']);
		expect(getAutoRunSchedulerNode(snapshot, 'left')?.state).toBe('ready');
		expect(getAutoRunSchedulerNode(snapshot, 'right')?.state).toBe('ready');
	});

	it('preserves dag intent while observed mode stays sequential for one-at-a-time execution', () => {
		let snapshot = createAutoRunSchedulerSnapshot(
			[{ filename: 'root.md' }, { filename: 'left.md' }, { filename: 'right.md' }],
			{
				nodes: [
					{ id: 'root', documentIndex: 0, dependsOn: [] },
					{ id: 'left', documentIndex: 1, dependsOn: ['root'] },
					{ id: 'right', documentIndex: 2, dependsOn: ['root'] },
				],
			},
			2
		);

		expect(snapshot.configuredMode).toBe('dag');
		expect(snapshot.mode).toBe('sequential');
		expect(snapshot.dispatchProfile.configuredMode).toBe('dag');
		expect(snapshot.dispatchProfile.observedMode).toBe('sequential');
		expect(snapshot.dispatchProfile.hasObservedParallelDispatch).toBe(false);
		expect(snapshot.readyNodeIds).toEqual(['root']);
		expect(snapshot.queue).toEqual({
			blocked: 2,
			ready: 1,
			running: 0,
			completed: 0,
			failed: 0,
			skipped: 0,
		});

		snapshot = markAutoRunSchedulerNodeRunning(snapshot, 'root');
		snapshot = finalizeAutoRunSchedulerNode(snapshot, 'root', 'completed');

		expect(snapshot.configuredMode).toBe('dag');
		expect(snapshot.mode).toBe('sequential');
		expect(snapshot.readyNodeIds).toEqual(['left', 'right']);
		expect(snapshot.queue).toEqual({
			blocked: 0,
			ready: 2,
			running: 0,
			completed: 1,
			failed: 0,
			skipped: 0,
		});

		snapshot = markAutoRunSchedulerNodeRunning(snapshot, 'left');
		expect(snapshot.mode).toBe('sequential');
		expect(snapshot.readyNodeIds).toEqual(['right']);
		expect(getAutoRunSchedulerNode(snapshot, 'left')?.state).toBe('running');
		expect(getAutoRunSchedulerNode(snapshot, 'left')?.dispatchOrder).toBe(2);
		expect(getAutoRunSchedulerNode(snapshot, 'right')?.state).toBe('ready');

		snapshot = finalizeAutoRunSchedulerNode(snapshot, 'left', 'completed');
		snapshot = markAutoRunSchedulerNodeRunning(snapshot, 'right');
		snapshot = finalizeAutoRunSchedulerNode(snapshot, 'right', 'completed');

		expect(snapshot.configuredMode).toBe('dag');
		expect(snapshot.mode).toBe('sequential');
		expect(snapshot.readyNodeIds).toEqual([]);
	});

	it('records observed mode for history and analytics', () => {
		let snapshot = createAutoRunSchedulerSnapshot(
			[{ filename: 'root.md' }, { filename: 'left.md' }, { filename: 'right.md' }],
			{
				nodes: [
					{ id: 'root', documentIndex: 0, dependsOn: [] },
					{ id: 'left', documentIndex: 1, dependsOn: ['root'] },
					{ id: 'right', documentIndex: 2, dependsOn: ['root'] },
				],
			},
			2
		);

		expect(getAutoRunRecordedSchedulerMode(snapshot)).toBe('sequential');

		snapshot = markAutoRunSchedulerNodeRunning(snapshot, 'root');
		snapshot = finalizeAutoRunSchedulerNode(snapshot, 'root', 'completed');
		snapshot = claimReadyAutoRunNodes(snapshot, 2).snapshot;

		expect(getAutoRunRecordedSchedulerMode(snapshot)).toBe('dag');
	});

	it('marks observed mode as dag once multiple ready nodes are claimed together', () => {
		let snapshot = createAutoRunSchedulerSnapshot(
			[{ filename: 'root.md' }, { filename: 'left.md' }, { filename: 'right.md' }],
			{
				nodes: [
					{ id: 'root', documentIndex: 0, dependsOn: [] },
					{ id: 'left', documentIndex: 1, dependsOn: ['root'] },
					{ id: 'right', documentIndex: 2, dependsOn: ['root'] },
				],
			},
			2
		);

		snapshot = markAutoRunSchedulerNodeRunning(snapshot, 'root');
		snapshot = finalizeAutoRunSchedulerNode(snapshot, 'root', 'completed');

		const claimResult = claimReadyAutoRunNodes(snapshot, 2);
		snapshot = claimResult.snapshot;

		expect(claimResult.claims.map((claim) => claim.nodeId)).toEqual(['left', 'right']);
		expect(snapshot.configuredMode).toBe('dag');
		expect(snapshot.mode).toBe('dag');
		expect(snapshot.observedMode).toBe('dag');
		expect(snapshot.dispatchProfile).toEqual({
			configuredMode: 'dag',
			observedMode: 'dag',
			maxParallelism: 2,
			totalClaims: 3,
			maxParallelClaims: 2,
			maxRunningNodes: 2,
			hasObservedParallelDispatch: true,
			queue: {
				blocked: 0,
				ready: 0,
				running: 2,
				completed: 1,
				failed: 0,
				skipped: 0,
			},
		});
		expect(snapshot.dispatchStats.maxParallelClaims).toBe(2);
		expect(snapshot.dispatchStats.maxRunningNodes).toBe(2);
		expect(getAutoRunSchedulerNode(snapshot, 'left')?.dispatchOrder).toBe(2);
		expect(getAutoRunSchedulerNode(snapshot, 'right')?.dispatchOrder).toBe(3);
	});

	it('builds predecessor context for each claimed node when multiple ready nodes are dispatched together', () => {
		let scheduler = createAutoRunSchedulerSnapshot(
			[{ filename: 'root.md' }, { filename: 'left.md' }, { filename: 'right.md' }],
			{
				nodes: [
					{ id: 'root', documentIndex: 0, dependsOn: [] },
					{ id: 'left', documentIndex: 1, dependsOn: ['root'] },
					{ id: 'right', documentIndex: 2, dependsOn: ['root'] },
				],
			},
			2
		);
		scheduler = markAutoRunSchedulerNodeRunning(scheduler, 'root');
		scheduler = finalizeAutoRunSchedulerNode(scheduler, 'root', 'completed');

		const claimResult = claimReadyAutoRunDispatchWork(
			{
				scheduler,
				completedNodeContexts: new Map([
					[
						'root',
						{
							documentName: 'root.md',
							summaries: ['Root summary'],
							success: true,
							verifierVerdict: 'PASS',
						},
					],
				]),
			},
			2
		);

		expect(claimResult.scheduler.mode).toBe('dag');
		expect(claimResult.claims.map((claim) => claim.nodeId)).toEqual(['left', 'right']);
		expect(
			claimResult.claims.every((claim) => claim.predecessorContext.includes('Root summary'))
		).toBe(true);
	});

	it('runs sequential dispatch batches through the shared seam while preserving predecessor context', async () => {
		const initialState = {
			scheduler: createAutoRunSchedulerSnapshot(
				[{ filename: 'root.md' }, { filename: 'left.md' }, { filename: 'right.md' }],
				{
					nodes: [
						{ id: 'root', documentIndex: 0, dependsOn: [] },
						{ id: 'left', documentIndex: 1, dependsOn: ['root'] },
						{ id: 'right', documentIndex: 2, dependsOn: ['root'] },
					],
				},
				2
			),
			completedNodeContexts: new Map(),
		};
		const visited: Array<{ nodeId: string; predecessorContext: string }> = [];

		const finalState = await runAutoRunDispatchBatches(initialState, {
			maxClaims: 1,
			dispatchBatch: (batch) => {
				const claim = batch.claims[0];
				if (!claim) {
					return batch;
				}

				visited.push({
					nodeId: claim.nodeId,
					predecessorContext: claim.predecessorContext,
				});

				return {
					scheduler: finalizeAutoRunSchedulerNode(batch.scheduler, claim.nodeId, 'completed'),
					completedNodeContexts: new Map([
						...batch.completedNodeContexts,
						[
							claim.nodeId,
							{
								documentName: `${claim.nodeId}.md`,
								summaries: [`${claim.nodeId} complete`],
								success: true,
								verifierVerdict: null,
							},
						],
					]),
				};
			},
		});

		expect(visited.map((entry) => entry.nodeId)).toEqual(['root', 'left', 'right']);
		expect(visited[0]?.predecessorContext).toBe('');
		expect(visited[1]?.predecessorContext).toContain('root');
		expect(visited[2]?.predecessorContext).toContain('root');
		expect(finalState.scheduler.nodes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: 'root', state: 'completed' }),
				expect.objectContaining({ id: 'left', state: 'completed' }),
				expect.objectContaining({ id: 'right', state: 'completed' }),
			])
		);
	});

	it('propagates failure by skipping downstream nodes', () => {
		let snapshot = createAutoRunSchedulerSnapshot(
			[{ filename: 'a.md' }, { filename: 'b.md' }, { filename: 'c.md' }],
			{
				nodes: [
					{ id: 'root', documentIndex: 0, dependsOn: [] },
					{ id: 'mid', documentIndex: 1, dependsOn: ['root'] },
					{ id: 'leaf', documentIndex: 2, dependsOn: ['mid'] },
				],
			},
			1
		);

		snapshot = markAutoRunSchedulerNodeRunning(snapshot, 'root');
		snapshot = finalizeAutoRunSchedulerNode(snapshot, 'root', 'failed');

		expect(getAutoRunSchedulerNode(snapshot, 'mid')?.state).toBe('skipped');
		expect(getAutoRunSchedulerNode(snapshot, 'leaf')?.state).toBe('skipped');
		expect(snapshot.readyNodeIds).toEqual([]);
	});

	it('falls back to implicit linear graph for legacy documents', () => {
		const snapshot = createAutoRunSchedulerSnapshot([
			{ filename: 'phase-01.md' },
			{ filename: 'phase-02.md' },
		]);

		expect(snapshot.mode).toBe('sequential');
		expect(snapshot.configuredMode).toBe('sequential');
		expect(snapshot.dispatchProfile).toEqual({
			configuredMode: 'sequential',
			observedMode: 'sequential',
			maxParallelism: 1,
			totalClaims: 0,
			maxParallelClaims: 0,
			maxRunningNodes: 0,
			hasObservedParallelDispatch: false,
			queue: {
				blocked: 1,
				ready: 1,
				running: 0,
				completed: 0,
				failed: 0,
				skipped: 0,
			},
		});
		expect(snapshot.readyNodeIds).toEqual(['phase-01']);
		expect(snapshot.nodes.map((node) => node.id)).toEqual(['phase-01', 'phase-02']);
		expect(snapshot.nodes.map((node) => node.isolationMode)).toEqual([
			'shared-checkout',
			'shared-checkout',
		]);
		expect(snapshot.nodes.map((node) => node.dispatchOrder)).toEqual([null, null]);
	});

	it('preserves node isolation mode in scheduler snapshots', () => {
		const snapshot = createAutoRunSchedulerSnapshot(
			[{ filename: 'shared.md' }, { filename: 'isolated.md' }],
			{
				nodes: [
					{
						id: 'shared',
						documentIndex: 0,
						dependsOn: [],
						isolationMode: 'shared-checkout',
					},
					{
						id: 'isolated',
						documentIndex: 1,
						dependsOn: ['shared'],
						isolationMode: 'isolated-worktree',
					},
				],
			},
			1
		);

		expect(getAutoRunSchedulerNode(snapshot, 'shared')?.isolationMode).toBe('shared-checkout');
		expect(getAutoRunSchedulerNode(snapshot, 'isolated')?.isolationMode).toBe('isolated-worktree');
	});
});

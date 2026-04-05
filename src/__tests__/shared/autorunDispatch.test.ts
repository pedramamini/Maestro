import { describe, expect, it } from 'vitest';
import {
	claimReadyAutoRunDispatchWork,
	executeAutoRunDispatchClaims,
	finalizeAutoRunDispatchNode,
	finalizeAutoRunDispatchNodes,
} from '../../shared/autorunDispatch';
import { createAutoRunSchedulerSnapshot } from '../../shared/autorunScheduler';
import type { PlaybookDocumentEntry, PlaybookTaskGraph } from '../../shared/types';

describe('autorunDispatch', () => {
	it('claims multiple ready nodes while preserving predecessor context for later join nodes', () => {
		const documents: PlaybookDocumentEntry[] = [
			{ filename: 'root-a', resetOnCompletion: false },
			{ filename: 'root-b', resetOnCompletion: false },
			{ filename: 'join', resetOnCompletion: false },
		];
		const taskGraph: PlaybookTaskGraph = {
			nodes: [
				{ id: 'root-a', documentIndex: 0, dependsOn: [] },
				{ id: 'root-b', documentIndex: 1, dependsOn: [] },
				{ id: 'join', documentIndex: 2, dependsOn: ['root-b', 'root-a'] },
			],
		};

		let dispatchState = {
			scheduler: createAutoRunSchedulerSnapshot(documents, taskGraph, 2),
			completedNodeContexts: new Map(),
		};

		const initialClaims = claimReadyAutoRunDispatchWork(dispatchState, 2);
		expect(initialClaims.claims.map((claim) => claim.nodeId)).toEqual(['root-a', 'root-b']);
		expect(initialClaims.claims.every((claim) => claim.predecessorContext === '')).toBe(true);

		dispatchState = finalizeAutoRunDispatchNode(initialClaims, {
			nodeId: 'root-b',
			documentName: 'root-b',
			state: 'completed',
			summaries: ['Implemented branch B'],
			success: true,
		});
		dispatchState = finalizeAutoRunDispatchNode(dispatchState, {
			nodeId: 'root-a',
			documentName: 'root-a',
			state: 'completed',
			summaries: ['Implemented branch A'],
			success: true,
		});

		const joinClaim = claimReadyAutoRunDispatchWork(dispatchState, 1).claims[0];
		expect(joinClaim?.nodeId).toBe('join');
		expect(joinClaim?.predecessorContext).toContain('## Predecessor Outputs');
		expect(joinClaim?.predecessorContext).toContain('### root-b [PASS]');
		expect(joinClaim?.predecessorContext).toContain('- Implemented branch B');
		expect(joinClaim?.predecessorContext).toContain('### root-a [PASS]');
		expect(joinClaim?.predecessorContext).toContain('- Implemented branch A');
		expect(joinClaim?.predecessorContext.indexOf('### root-b [PASS]')).toBeLessThan(
			joinClaim?.predecessorContext.indexOf('### root-a [PASS]') ?? Infinity
		);
	});

	it('finalize helper preserves scheduler failure propagation for dependent nodes', () => {
		const documents: PlaybookDocumentEntry[] = [
			{ filename: 'root', resetOnCompletion: false },
			{ filename: 'child', resetOnCompletion: false },
		];
		const taskGraph: PlaybookTaskGraph = {
			nodes: [
				{ id: 'root', documentIndex: 0, dependsOn: [] },
				{ id: 'child', documentIndex: 1, dependsOn: ['root'] },
			],
		};

		const initialState = {
			scheduler: createAutoRunSchedulerSnapshot(documents, taskGraph, 2),
			completedNodeContexts: new Map(),
		};
		const claimedState = claimReadyAutoRunDispatchWork(initialState, 1);
		const finalizedState = finalizeAutoRunDispatchNode(claimedState, {
			nodeId: 'root',
			documentName: 'root',
			state: 'failed',
			summaries: ['Verification failed'],
			success: false,
			verifierVerdict: 'FAIL',
		});

		expect(finalizedState.scheduler.nodes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: 'root', state: 'failed' }),
				expect.objectContaining({ id: 'child', state: 'skipped' }),
			])
		);
		expect(finalizedState.completedNodeContexts.get('root')).toEqual({
			documentName: 'root',
			summaries: ['Verification failed'],
			success: false,
			timedOut: undefined,
			verifierVerdict: 'FAIL',
		});
	});

	it('applies multiple node finalizations through the shared batch helper', () => {
		const documents: PlaybookDocumentEntry[] = [
			{ filename: 'root-a', resetOnCompletion: false },
			{ filename: 'root-b', resetOnCompletion: false },
			{ filename: 'join', resetOnCompletion: false },
		];
		const taskGraph: PlaybookTaskGraph = {
			nodes: [
				{ id: 'root-a', documentIndex: 0, dependsOn: [] },
				{ id: 'root-b', documentIndex: 1, dependsOn: [] },
				{ id: 'join', documentIndex: 2, dependsOn: ['root-a', 'root-b'] },
			],
		};

		const initialState = {
			scheduler: createAutoRunSchedulerSnapshot(documents, taskGraph, 2),
			completedNodeContexts: new Map(),
		};
		const claimedState = claimReadyAutoRunDispatchWork(initialState, 2);
		const finalizedState = finalizeAutoRunDispatchNodes(claimedState, [
			{
				nodeId: 'root-a',
				documentName: 'root-a',
				state: 'completed',
				summaries: ['Implemented branch A'],
				success: true,
			},
			{
				nodeId: 'root-b',
				documentName: 'root-b',
				state: 'completed',
				summaries: ['Implemented branch B'],
				success: true,
			},
		]);

		const joinClaim = claimReadyAutoRunDispatchWork(finalizedState, 1).claims[0];
		expect(joinClaim?.nodeId).toBe('join');
		expect(joinClaim?.predecessorContext).toContain('### root-a [PASS]');
		expect(joinClaim?.predecessorContext).toContain('### root-b [PASS]');
	});

	it('executes a claim batch and returns results plus finalized state', async () => {
		const documents: PlaybookDocumentEntry[] = [
			{ filename: 'root-a', resetOnCompletion: false },
			{ filename: 'root-b', resetOnCompletion: false },
			{ filename: 'join', resetOnCompletion: false },
		];
		const taskGraph: PlaybookTaskGraph = {
			nodes: [
				{ id: 'root-a', documentIndex: 0, dependsOn: [] },
				{ id: 'root-b', documentIndex: 1, dependsOn: [] },
				{ id: 'join', documentIndex: 2, dependsOn: ['root-a', 'root-b'] },
			],
		};

		const initialState = {
			scheduler: createAutoRunSchedulerSnapshot(documents, taskGraph, 2),
			completedNodeContexts: new Map(),
		};
		const claimedState = claimReadyAutoRunDispatchWork(initialState, 2);
		const executionBatch = await executeAutoRunDispatchClaims(
			claimedState,
			claimedState.claims,
			async (claim) => ({
				finalizeOptions: {
					nodeId: claim.nodeId,
					documentName: claim.nodeId,
					state: 'completed',
					summaries: [`done:${claim.nodeId}`],
					success: true,
				},
				events: [claim.nodeId],
				tasksCompleted: 1,
				inputTokens: 10,
				outputTokens: 5,
				totalCost: 0.01,
				countedCompletedTasks: 1,
				anyTasksProcessed: true,
			})
		);

		expect(executionBatch.results.map((result) => result.events[0])).toEqual(['root-a', 'root-b']);
		expect(executionBatch.state.scheduler.nodes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: 'root-a', state: 'completed' }),
				expect.objectContaining({ id: 'root-b', state: 'completed' }),
			])
		);
		expect(claimReadyAutoRunDispatchWork(executionBatch.state, 1).claims[0]?.nodeId).toBe('join');
	});
});

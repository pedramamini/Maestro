import type {
	AutoRunSchedulerNodeSnapshot,
	AutoRunSchedulerNodeState,
	AutoRunSchedulerSnapshot,
} from './types';
import type { AutoRunCompletedNodeContext } from './autorunExecutionModel';
import { buildAutoRunPredecessorContext } from './autorunExecutionModel';
import {
	finalizeAutoRunSchedulerNode,
	getAutoRunSchedulerNode,
	markAutoRunSchedulerNodeRunning,
} from './autorunScheduler';

export interface AutoRunDispatchClaim {
	nodeId: string;
	node: AutoRunSchedulerNodeSnapshot;
}

export interface AutoRunDispatchState {
	scheduler: AutoRunSchedulerSnapshot;
	completedNodeContexts: ReadonlyMap<string, AutoRunCompletedNodeContext>;
}

export interface AutoRunDispatchReadyNode extends AutoRunDispatchClaim {
	predecessorContext: string;
}

export interface ClaimReadyAutoRunNodesOptions {
	maxClaims?: number;
	selectNodeIds?: (readyNodes: AutoRunSchedulerNodeSnapshot[], maxClaims: number) => string[];
}

export interface ClaimReadyAutoRunNodesResult {
	snapshot: AutoRunSchedulerSnapshot;
	claims: AutoRunDispatchClaim[];
}

export interface ClaimReadyAutoRunDispatchWorkResult extends AutoRunDispatchState {
	claims: AutoRunDispatchReadyNode[];
}

export interface RunAutoRunDispatchBatchesOptions {
	maxClaims?: number | ((state: AutoRunDispatchState) => number);
	selectNodeIds?: (readyNodes: AutoRunSchedulerNodeSnapshot[], maxClaims: number) => string[];
	canContinue?: (state: AutoRunDispatchState) => boolean;
	dispatchBatch: (
		batch: ClaimReadyAutoRunDispatchWorkResult
	) => Promise<AutoRunDispatchState> | AutoRunDispatchState;
}

export interface FinalizeAutoRunDispatchNodeOptions {
	nodeId: string;
	documentName: string;
	state: Extract<AutoRunSchedulerNodeState, 'completed' | 'failed'>;
	summaries: string[];
	success: boolean;
	timedOut?: boolean;
	verifierVerdict?: 'PASS' | 'WARN' | 'FAIL' | null;
}

export interface AutoRunDispatchFinalizeResult {
	finalizeOptions: FinalizeAutoRunDispatchNodeOptions;
}

export interface AutoRunDispatchExecutionResult<
	TEvent = never,
> extends AutoRunDispatchFinalizeResult {
	events: TEvent[];
	tasksCompleted: number;
	inputTokens: number;
	outputTokens: number;
	totalCost: number;
	countedCompletedTasks: number;
	anyTasksProcessed: boolean;
}

export interface ExecuteAutoRunDispatchClaimsResult<TEvent = never> {
	results: AutoRunDispatchExecutionResult<TEvent>[];
	state: AutoRunDispatchState;
}

export function claimReadyAutoRunNodes(
	snapshot: AutoRunSchedulerSnapshot,
	options: number | ClaimReadyAutoRunNodesOptions = 1
): ClaimReadyAutoRunNodesResult {
	const normalizedOptions =
		typeof options === 'number'
			? {
					maxClaims: options,
				}
			: options;
	const claims: AutoRunDispatchClaim[] = [];
	let nextSnapshot = snapshot;
	const safeLimit = Math.max(0, normalizedOptions.maxClaims ?? 1);
	const readyNodes = nextSnapshot.readyNodeIds
		.map((nodeId) => getAutoRunSchedulerNode(nextSnapshot, nodeId))
		.filter((node): node is AutoRunSchedulerNodeSnapshot => Boolean(node));
	const selectedNodeIds = (
		normalizedOptions.selectNodeIds
			? normalizedOptions.selectNodeIds(readyNodes, safeLimit)
			: readyNodes.slice(0, safeLimit).map((node) => node.id)
	).slice(0, safeLimit);

	for (const nodeId of selectedNodeIds) {
		const node = getAutoRunSchedulerNode(nextSnapshot, nodeId);
		if (!node || node.state !== 'ready') {
			continue;
		}

		nextSnapshot = markAutoRunSchedulerNodeRunning(nextSnapshot, nodeId);
		const claimedNode = getAutoRunSchedulerNode(nextSnapshot, nodeId);
		if (!claimedNode) {
			continue;
		}

		claims.push({
			nodeId,
			node: claimedNode,
		});
	}

	return {
		snapshot: nextSnapshot,
		claims,
	};
}

export function claimReadyAutoRunDispatchWork(
	state: AutoRunDispatchState,
	options: number | ClaimReadyAutoRunNodesOptions = 1
): ClaimReadyAutoRunDispatchWorkResult {
	const claimResult = claimReadyAutoRunNodes(state.scheduler, options);

	return {
		scheduler: claimResult.snapshot,
		completedNodeContexts: state.completedNodeContexts,
		claims: claimResult.claims.map((claim) => ({
			...claim,
			predecessorContext: buildAutoRunPredecessorContext(
				claim.node.dependsOn,
				state.completedNodeContexts
			),
		})),
	};
}

export async function runAutoRunDispatchBatches(
	state: AutoRunDispatchState,
	options: RunAutoRunDispatchBatchesOptions
): Promise<AutoRunDispatchState> {
	let nextState = state;

	while (nextState.scheduler.readyNodeIds.length > 0) {
		if (options.canContinue && !options.canContinue(nextState)) {
			break;
		}

		const maxClaims =
			typeof options.maxClaims === 'function'
				? options.maxClaims(nextState)
				: (options.maxClaims ?? 1);
		const claimResult = claimReadyAutoRunDispatchWork(nextState, {
			maxClaims,
			selectNodeIds: options.selectNodeIds,
		});
		if (claimResult.claims.length === 0) {
			break;
		}

		nextState = await options.dispatchBatch(claimResult);
	}

	return nextState;
}

export function finalizeAutoRunDispatchNode(
	state: AutoRunDispatchState,
	options: FinalizeAutoRunDispatchNodeOptions
): AutoRunDispatchState {
	const completedNodeContexts = new Map(state.completedNodeContexts);
	completedNodeContexts.set(options.nodeId, {
		documentName: options.documentName,
		summaries: options.summaries,
		success: options.success,
		timedOut: options.timedOut,
		verifierVerdict: options.verifierVerdict ?? null,
	});

	return {
		scheduler: finalizeAutoRunSchedulerNode(state.scheduler, options.nodeId, options.state),
		completedNodeContexts,
	};
}

export function finalizeAutoRunDispatchNodes(
	state: AutoRunDispatchState,
	optionsList: readonly FinalizeAutoRunDispatchNodeOptions[]
): AutoRunDispatchState {
	return optionsList.reduce(
		(nextState, options) => finalizeAutoRunDispatchNode(nextState, options),
		state
	);
}

export async function executeAutoRunDispatchClaims<TEvent = never>(
	state: AutoRunDispatchState,
	claims: readonly AutoRunDispatchReadyNode[],
	executeClaim: (
		claim: AutoRunDispatchReadyNode,
		batchState: AutoRunDispatchState
	) => Promise<AutoRunDispatchExecutionResult<TEvent>>
): Promise<ExecuteAutoRunDispatchClaimsResult<TEvent>> {
	const results = await Promise.all(claims.map((claim) => executeClaim(claim, state)));

	return {
		results,
		state: finalizeAutoRunDispatchNodes(
			state,
			results.map((result) => result.finalizeOptions)
		),
	};
}

import type {
	AutoRunDispatchProfile,
	AutoRunSchedulerMode,
	AutoRunSchedulerDispatchStats,
	AutoRunSchedulerNodeSnapshot,
	AutoRunSchedulerQueueStats,
	AutoRunSchedulerSnapshot,
	PlaybookBaselineMetadata,
	PlaybookTaskGraph,
} from './types';
import { normalizePlaybookMaxParallelism, resolvePlaybookTaskGraph } from './playbookDag';

type DocumentLike = { filename: string };

type SchedulerConfigLike = Pick<PlaybookBaselineMetadata, 'maxParallelism' | 'taskGraph'>;

export interface AutoRunObservedExecutionSummary {
	observedSchedulerMode: AutoRunSchedulerMode;
	configuredSchedulerMode: AutoRunSchedulerMode;
	actualParallelNodeCount: number;
	sharedCheckoutFallbackCount: number;
	blockedNodeCount: number;
	skippedNodeCount: number;
}

function createDefaultDispatchStats(): AutoRunSchedulerDispatchStats {
	return {
		totalClaims: 0,
		maxParallelClaims: 0,
		maxRunningNodes: 0,
	};
}

function resolveObservedAutoRunSchedulerMode(
	dispatchStats: AutoRunSchedulerDispatchStats
): AutoRunSchedulerMode {
	return dispatchStats.maxRunningNodes > 1 || dispatchStats.maxParallelClaims > 1
		? 'dag'
		: 'sequential';
}

function buildAutoRunSchedulerQueueStats(
	nodes: AutoRunSchedulerNodeSnapshot[]
): AutoRunSchedulerQueueStats {
	return nodes.reduce<AutoRunSchedulerQueueStats>(
		(queue, node) => {
			queue[node.state] += 1;
			return queue;
		},
		{
			blocked: 0,
			ready: 0,
			running: 0,
			completed: 0,
			failed: 0,
			skipped: 0,
		}
	);
}

function buildAutoRunDispatchProfile(
	configuredMode: AutoRunSchedulerMode,
	observedMode: AutoRunSchedulerMode,
	maxParallelism: number,
	dispatchStats: AutoRunSchedulerDispatchStats,
	queue: AutoRunSchedulerQueueStats
): AutoRunDispatchProfile {
	return {
		configuredMode,
		observedMode,
		maxParallelism,
		totalClaims: dispatchStats.totalClaims,
		maxParallelClaims: dispatchStats.maxParallelClaims,
		maxRunningNodes: dispatchStats.maxRunningNodes,
		hasObservedParallelDispatch:
			dispatchStats.maxRunningNodes > 1 || dispatchStats.maxParallelClaims > 1,
		queue,
	};
}

function sortSchedulerNodes(
	left: Pick<AutoRunSchedulerNodeSnapshot, 'documentIndex' | 'id'>,
	right: Pick<AutoRunSchedulerNodeSnapshot, 'documentIndex' | 'id'>
): number {
	if (left.documentIndex !== right.documentIndex) {
		return left.documentIndex - right.documentIndex;
	}
	return left.id.localeCompare(right.id);
}

export function resolveAutoRunSchedulerMode(
	config: SchedulerConfigLike | null | undefined
): AutoRunSchedulerMode {
	if ((config?.maxParallelism ?? 1) > 1) {
		return 'dag';
	}

	const nodes = config?.taskGraph?.nodes ?? [];
	for (const [index, node] of nodes.entries()) {
		const previousNode = index > 0 ? nodes[index - 1] : undefined;
		const expectedDependsOn = previousNode ? [previousNode.id] : [];
		const actualDependsOn = Array.isArray(node.dependsOn) ? node.dependsOn : [];
		if (
			actualDependsOn.length !== expectedDependsOn.length ||
			actualDependsOn.some(
				(dependency, dependencyIndex) => dependency !== expectedDependsOn[dependencyIndex]
			)
		) {
			return 'dag';
		}
	}

	return 'sequential';
}

function recomputeSchedulerDerivedState(
	nodes: AutoRunSchedulerNodeSnapshot[],
	maxParallelism: number,
	configuredMode: AutoRunSchedulerMode,
	dispatchStats: AutoRunSchedulerDispatchStats
): AutoRunSchedulerSnapshot {
	const runningCount = nodes.filter((node) => node.state === 'running').length;
	let normalizedNodes = nodes.map((node) => ({ ...node }));
	let changed = true;

	while (changed) {
		changed = false;
		const nodesById = new Map(normalizedNodes.map((node) => [node.id, node]));
		normalizedNodes = normalizedNodes.map((node) => {
			if (node.state === 'completed' || node.state === 'failed' || node.state === 'skipped') {
				return node;
			}
			if (node.state === 'running') {
				return node;
			}

			const dependencies = node.dependsOn
				.map((dependencyId) => nodesById.get(dependencyId))
				.filter((dependency): dependency is AutoRunSchedulerNodeSnapshot => Boolean(dependency));

			let nextState: AutoRunSchedulerNodeSnapshot['state'] = 'blocked';
			if (
				dependencies.some(
					(dependency) => dependency.state === 'failed' || dependency.state === 'skipped'
				)
			) {
				nextState = 'skipped';
			} else if (dependencies.every((dependency) => dependency.state === 'completed')) {
				nextState = 'ready';
			}

			if (nextState !== node.state) {
				changed = true;
				return { ...node, state: nextState };
			}

			return node;
		});
	}

	const readyNodeIds = normalizedNodes
		.filter((node) => node.state === 'ready')
		.sort(sortSchedulerNodes)
		.slice(0, Math.max(0, maxParallelism - runningCount))
		.map((node) => node.id);
	const observedMode = resolveObservedAutoRunSchedulerMode(dispatchStats);
	const queue = buildAutoRunSchedulerQueueStats(normalizedNodes);

	return {
		mode: observedMode,
		configuredMode,
		observedMode,
		maxParallelism,
		readyNodeIds,
		dispatchStats,
		queue,
		dispatchProfile: buildAutoRunDispatchProfile(
			configuredMode,
			observedMode,
			maxParallelism,
			dispatchStats,
			queue
		),
		nodes: normalizedNodes,
	};
}

export function createAutoRunSchedulerSnapshot(
	documents: DocumentLike[],
	taskGraph?: PlaybookTaskGraph | null,
	maxParallelism?: number | null
): AutoRunSchedulerSnapshot {
	const normalizedGraph = resolvePlaybookTaskGraph(documents, taskGraph);
	const normalizedMaxParallelism = normalizePlaybookMaxParallelism(maxParallelism);
	const configuredMode = resolveAutoRunSchedulerMode({
		taskGraph: normalizedGraph,
		maxParallelism,
	});
	const nodes: AutoRunSchedulerNodeSnapshot[] = normalizedGraph.nodes.map((node) => ({
		id: node.id,
		documentIndex: node.documentIndex,
		dependsOn: Array.isArray(node.dependsOn) ? [...node.dependsOn] : [],
		isolationMode: node.isolationMode ?? 'shared-checkout',
		state: 'blocked',
		dispatchOrder: null,
	}));

	return recomputeSchedulerDerivedState(
		nodes,
		normalizedMaxParallelism,
		configuredMode,
		createDefaultDispatchStats()
	);
}

export function getAutoRunSchedulerNode(
	snapshot: AutoRunSchedulerSnapshot,
	nodeId: string
): AutoRunSchedulerNodeSnapshot | undefined {
	return snapshot.nodes.find((node) => node.id === nodeId);
}

export function getAutoRunRecordedSchedulerMode(
	snapshot: Pick<AutoRunSchedulerSnapshot, 'observedMode'>
): AutoRunSchedulerMode {
	return snapshot.observedMode;
}

export function summarizeAutoRunObservedExecution(
	snapshot: AutoRunSchedulerSnapshot,
	options?: {
		sharedCheckoutFallbackCount?: number;
	}
): AutoRunObservedExecutionSummary {
	return {
		observedSchedulerMode: snapshot.observedMode,
		configuredSchedulerMode: snapshot.configuredMode,
		actualParallelNodeCount: Math.max(
			snapshot.dispatchProfile.maxRunningNodes,
			snapshot.dispatchProfile.maxParallelClaims
		),
		sharedCheckoutFallbackCount: options?.sharedCheckoutFallbackCount ?? 0,
		blockedNodeCount: snapshot.queue.blocked,
		skippedNodeCount: snapshot.queue.skipped,
	};
}

export function markAutoRunSchedulerNodeRunning(
	snapshot: AutoRunSchedulerSnapshot,
	nodeId: string
): AutoRunSchedulerSnapshot {
	const nextTotalClaims = snapshot.dispatchStats.totalClaims + 1;
	const nextNodes = snapshot.nodes.map((node) =>
		node.id === nodeId && node.state === 'ready'
			? {
					...node,
					state: 'running' as const,
					dispatchOrder: nextTotalClaims,
				}
			: node
	);
	const runningCount = nextNodes.filter((node) => node.state === 'running').length;
	const dispatchStats: AutoRunSchedulerDispatchStats = {
		totalClaims: nextTotalClaims,
		maxParallelClaims: Math.max(snapshot.dispatchStats.maxParallelClaims, runningCount),
		maxRunningNodes: Math.max(snapshot.dispatchStats.maxRunningNodes, runningCount),
	};

	return recomputeSchedulerDerivedState(
		nextNodes,
		snapshot.maxParallelism,
		snapshot.configuredMode,
		dispatchStats
	);
}

export function finalizeAutoRunSchedulerNode(
	snapshot: AutoRunSchedulerSnapshot,
	nodeId: string,
	state: Extract<AutoRunSchedulerNodeSnapshot['state'], 'completed' | 'failed' | 'skipped'>
): AutoRunSchedulerSnapshot {
	return recomputeSchedulerDerivedState(
		snapshot.nodes.map((node) => (node.id === nodeId ? { ...node, state } : node)),
		snapshot.maxParallelism,
		snapshot.configuredMode,
		snapshot.dispatchStats
	);
}

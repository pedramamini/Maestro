import { normalizePlaybookMaxParallelism } from './playbookDag';
import type {
	AutoRunSchedulerNodeSnapshot,
	BatchRunIsolatedWorktreeTarget,
	PlaybookTaskGraph,
} from './types';

export interface PlaybookParallelismWarning {
	maxParallelism: number;
	sharedCheckoutNodeCount: number;
	isolatedWorktreeNodeCount: number;
	message: string;
}

export interface ParallelDispatchPlan {
	selectedNodeIds: string[];
	isolatedTargetsByNodeId: Record<string, BatchRunIsolatedWorktreeTarget | null>;
	warnings: string[];
}

function normalizeDispatchPath(cwd: string): string {
	return cwd.replace(/[\\/]+$/, '') || cwd;
}

function getSafeIsolatedWorktreeTargets(
	targets: BatchRunIsolatedWorktreeTarget[],
	sharedCheckoutCwd?: string
): BatchRunIsolatedWorktreeTarget[] {
	const blockedCwd = sharedCheckoutCwd ? normalizeDispatchPath(sharedCheckoutCwd) : null;
	const seen = new Set<string>();
	const safeTargets: BatchRunIsolatedWorktreeTarget[] = [];

	for (const target of targets) {
		if (!target?.cwd) {
			continue;
		}

		const normalizedCwd = normalizeDispatchPath(target.cwd);
		if (!normalizedCwd || seen.has(normalizedCwd) || normalizedCwd === blockedCwd) {
			continue;
		}

		seen.add(normalizedCwd);
		safeTargets.push(target);
	}

	return safeTargets;
}

export function getPlaybookParallelismWarning(
	taskGraph?: PlaybookTaskGraph | null,
	maxParallelism?: number | null
): PlaybookParallelismWarning | null {
	const normalizedMaxParallelism = normalizePlaybookMaxParallelism(maxParallelism);
	if (normalizedMaxParallelism <= 1) {
		return null;
	}

	const nodes = Array.isArray(taskGraph?.nodes) ? taskGraph.nodes : [];
	if (nodes.length === 0) {
		return null;
	}

	const sharedCheckoutNodeCount = nodes.filter(
		(node) => (node.isolationMode ?? 'shared-checkout') === 'shared-checkout'
	).length;

	if (sharedCheckoutNodeCount === 0) {
		return null;
	}

	const isolatedWorktreeNodeCount = nodes.length - sharedCheckoutNodeCount;
	const nodeLabel = sharedCheckoutNodeCount === 1 ? 'node still uses' : 'nodes still use';

	return {
		maxParallelism: normalizedMaxParallelism,
		sharedCheckoutNodeCount,
		isolatedWorktreeNodeCount,
		message: `This playbook requests max parallelism ${normalizedMaxParallelism}, but ${sharedCheckoutNodeCount} task graph ${nodeLabel} shared-checkout. Maestro currently falls back to sequential execution for shared-checkout nodes to avoid checkout races. Switch those nodes to isolated-worktree for true parallel execution.`,
	};
}

export function selectParallelDispatchNodeIds(
	readyNodes: AutoRunSchedulerNodeSnapshot[],
	maxClaims: number
): string[] {
	if (maxClaims <= 1) {
		return readyNodes.slice(0, 1).map((node) => node.id);
	}

	const sharedNode = readyNodes.find((node) => node.isolationMode !== 'isolated-worktree');
	const isolatedNodes = readyNodes.filter((node) => node.isolationMode === 'isolated-worktree');
	const selectedNodeIds: string[] = [];

	if (sharedNode) {
		selectedNodeIds.push(sharedNode.id);
	}

	for (const node of isolatedNodes) {
		if (selectedNodeIds.length >= maxClaims) {
			break;
		}
		selectedNodeIds.push(node.id);
	}

	if (selectedNodeIds.length === 0) {
		return readyNodes.slice(0, maxClaims).map((node) => node.id);
	}

	return selectedNodeIds;
}

export function buildParallelDispatchPlan(
	readyNodes: AutoRunSchedulerNodeSnapshot[],
	maxClaims: number,
	isolatedWorktreeTargets: BatchRunIsolatedWorktreeTarget[],
	sharedCheckoutCwd?: string
): ParallelDispatchPlan {
	if (maxClaims <= 0 || readyNodes.length === 0) {
		return {
			selectedNodeIds: [],
			isolatedTargetsByNodeId: {},
			warnings: [],
		};
	}

	const safeTargets = getSafeIsolatedWorktreeTargets(isolatedWorktreeTargets, sharedCheckoutCwd);
	const readySharedNodes = readyNodes.filter((node) => node.isolationMode !== 'isolated-worktree');
	const readyIsolatedNodes = readyNodes.filter(
		(node) => node.isolationMode === 'isolated-worktree'
	);
	const selectedNodeIds: string[] = [];
	const isolatedTargetsByNodeId: Record<string, BatchRunIsolatedWorktreeTarget | null> = {};
	const warnings: string[] = [];

	if (readySharedNodes.length > 0) {
		selectedNodeIds.push(readySharedNodes[0].id);
	}

	const remainingClaims = Math.max(0, maxClaims - selectedNodeIds.length);
	const isolatedCapacity = Math.min(readyIsolatedNodes.length, safeTargets.length, remainingClaims);

	for (let index = 0; index < isolatedCapacity; index += 1) {
		const node = readyIsolatedNodes[index];
		const target = safeTargets[index];
		if (!node || !target) {
			continue;
		}
		selectedNodeIds.push(node.id);
		isolatedTargetsByNodeId[node.id] = target;
	}

	const unassignedIsolatedNodes = readyIsolatedNodes.filter(
		(node) => !selectedNodeIds.includes(node.id)
	);
	if (
		selectedNodeIds.length < maxClaims &&
		readySharedNodes.length === 0 &&
		unassignedIsolatedNodes[0]
	) {
		const fallbackNode = unassignedIsolatedNodes[0];
		selectedNodeIds.push(fallbackNode.id);
		isolatedTargetsByNodeId[fallbackNode.id] = null;
		warnings.push(
			`Falling back to shared checkout for isolated node "${fallbackNode.id}" because no safe isolated worktree target was available.`
		);
	}

	return {
		selectedNodeIds,
		isolatedTargetsByNodeId,
		warnings,
	};
}

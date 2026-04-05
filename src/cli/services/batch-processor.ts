// Batch processor service for CLI
// Executes playbooks and yields JSONL events

import { execFileSync } from 'child_process';
import type {
	AutoRunSchedulerNodeSnapshot,
	BatchRunConfig,
	BatchRunIsolatedWorktreeTarget,
	HistoryEntry,
	HistoryUsageBreakdown,
	Playbook,
	SessionInfo,
	ToolType,
	UsageStats,
} from '../../shared/types';
import type { JsonlEvent } from '../output/jsonl';
import {
	spawnAgent,
	type AgentResult,
	readDocAndCountTasks,
	readDocAndGetTasks,
	uncheckAllTasks,
	writeDoc,
} from './agent-spawner';
import { addHistoryEntry, readGroups } from './storage';
import { substituteTemplateVariables, TemplateContext } from '../../shared/templateVariables';
import { registerCliActivity, unregisterCliActivity } from '../../shared/cli-activity';
import { logger } from '../../main/utils/logger';
import { generateUUID } from '../../shared/uuid';
import { estimateTokenCount } from '../../shared/formatters';
import { buildActiveTaskDocumentContext } from '../../shared/markdownTaskUtils';
import { getPlaybookPromptForExecution } from '../../shared/playbookPromptUtils';
import { resolvePlaybookSkills, buildSkillPromptBlock } from './skill-resolver';
import { recordSkillBusRun } from './skill-bus';
import { validatePlaybookDag } from '../../shared/playbookDag';
import {
	createAutoRunSchedulerSnapshot,
	finalizeAutoRunSchedulerNode,
	summarizeAutoRunObservedExecution,
} from '../../shared/autorunScheduler';
import {
	type AutoRunDispatchExecutionResult,
	claimReadyAutoRunDispatchWork,
	claimReadyAutoRunNodes,
	executeAutoRunDispatchClaims,
	finalizeAutoRunDispatchNode,
	finalizeAutoRunDispatchNodes,
} from '../../shared/autorunDispatch';
import { buildParallelDispatchPlan } from '../../shared/playbookParallelism';
import { buildAutoRunSkillBusPayload } from '../../shared/skillBus';
import {
	buildAutoRunAggregateUsageStats,
	buildAutoRunDocumentTaskState,
	buildAutoRunDocumentPromptSection,
	buildAutoRunLoopSummaryEntry,
	buildAutoRunStagePrompt,
	buildAutoRunVerifierNote,
	buildAutoRunTotalSummaryDetails,
	finalizeAutoRunTaskExecution,
	finalizePlanExecuteVerifyResult,
	getVerifierVerdict,
	mergeAutoRunVerifierVerdict,
	mergeUsageStats,
	type AutoRunCompletedNodeContext,
} from '../../shared/autorunExecutionModel';
import { ensureMarkdownFilename } from '../../shared/markdownFilenames';
import type {
	PlaybookAgentStrategy,
	PlaybookDocumentContextMode,
	PlaybookPromptProfile,
	PlaybookSkillPromptMode,
} from '../../shared/types';
import * as taskSyncService from './task-sync';
import type { TaskExecutionStatus, TaskExecutionMetadata } from './task-sync';

/**
 * Update project memory task status if project memory execution is configured
 */
function updateProjectMemoryTaskStatus(
	playbook: {
		projectMemoryExecution?: {
			repoRoot?: string | null;
			taskId?: string | null;
			executorId?: string | null;
		} | null;
	},
	status: TaskExecutionStatus,
	metadata?: TaskExecutionMetadata
): void {
	if (!playbook.projectMemoryExecution) {
		return;
	}
	const { repoRoot, taskId, executorId } = playbook.projectMemoryExecution;
	if (!repoRoot || !taskId || !executorId) {
		return;
	}
	try {
		taskSyncService.updateTaskStatusFromExecutor(
			{ repoRoot, executorId },
			taskId,
			status,
			metadata
		);
	} catch (error) {
		// Log but don't fail execution - status updates are best-effort
		logger.autorun(`Failed to update project memory task status: ${error}`, 'batch-processor', {
			taskId,
			status,
			error: String(error),
		});
	}
}

const PROJECT_MEMORY_HEARTBEAT_INTERVAL_MS = 60 * 1000;

function startProjectMemoryHeartbeat(playbook: {
	projectMemoryExecution?: {
		repoRoot?: string | null;
		taskId?: string | null;
		executorId?: string | null;
	} | null;
}): () => void {
	if (!playbook.projectMemoryExecution) {
		return () => {};
	}
	const { repoRoot, taskId, executorId } = playbook.projectMemoryExecution;
	if (!repoRoot || !taskId || !executorId) {
		return () => {};
	}

	const interval = setInterval(() => {
		try {
			taskSyncService.heartbeatTask({ repoRoot, executorId }, taskId);
		} catch (error) {
			logger.autorun(`Failed to heartbeat project memory task: ${error}`, 'batch-processor', {
				taskId,
				error: String(error),
			});
		}
	}, PROJECT_MEMORY_HEARTBEAT_INTERVAL_MS);
	if (typeof interval.unref === 'function') {
		interval.unref();
	}

	return () => {
		clearInterval(interval);
	};
}

const DEFAULT_TASK_TIMEOUT_MS = 60000;
const DEFAULT_CODEX_TASK_TIMEOUT_MS = 300000;
const DEFAULT_CODEX_HEAVY_STAGE_TIMEOUT_MS = 600000;

const PLAN_STEP_INSTRUCTION = `You are the planning step for Maestro Auto Run.

Rules:
- Do not modify any files.
- Inspect only what is necessary to understand the active task.
- Produce a concise execution plan for the active task only.
- Keep the output short and actionable.`;

const EXECUTE_STEP_INSTRUCTION = `You are the execution step for Maestro Auto Run.

Rules:
- Execute the active task using the provided plan when helpful.
- Modify files as needed, but keep the change set minimal.
- Update the Auto Run document by checking the completed task or adding a brief blocker note.
- Stop after the active task is done.`;

const VERIFY_STEP_INSTRUCTION = `You are the verification step for Maestro Auto Run.

Rules:
- Do not modify any files.
- Review the completed work for the active task only.
- Reply with one of PASS, WARN, or FAIL on the first line, followed by a concise explanation.
- Mention the most important remaining risk, if any.`;

const AUTORUN_CONTEXT_AND_IMPACT_INSTRUCTION = `Before making any non-trivial code change, follow the repository's context-and-impact workflow:
- use GitNexus/context to inspect the target symbol or file
- use GitNexus/impact to check upstream blast radius
- if GitNexus misses the symbol, state that and fall back to focused local code search before editing`;

const AUTORUN_STAGE_INSTRUCTIONS = {
	planner: PLAN_STEP_INSTRUCTION,
	executor: EXECUTE_STEP_INSTRUCTION,
	verifier: VERIFY_STEP_INSTRUCTION,
} as const;

function formatUsageDebug(usage: UsageStats | undefined): string {
	if (!usage) return 'none';
	return `in=${usage.inputTokens || 0}, out=${usage.outputTokens || 0}, cacheRead=${usage.cacheReadInputTokens || 0}, context=${usage.contextWindow || 0}, reasoning=${usage.reasoningTokens || 0}, cost=${usage.totalCostUsd || 0}`;
}

function dedupeIsolatedWorktreeTargets(
	targets: Array<BatchRunIsolatedWorktreeTarget | undefined | null>
): BatchRunIsolatedWorktreeTarget[] {
	const seenPaths = new Set<string>();
	const deduped: BatchRunIsolatedWorktreeTarget[] = [];

	for (const target of targets) {
		if (!target?.cwd || seenPaths.has(target.cwd)) {
			continue;
		}
		seenPaths.add(target.cwd);
		deduped.push(target);
	}

	return deduped;
}

function resolveEffectiveTaskTimeoutMs(
	toolType: ToolType,
	configuredTimeoutMs: number | null | undefined
): number {
	if (configuredTimeoutMs === null || configuredTimeoutMs === undefined) {
		return toolType === 'codex' ? DEFAULT_CODEX_TASK_TIMEOUT_MS : DEFAULT_TASK_TIMEOUT_MS;
	}

	if (toolType === 'codex' && configuredTimeoutMs === DEFAULT_TASK_TIMEOUT_MS) {
		return DEFAULT_CODEX_TASK_TIMEOUT_MS;
	}

	return configuredTimeoutMs;
}

function resolveEffectiveStageTimeoutMs(
	toolType: ToolType,
	configuredTimeoutMs: number | null | undefined,
	stage: 'single' | 'planner' | 'executor' | 'verifier',
	agentStrategy: PlaybookAgentStrategy
): number {
	const baseTimeoutMs = resolveEffectiveTaskTimeoutMs(toolType, configuredTimeoutMs);

	if (
		toolType === 'codex' &&
		agentStrategy === 'plan-execute-verify' &&
		(stage === 'planner' || stage === 'executor') &&
		(configuredTimeoutMs === null ||
			configuredTimeoutMs === undefined ||
			configuredTimeoutMs === DEFAULT_TASK_TIMEOUT_MS ||
			configuredTimeoutMs === DEFAULT_CODEX_TASK_TIMEOUT_MS)
	) {
		return DEFAULT_CODEX_HEAVY_STAGE_TIMEOUT_MS;
	}

	return baseTimeoutMs;
}

function validateProjectMemoryStartup(
	session: SessionInfo,
	playbook: {
		projectMemoryExecution?: {
			repoRoot?: string | null;
			taskId?: string | null;
			executorId?: string | null;
		} | null;
	}
): { ok: true } | { ok: false; code: string; reason: string } {
	if (!playbook.projectMemoryExecution) {
		return { ok: true };
	}

	const { taskId, executorId } = playbook.projectMemoryExecution;
	if (!taskId || !executorId) {
		return {
			ok: false,
			code: 'PROJECT_MEMORY_EXECUTION_BLOCKED',
			reason:
				'Project Memory execution metadata is incomplete: taskId and executorId are required.',
		};
	}

	const validationRepoRoot = playbook.projectMemoryExecution.repoRoot || session.cwd;
	const currentBranch = getGitBranch(validationRepoRoot);
	const validation = taskSyncService.validateProjectMemoryExecutionStart({
		...playbook.projectMemoryExecution,
		repoRoot: validationRepoRoot,
		taskId,
		executorId,
		currentBranch: currentBranch ?? null,
	});

	if (!validation.ok) {
		return {
			ok: false,
			code: 'PROJECT_MEMORY_EXECUTION_BLOCKED',
			reason: validation.reason ?? 'Project Memory execution validation blocked playbook start.',
		};
	}

	return { ok: true };
}

/**
 * Get the current git branch for a directory
 */
function getGitBranch(cwd: string): string | undefined {
	try {
		const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
			cwd,
			encoding: 'utf-8',
			stdio: ['pipe', 'pipe', 'pipe'],
		}).trim();
		return branch || undefined;
	} catch {
		return undefined;
	}
}

/**
 * Check if a directory is a git repository
 */
function isGitRepo(cwd: string): boolean {
	try {
		execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
			cwd,
			encoding: 'utf-8',
			stdio: ['pipe', 'pipe', 'pipe'],
		});
		return true;
	} catch {
		return false;
	}
}

/**
 * Process a playbook and yield JSONL events
 */
export async function* runPlaybook(
	session: SessionInfo,
	playbook: Playbook &
		Partial<Pick<BatchRunConfig, 'isolatedWorktreeTarget' | 'isolatedWorktreeTargets'>>,
	folderPath: string,
	options: {
		dryRun?: boolean;
		writeHistory?: boolean;
		debug?: boolean;
		verbose?: boolean;
	} = {}
): AsyncGenerator<JsonlEvent> {
	const { dryRun = false, writeHistory = true, debug = false, verbose = false } = options;
	const batchStartTime = Date.now();
	const dagValidation = validatePlaybookDag(
		playbook.documents,
		playbook.taskGraph,
		playbook.maxParallelism
	);

	if (!dagValidation.valid) {
		throw new Error(`Playbook DAG validation failed: ${dagValidation.errors.join(' ')}`);
	}

	const projectMemoryValidation = validateProjectMemoryStartup(session, playbook);
	if (!projectMemoryValidation.ok) {
		yield {
			type: 'error',
			timestamp: Date.now(),
			message: projectMemoryValidation.reason,
			code: projectMemoryValidation.code,
		};
		return;
	}

	// Get git branch and group name for template variable substitution
	const defaultGitBranch = getGitBranch(session.cwd);
	const defaultIsGit = isGitRepo(session.cwd);
	const groups = readGroups();
	const sessionGroup = groups.find((g) => g.id === session.groupId);
	const groupName = sessionGroup?.name;
	const resolvedSkills = resolvePlaybookSkills(session.projectRoot, playbook.skills ?? []);
	const promptProfile: PlaybookPromptProfile = playbook.promptProfile ?? 'compact-code';
	const documentContextMode: PlaybookDocumentContextMode =
		playbook.documentContextMode ?? 'active-task-only';
	const skillPromptMode: PlaybookSkillPromptMode = playbook.skillPromptMode ?? 'brief';
	const agentStrategy: PlaybookAgentStrategy = playbook.agentStrategy ?? 'single';
	const definitionOfDone = playbook.definitionOfDone ?? [];
	const taskTimeoutMs = resolveEffectiveTaskTimeoutMs(session.toolType, playbook.taskTimeoutMs);
	const skillPromptBlock = buildSkillPromptBlock(resolvedSkills.resolved, skillPromptMode);
	const isolatedWorktreeTargets = dedupeIsolatedWorktreeTargets([
		playbook.isolatedWorktreeTarget,
		...(playbook.isolatedWorktreeTargets ?? []),
	]);

	// Register CLI activity so desktop app knows this session is busy
	registerCliActivity({
		sessionId: session.id,
		playbookId: playbook.id,
		playbookName: playbook.name,
		startedAt: Date.now(),
		pid: process.pid,
	});

	// Emit start event
	yield {
		type: 'start',
		timestamp: Date.now(),
		playbook: { id: playbook.id, name: playbook.name },
		session: { id: session.id, name: session.name, cwd: session.cwd },
	};

	// Update project memory task status to 'running' at execution start
	updateProjectMemoryTaskStatus(playbook, 'running', {
		agentType: session.toolType,
	});

	// AUTORUN LOG: Start
	logger.autorun(`Auto Run started`, session.name, {
		playbook: playbook.name,
		documents: playbook.documents.map((d) => d.filename),
		loopEnabled: playbook.loopEnabled,
		maxLoops: playbook.maxLoops ?? 'unlimited',
	});

	// Emit debug info about playbook configuration
	if (debug) {
		yield {
			type: 'debug',
			timestamp: Date.now(),
			category: 'config',
			message: `Playbook config: loopEnabled=${playbook.loopEnabled}, maxLoops=${playbook.maxLoops ?? 'unlimited'}`,
		};
		yield {
			type: 'debug',
			timestamp: Date.now(),
			category: 'config',
			message: `Documents (${playbook.documents.length}): ${playbook.documents.map((d) => `${d.filename}${d.resetOnCompletion ? ' [RESET]' : ''}`).join(', ')}`,
		};
		yield {
			type: 'debug',
			timestamp: Date.now(),
			category: 'config',
			message: `Folder path: ${folderPath}`,
		};
		if (resolvedSkills.resolved.length > 0) {
			yield {
				type: 'debug',
				timestamp: Date.now(),
				category: 'config',
				message: `Resolved playbook skills: ${resolvedSkills.resolved.map((skill) => skill.name).join(', ')} (mode=${skillPromptMode})`,
			};
		}
		if (resolvedSkills.missing.length > 0) {
			yield {
				type: 'debug',
				timestamp: Date.now(),
				category: 'config',
				message: `Missing playbook skills: ${resolvedSkills.missing.join(', ')}`,
			};
		}
		yield {
			type: 'debug',
			timestamp: Date.now(),
			category: 'config',
			message: `Prompt profile: ${promptProfile}, documentContextMode=${documentContextMode}, skillPromptMode=${skillPromptMode}, agentStrategy=${agentStrategy}`,
		};
	}

	// Calculate initial total tasks
	let initialTotalTasks = 0;
	for (const doc of playbook.documents) {
		const { taskCount } = readDocAndCountTasks(folderPath, doc.filename);
		if (debug) {
			yield {
				type: 'debug',
				timestamp: Date.now(),
				category: 'scan',
				message: `${doc.filename}: ${taskCount} unchecked task${taskCount !== 1 ? 's' : ''}`,
			};
		}
		initialTotalTasks += taskCount;
	}
	if (debug) {
		yield {
			type: 'debug',
			timestamp: Date.now(),
			category: 'scan',
			message: `Total unchecked tasks: ${initialTotalTasks}`,
		};
	}

	if (initialTotalTasks === 0) {
		unregisterCliActivity(session.id);
		yield {
			type: 'error',
			timestamp: Date.now(),
			message: 'No unchecked tasks found in any documents',
			code: 'NO_TASKS',
		};
		return;
	}

	if (dryRun) {
		// Dry run - show detailed breakdown of what would be executed
		let scheduler = createAutoRunSchedulerSnapshot(
			playbook.documents,
			playbook.taskGraph,
			playbook.maxParallelism
		);
		while (scheduler.readyNodeIds.length > 0) {
			const claimResult = claimReadyAutoRunNodes(scheduler, 1);
			scheduler = claimResult.snapshot;
			const claim = claimResult.claims[0];
			if (!claim) {
				break;
			}
			const nodeId = claim.nodeId;
			const node = claim.node;

			const docEntry = playbook.documents[node.documentIndex];
			const { tasks } = readDocAndGetTasks(folderPath, docEntry.filename);

			if (tasks.length === 0) {
				scheduler = finalizeAutoRunSchedulerNode(scheduler, nodeId, 'completed');
				continue;
			}

			yield {
				type: 'document_start',
				timestamp: Date.now(),
				document: docEntry.filename,
				index: node.documentIndex,
				taskCount: tasks.length,
				dryRun: true,
				scheduler,
			};

			for (let taskIndex = 0; taskIndex < tasks.length; taskIndex++) {
				yield {
					type: 'task_preview',
					timestamp: Date.now(),
					document: docEntry.filename,
					taskIndex,
					task: tasks[taskIndex],
				};
			}

			scheduler = finalizeAutoRunSchedulerNode(scheduler, nodeId, 'completed');
			yield {
				type: 'document_complete',
				timestamp: Date.now(),
				document: docEntry.filename,
				tasksCompleted: tasks.length,
				dryRun: true,
				scheduler,
			};
		}

		unregisterCliActivity(session.id);
		yield {
			type: 'complete',
			timestamp: Date.now(),
			success: true,
			totalTasksCompleted: 0,
			totalElapsedMs: 0,
			dryRun: true,
			wouldProcess: initialTotalTasks,
			scheduler,
		};
		return;
	}

	// Track totals
	let totalCompletedTasks = 0;
	let totalCost = 0;
	let loopIteration = 0;

	// Per-loop tracking
	let loopStartTime = Date.now();
	let loopTasksCompleted = 0;
	let loopTotalInputTokens = 0;
	let loopTotalOutputTokens = 0;
	let loopTotalCost = 0;

	// Total tracking across all loops
	let totalInputTokens = 0;
	let totalOutputTokens = 0;
	let sharedCheckoutFallbackCount = 0;
	let finalScheduler = createAutoRunSchedulerSnapshot(
		playbook.documents,
		playbook.taskGraph,
		playbook.maxParallelism
	);

	// Helper to create final loop entry with exit reason
	const createFinalLoopEntry = (exitReason: string): void => {
		// AUTORUN LOG: Exit
		logger.autorun(`Auto Run exiting: ${exitReason}`, session.name, {
			reason: exitReason,
			totalTasksCompleted: totalCompletedTasks,
			loopsCompleted: loopIteration + 1,
		});

		if (!writeHistory) return;
		// Only write if looping was enabled and we did some work
		if (!playbook.loopEnabled && loopIteration === 0) return;
		if (loopTasksCompleted === 0 && loopIteration === 0) return;

		const loopElapsedMs = Date.now() - loopStartTime;
		const observedExecution = summarizeAutoRunObservedExecution(finalScheduler, {
			sharedCheckoutFallbackCount,
		});
		const historyEntry: HistoryEntry = {
			id: generateUUID(),
			...buildAutoRunLoopSummaryEntry({
				timestamp: Date.now(),
				loopIteration,
				loopTasksCompleted,
				loopElapsedMs,
				loopTotalInputTokens,
				loopTotalOutputTokens,
				loopTotalCost,
				projectPath: session.cwd,
				sessionId: session.id,
				isFinal: true,
				exitReason,
				playbookId: playbook.id,
				playbookName: playbook.name,
				promptProfile,
				agentStrategy,
				schedulerMode: observedExecution.observedSchedulerMode,
				configuredSchedulerMode: observedExecution.configuredSchedulerMode,
				actualParallelNodeCount: observedExecution.actualParallelNodeCount,
				sharedCheckoutFallbackCount: observedExecution.sharedCheckoutFallbackCount,
				blockedNodeCount: observedExecution.blockedNodeCount,
				skippedNodeCount: observedExecution.skippedNodeCount,
				schedulerOutcome:
					exitReason === 'All tasks completed' ||
					exitReason === `Reached max loop limit (${playbook.maxLoops})`
						? 'completed'
						: 'failed',
			}),
		};
		addHistoryEntry(historyEntry);
	};

	// Helper to create total Auto Run summary
	const createAutoRunSummary = (): void => {
		if (!writeHistory) return;
		// Only write if we completed multiple loops or if looping was enabled
		if (!playbook.loopEnabled && loopIteration === 0) return;

		const totalElapsedMs = Date.now() - batchStartTime;
		const loopsCompleted = loopIteration + 1;
		const summary = `Auto Run completed: ${totalCompletedTasks} tasks in ${loopsCompleted} loop${loopsCompleted !== 1 ? 's' : ''}`;

		const totalUsageStats = buildAutoRunAggregateUsageStats(
			totalInputTokens,
			totalOutputTokens,
			totalCost
		);

		const observedExecution = summarizeAutoRunObservedExecution(finalScheduler, {
			sharedCheckoutFallbackCount,
		});
		const details = buildAutoRunTotalSummaryDetails({
			totalCompletedTasks,
			totalElapsedMs,
			loopsCompleted,
			totalInputTokens,
			totalOutputTokens,
			totalCost,
			observedSchedulerMode: observedExecution.observedSchedulerMode,
			configuredSchedulerMode: observedExecution.configuredSchedulerMode,
			actualParallelNodeCount: observedExecution.actualParallelNodeCount,
			sharedCheckoutFallbackCount: observedExecution.sharedCheckoutFallbackCount,
			blockedNodeCount: observedExecution.blockedNodeCount,
			skippedNodeCount: observedExecution.skippedNodeCount,
		});

		const historyEntry: HistoryEntry = {
			id: generateUUID(),
			type: 'AUTO',
			timestamp: Date.now(),
			summary,
			fullResponse: details,
			projectPath: session.cwd,
			sessionId: session.id,
			success: true,
			elapsedTimeMs: totalElapsedMs,
			usageStats: totalUsageStats,
			playbookId: playbook.id,
			playbookName: playbook.name,
			promptProfile,
			agentStrategy,
			schedulerMode: observedExecution.observedSchedulerMode,
			configuredSchedulerMode: observedExecution.configuredSchedulerMode,
			actualParallelNodeCount: observedExecution.actualParallelNodeCount,
			sharedCheckoutFallbackCount: observedExecution.sharedCheckoutFallbackCount,
			blockedNodeCount: observedExecution.blockedNodeCount,
			skippedNodeCount: observedExecution.skippedNodeCount,
			schedulerOutcome: finalScheduler.nodes.some(
				(node) => node.state === 'failed' || node.state === 'skipped'
			)
				? 'failed'
				: 'completed',
		};
		addHistoryEntry(historyEntry);
	};

	// Main processing loop with crash handling for project memory status
	let executionError: Error | null = null;
	try {
		while (true) {
			let anyTasksProcessedThisIteration = false;
			let scheduler = createAutoRunSchedulerSnapshot(
				playbook.documents,
				playbook.taskGraph,
				playbook.maxParallelism
			);
			let completedNodeContexts: ReadonlyMap<string, AutoRunCompletedNodeContext> = new Map();
			finalScheduler = scheduler;

			const processDispatchClaim = async (
				claim: ReturnType<typeof claimReadyAutoRunDispatchWork>['claims'][number],
				batchScheduler: typeof scheduler,
				targetCwd: string | undefined,
				initialRemainingTasks: number
			): Promise<AutoRunDispatchExecutionResult<JsonlEvent>> => {
				const nodeId = claim.nodeId;
				const schedulerNode = claim.node;
				const predecessorContext = claim.predecessorContext;
				const docIndex = schedulerNode.documentIndex;
				const docEntry = playbook.documents[docIndex];
				let remainingTasks = initialRemainingTasks;
				let docTasksCompleted = 0;
				let taskIndex = 0;
				const documentTaskSummaries: string[] = [];
				let documentVerifierVerdict: 'PASS' | 'WARN' | 'FAIL' | null = null;
				let documentSucceeded = true;
				let documentTimedOut = false;
				let countedCompletedTasks = 0;
				let anyTasksProcessed = false;
				let inputTokens = 0;
				let outputTokens = 0;
				let documentTotalCost = 0;
				const events: JsonlEvent[] = [];
				const executionCwd = targetCwd ?? session.cwd;

				while (remainingTasks > 0) {
					events.push({
						type: 'task_start',
						timestamp: Date.now(),
						document: docEntry.filename,
						taskIndex,
					});

					const taskStartTime = Date.now();
					const docFilePath = `${folderPath}/${ensureMarkdownFilename(docEntry.filename)}`;
					const templateContext: TemplateContext = {
						session: {
							...session,
							cwd: executionCwd,
							projectRoot: executionCwd,
							isGitRepo: executionCwd === session.cwd ? defaultIsGit : isGitRepo(executionCwd),
						},
						gitBranch: executionCwd === session.cwd ? defaultGitBranch : getGitBranch(executionCwd),
						groupName,
						autoRunFolder: folderPath,
						loopNumber: loopIteration + 1,
						documentName: docEntry.filename,
						documentPath: docFilePath,
					};

					const basePrompt = substituteTemplateVariables(
						getPlaybookPromptForExecution(playbook.prompt, promptProfile),
						templateContext
					);
					const { content: docContent } = readDocAndCountTasks(folderPath, docEntry.filename);
					const expandedDocContent = docContent
						? substituteTemplateVariables(docContent, templateContext)
						: '';
					const promptDocContent =
						documentContextMode === 'full'
							? expandedDocContent
							: buildActiveTaskDocumentContext(expandedDocContent);

					if (expandedDocContent && expandedDocContent !== docContent) {
						writeDoc(folderPath, ensureMarkdownFilename(docEntry.filename), expandedDocContent);
					}

					const documentPromptSection = buildAutoRunDocumentPromptSection(
						docFilePath,
						promptDocContent,
						documentContextMode
					);
					const finalPrompt = buildAutoRunStagePrompt({
						stage: 'executor',
						agentStrategy: 'single',
						instructions: AUTORUN_STAGE_INSTRUCTIONS,
						sharedGuidance: AUTORUN_CONTEXT_AND_IMPACT_INSTRUCTION,
						basePrompt,
						documentPrompt: documentPromptSection,
						skillPromptBlock,
						predecessorContext,
					});
					const estimatedPromptTokens = estimateTokenCount(finalPrompt);
					const promptMetrics = {
						basePromptChars: basePrompt.length,
						skillPromptChars: skillPromptBlock.length,
						documentChars: promptDocContent.length,
						finalPromptChars: finalPrompt.length,
						estimatedPromptTokens,
					};

					if (debug) {
						events.push({
							type: 'debug',
							timestamp: Date.now(),
							category: 'budget',
							message: `Prompt sizing for ${docEntry.filename}#${taskIndex}: base=${promptMetrics.basePromptChars} chars, skills=${promptMetrics.skillPromptChars} chars, document=${promptMetrics.documentChars} chars, final=${promptMetrics.finalPromptChars} chars (~${promptMetrics.estimatedPromptTokens} tokens)`,
						});
					}

					if (verbose) {
						events.push({
							type: 'verbose',
							timestamp: Date.now(),
							category: 'prompt',
							document: docEntry.filename,
							taskIndex,
							prompt: finalPrompt,
							...promptMetrics,
						});
					}

					let result: AgentResult;
					let plannerSummary: string | undefined;
					let plannerSessionId: string | undefined;
					let verifierNote: string | undefined;
					let verifierVerdict: 'PASS' | 'WARN' | 'FAIL' | null = null;
					const usageBreakdown: HistoryUsageBreakdown = {};
					const stopProjectMemoryHeartbeat = startProjectMemoryHeartbeat(playbook);

					try {
						if (agentStrategy === 'plan-execute-verify') {
							const plannerTimeoutMs = resolveEffectiveStageTimeoutMs(
								session.toolType,
								playbook.taskTimeoutMs,
								'planner',
								agentStrategy
							);
							const plannerPrompt = buildAutoRunStagePrompt({
								stage: 'planner',
								agentStrategy,
								instructions: AUTORUN_STAGE_INSTRUCTIONS,
								sharedGuidance: AUTORUN_CONTEXT_AND_IMPACT_INSTRUCTION,
								basePrompt,
								documentPrompt: documentPromptSection,
								skillPromptBlock,
								predecessorContext,
							});
							const plannerResult = await spawnAgent(
								session.toolType,
								executionCwd,
								plannerPrompt,
								undefined,
								{
									timeoutMs: plannerTimeoutMs > 0 ? plannerTimeoutMs : undefined,
								}
							);
							usageBreakdown.planner = plannerResult.usageStats;
							plannerSummary = plannerResult.response?.trim();
							plannerSessionId = plannerResult.agentSessionId;

							if (debug) {
								events.push({
									type: 'debug',
									timestamp: Date.now(),
									category: 'strategy',
									message: `Planner ${plannerResult.success ? 'completed' : 'failed'} for ${docEntry.filename}#${taskIndex}`,
								});
								events.push({
									type: 'debug',
									timestamp: Date.now(),
									category: 'strategy',
									message: `Planner usage for ${docEntry.filename}#${taskIndex}: ${formatUsageDebug(plannerResult.usageStats)}`,
								});
							}

							const executorPrompt = buildAutoRunStagePrompt({
								stage: 'executor',
								agentStrategy,
								instructions: AUTORUN_STAGE_INSTRUCTIONS,
								sharedGuidance: AUTORUN_CONTEXT_AND_IMPACT_INSTRUCTION,
								basePrompt,
								documentPrompt: documentPromptSection,
								skillPromptBlock,
								predecessorContext,
								plannerSummary,
							});
							const executorResumeSessionId =
								session.toolType === 'codex' ? undefined : plannerSessionId;
							const executorTimeoutMs = resolveEffectiveStageTimeoutMs(
								session.toolType,
								playbook.taskTimeoutMs,
								'executor',
								agentStrategy
							);
							result = await spawnAgent(
								session.toolType,
								executionCwd,
								executorPrompt,
								executorResumeSessionId,
								{
									timeoutMs: executorTimeoutMs > 0 ? executorTimeoutMs : undefined,
								}
							);
							usageBreakdown.executor = result.usageStats;
							result.usageStats = mergeUsageStats(plannerResult.usageStats, result.usageStats);

							if (debug) {
								events.push({
									type: 'debug',
									timestamp: Date.now(),
									category: 'strategy',
									message: `Executor usage for ${docEntry.filename}#${taskIndex}: ${formatUsageDebug(usageBreakdown.executor)}`,
								});
							}

							const verifierPrompt = buildAutoRunStagePrompt({
								stage: 'verifier',
								agentStrategy,
								instructions: AUTORUN_STAGE_INSTRUCTIONS,
								sharedGuidance: AUTORUN_CONTEXT_AND_IMPACT_INSTRUCTION,
								basePrompt,
								documentPrompt: documentPromptSection,
								skillPromptBlock,
								predecessorContext,
								plannerSummary,
								executorOutput: result.response?.trim(),
								definitionOfDone,
								verificationSteps: playbook.verificationSteps ?? [],
							});
							const verifierTimeoutMs = resolveEffectiveStageTimeoutMs(
								session.toolType,
								playbook.taskTimeoutMs,
								'verifier',
								agentStrategy
							);
							const verifierResult = await spawnAgent(
								session.toolType,
								executionCwd,
								verifierPrompt,
								undefined,
								{
									timeoutMs: verifierTimeoutMs > 0 ? verifierTimeoutMs : undefined,
								}
							);
							usageBreakdown.verifier = verifierResult.usageStats;
							verifierNote = buildAutoRunVerifierNote(
								verifierResult.response,
								verifierResult.error
							);
							verifierVerdict = getVerifierVerdict(verifierResult.response);
							result = finalizePlanExecuteVerifyResult({
								executorResult: result,
								verifierResult,
								mergedUsageStats: mergeUsageStats(result.usageStats, verifierResult.usageStats),
								verifierVerdict,
								verifierNote,
							});

							if (debug) {
								events.push({
									type: 'debug',
									timestamp: Date.now(),
									category: 'strategy',
									message: `Verifier ${verifierResult.success ? 'completed' : 'failed'} for ${docEntry.filename}#${taskIndex}`,
								});
								events.push({
									type: 'debug',
									timestamp: Date.now(),
									category: 'strategy',
									message: `Verifier usage for ${docEntry.filename}#${taskIndex}: ${formatUsageDebug(verifierResult.usageStats)}`,
								});
							}
						} else {
							const singleStageTimeoutMs = resolveEffectiveStageTimeoutMs(
								session.toolType,
								playbook.taskTimeoutMs,
								'single',
								agentStrategy
							);
							result = await spawnAgent(session.toolType, executionCwd, finalPrompt, undefined, {
								timeoutMs: singleStageTimeoutMs > 0 ? singleStageTimeoutMs : undefined,
							});
							usageBreakdown.executor = result.usageStats;
						}
					} finally {
						stopProjectMemoryHeartbeat();
					}

					const elapsedMs = Date.now() - taskStartTime;
					const previousTaskState = {
						...buildAutoRunDocumentTaskState(expandedDocContent),
						taskCount: remainingTasks,
					};
					const rawNextTaskState = readDocAndCountTasks(folderPath, docEntry.filename);
					const nextTaskState = {
						content: rawNextTaskState.content,
						taskCount: rawNextTaskState.taskCount,
						checkedCount: rawNextTaskState.checkedCount,
					};
					const finalizedTask = finalizeAutoRunTaskExecution({
						documentName: docEntry.filename,
						toolType: session.toolType,
						result,
						previousTaskState,
						nextTaskState,
						usageBreakdown,
						verifierVerdict,
						verifierNote,
					});
					const taskSucceeded = finalizedTask.success;
					documentSucceeded = documentSucceeded && taskSucceeded;
					documentTimedOut = documentTimedOut || Boolean(result.timedOut);
					documentVerifierVerdict = mergeAutoRunVerifierVerdict(
						documentVerifierVerdict,
						verifierVerdict
					);
					if (finalizedTask.shouldPersistTaskState) {
						writeDoc(
							folderPath,
							ensureMarkdownFilename(docEntry.filename),
							finalizedTask.finalTaskState.content
						);
					}

					docTasksCompleted += finalizedTask.countedCompletedTasks;
					countedCompletedTasks += finalizedTask.countedCompletedTasks;
					if (finalizedTask.countedCompletedTasks > 0) {
						anyTasksProcessed = true;
					}

					if (result.usageStats) {
						inputTokens += result.usageStats.inputTokens || 0;
						outputTokens += result.usageStats.outputTokens || 0;
						documentTotalCost += result.usageStats.totalCostUsd || 0;
					}

					if (plannerSummary && verbose) {
						events.push({
							type: 'verbose',
							timestamp: Date.now(),
							category: 'strategy',
							document: docEntry.filename,
							taskIndex,
							prompt: plannerSummary,
						});
					}

					const taskRecord = finalizedTask.taskRecord;
					if (taskRecord.summary) {
						documentTaskSummaries.push(taskRecord.summary);
					}

					if (result.timedOut && debug) {
						events.push({
							type: 'debug',
							timestamp: Date.now(),
							category: 'timeout',
							message: `Task ${docEntry.filename}#${taskIndex} timed out after ${taskTimeoutMs}ms`,
						});
					}

					events.push({
						type: 'task_complete',
						timestamp: Date.now(),
						document: docEntry.filename,
						taskIndex,
						success: taskSucceeded,
						summary: taskRecord.summary,
						fullResponse: taskRecord.fullResponse,
						elapsedMs,
						usageStats: taskRecord.usageStats,
						agentSessionId: result.agentSessionId,
						verifierVerdict: taskRecord.verifierVerdict,
						scheduler: batchScheduler,
					});

					// Update project memory task status based on task result
					if (taskSucceeded) {
						updateProjectMemoryTaskStatus(playbook, 'completed', {
							agentType: session.toolType,
							resultSummary: taskRecord.summary ?? undefined,
						});
					} else if (result.timedOut) {
						updateProjectMemoryTaskStatus(playbook, 'timeout', {
							agentType: session.toolType,
							resultSummary: taskRecord.summary ?? undefined,
							willRetry: false,
						});
					} else {
						updateProjectMemoryTaskStatus(playbook, 'failed', {
							agentType: session.toolType,
							errorMessage: result.error ?? undefined,
							willRetry: false,
						});
					}

					if (writeHistory) {
						const historyEntry: HistoryEntry = {
							id: generateUUID(),
							type: 'AUTO',
							timestamp: Date.now(),
							summary: taskRecord.summary,
							fullResponse: taskRecord.fullResponse,
							agentSessionId: result.agentSessionId,
							projectPath: executionCwd,
							sessionId: session.id,
							success: taskSucceeded,
							usageStats: taskRecord.usageStats,
							contextDisplayUsageStats: taskRecord.contextDisplayUsageStats,
							usageBreakdown: taskRecord.usageBreakdown,
							elapsedTimeMs: elapsedMs,
							verifierVerdict: taskRecord.verifierVerdict,
						};
						addHistoryEntry(historyEntry);
						const skillBusPayload = buildAutoRunSkillBusPayload(historyEntry, 'cli');
						if (skillBusPayload) {
							await recordSkillBusRun(skillBusPayload);
						}
						if (debug) {
							events.push({
								type: 'history_write',
								timestamp: Date.now(),
								entryId: historyEntry.id,
							});
						}
					}

					if (finalizedTask.tasksCompletedThisRun === 0) {
						if (debug) {
							events.push({
								type: 'debug',
								timestamp: Date.now(),
								category: 'task',
								message: `Stopping ${docEntry.filename}: no task state changed for taskIndex=${taskIndex}`,
							});
						}
						break;
					}

					remainingTasks = finalizedTask.finalTaskState.taskCount;
					taskIndex++;
				}

				if (docEntry.resetOnCompletion && docTasksCompleted > 0) {
					logger.autorun(`Resetting document: ${docEntry.filename}`, session.name, {
						document: docEntry.filename,
						tasksCompleted: docTasksCompleted,
						loopNumber: loopIteration + 1,
					});

					const { content: currentContent } = readDocAndCountTasks(folderPath, docEntry.filename);
					const resetContent = uncheckAllTasks(currentContent);
					writeDoc(folderPath, ensureMarkdownFilename(docEntry.filename), resetContent);
					if (debug) {
						const { taskCount: newTaskCount } = readDocAndCountTasks(folderPath, docEntry.filename);
						events.push({
							type: 'debug',
							timestamp: Date.now(),
							category: 'reset',
							message: `Reset ${docEntry.filename}: unchecked all tasks (${newTaskCount} tasks now open)`,
						});
					}
				}

				return {
					finalizeOptions: {
						nodeId,
						documentName: docEntry.filename,
						state: remainingTasks === 0 ? 'completed' : 'failed',
						summaries: documentTaskSummaries,
						success: documentSucceeded && remainingTasks === 0,
						timedOut: documentTimedOut,
						verifierVerdict: documentVerifierVerdict,
					},
					events,
					tasksCompleted: docTasksCompleted,
					inputTokens,
					outputTokens,
					totalCost: documentTotalCost,
					countedCompletedTasks,
					anyTasksProcessed,
				};
			};

			while (scheduler.readyNodeIds.length > 0) {
				const readyNodes = scheduler.readyNodeIds
					.map((nodeId) => scheduler.nodes.find((node) => node.id === nodeId))
					.filter((node): node is AutoRunSchedulerNodeSnapshot => Boolean(node));
				const dispatchPlan = buildParallelDispatchPlan(
					readyNodes,
					Math.max(1, scheduler.maxParallelism || 1),
					isolatedWorktreeTargets,
					session.cwd
				);
				sharedCheckoutFallbackCount += dispatchPlan.warnings.length;
				const claimResult = claimReadyAutoRunDispatchWork(
					{
						scheduler,
						completedNodeContexts,
					},
					{
						maxClaims: dispatchPlan.selectedNodeIds.length,
						selectNodeIds: () => dispatchPlan.selectedNodeIds,
					}
				);
				scheduler = claimResult.scheduler;
				if (claimResult.claims.length === 0) {
					break;
				}
				for (const warning of dispatchPlan.warnings) {
					if (debug) {
						yield {
							type: 'debug',
							timestamp: Date.now(),
							category: 'scheduler',
							message: warning,
						};
					}
				}

				const activeClaims: Array<{
					claim: (typeof claimResult.claims)[number];
					remainingTasks: number;
				}> = [];
				for (const claim of claimResult.claims) {
					const docEntry = playbook.documents[claim.node.documentIndex];
					const { taskCount: remainingTasks } = readDocAndCountTasks(folderPath, docEntry.filename);
					if (remainingTasks === 0) {
						const finalizedDispatch = finalizeAutoRunDispatchNode(
							{
								scheduler,
								completedNodeContexts,
							},
							{
								nodeId: claim.nodeId,
								documentName: docEntry.filename,
								state: 'completed',
								summaries: [`No unchecked tasks remained in ${docEntry.filename}.`],
								success: true,
							}
						);
						scheduler = finalizedDispatch.scheduler;
						completedNodeContexts = finalizedDispatch.completedNodeContexts;
						finalScheduler = scheduler;
						continue;
					}

					yield {
						type: 'document_start',
						timestamp: Date.now(),
						document: docEntry.filename,
						index: claim.node.documentIndex,
						taskCount: remainingTasks,
						scheduler,
					};
					logger.autorun(`Processing document: ${docEntry.filename}`, session.name, {
						document: docEntry.filename,
						tasksRemaining: remainingTasks,
						loopNumber: loopIteration + 1,
					});
					activeClaims.push({ claim, remainingTasks });
				}

				if (activeClaims.length === 0) {
					continue;
				}

				const activeDispatchPlan = buildParallelDispatchPlan(
					activeClaims.map(({ claim }) => claim.node),
					activeClaims.length,
					isolatedWorktreeTargets,
					session.cwd
				);
				const claimExecutions = await executeAutoRunDispatchClaims(
					{
						scheduler: claimResult.scheduler,
						completedNodeContexts: claimResult.completedNodeContexts,
					},
					activeClaims.map(({ claim }) => claim),
					(claim) => {
						const activeClaim = activeClaims.find((entry) => entry.claim.nodeId === claim.nodeId);
						const targetCwd =
							claim.node.isolationMode === 'isolated-worktree'
								? activeDispatchPlan.isolatedTargetsByNodeId[claim.nodeId]?.cwd
								: undefined;
						return processDispatchClaim(
							claim,
							claimResult.scheduler,
							targetCwd,
							activeClaim?.remainingTasks ?? 0
						);
					}
				);

				let eventDispatchState = {
					scheduler,
					completedNodeContexts,
				};
				for (const [index, execution] of claimExecutions.results.entries()) {
					totalCompletedTasks += execution.countedCompletedTasks;
					loopTasksCompleted += execution.countedCompletedTasks;
					anyTasksProcessedThisIteration =
						anyTasksProcessedThisIteration || execution.anyTasksProcessed;
					loopTotalInputTokens += execution.inputTokens;
					loopTotalOutputTokens += execution.outputTokens;
					loopTotalCost += execution.totalCost;
					totalCost += execution.totalCost;
					totalInputTokens += execution.inputTokens;
					totalOutputTokens += execution.outputTokens;

					for (const event of execution.events) {
						yield event;
					}
					eventDispatchState = finalizeAutoRunDispatchNodes(eventDispatchState, [
						execution.finalizeOptions,
					]);
					yield {
						type: 'document_complete',
						timestamp: Date.now(),
						document: activeClaims[index]?.claim.node
							? playbook.documents[activeClaims[index]!.claim.node.documentIndex].filename
							: execution.finalizeOptions.documentName,
						tasksCompleted: execution.tasksCompleted,
						scheduler: eventDispatchState.scheduler,
					};
				}
				scheduler = claimExecutions.state.scheduler;
				completedNodeContexts = claimExecutions.state.completedNodeContexts;
				finalScheduler = scheduler;
			}

			// Check if we should continue looping
			if (!playbook.loopEnabled) {
				if (debug) {
					yield {
						type: 'debug',
						timestamp: Date.now(),
						category: 'loop',
						message: 'Exiting: loopEnabled is false',
					};
				}
				createFinalLoopEntry('Looping disabled');
				break;
			}

			// Check max loop limit
			if (
				playbook.maxLoops !== null &&
				playbook.maxLoops !== undefined &&
				loopIteration + 1 >= playbook.maxLoops
			) {
				if (debug) {
					yield {
						type: 'debug',
						timestamp: Date.now(),
						category: 'loop',
						message: `Exiting: reached max loops (${playbook.maxLoops})`,
					};
				}
				createFinalLoopEntry(`Reached max loop limit (${playbook.maxLoops})`);
				break;
			}

			// Check if any non-reset documents have remaining tasks
			const hasAnyNonResetDocs = playbook.documents.some((doc) => !doc.resetOnCompletion);
			if (debug) {
				const nonResetDocs = playbook.documents
					.filter((d) => !d.resetOnCompletion)
					.map((d) => d.filename);
				const resetDocs = playbook.documents
					.filter((d) => d.resetOnCompletion)
					.map((d) => d.filename);
				yield {
					type: 'debug',
					timestamp: Date.now(),
					category: 'loop',
					message: `Checking loop condition: ${nonResetDocs.length} non-reset docs [${nonResetDocs.join(', ')}], ${resetDocs.length} reset docs [${resetDocs.join(', ')}]`,
				};
			}

			if (hasAnyNonResetDocs) {
				let anyNonResetDocsHaveTasks = false;
				for (const doc of playbook.documents) {
					if (doc.resetOnCompletion) continue;
					const { taskCount } = readDocAndCountTasks(folderPath, doc.filename);
					if (debug) {
						yield {
							type: 'debug',
							timestamp: Date.now(),
							category: 'loop',
							message: `Non-reset doc ${doc.filename}: ${taskCount} unchecked task${taskCount !== 1 ? 's' : ''}`,
						};
					}
					if (taskCount > 0) {
						anyNonResetDocsHaveTasks = true;
						break;
					}
				}
				if (!anyNonResetDocsHaveTasks) {
					if (debug) {
						yield {
							type: 'debug',
							timestamp: Date.now(),
							category: 'loop',
							message: 'Exiting: all non-reset documents have 0 remaining tasks',
						};
					}
					createFinalLoopEntry('All tasks completed');
					break;
				}
			} else {
				// All documents are reset docs - exit after one pass
				if (debug) {
					yield {
						type: 'debug',
						timestamp: Date.now(),
						category: 'loop',
						message:
							'Exiting: ALL documents have resetOnCompletion=true (loop requires at least one non-reset doc to drive iterations)',
					};
				}
				createFinalLoopEntry('All documents have reset-on-completion');
				break;
			}

			// Safety check
			if (!anyTasksProcessedThisIteration) {
				if (debug) {
					yield {
						type: 'debug',
						timestamp: Date.now(),
						category: 'loop',
						message: 'Exiting: no tasks were processed this iteration (safety check)',
					};
				}
				createFinalLoopEntry('No tasks processed this iteration');
				break;
			}

			if (debug) {
				yield {
					type: 'debug',
					timestamp: Date.now(),
					category: 'loop',
					message: `Continuing to next loop iteration (current: ${loopIteration + 1})`,
				};
			}

			// Emit loop complete event
			const loopElapsedMs = Date.now() - loopStartTime;
			const loopUsageStats: UsageStats | undefined =
				loopTotalInputTokens > 0 || loopTotalOutputTokens > 0
					? {
							inputTokens: loopTotalInputTokens,
							outputTokens: loopTotalOutputTokens,
							cacheReadInputTokens: 0,
							cacheCreationInputTokens: 0,
							totalCostUsd: loopTotalCost,
							contextWindow: 0, // Set to 0 for summaries - these are cumulative totals, not per-task context
						}
					: undefined;

			yield {
				type: 'loop_complete',
				timestamp: Date.now(),
				iteration: loopIteration + 1,
				tasksCompleted: loopTasksCompleted,
				elapsedMs: loopElapsedMs,
				usageStats: loopUsageStats,
				scheduler,
			};

			// AUTORUN LOG: Loop completion
			logger.autorun(`Loop ${loopIteration + 1} completed`, session.name, {
				loopNumber: loopIteration + 1,
				tasksCompleted: loopTasksCompleted,
			});

			// Add loop summary history entry
			if (writeHistory) {
				const observedExecution = summarizeAutoRunObservedExecution(scheduler, {
					sharedCheckoutFallbackCount,
				});
				const historyEntry: HistoryEntry = {
					id: generateUUID(),
					...buildAutoRunLoopSummaryEntry({
						timestamp: Date.now(),
						loopIteration,
						loopTasksCompleted,
						loopElapsedMs,
						loopTotalInputTokens,
						loopTotalOutputTokens,
						loopTotalCost,
						projectPath: session.cwd,
						sessionId: session.id,
						isFinal: false,
						playbookId: playbook.id,
						playbookName: playbook.name,
						promptProfile,
						agentStrategy,
						schedulerMode: observedExecution.observedSchedulerMode,
						configuredSchedulerMode: observedExecution.configuredSchedulerMode,
						actualParallelNodeCount: observedExecution.actualParallelNodeCount,
						sharedCheckoutFallbackCount: observedExecution.sharedCheckoutFallbackCount,
						blockedNodeCount: observedExecution.blockedNodeCount,
						skippedNodeCount: observedExecution.skippedNodeCount,
						schedulerOutcome: 'completed',
					}),
				};
				addHistoryEntry(historyEntry);
			}

			// Reset per-loop tracking
			loopStartTime = Date.now();
			loopTasksCompleted = 0;
			loopTotalInputTokens = 0;
			loopTotalOutputTokens = 0;
			loopTotalCost = 0;

			loopIteration++;
		}
	} catch (error) {
		executionError = error instanceof Error ? error : new Error(String(error));
		// Update project memory task status on crash
		updateProjectMemoryTaskStatus(playbook, 'failed', {
			agentType: session.toolType,
			errorMessage: executionError.message,
			errorStack: executionError.stack,
		});
		// Emit error event before re-throwing
		yield {
			type: 'error',
			timestamp: Date.now(),
			message: executionError.message,
			code: 'EXECUTOR_CRASH',
		};
		throw executionError;
	} finally {
		// Unregister CLI activity - session is no longer busy
		unregisterCliActivity(session.id);
	}

	// Add total Auto Run summary (only if looping was used)
	createAutoRunSummary();

	// Emit complete event (only reached if no error)
	yield {
		type: 'complete',
		timestamp: Date.now(),
		success: true,
		totalTasksCompleted: totalCompletedTasks,
		totalElapsedMs: Date.now() - batchStartTime,
		totalCost,
		scheduler: finalScheduler,
	};
}

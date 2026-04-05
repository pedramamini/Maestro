import type {
	HistoryEntry,
	HistoryUsageBreakdown,
	PlaybookAgentStrategy,
	PlaybookDocumentContextMode,
	PlaybookPromptProfile,
	AutoRunSchedulerMode,
	AutoRunSchedulerOutcome,
	AutoRunWorktreeMode,
	ToolType,
	UsageStats,
} from './types';
import { formatElapsedTime } from './formatters';
import { revertNewlyCheckedTasks } from './markdownTaskUtils';
import { parseSynopsis } from './synopsis';

export type AutoRunStage = 'single' | 'planner' | 'executor' | 'verifier';
export type AutoRunInstructionStage = Exclude<AutoRunStage, 'single'>;

const UNCHECKED_TASK_REGEX = /^[\s]*[-*]\s*\[\s*\]\s*.+$/gm;
const CHECKED_TASK_REGEX = /^[\s]*[-*]\s*\[[xX✓✔]\]\s*.+$/gm;

export interface AutoRunPromptInstructions {
	planner: string;
	executor: string;
	verifier: string;
}

export interface AutoRunDocumentTaskState {
	content: string;
	taskCount: number;
	checkedCount: number;
}

export interface AutoRunTaskProgressState {
	content: string;
	taskCount: number;
	checkedCount?: number;
}

export interface BuildAutoRunStagePromptOptions {
	stage: AutoRunStage;
	agentStrategy: PlaybookAgentStrategy;
	instructions: AutoRunPromptInstructions;
	sharedGuidance?: string;
	basePrompt: string;
	documentPrompt: string;
	skillPromptBlock?: string;
	predecessorContext?: string;
	plannerSummary?: string;
	executorOutput?: string;
	definitionOfDone?: string[];
	verificationSteps?: string[];
}

export interface FinalizeAutoRunTaskPresentationOptions {
	toolType: ToolType;
	usageBreakdown?: HistoryUsageBreakdown;
	usageStats?: UsageStats;
	shortSummary: string;
	fullSynopsis: string;
	verifierVerdict?: 'PASS' | 'WARN' | 'FAIL' | null;
	verifierNote?: string;
}

export interface ComputeAutoRunTaskProgressOptions {
	previousRemainingTasks: number;
	newRemainingTasks: number;
	taskSucceeded: boolean;
	previousCheckedCount?: number;
	newCheckedCount?: number;
}

export interface BuildAutoRunTaskRecordOptions {
	usageStats?: UsageStats;
	contextDisplayUsageStats?: UsageStats;
	usageBreakdown?: HistoryUsageBreakdown;
	shortSummary: string;
	fullSynopsis: string;
	verifierVerdict?: 'PASS' | 'WARN' | 'FAIL' | null;
}

export interface AutoRunStageExecutionResult {
	success: boolean;
	response?: string;
	error?: string;
	usageStats?: UsageStats;
	agentSessionId?: string;
}

export interface BuildAutoRunLoopSummaryEntryOptions {
	timestamp: number;
	loopIteration: number;
	loopTasksCompleted: number;
	loopElapsedMs: number;
	loopTotalInputTokens: number;
	loopTotalOutputTokens: number;
	loopTotalCost: number;
	projectPath: string;
	sessionId: string;
	isFinal: boolean;
	exitReason?: string;
	tasksDiscoveredForNextLoop?: number;
	playbookId?: string;
	playbookName?: string;
	promptProfile?: PlaybookPromptProfile;
	agentStrategy?: PlaybookAgentStrategy;
	worktreeMode?: AutoRunWorktreeMode;
	schedulerMode?: AutoRunSchedulerMode;
	configuredSchedulerMode?: AutoRunSchedulerMode;
	actualParallelNodeCount?: number;
	sharedCheckoutFallbackCount?: number;
	blockedNodeCount?: number;
	skippedNodeCount?: number;
	schedulerOutcome?: AutoRunSchedulerOutcome;
}

export interface BuildAutoRunTotalSummaryDetailsOptions {
	totalCompletedTasks: number;
	totalElapsedMs: number;
	loopsCompleted?: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	totalCost: number;
	statusMessage?: string;
	documentsLine?: string;
	configuredSchedulerMode?: AutoRunSchedulerMode;
	observedSchedulerMode?: AutoRunSchedulerMode;
	actualParallelNodeCount?: number;
	sharedCheckoutFallbackCount?: number;
	blockedNodeCount?: number;
	skippedNodeCount?: number;
	extraSections?: string[];
}

export interface FinalizePlanExecuteVerifyResultOptions {
	executorResult: AutoRunStageExecutionResult;
	verifierResult: AutoRunStageExecutionResult;
	mergedUsageStats: UsageStats | undefined;
	verifierVerdict: 'PASS' | 'WARN' | 'FAIL' | null;
	verifierNote?: string;
	failFallbackMessage?: string;
}

export interface FinalizeAutoRunTaskExecutionOptions {
	documentName: string;
	toolType: ToolType;
	result: AutoRunStageExecutionResult & { timedOut?: boolean };
	previousTaskState: AutoRunTaskProgressState;
	nextTaskState: AutoRunTaskProgressState;
	usageBreakdown?: HistoryUsageBreakdown;
	verifierVerdict?: 'PASS' | 'WARN' | 'FAIL' | null;
	verifierNote?: string;
}

export interface AutoRunCompletedNodeContext {
	documentName: string;
	summaries: string[];
	success: boolean;
	timedOut?: boolean;
	verifierVerdict?: 'PASS' | 'WARN' | 'FAIL' | null;
}

export interface FinalizedAutoRunTaskExecution {
	success: boolean;
	completedAfterTimeout: boolean;
	shouldPersistTaskState: boolean;
	finalTaskState: AutoRunDocumentTaskState;
	tasksCompletedThisRun: number;
	countedCompletedTasks: number;
	addedUncheckedTasks?: number;
	totalTasksChange?: number;
	shortSummary: string;
	fullSynopsis: string;
	contextDisplayUsageStats?: UsageStats;
	taskRecord: ReturnType<typeof buildAutoRunTaskRecord>;
}

export function calculateUsageContextTokens(stats: UsageStats, toolType: ToolType): number {
	if (toolType === 'codex' || toolType === 'zai') {
		return (
			(stats.inputTokens || 0) + (stats.outputTokens || 0) + (stats.cacheCreationInputTokens || 0)
		);
	}

	return (
		(stats.inputTokens || 0) +
		(stats.cacheReadInputTokens || 0) +
		(stats.cacheCreationInputTokens || 0)
	);
}

export function countAutoRunUncheckedTasks(content: string): number {
	const matches = content.match(UNCHECKED_TASK_REGEX);
	return matches ? matches.length : 0;
}

export function countAutoRunCheckedTasks(content: string): number {
	const matches = content.match(CHECKED_TASK_REGEX);
	return matches ? matches.length : 0;
}

export function buildAutoRunDocumentTaskState(content: string): AutoRunDocumentTaskState {
	return {
		content,
		taskCount: countAutoRunUncheckedTasks(content),
		checkedCount: countAutoRunCheckedTasks(content),
	};
}

export function pickContextDisplayUsageStats(
	toolType: ToolType,
	usageBreakdown: HistoryUsageBreakdown | undefined,
	fallback: UsageStats | undefined
): UsageStats | undefined {
	const candidates = [
		usageBreakdown?.planner,
		usageBreakdown?.executor,
		usageBreakdown?.verifier,
		usageBreakdown?.synopsis,
	].filter((stats): stats is UsageStats => Boolean(stats));

	if (candidates.length === 0) {
		return fallback;
	}

	return candidates.reduce((peak, current) =>
		calculateUsageContextTokens(current, toolType) > calculateUsageContextTokens(peak, toolType)
			? current
			: peak
	);
}

export function mergeUsageStats(
	current: UsageStats | undefined,
	next: UsageStats | undefined
): UsageStats | undefined {
	if (!next) return current;
	if (!current) return next;

	const merged: UsageStats = {
		...next,
		inputTokens: current.inputTokens + next.inputTokens,
		outputTokens: current.outputTokens + next.outputTokens,
		cacheReadInputTokens: current.cacheReadInputTokens + next.cacheReadInputTokens,
		cacheCreationInputTokens: current.cacheCreationInputTokens + next.cacheCreationInputTokens,
		totalCostUsd: current.totalCostUsd + next.totalCostUsd,
		contextWindow: Math.max(current.contextWindow, next.contextWindow),
		reasoningTokens:
			current.reasoningTokens || next.reasoningTokens
				? (current.reasoningTokens || 0) + (next.reasoningTokens || 0)
				: undefined,
	};

	if (!merged.reasoningTokens) {
		delete merged.reasoningTokens;
	}

	return merged;
}

export function buildDefinitionOfDoneSection(definitionOfDone: string[] = []): string {
	if (definitionOfDone.length === 0) {
		return '';
	}

	return `## Definition of Done\n${definitionOfDone.map((item) => `- ${item}`).join('\n')}`;
}

export function buildVerificationStepsSection(verificationSteps: string[] = []): string {
	if (verificationSteps.length === 0) {
		return '';
	}

	return `## Verification Steps\n${verificationSteps.map((item) => `- ${item}`).join('\n')}`;
}

export function getVerifierVerdict(response?: string): 'PASS' | 'WARN' | 'FAIL' | null {
	const firstNonEmptyLine = response
		?.split(/\r?\n/)
		.map((line) => line.trim())
		.find(Boolean)
		?.toUpperCase();

	if (
		firstNonEmptyLine === 'PASS' ||
		firstNonEmptyLine === 'WARN' ||
		firstNonEmptyLine === 'FAIL'
	) {
		return firstNonEmptyLine;
	}

	return null;
}

export function buildAutoRunVerifierNote(response?: string, error?: string): string | undefined {
	const text = response?.trim() || error?.trim();
	return text || undefined;
}

export function applyVerifierVerdictToSummary(
	summary: string,
	verdict: 'PASS' | 'WARN' | 'FAIL' | null
): string {
	if (!summary || !verdict || verdict === 'PASS') {
		return summary;
	}

	return `[${verdict}] ${summary}`;
}

export function mergeAutoRunVerifierVerdict(
	current: 'PASS' | 'WARN' | 'FAIL' | null | undefined,
	next: 'PASS' | 'WARN' | 'FAIL' | null | undefined
): 'PASS' | 'WARN' | 'FAIL' | null {
	if (current === 'FAIL' || next === 'FAIL') {
		return 'FAIL';
	}
	if (current === 'WARN' || next === 'WARN') {
		return 'WARN';
	}
	if (current === 'PASS' || next === 'PASS') {
		return 'PASS';
	}
	return null;
}

export function buildAutoRunPredecessorContext(
	predecessorNodeIds: string[],
	nodeContexts: ReadonlyMap<string, AutoRunCompletedNodeContext>
): string {
	if (predecessorNodeIds.length === 0) {
		return '';
	}

	const lines: string[] = [
		predecessorNodeIds.length > 1 ? '## Predecessor Outputs' : '## Predecessor Output',
	];

	for (const predecessorNodeId of predecessorNodeIds) {
		const nodeContext = nodeContexts.get(predecessorNodeId);
		if (!nodeContext) {
			lines.push(`### ${predecessorNodeId} [MISSING]`);
			lines.push('- No recorded predecessor output was available.');
			continue;
		}

		const status = nodeContext.timedOut
			? 'TIMED_OUT'
			: !nodeContext.success || nodeContext.verifierVerdict === 'FAIL'
				? 'FAILED'
				: nodeContext.verifierVerdict === 'WARN'
					? 'WARN'
					: 'PASS';
		lines.push(`### ${nodeContext.documentName} [${status}]`);

		const summaries = [
			...new Set(nodeContext.summaries.map((summary) => summary.trim()).filter(Boolean)),
		];
		if (summaries.length === 0) {
			lines.push('- No task summary recorded.');
			continue;
		}

		for (const summary of summaries) {
			lines.push(`- ${summary}`);
		}
	}

	return lines.join('\n');
}

export function shouldIncludeSharedSkillGuidance(
	stage: AutoRunStage,
	agentStrategy: PlaybookAgentStrategy
): boolean {
	return agentStrategy === 'single' || stage === 'planner';
}

export function buildAutoRunDocumentPromptSection(
	docFilePath: string,
	content: string,
	mode: PlaybookDocumentContextMode = 'active-task-only'
): string {
	const modeNote =
		mode === 'full'
			? 'The full document is inlined below.'
			: 'Only the active unchecked task and minimal nearby context are inlined below; open the document on disk if you need anything else.';

	return `---\n\n# Current Document: ${docFilePath}\n\nProcess tasks from this document and save changes back to the file above.\n${modeNote}\n\n${content}`;
}

export function buildAutoRunStagePrompt({
	stage,
	agentStrategy,
	instructions,
	sharedGuidance,
	basePrompt,
	documentPrompt,
	skillPromptBlock = '',
	predecessorContext,
	plannerSummary,
	executorOutput,
	definitionOfDone = [],
	verificationSteps = [],
}: BuildAutoRunStagePromptOptions): string {
	const sections: string[] = [];
	const includeSharedSkillGuidance = shouldIncludeSharedSkillGuidance(stage, agentStrategy);

	if (stage === 'planner') {
		sections.push(instructions.planner);
	} else if (stage === 'executor') {
		sections.push(instructions.executor);
		if (plannerSummary) {
			sections.push(`## Planner Output\n${plannerSummary}`);
		}
	} else if (stage === 'verifier') {
		sections.push(instructions.verifier);
		if (verificationSteps.length > 0) {
			sections.push(buildVerificationStepsSection(verificationSteps));
		}
		if (definitionOfDone.length > 0) {
			sections.push(buildDefinitionOfDoneSection(definitionOfDone));
		}
		if (executorOutput) {
			sections.push(`## Executor Output\n${executorOutput}`);
		}
	}

	if (includeSharedSkillGuidance && sharedGuidance) {
		sections.push(sharedGuidance);
	}
	sections.push(basePrompt);
	if (includeSharedSkillGuidance && skillPromptBlock) {
		sections.push(skillPromptBlock);
	}
	if (predecessorContext) {
		sections.push(predecessorContext);
	}
	sections.push(documentPrompt);

	return sections.filter(Boolean).join('\n\n');
}

export function finalizeAutoRunTaskPresentation({
	toolType,
	usageBreakdown,
	usageStats,
	shortSummary,
	fullSynopsis,
	verifierVerdict = null,
	verifierNote,
}: FinalizeAutoRunTaskPresentationOptions): {
	shortSummary: string;
	fullSynopsis: string;
	contextDisplayUsageStats: UsageStats | undefined;
} {
	const verifierSection = verifierNote ? `Verifier:\n${verifierNote}` : '';
	const finalFullSynopsis =
		verifierSection && !fullSynopsis.includes(verifierSection)
			? `${fullSynopsis}\n\n${verifierSection}`
			: fullSynopsis;

	return {
		shortSummary: applyVerifierVerdictToSummary(shortSummary, verifierVerdict),
		fullSynopsis: finalFullSynopsis,
		contextDisplayUsageStats: pickContextDisplayUsageStats(toolType, usageBreakdown, usageStats),
	};
}

function extractAutoRunShortSummary(responseText: string, fallback: string): string {
	const parsed = parseSynopsis(responseText);
	if (parsed.nothingToReport) {
		return fallback;
	}

	if (parsed.shortSummary.trim()) {
		return parsed.shortSummary.trim();
	}

	const firstParagraph = responseText.split(/\n\n+/)[0]?.trim() || '';
	const cleanFirstParagraph = firstParagraph
		.replace(/^\*\*Summary:\*\*\s*/i, '')
		.replace(/^#+\s*/, '')
		.replace(/\*\*/g, '')
		.replace(/\s+/g, ' ')
		.trim();

	if (!cleanFirstParagraph) {
		return fallback;
	}

	const firstSentenceMatch = cleanFirstParagraph.match(/^.+?[.!?](?=\s+[A-Z]|\s*$)/);
	return firstSentenceMatch
		? firstSentenceMatch[0].trim()
		: cleanFirstParagraph.length > 150
			? `${cleanFirstParagraph.substring(0, 150)}...`
			: cleanFirstParagraph;
}

function buildAutoRunTaskSynopsis(
	documentName: string,
	result: AutoRunStageExecutionResult & { timedOut?: boolean },
	success: boolean,
	completedAfterTimeout: boolean
): {
	shortSummary: string;
	fullSynopsis: string;
} {
	const completedSummary = `[${documentName}] Task completed`;
	const failedSummary = `[${documentName}] Task failed`;

	if (completedAfterTimeout) {
		const shortSummary = `[${documentName}] Task completed before timeout`;
		return {
			shortSummary,
			fullSynopsis: result.response || result.error || shortSummary,
		};
	}

	if (success) {
		const responseText = result.response?.trim();
		if (!responseText) {
			return { shortSummary: completedSummary, fullSynopsis: completedSummary };
		}

		return {
			shortSummary: extractAutoRunShortSummary(responseText, completedSummary),
			fullSynopsis: responseText,
		};
	}

	return {
		shortSummary: failedSummary,
		fullSynopsis:
			result.error && result.response?.trim() && !result.response.includes(result.error)
				? `${result.error}\n\n${result.response.trim()}`
				: result.response || result.error || failedSummary,
	};
}

export function computeAutoRunTaskProgress({
	previousRemainingTasks,
	newRemainingTasks,
	taskSucceeded,
	previousCheckedCount,
	newCheckedCount,
}: ComputeAutoRunTaskProgressOptions): {
	tasksCompletedThisRun: number;
	countedCompletedTasks: number;
	addedUncheckedTasks?: number;
	totalTasksChange?: number;
} {
	const hasCheckedCounts = previousCheckedCount !== undefined && newCheckedCount !== undefined;
	const remainingTasksCompleted = Math.max(0, previousRemainingTasks - newRemainingTasks);
	const checkedTasksCompleted = hasCheckedCounts
		? Math.max(0, newCheckedCount - previousCheckedCount)
		: 0;

	const tasksCompletedThisRun = hasCheckedCounts
		? Math.max(remainingTasksCompleted, checkedTasksCompleted)
		: remainingTasksCompleted;

	return {
		tasksCompletedThisRun,
		countedCompletedTasks: taskSucceeded ? tasksCompletedThisRun : 0,
		addedUncheckedTasks: hasCheckedCounts
			? Math.max(0, newRemainingTasks - previousRemainingTasks)
			: undefined,
		totalTasksChange: hasCheckedCounts
			? newRemainingTasks + newCheckedCount - (previousRemainingTasks + previousCheckedCount)
			: undefined,
	};
}

export function buildAutoRunTaskRecord({
	usageStats,
	contextDisplayUsageStats,
	usageBreakdown,
	shortSummary,
	fullSynopsis,
	verifierVerdict = null,
}: BuildAutoRunTaskRecordOptions): {
	usageStats?: UsageStats;
	contextDisplayUsageStats?: UsageStats;
	usageBreakdown?: HistoryUsageBreakdown;
	summary: string;
	fullResponse: string;
	verifierVerdict?: 'PASS' | 'WARN' | 'FAIL';
} {
	return {
		usageStats,
		contextDisplayUsageStats,
		usageBreakdown,
		summary: shortSummary,
		fullResponse: fullSynopsis,
		verifierVerdict: verifierVerdict ?? undefined,
	};
}

export function finalizeAutoRunTaskExecution({
	documentName,
	toolType,
	result,
	previousTaskState,
	nextTaskState,
	usageBreakdown,
	verifierVerdict = null,
	verifierNote,
}: FinalizeAutoRunTaskExecutionOptions): FinalizedAutoRunTaskExecution {
	const normalizedNextTaskState: AutoRunDocumentTaskState =
		nextTaskState.checkedCount !== undefined
			? {
					content: nextTaskState.content,
					taskCount: nextTaskState.taskCount,
					checkedCount: nextTaskState.checkedCount,
				}
			: buildAutoRunDocumentTaskState(nextTaskState.content);
	const initialProgress = computeAutoRunTaskProgress({
		previousRemainingTasks: previousTaskState.taskCount,
		newRemainingTasks: normalizedNextTaskState.taskCount,
		taskSucceeded: result.success,
		previousCheckedCount: previousTaskState.checkedCount,
		newCheckedCount: normalizedNextTaskState.checkedCount,
	});
	const completedAfterTimeout = Boolean(
		result.timedOut && initialProgress.tasksCompletedThisRun > 0
	);
	const success = result.success || completedAfterTimeout;

	let finalTaskState = normalizedNextTaskState;
	if (!success && initialProgress.tasksCompletedThisRun > 0) {
		const revertedContent = revertNewlyCheckedTasks(
			previousTaskState.content,
			normalizedNextTaskState.content
		);
		if (revertedContent !== normalizedNextTaskState.content) {
			finalTaskState = buildAutoRunDocumentTaskState(revertedContent);
		}
	}

	const finalProgress = computeAutoRunTaskProgress({
		previousRemainingTasks: previousTaskState.taskCount,
		newRemainingTasks: finalTaskState.taskCount,
		taskSucceeded: success,
		previousCheckedCount: previousTaskState.checkedCount,
		newCheckedCount: finalTaskState.checkedCount,
	});
	let { shortSummary, fullSynopsis } = buildAutoRunTaskSynopsis(
		documentName,
		result,
		success,
		completedAfterTimeout
	);
	const finalizedPresentation = finalizeAutoRunTaskPresentation({
		toolType,
		usageBreakdown,
		usageStats: result.usageStats,
		shortSummary,
		fullSynopsis,
		verifierVerdict,
		verifierNote,
	});
	shortSummary = finalizedPresentation.shortSummary;
	fullSynopsis = finalizedPresentation.fullSynopsis;
	const taskRecord = buildAutoRunTaskRecord({
		usageStats: result.usageStats,
		contextDisplayUsageStats: finalizedPresentation.contextDisplayUsageStats,
		usageBreakdown,
		shortSummary,
		fullSynopsis,
		verifierVerdict,
	});

	return {
		success,
		completedAfterTimeout,
		shouldPersistTaskState: finalTaskState.content !== nextTaskState.content,
		finalTaskState,
		tasksCompletedThisRun: finalProgress.tasksCompletedThisRun,
		countedCompletedTasks: finalProgress.countedCompletedTasks,
		addedUncheckedTasks: finalProgress.addedUncheckedTasks,
		totalTasksChange: finalProgress.totalTasksChange,
		shortSummary,
		fullSynopsis,
		contextDisplayUsageStats: finalizedPresentation.contextDisplayUsageStats,
		taskRecord,
	};
}

export function buildAutoRunAggregateUsageStats(
	inputTokens: number,
	outputTokens: number,
	totalCostUsd: number
): UsageStats | undefined {
	return inputTokens > 0 || outputTokens > 0
		? {
				inputTokens,
				outputTokens,
				cacheReadInputTokens: 0,
				cacheCreationInputTokens: 0,
				totalCostUsd,
				contextWindow: 0,
			}
		: undefined;
}

function formatAutoRunSchedulerModeLabel(
	schedulerMode: AutoRunSchedulerMode | undefined
): string | null {
	switch (schedulerMode) {
		case 'dag':
			return 'DAG';
		case 'sequential':
			return 'Sequential';
		default:
			return null;
	}
}

export function buildAutoRunLoopSummaryEntry({
	timestamp,
	loopIteration,
	loopTasksCompleted,
	loopElapsedMs,
	loopTotalInputTokens,
	loopTotalOutputTokens,
	loopTotalCost,
	projectPath,
	sessionId,
	isFinal,
	exitReason,
	tasksDiscoveredForNextLoop,
	playbookId,
	playbookName,
	promptProfile,
	agentStrategy,
	worktreeMode,
	schedulerMode,
	configuredSchedulerMode,
	actualParallelNodeCount,
	sharedCheckoutFallbackCount,
	blockedNodeCount,
	skippedNodeCount,
	schedulerOutcome,
}: BuildAutoRunLoopSummaryEntryOptions): Omit<HistoryEntry, 'id'> {
	const loopNumber = loopIteration + 1;
	const summaryPrefix = isFinal ? `Loop ${loopNumber} (final)` : `Loop ${loopNumber}`;
	const summary = `${summaryPrefix} completed: ${loopTasksCompleted} task${loopTasksCompleted !== 1 ? 's' : ''} accomplished`;
	const observedSchedulerLabel = formatAutoRunSchedulerModeLabel(schedulerMode);
	const configuredSchedulerLabel = formatAutoRunSchedulerModeLabel(configuredSchedulerMode);
	const details = [
		`**${summaryPrefix} Summary**`,
		'',
		`- **Tasks Accomplished:** ${loopTasksCompleted}`,
		`- **Duration:** ${formatElapsedTime(loopElapsedMs)}`,
		observedSchedulerLabel ? `- **Observed Scheduler:** ${observedSchedulerLabel}` : '',
		configuredSchedulerLabel ? `- **Scheduler Intent:** ${configuredSchedulerLabel}` : '',
		loopTotalInputTokens > 0 || loopTotalOutputTokens > 0
			? `- **Tokens:** ${(loopTotalInputTokens + loopTotalOutputTokens).toLocaleString()} (${loopTotalInputTokens.toLocaleString()} in / ${loopTotalOutputTokens.toLocaleString()} out)`
			: '',
		loopTotalCost > 0 ? `- **Cost:** $${loopTotalCost.toFixed(4)}` : '',
		typeof tasksDiscoveredForNextLoop === 'number'
			? `- **Tasks Discovered for Next Loop:** ${tasksDiscoveredForNextLoop}`
			: '',
		exitReason ? `- **Exit Reason:** ${exitReason}` : '',
		typeof actualParallelNodeCount === 'number'
			? `- **Peak Parallel Nodes:** ${actualParallelNodeCount}`
			: '',
		sharedCheckoutFallbackCount
			? `- **Shared Checkout Fallbacks:** ${sharedCheckoutFallbackCount}`
			: '',
		blockedNodeCount ? `- **Blocked Nodes Remaining:** ${blockedNodeCount}` : '',
		skippedNodeCount ? `- **Skipped Nodes:** ${skippedNodeCount}` : '',
	]
		.filter((line) => line !== '')
		.join('\n');

	return {
		type: 'AUTO',
		timestamp,
		summary,
		fullResponse: details,
		projectPath,
		sessionId,
		success: true,
		elapsedTimeMs: loopElapsedMs,
		usageStats: buildAutoRunAggregateUsageStats(
			loopTotalInputTokens,
			loopTotalOutputTokens,
			loopTotalCost
		),
		playbookId,
		playbookName,
		promptProfile,
		agentStrategy,
		worktreeMode,
		schedulerMode,
		configuredSchedulerMode,
		actualParallelNodeCount,
		sharedCheckoutFallbackCount,
		blockedNodeCount,
		skippedNodeCount,
		schedulerOutcome,
	};
}

export function buildAutoRunTotalSummaryDetails({
	totalCompletedTasks,
	totalElapsedMs,
	loopsCompleted,
	totalInputTokens,
	totalOutputTokens,
	totalCost,
	statusMessage,
	documentsLine,
	configuredSchedulerMode,
	observedSchedulerMode,
	actualParallelNodeCount,
	sharedCheckoutFallbackCount,
	blockedNodeCount,
	skippedNodeCount,
	extraSections = [],
}: BuildAutoRunTotalSummaryDetailsOptions): string {
	const observedSchedulerLabel = formatAutoRunSchedulerModeLabel(observedSchedulerMode);
	const configuredSchedulerLabel = formatAutoRunSchedulerModeLabel(configuredSchedulerMode);
	return [
		`**Auto Run Summary**`,
		'',
		statusMessage ? `- **Status:** ${statusMessage}` : '',
		`- **Total Tasks Completed:** ${totalCompletedTasks}`,
		typeof loopsCompleted === 'number' ? `- **Loops Completed:** ${loopsCompleted}` : '',
		`- **Total Duration:** ${formatElapsedTime(totalElapsedMs)}`,
		observedSchedulerLabel ? `- **Observed Scheduler:** ${observedSchedulerLabel}` : '',
		configuredSchedulerLabel ? `- **Scheduler Intent:** ${configuredSchedulerLabel}` : '',
		totalInputTokens > 0 || totalOutputTokens > 0
			? `- **Total Tokens:** ${(totalInputTokens + totalOutputTokens).toLocaleString()} (${totalInputTokens.toLocaleString()} in / ${totalOutputTokens.toLocaleString()} out)`
			: '',
		totalCost > 0 ? `- **Total Cost:** $${totalCost.toFixed(4)}` : '',
		typeof actualParallelNodeCount === 'number'
			? `- **Peak Parallel Nodes:** ${actualParallelNodeCount}`
			: '',
		sharedCheckoutFallbackCount
			? `- **Shared Checkout Fallbacks:** ${sharedCheckoutFallbackCount}`
			: '',
		blockedNodeCount ? `- **Blocked Nodes Remaining:** ${blockedNodeCount}` : '',
		skippedNodeCount ? `- **Skipped Nodes:** ${skippedNodeCount}` : '',
		documentsLine ? '' : '',
		documentsLine ? documentsLine : '',
		...extraSections,
	]
		.filter((line) => line !== '')
		.join('\n');
}

export function finalizePlanExecuteVerifyResult({
	executorResult,
	verifierResult,
	mergedUsageStats,
	verifierVerdict,
	verifierNote,
	failFallbackMessage = 'Verifier returned FAIL',
}: FinalizePlanExecuteVerifyResultOptions): AutoRunStageExecutionResult {
	const success =
		executorResult.success && verifierResult.success !== false && verifierVerdict !== 'FAIL';

	const response = verifierResult.response?.trim()
		? `${executorResult.response || ''}\n\nVerifier:\n${verifierResult.response.trim()}`
		: executorResult.response;

	const error =
		executorResult.error ||
		(!success && verifierVerdict === 'FAIL' ? verifierNote || failFallbackMessage : undefined);

	return {
		...executorResult,
		success,
		response,
		error,
		usageStats: mergedUsageStats,
	};
}

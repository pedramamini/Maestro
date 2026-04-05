/**
 * useDocumentProcessor - Document processing logic hook for batch processing
 *
 * This hook extracts the core document reading and task processing logic from
 * useBatchProcessor, providing a reusable interface for:
 * - Reading documents and counting tasks
 * - Processing individual tasks with template variable substitution
 * - Spawning agents and tracking results
 * - Generating synopses for completed tasks
 *
 * The hook is designed to be used by useBatchProcessor for orchestration
 * while encapsulating the document-specific processing logic.
 */

import { useCallback } from 'react';
import type { Session, UsageStats } from '../../types';
import { substituteTemplateVariables, TemplateContext } from '../../utils/templateVariables';
import { getPlaybookPromptForExecution } from './batchUtils';
import { normalizeOpenClawSessionId } from '../../../shared/openclawSessionId';
import { buildActiveTaskDocumentContext } from '../../../shared/markdownTaskUtils';
import {
	buildAutoRunDocumentTaskState,
	buildAutoRunDocumentPromptSection,
	buildAutoRunStagePrompt,
	buildAutoRunVerifierNote,
	finalizeAutoRunTaskExecution,
	finalizePlanExecuteVerifyResult,
	getVerifierVerdict,
	mergeUsageStats,
} from '../../../shared/autorunExecutionModel';
import type { ToolType } from '../../types';
import type {
	HistoryUsageBreakdown,
	PlaybookDocumentContextMode,
	PlaybookPromptProfile,
	PlaybookSkillPromptMode,
} from '../../../shared/types';
import { ensureMarkdownFilename } from '../../../shared/markdownFilenames';

const PLAN_STEP_INSTRUCTION = `You are the planning step for an Auto Run task.

Produce a short implementation plan for the first unchecked task only.
Do not claim the task is complete. Do not describe unrelated follow-up work.`;

const EXECUTE_STEP_INSTRUCTION = `You are the execution step for an Auto Run task.

Use the planner output to complete the first unchecked task in the document.`;

const VERIFY_STEP_INSTRUCTION = `You are the verification step for an Auto Run task.

Review the task outcome, call out any gap against the task, and state PASS or FAIL first.`;

const AUTORUN_CONTEXT_AND_IMPACT_INSTRUCTION = `Before making any non-trivial code change, follow the repository's context-and-impact workflow:
- use GitNexus/context to inspect the target symbol or file
- use GitNexus/impact to check upstream blast radius
- if GitNexus misses the symbol, say so and fall back to focused local code search before editing`;
const AUTORUN_STAGE_INSTRUCTIONS = {
	planner: PLAN_STEP_INSTRUCTION,
	executor: EXECUTE_STEP_INSTRUCTION,
	verifier: VERIFY_STEP_INSTRUCTION,
} as const;

function buildRequestedSkillsSection(
	skills: string[] = [],
	mode: PlaybookSkillPromptMode = 'brief'
): string {
	const normalizedSkills = skills.map((skill) => skill.trim()).filter(Boolean);
	if (normalizedSkills.length === 0) {
		return '';
	}

	const guidance =
		mode === 'full'
			? 'Load and apply these project or user skills if they are available in the workspace or user skill directories before editing.'
			: 'Use these skills if they are available in the workspace or user skill directories.';

	return `## Requested Skills\n${guidance}\n${normalizedSkills.map((skill) => `- ${skill}`).join('\n')}`;
}

/**
 * Configuration for document processing
 */
export interface DocumentProcessorConfig {
	/**
	 * Folder path containing the Auto Run documents
	 */
	folderPath: string;

	/**
	 * Session to process documents for
	 */
	session: Session;

	/**
	 * Current git branch (for template variable substitution)
	 */
	gitBranch?: string;

	/**
	 * Session group name (for template variable substitution)
	 */
	groupName?: string;

	/**
	 * Current loop iteration (1-indexed, for template variables)
	 */
	loopIteration: number;

	/**
	 * Effective current working directory (may be worktree path)
	 */
	effectiveCwd: string;

	/**
	 * Custom prompt to use for task processing
	 */
	customPrompt: string;
	promptProfile?: PlaybookPromptProfile;
	documentContextMode?: PlaybookDocumentContextMode;
	skillPromptMode?: PlaybookSkillPromptMode;
	skills?: string[];
	predecessorContext?: string;

	/**
	 * Execution strategy for the task
	 */
	agentStrategy?: 'single' | 'plan-execute-verify';

	/**
	 * Completion criteria used by the verifier step
	 */
	definitionOfDone?: string[];

	/**
	 * Explicit checks the verifier should always perform
	 */
	verificationSteps?: string[];

	/**
	 * SSH remote ID for remote file operations (when session is SSH-enabled)
	 */
	sshRemoteId?: string;
}

/**
 * Result of processing a single task
 */
export interface TaskResult {
	/**
	 * Whether the task completed successfully
	 */
	success: boolean;

	/**
	 * Agent session ID from the spawn result
	 */
	agentSessionId?: string;

	/**
	 * Token usage statistics from the agent run
	 */
	usageStats?: UsageStats;

	contextDisplayUsageStats?: UsageStats;

	usageBreakdown?: HistoryUsageBreakdown;

	/**
	 * Time elapsed processing this task (ms)
	 */
	elapsedTimeMs: number;

	/**
	 * Number of tasks completed in this run (can be 0 if stalled)
	 */
	tasksCompletedThisRun: number;

	/**
	 * Number of remaining unchecked tasks after this run
	 */
	newRemainingTasks: number;

	/**
	 * Short summary of work done (for history entry)
	 */
	shortSummary: string;

	/**
	 * Full synopsis of work done (for history entry)
	 */
	fullSynopsis: string;

	/**
	 * Verifier verdict for plan-execute-verify runs
	 */
	verifierVerdict?: 'PASS' | 'WARN' | 'FAIL' | null;

	/**
	 * Whether the document content changed during processing
	 */
	documentChanged: boolean;

	/**
	 * The content of the document after processing
	 */
	contentAfterTask: string;

	/**
	 * New count of checked tasks
	 */
	newCheckedCount: number;

	/**
	 * Number of new unchecked tasks that were added during processing
	 */
	addedUncheckedTasks: number;

	/**
	 * Net change in total tasks (checked + unchecked) during processing.
	 * Can be negative if tasks were removed, positive if tasks were added.
	 * This correctly accounts for both completed tasks and newly added tasks.
	 */
	totalTasksChange: number;
}

/**
 * Document read result with task count
 */
export interface DocumentReadResult {
	/**
	 * The document content
	 */
	content: string;

	/**
	 * Number of unchecked tasks in the document
	 */
	taskCount: number;

	/**
	 * Number of checked tasks in the document
	 */
	checkedCount: number;
}

/**
 * Callbacks required for document processing
 */
export interface DocumentProcessorCallbacks {
	/**
	 * Spawn an agent with a prompt
	 */
	onSpawnAgent: (
		sessionId: string,
		prompt: string,
		cwdOverride?: string,
		options?: {
			resumeAgentSessionId?: string;
		}
	) => Promise<{
		success: boolean;
		response?: string;
		error?: string;
		agentSessionId?: string;
		usageStats?: UsageStats;
	}>;

	/**
	 * Resume an existing provider session in the background
	 */
	onSpawnBackgroundSynopsis?: (
		sessionId: string,
		cwd: string,
		resumeAgentSessionId: string,
		prompt: string,
		toolType?: ToolType,
		sessionConfig?: {
			customPath?: string;
			customArgs?: string;
			customEnvVars?: Record<string, string>;
			customModel?: string;
			customContextWindow?: number;
			sessionSshRemoteConfig?: {
				enabled: boolean;
				remoteId: string | null;
				workingDirOverride?: string;
			};
		}
	) => Promise<{
		success: boolean;
		response?: string;
		error?: string;
		agentSessionId?: string;
		usageStats?: UsageStats;
	}>;
}

/**
 * Return type for the useDocumentProcessor hook
 */
export interface UseDocumentProcessorReturn {
	/**
	 * Read a document and count its tasks
	 * @param folderPath - Folder containing the document
	 * @param filename - Document filename (without .md extension)
	 * @param sshRemoteId - Optional SSH remote ID for remote file operations
	 * @returns Document content and task counts
	 */
	readDocAndCountTasks: (
		folderPath: string,
		filename: string,
		sshRemoteId?: string
	) => Promise<DocumentReadResult>;

	/**
	 * Process a single task in a document
	 * @param config - Document processing configuration
	 * @param filename - Document filename (without .md extension)
	 * @param previousCheckedCount - Number of checked tasks before this run
	 * @param previousRemainingTasks - Number of remaining tasks before this run
	 * @param contentBeforeTask - Document content before processing
	 * @param callbacks - Callbacks for agent spawning
	 * @returns Result of the task processing
	 */
	processTask: (
		config: DocumentProcessorConfig,
		filename: string,
		previousCheckedCount: number,
		previousRemainingTasks: number,
		contentBeforeTask: string,
		callbacks: DocumentProcessorCallbacks
	) => Promise<TaskResult>;
}

/**
 * Hook for document processing operations in batch processing
 *
 * This hook provides reusable document processing logic that was previously
 * embedded directly in useBatchProcessor. It handles:
 * - Reading documents and counting tasks
 * - Template variable expansion in prompts and documents
 * - Spawning agents to process tasks
 * - Generating synopses for completed work
 *
 * Usage:
 * ```typescript
 * const { readDocAndCountTasks, processTask } = useDocumentProcessor();
 *
 * // Read document and count tasks
 * const { content, taskCount, checkedCount } = await readDocAndCountTasks(folderPath, 'phase-1');
 *
 * // Process a task
 * const result = await processTask(config, 'phase-1', checkedCount, taskCount, content, callbacks);
 * ```
 */
export function useDocumentProcessor(): UseDocumentProcessorReturn {
	/**
	 * Read a document and count its tasks
	 */
	const readDocAndCountTasks = useCallback(
		async (
			folderPath: string,
			filename: string,
			sshRemoteId?: string
		): Promise<DocumentReadResult> => {
			const result = await window.maestro.autorun.readDoc(
				folderPath,
				ensureMarkdownFilename(filename),
				sshRemoteId
			);

			if (!result.success || !result.content) {
				return { content: '', taskCount: 0, checkedCount: 0 };
			}

			return buildAutoRunDocumentTaskState(result.content);
		},
		[]
	);

	/**
	 * Process a single task in a document
	 */
	const processTask = useCallback(
		async (
			config: DocumentProcessorConfig,
			filename: string,
			previousCheckedCount: number,
			previousRemainingTasks: number,
			contentBeforeTask: string,
			callbacks: DocumentProcessorCallbacks
		): Promise<TaskResult> => {
			const {
				folderPath,
				session,
				gitBranch,
				groupName,
				loopIteration,
				effectiveCwd,
				customPrompt,
				promptProfile,
				documentContextMode,
				skillPromptMode,
				skills,
				predecessorContext,
				agentStrategy,
				definitionOfDone,
				sshRemoteId,
			} = config;

			const docFilePath = `${folderPath}/${ensureMarkdownFilename(filename)}`;

			// Read document content (passes sshRemoteId for remote file operations)
			const docReadResult = await window.maestro.autorun.readDoc(
				folderPath,
				ensureMarkdownFilename(filename),
				sshRemoteId
			);

			// Build template context for this task
			const templateContext: TemplateContext = {
				session,
				gitBranch,
				groupName,
				autoRunFolder: folderPath,
				loopNumber: loopIteration, // Already 1-indexed from caller
				documentName: filename,
				documentPath: docFilePath,
			};

			if (docReadResult.success && docReadResult.content) {
				const expandedDocContent = substituteTemplateVariables(
					docReadResult.content,
					templateContext
				);

				// Write the expanded content back to the document temporarily
				// (Agent will read this file, so it needs the expanded variables)
				if (expandedDocContent !== docReadResult.content) {
					await window.maestro.autorun.writeDoc(
						folderPath,
						ensureMarkdownFilename(filename),
						expandedDocContent,
						sshRemoteId
					);
				}
			}

			const expandedDocContent =
				docReadResult.success && docReadResult.content
					? substituteTemplateVariables(docReadResult.content, templateContext)
					: '';
			const promptDocContent =
				documentContextMode === 'full'
					? expandedDocContent
					: buildActiveTaskDocumentContext(expandedDocContent);
			const basePrompt = substituteTemplateVariables(
				getPlaybookPromptForExecution(customPrompt, promptProfile),
				templateContext
			);
			const skillSection = buildRequestedSkillsSection(skills, skillPromptMode);
			const documentPrompt = buildAutoRunDocumentPromptSection(
				docFilePath,
				promptDocContent,
				documentContextMode
			);
			const finalPrompt = buildAutoRunStagePrompt({
				stage: 'single',
				agentStrategy: 'single',
				instructions: AUTORUN_STAGE_INSTRUCTIONS,
				sharedGuidance: AUTORUN_CONTEXT_AND_IMPACT_INSTRUCTION,
				basePrompt,
				documentPrompt,
				skillPromptBlock: skillSection,
				predecessorContext,
			});

			// Capture start time for elapsed time tracking
			const taskStartTime = Date.now();

			const cwdOverride = effectiveCwd !== session.cwd ? effectiveCwd : undefined;
			let result;
			let verifierNote: string | undefined;
			let verifierVerdict: 'PASS' | 'WARN' | 'FAIL' | null = null;
			const usageBreakdown: HistoryUsageBreakdown = {};
			if (agentStrategy === 'plan-execute-verify') {
				const plannerPrompt = buildAutoRunStagePrompt({
					stage: 'planner',
					agentStrategy,
					instructions: AUTORUN_STAGE_INSTRUCTIONS,
					sharedGuidance: AUTORUN_CONTEXT_AND_IMPACT_INSTRUCTION,
					basePrompt,
					documentPrompt,
					skillPromptBlock: skillSection,
					predecessorContext,
				});
				const plannerResult = await callbacks.onSpawnAgent(session.id, plannerPrompt, cwdOverride);
				let mergedUsageStats = mergeUsageStats(undefined, plannerResult.usageStats);
				usageBreakdown.planner = plannerResult.usageStats;
				const plannerSummary = plannerResult.response?.trim() || '';

				const executorPrompt = buildAutoRunStagePrompt({
					stage: 'executor',
					agentStrategy,
					instructions: AUTORUN_STAGE_INSTRUCTIONS,
					sharedGuidance: AUTORUN_CONTEXT_AND_IMPACT_INSTRUCTION,
					basePrompt,
					documentPrompt,
					skillPromptBlock: skillSection,
					predecessorContext,
					plannerSummary,
				});
				const executorResumeAgentSessionId =
					session.toolType === 'codex' ? undefined : plannerResult.agentSessionId;

				const executorResult = await callbacks.onSpawnAgent(
					session.id,
					executorPrompt,
					cwdOverride,
					executorResumeAgentSessionId
						? {
								resumeAgentSessionId: executorResumeAgentSessionId,
							}
						: undefined
				);

				mergedUsageStats = mergeUsageStats(mergedUsageStats, executorResult.usageStats);
				usageBreakdown.executor = executorResult.usageStats;

				const verifierPrompt = buildAutoRunStagePrompt({
					stage: 'verifier',
					agentStrategy,
					instructions: AUTORUN_STAGE_INSTRUCTIONS,
					sharedGuidance: AUTORUN_CONTEXT_AND_IMPACT_INSTRUCTION,
					basePrompt,
					documentPrompt,
					skillPromptBlock: skillSection,
					predecessorContext,
					plannerSummary,
					executorOutput: executorResult.response?.trim(),
					definitionOfDone,
					verificationSteps: config.verificationSteps,
				});
				const verifierResult = await callbacks.onSpawnAgent(
					session.id,
					verifierPrompt,
					cwdOverride
				);
				mergedUsageStats = mergeUsageStats(mergedUsageStats, verifierResult.usageStats);
				usageBreakdown.verifier = verifierResult.usageStats;
				verifierNote = buildAutoRunVerifierNote(verifierResult.response, verifierResult.error);
				verifierVerdict = getVerifierVerdict(verifierResult.response);
				result = finalizePlanExecuteVerifyResult({
					executorResult,
					verifierResult,
					mergedUsageStats,
					verifierVerdict,
					verifierNote,
				});
			} else {
				// Spawn agent with the prompt, using effective cwd (may be worktree path)
				result = await callbacks.onSpawnAgent(session.id, finalPrompt, cwdOverride);
				usageBreakdown.executor = result.usageStats;
			}

			// Capture elapsed time
			const elapsedTimeMs = Date.now() - taskStartTime;

			// Register agent session origin for Auto Run tracking
			if (result.agentSessionId) {
				const normalizedAgentSessionId =
					session.toolType === 'openclaw'
						? normalizeOpenClawSessionId(result.agentSessionId) || result.agentSessionId
						: result.agentSessionId;

				// Use effectiveCwd (worktree path when active) so session can be found later
				window.maestro.agentSessions
					.registerSessionOrigin(session.toolType, effectiveCwd, normalizedAgentSessionId, 'auto')
					.catch((err) =>
						console.error('[DocumentProcessor] Failed to register session origin:', err)
					);
			}

			// Re-read document to get updated task count and content
			const afterResult = await readDocAndCountTasks(folderPath, filename, sshRemoteId);
			let {
				content: contentAfterTask,
				taskCount: newRemainingTasks,
				checkedCount: newCheckedCount,
			} = afterResult;
			const finalizedTask = finalizeAutoRunTaskExecution({
				documentName: filename,
				toolType: session.toolType,
				result,
				previousTaskState: {
					content: contentBeforeTask,
					taskCount: previousRemainingTasks,
					checkedCount: previousCheckedCount,
				},
				nextTaskState: afterResult,
				usageBreakdown,
				verifierVerdict,
				verifierNote,
			});
			if (finalizedTask.shouldPersistTaskState) {
				await window.maestro.autorun.writeDoc(
					folderPath,
					ensureMarkdownFilename(filename),
					finalizedTask.finalTaskState.content,
					sshRemoteId
				);
			}
			contentAfterTask = finalizedTask.finalTaskState.content;
			newRemainingTasks = finalizedTask.finalTaskState.taskCount;
			newCheckedCount = finalizedTask.finalTaskState.checkedCount;

			// Detect if document content changed
			const documentChanged = contentBeforeTask !== contentAfterTask;

			return {
				success: finalizedTask.success,
				agentSessionId: result.agentSessionId,
				usageStats: finalizedTask.taskRecord.usageStats,
				contextDisplayUsageStats: finalizedTask.taskRecord.contextDisplayUsageStats,
				usageBreakdown: finalizedTask.taskRecord.usageBreakdown,
				elapsedTimeMs,
				tasksCompletedThisRun: finalizedTask.tasksCompletedThisRun,
				newRemainingTasks,
				shortSummary: finalizedTask.taskRecord.summary,
				fullSynopsis: finalizedTask.taskRecord.fullResponse,
				verifierVerdict: finalizedTask.taskRecord.verifierVerdict ?? null,
				documentChanged,
				contentAfterTask,
				newCheckedCount,
				addedUncheckedTasks: finalizedTask.addedUncheckedTasks ?? 0,
				totalTasksChange: finalizedTask.totalTasksChange ?? 0,
			};
		},
		[readDocAndCountTasks]
	);

	return {
		readDocAndCountTasks,
		processTask,
	};
}

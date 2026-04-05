import { useCallback, useRef, useEffect, useMemo } from 'react';
import type {
	BatchRunState,
	BatchRunConfig,
	Session,
	HistoryEntry,
	UsageStats,
	Group,
	AutoRunStats,
	AgentError,
	ToolType,
} from '../../types';
import {
	getBadgeForTime,
	getNextBadge,
	formatTimeRemaining,
} from '../../constants/conductorBadges';
import { formatElapsedTime } from '../../../shared/formatters';
import type {
	AutoRunSchedulerMode,
	AutoRunSchedulerNodeSnapshot,
	AutoRunWorktreeMode,
	Playbook,
} from '../../../shared/types';
import {
	buildAutoRunAggregateUsageStats,
	buildAutoRunLoopSummaryEntry,
	buildAutoRunTotalSummaryDetails,
	mergeAutoRunVerifierVerdict,
	type AutoRunCompletedNodeContext,
} from '../../../shared/autorunExecutionModel';
import {
	createAutoRunSchedulerSnapshot,
	getAutoRunRecordedSchedulerMode,
	summarizeAutoRunObservedExecution,
} from '../../../shared/autorunScheduler';
import {
	type AutoRunDispatchReadyNode,
	type AutoRunDispatchFinalizeResult,
	executeAutoRunDispatchClaims,
	type FinalizeAutoRunDispatchNodeOptions,
	finalizeAutoRunDispatchNodes,
	runAutoRunDispatchBatches,
} from '../../../shared/autorunDispatch';
import { buildParallelDispatchPlan } from '../../../shared/playbookParallelism';
import { ensureMarkdownFilename } from '../../../shared/markdownFilenames';
import { gitService } from '../../services/git';
import { projectMemoryService } from '../../services/projectMemory';
// Extracted batch processing modules
import { countUnfinishedTasks, uncheckAllTasks } from './batchUtils';
import { useSessionDebounce } from './useSessionDebounce';
import { DEFAULT_BATCH_STATE, type BatchAction } from './batchReducer';
import { useBatchStore, selectHasAnyActiveBatch } from '../../stores/batchStore';
import { useSessionStore } from '../../stores/sessionStore';
import { notifyToast } from '../../stores/notificationStore';
import { useTimeTracking } from './useTimeTracking';
import { useWorktreeManager } from './useWorktreeManager';
import { useDocumentProcessor } from './useDocumentProcessor';

// Debounce delay for batch state updates (Quick Win 1)
const BATCH_STATE_DEBOUNCE_MS = 200;

// Regex to match checked markdown checkboxes for reset-on-completion
// Matches both [x] and [X] with various checkbox formats (standard and GitHub-style)
// Note: countUnfinishedTasks, countCheckedTasks, uncheckAllTasks are now imported from ./batch/batchUtils

export interface BatchCompleteInfo {
	sessionId: string;
	sessionName: string;
	completedTasks: number;
	totalTasks: number;
	wasStopped: boolean;
	elapsedTimeMs: number;
	/** Total input tokens consumed across all tasks */
	inputTokens: number;
	/** Total output tokens consumed across all tasks */
	outputTokens: number;
	/** Total estimated cost in USD across all tasks */
	totalCostUsd: number;
	/** Number of documents processed */
	documentsProcessed: number;
}

export interface PRResultInfo {
	sessionId: string;
	sessionName: string;
	success: boolean;
	prUrl?: string;
	error?: string;
}

function formatAutoRunNarrationDocumentLabel(filename: string): string {
	return filename.replace(/\.md$/i, '');
}

function buildAutoRunDocumentStartNarration(filename: string, remainingTasks: number): string {
	const documentLabel = formatAutoRunNarrationDocumentLabel(filename);
	const taskLabel = remainingTasks === 1 ? '1 タスク' : `${remainingTasks} タスク`;
	return `${documentLabel} を開始するのだ。残り ${taskLabel}なのだ。`;
}

function buildAutoRunLoopCompleteNarration(
	completedLoopNumber: number,
	completedLoopTasks: number,
	newTotalTasks: number
): string {
	const completedLabel = completedLoopTasks === 1 ? '1 タスク' : `${completedLoopTasks} タスク`;
	if (newTotalTasks <= 0) {
		return `${completedLoopNumber} ループ完了なのだ。${completedLabel}完了したのだ。`;
	}
	const nextLabel = newTotalTasks === 1 ? '1 タスク' : `${newTotalTasks} タスク`;
	return `${completedLoopNumber} ループ完了なのだ。${completedLabel}完了、次は ${nextLabel}なのだ。`;
}

interface UseBatchProcessorProps {
	sessions: Session[];
	groups: Group[];
	onUpdateSession: (sessionId: string, updates: Partial<Session>) => void;
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
		agentSessionId?: string;
		usageStats?: UsageStats;
	}>;
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
		agentSessionId?: string;
		usageStats?: UsageStats;
	}>;
	onAddHistoryEntry: (entry: Omit<HistoryEntry, 'id'>) => void | Promise<void>;
	onComplete?: (info: BatchCompleteInfo) => void;
	// Callback for PR creation results (success or failure)
	onPRResult?: (info: PRResultInfo) => void;
	// TTS settings for speaking synopsis after each task
	audioFeedbackEnabled?: boolean;
	audioFeedbackCommand?: string;
	// Auto Run stats for achievement progress in final summary
	autoRunStats?: AutoRunStats;
	// Callback to process queued items after batch completion/stop
	// This ensures pending user messages are processed after Auto Run ends
	onProcessQueueAfterCompletion?: (sessionId: string) => void;
}

interface UseBatchProcessorReturn {
	// Map of session ID to batch state
	batchRunStates: Record<string, BatchRunState>;
	// Get batch state for a specific session
	getBatchState: (sessionId: string) => BatchRunState;
	// Check if any session has an active batch
	hasAnyActiveBatch: boolean;
	// Get list of session IDs with active batches
	activeBatchSessionIds: string[];
	// Get list of session IDs that are in stopping state
	stoppingBatchSessionIds: string[];
	// Start batch run for a specific session with multi-document support
	startBatchRun: (sessionId: string, config: BatchRunConfig, folderPath: string) => Promise<void>;
	// Stop batch run for a specific session
	stopBatchRun: (sessionId: string) => void;
	// Force kill the running process and immediately end the batch run
	killBatchRun: (sessionId: string) => Promise<void>;
	// Custom prompts per session
	customPrompts: Record<string, string>;
	setCustomPrompt: (sessionId: string, prompt: string) => void;
	// Error handling (Phase 5.10)
	pauseBatchOnError: (
		sessionId: string,
		error: AgentError,
		documentIndex: number,
		taskDescription?: string
	) => void;
	skipCurrentDocument: (sessionId: string) => void;
	resumeAfterError: (sessionId: string) => void;
	abortBatchOnError: (sessionId: string) => void;
}

type ErrorResolutionAction = 'resume' | 'skip-document' | 'abort';

interface ErrorResolutionEntry {
	promise: Promise<ErrorResolutionAction>;
	resolve: (action: ErrorResolutionAction) => void;
}

function resolveWorktreeMode(
	worktreeTarget: BatchRunConfig['worktreeTarget'],
	worktreeActive: boolean
): AutoRunWorktreeMode {
	if (worktreeTarget?.mode) {
		return worktreeTarget.mode;
	}

	return worktreeActive ? 'managed' : 'disabled';
}

function dedupeIsolatedWorktreeTargets(
	targets: Array<BatchRunConfig['isolatedWorktreeTarget'] | undefined | null>
): NonNullable<BatchRunConfig['isolatedWorktreeTarget']>[] {
	const seenPaths = new Set<string>();
	const deduped: NonNullable<BatchRunConfig['isolatedWorktreeTarget']>[] = [];

	for (const target of targets) {
		if (!target?.cwd) {
			continue;
		}
		if (seenPaths.has(target.cwd)) {
			continue;
		}
		seenPaths.add(target.cwd);
		deduped.push(target);
	}

	return deduped;
}

// Re-export utility functions for backwards compatibility
// (countUnfinishedTasks and uncheckAllTasks are imported from ./batch/batchUtils)
export { countUnfinishedTasks, uncheckAllTasks };

/**
 * Hook for managing batch processing of scratchpad tasks across multiple sessions
 *
 * Memory safety guarantees:
 * - All error resolution promises are rejected with 'abort' on unmount
 * - stopRequestedRefs are cleared when batches complete normally
 * - isMountedRef check prevents all state updates after unmount
 * - Extracted hooks (useSessionDebounce, useTimeTracking) handle their own cleanup
 */
export function useBatchProcessor({
	sessions,
	groups,
	onUpdateSession,
	onSpawnAgent,
	onSpawnBackgroundSynopsis,
	onAddHistoryEntry,
	onComplete,
	onPRResult,
	audioFeedbackEnabled,
	audioFeedbackCommand,
	autoRunStats,
	onProcessQueueAfterCompletion,
}: UseBatchProcessorProps): UseBatchProcessorReturn {
	// Batch states per session — lives in batchStore, read reactively for re-renders
	const batchRunStates = useBatchStore((s) => s.batchRunStates);

	// Dispatch batch actions through the store. The store applies batchReducer
	// synchronously, eliminating the need for manual ref syncing.
	const dispatch = useCallback((action: BatchAction) => {
		const prevStates = useBatchStore.getState().batchRunStates;
		useBatchStore.getState().dispatchBatch(action);
		const newStates = useBatchStore.getState().batchRunStates;

		// DEBUG: Log dispatch to trace state updates
		if (
			action.type === 'START_BATCH' ||
			action.type === 'UPDATE_PROGRESS' ||
			action.type === 'SET_STOPPING' ||
			action.type === 'COMPLETE_BATCH'
		) {
			const sessionId = action.sessionId;
			console.log('[BatchProcessor:dispatch]', action.type, {
				sessionId,
				prevIsRunning: prevStates[sessionId]?.isRunning,
				newIsRunning: newStates[sessionId]?.isRunning,
				prevIsStopping: prevStates[sessionId]?.isStopping,
				newIsStopping: newStates[sessionId]?.isStopping,
				prevCompleted: prevStates[sessionId]?.completedTasksAcrossAllDocs,
				newCompleted: newStates[sessionId]?.completedTasksAcrossAllDocs,
			});
		}
	}, []);

	// Custom prompts per session — lives in batchStore
	const customPrompts = useBatchStore((s) => s.customPrompts);

	// Refs for tracking stop requests per session
	const stopRequestedRefs = useRef<Record<string, boolean>>({});

	// Ref to always have access to latest sessions (fixes stale closure in startBatchRun)
	const sessionsRef = useRef(sessions);
	sessionsRef.current = sessions;

	// Refs to always have access to latest audio feedback settings (fixes stale closure during batch run)
	// Without refs, toggling settings off during a batch run won't take effect until the next run
	const audioFeedbackEnabledRef = useRef(audioFeedbackEnabled);
	audioFeedbackEnabledRef.current = audioFeedbackEnabled;
	const audioFeedbackCommandRef = useRef(audioFeedbackCommand);
	audioFeedbackCommandRef.current = audioFeedbackCommand;
	const speakAutoRunNarration = useCallback((text: string) => {
		if (!audioFeedbackEnabledRef.current || !audioFeedbackCommandRef.current || !text) {
			return;
		}

		window.maestro.notification.speak(text, audioFeedbackCommandRef.current).catch((err) => {
			console.error('[BatchProcessor] Failed to speak Auto Run narration:', err);
		});
	}, []);

	// Ref to track latest updateBatchStateAndBroadcast for async callbacks (fixes HMR stale closure)
	const updateBatchStateAndBroadcastRef = useRef<typeof updateBatchStateAndBroadcast | null>(null);

	// Error resolution promises to pause batch processing until user action (per session)
	const errorResolutionRefs = useRef<Record<string, ErrorResolutionEntry>>({});

	// Track whether the component is still mounted to prevent state updates after unmount
	const isMountedRef = useRef(false);

	// Mount/unmount effect: set isMountedRef on mount, clear on unmount
	// This handles React 18 StrictMode double-render and ensures ref is always correct
	useEffect(() => {
		isMountedRef.current = true;
		console.log('[BatchProcessor] Mounted, isMountedRef set to true');
		return () => {
			isMountedRef.current = false;
			console.log('[BatchProcessor] Unmounting, isMountedRef set to false');

			// Reject all pending error resolution promises with 'abort' to unblock any waiting async code
			// This prevents memory leaks from promises that would never resolve
			Object.entries(errorResolutionRefs.current).forEach(([, entry]) => {
				entry.resolve('abort');
			});
			// Clear the refs to allow garbage collection
			errorResolutionRefs.current = {};

			// Clear stop requested refs (though they should already be cleaned up per-session)
			stopRequestedRefs.current = {};
		};
	}, []);

	/**
	 * Broadcast Auto Run state to web interface immediately (synchronously).
	 * This replaces the previous useEffect-based approach to ensure mobile clients
	 * receive state updates without waiting for React's render cycle.
	 */
	const broadcastAutoRunState = useCallback((sessionId: string, state: BatchRunState | null) => {
		if (
			state &&
			(state.isRunning || state.completedTasks > 0 || state.completedTasksAcrossAllDocs > 0)
		) {
			window.maestro.web.broadcastAutoRunState(sessionId, {
				isRunning: state.isRunning,
				totalTasks: state.totalTasks,
				completedTasks: state.completedTasks,
				currentTaskIndex: state.currentTaskIndex,
				isStopping: state.isStopping,
				// Multi-document progress fields
				totalDocuments: state.documents?.length ?? 0,
				currentDocumentIndex: state.currentDocumentIndex,
				totalTasksAcrossAllDocs: state.totalTasksAcrossAllDocs,
				completedTasksAcrossAllDocs: state.completedTasksAcrossAllDocs,
			});
		} else {
			// When not running and no completed tasks, broadcast null to clear the state
			window.maestro.web.broadcastAutoRunState(sessionId, null);
		}
	}, []);

	// Use extracted debounce hook for batch state updates (replaces manual debounce logic)
	const { scheduleUpdate: _scheduleDebouncedUpdate, flushUpdate: flushDebouncedUpdate } =
		useSessionDebounce<Record<string, BatchRunState>>({
			delayMs: BATCH_STATE_DEBOUNCE_MS,
			onUpdate: useCallback(
				(
					sessionId: string,
					updater: (prev: Record<string, BatchRunState>) => Record<string, BatchRunState>
				) => {
					// Apply the updater and get the new state for broadcasting
					// Note: We use a ref to capture the new state since dispatch doesn't return it
					let newStateForSession: BatchRunState | null = null;

					try {
						// For reducer, we need to convert the updater to an action
						// Since the updater pattern doesn't map directly to actions, we wrap it
						// by reading current state and computing the new state
						const currentState = useBatchStore.getState().batchRunStates;
						const newState = updater(currentState);
						newStateForSession = newState[sessionId] || null;

						// DEBUG: Log to trace progress updates
						console.log('[BatchProcessor:onUpdate] Debounce fired:', {
							sessionId,
							refHasSession: !!currentState[sessionId],
							refCompletedTasks: currentState[sessionId]?.completedTasksAcrossAllDocs,
							newCompletedTasks: newStateForSession?.completedTasksAcrossAllDocs,
						});

						// Dispatch UPDATE_PROGRESS with the computed changes
						// For complex state changes, we extract the session's new state and dispatch appropriately
						if (newStateForSession) {
							const prevSessionState = currentState[sessionId] || DEFAULT_BATCH_STATE;

							// Dispatch UPDATE_PROGRESS with any changed fields
							dispatch({
								type: 'UPDATE_PROGRESS',
								sessionId,
								payload: {
									currentDocumentIndex:
										newStateForSession.currentDocumentIndex !==
										prevSessionState.currentDocumentIndex
											? newStateForSession.currentDocumentIndex
											: undefined,
									currentDocTasksTotal:
										newStateForSession.currentDocTasksTotal !==
										prevSessionState.currentDocTasksTotal
											? newStateForSession.currentDocTasksTotal
											: undefined,
									currentDocTasksCompleted:
										newStateForSession.currentDocTasksCompleted !==
										prevSessionState.currentDocTasksCompleted
											? newStateForSession.currentDocTasksCompleted
											: undefined,
									scheduler:
										newStateForSession.scheduler !== prevSessionState.scheduler
											? newStateForSession.scheduler
											: undefined,
									totalTasksAcrossAllDocs:
										newStateForSession.totalTasksAcrossAllDocs !==
										prevSessionState.totalTasksAcrossAllDocs
											? newStateForSession.totalTasksAcrossAllDocs
											: undefined,
									completedTasksAcrossAllDocs:
										newStateForSession.completedTasksAcrossAllDocs !==
										prevSessionState.completedTasksAcrossAllDocs
											? newStateForSession.completedTasksAcrossAllDocs
											: undefined,
									totalTasks:
										newStateForSession.totalTasks !== prevSessionState.totalTasks
											? newStateForSession.totalTasks
											: undefined,
									completedTasks:
										newStateForSession.completedTasks !== prevSessionState.completedTasks
											? newStateForSession.completedTasks
											: undefined,
									currentTaskIndex:
										newStateForSession.currentTaskIndex !== prevSessionState.currentTaskIndex
											? newStateForSession.currentTaskIndex
											: undefined,
									sessionIds:
										newStateForSession.sessionIds !== prevSessionState.sessionIds
											? newStateForSession.sessionIds
											: undefined,
									accumulatedElapsedMs:
										newStateForSession.accumulatedElapsedMs !==
										prevSessionState.accumulatedElapsedMs
											? newStateForSession.accumulatedElapsedMs
											: undefined,
									lastActiveTimestamp:
										newStateForSession.lastActiveTimestamp !== prevSessionState.lastActiveTimestamp
											? newStateForSession.lastActiveTimestamp
											: undefined,
									loopIteration:
										newStateForSession.loopIteration !== prevSessionState.loopIteration
											? newStateForSession.loopIteration
											: undefined,
								},
							});
						}

						broadcastAutoRunState(sessionId, newStateForSession);
					} catch (error) {
						console.error('[BatchProcessor:onUpdate] ERROR in debounce callback:', error);
					}
				},
				[broadcastAutoRunState]
			),
		});

	// Use extracted time tracking hook (replaces manual visibility-based time tracking)
	const timeTracking = useTimeTracking({
		getActiveSessionIds: useCallback(() => {
			return Object.entries(useBatchStore.getState().batchRunStates)
				.filter(([_, state]) => state.isRunning)
				.map(([sessionId]) => sessionId);
		}, []),
		onTimeUpdate: useCallback(
			(sessionId: string, accumulatedMs: number, activeTimestamp: number | null) => {
				// Update batch state with new time tracking values
				dispatch({
					type: 'UPDATE_PROGRESS',
					sessionId,
					payload: {
						accumulatedElapsedMs: accumulatedMs,
						lastActiveTimestamp: activeTimestamp ?? undefined,
					},
				});
			},
			[]
		),
	});

	// Use extracted worktree manager hook for git worktree operations
	const worktreeManager = useWorktreeManager();

	// Use extracted document processor hook for document processing
	const documentProcessor = useDocumentProcessor();

	// Helper to get batch state for a session
	// Note: This reads from React state (not the ref) because consumers need React
	// to trigger re-renders when state changes. The ref is used internally for
	// synchronous access in debounced callbacks.
	const getBatchState = useCallback(
		(sessionId: string): BatchRunState => {
			return batchRunStates[sessionId] || DEFAULT_BATCH_STATE;
		},
		[batchRunStates]
	);

	// Boolean selector is stable with Object.is comparison
	const hasAnyActiveBatch = useBatchStore(selectHasAnyActiveBatch);

	// Array selectors use useMemo to avoid infinite re-renders
	// (Zustand's Object.is comparison treats new arrays as changed → re-render loop)
	const activeBatchSessionIds = useMemo(
		() =>
			Object.entries(batchRunStates)
				.filter(([, state]) => state.isRunning)
				.map(([sessionId]) => sessionId),
		[batchRunStates]
	);
	const stoppingBatchSessionIds = useMemo(
		() =>
			Object.entries(batchRunStates)
				.filter(([, state]) => state.isRunning && state.isStopping)
				.map(([sessionId]) => sessionId),
		[batchRunStates]
	);

	// Set custom prompt for a session (delegates to store)
	const setCustomPrompt = useCallback((sessionId: string, prompt: string) => {
		useBatchStore.getState().setCustomPrompt(sessionId, prompt);
	}, []);

	/**
	 * Update batch state AND broadcast to web interface with debouncing.
	 * This wrapper uses the extracted useSessionDebounce hook to batch rapid-fire
	 * state updates and reduce React re-renders during intensive task processing.
	 *
	 * Critical updates (isRunning changes, errors) are processed immediately,
	 * while progress updates are debounced by BATCH_STATE_DEBOUNCE_MS.
	 */
	const updateBatchStateAndBroadcast = useCallback(
		(
			sessionId: string,
			updater: (prev: Record<string, BatchRunState>) => Record<string, BatchRunState>,
			_immediate: boolean = false
		) => {
			// DEBUG: Bypass debouncing entirely to test if that's the issue
			// Apply update directly without debouncing
			const currentState = useBatchStore.getState().batchRunStates;
			const newState = updater(currentState);
			const newStateForSession = newState[sessionId] || null;

			console.log('[BatchProcessor:updateBatchStateAndBroadcast] DIRECT update (no debounce)', {
				sessionId,
				prevCompleted: currentState[sessionId]?.completedTasksAcrossAllDocs,
				newCompleted: newStateForSession?.completedTasksAcrossAllDocs,
			});

			if (newStateForSession) {
				const prevSessionState = currentState[sessionId] || DEFAULT_BATCH_STATE;

				dispatch({
					type: 'UPDATE_PROGRESS',
					sessionId,
					payload: {
						currentDocumentIndex:
							newStateForSession.currentDocumentIndex !== prevSessionState.currentDocumentIndex
								? newStateForSession.currentDocumentIndex
								: undefined,
						currentDocTasksTotal:
							newStateForSession.currentDocTasksTotal !== prevSessionState.currentDocTasksTotal
								? newStateForSession.currentDocTasksTotal
								: undefined,
						currentDocTasksCompleted:
							newStateForSession.currentDocTasksCompleted !==
							prevSessionState.currentDocTasksCompleted
								? newStateForSession.currentDocTasksCompleted
								: undefined,
						scheduler:
							newStateForSession.scheduler !== prevSessionState.scheduler
								? newStateForSession.scheduler
								: undefined,
						totalTasksAcrossAllDocs:
							newStateForSession.totalTasksAcrossAllDocs !==
							prevSessionState.totalTasksAcrossAllDocs
								? newStateForSession.totalTasksAcrossAllDocs
								: undefined,
						completedTasksAcrossAllDocs:
							newStateForSession.completedTasksAcrossAllDocs !==
							prevSessionState.completedTasksAcrossAllDocs
								? newStateForSession.completedTasksAcrossAllDocs
								: undefined,
						totalTasks:
							newStateForSession.totalTasks !== prevSessionState.totalTasks
								? newStateForSession.totalTasks
								: undefined,
						completedTasks:
							newStateForSession.completedTasks !== prevSessionState.completedTasks
								? newStateForSession.completedTasks
								: undefined,
						currentTaskIndex:
							newStateForSession.currentTaskIndex !== prevSessionState.currentTaskIndex
								? newStateForSession.currentTaskIndex
								: undefined,
						sessionIds:
							newStateForSession.sessionIds !== prevSessionState.sessionIds
								? newStateForSession.sessionIds
								: undefined,
						accumulatedElapsedMs:
							newStateForSession.accumulatedElapsedMs !== prevSessionState.accumulatedElapsedMs
								? newStateForSession.accumulatedElapsedMs
								: undefined,
						lastActiveTimestamp:
							newStateForSession.lastActiveTimestamp !== prevSessionState.lastActiveTimestamp
								? newStateForSession.lastActiveTimestamp
								: undefined,
						loopIteration:
							newStateForSession.loopIteration !== prevSessionState.loopIteration
								? newStateForSession.loopIteration
								: undefined,
					},
				});
			}

			broadcastAutoRunState(sessionId, newStateForSession);
		},
		[broadcastAutoRunState]
	);

	// Update ref to always have latest updateBatchStateAndBroadcast (fixes HMR stale closure)
	updateBatchStateAndBroadcastRef.current = updateBatchStateAndBroadcast;

	// Use readDocAndCountTasks from the extracted documentProcessor hook
	// This replaces the previous inline helper function
	const readDocAndCountTasks = documentProcessor.readDocAndCountTasks;

	/**
	 * Start a batch processing run for a specific session with multi-document support.
	 * Note: sessionId and folderPath can belong to different sessions when running
	 * in a worktree — the parent session owns the Auto Run documents (folderPath)
	 * while the worktree agent (sessionId) executes the tasks.
	 */
	const startBatchRun = useCallback(
		async (sessionId: string, config: BatchRunConfig, folderPath: string) => {
			window.maestro.logger.log('info', 'startBatchRun called', 'BatchProcessor', {
				sessionId,
				folderPath,
				documentsCount: config.documents.length,
				worktreeEnabled: config.worktree?.enabled,
			});

			// Use sessionsRef first, then fall back to Zustand store for sessions just created
			// (sessionsRef updates on React re-render, but Zustand store updates synchronously)
			const session =
				sessionsRef.current.find((s) => s.id === sessionId) ||
				useSessionStore.getState().sessions.find((s) => s.id === sessionId);
			if (!session) {
				const worktreeInfo = config.worktreeTarget
					? ` (worktree mode: ${config.worktreeTarget.mode}, path: ${
							config.worktreeTarget.mode === 'existing-closed'
								? config.worktreeTarget.worktreePath
								: config.worktreeTarget.mode === 'create-new'
									? config.worktreeTarget.newBranchName
									: config.worktreeTarget.sessionId
						})`
					: '';
				window.maestro.logger.log(
					'error',
					`Session not found for batch processing${worktreeInfo}`,
					'BatchProcessor',
					{
						sessionId,
						worktreeTargetMode: config.worktreeTarget?.mode,
						availableSessionIds: sessionsRef.current.map((s) => s.id),
					}
				);
				return;
			}

			const {
				documents,
				prompt,
				loopEnabled,
				maxLoops,
				playbookId,
				playbookName,
				worktree,
				skills,
				promptProfile,
				documentContextMode,
				skillPromptMode,
				agentStrategy,
				definitionOfDone,
				verificationSteps,
			} = config;

			if (documents.length === 0) {
				window.maestro.logger.log(
					'warn',
					'No documents provided for batch processing',
					'BatchProcessor',
					{ sessionId }
				);
				return;
			}

			// Track batch start time for completion notification
			const batchStartTime = Date.now();

			// Initialize visibility-based time tracking for this session using the extracted hook
			timeTracking.startTracking(sessionId);

			// Reset stop flag for this session
			stopRequestedRefs.current[sessionId] = false;
			delete errorResolutionRefs.current[sessionId];

			// Set up worktree if enabled using extracted hook.
			// Note: sshRemoteId is only set after AI agent spawns. For terminal-only SSH sessions,
			// we must fall back to sessionSshRemoteConfig.remoteId. See CLAUDE.md "SSH Remote Sessions".
			const sshRemoteId =
				session.sshRemoteId || session.sessionSshRemoteConfig?.remoteId || undefined;

			let effectiveCwd: string;
			let worktreeActive: boolean;
			let worktreePath: string | undefined;
			let worktreeBranch: string | undefined;
			const initialScheduler = createAutoRunSchedulerSnapshot(
				documents,
				config.taskGraph,
				config.maxParallelism
			);
			const hasIsolatedWorktreeNodes = initialScheduler.nodes.some(
				(node) => node.isolationMode === 'isolated-worktree'
			);
			let isolatedWorktreeTargets = dedupeIsolatedWorktreeTargets([
				...(config.isolatedWorktreeTargets || []),
				config.isolatedWorktreeTarget,
				...sessionsRef.current
					.filter(
						(candidate) =>
							candidate.parentSessionId === session.id &&
							Boolean(candidate.cwd) &&
							candidate.state !== 'busy' &&
							candidate.state !== 'connecting'
					)
					.map((candidate) => ({
						sessionId: candidate.id,
						cwd: candidate.cwd,
						branchName: candidate.worktreeBranch,
					})),
			]);
			let isolatedWorktreeTarget = isolatedWorktreeTargets[0];

			if (config.worktreeTarget && !isolatedWorktreeTarget) {
				// Worktree dispatch was already handled by useAutoRunHandlers
				// (spawnWorktreeAgentAndDispatch created the worktree and session).
				// Skip setupWorktree — calling it again would fail because the session's
				// CWD is already a worktree, not the main repo, causing a
				// "belongs to a different repository" false positive.
				effectiveCwd = session.cwd;
				worktreeActive = true;
				worktreePath = session.cwd;
				worktreeBranch = session.worktreeBranch || config.worktree?.branchName;
			} else if (isolatedWorktreeTarget) {
				effectiveCwd = session.cwd;
				worktreeActive = true;
				worktreePath = isolatedWorktreeTarget.cwd;
				worktreeBranch = isolatedWorktreeTarget.branchName || config.worktree?.branchName;
			} else {
				// Normal path: set up worktree from scratch if config.worktree is enabled
				const worktreeWithSsh = worktree ? { ...worktree, sshRemoteId } : undefined;
				const worktreeResult = await worktreeManager.setupWorktree(session.cwd, worktreeWithSsh);
				if (!worktreeResult.success) {
					window.maestro.logger.log('error', 'Worktree setup failed', 'BatchProcessor', {
						sessionId,
						error: worktreeResult.error,
					});
					return;
				}
				effectiveCwd = worktreeResult.effectiveCwd;
				worktreeActive = worktreeResult.worktreeActive;
				worktreePath = worktreeResult.worktreePath;
				worktreeBranch = worktreeResult.worktreeBranch;
				if (
					hasIsolatedWorktreeNodes &&
					worktreeResult.worktreeActive &&
					worktreeResult.effectiveCwd !== session.cwd
				) {
					isolatedWorktreeTargets = dedupeIsolatedWorktreeTargets([
						{
							sessionId: session.id,
							cwd: worktreeResult.effectiveCwd,
							branchName: worktreeResult.worktreeBranch,
						},
						...isolatedWorktreeTargets,
					]);
					isolatedWorktreeTarget = isolatedWorktreeTargets[0];
					effectiveCwd = session.cwd;
				}
			}

			const worktreeMode = resolveWorktreeMode(config.worktreeTarget, worktreeActive);

			let inferredProjectMemoryExecution =
				config.projectMemoryExecution ||
				(await projectMemoryService.inferExecutionContext(
					session.projectRoot || session.cwd,
					session.toolType
				));
			if (
				session.toolType === 'codex' &&
				!inferredProjectMemoryExecution &&
				config.projectMemoryBindingIntent
			) {
				const repoRoot = config.projectMemoryBindingIntent.repoRoot;
				const validationReport = await projectMemoryService.validateState(repoRoot);
				const isMissingTaskStore = validationReport?.issues.some((issue) =>
					issue.includes('tasks.json not found')
				);

				if (isMissingTaskStore) {
					const bootstrapPlaybook: Playbook = {
						id: config.playbookId ?? 'autorun-bootstrap',
						name: config.playbookName ?? 'Auto Run Playbook',
						createdAt: Date.now(),
						updatedAt: Date.now(),
						documents: documents.map((doc) => ({
							filename: ensureMarkdownFilename(doc.filename),
							resetOnCompletion: Boolean(doc.resetOnCompletion),
						})),
						loopEnabled,
						maxLoops,
						taskTimeoutMs: config.taskTimeoutMs ?? null,
						prompt: prompt !== '' ? prompt : null,
						skills: config.skills ?? [],
						definitionOfDone: config.definitionOfDone ?? [],
						verificationSteps: config.verificationSteps ?? [],
						promptProfile: config.promptProfile ?? 'compact-code',
						documentContextMode: config.documentContextMode ?? 'active-task-only',
						skillPromptMode: config.skillPromptMode ?? 'brief',
						agentStrategy: config.agentStrategy ?? 'single',
						maxParallelism: config.maxParallelism ?? null,
						taskGraph: config.taskGraph,
						projectMemoryExecution: null,
						projectMemoryBindingIntent: config.projectMemoryBindingIntent,
					};
					const emissionResult = await projectMemoryService.emitWizardTasks(bootstrapPlaybook, {
						force: false,
					});

					if (!emissionResult.success) {
						notifyToast({
							title: 'Project Memory bootstrap failed',
							message: emissionResult.error,
							type: 'warning',
						});
						return;
					}
				}

				inferredProjectMemoryExecution =
					(await projectMemoryService.inferExecutionContext(repoRoot, session.toolType)) ||
					(await projectMemoryService.claimNextExecutionContext(repoRoot, session.toolType));
			}
			if (session.toolType === 'codex' && !inferredProjectMemoryExecution) {
				const reason = 'Codex Auto Run requires an active Project Memory binding for this repo.';
				window.maestro.logger.log(
					'warn',
					'Project Memory binding required for Codex Auto Run start',
					'BatchProcessor',
					{
						sessionId,
						repoRoot: session.projectRoot || session.cwd,
						toolType: session.toolType,
						hasExplicitProjectMemoryExecution: Boolean(config.projectMemoryExecution),
					}
				);
				notifyToast({
					title: 'Project Memory blocked Auto Run',
					message: `Project Memory blocked Auto Run start: ${reason}`,
					type: 'warning',
				});
				return;
			}
			const validationRepoRoot = inferredProjectMemoryExecution?.repoRoot || effectiveCwd;

			// Get git branch for template variable substitution and project-memory validation
			let gitBranch: string | undefined;
			if (session.isGitRepo) {
				try {
					const status = await gitService.getStatus(validationRepoRoot);
					gitBranch = status.branch;
				} catch {
					// Ignore git errors - branch will be empty string
				}
			}

			if (inferredProjectMemoryExecution) {
				const validation = await projectMemoryService.validateExecutionStart(
					inferredProjectMemoryExecution,
					gitBranch ?? null
				);
				if (!validation.ok) {
					const reason = validation.reason ?? 'Project Memory validation blocked this Auto Run.';
					window.maestro.logger.log(
						'warn',
						'Project Memory execution validation blocked Auto Run start',
						'BatchProcessor',
						{
							sessionId,
							taskId: validation.taskId,
							executorId: validation.executorId,
							expectedBranch: validation.expectedBranch,
							currentBranch: validation.currentBranch,
							bindingMode: validation.bindingMode,
							reason,
						}
					);
					notifyToast({
						title: 'Project Memory blocked Auto Run',
						message: `Project Memory blocked Auto Run start: ${reason}`,
						type: 'warning',
					});
					return;
				}
			}

			// Find group name for this session (sessions have groupId, groups have id)
			const sessionGroup = session.groupId ? groups.find((g) => g.id === session.groupId) : null;
			const groupName = sessionGroup?.name;

			// Calculate initial total tasks across all documents
			let initialTotalTasks = 0;
			for (const doc of documents) {
				const { taskCount } = await readDocAndCountTasks(folderPath, doc.filename, sshRemoteId);
				initialTotalTasks += taskCount;
			}

			if (initialTotalTasks === 0) {
				window.maestro.logger.log(
					'warn',
					'No unchecked tasks found across all documents',
					'BatchProcessor',
					{ sessionId }
				);
				return;
			}

			// Initialize batch run state using START_BATCH action directly
			// (not updateBatchStateAndBroadcast which only supports UPDATE_PROGRESS)
			const lockedDocuments = documents.map((d) => d.filename);
			dispatch({
				type: 'START_BATCH',
				sessionId,
				payload: {
					documents: documents.map((d) => d.filename),
					lockedDocuments,
					totalTasksAcrossAllDocs: initialTotalTasks,
					loopEnabled,
					maxLoops,
					folderPath,
					worktreeActive,
					worktreePath,
					worktreeBranch,
					projectMemoryExecution: inferredProjectMemoryExecution ?? null,
					scheduler: initialScheduler,
					customPrompt: prompt !== '' ? prompt : undefined,
					startTime: batchStartTime,
					// Time tracking
					cumulativeTaskTimeMs: 0, // Sum of actual task durations (most accurate)
					accumulatedElapsedMs: 0, // Visibility-based time (excludes sleep/suspend)
					lastActiveTimestamp: batchStartTime,
				},
			});
			// Broadcast state change
			broadcastAutoRunState(sessionId, {
				isRunning: true,
				isStopping: false,
				documents: documents.map((d) => d.filename),
				lockedDocuments,
				currentDocumentIndex: 0,
				currentDocTasksTotal: 0,
				currentDocTasksCompleted: 0,
				totalTasksAcrossAllDocs: initialTotalTasks,
				completedTasksAcrossAllDocs: 0,
				loopEnabled,
				loopIteration: 0,
				maxLoops,
				folderPath,
				worktreeActive,
				worktreePath,
				worktreeBranch,
				projectMemoryExecution: config.projectMemoryExecution ?? null,
				scheduler: initialScheduler,
				totalTasks: initialTotalTasks,
				completedTasks: 0,
				currentTaskIndex: 0,
				originalContent: '',
				customPrompt: prompt !== '' ? prompt : undefined,
				sessionIds: [],
				startTime: batchStartTime,
				accumulatedElapsedMs: 0,
				lastActiveTimestamp: batchStartTime,
			});

			// AUTORUN LOG: Start
			window.maestro.logger.autorun(`Auto Run started`, session.name, {
				documents: documents.map((d) => d.filename),
				totalTasks: initialTotalTasks,
				loopEnabled,
				maxLoops: maxLoops ?? 'unlimited',
			});

			// Notify user that Auto Run has started
			notifyToast({
				type: 'info',
				title: 'Auto Run Started',
				message: `${initialTotalTasks} ${initialTotalTasks === 1 ? 'task' : 'tasks'} across ${documents.length} ${documents.length === 1 ? 'document' : 'documents'}`,
				project: session.name,
				sessionId,
			});

			// Add initial history entry when using worktree
			if (worktreeActive && worktreePath && worktreeBranch) {
				const worktreeStartSummary = `Auto Run started in worktree`;
				const worktreeStartDetails = [
					`**Worktree Auto Run Started**`,
					``,
					`- **Branch:** \`${worktreeBranch}\``,
					`- **Worktree Path:** \`${worktreePath}\``,
					`- **Main Repo:** \`${session.cwd}\``,
					`- **Documents:** ${documents.map((d) => d.filename).join(', ')}`,
					`- **Total Tasks:** ${initialTotalTasks}`,
					loopEnabled ? `- **Loop Mode:** Enabled${maxLoops ? ` (max ${maxLoops})` : ''}` : '',
				]
					.filter((line) => line !== '')
					.join('\n');

				onAddHistoryEntry({
					type: 'AUTO',
					timestamp: Date.now(),
					summary: worktreeStartSummary,
					fullResponse: worktreeStartDetails,
					projectPath: effectiveCwd,
					sessionId: sessionId,
					success: true,
				});
			}

			// Store custom prompt for persistence
			useBatchStore.getState().setCustomPrompt(sessionId, prompt);

			// State machine: INITIALIZING -> RUNNING (initialization complete)
			dispatch({ type: 'SET_RUNNING', sessionId });

			// Prevent system sleep while Auto Run is active
			window.maestro.power.addReason(`autorun:${sessionId}`);

			// Start stats tracking for this Auto Run session
			let statsAutoRunId: string | null = null;
			try {
				statsAutoRunId = await window.maestro.stats.startAutoRun({
					sessionId: sessionId,
					agentType: session.toolType,
					documentPath: documents.map((d) => d.filename).join(', '),
					startTime: batchStartTime,
					tasksTotal: initialTotalTasks,
					projectPath: effectiveCwd,
					playbookId,
					playbookName,
					promptProfile,
					agentStrategy,
					worktreeMode,
					schedulerMode: getAutoRunRecordedSchedulerMode(initialScheduler),
					configuredSchedulerMode: initialScheduler.configuredMode,
					maxParallelism: config.maxParallelism ?? undefined,
				});
			} catch (statsError) {
				// Don't fail the batch if stats tracking fails
				console.warn('[BatchProcessor] Failed to start stats tracking:', statsError);
			}

			// Collect Claude session IDs and track completion
			const agentSessionIds: string[] = [];
			let totalCompletedTasks = 0;
			let totalTaskAttempts = 0;
			let loopIteration = 0;
			let schedulerSnapshot = initialScheduler;

			// Per-loop tracking for loop summary
			let loopStartTime = Date.now();
			let loopTasksCompleted = 0;
			let loopTotalInputTokens = 0;
			let loopTotalOutputTokens = 0;
			let loopTotalCost = 0;

			// Cumulative tracking for final Auto Run summary (across all loops)
			let totalInputTokens = 0;
			let totalOutputTokens = 0;
			let totalCost = 0;
			let autoRunVerifierVerdict: 'PASS' | 'WARN' | 'FAIL' | null = null;
			const autoRunTimedOut = false;
			const totalQueueWaitMs = 0;
			const totalRetryCount = 0;
			let sharedCheckoutFallbackCount = 0;
			let anyTasksProcessedThisIteration = false;

			// Track stalled documents (document filename -> stall reason)
			const stalledDocuments: Map<string, string> = new Map();

			// Track working copies for reset-on-completion documents (original filename -> working copy path)
			// Working copies are stored in /Runs/ and serve as audit logs
			const workingCopies: Map<string, string> = new Map();

			// Helper to add final loop summary (defined here so it has access to tracking vars)
			const addFinalLoopSummary = (exitReason: string) => {
				// AUTORUN LOG: Exit
				window.maestro.logger.autorun(`Auto Run exiting: ${exitReason}`, session.name, {
					reason: exitReason,
					totalTasksCompleted: totalCompletedTasks,
					loopsCompleted: loopIteration + 1,
				});

				if (loopEnabled && (loopTasksCompleted > 0 || loopIteration > 0)) {
					const observedExecution = summarizeAutoRunObservedExecution(schedulerSnapshot, {
						sharedCheckoutFallbackCount,
					});
					onAddHistoryEntry(
						buildAutoRunLoopSummaryEntry({
							timestamp: Date.now(),
							loopIteration,
							loopTasksCompleted,
							loopElapsedMs: Date.now() - loopStartTime,
							loopTotalInputTokens,
							loopTotalOutputTokens,
							loopTotalCost,
							projectPath: session.cwd,
							sessionId,
							isFinal: true,
							exitReason,
							playbookId,
							playbookName,
							promptProfile,
							agentStrategy,
							worktreeMode,
							schedulerMode: observedExecution.observedSchedulerMode,
							configuredSchedulerMode: observedExecution.configuredSchedulerMode,
							actualParallelNodeCount: observedExecution.actualParallelNodeCount,
							sharedCheckoutFallbackCount: observedExecution.sharedCheckoutFallbackCount,
							blockedNodeCount: observedExecution.blockedNodeCount,
							skippedNodeCount: observedExecution.skippedNodeCount,
							schedulerOutcome:
								exitReason === 'All tasks completed' ||
								(maxLoops !== null &&
									maxLoops !== undefined &&
									exitReason === `Reached max loop limit (${maxLoops})`)
									? 'completed'
									: 'failed',
						})
					);
					speakAutoRunNarration(
						buildAutoRunLoopCompleteNarration(loopIteration + 1, loopTasksCompleted, 0)
					);
				}
			};

			const processDispatchClaim = async (
				claim: AutoRunDispatchReadyNode,
				batchSchedulerSnapshot: typeof schedulerSnapshot,
				isolatedTargetForClaim?: NonNullable<BatchRunConfig['isolatedWorktreeTarget']> | null
			): Promise<AutoRunDispatchFinalizeResult | null> => {
				const MAX_CONSECUTIVE_NO_CHANGES = 2;
				let consecutiveNoChangeCount = 0;
				const schedulerNodeId = claim.nodeId;
				const schedulerNode = claim.node;
				const isolatedExecutionSession =
					schedulerNode.isolationMode === 'isolated-worktree' && isolatedTargetForClaim
						? sessionsRef.current.find(
								(candidate) => candidate.id === isolatedTargetForClaim.sessionId
							) || null
						: null;
				const executionSession =
					schedulerNode.isolationMode === 'isolated-worktree' && isolatedExecutionSession
						? isolatedExecutionSession
						: session;
				const taskEffectiveCwd =
					schedulerNode.isolationMode === 'isolated-worktree' && isolatedTargetForClaim
						? isolatedTargetForClaim.cwd
						: effectiveCwd;
				const taskSshRemoteId =
					executionSession.sshRemoteId ||
					executionSession.sessionSshRemoteConfig?.remoteId ||
					undefined;
				const docIndex = schedulerNode.documentIndex;
				const docEntry = documents[docIndex];
				const predecessorContext = claim.predecessorContext;

				let {
					taskCount: remainingTasks,
					content: docContent,
					checkedCount: docCheckedCount,
				} = await readDocAndCountTasks(folderPath, docEntry.filename, sshRemoteId);
				let docTasksTotal = remainingTasks;

				if (remainingTasks === 0) {
					if (docEntry.resetOnCompletion && loopEnabled && docCheckedCount > 0) {
						const resetContent = uncheckAllTasks(docContent);
						await window.maestro.autorun.writeDoc(
							folderPath,
							ensureMarkdownFilename(docEntry.filename),
							resetContent,
							sshRemoteId
						);
						const resetTaskCount = countUnfinishedTasks(resetContent);
						updateBatchStateAndBroadcastRef.current!(sessionId, (prev) => ({
							...prev,
							[sessionId]: {
								...prev[sessionId],
								totalTasksAcrossAllDocs: prev[sessionId].totalTasksAcrossAllDocs + resetTaskCount,
								totalTasks: prev[sessionId].totalTasks + resetTaskCount,
							},
						}));
					}

					return {
						finalizeOptions: {
							nodeId: schedulerNodeId,
							documentName: docEntry.filename,
							state: 'completed',
							summaries: [`No unchecked tasks remained in ${docEntry.filename}.`],
							success: true,
						},
					};
				}

				let effectiveFilename = docEntry.filename;
				if (docEntry.resetOnCompletion) {
					try {
						const { workingCopyPath } = await window.maestro.autorun.createWorkingCopy(
							folderPath,
							docEntry.filename,
							loopIteration + 1,
							sshRemoteId
						);
						workingCopies.set(docEntry.filename, workingCopyPath);
						effectiveFilename = workingCopyPath;

						const workingCopyResult = await readDocAndCountTasks(
							folderPath,
							effectiveFilename,
							sshRemoteId
						);
						remainingTasks = workingCopyResult.taskCount;
						docContent = workingCopyResult.content;
						docCheckedCount = workingCopyResult.checkedCount;
						docTasksTotal = remainingTasks;
					} catch (err) {
						console.error(
							`[BatchProcessor] Failed to create working copy for ${docEntry.filename}:`,
							err
						);
					}
				}

				window.maestro.logger.autorun(`Processing document: ${docEntry.filename}`, session.name, {
					document: docEntry.filename,
					tasksRemaining: remainingTasks,
					loopNumber: loopIteration + 1,
				});
				updateBatchStateAndBroadcastRef.current!(sessionId, (prev) => ({
					...prev,
					[sessionId]: {
						...prev[sessionId],
						currentDocumentIndex: docIndex,
						currentDocTasksTotal: docTasksTotal,
						currentDocTasksCompleted: 0,
						scheduler: batchSchedulerSnapshot,
					},
				}));
				speakAutoRunNarration(
					buildAutoRunDocumentStartNarration(docEntry.filename, remainingTasks)
				);

				let docTasksCompleted = 0;
				let skipCurrentDocumentAfterError = false;
				const documentTaskSummaries: string[] = [];
				let documentVerifierVerdict: 'PASS' | 'WARN' | 'FAIL' | null = null;
				let documentSucceeded = true;

				while (remainingTasks > 0) {
					if (stopRequestedRefs.current[sessionId]) {
						break;
					}

					const errorResolution = errorResolutionRefs.current[sessionId];
					if (errorResolution) {
						const action = await errorResolution.promise;
						delete errorResolutionRefs.current[sessionId];

						if (action === 'abort') {
							stopRequestedRefs.current[sessionId] = true;
							break;
						}

						if (action === 'skip-document') {
							skipCurrentDocumentAfterError = true;
							break;
						}
					}

					try {
						const taskResult = await documentProcessor.processTask(
							{
								folderPath,
								session: executionSession,
								gitBranch,
								groupName,
								loopIteration: loopIteration + 1,
								effectiveCwd: taskEffectiveCwd,
								customPrompt: prompt,
								skills,
								predecessorContext,
								promptProfile,
								documentContextMode,
								skillPromptMode,
								agentStrategy,
								definitionOfDone,
								verificationSteps,
								sshRemoteId: taskSshRemoteId,
							},
							effectiveFilename,
							docCheckedCount,
							remainingTasks,
							docContent,
							{
								onSpawnAgent,
								onSpawnBackgroundSynopsis,
							}
						);

						if (taskResult.agentSessionId) {
							agentSessionIds.push(taskResult.agentSessionId);
						}

						anyTasksProcessedThisIteration = true;
						const {
							tasksCompletedThisRun,
							addedUncheckedTasks,
							newRemainingTasks,
							documentChanged,
							newCheckedCount,
							shortSummary,
							fullSynopsis,
							usageStats,
							elapsedTimeMs,
							agentSessionId,
							success,
						} = taskResult;
						const countedCompletedTasks = success ? tasksCompletedThisRun : 0;
						documentSucceeded = documentSucceeded && success;
						documentVerifierVerdict = mergeAutoRunVerifierVerdict(
							documentVerifierVerdict,
							taskResult.verifierVerdict ?? null
						);
						autoRunVerifierVerdict = mergeAutoRunVerifierVerdict(
							autoRunVerifierVerdict,
							taskResult.verifierVerdict ?? null
						);
						if (shortSummary) {
							documentTaskSummaries.push(shortSummary);
						}

						if (!documentChanged && tasksCompletedThisRun === 0) {
							consecutiveNoChangeCount++;
						} else {
							consecutiveNoChangeCount = 0;
						}

						docTasksCompleted += countedCompletedTasks;
						totalCompletedTasks += countedCompletedTasks;
						loopTasksCompleted += countedCompletedTasks;
						totalTaskAttempts++;

						if (statsAutoRunId) {
							try {
								await window.maestro.stats.recordAutoTask({
									autoRunSessionId: statsAutoRunId,
									sessionId: executionSession.id,
									agentType: executionSession.toolType,
									taskIndex: totalTaskAttempts - 1,
									taskContent: shortSummary || undefined,
									documentPath: `${folderPath}/${ensureMarkdownFilename(docEntry.filename)}`,
									startTime: Date.now() - elapsedTimeMs,
									duration: elapsedTimeMs,
									success: success,
									verifierVerdict: taskResult.verifierVerdict ?? undefined,
									promptProfile,
									agentStrategy,
									worktreeMode,
									schedulerOutcome: success ? 'completed' : 'failed',
									queueWaitMs: 0,
									retryCount: 0,
									timedOut: false,
								});
							} catch (statsError) {
								console.warn('[BatchProcessor] Failed to record task stats:', statsError);
							}
						}

						if (usageStats) {
							loopTotalInputTokens += usageStats.inputTokens || 0;
							loopTotalOutputTokens += usageStats.outputTokens || 0;
							loopTotalCost += usageStats.totalCostUsd || 0;
							totalInputTokens += usageStats.inputTokens || 0;
							totalOutputTokens += usageStats.outputTokens || 0;
							totalCost += usageStats.totalCostUsd || 0;
						}

						if (session.symphonyMetadata?.isSymphonySession) {
							window.maestro.symphony
								.updateStatus({
									contributionId: session.symphonyMetadata.contributionId,
									progress: {
										totalDocuments: documents.length,
										completedDocuments: docIndex,
										totalTasks: initialTotalTasks,
										completedTasks: totalCompletedTasks,
										currentDocument: docEntry.filename,
									},
									tokenUsage: {
										inputTokens: totalInputTokens,
										outputTokens: totalOutputTokens,
										estimatedCost: totalCost,
									},
									timeSpent: timeTracking.getElapsedTime(sessionId),
								})
								.catch((err: unknown) => {
									console.warn('[BatchProcessor] Failed to update Symphony progress:', err);
								});
						}

						void (!docEntry.resetOnCompletion ? tasksCompletedThisRun : 0);

						if (addedUncheckedTasks > 0) {
							docTasksTotal += addedUncheckedTasks;
						}

						let recountedTotal = 0;
						for (const doc of documents) {
							const { taskCount, checkedCount } = await readDocAndCountTasks(
								folderPath,
								doc.filename,
								sshRemoteId
							);
							recountedTotal += taskCount + checkedCount;
						}

						updateBatchStateAndBroadcastRef.current!(sessionId, (prev) => {
							const prevState = prev[sessionId] || DEFAULT_BATCH_STATE;
							const nextTotalAcrossAllDocs = Math.max(0, recountedTotal);
							const nextTotalTasks = Math.max(0, recountedTotal);

							return {
								...prev,
								[sessionId]: {
									...prevState,
									currentDocTasksCompleted: docTasksCompleted,
									currentDocTasksTotal: docTasksTotal,
									completedTasksAcrossAllDocs: totalCompletedTasks,
									totalTasksAcrossAllDocs: nextTotalAcrossAllDocs,
									cumulativeTaskTimeMs: (prevState.cumulativeTaskTimeMs || 0) + elapsedTimeMs,
									completedTasks: totalCompletedTasks,
									totalTasks: nextTotalTasks,
									currentTaskIndex: totalCompletedTasks,
									sessionIds: [...(prevState?.sessionIds || []), agentSessionId || ''],
								},
							};
						});

						onAddHistoryEntry({
							type: 'AUTO',
							timestamp: Date.now(),
							summary: shortSummary,
							fullResponse: fullSynopsis,
							agentSessionId,
							projectPath: taskEffectiveCwd,
							sessionId: sessionId,
							success,
							usageStats,
							contextDisplayUsageStats: taskResult.contextDisplayUsageStats,
							usageBreakdown: taskResult.usageBreakdown,
							elapsedTimeMs,
							verifierVerdict: taskResult.verifierVerdict ?? undefined,
							playbookId,
							playbookName,
							promptProfile,
							agentStrategy,
							worktreeMode,
							schedulerMode: getAutoRunRecordedSchedulerMode(batchSchedulerSnapshot),
							configuredSchedulerMode: batchSchedulerSnapshot.configuredMode,
							schedulerOutcome: success ? 'completed' : 'failed',
						});

						if (
							audioFeedbackEnabledRef.current &&
							audioFeedbackCommandRef.current &&
							shortSummary
						) {
							window.maestro.notification
								.speak(shortSummary, audioFeedbackCommandRef.current)
								.catch((err) => {
									console.error('[BatchProcessor] Failed to speak synopsis:', err);
								});
						}

						if (consecutiveNoChangeCount >= MAX_CONSECUTIVE_NO_CHANGES) {
							const stallReason = `${consecutiveNoChangeCount} consecutive runs with no progress`;
							stalledDocuments.set(docEntry.filename, stallReason);
							window.maestro.logger.autorun(
								`Document stalled: ${docEntry.filename}`,
								session.name,
								{
									document: docEntry.filename,
									reason: stallReason,
									remainingTasks: newRemainingTasks,
									loopNumber: loopIteration + 1,
								}
							);

							const stallExplanation = [
								`**Document Stalled: ${docEntry.filename}**`,
								'',
								`The AI agent ran ${consecutiveNoChangeCount} times on this document but made no progress:`,
								`- No tasks were checked off`,
								`- No changes were made to the document content`,
								'',
								`**What this means:**`,
								`The remaining tasks in this document may be:`,
								`- Already complete (but not checked off)`,
								`- Unclear or ambiguous for the AI to act on`,
								`- Dependent on external factors or manual intervention`,
								`- Outside the scope of what the AI can accomplish`,
								'',
								`**Remaining unchecked tasks:** ${newRemainingTasks}`,
								'',
								documents.length > 1
									? `Skipping to the next document in the playbook...`
									: `No more documents to process.`,
							].join('\n');

							onAddHistoryEntry({
								type: 'AUTO',
								timestamp: Date.now(),
								summary: `Document stalled: ${docEntry.filename} (${newRemainingTasks} tasks remaining)`,
								fullResponse: stallExplanation,
								projectPath: taskEffectiveCwd,
								sessionId: sessionId,
								success: false,
							});
							break;
						}

						docCheckedCount = newCheckedCount;
						remainingTasks = newRemainingTasks;
						docContent = taskResult.contentAfterTask;
					} catch (error) {
						console.error(
							`[BatchProcessor] Error running task in ${docEntry.filename} for session ${sessionId}:`,
							error
						);

						const postTaskErrorResolution = errorResolutionRefs.current[sessionId];
						if (postTaskErrorResolution) {
							const action = await postTaskErrorResolution.promise;
							delete errorResolutionRefs.current[sessionId];

							if (action === 'abort') {
								stopRequestedRefs.current[sessionId] = true;
								break;
							}

							if (action === 'skip-document') {
								skipCurrentDocumentAfterError = true;
								break;
							}

							const {
								taskCount,
								checkedCount,
								content: freshContent,
							} = await readDocAndCountTasks(folderPath, effectiveFilename, sshRemoteId);
							remainingTasks = taskCount;
							docCheckedCount = checkedCount;
							docContent = freshContent;
							continue;
						}

						remainingTasks--;
					}
				}

				if (stopRequestedRefs.current[sessionId]) {
					return null;
				}

				if (stalledDocuments.has(docEntry.filename)) {
					workingCopies.delete(docEntry.filename);
					return {
						finalizeOptions: {
							nodeId: schedulerNodeId,
							documentName: docEntry.filename,
							state: 'failed',
							summaries: documentTaskSummaries.length
								? documentTaskSummaries
								: [`Document stalled: ${docEntry.filename}`],
							success: false,
							verifierVerdict: documentVerifierVerdict,
						},
					};
				}

				if (skipCurrentDocumentAfterError) {
					workingCopies.delete(docEntry.filename);
					return {
						finalizeOptions: {
							nodeId: schedulerNodeId,
							documentName: docEntry.filename,
							state: 'failed',
							summaries: documentTaskSummaries.length
								? documentTaskSummaries
								: [`Document skipped after manual review: ${docEntry.filename}`],
							success: false,
							verifierVerdict: documentVerifierVerdict,
						},
					};
				}

				if (docEntry.resetOnCompletion && docTasksCompleted > 0) {
					window.maestro.logger.autorun(
						`Document loop completed: ${docEntry.filename}`,
						session.name,
						{
							document: docEntry.filename,
							workingCopy: workingCopies.get(docEntry.filename),
							tasksCompleted: docTasksCompleted,
							loopNumber: loopIteration + 1,
						}
					);

					if (loopEnabled) {
						const { taskCount: resetTaskCount } = await readDocAndCountTasks(
							folderPath,
							docEntry.filename,
							sshRemoteId
						);
						updateBatchStateAndBroadcastRef.current!(sessionId, (prev) => ({
							...prev,
							[sessionId]: {
								...prev[sessionId],
								totalTasksAcrossAllDocs: prev[sessionId].totalTasksAcrossAllDocs + resetTaskCount,
								totalTasks: prev[sessionId].totalTasks + resetTaskCount,
							},
						}));
					}

					workingCopies.delete(docEntry.filename);
				} else if (docEntry.resetOnCompletion) {
					workingCopies.delete(docEntry.filename);
				}

				return {
					finalizeOptions: {
						nodeId: schedulerNodeId,
						documentName: docEntry.filename,
						state: remainingTasks === 0 ? 'completed' : 'failed',
						summaries: documentTaskSummaries,
						success: documentSucceeded && remainingTasks === 0,
						verifierVerdict: documentVerifierVerdict,
					},
				};
			};

			// Main processing loop (handles loop mode)
			while (true) {
				schedulerSnapshot = createAutoRunSchedulerSnapshot(
					documents,
					config.taskGraph,
					config.maxParallelism
				);
				let completedNodeContexts: ReadonlyMap<string, AutoRunCompletedNodeContext> = new Map();

				// Check for stop request
				if (stopRequestedRefs.current[sessionId]) {
					addFinalLoopSummary('Stopped by user');
					break;
				}

				// Track if any tasks were processed in this iteration
				anyTasksProcessedThisIteration = false;

				// Process scheduler-ready documents in deterministic order
				const dispatchState = await runAutoRunDispatchBatches(
					{
						scheduler: schedulerSnapshot,
						completedNodeContexts,
					},
					{
						maxClaims: (state) => {
							const readyNodes = state.scheduler.readyNodeIds
								.map((nodeId) => state.scheduler.nodes.find((node) => node.id === nodeId))
								.filter((node): node is AutoRunSchedulerNodeSnapshot => Boolean(node));
							return buildParallelDispatchPlan(
								readyNodes,
								Math.max(1, state.scheduler.maxParallelism || 1),
								isolatedWorktreeTargets,
								effectiveCwd
							).selectedNodeIds.length;
						},
						selectNodeIds: (readyNodes, maxClaims) =>
							buildParallelDispatchPlan(
								readyNodes,
								maxClaims,
								isolatedWorktreeTargets,
								effectiveCwd
							).selectedNodeIds,
						canContinue: () => !stopRequestedRefs.current[sessionId],
						dispatchBatch: async (claimResult) => {
							schedulerSnapshot = claimResult.scheduler;
							completedNodeContexts = claimResult.completedNodeContexts;

							if (claimResult.claims.length === 0) {
								return claimResult;
							}

							const dispatchPlan = buildParallelDispatchPlan(
								claimResult.claims.map((claim) => claim.node),
								claimResult.claims.length,
								isolatedWorktreeTargets,
								effectiveCwd
							);
							sharedCheckoutFallbackCount += dispatchPlan.warnings.length;
							for (const warning of dispatchPlan.warnings) {
								window.maestro.logger.log('warn', warning, 'BatchProcessor', {
									sessionId,
									playbookId,
								});
							}
							const executionBatch = await executeAutoRunDispatchClaims(
								{
									scheduler: claimResult.scheduler,
									completedNodeContexts: claimResult.completedNodeContexts,
								},
								claimResult.claims,
								(claim) => {
									const targetForClaim =
										claim.node.isolationMode === 'isolated-worktree'
											? (dispatchPlan.isolatedTargetsByNodeId[claim.nodeId] ?? null)
											: null;
									return processDispatchClaim(claim, claimResult.scheduler, targetForClaim).then(
										(result) => ({
											finalizeOptions: result?.finalizeOptions ?? {
												nodeId: claim.nodeId,
												documentName: documents[claim.node.documentIndex]?.filename ?? claim.nodeId,
												state: 'failed',
												summaries: [],
												success: false,
											},
											events: [],
											tasksCompleted: 0,
											inputTokens: 0,
											outputTokens: 0,
											totalCost: 0,
											countedCompletedTasks: 0,
											anyTasksProcessed: false,
										})
									);
								}
							);

							if (stopRequestedRefs.current[sessionId]) {
								return {
									scheduler: schedulerSnapshot,
									completedNodeContexts,
								};
							}

							schedulerSnapshot = executionBatch.state.scheduler;
							completedNodeContexts = executionBatch.state.completedNodeContexts;
							updateBatchStateAndBroadcastRef.current!(sessionId, (prev) => ({
								...prev,
								[sessionId]: {
									...prev[sessionId],
									scheduler: schedulerSnapshot,
								},
							}));

							return executionBatch.state;
						},
					}
				);
				schedulerSnapshot = dispatchState.scheduler;
				completedNodeContexts = dispatchState.completedNodeContexts;

				// Note: We no longer break immediately when a document stalls.
				// Individual documents that stall are skipped, and we continue processing other documents.
				// The stalledDocuments map tracks which documents stalled for the final summary.

				// Check if we should continue looping
				if (!loopEnabled) {
					// No loop mode - we're done after one pass
					// AUTORUN LOG: Exit (non-loop mode)
					window.maestro.logger.autorun(`Auto Run completed (single pass)`, session.name, {
						reason: 'Single pass completed',
						totalTasksCompleted: totalCompletedTasks,
						loopsCompleted: 1,
					});
					break;
				}

				// Check if we've hit the max loop limit
				if (maxLoops !== null && maxLoops !== undefined && loopIteration + 1 >= maxLoops) {
					addFinalLoopSummary(`Reached max loop limit (${maxLoops})`);
					break;
				}

				// Check for stop request after full pass
				if (stopRequestedRefs.current[sessionId]) {
					addFinalLoopSummary('Stopped by user');
					break;
				}

				// Safety check: if we didn't process ANY tasks this iteration, exit to avoid infinite loop
				if (!anyTasksProcessedThisIteration) {
					addFinalLoopSummary('No tasks processed this iteration');
					break;
				}

				// Loop mode: check if we should continue looping
				// Check if there are any non-reset documents in the playbook
				const hasAnyNonResetDocs = documents.some((doc) => !doc.resetOnCompletion);

				if (hasAnyNonResetDocs) {
					// If we have non-reset docs, only continue if they have remaining tasks
					let anyNonResetDocsHaveTasks = false;
					for (const doc of documents) {
						if (doc.resetOnCompletion) continue;

						const { taskCount } = await readDocAndCountTasks(folderPath, doc.filename, sshRemoteId);
						if (taskCount > 0) {
							anyNonResetDocsHaveTasks = true;
							break;
						}
					}

					if (!anyNonResetDocsHaveTasks) {
						addFinalLoopSummary('All tasks completed');
						break;
					}
				}
				// If all documents are reset docs, we continue looping (maxLoops check above will stop us)

				// Re-scan all documents to get fresh task counts for next loop (tasks may have been added/removed)
				let newTotalTasks = 0;
				for (const doc of documents) {
					const { taskCount } = await readDocAndCountTasks(folderPath, doc.filename, sshRemoteId);
					newTotalTasks += taskCount;
				}

				// Capture completed-loop metrics before resetting counters
				const completedLoopNumber = loopIteration + 1;
				const completedLoopTasks = loopTasksCompleted;

				// Calculate loop elapsed time
				const loopElapsedMs = Date.now() - loopStartTime;

				const observedExecution = summarizeAutoRunObservedExecution(schedulerSnapshot, {
					sharedCheckoutFallbackCount,
				});
				onAddHistoryEntry(
					buildAutoRunLoopSummaryEntry({
						timestamp: Date.now(),
						loopIteration,
						loopTasksCompleted: completedLoopTasks,
						loopElapsedMs,
						loopTotalInputTokens,
						loopTotalOutputTokens,
						loopTotalCost,
						projectPath: session.cwd,
						sessionId,
						isFinal: false,
						tasksDiscoveredForNextLoop: newTotalTasks,
						playbookId,
						playbookName,
						promptProfile,
						agentStrategy,
						worktreeMode,
						schedulerMode: observedExecution.observedSchedulerMode,
						configuredSchedulerMode: observedExecution.configuredSchedulerMode,
						actualParallelNodeCount: observedExecution.actualParallelNodeCount,
						sharedCheckoutFallbackCount: observedExecution.sharedCheckoutFallbackCount,
						blockedNodeCount: observedExecution.blockedNodeCount,
						skippedNodeCount: observedExecution.skippedNodeCount,
						schedulerOutcome: 'completed',
					})
				);
				speakAutoRunNarration(
					buildAutoRunLoopCompleteNarration(completedLoopNumber, completedLoopTasks, newTotalTasks)
				);

				// Reset per-loop tracking for next iteration
				loopStartTime = Date.now();
				loopTasksCompleted = 0;
				loopTotalInputTokens = 0;
				loopTotalOutputTokens = 0;
				loopTotalCost = 0;

				// AUTORUN LOG: Loop completion
				window.maestro.logger.autorun(`Loop ${completedLoopNumber} completed`, session.name, {
					loopNumber: completedLoopNumber,
					tasksCompleted: completedLoopTasks,
					tasksForNextLoop: newTotalTasks,
				});

				// Continue looping
				loopIteration++;

				updateBatchStateAndBroadcastRef.current!(sessionId, (prev) => ({
					...prev,
					[sessionId]: {
						...prev[sessionId],
						loopIteration,
						totalTasksAcrossAllDocs: newTotalTasks + prev[sessionId].completedTasksAcrossAllDocs,
						totalTasks: newTotalTasks + prev[sessionId].completedTasks,
					},
				}));
			}

			// Working copy approach: no cleanup needed
			// - Original documents are never modified
			// - Working copies in /Runs/ serve as audit logs and are kept
			// - User can delete them manually if desired

			// Create PR if worktree was used, PR creation is enabled, and not stopped
			const wasStopped = stopRequestedRefs.current[sessionId] || false;
			const sessionName = session.name || session.cwd.split('/').pop() || 'Unknown';
			if (
				worktreeActive &&
				worktree?.createPROnCompletion &&
				!wasStopped &&
				totalCompletedTasks > 0 &&
				worktreePath
			) {
				// For worktree-dispatched runs, the main repo is the parent session's cwd
				const mainRepoCwd = config.worktreeTarget
					? sessionsRef.current.find((s) => s.id === session.parentSessionId)?.cwd || session.cwd
					: session.cwd;

				const prResult = await worktreeManager.createPR({
					worktreePath,
					mainRepoCwd,
					worktree,
					documents,
					totalCompletedTasks,
				});

				if (onPRResult) {
					onPRResult({
						sessionId,
						sessionName,
						success: prResult.success,
						prUrl: prResult.prUrl,
						error: prResult.error,
					});
				}

				// Record PR result in history so it's visible in the worktree agent's history panel
				onAddHistoryEntry({
					type: 'AUTO',
					timestamp: Date.now(),
					summary: prResult.success
						? `PR created: ${prResult.prUrl}`
						: `PR creation failed: ${prResult.error || 'Unknown error'}`,
					fullResponse: prResult.success
						? `**Pull Request Created**\n\n- **URL:** ${prResult.prUrl}\n- **Branch:** \`${worktreeBranch}\`\n- **Target:** \`${prResult.targetBranch || 'unknown'}\`\n- **Tasks Completed:** ${totalCompletedTasks}`
						: `**Pull Request Creation Failed**\n\n- **Error:** ${prResult.error || 'Unknown error'}\n- **Branch:** \`${worktreeBranch}\`\n- **Target:** \`${prResult.targetBranch || 'unknown'}\``,
					projectPath: worktreePath,
					sessionId,
					success: prResult.success,
				});
			}

			// Add final Auto Run summary entry
			// Calculate visibility-aware elapsed time using the extracted time tracking hook
			// (excludes time when laptop was sleeping/suspended)
			const totalElapsedMs = timeTracking.getElapsedTime(sessionId);
			const loopsCompleted = loopEnabled ? loopIteration + 1 : 1;

			// Determine status based on stalled documents and completion
			const stalledCount = stalledDocuments.size;
			const allDocsStalled = stalledCount === documents.length;
			const someDocsStalled = stalledCount > 0 && stalledCount < documents.length;
			const statusText = wasStopped
				? 'stopped'
				: allDocsStalled
					? 'stalled'
					: someDocsStalled
						? 'completed with stalls'
						: 'completed';

			// Calculate achievement progress for the summary
			// Note: We use the stats BEFORE this run is recorded (the parent will call recordAutoRunComplete after)
			// So we need to add totalElapsedMs to get the projected cumulative time
			const projectedCumulativeTime = (autoRunStats?.cumulativeTimeMs || 0) + totalElapsedMs;
			const currentBadge = getBadgeForTime(projectedCumulativeTime);
			const nextBadge = getNextBadge(currentBadge);
			const levelProgressText = nextBadge
				? `Level ${currentBadge?.level || 0} → ${nextBadge.level}: ${formatTimeRemaining(projectedCumulativeTime, nextBadge)}`
				: currentBadge
					? `Level ${currentBadge.level} (${currentBadge.name}) - Maximum level achieved!`
					: 'Level 0 → 1: ' + formatTimeRemaining(0, getBadgeForTime(0));

			// Build summary with stall info if applicable
			const stalledSuffix = stalledCount > 0 ? ` (${stalledCount} stalled)` : '';
			const finalSummary = `Auto Run ${statusText}: ${totalCompletedTasks} task${totalCompletedTasks !== 1 ? 's' : ''} in ${formatElapsedTime(totalElapsedMs)}${stalledSuffix}`;

			// Build status message with detailed info
			let statusMessage: string;
			if (wasStopped) {
				statusMessage = 'Stopped by user';
			} else if (allDocsStalled) {
				statusMessage = `Stalled - All ${stalledCount} document(s) stopped making progress`;
			} else if (someDocsStalled) {
				statusMessage = `Completed with ${stalledCount} stalled document(s)`;
			} else {
				statusMessage = 'Completed';
			}

			// Build stalled documents section if any documents stalled
			const stalledDocsSection: string[] = [];
			if (stalledCount > 0) {
				stalledDocsSection.push('');
				stalledDocsSection.push('**Stalled Documents**');
				stalledDocsSection.push('');
				stalledDocsSection.push(
					'The following documents stopped making progress after multiple attempts:'
				);
				for (const [docName, reason] of stalledDocuments) {
					stalledDocsSection.push(`- **${docName}**: ${reason}`);
				}
				stalledDocsSection.push('');
				stalledDocsSection.push(
					'*Tasks in stalled documents may need manual review or clarification.*'
				);
			}

			const observedExecution = summarizeAutoRunObservedExecution(schedulerSnapshot, {
				sharedCheckoutFallbackCount,
			});
			const finalDetails = buildAutoRunTotalSummaryDetails({
				totalCompletedTasks,
				totalElapsedMs,
				loopsCompleted: loopEnabled ? loopsCompleted : undefined,
				totalInputTokens,
				totalOutputTokens,
				totalCost,
				statusMessage,
				observedSchedulerMode: observedExecution.observedSchedulerMode,
				configuredSchedulerMode: observedExecution.configuredSchedulerMode,
				actualParallelNodeCount: observedExecution.actualParallelNodeCount,
				sharedCheckoutFallbackCount: observedExecution.sharedCheckoutFallbackCount,
				blockedNodeCount: observedExecution.blockedNodeCount,
				skippedNodeCount: observedExecution.skippedNodeCount,
				documentsLine: `- **Documents:** ${documents.map((d) => d.filename).join(', ')}`,
				extraSections: [
					...stalledDocsSection,
					'',
					`**Achievement Progress**`,
					`- ${levelProgressText}`,
				],
			});

			// Success is true if not stopped and at least some documents completed without stalling
			const isSuccess = !wasStopped && !allDocsStalled;

			try {
				await onAddHistoryEntry({
					type: 'AUTO',
					timestamp: Date.now(),
					summary: finalSummary,
					fullResponse: finalDetails,
					projectPath: session.cwd,
					sessionId, // Include sessionId so the summary appears in session's history
					success: isSuccess,
					elapsedTimeMs: totalElapsedMs,
					usageStats: buildAutoRunAggregateUsageStats(
						totalInputTokens,
						totalOutputTokens,
						totalCost
					),
					playbookId,
					playbookName,
					promptProfile,
					agentStrategy,
					worktreeMode,
					schedulerMode: observedExecution.observedSchedulerMode,
					configuredSchedulerMode: observedExecution.configuredSchedulerMode,
					actualParallelNodeCount: observedExecution.actualParallelNodeCount,
					sharedCheckoutFallbackCount: observedExecution.sharedCheckoutFallbackCount,
					blockedNodeCount: observedExecution.blockedNodeCount,
					skippedNodeCount: observedExecution.skippedNodeCount,
					schedulerOutcome: isSuccess ? 'completed' : 'failed',
					queueWaitMs: totalQueueWaitMs,
					retryCount: totalRetryCount,
					timedOut: autoRunTimedOut,
					achievementAction: 'openAbout', // Enable clickable link to achievements panel
				});
			} catch {
				// Ignore history errors
			}

			// End stats tracking for this Auto Run session
			if (statsAutoRunId) {
				try {
					const sessionSchedulerOutcome =
						!wasStopped && !allDocsStalled ? 'completed' : autoRunTimedOut ? 'timed_out' : 'failed';
					await window.maestro.stats.endAutoRun(
						statsAutoRunId,
						totalElapsedMs,
						totalCompletedTasks,
						{
							verifierVerdict: autoRunVerifierVerdict ?? undefined,
							schedulerMode: observedExecution.observedSchedulerMode,
							configuredSchedulerMode: observedExecution.configuredSchedulerMode,
							actualParallelNodeCount: observedExecution.actualParallelNodeCount,
							sharedCheckoutFallbackCount: observedExecution.sharedCheckoutFallbackCount,
							blockedNodeCount: observedExecution.blockedNodeCount,
							skippedNodeCount: observedExecution.skippedNodeCount,
							schedulerOutcome: sessionSchedulerOutcome,
							queueWaitMs: totalQueueWaitMs,
							retryCount: totalRetryCount,
							timedOut: autoRunTimedOut,
						}
					);
				} catch (statsError) {
					// Don't fail cleanup if stats tracking fails
					console.warn('[BatchProcessor] Failed to end stats tracking:', statsError);
				}
			}

			// Critical: Always flush debounced updates and dispatch COMPLETE_BATCH to clean up state.
			// These operations are safe regardless of mount state - React handles reducer dispatches gracefully,
			// and broadcasts are external calls that don't affect React state.
			console.log(
				'[BatchProcessor:startBatchRun] Flushing debounced updates before COMPLETE_BATCH'
			);
			flushDebouncedUpdate(sessionId);

			// Reset state for this session using COMPLETE_BATCH action
			// (not updateBatchStateAndBroadcast which only supports UPDATE_PROGRESS)
			dispatch({
				type: 'COMPLETE_BATCH',
				sessionId,
				finalSessionIds: agentSessionIds,
			});
			// Broadcast state change to web clients
			broadcastAutoRunState(sessionId, null);

			// Call completion callback if provided (only if still mounted to avoid warnings)
			if (isMountedRef.current && onComplete) {
				onComplete({
					sessionId,
					sessionName: session.name || session.cwd.split('/').pop() || 'Unknown',
					completedTasks: totalCompletedTasks,
					totalTasks: initialTotalTasks,
					wasStopped,
					elapsedTimeMs: totalElapsedMs,
					inputTokens: totalInputTokens,
					outputTokens: totalOutputTokens,
					totalCostUsd: totalCost,
					documentsProcessed: documents.length,
				});
			}

			// Process any queued items that were waiting during batch run
			// This ensures pending user messages are processed after Auto Run ends
			if (isMountedRef.current && onProcessQueueAfterCompletion) {
				// Use setTimeout to let state updates settle before processing queue
				setTimeout(() => {
					onProcessQueueAfterCompletion(sessionId);
				}, 0);
			}

			// Clean up time tracking, error resolution, and stop request flag
			// Clearing stopRequestedRefs here (not just at start) ensures proper cleanup
			// regardless of how the batch ended (normal completion, stopped, or error)
			// Note: These cleanup operations are safe even after unmount (they only affect refs)
			timeTracking.stopTracking(sessionId);
			delete errorResolutionRefs.current[sessionId];
			delete stopRequestedRefs.current[sessionId];

			// Allow system to sleep now that Auto Run is complete
			window.maestro.power.removeReason(`autorun:${sessionId}`);
			// Note: updateBatchStateAndBroadcast is accessed via ref to avoid stale closure in long-running async
			// flushDebouncedUpdate is stable (empty deps in useSessionDebounce) so adding it doesn't cause re-renders
		},
		// Note: audioFeedbackEnabled/audioFeedbackCommand removed from deps - we use refs
		// to allow mid-run setting changes to take effect immediately
		[
			onUpdateSession,
			onSpawnAgent,
			onAddHistoryEntry,
			onComplete,
			onPRResult,
			timeTracking,
			onProcessQueueAfterCompletion,
			flushDebouncedUpdate,
			speakAutoRunNarration,
		]
	);

	/**
	 * Request to stop the batch run for a specific session after current task completes
	 * Note: No isMountedRef check here - stop requests should always be honored.
	 * All operations are safe: ref updates, reducer dispatch (React handles gracefully), and broadcasts.
	 */
	const stopBatchRun = useCallback(
		(sessionId: string) => {
			console.log('[BatchProcessor:stopBatchRun] Called with sessionId:', sessionId);
			stopRequestedRefs.current[sessionId] = true;
			const errorResolution = errorResolutionRefs.current[sessionId];
			if (errorResolution) {
				errorResolution.resolve('abort');
				delete errorResolutionRefs.current[sessionId];
			}
			// Use SET_STOPPING action directly (not updateBatchStateAndBroadcast which only supports UPDATE_PROGRESS)
			dispatch({ type: 'SET_STOPPING', sessionId });
			// Broadcast state change
			const newState = useBatchStore.getState().batchRunStates[sessionId];
			if (newState) {
				broadcastAutoRunState(sessionId, { ...newState, isStopping: true });
			}
		},
		[broadcastAutoRunState]
	);

	/**
	 * Force kill the running process and immediately end the batch run.
	 * Unlike stopBatchRun (which waits for the current task to complete),
	 * this terminates the agent process immediately and resets all batch state.
	 */
	const killBatchRun = useCallback(
		async (sessionId: string) => {
			console.log('[BatchProcessor:killBatchRun] Force killing session:', sessionId);

			// 1. Kill the agent process and wait for termination before cleaning up state
			try {
				await window.maestro.process.kill(sessionId);
			} catch (error) {
				console.error('[BatchProcessor:killBatchRun] Failed to kill process:', error);
			}

			// 2. Set stop flag so the processing loop exits if it's still running
			stopRequestedRefs.current[sessionId] = true;

			// 3. Resolve any pending error state
			const errorResolution = errorResolutionRefs.current[sessionId];
			if (errorResolution) {
				errorResolution.resolve('abort');
				delete errorResolutionRefs.current[sessionId];
			}

			// 4. Flush any debounced state updates
			flushDebouncedUpdate(sessionId);

			// 5. Immediately reset batch state
			dispatch({
				type: 'COMPLETE_BATCH',
				sessionId,
				finalSessionIds: [],
			});

			// 6. Broadcast cleared state to web clients
			broadcastAutoRunState(sessionId, null);

			// 7. Clean up tracking
			timeTracking.stopTracking(sessionId);
			delete stopRequestedRefs.current[sessionId];

			// 8. Allow system to sleep
			window.maestro.power.removeReason(`autorun:${sessionId}`);
		},
		[broadcastAutoRunState, flushDebouncedUpdate, timeTracking]
	);

	/**
	 * Pause the batch run due to an agent error (Phase 5.10)
	 * Called externally when agent error is detected
	 */
	const pauseBatchOnError = useCallback(
		(sessionId: string, error: AgentError, documentIndex: number, taskDescription?: string) => {
			if (!isMountedRef.current) return;

			// Log detailed error to system logs with full context
			window.maestro.logger.autorun(
				`Auto Run paused due to ${error.type}: ${error.message}`,
				sessionId,
				{
					errorType: error.type,
					errorMessage: error.message,
					recoverable: error.recoverable,
					documentIndex,
					taskDescription,
					rawError: error.raw,
				}
			);

			// Use SET_ERROR action directly (not updateBatchStateAndBroadcast which only supports UPDATE_PROGRESS)
			dispatch({
				type: 'SET_ERROR',
				sessionId,
				payload: { error, documentIndex, taskDescription },
			});
			// Broadcast state change
			const currentState = useBatchStore.getState().batchRunStates[sessionId];
			if (currentState) {
				broadcastAutoRunState(sessionId, {
					...currentState,
					error,
					errorPaused: true,
					errorDocumentIndex: documentIndex,
					errorTaskDescription: taskDescription,
				});
			}

			if (!errorResolutionRefs.current[sessionId]) {
				let resolvePromise: ((action: ErrorResolutionAction) => void) | undefined;
				const promise = new Promise<ErrorResolutionAction>((resolve) => {
					resolvePromise = resolve;
				});
				errorResolutionRefs.current[sessionId] = {
					promise,
					resolve: resolvePromise as (action: ErrorResolutionAction) => void,
				};
			}
		},
		[broadcastAutoRunState]
	);

	/**
	 * Skip the current document that caused an error and continue with the next one (Phase 5.10)
	 */
	const skipCurrentDocument = useCallback(
		(sessionId: string) => {
			if (!isMountedRef.current) return;

			window.maestro.logger.autorun(`Skipping document after error`, sessionId, {});

			// Use CLEAR_ERROR action directly (not updateBatchStateAndBroadcast which only supports UPDATE_PROGRESS)
			dispatch({ type: 'CLEAR_ERROR', sessionId });
			// Broadcast state change
			const currentState = useBatchStore.getState().batchRunStates[sessionId];
			if (currentState) {
				broadcastAutoRunState(sessionId, {
					...currentState,
					error: undefined,
					errorPaused: false,
					errorDocumentIndex: undefined,
					errorTaskDescription: undefined,
				});
			}

			const errorResolution = errorResolutionRefs.current[sessionId];
			if (errorResolution) {
				errorResolution.resolve('skip-document');
				delete errorResolutionRefs.current[sessionId];
			}

			// Signal to skip the current document in the processing loop
		},
		[broadcastAutoRunState]
	);

	/**
	 * Resume the batch run after an error has been resolved (Phase 5.10)
	 * This clears the error state and allows the batch to continue
	 */
	const resumeAfterError = useCallback(
		(sessionId: string) => {
			if (!isMountedRef.current) return;

			window.maestro.logger.autorun(`Resuming Auto Run after error resolution`, sessionId, {});

			// Use CLEAR_ERROR action directly (not updateBatchStateAndBroadcast which only supports UPDATE_PROGRESS)
			dispatch({ type: 'CLEAR_ERROR', sessionId });
			// Broadcast state change
			const currentState = useBatchStore.getState().batchRunStates[sessionId];
			if (currentState) {
				broadcastAutoRunState(sessionId, {
					...currentState,
					error: undefined,
					errorPaused: false,
					errorDocumentIndex: undefined,
					errorTaskDescription: undefined,
				});
			}

			const errorResolution = errorResolutionRefs.current[sessionId];
			if (errorResolution) {
				errorResolution.resolve('resume');
				delete errorResolutionRefs.current[sessionId];
			}
		},
		[broadcastAutoRunState]
	);

	/**
	 * Abort the batch run completely due to an unrecoverable error (Phase 5.10)
	 */
	const abortBatchOnError = useCallback(
		(sessionId: string) => {
			if (!isMountedRef.current) return;

			window.maestro.logger.autorun(`Auto Run aborted due to error`, sessionId, {});

			// Request stop and clear error state
			stopRequestedRefs.current[sessionId] = true;
			const errorResolution = errorResolutionRefs.current[sessionId];
			if (errorResolution) {
				errorResolution.resolve('abort');
				delete errorResolutionRefs.current[sessionId];
			}
			updateBatchStateAndBroadcast(
				sessionId,
				(prev) => ({
					...prev,
					[sessionId]: {
						...prev[sessionId],
						isStopping: true,
						error: undefined,
						errorPaused: false,
						errorDocumentIndex: undefined,
						errorTaskDescription: undefined,
					},
				}),
				true
			); // immediate: critical state change (aborting)
		},
		[updateBatchStateAndBroadcast]
	);

	return {
		batchRunStates,
		getBatchState,
		hasAnyActiveBatch,
		activeBatchSessionIds,
		stoppingBatchSessionIds,
		startBatchRun,
		stopBatchRun,
		killBatchRun,
		customPrompts,
		setCustomPrompt,
		// Error handling (Phase 5.10)
		pauseBatchOnError,
		skipCurrentDocument,
		resumeAfterError,
		abortBatchOnError,
	};
}

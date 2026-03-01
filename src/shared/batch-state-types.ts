/**
 * Shared types for batch state persistence.
 *
 * Used by both the main process IPC handlers and the preload bridge
 * to ensure the persisted batch state shape stays in sync.
 */

/**
 * Shape of the persisted batch run state.
 * This is a subset of BatchRunState — only the fields needed for recovery.
 */
export interface PersistedBatchRunState {
	sessionId: string;
	isRunning: boolean;
	processingState: string;
	documents: string[];
	lockedDocuments: string[];
	currentDocumentIndex: number;
	currentDocTasksTotal: number;
	currentDocTasksCompleted: number;
	totalTasksAcrossAllDocs: number;
	completedTasksAcrossAllDocs: number;
	loopEnabled: boolean;
	loopIteration: number;
	maxLoops?: number | null;
	folderPath: string;
	worktreeActive: boolean;
	worktreePath?: string;
	worktreeBranch?: string;
	customPrompt?: string;
	startTime?: number;
	cumulativeTaskTimeMs?: number;
	accumulatedElapsedMs?: number;
	lastActiveTimestamp?: number;
	/** Agent session ID for resume (Claude session_id, Codex thread_id) */
	agentSessionId?: string;
	/** Agent type (claude-code, codex, etc.) — needed to build correct resume args */
	agentType?: string;
}

export interface PersistedBatchSnapshot {
	timestamp: number;
	activeBatches: PersistedBatchRunState[];
}

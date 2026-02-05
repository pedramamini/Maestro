/**
 * Preload API for Director's Notes operations
 *
 * Provides the window.maestro.directorNotes namespace for:
 * - Unified history aggregation across all sessions
 * - Token estimation for synopsis generation
 * - AI synopsis generation
 */

import { ipcRenderer } from 'electron';

/**
 * Options for fetching unified history
 */
export interface UnifiedHistoryOptions {
	lookbackDays: number;
	filter?: 'AUTO' | 'USER' | null; // null = both
}

/**
 * A history entry augmented with source session info
 */
export interface UnifiedHistoryEntry {
	id: string;
	type: 'AUTO' | 'USER';
	timestamp: number;
	summary: string;
	fullResponse?: string;
	agentSessionId?: string;
	sessionName?: string;
	projectPath: string;
	sessionId?: string;
	contextUsage?: number;
	success?: boolean;
	elapsedTimeMs?: number;
	validated?: boolean;
	agentName?: string;
	sourceSessionId: string;
}

/**
 * Options for synopsis generation
 */
export interface SynopsisOptions {
	lookbackDays: number;
	provider: 'claude-code' | 'codex' | 'opencode';
}

/**
 * Result of synopsis generation
 */
export interface SynopsisResult {
	success: boolean;
	synopsis: string;
	error?: string;
}

/**
 * Creates the Director's Notes API object for preload exposure
 */
export function createDirectorNotesApi() {
	return {
		// Get unified history across all sessions within a time range
		getUnifiedHistory: (options: UnifiedHistoryOptions): Promise<UnifiedHistoryEntry[]> =>
			ipcRenderer.invoke('director-notes:getUnifiedHistory', options),

		// Estimate tokens for a set of history entries
		estimateTokens: (entries: UnifiedHistoryEntry[]): Promise<number> =>
			ipcRenderer.invoke('director-notes:estimateTokens', entries),

		// Generate AI synopsis (placeholder until Phase 07)
		generateSynopsis: (options: SynopsisOptions): Promise<SynopsisResult> =>
			ipcRenderer.invoke('director-notes:generateSynopsis', options),
	};
}

export type DirectorNotesApi = ReturnType<typeof createDirectorNotesApi>;

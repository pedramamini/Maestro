/**
 * Preload API for stats operations
 *
 * Provides the window.maestro.stats namespace for:
 * - Usage tracking and analytics
 * - Query event recording
 * - Auto Run session tracking
 */

import { ipcRenderer } from 'electron';

/**
 * Query event for recording
 */
export interface QueryEvent {
	sessionId: string;
	agentType: string;
	source: 'user' | 'auto';
	startTime: number;
	duration: number;
	projectPath?: string;
	tabId?: string;
	isRemote?: boolean;
}

/**
 * Auto Run session for recording
 */
export interface AutoRunSession {
	sessionId: string;
	agentType: string;
	documentPath?: string;
	startTime: number;
	tasksTotal?: number;
	projectPath?: string;
}

/**
 * Auto Run task for recording
 */
export interface AutoRunTask {
	autoRunSessionId: string;
	sessionId: string;
	agentType: string;
	taskIndex: number;
	taskContent?: string;
	startTime: number;
	duration: number;
	success: boolean;
}

/**
 * Session lifecycle event
 */
export interface SessionCreatedEvent {
	sessionId: string;
	agentType: string;
	projectPath?: string;
	createdAt: number;
	isRemote?: boolean;
}

/**
 * Window event types
 */
export type WindowEventType = 'created' | 'closed' | 'session_moved';

/**
 * Window created event input
 */
export interface WindowCreatedEvent {
	windowId: string;
	isPrimary: boolean;
	windowCount: number;
}

/**
 * Window closed event input
 */
export interface WindowClosedEvent {
	windowId: string;
	isPrimary: boolean;
	windowCount: number;
}

/**
 * Session moved event input
 */
export interface SessionMovedEvent {
	sessionId: string;
	sourceWindowId: string;
	destWindowId: string;
	windowCount: number;
}

/**
 * Window stats aggregation result
 */
export interface WindowStatsAggregation {
	totalWindowsCreated: number;
	totalSessionMoves: number;
	peakConcurrentWindows: number;
	windowsByDay: Array<{ date: string; created: number; closed: number }>;
	avgSessionMovesPerWindow: number;
}

/**
 * Aggregation result
 */
export interface StatsAggregation {
	totalQueries: number;
	totalDuration: number;
	avgDuration: number;
	byAgent: Record<string, { count: number; duration: number }>;
	bySource: { user: number; auto: number };
	byDay: Array<{ date: string; count: number; duration: number }>;
}

/**
 * Creates the Stats API object for preload exposure
 */
export function createStatsApi() {
	return {
		// Record a query event (interactive conversation turn)
		recordQuery: (event: QueryEvent): Promise<string> =>
			ipcRenderer.invoke('stats:record-query', event),

		// Start an Auto Run session (returns session ID)
		startAutoRun: (session: AutoRunSession): Promise<string> =>
			ipcRenderer.invoke('stats:start-autorun', session),

		// End an Auto Run session (update duration and completed count)
		endAutoRun: (id: string, duration: number, tasksCompleted: number): Promise<boolean> =>
			ipcRenderer.invoke('stats:end-autorun', id, duration, tasksCompleted),

		// Record an Auto Run task completion
		recordAutoTask: (task: AutoRunTask): Promise<string> =>
			ipcRenderer.invoke('stats:record-task', task),

		// Get query events with time range and optional filters
		getStats: (
			range: 'day' | 'week' | 'month' | 'year' | 'all',
			filters?: {
				agentType?: string;
				source?: 'user' | 'auto';
				projectPath?: string;
				sessionId?: string;
			}
		): Promise<
			Array<{
				id: string;
				sessionId: string;
				agentType: string;
				source: 'user' | 'auto';
				startTime: number;
				duration: number;
				projectPath?: string;
				tabId?: string;
			}>
		> => ipcRenderer.invoke('stats:get-stats', range, filters),

		// Get Auto Run sessions within a time range
		getAutoRunSessions: (
			range: 'day' | 'week' | 'month' | 'year' | 'all'
		): Promise<
			Array<{
				id: string;
				sessionId: string;
				agentType: string;
				documentPath?: string;
				startTime: number;
				duration: number;
				tasksTotal?: number;
				tasksCompleted?: number;
				projectPath?: string;
			}>
		> => ipcRenderer.invoke('stats:get-autorun-sessions', range),

		// Get tasks for a specific Auto Run session
		getAutoRunTasks: (
			autoRunSessionId: string
		): Promise<
			Array<{
				id: string;
				autoRunSessionId: string;
				sessionId: string;
				agentType: string;
				taskIndex: number;
				taskContent?: string;
				startTime: number;
				duration: number;
				success: boolean;
			}>
		> => ipcRenderer.invoke('stats:get-autorun-tasks', autoRunSessionId),

		// Get aggregated stats for dashboard display
		getAggregation: (range: 'day' | 'week' | 'month' | 'year' | 'all'): Promise<StatsAggregation> =>
			ipcRenderer.invoke('stats:get-aggregation', range),

		// Export query events to CSV
		exportCsv: (range: 'day' | 'week' | 'month' | 'year' | 'all'): Promise<string> =>
			ipcRenderer.invoke('stats:export-csv', range),

		// Subscribe to stats updates (for real-time dashboard refresh)
		onStatsUpdate: (callback: () => void) => {
			const handler = () => callback();
			ipcRenderer.on('stats:updated', handler);
			return () => ipcRenderer.removeListener('stats:updated', handler);
		},

		// Clear old stats data (older than specified number of days)
		clearOldData: (
			olderThanDays: number
		): Promise<{
			success: boolean;
			deletedQueryEvents: number;
			deletedAutoRunSessions: number;
			deletedAutoRunTasks: number;
			error?: string;
		}> => ipcRenderer.invoke('stats:clear-old-data', olderThanDays),

		// Get database size in bytes
		getDatabaseSize: (): Promise<number> => ipcRenderer.invoke('stats:get-database-size'),

		// Record session creation (for lifecycle tracking)
		recordSessionCreated: (event: SessionCreatedEvent): Promise<string | null> =>
			ipcRenderer.invoke('stats:record-session-created', event),

		// Record session closure (for lifecycle tracking)
		recordSessionClosed: (sessionId: string, closedAt: number): Promise<boolean> =>
			ipcRenderer.invoke('stats:record-session-closed', sessionId, closedAt),

		// Get session lifecycle events within a time range
		getSessionLifecycle: (
			range: 'day' | 'week' | 'month' | 'year' | 'all'
		): Promise<
			Array<{
				id: string;
				sessionId: string;
				agentType: string;
				projectPath?: string;
				createdAt: number;
				closedAt?: number;
				duration?: number;
				isRemote?: boolean;
			}>
		> => ipcRenderer.invoke('stats:get-session-lifecycle', range),

		// =========================================================================
		// Window Events (Multi-window analytics)
		// =========================================================================

		// Record a window being created
		recordWindowCreated: (event: WindowCreatedEvent): Promise<string | null> =>
			ipcRenderer.invoke('stats:record-window-created', event),

		// Record a window being closed
		recordWindowClosed: (event: WindowClosedEvent): Promise<string | null> =>
			ipcRenderer.invoke('stats:record-window-closed', event),

		// Record a session being moved between windows
		recordSessionMoved: (event: SessionMovedEvent): Promise<string | null> =>
			ipcRenderer.invoke('stats:record-session-moved', event),

		// Get window events within a time range
		getWindowEvents: (
			range: 'day' | 'week' | 'month' | 'year' | 'all',
			eventType?: WindowEventType
		): Promise<
			Array<{
				id: string;
				eventType: WindowEventType;
				windowId: string;
				isPrimary: boolean;
				timestamp: number;
				sessionId?: string;
				sourceWindowId?: string;
				destWindowId?: string;
				windowCount: number;
			}>
		> => ipcRenderer.invoke('stats:get-window-events', range, eventType),

		// Get window stats aggregation
		getWindowStats: (
			range: 'day' | 'week' | 'month' | 'year' | 'all'
		): Promise<WindowStatsAggregation> => ipcRenderer.invoke('stats:get-window-stats', range),
	};
}

export type StatsApi = ReturnType<typeof createStatsApi>;

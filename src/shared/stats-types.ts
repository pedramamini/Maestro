/**
 * Type definitions for the stats tracking system
 *
 * These types are shared between main process (stats/) and renderer (dashboard).
 */

/**
 * A single AI query event - represents one user/auto message -> AI response cycle
 */
export interface QueryEvent {
	id: string;
	sessionId: string;
	agentType: string;
	source: 'user' | 'auto';
	startTime: number;
	duration: number;
	projectPath?: string;
	tabId?: string;
	/** Whether this query was executed on a remote SSH session */
	isRemote?: boolean;
}

/**
 * An Auto Run session - a complete batch processing run of a document
 */
export interface AutoRunSession {
	id: string;
	sessionId: string;
	agentType: string;
	documentPath?: string;
	startTime: number;
	duration: number;
	tasksTotal?: number;
	tasksCompleted?: number;
	projectPath?: string;
}

/**
 * A single task within an Auto Run session
 */
export interface AutoRunTask {
	id: string;
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
 * Session lifecycle event - tracks when sessions are created and closed
 */
export interface SessionLifecycleEvent {
	id: string;
	sessionId: string;
	agentType: string;
	projectPath?: string;
	createdAt: number;
	closedAt?: number;
	/** Duration in ms (computed from closedAt - createdAt when session is closed) */
	duration?: number;
	/** Whether this was a remote SSH session */
	isRemote?: boolean;
}

/**
 * Window event types for multi-window analytics
 */
export type WindowEventType = 'created' | 'closed' | 'session_moved';

/**
 * Window event - tracks multi-window usage patterns
 */
export interface WindowEvent {
	id: string;
	/** The type of window event */
	eventType: WindowEventType;
	/** Window ID (primary or secondary window identifier) */
	windowId: string;
	/** Whether this is the primary window */
	isPrimary: boolean;
	/** Event timestamp */
	timestamp: number;
	/** For session_moved events: the session that was moved */
	sessionId?: string;
	/** For session_moved events: the source window ID */
	sourceWindowId?: string;
	/** For session_moved events: the destination window ID */
	destWindowId?: string;
	/** Current total window count at time of event */
	windowCount: number;
}

/**
 * Time range for querying stats
 */
export type StatsTimeRange = 'day' | 'week' | 'month' | 'year' | 'all';

/**
 * Aggregated stats for dashboard display
 */
export interface StatsAggregation {
	totalQueries: number;
	totalDuration: number;
	avgDuration: number;
	byAgent: Record<string, { count: number; duration: number }>;
	bySource: { user: number; auto: number };
	byDay: Array<{ date: string; count: number; duration: number }>;
	/** Breakdown by session location (local vs SSH remote) */
	byLocation: { local: number; remote: number };
	/** Breakdown by hour of day (0-23) for peak hours chart */
	byHour: Array<{ hour: number; count: number; duration: number }>;
	/** Total unique sessions launched in the time period */
	totalSessions: number;
	/** Sessions by agent type */
	sessionsByAgent: Record<string, number>;
	/** Sessions launched per day */
	sessionsByDay: Array<{ date: string; count: number }>;
	/** Average session duration in ms (for closed sessions) */
	avgSessionDuration: number;
	/** Queries and duration by provider per day (for provider comparison) */
	byAgentByDay: Record<string, Array<{ date: string; count: number; duration: number }>>;
	/** Queries and duration by Maestro session per day (for agent usage chart) */
	bySessionByDay: Record<string, Array<{ date: string; count: number; duration: number }>>;
	/** Multi-window usage statistics */
	windowStats?: {
		/** Total number of secondary windows created in the time period */
		totalWindowsCreated: number;
		/** Total number of session moves between windows */
		totalSessionMoves: number;
		/** Peak concurrent window count observed */
		peakConcurrentWindows: number;
		/** Windows created by day */
		windowsByDay: Array<{ date: string; created: number; closed: number }>;
		/** Average session moves per window */
		avgSessionMovesPerWindow: number;
	};
}

/**
 * Filters for querying stats
 */
export interface StatsFilters {
	agentType?: string;
	source?: 'user' | 'auto';
	projectPath?: string;
	sessionId?: string;
}

/**
 * Database schema version for migrations
 */
export const STATS_DB_VERSION = 4;

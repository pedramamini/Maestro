/**
 * Window Events CRUD Operations
 *
 * Tracks multi-window usage patterns including window creation,
 * closure, and session moves between windows.
 */

import type Database from 'better-sqlite3';
import type { WindowEvent, WindowEventType, StatsTimeRange } from '../../shared/stats-types';
import { generateId, getTimeRangeStart, LOG_CONTEXT } from './utils';
import { mapWindowEventRow, type WindowEventRow } from './row-mappers';
import { StatementCache } from './utils';
import { logger } from '../utils/logger';

const stmtCache = new StatementCache();

const INSERT_SQL = `
  INSERT INTO window_events (id, event_type, window_id, is_primary, timestamp, session_id, source_window_id, dest_window_id, window_count)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

/**
 * Input for recording a window creation event
 */
export interface WindowCreatedInput {
	windowId: string;
	isPrimary: boolean;
	windowCount: number;
}

/**
 * Input for recording a window close event
 */
export interface WindowClosedInput {
	windowId: string;
	isPrimary: boolean;
	windowCount: number;
}

/**
 * Input for recording a session move between windows
 */
export interface SessionMovedInput {
	sessionId: string;
	sourceWindowId: string;
	destWindowId: string;
	windowCount: number;
}

/**
 * Record a window being created
 */
export function recordWindowCreated(db: Database.Database, input: WindowCreatedInput): string {
	const id = generateId();
	const stmt = stmtCache.get(db, INSERT_SQL);

	stmt.run(
		id,
		'created' as WindowEventType,
		input.windowId,
		input.isPrimary ? 1 : 0,
		Date.now(),
		null, // session_id
		null, // source_window_id
		null, // dest_window_id
		input.windowCount
	);

	logger.debug(`Recorded window created: ${input.windowId}`, LOG_CONTEXT);
	return id;
}

/**
 * Record a window being closed
 */
export function recordWindowClosed(db: Database.Database, input: WindowClosedInput): string {
	const id = generateId();
	const stmt = stmtCache.get(db, INSERT_SQL);

	stmt.run(
		id,
		'closed' as WindowEventType,
		input.windowId,
		input.isPrimary ? 1 : 0,
		Date.now(),
		null, // session_id
		null, // source_window_id
		null, // dest_window_id
		input.windowCount
	);

	logger.debug(`Recorded window closed: ${input.windowId}`, LOG_CONTEXT);
	return id;
}

/**
 * Record a session being moved between windows
 */
export function recordSessionMoved(db: Database.Database, input: SessionMovedInput): string {
	const id = generateId();
	const stmt = stmtCache.get(db, INSERT_SQL);

	stmt.run(
		id,
		'session_moved' as WindowEventType,
		input.destWindowId, // window_id is the destination
		0, // is_primary - use 0 since moves involve secondary windows
		Date.now(),
		input.sessionId,
		input.sourceWindowId,
		input.destWindowId,
		input.windowCount
	);

	logger.debug(
		`Recorded session moved: ${input.sessionId} from ${input.sourceWindowId} to ${input.destWindowId}`,
		LOG_CONTEXT
	);
	return id;
}

/**
 * Get window events within a time range
 */
export function getWindowEvents(
	db: Database.Database,
	range: StatsTimeRange,
	eventType?: WindowEventType
): WindowEvent[] {
	const startTime = getTimeRangeStart(range);

	if (eventType) {
		const stmt = stmtCache.get(
			db,
			`
        SELECT * FROM window_events
        WHERE timestamp >= ? AND event_type = ?
        ORDER BY timestamp DESC
      `
		);
		const rows = stmt.all(startTime, eventType) as WindowEventRow[];
		return rows.map(mapWindowEventRow);
	}

	const stmt = stmtCache.get(
		db,
		`
      SELECT * FROM window_events
      WHERE timestamp >= ?
      ORDER BY timestamp DESC
    `
	);

	const rows = stmt.all(startTime) as WindowEventRow[];
	return rows.map(mapWindowEventRow);
}

/**
 * Get aggregated window statistics for a time range
 */
export function getWindowStatsAggregation(
	db: Database.Database,
	range: StatsTimeRange
): {
	totalWindowsCreated: number;
	totalSessionMoves: number;
	peakConcurrentWindows: number;
	windowsByDay: Array<{ date: string; created: number; closed: number }>;
	avgSessionMovesPerWindow: number;
} {
	const startTime = getTimeRangeStart(range);

	// Count windows created (excluding primary window)
	const createdStmt = stmtCache.get(
		db,
		`
      SELECT COUNT(*) as count FROM window_events
      WHERE timestamp >= ? AND event_type = 'created' AND is_primary = 0
    `
	);
	const createdResult = createdStmt.get(startTime) as { count: number };
	const totalWindowsCreated = createdResult?.count ?? 0;

	// Count session moves
	const movesStmt = stmtCache.get(
		db,
		`
      SELECT COUNT(*) as count FROM window_events
      WHERE timestamp >= ? AND event_type = 'session_moved'
    `
	);
	const movesResult = movesStmt.get(startTime) as { count: number };
	const totalSessionMoves = movesResult?.count ?? 0;

	// Find peak concurrent windows (max window_count in the time range)
	const peakStmt = stmtCache.get(
		db,
		`
      SELECT MAX(window_count) as peak FROM window_events
      WHERE timestamp >= ?
    `
	);
	const peakResult = peakStmt.get(startTime) as { peak: number | null };
	const peakConcurrentWindows = peakResult?.peak ?? 1;

	// Get windows created/closed by day
	const byDayStmt = stmtCache.get(
		db,
		`
      SELECT
        date(timestamp / 1000, 'unixepoch', 'localtime') as date,
        SUM(CASE WHEN event_type = 'created' AND is_primary = 0 THEN 1 ELSE 0 END) as created,
        SUM(CASE WHEN event_type = 'closed' AND is_primary = 0 THEN 1 ELSE 0 END) as closed
      FROM window_events
      WHERE timestamp >= ?
      GROUP BY date(timestamp / 1000, 'unixepoch', 'localtime')
      ORDER BY date ASC
    `
	);
	const byDayRows = byDayStmt.all(startTime) as Array<{
		date: string;
		created: number;
		closed: number;
	}>;
	const windowsByDay = byDayRows.map((row) => ({
		date: row.date,
		created: row.created ?? 0,
		closed: row.closed ?? 0,
	}));

	// Calculate average session moves per window
	const avgSessionMovesPerWindow =
		totalWindowsCreated > 0 ? totalSessionMoves / totalWindowsCreated : 0;

	return {
		totalWindowsCreated,
		totalSessionMoves,
		peakConcurrentWindows,
		windowsByDay,
		avgSessionMovesPerWindow,
	};
}

/**
 * Clear the statement cache (call when database is closed)
 */
export function clearWindowEventsCache(): void {
	stmtCache.clear();
}

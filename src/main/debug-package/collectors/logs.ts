/**
 * Logs Collector
 *
 * Collects recent system logs from the logger.
 * These are system/application logs, not conversation logs.
 * Log messages are sanitized to remove embedded paths and truncate
 * long messages that may contain prompts or conversation content.
 * The raw `data` field is dropped entirely to prevent leaking sensitive objects.
 */

import { logger, LogEntry } from '../../utils/logger';
import { sanitizeLogMessage } from './sanitize';

export interface SanitizedLogEntry {
	timestamp: number;
	level: string;
	message: string;
	context?: string;
}

export interface LogsInfo {
	totalEntries: number;
	includedEntries: number;
	byLevel: Record<string, number>;
	entries: SanitizedLogEntry[];
}

/**
 * Sanitize a log entry for inclusion in the debug package.
 * Strips embedded paths, truncates long messages, and drops raw data.
 */
function sanitizeEntry(entry: LogEntry): SanitizedLogEntry {
	return {
		timestamp: entry.timestamp,
		level: entry.level,
		message: sanitizeLogMessage(entry.message),
		context: entry.context,
	};
}

/**
 * Collect recent system logs.
 * @param limit Maximum number of log entries to include (default: 500)
 */
export function collectLogs(limit: number = 500): LogsInfo {
	const allLogs = logger.getLogs();
	const entries = allLogs.slice(-limit).map(sanitizeEntry);

	// Count by level
	const byLevel: Record<string, number> = {};
	for (const entry of allLogs) {
		byLevel[entry.level] = (byLevel[entry.level] || 0) + 1;
	}

	return {
		totalEntries: allLogs.length,
		includedEntries: entries.length,
		byLevel,
		entries,
	};
}

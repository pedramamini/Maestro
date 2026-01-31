/**
 * Stats Database Core Class
 *
 * Manages the SQLite database lifecycle: initialization, integrity checks,
 * corruption recovery, VACUUM scheduling, and connection management.
 *
 * CRUD operations are delegated to focused modules (query-events, auto-run,
 * session-lifecycle, aggregations, data-management).
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import { logger } from '../utils/logger';
import type {
	QueryEvent,
	AutoRunSession,
	AutoRunTask,
	SessionLifecycleEvent,
	WindowEvent,
	WindowEventType,
	StatsTimeRange,
	StatsFilters,
	StatsAggregation,
} from '../../shared/stats-types';
import type {
	IntegrityCheckResult,
	BackupResult,
	CorruptionRecoveryResult,
	MigrationRecord,
} from './types';
import { LOG_CONTEXT } from './utils';
import { CREATE_META_TABLE_SQL } from './schema';
import {
	runMigrations,
	getMigrationHistory,
	getCurrentVersion,
	getTargetVersion,
	hasPendingMigrations,
} from './migrations';
import { insertQueryEvent, getQueryEvents, clearQueryEventCache } from './query-events';
import {
	insertAutoRunSession,
	updateAutoRunSession,
	getAutoRunSessions,
	insertAutoRunTask,
	getAutoRunTasks,
	clearAutoRunCache,
} from './auto-run';
import {
	recordSessionCreated,
	recordSessionClosed,
	getSessionLifecycleEvents,
	clearSessionLifecycleCache,
} from './session-lifecycle';
import {
	recordWindowCreated,
	recordWindowClosed,
	recordSessionMoved,
	getWindowEvents,
	getWindowStatsAggregation,
	clearWindowEventsCache,
	type WindowCreatedInput,
	type WindowClosedInput,
	type SessionMovedInput,
} from './window-events';
import { getAggregatedStats } from './aggregations';
import { clearOldData, exportToCsv } from './data-management';

/**
 * StatsDB manages the SQLite database for usage statistics.
 */
export class StatsDB {
	private db: Database.Database | null = null;
	private dbPath: string;
	private initialized = false;

	constructor() {
		this.dbPath = path.join(app.getPath('userData'), 'stats.db');
	}

	// ============================================================================
	// Database Accessor
	// ============================================================================

	/**
	 * Get the underlying database handle, throwing if not initialized.
	 * Replaces the repeated `if (!this.db) throw` guard clauses.
	 */
	get database(): Database.Database {
		if (!this.db) throw new Error('Database not initialized');
		return this.db;
	}

	// ============================================================================
	// Lifecycle
	// ============================================================================

	/**
	 * Initialize the database - create file, tables, and indexes.
	 *
	 * If the database is corrupted, this method will:
	 * 1. Backup the corrupted database file
	 * 2. Delete the corrupted file and any associated WAL/SHM files
	 * 3. Create a fresh database
	 */
	initialize(): void {
		if (this.initialized) {
			return;
		}

		try {
			const dir = path.dirname(this.dbPath);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}

			const dbExists = fs.existsSync(this.dbPath);

			if (dbExists) {
				const db = this.openWithCorruptionHandling();
				if (!db) {
					throw new Error('Failed to open or recover database');
				}
				this.db = db;
			} else {
				this.db = new Database(this.dbPath);
			}

			// Enable WAL mode for better concurrent access
			this.db.pragma('journal_mode = WAL');

			// Create the _meta table for internal key-value storage
			this.db.prepare(CREATE_META_TABLE_SQL).run();

			// Run migrations
			runMigrations(this.db);

			this.initialized = true;
			logger.info(`Stats database initialized at ${this.dbPath}`, LOG_CONTEXT);

			// Schedule VACUUM to run weekly instead of on every startup
			this.vacuumIfNeededWeekly();
		} catch (error) {
			logger.error(`Failed to initialize stats database: ${error}`, LOG_CONTEXT);
			throw error;
		}
	}

	/**
	 * Close the database connection
	 */
	close(): void {
		if (this.db) {
			this.db.close();
			this.db = null;
			this.initialized = false;

			// Clear all statement caches
			clearQueryEventCache();
			clearAutoRunCache();
			clearSessionLifecycleCache();
			clearWindowEventsCache();

			logger.info('Stats database closed', LOG_CONTEXT);
		}
	}

	/**
	 * Check if database is initialized and ready
	 */
	isReady(): boolean {
		return this.initialized && this.db !== null;
	}

	/**
	 * Get the database file path
	 */
	getDbPath(): string {
		return this.dbPath;
	}

	/**
	 * Get the database file size in bytes.
	 */
	getDatabaseSize(): number {
		try {
			const stats = fs.statSync(this.dbPath);
			return stats.size;
		} catch {
			return 0;
		}
	}

	// ============================================================================
	// VACUUM
	// ============================================================================

	/**
	 * Run VACUUM on the database to reclaim unused space and optimize structure.
	 */
	vacuum(): { success: boolean; bytesFreed: number; error?: string } {
		if (!this.db) {
			return { success: false, bytesFreed: 0, error: 'Database not initialized' };
		}

		try {
			const sizeBefore = this.getDatabaseSize();
			logger.info(
				`Starting VACUUM (current size: ${(sizeBefore / 1024 / 1024).toFixed(2)} MB)`,
				LOG_CONTEXT
			);

			this.db.prepare('VACUUM').run();

			const sizeAfter = this.getDatabaseSize();
			const bytesFreed = sizeBefore - sizeAfter;

			logger.info(
				`VACUUM completed: ${(sizeBefore / 1024 / 1024).toFixed(2)} MB -> ${(sizeAfter / 1024 / 1024).toFixed(2)} MB (freed ${(bytesFreed / 1024 / 1024).toFixed(2)} MB)`,
				LOG_CONTEXT
			);

			return { success: true, bytesFreed };
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error(`VACUUM failed: ${errorMessage}`, LOG_CONTEXT);
			return { success: false, bytesFreed: 0, error: errorMessage };
		}
	}

	/**
	 * Conditionally vacuum the database if it exceeds a size threshold.
	 *
	 * @param thresholdBytes - Size threshold in bytes (default: 100MB)
	 */
	vacuumIfNeeded(thresholdBytes: number = 100 * 1024 * 1024): {
		vacuumed: boolean;
		databaseSize: number;
		result?: { success: boolean; bytesFreed: number; error?: string };
	} {
		const databaseSize = this.getDatabaseSize();

		if (databaseSize < thresholdBytes) {
			logger.debug(
				`Database size (${(databaseSize / 1024 / 1024).toFixed(2)} MB) below vacuum threshold (${(thresholdBytes / 1024 / 1024).toFixed(2)} MB), skipping VACUUM`,
				LOG_CONTEXT
			);
			return { vacuumed: false, databaseSize };
		}

		logger.info(
			`Database size (${(databaseSize / 1024 / 1024).toFixed(2)} MB) exceeds vacuum threshold (${(thresholdBytes / 1024 / 1024).toFixed(2)} MB), running VACUUM`,
			LOG_CONTEXT
		);

		const result = this.vacuum();
		return { vacuumed: true, databaseSize, result };
	}

	/**
	 * Run VACUUM only if it hasn't been run in the last 7 days.
	 *
	 * Stores the last vacuum timestamp in the database's _meta table
	 * instead of an external file.
	 *
	 * @param intervalMs - Minimum time between vacuums (default: 7 days)
	 */
	private vacuumIfNeededWeekly(intervalMs: number = 7 * 24 * 60 * 60 * 1000): void {
		try {
			// Read last vacuum timestamp from _meta table
			const row = this.database
				.prepare("SELECT value FROM _meta WHERE key = 'last_vacuum_at'")
				.get() as { value: string } | undefined;

			const lastVacuum = row ? parseInt(row.value, 10) || 0 : 0;
			const now = Date.now();
			const timeSinceLastVacuum = now - lastVacuum;

			if (timeSinceLastVacuum < intervalMs) {
				const daysRemaining = ((intervalMs - timeSinceLastVacuum) / (24 * 60 * 60 * 1000)).toFixed(
					1
				);
				logger.debug(
					`Skipping VACUUM (last run ${((now - lastVacuum) / (24 * 60 * 60 * 1000)).toFixed(1)} days ago, next in ${daysRemaining} days)`,
					LOG_CONTEXT
				);
				return;
			}

			// Run VACUUM if database is large enough
			const result = this.vacuumIfNeeded();

			if (result.vacuumed) {
				// Update timestamp in _meta table
				this.database
					.prepare("INSERT OR REPLACE INTO _meta (key, value) VALUES ('last_vacuum_at', ?)")
					.run(String(now));
				logger.info('Updated VACUUM timestamp in _meta table', LOG_CONTEXT);
			}
		} catch (error) {
			// Non-fatal - log and continue
			logger.warn(`Failed to check/update VACUUM schedule: ${error}`, LOG_CONTEXT);
		}
	}

	// ============================================================================
	// Integrity & Corruption Handling
	// ============================================================================

	/**
	 * Check the integrity of the database using SQLite's PRAGMA integrity_check.
	 */
	checkIntegrity(): IntegrityCheckResult {
		if (!this.db) {
			return { ok: false, errors: ['Database not initialized'] };
		}

		try {
			const result = this.db.pragma('integrity_check') as Array<{ integrity_check: string }>;

			if (result.length === 1 && result[0].integrity_check === 'ok') {
				return { ok: true, errors: [] };
			}

			const errors = result.map((row) => row.integrity_check);
			return { ok: false, errors };
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return { ok: false, errors: [errorMessage] };
		}
	}

	/**
	 * Create a backup of the current database file.
	 */
	backupDatabase(): BackupResult {
		try {
			if (!fs.existsSync(this.dbPath)) {
				return { success: false, error: 'Database file does not exist' };
			}

			const timestamp = Date.now();
			const backupPath = `${this.dbPath}.backup.${timestamp}`;

			fs.copyFileSync(this.dbPath, backupPath);

			logger.info(`Created database backup at ${backupPath}`, LOG_CONTEXT);
			return { success: true, backupPath };
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error(`Failed to create database backup: ${errorMessage}`, LOG_CONTEXT);
			return { success: false, error: errorMessage };
		}
	}

	/**
	 * Handle a corrupted database by backing it up and recreating a fresh database.
	 */
	private recoverFromCorruption(): CorruptionRecoveryResult {
		logger.warn('Attempting to recover from database corruption...', LOG_CONTEXT);

		try {
			if (this.db) {
				try {
					this.db.close();
				} catch {
					// Ignore errors closing corrupted database
				}
				this.db = null;
				this.initialized = false;
			}

			const backupResult = this.backupDatabase();
			if (!backupResult.success) {
				if (fs.existsSync(this.dbPath)) {
					const timestamp = Date.now();
					const emergencyBackupPath = `${this.dbPath}.corrupted.${timestamp}`;
					try {
						fs.renameSync(this.dbPath, emergencyBackupPath);
						logger.warn(`Emergency backup created at ${emergencyBackupPath}`, LOG_CONTEXT);
					} catch {
						logger.error('Failed to backup corrupted database, data will be lost', LOG_CONTEXT);
						fs.unlinkSync(this.dbPath);
					}
				}
			}

			// Delete WAL and SHM files
			const walPath = `${this.dbPath}-wal`;
			const shmPath = `${this.dbPath}-shm`;
			if (fs.existsSync(walPath)) {
				fs.unlinkSync(walPath);
			}
			if (fs.existsSync(shmPath)) {
				fs.unlinkSync(shmPath);
			}

			if (fs.existsSync(this.dbPath)) {
				fs.unlinkSync(this.dbPath);
			}

			logger.info('Corrupted database removed, will create fresh database', LOG_CONTEXT);

			return {
				recovered: true,
				backupPath: backupResult.backupPath,
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error(`Failed to recover from database corruption: ${errorMessage}`, LOG_CONTEXT);
			return {
				recovered: false,
				error: errorMessage,
			};
		}
	}

	/**
	 * Attempt to open and validate a database, handling corruption if detected.
	 */
	private openWithCorruptionHandling(): Database.Database | null {
		try {
			const db = new Database(this.dbPath);

			const result = db.pragma('integrity_check') as Array<{ integrity_check: string }>;
			if (result.length === 1 && result[0].integrity_check === 'ok') {
				return db;
			}

			const errors = result.map((row) => row.integrity_check);
			logger.error(`Database integrity check failed: ${errors.join(', ')}`, LOG_CONTEXT);

			db.close();
		} catch (error) {
			logger.error(`Failed to open database: ${error}`, LOG_CONTEXT);
		}

		const recoveryResult = this.recoverFromCorruption();
		if (!recoveryResult.recovered) {
			logger.error('Database corruption recovery failed', LOG_CONTEXT);
			return null;
		}

		try {
			const db = new Database(this.dbPath);
			logger.info('Fresh database created after corruption recovery', LOG_CONTEXT);
			return db;
		} catch (error) {
			logger.error(`Failed to create fresh database after recovery: ${error}`, LOG_CONTEXT);
			return null;
		}
	}

	// ============================================================================
	// Migration Queries (delegated)
	// ============================================================================

	getMigrationHistory(): MigrationRecord[] {
		return getMigrationHistory(this.database);
	}

	getCurrentVersion(): number {
		return getCurrentVersion(this.database);
	}

	getTargetVersion(): number {
		return getTargetVersion();
	}

	hasPendingMigrations(): boolean {
		return hasPendingMigrations(this.database);
	}

	// ============================================================================
	// Query Events (delegated)
	// ============================================================================

	insertQueryEvent(event: Omit<QueryEvent, 'id'>): string {
		return insertQueryEvent(this.database, event);
	}

	getQueryEvents(range: StatsTimeRange, filters?: StatsFilters): QueryEvent[] {
		return getQueryEvents(this.database, range, filters);
	}

	// ============================================================================
	// Auto Run (delegated)
	// ============================================================================

	insertAutoRunSession(session: Omit<AutoRunSession, 'id'>): string {
		return insertAutoRunSession(this.database, session);
	}

	updateAutoRunSession(id: string, updates: Partial<AutoRunSession>): boolean {
		return updateAutoRunSession(this.database, id, updates);
	}

	getAutoRunSessions(range: StatsTimeRange): AutoRunSession[] {
		return getAutoRunSessions(this.database, range);
	}

	insertAutoRunTask(task: Omit<AutoRunTask, 'id'>): string {
		return insertAutoRunTask(this.database, task);
	}

	getAutoRunTasks(autoRunSessionId: string): AutoRunTask[] {
		return getAutoRunTasks(this.database, autoRunSessionId);
	}

	// ============================================================================
	// Session Lifecycle (delegated)
	// ============================================================================

	recordSessionCreated(event: Omit<SessionLifecycleEvent, 'id' | 'closedAt' | 'duration'>): string {
		return recordSessionCreated(this.database, event);
	}

	recordSessionClosed(sessionId: string, closedAt: number): boolean {
		return recordSessionClosed(this.database, sessionId, closedAt);
	}

	getSessionLifecycleEvents(range: StatsTimeRange): SessionLifecycleEvent[] {
		return getSessionLifecycleEvents(this.database, range);
	}

	// ============================================================================
	// Window Events (delegated)
	// ============================================================================

	recordWindowCreated(input: WindowCreatedInput): string {
		return recordWindowCreated(this.database, input);
	}

	recordWindowClosed(input: WindowClosedInput): string {
		return recordWindowClosed(this.database, input);
	}

	recordSessionMoved(input: SessionMovedInput): string {
		return recordSessionMoved(this.database, input);
	}

	getWindowEvents(range: StatsTimeRange, eventType?: WindowEventType): WindowEvent[] {
		return getWindowEvents(this.database, range, eventType);
	}

	getWindowStatsAggregation(range: StatsTimeRange) {
		return getWindowStatsAggregation(this.database, range);
	}

	// ============================================================================
	// Aggregations (delegated)
	// ============================================================================

	getAggregatedStats(range: StatsTimeRange): StatsAggregation {
		return getAggregatedStats(this.database, range);
	}

	// ============================================================================
	// Data Management (delegated)
	// ============================================================================

	clearOldData(olderThanDays: number) {
		if (!this.db) {
			return {
				success: false,
				deletedQueryEvents: 0,
				deletedAutoRunSessions: 0,
				deletedAutoRunTasks: 0,
				deletedSessionLifecycle: 0,
				error: 'Database not initialized',
			};
		}
		return clearOldData(this.database, olderThanDays);
	}

	exportToCsv(range: StatsTimeRange): string {
		return exportToCsv(this.database, range);
	}
}

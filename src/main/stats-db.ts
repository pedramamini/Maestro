/**
 * Stats Database Service
 *
 * SQLite-based storage for tracking all AI interactions across Maestro.
 * Uses better-sqlite3 for synchronous, fast database operations.
 *
 * Database location: ~/Library/Application Support/Maestro/stats.db
 * (platform-appropriate path resolved via app.getPath('userData'))
 *
 * ## Migration System
 *
 * This module uses a versioned migration system to manage schema changes:
 *
 * 1. **Version Tracking**: Uses SQLite's `user_version` pragma for fast version checks
 * 2. **Migrations Table**: Stores detailed migration history with timestamps and status
 * 3. **Sequential Execution**: Migrations run in order, skipping already-applied ones
 *
 * ### Adding New Migrations
 *
 * To add a new migration:
 * 1. Create a new migration function following the pattern: `migrateVN()`
 * 2. Add it to the `MIGRATIONS` array with version number and description
 * 3. Update `STATS_DB_VERSION` in `../shared/stats-types.ts`
 *
 * Example:
 * ```typescript
 * // In MIGRATIONS array:
 * { version: 2, description: 'Add token_count column', up: () => this.migrateV2() }
 *
 * // Migration function:
 * private migrateV2(): void {
 *   this.db.prepare('ALTER TABLE query_events ADD COLUMN token_count INTEGER').run();
 * }
 * ```
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import { logger } from './utils/logger';
import {
  QueryEvent,
  AutoRunSession,
  AutoRunTask,
  StatsTimeRange,
  StatsFilters,
  StatsAggregation,
} from '../shared/stats-types';

const LOG_CONTEXT = '[StatsDB]';

// ============================================================================
// Migration System Types
// ============================================================================

/**
 * Represents a single database migration
 */
export interface Migration {
  /** Version number (must be sequential starting from 1) */
  version: number;
  /** Human-readable description of the migration */
  description: string;
  /** Function to apply the migration */
  up: () => void;
}

/**
 * Record of an applied migration stored in the migrations table
 */
export interface MigrationRecord {
  version: number;
  description: string;
  appliedAt: number;
  status: 'success' | 'failed';
  errorMessage?: string;
}

/**
 * SQL for creating the migrations tracking table
 */
const CREATE_MIGRATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS _migrations (
    version INTEGER PRIMARY KEY,
    description TEXT NOT NULL,
    applied_at INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('success', 'failed')),
    error_message TEXT
  )
`;

/**
 * Generate a unique ID for database entries
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Get timestamp for start of time range
 */
function getTimeRangeStart(range: StatsTimeRange): number {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  switch (range) {
    case 'day':
      return now - day;
    case 'week':
      return now - 7 * day;
    case 'month':
      return now - 30 * day;
    case 'year':
      return now - 365 * day;
    case 'all':
      return 0;
  }
}

/**
 * Normalize file paths to use forward slashes consistently across platforms.
 *
 * This ensures that paths stored in the database use a consistent format
 * regardless of the operating system, enabling cross-platform data portability
 * and consistent filtering by project path.
 *
 * - Converts Windows-style backslashes to forward slashes
 * - Preserves UNC paths (\\server\share → //server/share)
 * - Handles null/undefined by returning null
 *
 * @param filePath - The file path to normalize (may be Windows or Unix style)
 * @returns The normalized path with forward slashes, or null if input is null/undefined
 */
export function normalizePath(filePath: string | null | undefined): string | null {
  if (filePath == null) {
    return null;
  }
  // Replace all backslashes with forward slashes
  return filePath.replace(/\\/g, '/');
}

/**
 * SQL for creating query_events table
 */
const CREATE_QUERY_EVENTS_SQL = `
  CREATE TABLE IF NOT EXISTS query_events (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    agent_type TEXT NOT NULL,
    source TEXT NOT NULL CHECK(source IN ('user', 'auto')),
    start_time INTEGER NOT NULL,
    duration INTEGER NOT NULL,
    project_path TEXT,
    tab_id TEXT
  )
`;

const CREATE_QUERY_EVENTS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_query_start_time ON query_events(start_time);
  CREATE INDEX IF NOT EXISTS idx_query_agent_type ON query_events(agent_type);
  CREATE INDEX IF NOT EXISTS idx_query_source ON query_events(source);
  CREATE INDEX IF NOT EXISTS idx_query_session ON query_events(session_id)
`;

/**
 * SQL for creating auto_run_sessions table
 */
const CREATE_AUTO_RUN_SESSIONS_SQL = `
  CREATE TABLE IF NOT EXISTS auto_run_sessions (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    agent_type TEXT NOT NULL,
    document_path TEXT,
    start_time INTEGER NOT NULL,
    duration INTEGER NOT NULL,
    tasks_total INTEGER,
    tasks_completed INTEGER,
    project_path TEXT
  )
`;

const CREATE_AUTO_RUN_SESSIONS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_auto_session_start ON auto_run_sessions(start_time)
`;

/**
 * SQL for creating auto_run_tasks table
 */
const CREATE_AUTO_RUN_TASKS_SQL = `
  CREATE TABLE IF NOT EXISTS auto_run_tasks (
    id TEXT PRIMARY KEY,
    auto_run_session_id TEXT NOT NULL REFERENCES auto_run_sessions(id),
    session_id TEXT NOT NULL,
    agent_type TEXT NOT NULL,
    task_index INTEGER NOT NULL,
    task_content TEXT,
    start_time INTEGER NOT NULL,
    duration INTEGER NOT NULL,
    success INTEGER NOT NULL CHECK(success IN (0, 1))
  )
`;

const CREATE_AUTO_RUN_TASKS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_task_auto_session ON auto_run_tasks(auto_run_session_id);
  CREATE INDEX IF NOT EXISTS idx_task_start ON auto_run_tasks(start_time)
`;

/**
 * StatsDB manages the SQLite database for usage statistics.
 * Implements singleton pattern for database connection management.
 */
export class StatsDB {
  private db: Database.Database | null = null;
  private dbPath: string;
  private initialized = false;

  /**
   * Registry of all database migrations.
   * Migrations must be sequential starting from version 1.
   * Each migration is run exactly once and recorded in the _migrations table.
   */
  private getMigrations(): Migration[] {
    return [
      {
        version: 1,
        description: 'Initial schema: query_events, auto_run_sessions, auto_run_tasks tables',
        up: () => this.migrateV1(),
      },
      // Future migrations should be added here:
      // {
      //   version: 2,
      //   description: 'Add token_count column to query_events',
      //   up: () => this.migrateV2(),
      // },
    ];
  }

  constructor() {
    this.dbPath = path.join(app.getPath('userData'), 'stats.db');
  }

  /**
   * Initialize the database - create file, tables, and indexes
   */
  initialize(): void {
    if (this.initialized) {
      return;
    }

    try {
      // Ensure the directory exists
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Open database connection
      this.db = new Database(this.dbPath);

      // Enable WAL mode for better concurrent access
      this.db.pragma('journal_mode = WAL');

      // Run migrations
      this.runMigrations();

      this.initialized = true;
      logger.info(`Stats database initialized at ${this.dbPath}`, LOG_CONTEXT);
    } catch (error) {
      logger.error(`Failed to initialize stats database: ${error}`, LOG_CONTEXT);
      throw error;
    }
  }

  // ============================================================================
  // Migration System
  // ============================================================================

  /**
   * Run all pending database migrations.
   *
   * The migration system:
   * 1. Creates the _migrations table if it doesn't exist
   * 2. Gets the current schema version from user_version pragma
   * 3. Runs each pending migration in a transaction
   * 4. Records each migration in the _migrations table
   * 5. Updates the user_version pragma
   *
   * If a migration fails, it is recorded as 'failed' with an error message,
   * and the error is re-thrown to prevent the app from starting with an
   * inconsistent database state.
   */
  private runMigrations(): void {
    if (!this.db) throw new Error('Database not initialized');

    // Create migrations table (this is the only table created outside the migration system)
    this.db.prepare(CREATE_MIGRATIONS_TABLE_SQL).run();

    // Get current version (0 if fresh database)
    const versionResult = this.db.pragma('user_version') as Array<{ user_version: number }>;
    const currentVersion = versionResult[0]?.user_version ?? 0;

    const migrations = this.getMigrations();
    const pendingMigrations = migrations.filter((m) => m.version > currentVersion);

    if (pendingMigrations.length === 0) {
      logger.debug(`Database is up to date (version ${currentVersion})`, LOG_CONTEXT);
      return;
    }

    // Sort by version to ensure sequential execution
    pendingMigrations.sort((a, b) => a.version - b.version);

    logger.info(
      `Running ${pendingMigrations.length} pending migration(s) (current version: ${currentVersion})`,
      LOG_CONTEXT
    );

    for (const migration of pendingMigrations) {
      this.applyMigration(migration);
    }
  }

  /**
   * Apply a single migration within a transaction.
   * Records the migration in the _migrations table with success/failure status.
   */
  private applyMigration(migration: Migration): void {
    if (!this.db) throw new Error('Database not initialized');

    const startTime = Date.now();
    logger.info(`Applying migration v${migration.version}: ${migration.description}`, LOG_CONTEXT);

    try {
      // Run migration in a transaction for atomicity
      const runMigration = this.db.transaction(() => {
        // Execute the migration
        migration.up();

        // Record success in _migrations table
        this.db!.prepare(`
          INSERT OR REPLACE INTO _migrations (version, description, applied_at, status, error_message)
          VALUES (?, ?, ?, 'success', NULL)
        `).run(migration.version, migration.description, Date.now());

        // Update user_version pragma
        this.db!.pragma(`user_version = ${migration.version}`);
      });

      runMigration();

      const duration = Date.now() - startTime;
      logger.info(`Migration v${migration.version} completed in ${duration}ms`, LOG_CONTEXT);
    } catch (error) {
      // Record failure in _migrations table (outside transaction since it was rolled back)
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.db.prepare(`
        INSERT OR REPLACE INTO _migrations (version, description, applied_at, status, error_message)
        VALUES (?, ?, ?, 'failed', ?)
      `).run(migration.version, migration.description, Date.now(), errorMessage);

      logger.error(`Migration v${migration.version} failed: ${errorMessage}`, LOG_CONTEXT);

      // Re-throw to prevent app from starting with inconsistent state
      throw error;
    }
  }

  /**
   * Get the list of applied migrations from the _migrations table.
   * Useful for debugging and diagnostics.
   */
  getMigrationHistory(): MigrationRecord[] {
    if (!this.db) throw new Error('Database not initialized');

    // Check if _migrations table exists
    const tableExists = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'
    `).get();

    if (!tableExists) {
      return [];
    }

    const rows = this.db.prepare(`
      SELECT version, description, applied_at, status, error_message
      FROM _migrations
      ORDER BY version ASC
    `).all() as Array<{
      version: number;
      description: string;
      applied_at: number;
      status: 'success' | 'failed';
      error_message: string | null;
    }>;

    return rows.map((row) => ({
      version: row.version,
      description: row.description,
      appliedAt: row.applied_at,
      status: row.status,
      errorMessage: row.error_message ?? undefined,
    }));
  }

  /**
   * Get the current database schema version.
   */
  getCurrentVersion(): number {
    if (!this.db) throw new Error('Database not initialized');

    const versionResult = this.db.pragma('user_version') as Array<{ user_version: number }>;
    return versionResult[0]?.user_version ?? 0;
  }

  /**
   * Get the target version (highest version in migrations registry).
   */
  getTargetVersion(): number {
    const migrations = this.getMigrations();
    if (migrations.length === 0) return 0;
    return Math.max(...migrations.map((m) => m.version));
  }

  /**
   * Check if any migrations are pending.
   */
  hasPendingMigrations(): boolean {
    return this.getCurrentVersion() < this.getTargetVersion();
  }

  // ============================================================================
  // Individual Migration Functions
  // ============================================================================

  /**
   * Migration v1: Initial schema creation
   *
   * Creates the core tables for tracking AI interactions:
   * - query_events: Individual AI query/response cycles
   * - auto_run_sessions: Batch processing runs
   * - auto_run_tasks: Individual tasks within batch runs
   */
  private migrateV1(): void {
    if (!this.db) throw new Error('Database not initialized');

    // Create query_events table and indexes
    this.db.prepare(CREATE_QUERY_EVENTS_SQL).run();
    for (const indexSql of CREATE_QUERY_EVENTS_INDEXES_SQL.split(';').filter((s) => s.trim())) {
      this.db.prepare(indexSql).run();
    }

    // Create auto_run_sessions table and indexes
    this.db.prepare(CREATE_AUTO_RUN_SESSIONS_SQL).run();
    for (const indexSql of CREATE_AUTO_RUN_SESSIONS_INDEXES_SQL.split(';').filter((s) => s.trim())) {
      this.db.prepare(indexSql).run();
    }

    // Create auto_run_tasks table and indexes
    this.db.prepare(CREATE_AUTO_RUN_TASKS_SQL).run();
    for (const indexSql of CREATE_AUTO_RUN_TASKS_INDEXES_SQL.split(';').filter((s) => s.trim())) {
      this.db.prepare(indexSql).run();
    }

    logger.debug('Created stats database tables and indexes', LOG_CONTEXT);
  }

  // ============================================================================
  // Database Lifecycle
  // ============================================================================

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
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

  // ============================================================================
  // Query Events
  // ============================================================================

  /**
   * Insert a new query event
   */
  insertQueryEvent(event: Omit<QueryEvent, 'id'>): string {
    if (!this.db) throw new Error('Database not initialized');

    const id = generateId();
    const stmt = this.db.prepare(`
      INSERT INTO query_events (id, session_id, agent_type, source, start_time, duration, project_path, tab_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      event.sessionId,
      event.agentType,
      event.source,
      event.startTime,
      event.duration,
      normalizePath(event.projectPath),
      event.tabId ?? null
    );

    logger.debug(`Inserted query event ${id}`, LOG_CONTEXT);
    return id;
  }

  /**
   * Get query events within a time range with optional filters
   */
  getQueryEvents(range: StatsTimeRange, filters?: StatsFilters): QueryEvent[] {
    if (!this.db) throw new Error('Database not initialized');

    const startTime = getTimeRangeStart(range);
    let sql = 'SELECT * FROM query_events WHERE start_time >= ?';
    const params: (string | number)[] = [startTime];

    if (filters?.agentType) {
      sql += ' AND agent_type = ?';
      params.push(filters.agentType);
    }
    if (filters?.source) {
      sql += ' AND source = ?';
      params.push(filters.source);
    }
    if (filters?.projectPath) {
      sql += ' AND project_path = ?';
      // Normalize filter path to match stored format
      params.push(normalizePath(filters.projectPath) ?? '');
    }
    if (filters?.sessionId) {
      sql += ' AND session_id = ?';
      params.push(filters.sessionId);
    }

    sql += ' ORDER BY start_time DESC';

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as Array<{
      id: string;
      session_id: string;
      agent_type: string;
      source: 'user' | 'auto';
      start_time: number;
      duration: number;
      project_path: string | null;
      tab_id: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      agentType: row.agent_type,
      source: row.source,
      startTime: row.start_time,
      duration: row.duration,
      projectPath: row.project_path ?? undefined,
      tabId: row.tab_id ?? undefined,
    }));
  }

  // ============================================================================
  // Auto Run Sessions
  // ============================================================================

  /**
   * Insert a new Auto Run session
   */
  insertAutoRunSession(session: Omit<AutoRunSession, 'id'>): string {
    if (!this.db) throw new Error('Database not initialized');

    const id = generateId();
    const stmt = this.db.prepare(`
      INSERT INTO auto_run_sessions (id, session_id, agent_type, document_path, start_time, duration, tasks_total, tasks_completed, project_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      session.sessionId,
      session.agentType,
      normalizePath(session.documentPath),
      session.startTime,
      session.duration,
      session.tasksTotal ?? null,
      session.tasksCompleted ?? null,
      normalizePath(session.projectPath)
    );

    logger.debug(`Inserted Auto Run session ${id}`, LOG_CONTEXT);
    return id;
  }

  /**
   * Update an existing Auto Run session (e.g., when it completes)
   */
  updateAutoRunSession(id: string, updates: Partial<AutoRunSession>): boolean {
    if (!this.db) throw new Error('Database not initialized');

    const setClauses: string[] = [];
    const params: (string | number | null)[] = [];

    if (updates.duration !== undefined) {
      setClauses.push('duration = ?');
      params.push(updates.duration);
    }
    if (updates.tasksTotal !== undefined) {
      setClauses.push('tasks_total = ?');
      params.push(updates.tasksTotal ?? null);
    }
    if (updates.tasksCompleted !== undefined) {
      setClauses.push('tasks_completed = ?');
      params.push(updates.tasksCompleted ?? null);
    }
    if (updates.documentPath !== undefined) {
      setClauses.push('document_path = ?');
      params.push(normalizePath(updates.documentPath));
    }

    if (setClauses.length === 0) {
      return false;
    }

    params.push(id);
    const sql = `UPDATE auto_run_sessions SET ${setClauses.join(', ')} WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);

    logger.debug(`Updated Auto Run session ${id}`, LOG_CONTEXT);
    return result.changes > 0;
  }

  /**
   * Get Auto Run sessions within a time range
   */
  getAutoRunSessions(range: StatsTimeRange): AutoRunSession[] {
    if (!this.db) throw new Error('Database not initialized');

    const startTime = getTimeRangeStart(range);
    const stmt = this.db.prepare(`
      SELECT * FROM auto_run_sessions
      WHERE start_time >= ?
      ORDER BY start_time DESC
    `);

    const rows = stmt.all(startTime) as Array<{
      id: string;
      session_id: string;
      agent_type: string;
      document_path: string | null;
      start_time: number;
      duration: number;
      tasks_total: number | null;
      tasks_completed: number | null;
      project_path: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      agentType: row.agent_type,
      documentPath: row.document_path ?? undefined,
      startTime: row.start_time,
      duration: row.duration,
      tasksTotal: row.tasks_total ?? undefined,
      tasksCompleted: row.tasks_completed ?? undefined,
      projectPath: row.project_path ?? undefined,
    }));
  }

  // ============================================================================
  // Auto Run Tasks
  // ============================================================================

  /**
   * Insert a new Auto Run task
   */
  insertAutoRunTask(task: Omit<AutoRunTask, 'id'>): string {
    if (!this.db) throw new Error('Database not initialized');

    const id = generateId();
    const stmt = this.db.prepare(`
      INSERT INTO auto_run_tasks (id, auto_run_session_id, session_id, agent_type, task_index, task_content, start_time, duration, success)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      task.autoRunSessionId,
      task.sessionId,
      task.agentType,
      task.taskIndex,
      task.taskContent ?? null,
      task.startTime,
      task.duration,
      task.success ? 1 : 0
    );

    logger.debug(`Inserted Auto Run task ${id}`, LOG_CONTEXT);
    return id;
  }

  /**
   * Get all tasks for a specific Auto Run session
   */
  getAutoRunTasks(autoRunSessionId: string): AutoRunTask[] {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT * FROM auto_run_tasks
      WHERE auto_run_session_id = ?
      ORDER BY task_index ASC
    `);

    const rows = stmt.all(autoRunSessionId) as Array<{
      id: string;
      auto_run_session_id: string;
      session_id: string;
      agent_type: string;
      task_index: number;
      task_content: string | null;
      start_time: number;
      duration: number;
      success: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      autoRunSessionId: row.auto_run_session_id,
      sessionId: row.session_id,
      agentType: row.agent_type,
      taskIndex: row.task_index,
      taskContent: row.task_content ?? undefined,
      startTime: row.start_time,
      duration: row.duration,
      success: row.success === 1,
    }));
  }

  // ============================================================================
  // Aggregations
  // ============================================================================

  /**
   * Get aggregated statistics for a time range
   */
  getAggregatedStats(range: StatsTimeRange): StatsAggregation {
    if (!this.db) throw new Error('Database not initialized');

    const startTime = getTimeRangeStart(range);

    // Total queries and duration
    const totalsStmt = this.db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(duration), 0) as total_duration
      FROM query_events
      WHERE start_time >= ?
    `);
    const totals = totalsStmt.get(startTime) as { count: number; total_duration: number };

    // By agent type
    const byAgentStmt = this.db.prepare(`
      SELECT agent_type, COUNT(*) as count, SUM(duration) as duration
      FROM query_events
      WHERE start_time >= ?
      GROUP BY agent_type
    `);
    const byAgentRows = byAgentStmt.all(startTime) as Array<{
      agent_type: string;
      count: number;
      duration: number;
    }>;
    const byAgent: Record<string, { count: number; duration: number }> = {};
    for (const row of byAgentRows) {
      byAgent[row.agent_type] = { count: row.count, duration: row.duration };
    }

    // By source (user vs auto)
    const bySourceStmt = this.db.prepare(`
      SELECT source, COUNT(*) as count
      FROM query_events
      WHERE start_time >= ?
      GROUP BY source
    `);
    const bySourceRows = bySourceStmt.all(startTime) as Array<{ source: 'user' | 'auto'; count: number }>;
    const bySource = { user: 0, auto: 0 };
    for (const row of bySourceRows) {
      bySource[row.source] = row.count;
    }

    // By day (for charts)
    const byDayStmt = this.db.prepare(`
      SELECT date(start_time / 1000, 'unixepoch', 'localtime') as date,
             COUNT(*) as count,
             SUM(duration) as duration
      FROM query_events
      WHERE start_time >= ?
      GROUP BY date(start_time / 1000, 'unixepoch', 'localtime')
      ORDER BY date ASC
    `);
    const byDayRows = byDayStmt.all(startTime) as Array<{
      date: string;
      count: number;
      duration: number;
    }>;

    return {
      totalQueries: totals.count,
      totalDuration: totals.total_duration,
      avgDuration: totals.count > 0 ? Math.round(totals.total_duration / totals.count) : 0,
      byAgent,
      bySource,
      byDay: byDayRows,
    };
  }

  // ============================================================================
  // Export
  // ============================================================================

  /**
   * Export query events to CSV format
   */
  exportToCsv(range: StatsTimeRange): string {
    const events = this.getQueryEvents(range);

    const headers = ['id', 'sessionId', 'agentType', 'source', 'startTime', 'duration', 'projectPath', 'tabId'];
    const rows = events.map((e) => [
      e.id,
      e.sessionId,
      e.agentType,
      e.source,
      new Date(e.startTime).toISOString(),
      e.duration.toString(),
      e.projectPath ?? '',
      e.tabId ?? '',
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))].join('\n');

    return csvContent;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let statsDbInstance: StatsDB | null = null;

/**
 * Get the singleton StatsDB instance
 */
export function getStatsDB(): StatsDB {
  if (!statsDbInstance) {
    statsDbInstance = new StatsDB();
  }
  return statsDbInstance;
}

/**
 * Initialize the stats database (call on app ready)
 */
export function initializeStatsDB(): void {
  const db = getStatsDB();
  db.initialize();
}

/**
 * Close the stats database (call on app quit)
 */
export function closeStatsDB(): void {
  if (statsDbInstance) {
    statsDbInstance.close();
    statsDbInstance = null;
  }
}

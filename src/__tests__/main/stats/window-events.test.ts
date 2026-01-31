/**
 * Tests for window events CRUD operations and aggregation.
 *
 * These tests verify the multi-window telemetry functionality including:
 * - Recording window creation events
 * - Recording window close events
 * - Recording session move events
 * - Aggregating window statistics
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';

// Mock statement for prepared statements
const mockStatement = {
	run: vi.fn(() => ({ changes: 1 })),
	get: vi.fn(),
	all: vi.fn(() => []),
};

// Mock database
const mockDb = {
	prepare: vi.fn(() => mockStatement),
} as unknown as Database.Database;

// Mock logger
vi.mock('../../../main/utils/logger', () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

// Import the functions under test
import {
	recordWindowCreated,
	recordWindowClosed,
	recordSessionMoved,
	getWindowEvents,
	getWindowStatsAggregation,
	clearWindowEventsCache,
} from '../../../main/stats/window-events';

describe('window-events CRUD operations', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearWindowEventsCache();
		mockStatement.run.mockReturnValue({ changes: 1 });
		mockStatement.get.mockReturnValue(null);
		mockStatement.all.mockReturnValue([]);
	});

	afterEach(() => {
		vi.resetModules();
	});

	describe('recordWindowCreated', () => {
		it('should record a window created event', () => {
			const id = recordWindowCreated(mockDb, {
				windowId: 'window-1',
				isPrimary: false,
				windowCount: 2,
			});

			expect(id).toBeDefined();
			expect(typeof id).toBe('string');
			expect(mockDb.prepare).toHaveBeenCalled();
			expect(mockStatement.run).toHaveBeenCalled();

			// Verify the run was called with correct parameters
			const runCall = mockStatement.run.mock.calls[0];
			expect(runCall[0]).toBeDefined(); // id
			expect(runCall[1]).toBe('created'); // event_type
			expect(runCall[2]).toBe('window-1'); // window_id
			expect(runCall[3]).toBe(0); // is_primary (false = 0)
			expect(runCall[4]).toBeGreaterThan(0); // timestamp
			expect(runCall[5]).toBeNull(); // session_id
			expect(runCall[6]).toBeNull(); // source_window_id
			expect(runCall[7]).toBeNull(); // dest_window_id
			expect(runCall[8]).toBe(2); // window_count
		});

		it('should record primary window created event correctly', () => {
			recordWindowCreated(mockDb, {
				windowId: 'primary',
				isPrimary: true,
				windowCount: 1,
			});

			const runCall = mockStatement.run.mock.calls[0];
			expect(runCall[2]).toBe('primary'); // window_id
			expect(runCall[3]).toBe(1); // is_primary (true = 1)
			expect(runCall[8]).toBe(1); // window_count
		});
	});

	describe('recordWindowClosed', () => {
		it('should record a window closed event', () => {
			const id = recordWindowClosed(mockDb, {
				windowId: 'window-2',
				isPrimary: false,
				windowCount: 1,
			});

			expect(id).toBeDefined();
			expect(typeof id).toBe('string');

			const runCall = mockStatement.run.mock.calls[0];
			expect(runCall[1]).toBe('closed'); // event_type
			expect(runCall[2]).toBe('window-2'); // window_id
			expect(runCall[3]).toBe(0); // is_primary (false = 0)
			expect(runCall[8]).toBe(1); // window_count
		});
	});

	describe('recordSessionMoved', () => {
		it('should record a session moved event', () => {
			const id = recordSessionMoved(mockDb, {
				sessionId: 'session-1',
				sourceWindowId: 'window-1',
				destWindowId: 'window-2',
				windowCount: 2,
			});

			expect(id).toBeDefined();
			expect(typeof id).toBe('string');

			const runCall = mockStatement.run.mock.calls[0];
			expect(runCall[1]).toBe('session_moved'); // event_type
			expect(runCall[2]).toBe('window-2'); // window_id (destination)
			expect(runCall[3]).toBe(0); // is_primary (always 0 for moves)
			expect(runCall[5]).toBe('session-1'); // session_id
			expect(runCall[6]).toBe('window-1'); // source_window_id
			expect(runCall[7]).toBe('window-2'); // dest_window_id
			expect(runCall[8]).toBe(2); // window_count
		});
	});

	describe('getWindowEvents', () => {
		it('should retrieve window events for a time range', () => {
			const mockRows = [
				{
					id: 'evt-1',
					event_type: 'created',
					window_id: 'window-1',
					is_primary: 0,
					timestamp: Date.now(),
					session_id: null,
					source_window_id: null,
					dest_window_id: null,
					window_count: 2,
				},
			];
			mockStatement.all.mockReturnValue(mockRows);

			const events = getWindowEvents(mockDb, 'week');

			expect(mockDb.prepare).toHaveBeenCalled();
			expect(events.length).toBe(1);
			expect(events[0].eventType).toBe('created');
			expect(events[0].windowId).toBe('window-1');
			expect(events[0].isPrimary).toBe(false);
		});

		it('should filter by event type when specified', () => {
			mockStatement.all.mockReturnValue([]);

			getWindowEvents(mockDb, 'week', 'session_moved');

			// Verify the query includes the event type filter
			const prepareCall = mockDb.prepare as ReturnType<typeof vi.fn>;
			const lastQuery = prepareCall.mock.calls[prepareCall.mock.calls.length - 1][0];
			expect(lastQuery).toContain('event_type = ?');
		});
	});

	describe('getWindowStatsAggregation', () => {
		it('should return aggregated window statistics', () => {
			// Mock the individual queries
			mockStatement.get
				.mockReturnValueOnce({ count: 5 }) // windows created
				.mockReturnValueOnce({ count: 10 }) // session moves
				.mockReturnValueOnce({ peak: 3 }); // peak concurrent

			mockStatement.all.mockReturnValueOnce([
				{ date: '2026-01-30', created: 2, closed: 1 },
				{ date: '2026-01-31', created: 3, closed: 2 },
			]);

			const stats = getWindowStatsAggregation(mockDb, 'week');

			expect(stats.totalWindowsCreated).toBe(5);
			expect(stats.totalSessionMoves).toBe(10);
			expect(stats.peakConcurrentWindows).toBe(3);
			expect(stats.windowsByDay.length).toBe(2);
			expect(stats.avgSessionMovesPerWindow).toBe(2); // 10/5
		});

		it('should handle empty data gracefully', () => {
			mockStatement.get
				.mockReturnValueOnce({ count: 0 })
				.mockReturnValueOnce({ count: 0 })
				.mockReturnValueOnce({ peak: null });

			mockStatement.all.mockReturnValueOnce([]);

			const stats = getWindowStatsAggregation(mockDb, 'all');

			expect(stats.totalWindowsCreated).toBe(0);
			expect(stats.totalSessionMoves).toBe(0);
			expect(stats.peakConcurrentWindows).toBe(1); // Default to 1 when no data
			expect(stats.windowsByDay.length).toBe(0);
			expect(stats.avgSessionMovesPerWindow).toBe(0);
		});
	});
});

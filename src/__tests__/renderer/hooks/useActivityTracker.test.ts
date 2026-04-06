import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useActivityTracker, UseActivityTrackerReturn } from '../../../renderer/hooks';
import type { Session } from '../../../renderer/types';
import { updateSessionWith } from '../../../renderer/stores/sessionStore';

vi.mock('../../../renderer/stores/sessionStore', () => ({
	updateSessionWith: vi.fn(),
}));

const mockUpdateSessionWith = vi.mocked(updateSessionWith);

// Constants matching the source file
const ACTIVITY_TIMEOUT_MS = 60000; // 1 minute of inactivity = idle
const TICK_INTERVAL_MS = 1000; // Update every second
const BATCH_UPDATE_INTERVAL_MS = 30000; // Batch updates every 30 seconds

// Helper to create a mock session for updater testing
const createMockSessionData = (overrides: Partial<Session> = {}): Session =>
	({
		id: 'session-1',
		name: 'Test Session 1',
		activeTimeMs: 0,
		toolType: 'claude-code',
		state: 'idle',
		inputMode: 'ai',
		cwd: '/test',
		projectRoot: '/test',
		isGitRepo: false,
		fileTree: [],
		fileExplorerExpanded: [],
		aiLogs: [],
		shellLogs: [],
		messageQueue: [],
		...overrides,
	}) as Session;

describe('useActivityTracker', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		mockUpdateSessionWith.mockClear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	describe('initial state', () => {
		it('returns onActivity callback', () => {
			const { result } = renderHook(() => useActivityTracker('session-1'));

			expect(result.current).toBeDefined();
			expect(result.current.onActivity).toBeDefined();
			expect(typeof result.current.onActivity).toBe('function');
		});

		it('does not call updateSessionWith on mount', () => {
			renderHook(() => useActivityTracker('session-1'));

			expect(mockUpdateSessionWith).not.toHaveBeenCalled();
		});
	});

	describe('onActivity callback', () => {
		it('onActivity is stable (same reference across renders)', () => {
			const { result, rerender } = renderHook(({ sessionId }) => useActivityTracker(sessionId), {
				initialProps: { sessionId: 'session-1' },
			});

			const firstOnActivity = result.current.onActivity;
			rerender({ sessionId: 'session-1' });

			expect(result.current.onActivity).toBe(firstOnActivity);
		});

		it('onActivity marks user as active', () => {
			const { result } = renderHook(() => useActivityTracker('session-1'));

			// Call onActivity
			act(() => {
				result.current.onActivity();
			});

			// Advance time to trigger batch update (30 seconds)
			act(() => {
				vi.advanceTimersByTime(BATCH_UPDATE_INTERVAL_MS);
			});

			// Should have called updateSessionWith with accumulated time
			expect(mockUpdateSessionWith).toHaveBeenCalled();
		});
	});

	describe('time accumulation', () => {
		it('accumulates time every second when active', () => {
			const { result } = renderHook(() => useActivityTracker('session-1'));

			// Mark as active
			act(() => {
				result.current.onActivity();
			});

			// Advance 30 seconds to trigger batch update
			act(() => {
				vi.advanceTimersByTime(BATCH_UPDATE_INTERVAL_MS);
			});

			// Should have accumulated ~30 seconds
			expect(mockUpdateSessionWith).toHaveBeenCalled();
			expect(mockUpdateSessionWith).toHaveBeenCalledWith('session-1', expect.any(Function));
			const updaterFn = mockUpdateSessionWith.mock.calls[0][1];
			const mockSession = createMockSessionData({ id: 'session-1', activeTimeMs: 0 });
			const updatedSession = updaterFn(mockSession);

			// Session 1 should have accumulated time
			expect(updatedSession.activeTimeMs).toBe(BATCH_UPDATE_INTERVAL_MS);
		});

		it('does not update state before batch interval', () => {
			const { result } = renderHook(() => useActivityTracker('session-1'));

			// Mark as active
			act(() => {
				result.current.onActivity();
			});

			// Advance less than batch interval
			act(() => {
				vi.advanceTimersByTime(BATCH_UPDATE_INTERVAL_MS - 1000);
			});

			// Should not have called updateSessionWith yet
			expect(mockUpdateSessionWith).not.toHaveBeenCalled();
		});

		it('does batch update at correct interval', () => {
			const { result } = renderHook(() => useActivityTracker('session-1'));

			// Mark as active
			act(() => {
				result.current.onActivity();
			});

			// Advance exactly to batch update interval
			act(() => {
				vi.advanceTimersByTime(BATCH_UPDATE_INTERVAL_MS);
			});

			expect(mockUpdateSessionWith).toHaveBeenCalledTimes(1);
		});

		it('accumulates time correctly over multiple batch intervals', () => {
			const { result } = renderHook(() => useActivityTracker('session-1'));

			// Mark as active
			act(() => {
				result.current.onActivity();
			});

			// First batch update
			act(() => {
				vi.advanceTimersByTime(BATCH_UPDATE_INTERVAL_MS);
			});

			expect(mockUpdateSessionWith).toHaveBeenCalledTimes(1);

			// Keep activity alive
			act(() => {
				result.current.onActivity();
			});

			// Second batch update
			act(() => {
				vi.advanceTimersByTime(BATCH_UPDATE_INTERVAL_MS);
			});

			expect(mockUpdateSessionWith).toHaveBeenCalledTimes(2);
		});

		it('only updates the active session', () => {
			const { result } = renderHook(() => useActivityTracker('session-1'));

			// Mark as active
			act(() => {
				result.current.onActivity();
			});

			// Trigger batch update
			act(() => {
				vi.advanceTimersByTime(BATCH_UPDATE_INTERVAL_MS);
			});

			// updateSessionWith is called with the active session ID only
			expect(mockUpdateSessionWith).toHaveBeenCalledWith('session-1', expect.any(Function));
			const updaterFn = mockUpdateSessionWith.mock.calls[0][1];
			const mockSession = createMockSessionData({ id: 'session-1', activeTimeMs: 0 });
			const updatedSession = updaterFn(mockSession);

			// Session 1 should be updated
			expect(updatedSession.activeTimeMs).toBe(BATCH_UPDATE_INTERVAL_MS);
		});

		it('preserves existing activeTimeMs when updating', () => {
			const { result } = renderHook(() => useActivityTracker('session-1'));

			// Mark as active
			act(() => {
				result.current.onActivity();
			});

			// Trigger batch update
			act(() => {
				vi.advanceTimersByTime(BATCH_UPDATE_INTERVAL_MS);
			});

			const updaterFn = mockUpdateSessionWith.mock.calls[0][1];
			// Session with existing time
			const sessionWithTime = createMockSessionData({ id: 'session-1', activeTimeMs: 10000 });
			const updatedSession = updaterFn(sessionWithTime);

			// Should add to existing time
			expect(updatedSession.activeTimeMs).toBe(10000 + BATCH_UPDATE_INTERVAL_MS);
		});

		it('handles undefined activeTimeMs gracefully', () => {
			const { result } = renderHook(() => useActivityTracker('session-1'));

			act(() => {
				result.current.onActivity();
			});

			act(() => {
				vi.advanceTimersByTime(BATCH_UPDATE_INTERVAL_MS);
			});

			const updaterFn = mockUpdateSessionWith.mock.calls[0][1];
			const sessionWithUndefined = createMockSessionData({
				id: 'session-1',
				activeTimeMs: undefined as any,
			});
			const updatedSession = updaterFn(sessionWithUndefined);

			// Should treat undefined as 0
			expect(updatedSession.activeTimeMs).toBe(BATCH_UPDATE_INTERVAL_MS);
		});
	});

	describe('activity timeout', () => {
		it('stops accumulating time after inactivity timeout', () => {
			const { result } = renderHook(() => useActivityTracker('session-1'));

			// Mark as active
			act(() => {
				result.current.onActivity();
			});

			// Advance past inactivity timeout (60 seconds)
			act(() => {
				vi.advanceTimersByTime(ACTIVITY_TIMEOUT_MS + 1000);
			});

			mockUpdateSessionWith.mockClear();

			// Advance another batch interval without new activity
			act(() => {
				vi.advanceTimersByTime(BATCH_UPDATE_INTERVAL_MS);
			});

			// Should not have called updateSessionWith (user is idle)
			expect(mockUpdateSessionWith).not.toHaveBeenCalled();
		});

		it('resumes tracking after new activity', () => {
			const { result } = renderHook(() => useActivityTracker('session-1'));

			// Mark as active
			act(() => {
				result.current.onActivity();
			});

			// Go idle
			act(() => {
				vi.advanceTimersByTime(ACTIVITY_TIMEOUT_MS + 1000);
			});

			mockUpdateSessionWith.mockClear();

			// New activity
			act(() => {
				result.current.onActivity();
			});

			// Advance to next batch update
			act(() => {
				vi.advanceTimersByTime(BATCH_UPDATE_INTERVAL_MS);
			});

			// Should have resumed tracking
			expect(mockUpdateSessionWith).toHaveBeenCalled();
		});

		it('does not accumulate time when user is initially idle', () => {
			renderHook(() => useActivityTracker('session-1'));

			// Advance time without any activity
			act(() => {
				vi.advanceTimersByTime(BATCH_UPDATE_INTERVAL_MS * 2);
			});

			// Should not have called updateSessionWith
			expect(mockUpdateSessionWith).not.toHaveBeenCalled();
		});
	});

	describe('session changes', () => {
		it('flushes accumulated time on session change', () => {
			const { result, rerender } = renderHook(({ sessionId }) => useActivityTracker(sessionId), {
				initialProps: { sessionId: 'session-1' as string | null },
			});

			// Mark as active and accumulate some time
			act(() => {
				result.current.onActivity();
			});

			// Advance less than batch interval to have accumulated but unflushed time
			act(() => {
				vi.advanceTimersByTime(TICK_INTERVAL_MS * 15); // 15 seconds
			});

			// Change session (triggers cleanup)
			rerender({ sessionId: 'session-2' });

			// Should flush accumulated time for session-1
			expect(mockUpdateSessionWith).toHaveBeenCalled();
			expect(mockUpdateSessionWith).toHaveBeenCalledWith('session-1', expect.any(Function));
			const updaterFn = mockUpdateSessionWith.mock.calls[0][1];
			const mockSession = createMockSessionData({ id: 'session-1', activeTimeMs: 0 });
			const updatedSession = updaterFn(mockSession);

			// Session 1 should have the flushed accumulated time
			expect(updatedSession.activeTimeMs).toBeGreaterThan(0);
			expect(updatedSession.activeTimeMs).toBeLessThanOrEqual(15000);
		});

		it('does not flush when no time accumulated', () => {
			const { rerender } = renderHook(({ sessionId }) => useActivityTracker(sessionId), {
				initialProps: { sessionId: 'session-1' as string | null },
			});

			// No activity, change session
			rerender({ sessionId: 'session-2' });

			// Should not have called updateSessionWith
			expect(mockUpdateSessionWith).not.toHaveBeenCalled();
		});

		it('handles null session ID', () => {
			const { result, rerender } = renderHook(({ sessionId }) => useActivityTracker(sessionId), {
				initialProps: { sessionId: null as string | null },
			});

			// Mark as active
			act(() => {
				result.current.onActivity();
			});

			// Advance to batch update
			act(() => {
				vi.advanceTimersByTime(BATCH_UPDATE_INTERVAL_MS);
			});

			// Should not call updateSessionWith when sessionId is null
			expect(mockUpdateSessionWith).not.toHaveBeenCalled();
		});

		it('does not flush on unmount when sessionId is null', () => {
			const { result, unmount } = renderHook(({ sessionId }) => useActivityTracker(sessionId), {
				initialProps: { sessionId: null as string | null },
			});

			// Mark as active and accumulate time
			act(() => {
				result.current.onActivity();
			});

			act(() => {
				vi.advanceTimersByTime(TICK_INTERVAL_MS * 10);
			});

			// Unmount
			unmount();

			// Should not call updateSessionWith
			expect(mockUpdateSessionWith).not.toHaveBeenCalled();
		});
	});

	describe('cleanup on unmount', () => {
		it('flushes accumulated time on unmount', () => {
			const { result, unmount } = renderHook(() => useActivityTracker('session-1'));

			// Mark as active and accumulate time
			act(() => {
				result.current.onActivity();
			});

			act(() => {
				vi.advanceTimersByTime(TICK_INTERVAL_MS * 10); // 10 seconds
			});

			// Unmount
			unmount();

			// Should flush accumulated time
			expect(mockUpdateSessionWith).toHaveBeenCalled();
		});

		it('clears interval on unmount', () => {
			const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

			const { result, unmount } = renderHook(() => useActivityTracker('session-1'));

			// Trigger activity to start the interval
			act(() => {
				result.current.onActivity();
			});

			unmount();

			expect(clearIntervalSpy).toHaveBeenCalled();
		});
	});

	describe('global event listeners (via shared activity bus)', () => {
		it('registers passive activity listeners on mount', () => {
			const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

			renderHook(() => useActivityTracker('session-1'));

			// Activity listeners are registered through the shared activity bus
			// with passive option (they never call preventDefault, so browser can optimize)
			expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function), {
				passive: true,
			});
			expect(addEventListenerSpy).toHaveBeenCalledWith('mousedown', expect.any(Function), {
				passive: true,
			});
			// Note: mousemove is intentionally NOT listened to (CPU performance optimization)
			expect(addEventListenerSpy).toHaveBeenCalledWith('wheel', expect.any(Function), {
				passive: true,
			});
			expect(addEventListenerSpy).toHaveBeenCalledWith('touchstart', expect.any(Function), {
				passive: true,
			});
			expect(addEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function), {
				passive: true,
			});
		});

		it('removes activity listeners on unmount', () => {
			const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

			const { unmount } = renderHook(() => useActivityTracker('session-1'));

			unmount();

			// Shared activity bus detaches all listeners when last subscriber unsubscribes
			expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
			expect(removeEventListenerSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));
			expect(removeEventListenerSpy).toHaveBeenCalledWith('wheel', expect.any(Function));
			expect(removeEventListenerSpy).toHaveBeenCalledWith('touchstart', expect.any(Function));
			expect(removeEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function));
		});

		it('responds to keydown events', () => {
			renderHook(() => useActivityTracker('session-1'));

			// Simulate keydown
			act(() => {
				window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
			});

			// Advance to batch update
			act(() => {
				vi.advanceTimersByTime(BATCH_UPDATE_INTERVAL_MS);
			});

			expect(mockUpdateSessionWith).toHaveBeenCalled();
		});

		it('responds to mousedown events', () => {
			renderHook(() => useActivityTracker('session-1'));

			act(() => {
				window.dispatchEvent(new MouseEvent('mousedown'));
			});

			act(() => {
				vi.advanceTimersByTime(BATCH_UPDATE_INTERVAL_MS);
			});

			expect(mockUpdateSessionWith).toHaveBeenCalled();
		});

		// Note: mousemove is intentionally NOT listened to for CPU performance
		// (it fires hundreds of times per second during cursor movement)

		it('responds to wheel events', () => {
			renderHook(() => useActivityTracker('session-1'));

			act(() => {
				window.dispatchEvent(new WheelEvent('wheel'));
			});

			act(() => {
				vi.advanceTimersByTime(BATCH_UPDATE_INTERVAL_MS);
			});

			expect(mockUpdateSessionWith).toHaveBeenCalled();
		});

		it('responds to touchstart events', () => {
			renderHook(() => useActivityTracker('session-1'));

			act(() => {
				window.dispatchEvent(new TouchEvent('touchstart'));
			});

			act(() => {
				vi.advanceTimersByTime(BATCH_UPDATE_INTERVAL_MS);
			});

			expect(mockUpdateSessionWith).toHaveBeenCalled();
		});

		it('multiple event types all mark activity', () => {
			renderHook(() => useActivityTracker('session-1'));

			// Fire different events
			act(() => {
				window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
			});

			// Advance but stay within activity timeout
			act(() => {
				vi.advanceTimersByTime(10000);
			});

			act(() => {
				window.dispatchEvent(new MouseEvent('mousedown'));
			});

			act(() => {
				vi.advanceTimersByTime(10000);
			});

			act(() => {
				window.dispatchEvent(new WheelEvent('wheel'));
			});

			act(() => {
				vi.advanceTimersByTime(10000);
			});

			// Should trigger batch update
			expect(mockUpdateSessionWith).toHaveBeenCalled();
		});
	});

	describe('edge cases', () => {
		it('handles rapid session switches', () => {
			const { result, rerender } = renderHook(({ sessionId }) => useActivityTracker(sessionId), {
				initialProps: { sessionId: 'session-1' as string | null },
			});

			act(() => {
				result.current.onActivity();
			});

			// Rapid switches
			rerender({ sessionId: 'session-2' });
			rerender({ sessionId: 'session-1' });
			rerender({ sessionId: 'session-2' });

			// Should handle without errors
			expect(mockUpdateSessionWith).toBeDefined();
		});

		it('handles session ID changing from null to valid', () => {
			const { result, rerender } = renderHook(({ sessionId }) => useActivityTracker(sessionId), {
				initialProps: { sessionId: null as string | null },
			});

			// Change to valid session
			rerender({ sessionId: 'session-1' });

			// New activity after session is valid
			act(() => {
				result.current.onActivity();
			});

			// Advance to batch update (need time to accumulate first, then hit batch interval)
			act(() => {
				vi.advanceTimersByTime(BATCH_UPDATE_INTERVAL_MS + TICK_INTERVAL_MS);
			});

			// Should track for the new session
			expect(mockUpdateSessionWith).toHaveBeenCalled();
		});

		it('handles session ID changing from valid to null', () => {
			const { result, rerender } = renderHook(({ sessionId }) => useActivityTracker(sessionId), {
				initialProps: { sessionId: 'session-1' as string | null },
			});

			act(() => {
				result.current.onActivity();
			});

			act(() => {
				vi.advanceTimersByTime(TICK_INTERVAL_MS * 10);
			});

			// Flush happens on change
			rerender({ sessionId: null });

			// Should have flushed accumulated time
			expect(mockUpdateSessionWith).toHaveBeenCalled();
		});

		it('handles updateSessionWith being called with current state', () => {
			const { result } = renderHook(() => useActivityTracker('session-1'));

			act(() => {
				result.current.onActivity();
			});

			act(() => {
				vi.advanceTimersByTime(BATCH_UPDATE_INTERVAL_MS);
			});

			// Verify updateSessionWith was called with sessionId and updater
			expect(mockUpdateSessionWith).toHaveBeenCalled();
			expect(mockUpdateSessionWith).toHaveBeenCalledWith('session-1', expect.any(Function));
			const updaterFn = mockUpdateSessionWith.mock.calls[0][1];
			expect(typeof updaterFn).toBe('function');

			// Test updater with a session
			const mockSession = createMockSessionData({ id: 'session-1', activeTimeMs: 0 });
			const updatedSession = updaterFn(mockSession);
			expect(updatedSession.activeTimeMs).toBe(BATCH_UPDATE_INTERVAL_MS);
		});

		it('calls updateSessionWith with the correct session ID', () => {
			const { result } = renderHook(() => useActivityTracker('non-existent-session'));

			act(() => {
				result.current.onActivity();
			});

			act(() => {
				vi.advanceTimersByTime(BATCH_UPDATE_INTERVAL_MS);
			});

			expect(mockUpdateSessionWith).toHaveBeenCalled();
			// updateSessionWith is called with the session ID passed to the hook
			expect(mockUpdateSessionWith).toHaveBeenCalledWith(
				'non-existent-session',
				expect.any(Function)
			);
		});

		it('handles very long activity periods', () => {
			const { result } = renderHook(() => useActivityTracker('session-1'));

			// Keep activity going for a long time with periodic refreshes
			for (let i = 0; i < 10; i++) {
				act(() => {
					result.current.onActivity();
				});

				act(() => {
					vi.advanceTimersByTime(BATCH_UPDATE_INTERVAL_MS);
				});
			}

			// Should have called updateSessionWith 10 times
			expect(mockUpdateSessionWith).toHaveBeenCalledTimes(10);
		});

		it('handles continuous activity without gaps', () => {
			const { result } = renderHook(() => useActivityTracker('session-1'));

			// Activity every second for 60 seconds
			for (let i = 0; i < 60; i++) {
				act(() => {
					result.current.onActivity();
					vi.advanceTimersByTime(TICK_INTERVAL_MS);
				});
			}

			// Should have 2 batch updates (at 30s and 60s)
			expect(mockUpdateSessionWith).toHaveBeenCalledTimes(2);
		});
	});

	describe('return type', () => {
		it('matches UseActivityTrackerReturn interface', () => {
			const { result } = renderHook(() => useActivityTracker('session-1'));

			const returnValue: UseActivityTrackerReturn = result.current;

			expect(returnValue).toHaveProperty('onActivity');
			expect(typeof returnValue.onActivity).toBe('function');
		});
	});

	describe('timing precision', () => {
		it('tick interval is 1 second', () => {
			const setIntervalSpy = vi.spyOn(global, 'setInterval');

			const { result } = renderHook(() => useActivityTracker('session-1'));

			// Interval only starts on activity (CPU optimization)
			act(() => {
				result.current.onActivity();
			});

			expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), TICK_INTERVAL_MS);
		});

		it('accumulates exactly TICK_INTERVAL_MS per tick', () => {
			const { result } = renderHook(() => useActivityTracker('session-1'));

			act(() => {
				result.current.onActivity();
			});

			// Advance exactly 30 ticks
			act(() => {
				vi.advanceTimersByTime(TICK_INTERVAL_MS * 30);
			});

			expect(mockUpdateSessionWith).toHaveBeenCalled();
			const updaterFn = mockUpdateSessionWith.mock.calls[0][1];
			const mockSession = createMockSessionData({ id: 'session-1', activeTimeMs: 0 });
			const updatedSession = updaterFn(mockSession);

			// Should have accumulated exactly 30 seconds
			expect(updatedSession.activeTimeMs).toBe(TICK_INTERVAL_MS * 30);
		});

		it('resets accumulated time after batch update', () => {
			const { result } = renderHook(() => useActivityTracker('session-1'));

			act(() => {
				result.current.onActivity();
			});

			// First batch update
			act(() => {
				vi.advanceTimersByTime(BATCH_UPDATE_INTERVAL_MS);
			});

			const firstUpdaterFn = mockUpdateSessionWith.mock.calls[0][1];
			const mockSession = createMockSessionData({ id: 'session-1', activeTimeMs: 0 });
			const firstResult = firstUpdaterFn(mockSession);
			expect(firstResult.activeTimeMs).toBe(BATCH_UPDATE_INTERVAL_MS);

			// Keep active
			act(() => {
				result.current.onActivity();
			});

			// Second batch update
			act(() => {
				vi.advanceTimersByTime(BATCH_UPDATE_INTERVAL_MS);
			});

			const secondUpdaterFn = mockUpdateSessionWith.mock.calls[1][1];
			// Use updated session from first call
			const secondResult = secondUpdaterFn(firstResult);

			// Should have added another 30 seconds
			expect(secondResult.activeTimeMs).toBe(BATCH_UPDATE_INTERVAL_MS * 2);
		});
	});

	describe('activity detection edge cases', () => {
		it('marks activity on exact timeout boundary', () => {
			const { result } = renderHook(() => useActivityTracker('session-1'));

			act(() => {
				result.current.onActivity();
			});

			// Advance to batch update (within timeout)
			act(() => {
				vi.advanceTimersByTime(BATCH_UPDATE_INTERVAL_MS);
			});

			// Should have accumulated time
			expect(mockUpdateSessionWith).toHaveBeenCalled();

			// Clear and test at boundary
			mockUpdateSessionWith.mockClear();

			// New activity just before timeout expires
			act(() => {
				vi.advanceTimersByTime(ACTIVITY_TIMEOUT_MS - BATCH_UPDATE_INTERVAL_MS - 1);
			});

			act(() => {
				result.current.onActivity();
			});

			// Advance another batch interval
			act(() => {
				vi.advanceTimersByTime(BATCH_UPDATE_INTERVAL_MS);
			});

			// Should still be tracking
			expect(mockUpdateSessionWith).toHaveBeenCalled();
		});

		it('becomes idle exactly at timeout', () => {
			const { result } = renderHook(() => useActivityTracker('session-1'));

			act(() => {
				result.current.onActivity();
			});

			// Advance to batch update
			act(() => {
				vi.advanceTimersByTime(BATCH_UPDATE_INTERVAL_MS);
			});

			mockUpdateSessionWith.mockClear();

			// Advance to exactly at timeout (no new activity)
			act(() => {
				vi.advanceTimersByTime(ACTIVITY_TIMEOUT_MS - BATCH_UPDATE_INTERVAL_MS);
			});

			// Advance more - should be idle now
			act(() => {
				vi.advanceTimersByTime(BATCH_UPDATE_INTERVAL_MS);
			});

			// Should not call updateSessionWith when idle
			expect(mockUpdateSessionWith).not.toHaveBeenCalled();
		});
	});
});

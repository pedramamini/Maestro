/**
 * Tests for WakaTime heartbeat listener.
 * Verifies that query-complete events trigger heartbeats and exit events clean up sessions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupWakaTimeListener } from '../wakatime-listener';
import type { ProcessManager } from '../../process-manager';
import type { WakaTimeManager } from '../../wakatime-manager';
import type { QueryCompleteData } from '../../process-manager/types';

describe('WakaTime Listener', () => {
	let mockProcessManager: ProcessManager;
	let mockWakaTimeManager: WakaTimeManager;
	let eventHandlers: Map<string, (...args: unknown[]) => void>;

	beforeEach(() => {
		vi.clearAllMocks();
		eventHandlers = new Map();

		mockProcessManager = {
			on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
				// Allow multiple handlers per event by appending index
				const key = eventHandlers.has(event) ? `${event}:2` : event;
				eventHandlers.set(key, handler);
			}),
		} as unknown as ProcessManager;

		mockWakaTimeManager = {
			sendHeartbeat: vi.fn().mockResolvedValue(undefined),
			removeSession: vi.fn(),
		} as unknown as WakaTimeManager;
	});

	it('should register query-complete and exit event listeners', () => {
		setupWakaTimeListener(mockProcessManager, mockWakaTimeManager);

		expect(mockProcessManager.on).toHaveBeenCalledWith('query-complete', expect.any(Function));
		expect(mockProcessManager.on).toHaveBeenCalledWith('exit', expect.any(Function));
	});

	it('should send heartbeat on query-complete with projectPath and tabId', () => {
		setupWakaTimeListener(mockProcessManager, mockWakaTimeManager);

		const handler = eventHandlers.get('query-complete');
		const queryData: QueryCompleteData = {
			sessionId: 'session-abc',
			agentType: 'claude-code',
			source: 'user',
			startTime: Date.now(),
			duration: 5000,
			projectPath: '/home/user/project',
			tabId: 'My Project Tab',
		};

		handler?.('session-abc', queryData);

		expect(mockWakaTimeManager.sendHeartbeat).toHaveBeenCalledWith(
			'session-abc',
			'/home/user/project',
			'My Project Tab'
		);
	});

	it('should fallback to sessionId when projectPath is missing', () => {
		setupWakaTimeListener(mockProcessManager, mockWakaTimeManager);

		const handler = eventHandlers.get('query-complete');
		const queryData: QueryCompleteData = {
			sessionId: 'session-fallback',
			agentType: 'claude-code',
			source: 'user',
			startTime: Date.now(),
			duration: 1000,
		};

		handler?.('session-fallback', queryData);

		expect(mockWakaTimeManager.sendHeartbeat).toHaveBeenCalledWith(
			'session-fallback',
			'session-fallback', // projectPath fallback
			'session-fallback'  // projectName fallback
		);
	});

	it('should remove session on exit event', () => {
		setupWakaTimeListener(mockProcessManager, mockWakaTimeManager);

		const handler = eventHandlers.get('exit');
		handler?.('session-exit-123');

		expect(mockWakaTimeManager.removeSession).toHaveBeenCalledWith('session-exit-123');
	});
});

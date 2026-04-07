/**
 * Tests for useActiveSession hook
 *
 * Verifies the hook correctly selects the active session from the session store.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useActiveSession } from '../../../renderer/hooks/session/useActiveSession';
import { useSessionStore } from '../../../renderer/stores/sessionStore';
import type { Session } from '../../../renderer/types';

function createMockSession(overrides: Partial<Session> = {}): Session {
	return {
		id: 'sess-1',
		name: 'Test Session',
		toolType: 'claude-code',
		state: 'idle',
		cwd: '/test/project',
		fullPath: '/test/project',
		projectRoot: '/test/project',
		aiLogs: [],
		shellLogs: [],
		workLog: [],
		contextUsage: 0,
		inputMode: 'ai',
		aiPid: 0,
		terminalPid: 0,
		port: 0,
		isLive: false,
		changedFiles: [],
		isGitRepo: true,
		fileTree: [],
		fileExplorerExpanded: [],
		fileExplorerScrollPos: 0,
		aiTabs: [
			{
				id: 'tab-1',
				agentSessionId: null,
				name: null,
				starred: false,
				logs: [],
				inputValue: '',
				stagedImages: [],
				createdAt: 1700000000000,
				state: 'idle' as const,
				saveToHistory: true,
			},
		],
		activeTabId: 'tab-1',
		closedTabHistory: [],
		executionQueue: [],
		activeTimeMs: 0,
		filePreviewTabs: [],
		activeFileTabId: null,
		unifiedTabOrder: [{ type: 'ai' as const, id: 'tab-1' }],
		unifiedClosedTabHistory: [],
		terminalTabs: [],
		activeTerminalTabId: null,
		...overrides,
	} as Session;
}

beforeEach(() => {
	useSessionStore.setState({
		sessions: [],
		groups: [],
		activeSessionId: '',
		initialLoadComplete: false,
		removedWorktreePaths: new Set(),
	});
});

describe('useActiveSession', () => {
	it('returns null when no sessions exist', () => {
		const { result } = renderHook(() => useActiveSession());
		expect(result.current).toBeNull();
	});

	it('falls back to first session when activeSessionId does not match', () => {
		useSessionStore.setState({
			sessions: [createMockSession({ id: 'sess-1' })],
			activeSessionId: 'nonexistent',
		});

		const { result } = renderHook(() => useActiveSession());
		// selectActiveSession falls back to sessions[0] when no ID match
		expect(result.current).not.toBeNull();
		expect(result.current!.id).toBe('sess-1');
	});

	it('returns the active session when it matches', () => {
		const session = createMockSession({ id: 'sess-1', name: 'My Agent' });
		useSessionStore.setState({
			sessions: [session],
			activeSessionId: 'sess-1',
		});

		const { result } = renderHook(() => useActiveSession());
		expect(result.current).not.toBeNull();
		expect(result.current!.id).toBe('sess-1');
		expect(result.current!.name).toBe('My Agent');
	});

	it('updates when activeSessionId changes', () => {
		const session1 = createMockSession({ id: 'sess-1', name: 'Agent 1' });
		const session2 = createMockSession({ id: 'sess-2', name: 'Agent 2' });
		useSessionStore.setState({
			sessions: [session1, session2],
			activeSessionId: 'sess-1',
		});

		const { result, rerender } = renderHook(() => useActiveSession());
		expect(result.current!.id).toBe('sess-1');

		useSessionStore.setState({ activeSessionId: 'sess-2' });
		rerender();

		expect(result.current!.id).toBe('sess-2');
		expect(result.current!.name).toBe('Agent 2');
	});
});

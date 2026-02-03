/**
 * Tests for SessionContext - Session Switching with File Tabs
 *
 * This test suite verifies that:
 * 1. Each session maintains its own file tabs independently
 * 2. Session switching properly switches to new session's file tabs
 * 3. Switching back to a session restores its file tabs correctly
 * 4. File tab state (scroll position, search query, edit mode) is per-session
 * 5. Active file tab ID is per-session
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, renderHook, act } from '@testing-library/react';
import React, { useState, useCallback } from 'react';
import { SessionProvider, useSession } from '../../../renderer/contexts/SessionContext';
import type { Session, AITab, FilePreviewTab, UnifiedTabRef } from '../../../renderer/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal AITab with sensible defaults */
const makeTab = (overrides: Partial<AITab> = {}): AITab => ({
	id: overrides.id ?? `tab-${Math.random().toString(36).slice(2, 8)}`,
	agentSessionId: null,
	name: null,
	starred: false,
	logs: [],
	inputValue: '',
	stagedImages: [],
	createdAt: Date.now(),
	state: 'idle',
	...overrides,
});

/** Create a minimal FilePreviewTab for testing */
const makeFilePreviewTab = (overrides: Partial<FilePreviewTab> = {}): FilePreviewTab => ({
	id: overrides.id ?? `file-tab-${Math.random().toString(36).slice(2, 8)}`,
	path: overrides.path ?? '/test/file.ts',
	name: overrides.name ?? 'file',
	extension: overrides.extension ?? '.ts',
	content: overrides.content ?? 'console.log("test");',
	scrollTop: overrides.scrollTop ?? 0,
	searchQuery: overrides.searchQuery ?? '',
	editMode: overrides.editMode ?? false,
	editContent: overrides.editContent ?? undefined,
	createdAt: overrides.createdAt ?? Date.now(),
	lastModified: overrides.lastModified ?? Date.now(),
	sshRemoteId: overrides.sshRemoteId,
	isLoading: overrides.isLoading,
});

/** Create a minimal Session with sensible defaults */
const makeSession = (overrides: Partial<Session> = {}): Session => {
	const defaultTab = makeTab({ id: 'default-tab' });
	return {
		id: overrides.id ?? `session-${Math.random().toString(36).slice(2, 8)}`,
		name: 'Test Session',
		toolType: 'claude-code',
		state: 'idle',
		cwd: '/test',
		fullPath: '/test',
		projectRoot: '/test',
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
		isGitRepo: false,
		fileTree: [],
		fileExplorerExpanded: [],
		fileExplorerScrollPos: 0,
		executionQueue: [],
		activeTimeMs: 0,
		aiTabs: [defaultTab],
		activeTabId: defaultTab.id,
		closedTabHistory: [],
		filePreviewTabs: overrides.filePreviewTabs ?? [],
		activeFileTabId: overrides.activeFileTabId ?? null,
		unifiedTabOrder: overrides.unifiedTabOrder ?? [{ type: 'ai' as const, id: defaultTab.id }],
		unifiedClosedTabHistory: overrides.unifiedClosedTabHistory ?? [],
		...overrides,
	} as Session;
};

// ---------------------------------------------------------------------------
// Test Wrapper Component
// ---------------------------------------------------------------------------

/**
 * A test component that exposes session context for testing.
 * This component simulates an app that manages multiple sessions.
 */
interface TestAppProps {
	initialSessions: Session[];
	initialActiveSessionId: string;
	onSessionChange?: (sessionId: string) => void;
}

function TestApp({ initialSessions, initialActiveSessionId, onSessionChange }: TestAppProps) {
	const { sessions, setSessions, activeSessionId, setActiveSessionId, activeSession } = useSession();

	// Initialize sessions on first render
	React.useEffect(() => {
		if (sessions.length === 0 && initialSessions.length > 0) {
			setSessions(initialSessions);
			setActiveSessionId(initialActiveSessionId);
		}
	}, [initialSessions, initialActiveSessionId, sessions.length, setSessions, setActiveSessionId]);

	const handleSwitch = useCallback((id: string) => {
		setActiveSessionId(id);
		onSessionChange?.(id);
	}, [setActiveSessionId, onSessionChange]);

	return (
		<div>
			<div data-testid="active-session-id">{activeSessionId}</div>
			<div data-testid="active-session-name">{activeSession?.name ?? 'none'}</div>
			<div data-testid="file-tabs-count">{activeSession?.filePreviewTabs?.length ?? 0}</div>
			<div data-testid="active-file-tab-id">{activeSession?.activeFileTabId ?? 'none'}</div>
			{sessions.map(session => (
				<button
					key={session.id}
					data-testid={`switch-to-${session.id}`}
					onClick={() => handleSwitch(session.id)}
				>
					{session.name}
				</button>
			))}
			{activeSession?.filePreviewTabs?.map(tab => (
				<div key={tab.id} data-testid={`file-tab-${tab.id}`}>
					<span data-testid={`file-path-${tab.id}`}>{tab.path}</span>
					<span data-testid={`file-scroll-${tab.id}`}>{tab.scrollTop}</span>
					<span data-testid={`file-search-${tab.id}`}>{tab.searchQuery}</span>
					<span data-testid={`file-edit-${tab.id}`}>{tab.editMode ? 'editing' : 'viewing'}</span>
				</div>
			))}
		</div>
	);
}

function TestAppWrapper(props: TestAppProps) {
	return (
		<SessionProvider>
			<TestApp {...props} />
		</SessionProvider>
	);
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('SessionContext - Session Switching with File Tabs', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('independent file tabs per session', () => {
		it('each session maintains its own file tabs', () => {
			const session1FileTab = makeFilePreviewTab({
				id: 's1-file',
				path: '/session1/app.ts',
				name: 'app',
				scrollTop: 100,
			});
			const session2FileTab = makeFilePreviewTab({
				id: 's2-file',
				path: '/session2/index.ts',
				name: 'index',
				scrollTop: 500,
			});

			const session1 = makeSession({
				id: 'session-1',
				name: 'Session 1',
				filePreviewTabs: [session1FileTab],
				activeFileTabId: 's1-file',
			});
			const session2 = makeSession({
				id: 'session-2',
				name: 'Session 2',
				filePreviewTabs: [session2FileTab],
				activeFileTabId: 's2-file',
			});

			render(<TestAppWrapper initialSessions={[session1, session2]} initialActiveSessionId="session-1" />);

			// Session 1 is active - should see its file tabs
			expect(screen.getByTestId('active-session-id')).toHaveTextContent('session-1');
			expect(screen.getByTestId('file-tabs-count')).toHaveTextContent('1');
			expect(screen.getByTestId('file-path-s1-file')).toHaveTextContent('/session1/app.ts');
			expect(screen.getByTestId('file-scroll-s1-file')).toHaveTextContent('100');
		});

		it('session with no file tabs shows count of 0', () => {
			const session = makeSession({
				id: 'session-no-files',
				name: 'No Files Session',
				filePreviewTabs: [],
				activeFileTabId: null,
			});

			render(<TestAppWrapper initialSessions={[session]} initialActiveSessionId="session-no-files" />);

			expect(screen.getByTestId('file-tabs-count')).toHaveTextContent('0');
			expect(screen.getByTestId('active-file-tab-id')).toHaveTextContent('none');
		});

		it('session with multiple file tabs shows all tabs', () => {
			const tabs = [
				makeFilePreviewTab({ id: 'f1', path: '/src/a.ts' }),
				makeFilePreviewTab({ id: 'f2', path: '/src/b.ts' }),
				makeFilePreviewTab({ id: 'f3', path: '/src/c.ts' }),
			];

			const session = makeSession({
				id: 'multi-tab-session',
				name: 'Multi Tab Session',
				filePreviewTabs: tabs,
				activeFileTabId: 'f2',
			});

			render(<TestAppWrapper initialSessions={[session]} initialActiveSessionId="multi-tab-session" />);

			expect(screen.getByTestId('file-tabs-count')).toHaveTextContent('3');
			expect(screen.getByTestId('file-path-f1')).toHaveTextContent('/src/a.ts');
			expect(screen.getByTestId('file-path-f2')).toHaveTextContent('/src/b.ts');
			expect(screen.getByTestId('file-path-f3')).toHaveTextContent('/src/c.ts');
			expect(screen.getByTestId('active-file-tab-id')).toHaveTextContent('f2');
		});
	});

	describe('session switching updates file tabs', () => {
		it('switches to the new session file tabs when session is changed', async () => {
			const session1 = makeSession({
				id: 'session-1',
				name: 'Session 1',
				filePreviewTabs: [makeFilePreviewTab({ id: 's1-file', path: '/s1/file.ts' })],
				activeFileTabId: 's1-file',
			});
			const session2 = makeSession({
				id: 'session-2',
				name: 'Session 2',
				filePreviewTabs: [makeFilePreviewTab({ id: 's2-file', path: '/s2/file.ts' })],
				activeFileTabId: 's2-file',
			});

			render(<TestAppWrapper initialSessions={[session1, session2]} initialActiveSessionId="session-1" />);

			// Verify initial state - session 1 active
			expect(screen.getByTestId('active-session-id')).toHaveTextContent('session-1');
			expect(screen.getByTestId('file-path-s1-file')).toHaveTextContent('/s1/file.ts');

			// Switch to session 2
			await act(async () => {
				screen.getByTestId('switch-to-session-2').click();
			});

			// Verify session 2's file tabs are now showing
			expect(screen.getByTestId('active-session-id')).toHaveTextContent('session-2');
			expect(screen.queryByTestId('file-path-s1-file')).not.toBeInTheDocument();
			expect(screen.getByTestId('file-path-s2-file')).toHaveTextContent('/s2/file.ts');
		});

		it('switching from session with files to session without files shows empty tabs', async () => {
			const session1 = makeSession({
				id: 'session-with-files',
				name: 'With Files',
				filePreviewTabs: [makeFilePreviewTab({ id: 'f1', path: '/file.ts' })],
				activeFileTabId: 'f1',
			});
			const session2 = makeSession({
				id: 'session-no-files',
				name: 'No Files',
				filePreviewTabs: [],
				activeFileTabId: null,
			});

			render(<TestAppWrapper initialSessions={[session1, session2]} initialActiveSessionId="session-with-files" />);

			// Session 1 has files
			expect(screen.getByTestId('file-tabs-count')).toHaveTextContent('1');

			// Switch to session 2
			await act(async () => {
				screen.getByTestId('switch-to-session-no-files').click();
			});

			// Session 2 has no files
			expect(screen.getByTestId('file-tabs-count')).toHaveTextContent('0');
			expect(screen.getByTestId('active-file-tab-id')).toHaveTextContent('none');
		});

		it('switching from session without files to session with files shows files', async () => {
			const session1 = makeSession({
				id: 'session-no-files',
				name: 'No Files',
				filePreviewTabs: [],
				activeFileTabId: null,
			});
			const session2 = makeSession({
				id: 'session-with-files',
				name: 'With Files',
				filePreviewTabs: [
					makeFilePreviewTab({ id: 'f1', path: '/a.ts' }),
					makeFilePreviewTab({ id: 'f2', path: '/b.ts' }),
				],
				activeFileTabId: 'f1',
			});

			render(<TestAppWrapper initialSessions={[session1, session2]} initialActiveSessionId="session-no-files" />);

			// Start with no files
			expect(screen.getByTestId('file-tabs-count')).toHaveTextContent('0');

			// Switch to session with files
			await act(async () => {
				screen.getByTestId('switch-to-session-with-files').click();
			});

			// Now should see files
			expect(screen.getByTestId('file-tabs-count')).toHaveTextContent('2');
			expect(screen.getByTestId('file-path-f1')).toHaveTextContent('/a.ts');
			expect(screen.getByTestId('file-path-f2')).toHaveTextContent('/b.ts');
		});
	});

	describe('switching back restores file tabs', () => {
		it('switching back to a session restores its file tabs correctly', async () => {
			const session1 = makeSession({
				id: 'session-1',
				name: 'Session 1',
				filePreviewTabs: [makeFilePreviewTab({ id: 's1-file', path: '/s1/original.ts' })],
				activeFileTabId: 's1-file',
			});
			const session2 = makeSession({
				id: 'session-2',
				name: 'Session 2',
				filePreviewTabs: [makeFilePreviewTab({ id: 's2-file', path: '/s2/original.ts' })],
				activeFileTabId: 's2-file',
			});

			render(<TestAppWrapper initialSessions={[session1, session2]} initialActiveSessionId="session-1" />);

			// Start at session 1
			expect(screen.getByTestId('file-path-s1-file')).toHaveTextContent('/s1/original.ts');

			// Switch to session 2
			await act(async () => {
				screen.getByTestId('switch-to-session-2').click();
			});
			expect(screen.getByTestId('file-path-s2-file')).toHaveTextContent('/s2/original.ts');

			// Switch back to session 1
			await act(async () => {
				screen.getByTestId('switch-to-session-1').click();
			});

			// Session 1's file tabs are restored
			expect(screen.getByTestId('file-path-s1-file')).toHaveTextContent('/s1/original.ts');
			expect(screen.queryByTestId('file-path-s2-file')).not.toBeInTheDocument();
		});

		it('preserves scroll position per session when switching', async () => {
			const session1 = makeSession({
				id: 'session-1',
				name: 'Session 1',
				filePreviewTabs: [makeFilePreviewTab({ id: 's1-file', scrollTop: 1500 })],
				activeFileTabId: 's1-file',
			});
			const session2 = makeSession({
				id: 'session-2',
				name: 'Session 2',
				filePreviewTabs: [makeFilePreviewTab({ id: 's2-file', scrollTop: 3000 })],
				activeFileTabId: 's2-file',
			});

			render(<TestAppWrapper initialSessions={[session1, session2]} initialActiveSessionId="session-1" />);

			// Session 1 scroll position
			expect(screen.getByTestId('file-scroll-s1-file')).toHaveTextContent('1500');

			// Switch to session 2
			await act(async () => {
				screen.getByTestId('switch-to-session-2').click();
			});
			expect(screen.getByTestId('file-scroll-s2-file')).toHaveTextContent('3000');

			// Switch back to session 1
			await act(async () => {
				screen.getByTestId('switch-to-session-1').click();
			});

			// Session 1's scroll position is preserved
			expect(screen.getByTestId('file-scroll-s1-file')).toHaveTextContent('1500');
		});

		it('preserves search query per session when switching', async () => {
			const session1 = makeSession({
				id: 'session-1',
				name: 'Session 1',
				filePreviewTabs: [makeFilePreviewTab({ id: 's1-file', searchQuery: 'handleClick' })],
				activeFileTabId: 's1-file',
			});
			const session2 = makeSession({
				id: 'session-2',
				name: 'Session 2',
				filePreviewTabs: [makeFilePreviewTab({ id: 's2-file', searchQuery: 'useState' })],
				activeFileTabId: 's2-file',
			});

			render(<TestAppWrapper initialSessions={[session1, session2]} initialActiveSessionId="session-1" />);

			// Session 1 search query
			expect(screen.getByTestId('file-search-s1-file')).toHaveTextContent('handleClick');

			// Switch to session 2
			await act(async () => {
				screen.getByTestId('switch-to-session-2').click();
			});
			expect(screen.getByTestId('file-search-s2-file')).toHaveTextContent('useState');

			// Switch back to session 1
			await act(async () => {
				screen.getByTestId('switch-to-session-1').click();
			});

			// Session 1's search query is preserved
			expect(screen.getByTestId('file-search-s1-file')).toHaveTextContent('handleClick');
		});

		it('preserves edit mode per session when switching', async () => {
			const session1 = makeSession({
				id: 'session-1',
				name: 'Session 1',
				filePreviewTabs: [makeFilePreviewTab({ id: 's1-file', editMode: true })],
				activeFileTabId: 's1-file',
			});
			const session2 = makeSession({
				id: 'session-2',
				name: 'Session 2',
				filePreviewTabs: [makeFilePreviewTab({ id: 's2-file', editMode: false })],
				activeFileTabId: 's2-file',
			});

			render(<TestAppWrapper initialSessions={[session1, session2]} initialActiveSessionId="session-1" />);

			// Session 1 edit mode
			expect(screen.getByTestId('file-edit-s1-file')).toHaveTextContent('editing');

			// Switch to session 2
			await act(async () => {
				screen.getByTestId('switch-to-session-2').click();
			});
			expect(screen.getByTestId('file-edit-s2-file')).toHaveTextContent('viewing');

			// Switch back to session 1
			await act(async () => {
				screen.getByTestId('switch-to-session-1').click();
			});

			// Session 1's edit mode is preserved
			expect(screen.getByTestId('file-edit-s1-file')).toHaveTextContent('editing');
		});
	});

	describe('active file tab ID per session', () => {
		it('each session tracks its own active file tab', async () => {
			const session1 = makeSession({
				id: 'session-1',
				name: 'Session 1',
				filePreviewTabs: [
					makeFilePreviewTab({ id: 's1-f1' }),
					makeFilePreviewTab({ id: 's1-f2' }),
				],
				activeFileTabId: 's1-f2', // Second tab is active
			});
			const session2 = makeSession({
				id: 'session-2',
				name: 'Session 2',
				filePreviewTabs: [
					makeFilePreviewTab({ id: 's2-f1' }),
					makeFilePreviewTab({ id: 's2-f2' }),
					makeFilePreviewTab({ id: 's2-f3' }),
				],
				activeFileTabId: 's2-f1', // First tab is active
			});

			render(<TestAppWrapper initialSessions={[session1, session2]} initialActiveSessionId="session-1" />);

			// Session 1 has second tab active
			expect(screen.getByTestId('active-file-tab-id')).toHaveTextContent('s1-f2');

			// Switch to session 2
			await act(async () => {
				screen.getByTestId('switch-to-session-2').click();
			});

			// Session 2 has first tab active
			expect(screen.getByTestId('active-file-tab-id')).toHaveTextContent('s2-f1');

			// Switch back to session 1
			await act(async () => {
				screen.getByTestId('switch-to-session-1').click();
			});

			// Session 1 still has second tab active
			expect(screen.getByTestId('active-file-tab-id')).toHaveTextContent('s1-f2');
		});

		it('session with AI tab active has null activeFileTabId', async () => {
			const session1 = makeSession({
				id: 'session-1',
				name: 'Session 1 - AI active',
				filePreviewTabs: [makeFilePreviewTab({ id: 'f1' })],
				activeFileTabId: null, // AI tab is active, not file tab
			});
			const session2 = makeSession({
				id: 'session-2',
				name: 'Session 2 - File active',
				filePreviewTabs: [makeFilePreviewTab({ id: 'f2' })],
				activeFileTabId: 'f2',
			});

			render(<TestAppWrapper initialSessions={[session1, session2]} initialActiveSessionId="session-1" />);

			// Session 1 has no active file tab (AI is active)
			expect(screen.getByTestId('active-file-tab-id')).toHaveTextContent('none');

			// Switch to session 2
			await act(async () => {
				screen.getByTestId('switch-to-session-2').click();
			});

			// Session 2 has file tab active
			expect(screen.getByTestId('active-file-tab-id')).toHaveTextContent('f2');
		});
	});

	describe('same file in multiple sessions', () => {
		it('allows the same file path to be open in different sessions simultaneously', () => {
			// Both sessions have the SAME file path open
			const sharedFilePath = '/shared/config.ts';

			const session1 = makeSession({
				id: 'session-1',
				name: 'Session 1',
				filePreviewTabs: [makeFilePreviewTab({
					id: 's1-config',
					path: sharedFilePath,
					name: 'config',
					content: 'session 1 content',
					scrollTop: 100,
				})],
				activeFileTabId: 's1-config',
			});
			const session2 = makeSession({
				id: 'session-2',
				name: 'Session 2',
				filePreviewTabs: [makeFilePreviewTab({
					id: 's2-config',
					path: sharedFilePath, // Same path
					name: 'config',
					content: 'session 2 content',
					scrollTop: 500,
				})],
				activeFileTabId: 's2-config',
			});

			render(<TestAppWrapper initialSessions={[session1, session2]} initialActiveSessionId="session-1" />);

			// Session 1 sees its own tab
			expect(screen.getByTestId('file-path-s1-config')).toHaveTextContent(sharedFilePath);
			expect(screen.getByTestId('file-scroll-s1-config')).toHaveTextContent('100');
			// Session 2's tab not visible
			expect(screen.queryByTestId('file-path-s2-config')).not.toBeInTheDocument();
		});

		it('each session maintains independent state for the same file', async () => {
			const sharedFilePath = '/shared/utils.ts';

			const session1 = makeSession({
				id: 'session-1',
				name: 'Session 1',
				filePreviewTabs: [makeFilePreviewTab({
					id: 's1-utils',
					path: sharedFilePath,
					scrollTop: 0,
					searchQuery: 'function',
					editMode: false,
				})],
				activeFileTabId: 's1-utils',
			});
			const session2 = makeSession({
				id: 'session-2',
				name: 'Session 2',
				filePreviewTabs: [makeFilePreviewTab({
					id: 's2-utils',
					path: sharedFilePath, // Same file
					scrollTop: 2000,
					searchQuery: 'const',
					editMode: true,
				})],
				activeFileTabId: 's2-utils',
			});

			render(<TestAppWrapper initialSessions={[session1, session2]} initialActiveSessionId="session-1" />);

			// Session 1: scroll=0, search='function', not editing
			expect(screen.getByTestId('file-scroll-s1-utils')).toHaveTextContent('0');
			expect(screen.getByTestId('file-search-s1-utils')).toHaveTextContent('function');
			expect(screen.getByTestId('file-edit-s1-utils')).toHaveTextContent('viewing');

			// Switch to session 2
			await act(async () => {
				screen.getByTestId('switch-to-session-2').click();
			});

			// Session 2: scroll=2000, search='const', editing
			expect(screen.getByTestId('file-scroll-s2-utils')).toHaveTextContent('2000');
			expect(screen.getByTestId('file-search-s2-utils')).toHaveTextContent('const');
			expect(screen.getByTestId('file-edit-s2-utils')).toHaveTextContent('editing');

			// Switch back to session 1
			await act(async () => {
				screen.getByTestId('switch-to-session-1').click();
			});

			// Session 1's state is still intact
			expect(screen.getByTestId('file-scroll-s1-utils')).toHaveTextContent('0');
			expect(screen.getByTestId('file-search-s1-utils')).toHaveTextContent('function');
			expect(screen.getByTestId('file-edit-s1-utils')).toHaveTextContent('viewing');
		});

		it('sessions can have different number of tabs for the same files', () => {
			// Session 1 has 3 files open, session 2 has 2 of the same files
			const session1 = makeSession({
				id: 'session-1',
				name: 'Session 1',
				filePreviewTabs: [
					makeFilePreviewTab({ id: 's1-a', path: '/shared/a.ts' }),
					makeFilePreviewTab({ id: 's1-b', path: '/shared/b.ts' }),
					makeFilePreviewTab({ id: 's1-c', path: '/shared/c.ts' }),
				],
				activeFileTabId: 's1-a',
			});
			const session2 = makeSession({
				id: 'session-2',
				name: 'Session 2',
				filePreviewTabs: [
					makeFilePreviewTab({ id: 's2-a', path: '/shared/a.ts' }),
					makeFilePreviewTab({ id: 's2-c', path: '/shared/c.ts' }), // Same files, different count
				],
				activeFileTabId: 's2-c',
			});

			render(<TestAppWrapper initialSessions={[session1, session2]} initialActiveSessionId="session-1" />);

			// Session 1 has 3 tabs
			expect(screen.getByTestId('file-tabs-count')).toHaveTextContent('3');
		});
	});

	describe('rapid session switching', () => {
		it('handles rapid session switching without losing state', async () => {
			const sessions = Array.from({ length: 5 }, (_, i) =>
				makeSession({
					id: `session-${i}`,
					name: `Session ${i}`,
					filePreviewTabs: [makeFilePreviewTab({ id: `f${i}`, path: `/path/${i}.ts`, scrollTop: i * 100 })],
					activeFileTabId: `f${i}`,
				})
			);

			render(<TestAppWrapper initialSessions={sessions} initialActiveSessionId="session-0" />);

			// Rapid switching through all sessions
			for (let i = 1; i < 5; i++) {
				await act(async () => {
					screen.getByTestId(`switch-to-session-${i}`).click();
				});
				expect(screen.getByTestId('active-session-id')).toHaveTextContent(`session-${i}`);
				expect(screen.getByTestId(`file-scroll-f${i}`)).toHaveTextContent(String(i * 100));
			}

			// Switch back to first session
			await act(async () => {
				screen.getByTestId('switch-to-session-0').click();
			});

			// Original state preserved
			expect(screen.getByTestId('active-session-id')).toHaveTextContent('session-0');
			expect(screen.getByTestId('file-scroll-f0')).toHaveTextContent('0');
		});
	});

	describe('hook usage', () => {
		it('throws error when used outside SessionProvider', () => {
			// Suppress console.error for this test
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			expect(() => {
				renderHook(() => useSession());
			}).toThrow('useSession must be used within a SessionProvider');

			consoleSpy.mockRestore();
		});

		it('provides stable setActiveSessionId callback', () => {
			const { result, rerender } = renderHook(() => useSession(), {
				wrapper: SessionProvider,
			});

			const firstCallback = result.current.setActiveSessionId;

			rerender();

			// setActiveSessionId should be the same reference after rerender
			expect(result.current.setActiveSessionId).toBe(firstCallback);
		});
	});
});

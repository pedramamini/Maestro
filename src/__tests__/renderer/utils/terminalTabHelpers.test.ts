/**
 * Tests for terminalTabHelpers.ts — terminal tab state management utilities.
 *
 * Functions tested:
 * - updateTerminalTabCommand
 */

import { describe, it, expect } from 'vitest';
import { updateTerminalTabCommand } from '../../../renderer/utils/terminalTabHelpers';
import type { Session, TerminalTab } from '../../../renderer/types';

function createMockSession(overrides: Partial<Session> = {}): Session {
	return {
		id: 'session-1',
		name: 'Test Session',
		toolType: 'claude-code',
		state: 'idle',
		cwd: '/test',
		fullPath: '/test',
		projectRoot: '/test',
		createdAt: 0,
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
		aiTabs: [],
		activeTabId: '',
		closedTabHistory: [],
		filePreviewTabs: [],
		activeFileTabId: null,
		unifiedTabOrder: [],
		unifiedClosedTabHistory: [],
		...overrides,
	};
}

function createMockTerminalTab(overrides: Partial<TerminalTab> = {}): TerminalTab {
	return {
		id: 'term-1',
		...overrides,
	};
}

describe('terminalTabHelpers', () => {
	describe('updateTerminalTabCommand', () => {
		it('returns the same session reference when terminalTabs is undefined', () => {
			const session = createMockSession();
			const result = updateTerminalTabCommand(session, 'term-1', 'btop', true);
			expect(result).toBe(session);
		});

		it('returns the same session reference when terminalTabs is empty', () => {
			const session = createMockSession({ terminalTabs: [] });
			const result = updateTerminalTabCommand(session, 'term-1', 'btop', true);
			expect(result).toBe(session);
		});

		it('returns the same session reference when no tab matches tabId', () => {
			const session = createMockSession({
				terminalTabs: [createMockTerminalTab({ id: 'term-1' })],
			});
			const result = updateTerminalTabCommand(session, 'no-such-tab', 'btop', true);
			expect(result).toBe(session);
		});

		it('returns the same session reference when command and running state are unchanged', () => {
			const session = createMockSession({
				terminalTabs: [
					createMockTerminalTab({
						id: 'term-1',
						currentCommand: 'btop',
						commandRunning: true,
					}),
				],
			});
			const result = updateTerminalTabCommand(session, 'term-1', 'btop', true);
			expect(result).toBe(session);
		});

		it('updates the matching tab with new command and running flag', () => {
			const session = createMockSession({
				terminalTabs: [createMockTerminalTab({ id: 'term-1' })],
			});
			const result = updateTerminalTabCommand(session, 'term-1', 'btop', true);

			expect(result).not.toBe(session);
			expect(result.terminalTabs).toHaveLength(1);
			expect(result.terminalTabs![0]).toMatchObject({
				id: 'term-1',
				currentCommand: 'btop',
				commandRunning: true,
			});
		});

		it('flips commandRunning to false on command-finished without clearing command', () => {
			const session = createMockSession({
				terminalTabs: [
					createMockTerminalTab({
						id: 'term-1',
						currentCommand: 'btop',
						commandRunning: true,
					}),
				],
			});
			const result = updateTerminalTabCommand(session, 'term-1', 'btop', false);

			expect(result.terminalTabs![0]).toMatchObject({
				currentCommand: 'btop',
				commandRunning: false,
			});
		});

		it('clears the command when given undefined', () => {
			const session = createMockSession({
				terminalTabs: [
					createMockTerminalTab({
						id: 'term-1',
						currentCommand: 'btop',
						commandRunning: true,
					}),
				],
			});
			const result = updateTerminalTabCommand(session, 'term-1', undefined, false);

			expect(result.terminalTabs![0].currentCommand).toBeUndefined();
			expect(result.terminalTabs![0].commandRunning).toBe(false);
		});

		it('only mutates the matching tab and leaves siblings untouched (by reference)', () => {
			const otherTab = createMockTerminalTab({
				id: 'term-2',
				currentCommand: 'sleep 60',
				commandRunning: true,
			});
			const session = createMockSession({
				terminalTabs: [createMockTerminalTab({ id: 'term-1' }), otherTab],
			});
			const result = updateTerminalTabCommand(session, 'term-1', 'btop', true);

			const updatedOther = result.terminalTabs!.find((t) => t.id === 'term-2');
			expect(updatedOther).toBe(otherTab);
		});

		it('preserves non-shell-integration tab fields', () => {
			const session = createMockSession({
				terminalTabs: [
					createMockTerminalTab({
						id: 'term-1',
						persistCommand: true,
					}),
				],
			});
			const result = updateTerminalTabCommand(session, 'term-1', 'btop', true);

			expect(result.terminalTabs![0]).toMatchObject({
				id: 'term-1',
				persistCommand: true,
				currentCommand: 'btop',
				commandRunning: true,
			});
		});
	});
});

/**
 * Tests for useBatchProcessor hook - Pure Functions and Hook Behavior
 *
 * This file tests the pure utility functions exported from useBatchProcessor
 * and the hook behavior with mocked IPC.
 *
 * Note: The hook itself (useBatchProcessor) has complex async state management
 * that requires careful mocking of the window.maestro IPC bridge.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type {
	Session,
	Group,
	HistoryEntry,
	UsageStats,
	BatchRunConfig,
	AgentError,
} from '../../../renderer/types';

// Import the exported functions directly
import { countUnfinishedTasks, uncheckAllTasks, useBatchProcessor } from '../../../renderer/hooks';
import { useBatchStore } from '../../../renderer/stores/batchStore';

// Mock notifyToast so we can verify toast notifications
const { mockNotifyToast } = vi.hoisted(() => ({
	mockNotifyToast: vi.fn(),
}));
vi.mock('../../../renderer/stores/notificationStore', () => ({
	notifyToast: (...args: unknown[]) => mockNotifyToast(...args),
}));

// ============================================================================
// Tests for countUnfinishedTasks
// ============================================================================

describe('countUnfinishedTasks', () => {
	describe('empty and no-checkbox content', () => {
		it('should return 0 for empty string', () => {
			expect(countUnfinishedTasks('')).toBe(0);
		});

		it('should return 0 for whitespace only', () => {
			expect(countUnfinishedTasks('   \n\t\n   ')).toBe(0);
		});

		it('should return 0 for content with no checkboxes', () => {
			const content = `# My Document

This is some text without any checkboxes.
- Regular list item
- Another item`;
			expect(countUnfinishedTasks(content)).toBe(0);
		});

		it('should return 0 for content with only regular markdown', () => {
			const content = `# Heading
## Subheading
Some **bold** and *italic* text.
- Item 1
- Item 2
1. Numbered item
2. Another numbered item`;
			expect(countUnfinishedTasks(content)).toBe(0);
		});
	});

	describe('counting unchecked tasks', () => {
		it('should count single unchecked task', () => {
			const content = '- [ ] Task one';
			expect(countUnfinishedTasks(content)).toBe(1);
		});

		it('should count multiple unchecked tasks', () => {
			const content = `# Tasks
- [ ] Task one
- [ ] Task two
- [ ] Task three`;
			expect(countUnfinishedTasks(content)).toBe(3);
		});

		it('should count unchecked tasks at various document positions', () => {
			const content = `- [ ] First task at start

Some content in between

- [ ] Middle task

More content

- [ ] Last task at end`;
			expect(countUnfinishedTasks(content)).toBe(3);
		});
	});

	describe('ignoring checked tasks', () => {
		it('should not count checked tasks (lowercase x)', () => {
			const content = `- [x] Completed task
- [ ] Pending task`;
			expect(countUnfinishedTasks(content)).toBe(1);
		});

		it('should not count checked tasks (uppercase X)', () => {
			const content = `- [X] Completed task
- [ ] Pending task`;
			expect(countUnfinishedTasks(content)).toBe(1);
		});

		it('should not count any checked task variants', () => {
			const content = `- [x] Done lowercase
- [X] Done uppercase
- [✓] Done checkmark
- [✔] Done heavy checkmark`;
			expect(countUnfinishedTasks(content)).toBe(0);
		});
	});

	describe('mixed checked and unchecked tasks', () => {
		it('should handle mixed checked and unchecked tasks', () => {
			const content = `# Project Tasks
- [x] Setup project
- [ ] Write tests
- [X] Configure CI
- [ ] Deploy
- [ ] Document`;
			expect(countUnfinishedTasks(content)).toBe(3);
		});

		it('should handle alternating checked/unchecked pattern', () => {
			const content = `- [x] Done 1
- [ ] Todo 1
- [x] Done 2
- [ ] Todo 2
- [x] Done 3
- [ ] Todo 3`;
			expect(countUnfinishedTasks(content)).toBe(3);
		});
	});

	describe('indentation handling', () => {
		it('should handle indented checkboxes', () => {
			const content = `# Nested Tasks
- [ ] Parent task
  - [ ] Child task 1
    - [ ] Grandchild task
  - [ ] Child task 2`;
			expect(countUnfinishedTasks(content)).toBe(4);
		});

		it('should handle deeply nested checkboxes', () => {
			const content = `- [ ] Level 0
    - [ ] Level 1
        - [ ] Level 2
            - [ ] Level 3
                - [ ] Level 4`;
			expect(countUnfinishedTasks(content)).toBe(5);
		});

		it('should handle tabs as indentation', () => {
			const content = `\t- [ ] Tabbed task
\t\t- [ ] Double tabbed task`;
			expect(countUnfinishedTasks(content)).toBe(2);
		});

		it('should handle mixed tabs and spaces', () => {
			const content = `  - [ ] Space indented
\t- [ ] Tab indented
  \t- [ ] Mixed indented`;
			expect(countUnfinishedTasks(content)).toBe(3);
		});
	});

	describe('checkbox format variations', () => {
		it('should handle extra spaces in checkbox (still matches with \\s*)', () => {
			const content = `- [  ] Task with extra space
- [ ] Normal task`;
			// The regex uses \s* which allows any whitespace, so both match
			expect(countUnfinishedTasks(content)).toBe(2);
		});

		it('should handle no space in checkbox', () => {
			const content = '- [] Task with no space';
			// The regex allows \s* so [] should match
			expect(countUnfinishedTasks(content)).toBe(1);
		});
	});

	describe('task content variations', () => {
		it('should handle checkboxes with various content after', () => {
			const content = `- [ ] Simple task
- [ ] Task with **bold** text
- [ ] Task with \`code\`
- [ ] Task with [link](url)
- [ ] Task with emoji 🎉`;
			expect(countUnfinishedTasks(content)).toBe(5);
		});

		it('should match checkbox followed by trailing space (.+ matches space)', () => {
			// The regex uses .+ which matches any character including space
			// But .+$ requires non-empty content at end of line - trailing space counts!
			const content = '- [ ] ';
			// Actually .+ in multiline mode requires at least one character
			// A trailing space IS a character, so this should match
			expect(countUnfinishedTasks(content)).toBe(1);
		});

		it('should match checkbox with single character content', () => {
			const content = '- [ ] x';
			expect(countUnfinishedTasks(content)).toBe(1);
		});

		it('should handle very long task descriptions', () => {
			const longDescription = 'a'.repeat(1000);
			const content = `- [ ] ${longDescription}`;
			expect(countUnfinishedTasks(content)).toBe(1);
		});
	});

	describe('line position requirements', () => {
		it('should handle checkboxes at start of lines only', () => {
			const content = `Some text - [ ] not a task
- [ ] Real task
Text - [ ] also not a task`;
			// The regex uses ^ with multiline flag, so only line-start checkboxes match
			expect(countUnfinishedTasks(content)).toBe(1);
		});

		it('should not match checkbox in middle of text', () => {
			const content = 'This is some text with - [ ] embedded checkbox';
			expect(countUnfinishedTasks(content)).toBe(0);
		});
	});

	describe('line ending handling', () => {
		it('should handle Windows line endings (CRLF)', () => {
			const content = '- [ ] Task one\r\n- [ ] Task two\r\n- [ ] Task three';
			expect(countUnfinishedTasks(content)).toBe(3);
		});

		it('should handle Unix line endings (LF)', () => {
			const content = '- [ ] Task one\n- [ ] Task two\n- [ ] Task three';
			expect(countUnfinishedTasks(content)).toBe(3);
		});

		it('should handle mixed line endings', () => {
			const content = '- [ ] Task one\r\n- [ ] Task two\n- [ ] Task three';
			expect(countUnfinishedTasks(content)).toBe(3);
		});

		it('should handle task at end of file without newline', () => {
			const content = '- [ ] Only task';
			expect(countUnfinishedTasks(content)).toBe(1);
		});
	});

	describe('special characters', () => {
		it('should handle tasks with special regex characters', () => {
			const content = `- [ ] Task with (parentheses)
- [ ] Task with [brackets]
- [ ] Task with {braces}
- [ ] Task with $dollar and ^caret`;
			expect(countUnfinishedTasks(content)).toBe(4);
		});

		it('should handle unicode content', () => {
			const content = `- [ ] タスク (Japanese)
- [ ] 任务 (Chinese)
- [ ] задача (Russian)`;
			expect(countUnfinishedTasks(content)).toBe(3);
		});
	});
});

// ============================================================================
// Tests for uncheckAllTasks
// ============================================================================

describe('uncheckAllTasks', () => {
	describe('empty and no-checkbox content', () => {
		it('should return empty string for empty input', () => {
			expect(uncheckAllTasks('')).toBe('');
		});

		it('should not modify content without checkboxes', () => {
			const content = `# My Document
Just some text here.`;
			expect(uncheckAllTasks(content)).toBe(content);
		});

		it('should not modify unchecked checkboxes', () => {
			const content = '- [ ] Unchecked task';
			expect(uncheckAllTasks(content)).toBe(content);
		});

		it('should preserve regular markdown formatting', () => {
			const content = `# Heading
Some **bold** and *italic* text.
- Regular item
1. Numbered item`;
			expect(uncheckAllTasks(content)).toBe(content);
		});
	});

	describe('checked task conversion', () => {
		it('should convert lowercase x checkbox to unchecked', () => {
			const content = '- [x] Completed task';
			expect(uncheckAllTasks(content)).toBe('- [ ] Completed task');
		});

		it('should convert uppercase X checkbox to unchecked', () => {
			const content = '- [X] Completed task';
			expect(uncheckAllTasks(content)).toBe('- [ ] Completed task');
		});

		it('should convert checkmark checkbox to unchecked', () => {
			const content = '- [✓] Completed task';
			expect(uncheckAllTasks(content)).toBe('- [ ] Completed task');
		});

		it('should convert heavy checkmark checkbox to unchecked', () => {
			const content = '- [✔] Completed task';
			expect(uncheckAllTasks(content)).toBe('- [ ] Completed task');
		});
	});

	describe('multiple task handling', () => {
		it('should handle multiple checked tasks', () => {
			const content = `- [x] Task one
- [X] Task two
- [✓] Task three
- [✔] Task four`;
			const expected = `- [ ] Task one
- [ ] Task two
- [ ] Task three
- [ ] Task four`;
			expect(uncheckAllTasks(content)).toBe(expected);
		});

		it('should preserve unchecked tasks while converting checked ones', () => {
			const content = `- [x] Completed
- [ ] Pending
- [X] Also completed
- [ ] Also pending`;
			const expected = `- [ ] Completed
- [ ] Pending
- [ ] Also completed
- [ ] Also pending`;
			expect(uncheckAllTasks(content)).toBe(expected);
		});

		it('should handle alternating checked/unchecked pattern', () => {
			const content = `- [x] Done
- [ ] Not done
- [x] Done
- [ ] Not done`;
			const expected = `- [ ] Done
- [ ] Not done
- [ ] Done
- [ ] Not done`;
			expect(uncheckAllTasks(content)).toBe(expected);
		});
	});

	describe('indentation preservation', () => {
		it('should preserve indentation', () => {
			const content = `- [x] Parent task
  - [x] Child task
    - [x] Grandchild task`;
			const expected = `- [ ] Parent task
  - [ ] Child task
    - [ ] Grandchild task`;
			expect(uncheckAllTasks(content)).toBe(expected);
		});

		it('should preserve deep indentation', () => {
			const content = `- [x] Level 0
    - [x] Level 1
        - [x] Level 2
            - [x] Level 3`;
			const expected = `- [ ] Level 0
    - [ ] Level 1
        - [ ] Level 2
            - [ ] Level 3`;
			expect(uncheckAllTasks(content)).toBe(expected);
		});

		it('should handle tabbed indentation', () => {
			const content = `\t- [x] Tabbed task
\t\t- [X] Double tabbed task`;
			const expected = `\t- [ ] Tabbed task
\t\t- [ ] Double tabbed task`;
			expect(uncheckAllTasks(content)).toBe(expected);
		});

		it('should preserve mixed indentation styles', () => {
			const content = `  - [x] Space indented
\t- [x] Tab indented`;
			const expected = `  - [ ] Space indented
\t- [ ] Tab indented`;
			expect(uncheckAllTasks(content)).toBe(expected);
		});
	});

	describe('content preservation', () => {
		it('should preserve other content around checkboxes', () => {
			const content = `# Tasks

## Phase 1
- [x] Setup project

## Phase 2
- [x] Write code

Some other text here.`;
			const expected = `# Tasks

## Phase 1
- [ ] Setup project

## Phase 2
- [ ] Write code

Some other text here.`;
			expect(uncheckAllTasks(content)).toBe(expected);
		});

		it('should preserve task descriptions', () => {
			const content = '- [x] This is a **very** important task with `code` and [links](url)';
			const expected = '- [ ] This is a **very** important task with `code` and [links](url)';
			expect(uncheckAllTasks(content)).toBe(expected);
		});

		it('should preserve emoji in task descriptions', () => {
			const content = '- [x] Task with emoji 🎉';
			const expected = '- [ ] Task with emoji 🎉';
			expect(uncheckAllTasks(content)).toBe(expected);
		});
	});

	describe('line ending handling', () => {
		it('should handle Windows line endings', () => {
			const content = '- [x] Task one\r\n- [x] Task two';
			const expected = '- [ ] Task one\r\n- [ ] Task two';
			expect(uncheckAllTasks(content)).toBe(expected);
		});

		it('should handle Unix line endings', () => {
			const content = '- [x] Task one\n- [x] Task two';
			const expected = '- [ ] Task one\n- [ ] Task two';
			expect(uncheckAllTasks(content)).toBe(expected);
		});

		it('should handle mixed line endings', () => {
			const content = '- [x] Task one\r\n- [x] Task two\n- [x] Task three';
			const expected = '- [ ] Task one\r\n- [ ] Task two\n- [ ] Task three';
			expect(uncheckAllTasks(content)).toBe(expected);
		});
	});

	describe('edge cases', () => {
		it('should handle single checked task', () => {
			const content = '- [x] Only task';
			const expected = '- [ ] Only task';
			expect(uncheckAllTasks(content)).toBe(expected);
		});

		it('should handle task at end of file without newline', () => {
			const content = '- [x] Last task';
			const expected = '- [ ] Last task';
			expect(uncheckAllTasks(content)).toBe(expected);
		});

		it('should handle inline patterns (regex matches at line start only)', () => {
			// The CHECKED_TASK_REGEX uses ^ anchor, so only line-start checkboxes are modified
			// But "- [x]" in middle of line starts with "- " so it CAN match
			// Actually: /^(\s*-\s*)\[[xX✓✔]\]/gm - the ^ in multiline mode matches start of line
			// "This text has [x]" - the "[x]" is not preceded by "- " so it won't match
			// "but - [x]" - this ALSO won't match because the line doesn't START with "-"
			const content = 'This text has [x] in the middle but - [x] also in middle';
			// Neither should be converted - neither is at line start
			expect(uncheckAllTasks(content)).toBe(content);
		});

		it('should handle unicode task descriptions', () => {
			const content = `- [x] タスク完了 (Japanese)
- [x] 任务完成 (Chinese)`;
			const expected = `- [ ] タスク完了 (Japanese)
- [ ] 任务完成 (Chinese)`;
			expect(uncheckAllTasks(content)).toBe(expected);
		});
	});

	describe('idempotency', () => {
		it('should be idempotent - running twice produces same result', () => {
			const content = `- [x] Task 1
- [X] Task 2
- [ ] Task 3`;
			const firstPass = uncheckAllTasks(content);
			const secondPass = uncheckAllTasks(firstPass);
			expect(firstPass).toBe(secondPass);
		});

		it('should not change already unchecked content', () => {
			const content = `- [ ] Task 1
- [ ] Task 2
- [ ] Task 3`;
			expect(uncheckAllTasks(content)).toBe(content);
		});
	});
});

// ============================================================================
// Integration: countUnfinishedTasks + uncheckAllTasks
// ============================================================================

describe('countUnfinishedTasks + uncheckAllTasks integration', () => {
	it('should count same number of tasks after unchecking', () => {
		const content = `- [x] Task 1
- [X] Task 2
- [✓] Task 3`;

		// Initially no unchecked tasks
		expect(countUnfinishedTasks(content)).toBe(0);

		// After unchecking, should have 3 unchecked tasks
		const unchecked = uncheckAllTasks(content);
		expect(countUnfinishedTasks(unchecked)).toBe(3);
	});

	it('should preserve count of already unchecked tasks', () => {
		const content = `- [x] Completed
- [ ] Pending 1
- [x] Also completed
- [ ] Pending 2`;

		const originalCount = countUnfinishedTasks(content);
		expect(originalCount).toBe(2);

		const unchecked = uncheckAllTasks(content);
		const newCount = countUnfinishedTasks(unchecked);
		expect(newCount).toBe(4);
	});

	it('should handle complex document', () => {
		const content = `# Project Status

## Phase 1 - Setup
- [x] Initialize repository
- [x] Configure CI/CD
- [ ] Write documentation

## Phase 2 - Development
- [x] Implement feature A
- [ ] Implement feature B
- [ ] Add tests

## Phase 3 - Launch
- [ ] Review code
- [ ] Deploy to staging
- [ ] Deploy to production`;

		// Check initial state
		const initialUnchecked = countUnfinishedTasks(content);
		expect(initialUnchecked).toBe(6);

		// After unchecking all
		const unchecked = uncheckAllTasks(content);
		const finalUnchecked = countUnfinishedTasks(unchecked);
		expect(finalUnchecked).toBe(9);
	});
});

// ============================================================================
// Tests for useBatchProcessor hook
// ============================================================================

describe('useBatchProcessor hook', () => {
	// Mock sessions and groups
	const createMockSession = (overrides?: Partial<Session>): Session => ({
		id: 'test-session-id',
		name: 'Test Session',
		toolType: 'claude-code',
		state: 'idle',
		inputMode: 'ai',
		cwd: '/test/path',
		projectRoot: '/test/path',
		aiPid: 0,
		terminalPid: 0,
		aiLogs: [],
		shellLogs: [],
		isGitRepo: true,
		fileTree: [],
		fileExplorerExpanded: [],
		messageQueue: [],
		...overrides,
	});

	const createMockGroup = (overrides?: Partial<Group>): Group => ({
		id: 'test-group-id',
		name: 'Test Group',
		collapsed: false,
		...overrides,
	});

	// Mock callbacks
	let mockOnUpdateSession: ReturnType<typeof vi.fn>;
	let mockOnSpawnAgent: ReturnType<typeof vi.fn>;
	let mockOnAddHistoryEntry: ReturnType<typeof vi.fn>;
	let mockOnComplete: ReturnType<typeof vi.fn>;
	let mockOnPRResult: ReturnType<typeof vi.fn>;

	// Mock window.maestro methods
	let mockReadDoc: ReturnType<typeof vi.fn>;
	let mockWriteDoc: ReturnType<typeof vi.fn>;
	let mockCreateWorkingCopy: ReturnType<typeof vi.fn>;
	let mockStatus: ReturnType<typeof vi.fn>;
	let mockBranch: ReturnType<typeof vi.fn>;
	let mockBroadcastAutoRunState: ReturnType<typeof vi.fn>;
	let mockRegisterSessionOrigin: ReturnType<typeof vi.fn>;
	let mockWorktreeSetup: ReturnType<typeof vi.fn>;
	let mockWorktreeCheckout: ReturnType<typeof vi.fn>;
	let mockGetDefaultBranch: ReturnType<typeof vi.fn>;
	let mockCreatePR: ReturnType<typeof vi.fn>;
	let mockValidateExecutionStart: ReturnType<typeof vi.fn>;
	let mockGetProjectMemorySnapshot: ReturnType<typeof vi.fn>;
	let mockValidateProjectMemoryState: ReturnType<typeof vi.fn>;
	let mockClaimNextExecution: ReturnType<typeof vi.fn>;
	let mockEmitWizardTasks: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		// Reset mocks
		mockOnUpdateSession = vi.fn();
		mockOnSpawnAgent = vi.fn().mockResolvedValue({
			success: true,
			agentSessionId: 'mock-claude-session',
			usageStats: {
				inputTokens: 100,
				outputTokens: 200,
				totalCostUsd: 0.01,
				cacheReadInputTokens: 0,
				cacheCreationInputTokens: 0,
				contextWindow: 0,
			},
			response: '**Summary:** Test task completed\n\n**Details:** Some details here.',
		});
		mockOnAddHistoryEntry = vi.fn();
		mockOnComplete = vi.fn();
		mockOnPRResult = vi.fn();

		// Set up window.maestro mocks
		mockReadDoc = vi
			.fn()
			.mockResolvedValue({ success: true, content: '# Tasks\n- [ ] Task 1\n- [ ] Task 2' });
		mockWriteDoc = vi.fn().mockResolvedValue({ success: true });
		mockCreateWorkingCopy = vi.fn().mockResolvedValue({ workingCopyPath: 'Runs/tasks-run-1.md' });
		mockStatus = vi.fn().mockResolvedValue({ stdout: '' });
		mockBranch = vi.fn().mockResolvedValue({ stdout: 'main' });
		mockBroadcastAutoRunState = vi.fn();
		mockRegisterSessionOrigin = vi.fn().mockResolvedValue(undefined);
		mockWorktreeSetup = vi.fn().mockResolvedValue({ success: true });
		mockWorktreeCheckout = vi.fn().mockResolvedValue({ success: true });
		mockGetDefaultBranch = vi.fn().mockResolvedValue({ success: true, branch: 'main' });
		mockCreatePR = vi
			.fn()
			.mockResolvedValue({ success: true, prUrl: 'https://github.com/test/test/pull/1' });
		mockValidateExecutionStart = vi.fn().mockResolvedValue({
			success: true,
			validation: {
				ok: true,
				skipped: false,
				taskId: 'PM-01',
				executorId: 'codex-main',
				reason: null,
				bindingMode: 'shared-branch-serialized',
				expectedBranch: 'main',
				currentBranch: 'main',
			},
		});
		mockGetProjectMemorySnapshot = vi.fn().mockResolvedValue({ success: true, snapshot: null });
		mockValidateProjectMemoryState = vi.fn().mockResolvedValue({
			success: true,
			report: {
				ok: true,
				issues: [],
				taskCount: 0,
				activeTaskId: null,
				activeExecutorId: null,
				activeBindingMode: null,
				generatedAt: new Date().toISOString(),
			},
		});
		mockClaimNextExecution = vi.fn().mockResolvedValue({
			success: true,
			execution: null,
		});
		mockEmitWizardTasks = vi.fn().mockResolvedValue({
			success: true,
			emittedTaskIds: ['PM-01'],
			tasksFilePath: '/repo/project_memory/tasks/tasks.json',
			diagnostics: {
				taskCount: 1,
				repoRoot: '/repo',
				sourceBranch: 'main',
				bindingPreference: 'shared-branch-serialized',
			},
		});

		// Configure window.maestro
		window.maestro = {
			...window.maestro,
			autorun: {
				readDoc: mockReadDoc,
				writeDoc: mockWriteDoc,
				createWorkingCopy: mockCreateWorkingCopy,
				watchFolder: vi.fn(),
				unwatchFolder: vi.fn(),
				readFolder: vi.fn(),
			},
			git: {
				...window.maestro.git,
				status: mockStatus,
				branch: mockBranch,
				worktreeSetup: mockWorktreeSetup,
				worktreeCheckout: mockWorktreeCheckout,
				getDefaultBranch: mockGetDefaultBranch,
				createPR: mockCreatePR,
			},
			web: {
				...window.maestro.web,
				broadcastAutoRunState: mockBroadcastAutoRunState,
			},
			agentSessions: {
				...window.maestro.agentSessions,
				registerSessionOrigin: mockRegisterSessionOrigin,
			},
			projectMemory: {
				...window.maestro.projectMemory,
				getSnapshot: mockGetProjectMemorySnapshot,
				validateState: mockValidateProjectMemoryState,
				validateExecutionStart: mockValidateExecutionStart,
				claimNextExecution: mockClaimNextExecution,
				emitWizardTasks: mockEmitWizardTasks,
			},
			power: {
				addReason: vi.fn(),
				removeReason: vi.fn(),
				setEnabled: vi.fn(),
				isEnabled: vi.fn().mockResolvedValue(true),
				getStatus: vi
					.fn()
					.mockResolvedValue({ enabled: true, blocking: false, reasons: [], platform: 'darwin' }),
			},
		};
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('hook initialization', () => {
		it('should initialize with empty batch states', () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
					onPRResult: mockOnPRResult,
				})
			);

			expect(result.current.batchRunStates).toEqual({});
			expect(result.current.hasAnyActiveBatch).toBe(false);
			expect(result.current.activeBatchSessionIds).toEqual([]);
			expect(result.current.customPrompts).toEqual({});
		});

		it('should provide getBatchState that returns default state for unknown sessions', () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
				})
			);

			const state = result.current.getBatchState('unknown-session');
			expect(state.isRunning).toBe(false);
			expect(state.isStopping).toBe(false);
			expect(state.totalTasks).toBe(0);
			expect(state.completedTasks).toBe(0);
		});
	});

	describe('state synchronization', () => {
		/**
		 * Regression test for bug where progress bar was stuck at "0 of N tasks completed"
		 * even after all tasks finished.
		 *
		 * Root cause: batchRunStatesRef was only updated on React re-render, but the
		 * debounce callback read this ref to compare state changes. When dispatches
		 * happened faster than React re-renders, the ref contained stale state.
		 *
		 * Fix: The dispatch wrapper now synchronously updates batchRunStatesRef
		 * immediately after each dispatch, ensuring debounced callbacks always
		 * see the current state.
		 *
		 * These tests verify the fix at the unit level by checking that getBatchState
		 * returns correct values immediately after state-changing operations.
		 */
		it('should provide correct initial state via getBatchState', () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			// Initial state should have 0 completed tasks
			const state = result.current.getBatchState('test-session-id');
			expect(state.completedTasksAcrossAllDocs).toBe(0);
			expect(state.totalTasksAcrossAllDocs).toBe(0);
			expect(state.isRunning).toBe(false);
		});

		it('should track hasAnyActiveBatch correctly', () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			// Initially no active batches
			expect(result.current.hasAnyActiveBatch).toBe(false);
			expect(result.current.activeBatchSessionIds).toEqual([]);
		});

		it('should return default state for sessions that have not started batch processing', () => {
			const sessions = [
				createMockSession({ id: 'session-1' }),
				createMockSession({ id: 'session-2' }),
			];
			const groups = [createMockGroup()];

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			// Both sessions should return default state with 0 progress
			const state1 = result.current.getBatchState('session-1');
			const state2 = result.current.getBatchState('session-2');

			expect(state1.completedTasksAcrossAllDocs).toBe(0);
			expect(state1.totalTasksAcrossAllDocs).toBe(0);
			expect(state2.completedTasksAcrossAllDocs).toBe(0);
			expect(state2.totalTasksAcrossAllDocs).toBe(0);
		});
	});

	describe('setCustomPrompt', () => {
		it('should set custom prompt for a session', () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
				})
			);

			act(() => {
				result.current.setCustomPrompt('test-session-id', 'Custom prompt here');
			});

			expect(result.current.customPrompts['test-session-id']).toBe('Custom prompt here');
		});

		it('should update custom prompt for a session', () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
				})
			);

			act(() => {
				result.current.setCustomPrompt('test-session-id', 'First prompt');
			});

			expect(result.current.customPrompts['test-session-id']).toBe('First prompt');

			act(() => {
				result.current.setCustomPrompt('test-session-id', 'Updated prompt');
			});

			expect(result.current.customPrompts['test-session-id']).toBe('Updated prompt');
		});

		it('should handle multiple session prompts', () => {
			const sessions = [
				createMockSession({ id: 'session-1' }),
				createMockSession({ id: 'session-2' }),
			];
			const groups = [createMockGroup()];

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
				})
			);

			act(() => {
				result.current.setCustomPrompt('session-1', 'Prompt for session 1');
				result.current.setCustomPrompt('session-2', 'Prompt for session 2');
			});

			expect(result.current.customPrompts['session-1']).toBe('Prompt for session 1');
			expect(result.current.customPrompts['session-2']).toBe('Prompt for session 2');
		});
	});

	describe('startBatchRun', () => {
		it('should not start if session is not found', async () => {
			const sessions: Session[] = [];
			const groups: Group[] = [];

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'non-existent-session',
					{
						documents: [{ filename: 'test', resetOnCompletion: false }],
						prompt: 'Test prompt',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockOnSpawnAgent).not.toHaveBeenCalled();
		});

		it('should not start if no documents provided', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [],
						prompt: 'Test prompt',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockOnSpawnAgent).not.toHaveBeenCalled();
		});

		it('should not start if no tasks found in documents', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Mock empty document with no tasks
			mockReadDoc.mockResolvedValue({ success: true, content: '# Empty document\nNo tasks here.' });

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'empty', resetOnCompletion: false }],
						prompt: 'Test prompt',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockOnSpawnAgent).not.toHaveBeenCalled();
		});

		it('should block start when project memory validation fails', async () => {
			const sessions = [createMockSession({ isGitRepo: true })];
			const groups = [createMockGroup()];
			mockValidateExecutionStart.mockResolvedValue({
				success: true,
				validation: {
					ok: false,
					skipped: false,
					taskId: 'PM-01',
					executorId: 'codex-main',
					reason: 'Task lock owner mismatch: expected codex-main, found other-executor',
					bindingMode: 'shared-branch-serialized',
					expectedBranch: 'main',
					currentBranch: 'main',
				},
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test prompt',
						loopEnabled: false,
						projectMemoryExecution: {
							repoRoot: '/repo',
							taskId: 'PM-01',
							executorId: 'codex-main',
						},
					},
					'/test/folder'
				);
			});

			expect(mockValidateExecutionStart).toHaveBeenCalledWith(
				'/repo',
				'PM-01',
				'codex-main',
				'main'
			);
			expect(mockNotifyToast).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'warning',
					message: expect.stringContaining('Project Memory blocked Auto Run start'),
				})
			);
			expect(mockReadDoc).not.toHaveBeenCalled();
			expect(mockOnSpawnAgent).not.toHaveBeenCalled();
		});

		it('should infer project memory execution context for codex manual starts', async () => {
			const sessions = [
				createMockSession({
					isGitRepo: true,
					toolType: 'codex' as any,
					projectRoot: '/repo',
					cwd: '/repo',
				}),
			];
			const groups = [createMockGroup()];
			mockGetProjectMemorySnapshot.mockResolvedValue({
				success: true,
				snapshot: {
					projectId: 'maestro',
					version: '2026-04-04',
					taskCount: 1,
					generatedAt: 'now',
					tasks: [
						{
							id: 'PM-01',
							title: 'Bound task',
							status: 'in_progress',
							dependsOn: [],
							executionMode: 'shared-serialized',
							bindingMode: 'shared-branch-serialized',
							worktreePath: '/repo',
							executorState: 'running',
							executorId: 'codex-main',
						},
					],
				},
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test prompt',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockGetProjectMemorySnapshot).toHaveBeenCalledWith('/repo');
			expect(mockValidateExecutionStart).toHaveBeenCalledWith(
				'/repo',
				'PM-01',
				'codex-main',
				'main'
			);
		});

		it('should block codex manual starts when no project memory binding can be inferred', async () => {
			const sessions = [
				createMockSession({
					isGitRepo: true,
					toolType: 'codex' as any,
					projectRoot: '/repo',
					cwd: '/repo',
				}),
			];
			const groups = [createMockGroup()];
			mockGetProjectMemorySnapshot.mockResolvedValue({
				success: true,
				snapshot: {
					projectId: 'maestro',
					version: '2026-04-04',
					taskCount: 0,
					generatedAt: 'now',
					tasks: [],
				},
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test prompt',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockGetProjectMemorySnapshot).toHaveBeenCalledWith('/repo');
			expect(mockValidateExecutionStart).not.toHaveBeenCalled();
			expect(mockNotifyToast).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'warning',
					message: expect.stringContaining(
						'Codex Auto Run requires an active Project Memory binding for this repo.'
					),
				})
			);
			expect(mockReadDoc).not.toHaveBeenCalled();
			expect(mockOnSpawnAgent).not.toHaveBeenCalled();
		});

		it('should bootstrap project memory from binding intent for codex starts', async () => {
			const sessions = [
				createMockSession({
					isGitRepo: true,
					toolType: 'codex' as any,
					projectRoot: '/repo',
					cwd: '/repo',
				}),
			];
			const groups = [createMockGroup()];
			mockGetProjectMemorySnapshot.mockResolvedValue({ success: true, snapshot: null });
			mockValidateProjectMemoryState
				.mockResolvedValueOnce({
					success: true,
					report: {
						ok: false,
						projectId: null,
						taskCount: 0,
						bindingCount: 0,
						runtimeCount: 0,
						taskLockCount: 0,
						worktreeLockCount: 0,
						expiredTaskLockCount: 0,
						expiredWorktreeLockCount: 0,
						issues: ['tasks.json not found: /repo/project_memory/tasks/tasks.json'],
					},
				})
				.mockResolvedValue({
					success: true,
					report: {
						ok: true,
						projectId: 'repo',
						taskCount: 1,
						bindingCount: 1,
						runtimeCount: 1,
						taskLockCount: 1,
						worktreeLockCount: 1,
						expiredTaskLockCount: 0,
						expiredWorktreeLockCount: 0,
						issues: [],
					},
				});
			mockClaimNextExecution.mockResolvedValue({
				success: true,
				execution: {
					repoRoot: '/repo',
					taskId: 'PM-01',
					executorId: 'codex-main',
				},
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Process the first unchecked markdown task - [ ] only.',
						loopEnabled: false,
						projectMemoryBindingIntent: {
							policyVersion: '2026-04-04',
							repoRoot: '/repo',
							sourceBranch: 'main',
							bindingPreference: 'shared-branch-serialized',
							sharedCheckoutAllowed: true,
							reuseExistingBinding: true,
							allowRebindIfStale: true,
						},
						playbookId: 'pb-1',
						playbookName: 'PM Playbook',
					},
					'/test/folder'
				);
			});

			expect(mockEmitWizardTasks).toHaveBeenCalled();
			expect(mockClaimNextExecution).toHaveBeenCalledWith('/repo', 'codex-main');
			expect(mockValidateExecutionStart).toHaveBeenCalledWith(
				'/repo',
				'PM-01',
				'codex-main',
				'main'
			);
			expect(mockOnSpawnAgent).toHaveBeenCalled();
		});

		it('should not infer project memory execution context for non-codex manual starts', async () => {
			const sessions = [
				createMockSession({
					isGitRepo: true,
					toolType: 'claude-code' as any,
					projectRoot: '/repo',
					cwd: '/repo',
				}),
			];
			const groups = [createMockGroup()];

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test prompt',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockGetProjectMemorySnapshot).not.toHaveBeenCalled();
		});

		it('should start batch run and process tasks', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Mock document with 2 tasks initially, then 1 task, then 0 tasks
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) {
					return { success: true, content: '# Tasks\n- [ ] Task 1\n- [ ] Task 2' };
				} else if (callCount <= 4) {
					return { success: true, content: '# Tasks\n- [x] Task 1\n- [ ] Task 2' };
				} else {
					return { success: true, content: '# Tasks\n- [x] Task 1\n- [x] Task 2' };
				}
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Complete the next task',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should have spawned agent
			expect(mockOnSpawnAgent).toHaveBeenCalled();

			// Should have called completion callback
			expect(mockOnComplete).toHaveBeenCalledWith(
				expect.objectContaining({
					sessionId: 'test-session-id',
					sessionName: 'Test Session',
				})
			);
		});

		it('should handle agent failure gracefully', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Mock single task - readDoc is called multiple times:
			// 1. Initial count (line 425)
			// 2. Document processing start (line 531)
			// 3. Template variable expansion (line 596)
			// 4. After agent runs to count remaining (line 626)
			// First 3 calls need unchecked tasks, call 4+ returns checked
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) {
					return { success: true, content: '# Tasks\n- [ ] Task 1' };
				} else {
					return { success: true, content: '# Tasks\n- [x] Task 1' };
				}
			});

			// Mock agent failure
			mockOnSpawnAgent.mockResolvedValue({ success: false });

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Complete the task',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should have tried to spawn agent
			expect(mockOnSpawnAgent).toHaveBeenCalled();

			// Should have added history entry with failure
			expect(mockOnAddHistoryEntry).toHaveBeenCalled();
		});
	});

	describe('stopBatchRun', () => {
		it('should set isStopping flag', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Create a deferred promise we can control
			let resolveAgent: (value: { success: boolean; agentSessionId?: string }) => void;
			const agentPromise = new Promise<{ success: boolean; agentSessionId?: string }>((resolve) => {
				resolveAgent = resolve;
			});
			mockOnSpawnAgent.mockReturnValue(agentPromise);

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
				})
			);

			// Start batch (don't await - we want it to be running)
			let batchFinished = false;
			act(() => {
				result.current
					.startBatchRun(
						'test-session-id',
						{
							documents: [{ filename: 'tasks', resetOnCompletion: false }],
							prompt: 'Test',
							loopEnabled: false,
						},
						'/test/folder'
					)
					.then(() => {
						batchFinished = true;
					});
			});

			// Wait for batch to actually be running (agent called)
			await waitFor(() => {
				expect(mockOnSpawnAgent).toHaveBeenCalled();
			});

			// Stop the batch while agent is "running"
			act(() => {
				result.current.stopBatchRun('test-session-id');
			});

			// Check state - isStopping should be true
			expect(result.current.getBatchState('test-session-id').isStopping).toBe(true);

			// Clean up: resolve the agent promise to let the batch finish
			await act(async () => {
				resolveAgent!({ success: true, agentSessionId: 'test-session' });
			});

			// Wait for batch to finish
			await waitFor(() => {
				expect(batchFinished).toBe(true);
			});
		});
	});

	describe('worktree handling', () => {
		it('should set up worktree when enabled', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Single task - need unchecked for first 3 calls (initial count, doc start, template expansion)
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) {
					return { success: true, content: '- [ ] Task' };
				}
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature/test',
						},
					},
					'/test/folder'
				);
			});

			expect(mockWorktreeSetup).toHaveBeenCalledWith(
				'/test/path',
				'/test/worktree',
				'feature/test',
				undefined // sshRemoteId (undefined for local sessions)
			);
		});

		it('should handle worktree setup failure', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Mock worktree setup failure
			mockWorktreeSetup.mockResolvedValue({ success: false, error: 'Worktree setup failed' });

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature/test',
						},
					},
					'/test/folder'
				);
			});

			// Should not have spawned agent due to worktree failure
			expect(mockOnSpawnAgent).not.toHaveBeenCalled();
		});

		it('should checkout different branch when worktree exists with branch mismatch', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Mock worktree exists with different branch
			mockWorktreeSetup.mockResolvedValue({ success: true, branchMismatch: true });

			// Single task - need unchecked for first 3 calls
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature/test',
						},
					},
					'/test/folder'
				);
			});

			expect(mockWorktreeCheckout).toHaveBeenCalledWith(
				'/test/worktree',
				'feature/test',
				true,
				undefined // sshRemoteId (undefined for local sessions)
			);
		});
	});

	describe('PR creation', () => {
		it('should create PR when worktree is used and PR creation enabled', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Single task - need unchecked for first 3 calls
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
					onPRResult: mockOnPRResult,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature/test',
							createPROnCompletion: true,
						},
					},
					'/test/folder'
				);
			});

			expect(mockCreatePR).toHaveBeenCalled();
			expect(mockOnPRResult).toHaveBeenCalledWith(
				expect.objectContaining({
					success: true,
					prUrl: 'https://github.com/test/test/pull/1',
				})
			);
		});

		it('should handle PR creation failure', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Mock PR creation failure
			mockCreatePR.mockResolvedValue({ success: false, error: 'PR creation failed' });

			// Single task - need unchecked for first 3 calls
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
					onPRResult: mockOnPRResult,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature/test',
							createPROnCompletion: true,
						},
					},
					'/test/folder'
				);
			});

			expect(mockOnPRResult).toHaveBeenCalledWith(
				expect.objectContaining({
					success: false,
					error: 'PR creation failed',
				})
			);
		});

		it('should use custom target branch for PR', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Single task - need unchecked for first 3 calls
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
					onPRResult: mockOnPRResult,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature/test',
							createPROnCompletion: true,
							prTargetBranch: 'develop',
						},
					},
					'/test/folder'
				);
			});

			expect(mockCreatePR).toHaveBeenCalledWith(
				'/test/worktree',
				'develop',
				expect.any(String),
				expect.any(String),
				undefined
			);
		});
	});

	describe('loop mode', () => {
		it('should stop at max loops', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Mock document that properly simulates task completion cycle
			// The batch processor calls readDoc at multiple points - we need to simulate
			// tasks being completed after the agent runs
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				// Calls 1-3: initial count, doc start, template - show unchecked
				// Call 4: after agent runs - show checked (task completed)
				// The reset-on-completion will uncheck, but since we hit maxLoops=1, we exit
				if (callCount <= 3) {
					return { success: true, content: '- [ ] Task 1' };
				} else {
					return { success: true, content: '- [x] Task 1' };
				}
			});

			// Track agent calls
			let spawnCount = 0;
			mockOnSpawnAgent.mockImplementation(async () => {
				spawnCount++;
				return { success: true, agentSessionId: `session-${spawnCount}` };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: true }],
						prompt: 'Test',
						loopEnabled: true,
						maxLoops: 1,
					},
					'/test/folder'
				);
			});

			// Should complete after max loops reached
			expect(mockOnComplete).toHaveBeenCalled();
			// Should have spawned at least one agent
			expect(spawnCount).toBeGreaterThanOrEqual(1);
		});
	});

	describe('reset on completion', () => {
		it('should create working copy when resetOnCompletion is enabled', async () => {
			// Note: Reset-on-completion now uses working copies in /Runs/ directory
			// instead of modifying the original document. This preserves the original
			// and allows the agent to work on a copy.
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// First 3 reads return unchecked task (initial count, doc start, template expansion)
			// After that, return checked task (agent completed it)
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) {
					return { success: true, content: '- [ ] Task 1' };
				}
				// After task completion
				return { success: true, content: '- [x] Task 1' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: true }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should have created a working copy for the reset-on-completion document
			expect(mockCreateWorkingCopy).toHaveBeenCalledWith('/test/folder', 'tasks', 1, undefined);
		});
	});

	describe('audio feedback', () => {
		it('should speak synopsis when audio feedback is enabled', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			const mockSpeak = vi.fn().mockResolvedValue(undefined);
			window.maestro.notification = {
				...window.maestro.notification,
				speak: mockSpeak,
			};

			// Single task - need unchecked for first 3 calls
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
					audioFeedbackEnabled: true,
					audioFeedbackCommand: 'say',
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockSpeak).toHaveBeenCalled();
		});
	});

	describe('state broadcasting', () => {
		it('should broadcast state to web interface', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Single task - need unchecked for first 3 calls
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should have broadcast state updates
			expect(mockBroadcastAutoRunState).toHaveBeenCalled();
		});
	});

	describe('history entries', () => {
		it('should add history entry for each completed task', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Single task - need unchecked for first 3 calls
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockOnAddHistoryEntry).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'AUTO',
					sessionId: 'test-session-id',
				})
			);
		});
	});

	describe('hasAnyActiveBatch and activeBatchSessionIds', () => {
		it('should update when batch starts and ends', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Single task - need unchecked for first 3 calls
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			// Initially no active batches
			expect(result.current.hasAnyActiveBatch).toBe(false);
			expect(result.current.activeBatchSessionIds).toEqual([]);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// After batch completes, no active batches
			expect(result.current.hasAnyActiveBatch).toBe(false);
		});
	});

	describe('synopsis parsing', () => {
		it('should parse synopsis with proper Summary and Details format', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Mock agent response with synopsis format (synopsis is now extracted from agent response)
			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'mock-claude-session',
				usageStats: {
					inputTokens: 100,
					outputTokens: 200,
					totalCostUsd: 0.01,
					cacheReadInputTokens: 0,
					cacheCreationInputTokens: 0,
					contextWindow: 0,
				},
				response:
					'**Summary:** Created new component\n\n**Details:** Added a React component with hooks and tests.',
			});

			// Single task that completes
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should have added history entry with parsed synopsis
			expect(mockOnAddHistoryEntry).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'AUTO',
					summary: 'Created new component',
				})
			);
		});

		it('should handle synopsis with ANSI codes and box characters', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Mock agent response with ANSI codes and box drawing chars (synopsis is now extracted from agent response)
			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'mock-claude-session',
				usageStats: {
					inputTokens: 100,
					outputTokens: 200,
					totalCostUsd: 0.01,
					cacheReadInputTokens: 0,
					cacheCreationInputTokens: 0,
					contextWindow: 0,
				},
				response: '\x1b[32m**Summary:**\x1b[0m ─── Task done │\n\n**Details:** Info here.',
			});

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should have cleaned up the synopsis
			expect(mockOnAddHistoryEntry).toHaveBeenCalled();
		});

		it('should handle synopsis without Details section', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Mock agent response with only Summary (synopsis is now extracted from agent response)
			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'mock-claude-session',
				usageStats: {
					inputTokens: 100,
					outputTokens: 200,
					totalCostUsd: 0.01,
					cacheReadInputTokens: 0,
					cacheCreationInputTokens: 0,
					contextWindow: 0,
				},
				response: '**Summary:** No changes made.',
			});

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockOnAddHistoryEntry).toHaveBeenCalledWith(
				expect.objectContaining({
					summary: 'No changes made.',
				})
			);
		});

		it('should handle synopsis without proper format (fallback to first line)', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Mock agent response without proper markdown format (synopsis is now extracted from agent response)
			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'mock-claude-session',
				usageStats: {
					inputTokens: 100,
					outputTokens: 200,
					totalCostUsd: 0.01,
					cacheReadInputTokens: 0,
					cacheCreationInputTokens: 0,
					contextWindow: 0,
				},
				response: 'Just a plain text response\nWith multiple lines.',
			});

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Shared synopsis extraction now normalizes plain text to the first sentence.
			expect(mockOnAddHistoryEntry).toHaveBeenCalledWith(
				expect.objectContaining({
					summary: 'Just a plain text response',
				})
			);
		});

		it('should handle empty synopsis response', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Mock agent response with empty text (synopsis is now extracted from agent response)
			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'mock-claude-session',
				usageStats: {
					inputTokens: 100,
					outputTokens: 200,
					totalCostUsd: 0.01,
					cacheReadInputTokens: 0,
					cacheCreationInputTokens: 0,
					contextWindow: 0,
				},
				response: '',
			});

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should use default summary (includes document name prefix)
			expect(mockOnAddHistoryEntry).toHaveBeenCalledWith(
				expect.objectContaining({
					summary: expect.stringContaining('Task completed'),
				})
			);
		});

		it('should handle synopsis failure gracefully', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Mock agent failure (synopsis is now extracted from agent response)
			mockOnSpawnAgent.mockResolvedValue({
				success: false,
				agentSessionId: 'mock-claude-session',
				usageStats: {
					inputTokens: 100,
					outputTokens: 200,
					totalCostUsd: 0.01,
					cacheReadInputTokens: 0,
					cacheCreationInputTokens: 0,
					contextWindow: 0,
				},
				response: '',
			});

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should use default summary
			expect(mockOnAddHistoryEntry).toHaveBeenCalled();
		});

		it('should handle synopsis generation error', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Mock agent throwing error (synopsis is now extracted from agent response)
			mockOnSpawnAgent.mockRejectedValue(new Error('Agent execution failed'));

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should still complete and add history entry
			expect(mockOnAddHistoryEntry).toHaveBeenCalled();
			expect(mockOnComplete).toHaveBeenCalled();
		});
	});

	describe('document reading and template substitution', () => {
		it('should substitute template variables in document content', async () => {
			const sessions = [createMockSession({ name: 'MySession' })];
			const groups = [createMockGroup({ name: 'MyGroup' })];

			// Document with template variables - uses callCount to progress task completion
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task for ${session_name}' };
				return { success: true, content: '- [x] Task for MySession' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Process: ${session_name}',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockOnSpawnAgent).toHaveBeenCalled();
		});

		it('should resolve git branch for project memory validation from projectMemoryExecution.repoRoot', async () => {
			const sessions = [createMockSession({ cwd: '/session-cwd', projectRoot: '/session-cwd' })];
			const groups = [createMockGroup()];

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test prompt',
						loopEnabled: false,
						projectMemoryExecution: {
							repoRoot: '/repo-from-project-memory',
							taskId: 'PM-01',
							executorId: 'codex-main',
						},
					},
					'/test/folder'
				);
			});

			expect(mockStatus).toHaveBeenCalledWith('/repo-from-project-memory', undefined);
			expect(mockBranch).toHaveBeenCalledWith('/repo-from-project-memory', undefined);
			expect(mockValidateExecutionStart).toHaveBeenCalledWith(
				'/repo-from-project-memory',
				'PM-01',
				'codex-main',
				'main'
			);
		});

		it('should handle document read failure gracefully (no expansion if read fails)', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// First read for counting, then task progresses to completion
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				// First read for initial count - has task
				if (callCount === 1) return { success: true, content: '- [ ] Task' };
				// Second read for document update - returns original (still has task)
				if (callCount === 2) return { success: true, content: '- [ ] Task' };
				// Reads for template expansion could fail but we still spawn
				// After spawn, task is marked complete
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should have attempted to spawn agent and completed
			expect(mockOnSpawnAgent).toHaveBeenCalled();
			expect(mockOnComplete).toHaveBeenCalled();
		});
	});

	describe('git branch detection', () => {
		it('should get git branch for git repos', async () => {
			const sessions = [createMockSession({ isGitRepo: true })];
			const groups = [createMockGroup()];

			mockBranch.mockResolvedValue({ stdout: 'feature/test' });

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test ${git_branch}',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockStatus).toHaveBeenCalled();
			expect(mockBranch).toHaveBeenCalled();
		});

		it('should handle git status failure gracefully', async () => {
			const sessions = [createMockSession({ isGitRepo: true })];
			const groups = [createMockGroup()];

			mockStatus.mockRejectedValue(new Error('Git error'));

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should still proceed
			expect(mockOnSpawnAgent).toHaveBeenCalled();
		});

		it('should not fetch git status for non-git repos', async () => {
			const sessions = [createMockSession({ isGitRepo: false })];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockStatus).not.toHaveBeenCalled();
			expect(mockBranch).not.toHaveBeenCalled();
		});
	});

	describe('group name detection', () => {
		it('should find group name for session with groupId', async () => {
			const sessions = [createMockSession({ groupId: 'group-1' })];
			const groups = [createMockGroup({ id: 'group-1', name: 'My Group' })];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Group: ${group_name}',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockOnSpawnAgent).toHaveBeenCalled();
		});
	});

	describe('multiple documents', () => {
		it('should process multiple documents in order', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Track which document is being read
			const readOrder: string[] = [];
			let doc1Calls = 0;
			let doc2Calls = 0;

			// Mock readDoc with call-count thresholds that account for the recount-all-documents
			// logic after each task. For each document, reads happen at:
			//   doc1: initial count, doc-loop entry, processTask post-read, recount-all
			//   doc2: initial count, recount-all (after doc1), doc-loop entry, processTask post-read
			// The "agent completed" transition (unchecked → checked) should happen after processTask,
			// so doc1 returns checked on call 3+ and doc2 returns checked on call 4+.
			mockReadDoc.mockImplementation(async (_folder: string, filename: string) => {
				readOrder.push(filename);

				if (filename === 'doc1.md') {
					doc1Calls++;
					if (doc1Calls <= 2) return { success: true, content: '- [ ] Doc1 Task' };
					return { success: true, content: '- [x] Doc1 Task' };
				}
				if (filename === 'doc2.md') {
					doc2Calls++;
					if (doc2Calls <= 3) return { success: true, content: '- [ ] Doc2 Task' };
					return { success: true, content: '- [x] Doc2 Task' };
				}
				return { success: true, content: '' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [
							{ filename: 'doc1', resetOnCompletion: false },
							{ filename: 'doc2', resetOnCompletion: false },
						],
						prompt: 'Process document',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockOnSpawnAgent).toHaveBeenCalledTimes(2);
			expect(mockOnComplete).toHaveBeenCalled();
		});

		it('should skip documents with no tasks', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			mockReadDoc.mockImplementation(async (_folder: string, filename: string) => {
				if (filename === 'empty.md') {
					return { success: true, content: '# No tasks here' };
				}
				if (filename === 'tasks.md') {
					return { success: true, content: '- [x] Already done' };
				}
				return { success: true, content: '' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [
							{ filename: 'empty', resetOnCompletion: false },
							{ filename: 'tasks', resetOnCompletion: false },
						],
						prompt: 'Process',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should not spawn agent for empty documents
			expect(mockOnSpawnAgent).not.toHaveBeenCalled();
		});
	});

	describe('task error handling', () => {
		it('should continue to next task on agent spawn error', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Multiple tasks
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task 1\n- [ ] Task 2' };
				if (callCount <= 4) return { success: true, content: '- [x] Task 1\n- [ ] Task 2' };
				return { success: true, content: '- [x] Task 1\n- [x] Task 2' };
			});

			// First spawn fails, second succeeds
			let spawnCount = 0;
			mockOnSpawnAgent.mockImplementation(async () => {
				spawnCount++;
				if (spawnCount === 1) throw new Error('Spawn failed');
				return { success: true, agentSessionId: 'session-2' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should have attempted both tasks
			expect(mockOnSpawnAgent).toHaveBeenCalledTimes(2);
			expect(mockOnComplete).toHaveBeenCalled();
		});
	});

	describe('error pause handling', () => {
		it('should pause processing until resumeAfterError is called', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			const contentInitial = '- [ ] Task 1\n- [ ] Task 2';
			const contentAfterFirst = '- [x] Task 1\n- [ ] Task 2';
			const contentAfterSecond = '- [x] Task 1\n- [x] Task 2';
			const docStates = [
				contentInitial,
				contentInitial,
				contentInitial,
				contentAfterFirst,
				contentAfterFirst,
				contentAfterSecond,
			];

			mockReadDoc.mockImplementation(async () => ({
				success: true,
				content: docStates.shift() ?? contentAfterSecond,
			}));

			let pauseHandler:
				| ((
						sessionId: string,
						error: AgentError,
						documentIndex: number,
						taskDescription?: string
				  ) => void)
				| null = null;

			mockOnSpawnAgent.mockImplementation(async () => {
				if (pauseHandler) {
					pauseHandler(
						'test-session-id',
						{
							type: 'auth',
							message: 'Auth error',
							recoverable: true,
							timestamp: Date.now(),
						},
						0,
						'Task 1'
					);
					pauseHandler = null;
				}
				return { success: true, agentSessionId: 'session-1' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			pauseHandler = result.current.pauseBatchOnError;

			let startPromise: Promise<void>;
			act(() => {
				startPromise = result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			await waitFor(() => expect(mockOnSpawnAgent).toHaveBeenCalledTimes(1));
			await waitFor(() =>
				expect(result.current.getBatchState('test-session-id').errorPaused).toBe(true)
			);
			expect(mockOnSpawnAgent).toHaveBeenCalledTimes(1);

			act(() => {
				result.current.resumeAfterError('test-session-id');
			});

			await startPromise;
			expect(mockOnSpawnAgent).toHaveBeenCalledTimes(2);
		});
	});

	describe('error pause handling when processTask throws', () => {
		it('should await error resolution when processTask throws on last task and abort stops batch', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Single task document — processTask will throw on this task
			mockReadDoc.mockImplementation(async () => ({
				success: true,
				content: '- [ ] Task 1',
			}));

			let pauseHandler:
				| ((
						sessionId: string,
						error: AgentError,
						documentIndex: number,
						taskDescription?: string
				  ) => void)
				| null = null;

			// processTask calls pauseBatchOnError then throws (simulates agent error + processTask failure)
			mockOnSpawnAgent.mockImplementation(async () => {
				if (pauseHandler) {
					pauseHandler(
						'test-session-id',
						{
							type: 'token_exhaustion',
							message: 'Prompt is too long',
							recoverable: true,
							timestamp: Date.now(),
						},
						0,
						'Task 1'
					);
					pauseHandler = null;
				}
				throw new Error('Agent exited with error');
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			pauseHandler = result.current.pauseBatchOnError;

			let startPromise: Promise<void>;
			act(() => {
				startPromise = result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Wait for error pause state
			await waitFor(() =>
				expect(result.current.getBatchState('test-session-id').errorPaused).toBe(true)
			);

			// Abort the batch
			act(() => {
				result.current.abortBatchOnError('test-session-id');
			});

			await startPromise;

			// Batch should have completed (stopped via abort)
			expect(result.current.getBatchState('test-session-id').isRunning).toBe(false);
			// Only one spawn attempt — didn't retry after abort
			expect(mockOnSpawnAgent).toHaveBeenCalledTimes(1);
		});

		it('should await error resolution when processTask throws on last task and resume re-reads document', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			let readCount = 0;
			mockReadDoc.mockImplementation(async () => {
				readCount++;
				// First reads: single unchecked task
				if (readCount <= 2) return { success: true, content: '- [ ] Task 1' };
				// After resume, task is already checked (e.g., was partially completed)
				return { success: true, content: '- [x] Task 1' };
			});

			let pauseHandler:
				| ((
						sessionId: string,
						error: AgentError,
						documentIndex: number,
						taskDescription?: string
				  ) => void)
				| null = null;

			let spawnCount = 0;
			mockOnSpawnAgent.mockImplementation(async () => {
				spawnCount++;
				if (spawnCount === 1 && pauseHandler) {
					pauseHandler(
						'test-session-id',
						{
							type: 'token_exhaustion',
							message: 'Prompt is too long',
							recoverable: true,
							timestamp: Date.now(),
						},
						0,
						'Task 1'
					);
					pauseHandler = null;
					throw new Error('Agent exited with error');
				}
				return { success: true, agentSessionId: 'session-1' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			pauseHandler = result.current.pauseBatchOnError;

			let startPromise: Promise<void>;
			act(() => {
				startPromise = result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Wait for error pause state
			await waitFor(() =>
				expect(result.current.getBatchState('test-session-id').errorPaused).toBe(true)
			);

			// Resume after error
			act(() => {
				result.current.resumeAfterError('test-session-id');
			});

			await startPromise;

			// Error should be cleared
			expect(result.current.getBatchState('test-session-id').errorPaused).toBe(false);
			// Batch should complete
			expect(result.current.getBatchState('test-session-id').isRunning).toBe(false);
		});
	});

	describe('skip-document across multi-doc boundary', () => {
		it('should skip errored document and stop the next implicit dependent document', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Two documents: doc1 has 1 task, doc2 has 1 task
			// Use filename-based logic: doc1 always has unchecked task (it errors before completing),
			// doc2 starts unchecked and becomes checked after the agent processes it.
			let doc2Completed = false;
			mockReadDoc.mockImplementation(async (_folder: string, filename: string) => {
				if (filename.includes('doc1')) {
					return { success: true, content: '- [ ] Task A' };
				}
				// doc2 — unchecked until agent succeeds, then checked
				if (doc2Completed) return { success: true, content: '- [x] Task B' };
				return { success: true, content: '- [ ] Task B' };
			});

			let pauseHandler:
				| ((
						sessionId: string,
						error: AgentError,
						documentIndex: number,
						taskDescription?: string
				  ) => void)
				| null = null;

			let spawnCount = 0;
			mockOnSpawnAgent.mockImplementation(async () => {
				spawnCount++;
				if (spawnCount === 1 && pauseHandler) {
					// First spawn (doc1) — triggers error pause and throws
					pauseHandler(
						'test-session-id',
						{
							type: 'token_exhaustion',
							message: 'Context limit',
							recoverable: true,
							timestamp: Date.now(),
						},
						0,
						'Task A'
					);
					pauseHandler = null;
					throw new Error('Agent exited with error');
				}
				// Second spawn (doc2) — succeeds, mark doc2 as completed
				// so the post-task re-read in processTask sees checked content
				doc2Completed = true;
				return { success: true, agentSessionId: 'session-2' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			pauseHandler = result.current.pauseBatchOnError;

			let startPromise: Promise<void>;
			act(() => {
				startPromise = result.current.startBatchRun(
					'test-session-id',
					{
						documents: [
							{ filename: 'doc1', resetOnCompletion: false },
							{ filename: 'doc2', resetOnCompletion: false },
						],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Wait for error pause on doc1
			await waitFor(() =>
				expect(result.current.getBatchState('test-session-id').errorPaused).toBe(true)
			);

			// Skip the errored document
			act(() => {
				result.current.skipCurrentDocument('test-session-id');
			});

			await startPromise;

			// Batch should have completed
			expect(result.current.getBatchState('test-session-id').isRunning).toBe(false);
			// Implicit linear graphs treat doc2 as dependent on doc1, so it should not run
			expect(mockOnSpawnAgent).toHaveBeenCalledTimes(1);
		});

		it('should not run dependent documents after skip-document, but should continue independent work', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			const docState: Record<string, string> = {
				'doc1.md': '- [ ] Task A',
				'doc2.md': '- [ ] Task B',
				'doc3.md': '- [ ] Task C',
			};

			mockReadDoc.mockImplementation(async (_folder: string, filename: string) => ({
				success: true,
				content: docState[filename] ?? '',
			}));

			let pauseHandler:
				| ((
						sessionId: string,
						error: AgentError,
						documentIndex: number,
						taskDescription?: string
				  ) => void)
				| null = null;

			mockOnSpawnAgent.mockImplementation(async (_targetSessionId: string, prompt: string) => {
				if (prompt.includes('/doc1.md') && pauseHandler) {
					pauseHandler(
						'test-session-id',
						{
							type: 'token_exhaustion',
							message: 'Context limit',
							recoverable: true,
							timestamp: Date.now(),
						},
						0,
						'Task A'
					);
					pauseHandler = null;
					throw new Error('Agent exited with error');
				}

				if (prompt.includes('/doc3.md')) {
					docState['doc3.md'] = '- [x] Task C';
				}

				return { success: true, agentSessionId: 'session-doc3' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			pauseHandler = result.current.pauseBatchOnError;

			let startPromise: Promise<void>;
			act(() => {
				startPromise = result.current.startBatchRun(
					'test-session-id',
					{
						documents: [
							{ filename: 'doc1', resetOnCompletion: false },
							{ filename: 'doc2', resetOnCompletion: false },
							{ filename: 'doc3', resetOnCompletion: false },
						],
						prompt: 'Test DAG skip behavior',
						loopEnabled: false,
						maxParallelism: 2,
						taskGraph: {
							nodes: [
								{ id: 'doc1', documentIndex: 0, dependsOn: [] },
								{ id: 'doc2', documentIndex: 1, dependsOn: ['doc1'] },
								{ id: 'doc3', documentIndex: 2, dependsOn: [] },
							],
						},
					},
					'/test/folder'
				);
			});

			await waitFor(() =>
				expect(result.current.getBatchState('test-session-id').errorPaused).toBe(true)
			);

			act(() => {
				result.current.skipCurrentDocument('test-session-id');
			});

			await startPromise;

			expect(result.current.getBatchState('test-session-id').isRunning).toBe(false);
			expect(mockOnSpawnAgent).toHaveBeenCalledTimes(2);
			expect(mockOnSpawnAgent).toHaveBeenNthCalledWith(
				1,
				'test-session-id',
				expect.stringContaining('/doc1.md'),
				undefined
			);
			expect(mockOnSpawnAgent).toHaveBeenNthCalledWith(
				2,
				'test-session-id',
				expect.stringContaining('/doc3.md'),
				undefined
			);
			expect(mockOnSpawnAgent).not.toHaveBeenCalledWith(
				'test-session-id',
				expect.stringContaining('/doc2.md'),
				undefined
			);
		});
	});

	describe('error state fully cleared after abort', () => {
		it('should have no lingering error fields after abort completes batch', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			mockReadDoc.mockImplementation(async () => ({
				success: true,
				content: '- [ ] Task 1\n- [ ] Task 2',
			}));

			let pauseHandler:
				| ((
						sessionId: string,
						error: AgentError,
						documentIndex: number,
						taskDescription?: string
				  ) => void)
				| null = null;

			mockOnSpawnAgent.mockImplementation(async () => {
				if (pauseHandler) {
					pauseHandler(
						'test-session-id',
						{
							type: 'auth_expired',
							message: 'Auth token expired',
							recoverable: false,
							timestamp: Date.now(),
						},
						0,
						'Task 1'
					);
					pauseHandler = null;
					throw new Error('Agent auth failure');
				}
				return { success: true, agentSessionId: 'session-1' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			pauseHandler = result.current.pauseBatchOnError;

			let startPromise: Promise<void>;
			act(() => {
				startPromise = result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			await waitFor(() =>
				expect(result.current.getBatchState('test-session-id').errorPaused).toBe(true)
			);

			// Abort
			act(() => {
				result.current.abortBatchOnError('test-session-id');
			});

			await startPromise;

			// All error fields must be completely cleared
			const finalState = result.current.getBatchState('test-session-id');
			expect(finalState.isRunning).toBe(false);
			expect(finalState.errorPaused).toBe(false);
			expect(finalState.error).toBeUndefined();
			expect(finalState.errorDocumentIndex).toBeUndefined();
			expect(finalState.errorTaskDescription).toBeUndefined();
		});
	});

	describe('rapid error→resume→error cycle', () => {
		it('should handle sequential error-resume-error without corrupting refs', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Document has 3 tasks
			let readCount = 0;
			mockReadDoc.mockImplementation(async () => {
				readCount++;
				// Initial reads: 3 tasks unchecked
				if (readCount <= 2)
					return { success: true, content: '- [ ] Task 1\n- [ ] Task 2\n- [ ] Task 3' };
				// After first resume: 1 done, 2 remaining
				if (readCount <= 4)
					return { success: true, content: '- [x] Task 1\n- [ ] Task 2\n- [ ] Task 3' };
				// After second resume: 2 done, 1 remaining
				if (readCount <= 6)
					return { success: true, content: '- [x] Task 1\n- [x] Task 2\n- [ ] Task 3' };
				// Final: all done
				return { success: true, content: '- [x] Task 1\n- [x] Task 2\n- [x] Task 3' };
			});

			let pauseHandler:
				| ((
						sessionId: string,
						error: AgentError,
						documentIndex: number,
						taskDescription?: string
				  ) => void)
				| null = null;

			let spawnCount = 0;
			mockOnSpawnAgent.mockImplementation(async () => {
				spawnCount++;
				// First spawn: error + throw
				if (spawnCount === 1 && pauseHandler) {
					pauseHandler(
						'test-session-id',
						{
							type: 'rate_limited',
							message: 'Rate limit hit',
							recoverable: true,
							timestamp: Date.now(),
						},
						0,
						'Task 1'
					);
					throw new Error('Rate limited');
				}
				// Second spawn: error again + throw
				if (spawnCount === 2 && pauseHandler) {
					pauseHandler(
						'test-session-id',
						{
							type: 'rate_limited',
							message: 'Rate limit hit again',
							recoverable: true,
							timestamp: Date.now(),
						},
						0,
						'Task 2'
					);
					throw new Error('Rate limited again');
				}
				// Third spawn: succeeds
				return { success: true, agentSessionId: 'session-3' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			pauseHandler = result.current.pauseBatchOnError;

			let startPromise: Promise<void>;
			act(() => {
				startPromise = result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// First error pause
			await waitFor(() =>
				expect(result.current.getBatchState('test-session-id').errorPaused).toBe(true)
			);
			expect(result.current.getBatchState('test-session-id').error?.message).toBe('Rate limit hit');

			// Resume first error
			act(() => {
				result.current.resumeAfterError('test-session-id');
			});

			// Second error pause
			await waitFor(() =>
				expect(result.current.getBatchState('test-session-id').errorPaused).toBe(true)
			);
			expect(result.current.getBatchState('test-session-id').error?.message).toBe(
				'Rate limit hit again'
			);

			// Resume second error
			act(() => {
				result.current.resumeAfterError('test-session-id');
			});

			await startPromise;

			// Batch completed successfully after two error cycles
			const finalState = result.current.getBatchState('test-session-id');
			expect(finalState.isRunning).toBe(false);
			expect(finalState.errorPaused).toBe(false);
			expect(finalState.error).toBeUndefined();
			// All three spawns happened
			expect(mockOnSpawnAgent).toHaveBeenCalledTimes(3);
		});
	});

	describe('session claude ID tracking', () => {
		it('should collect claude session IDs from successful spawns', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Multiple tasks
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task 1\n- [ ] Task 2' };
				if (callCount <= 4) return { success: true, content: '- [x] Task 1\n- [ ] Task 2' };
				return { success: true, content: '- [x] Task 1\n- [x] Task 2' };
			});

			let spawnCount = 0;
			mockOnSpawnAgent.mockImplementation(async () => {
				spawnCount++;
				return { success: true, agentSessionId: `claude-session-${spawnCount}` };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should have registered session origins
			expect(mockRegisterSessionOrigin).toHaveBeenCalledWith(
				'claude-code',
				'/test/path',
				'claude-session-1',
				'auto'
			);
			expect(mockRegisterSessionOrigin).toHaveBeenCalledWith(
				'claude-code',
				'/test/path',
				'claude-session-2',
				'auto'
			);
		});

		it('should handle missing claude session ID', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			// Spawn succeeds but no claude session ID
			mockOnSpawnAgent.mockResolvedValue({ success: true });

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should not call synopsis since no claude session ID
			// But should still complete
			expect(mockOnComplete).toHaveBeenCalled();
		});
	});

	describe('usage stats tracking', () => {
		it('should track usage stats from agent spawns', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'test-session',
				usageStats: {
					inputTokens: 500,
					outputTokens: 1000,
					totalCostUsd: 0.05,
					cacheReadInputTokens: 100,
					cacheCreationInputTokens: 50,
					contextWindow: 100000,
				},
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// History entry should include usage stats
			expect(mockOnAddHistoryEntry).toHaveBeenCalledWith(
				expect.objectContaining({
					usageStats: expect.objectContaining({
						inputTokens: 500,
						outputTokens: 1000,
						totalCostUsd: 0.05,
					}),
				})
			);
		});
	});

	describe('elapsed time tracking', () => {
		it('should track elapsed time for each task', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			// Delay agent spawn to create elapsed time
			mockOnSpawnAgent.mockImplementation(async () => {
				await new Promise((resolve) => setTimeout(resolve, 10));
				return { success: true, agentSessionId: 'test' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// History entry should have elapsed time
			expect(mockOnAddHistoryEntry).toHaveBeenCalledWith(
				expect.objectContaining({
					elapsedTimeMs: expect.any(Number),
				})
			);
		});

		it('should track total elapsed time for batch completion', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockOnComplete).toHaveBeenCalledWith(
				expect.objectContaining({
					elapsedTimeMs: expect.any(Number),
				})
			);
		});
	});

	describe('task count handling', () => {
		it('should handle Claude adding tasks (negative completion count)', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Claude adds a task instead of completing one
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task 1' };
				// After first run, there are MORE tasks
				if (callCount <= 4) return { success: true, content: '- [ ] Task 1\n- [ ] Task 2' };
				// Eventually complete
				if (callCount <= 6) return { success: true, content: '- [x] Task 1\n- [ ] Task 2' };
				return { success: true, content: '- [x] Task 1\n- [x] Task 2' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockOnComplete).toHaveBeenCalled();
		});
	});

	describe('worktree with cwd override', () => {
		it('should pass worktree path as cwd override to agent', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/custom/worktree',
							branchName: 'feature/test',
						},
					},
					'/test/folder'
				);
			});

			// Should have called spawn with cwd override while preserving the user prompt.
			expect(mockOnSpawnAgent).toHaveBeenCalledWith(
				'test-session-id',
				expect.stringContaining('Test'),
				'/custom/worktree'
			);
		});
	});

	describe('session name in completion', () => {
		it('should use session name in completion callback', async () => {
			const sessions = [createMockSession({ name: 'My Custom Session' })];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockOnComplete).toHaveBeenCalledWith(
				expect.objectContaining({
					sessionName: 'My Custom Session',
				})
			);
		});

		it('should use cwd folder name as fallback for session name', async () => {
			const sessions = [createMockSession({ name: '', cwd: '/path/to/myproject' })];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockOnComplete).toHaveBeenCalledWith(
				expect.objectContaining({
					sessionName: 'myproject',
				})
			);
		});
	});

	describe('stopBatchRun', () => {
		it('should set isStopping flag when called', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Simple test: start batch, call stop immediately, verify isStopping is set
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			mockOnSpawnAgent.mockResolvedValue({ success: true, agentSessionId: 'test' });

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			// Start batch and immediately stop
			act(() => {
				result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
				result.current.stopBatchRun('test-session-id');
			});

			// Verify stop flag is set
			expect(result.current.getBatchState('test-session-id').isStopping).toBe(true);
		});
	});

	describe('loop mode with max loops limit', () => {
		it('should stop after reaching maxLoops', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Simulate task completion: first 3 calls show unchecked, then checked
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				// Calls 1-3: initial count, doc start, template - show unchecked
				// Call 4+: after agent runs - show checked (task completed)
				if (callCount <= 3) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			mockOnSpawnAgent.mockResolvedValue({ success: true, agentSessionId: 'test' });

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: true,
						maxLoops: 2,
					},
					'/test/folder'
				);
			});

			expect(mockOnComplete).toHaveBeenCalled();
		});
	});

	describe('worktree setup', () => {
		it('should handle worktree setup failure', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			mockReadDoc.mockResolvedValue({ success: true, content: '- [ ] Task' });

			// Mock worktree setup to fail
			const mockWorktreeSetup = vi.fn().mockResolvedValue({
				success: false,
				error: 'Failed to create worktree',
			});
			window.maestro.git.worktreeSetup = mockWorktreeSetup;

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature-branch',
							createPROnCompletion: false,
						},
					},
					'/test/folder'
				);
			});

			// Should not have spawned agent due to worktree failure
			expect(mockOnSpawnAgent).not.toHaveBeenCalled();
		});

		it('should handle worktree branch mismatch and checkout', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			// Mock worktree setup with branch mismatch
			const mockWorktreeSetup = vi.fn().mockResolvedValue({
				success: true,
				branchMismatch: true,
			});
			window.maestro.git.worktreeSetup = mockWorktreeSetup;

			const mockWorktreeCheckout = vi.fn().mockResolvedValue({
				success: true,
			});
			window.maestro.git.worktreeCheckout = mockWorktreeCheckout;

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature-branch',
							createPROnCompletion: false,
						},
					},
					'/test/folder'
				);
			});

			// Should have called worktree checkout
			expect(mockWorktreeCheckout).toHaveBeenCalledWith(
				'/test/worktree',
				'feature-branch',
				true,
				undefined // sshRemoteId (undefined for local sessions)
			);

			// Should have spawned agent with worktree path while preserving the user prompt.
			expect(mockOnSpawnAgent).toHaveBeenCalledWith(
				'test-session-id',
				expect.stringContaining('Test'),
				'/test/worktree'
			);
		});

		it('should handle worktree checkout failure with uncommitted changes', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			mockReadDoc.mockResolvedValue({ success: true, content: '- [ ] Task' });

			// Mock worktree setup with branch mismatch
			const mockWorktreeSetup = vi.fn().mockResolvedValue({
				success: true,
				branchMismatch: true,
			});
			window.maestro.git.worktreeSetup = mockWorktreeSetup;

			// Mock checkout failure due to uncommitted changes
			const mockWorktreeCheckout = vi.fn().mockResolvedValue({
				success: false,
				hasUncommittedChanges: true,
			});
			window.maestro.git.worktreeCheckout = mockWorktreeCheckout;

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature-branch',
							createPROnCompletion: false,
						},
					},
					'/test/folder'
				);
			});

			// Should not have spawned agent due to checkout failure
			expect(mockOnSpawnAgent).not.toHaveBeenCalled();
		});
	});

	describe('PR creation on completion', () => {
		it('should create PR when worktree completes with createPROnCompletion enabled', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			// Mock worktree setup
			const mockWorktreeSetup = vi.fn().mockResolvedValue({ success: true });
			window.maestro.git.worktreeSetup = mockWorktreeSetup;

			// Mock PR creation
			const mockCreatePR = vi.fn().mockResolvedValue({
				success: true,
				prUrl: 'https://github.com/test/repo/pull/123',
			});
			window.maestro.git.createPR = mockCreatePR;

			// Mock default branch detection
			const mockGetDefaultBranch = vi.fn().mockResolvedValue({
				success: true,
				branch: 'main',
			});
			window.maestro.git.getDefaultBranch = mockGetDefaultBranch;

			const mockOnPRResult = vi.fn();

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
					onPRResult: mockOnPRResult,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature-branch',
							createPROnCompletion: true,
						},
					},
					'/test/folder'
				);
			});

			// Should have created PR
			expect(mockCreatePR).toHaveBeenCalled();
			expect(mockOnPRResult).toHaveBeenCalledWith(
				expect.objectContaining({
					success: true,
					prUrl: 'https://github.com/test/repo/pull/123',
				})
			);
		});

		it('should handle PR creation failure gracefully', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			// Mock worktree setup
			const mockWorktreeSetup = vi.fn().mockResolvedValue({ success: true });
			window.maestro.git.worktreeSetup = mockWorktreeSetup;

			// Mock PR creation failure
			const mockCreatePR = vi.fn().mockResolvedValue({
				success: false,
				error: 'No upstream configured',
			});
			window.maestro.git.createPR = mockCreatePR;

			const mockGetDefaultBranch = vi.fn().mockResolvedValue({
				success: true,
				branch: 'main',
			});
			window.maestro.git.getDefaultBranch = mockGetDefaultBranch;

			const mockOnPRResult = vi.fn();

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
					onPRResult: mockOnPRResult,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature-branch',
							createPROnCompletion: true,
						},
					},
					'/test/folder'
				);
			});

			// Should report PR failure but still complete the batch
			expect(mockOnPRResult).toHaveBeenCalledWith(
				expect.objectContaining({
					success: false,
					error: 'No upstream configured',
				})
			);
			expect(mockOnComplete).toHaveBeenCalled();
		});

		it('should use custom PR target branch when specified', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			// Mock worktree setup
			const mockWorktreeSetup = vi.fn().mockResolvedValue({ success: true });
			window.maestro.git.worktreeSetup = mockWorktreeSetup;

			// Mock PR creation
			const mockCreatePR = vi.fn().mockResolvedValue({
				success: true,
				prUrl: 'https://github.com/test/repo/pull/456',
			});
			window.maestro.git.createPR = mockCreatePR;

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature-branch',
							createPROnCompletion: true,
							prTargetBranch: 'develop',
						},
					},
					'/test/folder'
				);
			});

			// Should have used custom target branch
			expect(mockCreatePR).toHaveBeenCalledWith(
				'/test/worktree',
				'develop',
				expect.any(String),
				expect.any(String),
				undefined
			);
		});
	});

	describe('audio feedback', () => {
		it('should speak synopsis when audio feedback is enabled', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'test-session',
				usageStats: {
					inputTokens: 100,
					outputTokens: 200,
					totalCostUsd: 0.01,
					cacheReadInputTokens: 0,
					cacheCreationInputTokens: 0,
					contextWindow: 0,
				},
				response: '**Summary:** Fixed the bug\n\n**Details:** Updated the function.',
			});

			const mockSpeak = vi.fn().mockResolvedValue(undefined);
			window.maestro.notification.speak = mockSpeak;

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
					audioFeedbackEnabled: true,
					audioFeedbackCommand: 'say',
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockSpeak).toHaveBeenNthCalledWith(
				1,
				'tasks を開始するのだ。残り 1 タスクなのだ。',
				'say'
			);
			expect(mockSpeak).toHaveBeenNthCalledWith(2, 'Fixed the bug', 'say');
		});

		it('should speak loop completion commentary in loop mode', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'test-session',
				usageStats: {
					inputTokens: 100,
					outputTokens: 200,
					totalCostUsd: 0.01,
					cacheReadInputTokens: 0,
					cacheCreationInputTokens: 0,
					contextWindow: 0,
				},
				response: '**Summary:** Fixed the bug\n\n**Details:** Updated the function.',
			});

			const mockSpeak = vi.fn().mockResolvedValue(undefined);
			window.maestro.notification.speak = mockSpeak;

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
					audioFeedbackEnabled: true,
					audioFeedbackCommand: 'say',
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: true,
					},
					'/test/folder'
				);
			});

			expect(mockSpeak).toHaveBeenCalledWith('1 ループ完了なのだ。1 タスク完了したのだ。', 'say');
		});
	});

	describe('reset-on-completion in loop mode', () => {
		it('should create working copy when document has resetOnCompletion enabled', async () => {
			// Note: Reset-on-completion now uses working copies in /Runs/ directory
			// instead of modifying the original document. This preserves the original
			// and allows the agent to work on a copy each loop iteration.
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// First 3 calls show unchecked, then checked after agent runs
			let readCount = 0;
			mockReadDoc.mockImplementation(async () => {
				readCount++;
				if (readCount <= 3) return { success: true, content: '- [ ] Repeating task' };
				return { success: true, content: '- [x] Repeating task' };
			});

			mockOnSpawnAgent.mockResolvedValue({ success: true, agentSessionId: 'test' });

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: true }],
						prompt: 'Test',
						loopEnabled: true,
						maxLoops: 1,
					},
					'/test/folder'
				);
			});

			// Should have created a working copy for the reset-on-completion document
			expect(mockCreateWorkingCopy).toHaveBeenCalledWith('/test/folder', 'tasks', 1, undefined);
		});
	});

	describe('PR creation exception handling', () => {
		it('should handle PR creation throwing an Error', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Mock worktree setup success
			mockWorktreeSetup.mockResolvedValue({ success: true });

			// Mock PR creation throws an Error
			mockCreatePR.mockRejectedValue(new Error('Network timeout'));

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'test-session',
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
					onPRResult: mockOnPRResult,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature-branch',
							createPROnCompletion: true,
						},
					},
					'/test/folder'
				);
			});

			// Should have notified of PR failure
			expect(mockOnPRResult).toHaveBeenCalledWith(
				expect.objectContaining({
					success: false,
					error: 'Network timeout',
				})
			);
		});

		it('should handle PR creation throwing a non-Error object', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			mockWorktreeSetup.mockResolvedValue({ success: true });
			mockCreatePR.mockRejectedValue('String error'); // Non-Error rejection

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'test-session',
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
					onPRResult: mockOnPRResult,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature-branch',
							createPROnCompletion: true,
						},
					},
					'/test/folder'
				);
			});

			// Should have notified with 'Unknown error' for non-Error objects
			expect(mockOnPRResult).toHaveBeenCalledWith(
				expect.objectContaining({
					success: false,
					error: 'Unknown error',
				})
			);
		});

		it('should handle PR creation exception without onPRResult callback', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			mockWorktreeSetup.mockResolvedValue({ success: true });
			mockCreatePR.mockRejectedValue(new Error('Git error'));

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'test-session',
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
					// No onPRResult callback - tests the if (onPRResult) branch
				})
			);

			// Should not throw even without onPRResult callback
			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature-branch',
							createPROnCompletion: true,
						},
					},
					'/test/folder'
				);
			});

			// Should still complete successfully
			expect(mockOnComplete).toHaveBeenCalled();
		});
	});

	describe('loop mode with multiple iterations', () => {
		it('should complete loop and add loop summary history entry', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Track document states: first 3 calls show unchecked, then checked
			let readCount = 0;
			mockReadDoc.mockImplementation(async () => {
				readCount++;
				// Calls 1-3: initial count, doc start, template - show unchecked
				if (readCount <= 3) return { success: true, content: '- [ ] Task 1' };
				// Call 4+: after agent - show checked
				return { success: true, content: '- [x] Task 1' };
			});

			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'test-session',
				usageStats: {
					inputTokens: 500,
					outputTokens: 200,
					totalCostUsd: 0.05,
					cacheReadInputTokens: 0,
					cacheCreationInputTokens: 0,
					contextWindow: 0,
				},
				response: '**Summary:** Fixed it\n\n**Details:** Done.',
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: true,
						maxLoops: 2, // Allow 2 loops
					},
					'/test/folder'
				);
			});

			// Verify completion was called
			expect(mockOnComplete).toHaveBeenCalled();
		});

		it('should exit loop when reaching max loops limit', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// First 3 calls show unchecked, then checked
			let readCount = 0;
			mockReadDoc.mockImplementation(async () => {
				readCount++;
				if (readCount <= 3) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'test-session',
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: true,
						maxLoops: 1, // Limit to 1 loop
					},
					'/test/folder'
				);
			});

			// Should exit after max loops
			expect(mockOnComplete).toHaveBeenCalled();
		});

		it('should handle loop with reset-on-completion documents', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// First 3 calls show unchecked, then checked
			let readCount = 0;
			mockReadDoc.mockImplementation(async () => {
				readCount++;
				if (readCount <= 3) return { success: true, content: '- [ ] Repeating task' };
				return { success: true, content: '- [x] Repeating task' };
			});

			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'test-session',
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: true }],
						prompt: 'Test',
						loopEnabled: true,
						maxLoops: 1, // Limit iterations
					},
					'/test/folder'
				);
			});

			expect(mockOnComplete).toHaveBeenCalled();
		});

		it('should exit loop when no tasks were processed in an iteration', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// First 3 calls show unchecked, then no tasks
			let readCount = 0;
			mockReadDoc.mockImplementation(async () => {
				readCount++;
				if (readCount <= 3) return { success: true, content: '- [ ] Task' };
				// After processing - no tasks left
				return { success: true, content: '# Empty\nNo tasks here.' };
			});

			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'test-session',
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: true,
						maxLoops: 5, // High limit - should exit early due to no tasks processed
					},
					'/test/folder'
				);
			});

			expect(mockOnComplete).toHaveBeenCalled();
		});
	});

	describe('worktree checkout handling', () => {
		it('should handle worktree checkout failure due to uncommitted changes', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Worktree exists but on different branch
			mockWorktreeSetup.mockResolvedValue({ success: true, branchMismatch: true });

			// Checkout fails due to uncommitted changes
			mockWorktreeCheckout.mockResolvedValue({
				success: false,
				hasUncommittedChanges: true,
			});

			mockReadDoc.mockResolvedValue({ success: true, content: '- [ ] Task' });

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature-branch',
						},
					},
					'/test/folder'
				);
			});

			// Should not have spawned agent due to checkout failure
			expect(mockOnSpawnAgent).not.toHaveBeenCalled();
		});

		it('should handle worktree checkout failure without uncommitted changes', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			mockWorktreeSetup.mockResolvedValue({ success: true, branchMismatch: true });

			// Checkout fails for other reasons
			mockWorktreeCheckout.mockResolvedValue({
				success: false,
				error: 'Branch does not exist',
			});

			mockReadDoc.mockResolvedValue({ success: true, content: '- [ ] Task' });

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature-branch',
						},
					},
					'/test/folder'
				);
			});

			// Should not have spawned agent due to checkout failure
			expect(mockOnSpawnAgent).not.toHaveBeenCalled();
		});

		it('should handle worktree setup exception', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Worktree setup throws exception
			mockWorktreeSetup.mockRejectedValue(new Error('Git not found'));

			mockReadDoc.mockResolvedValue({ success: true, content: '- [ ] Task' });

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature-branch',
						},
					},
					'/test/folder'
				);
			});

			// Should not have spawned agent due to exception
			expect(mockOnSpawnAgent).not.toHaveBeenCalled();
		});
	});

	describe('PR creation with fallback to default branch', () => {
		it('should use default branch when prTargetBranch is not specified', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			mockWorktreeSetup.mockResolvedValue({ success: true });
			mockGetDefaultBranch.mockResolvedValue({ success: true, branch: 'develop' });
			mockCreatePR.mockResolvedValue({ success: true, prUrl: 'https://github.com/test/pr/1' });

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'test-session',
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
					onPRResult: mockOnPRResult,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature-branch',
							createPROnCompletion: true,
							// No prTargetBranch - should use default
						},
					},
					'/test/folder'
				);
			});

			// Should have called getDefaultBranch
			expect(mockGetDefaultBranch).toHaveBeenCalled();

			// Should have created PR with detected default branch
			expect(mockCreatePR).toHaveBeenCalledWith(
				expect.any(String),
				'develop', // The detected default branch
				expect.any(String),
				expect.any(String),
				undefined
			);
		});

		it('should fall back to main when getDefaultBranch fails', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			mockWorktreeSetup.mockResolvedValue({ success: true });
			mockGetDefaultBranch.mockResolvedValue({ success: false });
			mockCreatePR.mockResolvedValue({ success: true, prUrl: 'https://github.com/test/pr/1' });

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'test-session',
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
					onPRResult: mockOnPRResult,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature-branch',
							createPROnCompletion: true,
						},
					},
					'/test/folder'
				);
			});

			// Should have created PR with fallback to 'main'
			expect(mockCreatePR).toHaveBeenCalledWith(
				expect.any(String),
				'main', // Fallback
				expect.any(String),
				expect.any(String),
				undefined
			);
		});
	});

	describe('session name extraction', () => {
		it('should extract session name from cwd when name is not set', async () => {
			// Session without a name, only cwd
			const sessions = [createMockSession({ name: '', cwd: '/path/to/MyProject' })];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'test-session',
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should extract 'MyProject' from cwd
			expect(mockOnComplete).toHaveBeenCalledWith(
				expect.objectContaining({
					sessionName: 'MyProject',
				})
			);
		});

		it('should use Unknown when cwd has no path segments', async () => {
			const sessions = [createMockSession({ name: '', cwd: '' })];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'test-session',
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockOnComplete).toHaveBeenCalledWith(
				expect.objectContaining({
					sessionName: 'Unknown',
				})
			);
		});
	});

	describe('Claude session registration', () => {
		it('should register session origin as auto-initiated', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'new-claude-session-123',
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should have registered the Claude session as auto-initiated
			expect(mockRegisterSessionOrigin).toHaveBeenCalledWith(
				'claude-code',
				'/test/path', // session.cwd
				'new-claude-session-123',
				'auto'
			);
		});

		it('should handle session registration error gracefully', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			mockRegisterSessionOrigin.mockRejectedValue(new Error('Registration failed'));

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'test-session',
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			// Should not throw even if registration fails
			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockOnComplete).toHaveBeenCalled();
		});
	});

	describe('document with failed read', () => {
		it('should handle document read returning empty content', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Document read fails (no content)
			mockReadDoc.mockResolvedValue({ success: true, content: '' });

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'empty', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should not spawn agent for empty document
			expect(mockOnSpawnAgent).not.toHaveBeenCalled();
		});

		it('should handle document read failure', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			mockReadDoc.mockResolvedValue({ success: false });

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'missing', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should not spawn agent for failed read
			expect(mockOnSpawnAgent).not.toHaveBeenCalled();
		});
	});

	describe('audio feedback edge cases', () => {
		it('should not speak if audio feedback is disabled', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			const mockSpeak = vi.fn().mockResolvedValue(undefined);
			window.maestro.notification.speak = mockSpeak;

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'test-session',
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
					audioFeedbackEnabled: false, // Disabled
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockSpeak).not.toHaveBeenCalled();
		});

		it('should handle speak error gracefully', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			const mockSpeak = vi.fn().mockRejectedValue(new Error('TTS not available'));
			window.maestro.notification.speak = mockSpeak;

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'test-session',
				usageStats: {
					inputTokens: 100,
					outputTokens: 200,
					totalCostUsd: 0.01,
					cacheReadInputTokens: 0,
					cacheCreationInputTokens: 0,
					contextWindow: 0,
				},
				response: '**Summary:** Done',
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
					audioFeedbackEnabled: true,
					audioFeedbackCommand: 'say',
				})
			);

			// Should not throw even if speak fails
			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockOnComplete).toHaveBeenCalled();
		});
	});

	describe('ghPath for PR creation', () => {
		it('should pass ghPath to createPR when specified', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			mockWorktreeSetup.mockResolvedValue({ success: true });
			mockCreatePR.mockResolvedValue({ success: true, prUrl: 'https://github.com/test/pr/1' });

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'test-session',
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
					onPRResult: mockOnPRResult,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature-branch',
							createPROnCompletion: true,
							prTargetBranch: 'main',
							ghPath: '/usr/local/bin/gh', // Custom gh path
						},
					},
					'/test/folder'
				);
			});

			// Should have passed ghPath to createPR
			expect(mockCreatePR).toHaveBeenCalledWith(
				expect.any(String),
				'main',
				expect.any(String),
				expect.any(String),
				'/usr/local/bin/gh'
			);
		});
	});

	describe('SSH remote session support', () => {
		it('should pass sshRemoteId to readDoc for SSH sessions', async () => {
			const sshSession = createMockSession({
				sshRemoteId: 'ssh-remote-123',
				sessionSshRemoteConfig: {
					enabled: true,
					remoteId: 'ssh-remote-123',
				},
			});
			const sessions = [sshSession];
			const groups = [createMockGroup()];

			mockReadDoc.mockResolvedValue({ success: true, content: '- [x] Completed' });

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/remote/path'
				);
			});

			// Verify readDoc was called with sshRemoteId
			expect(mockReadDoc).toHaveBeenCalledWith(
				'/remote/path',
				'tasks.md',
				'ssh-remote-123' // sshRemoteId should be passed
			);
		});

		it('should pass sshRemoteId through multiple readDoc calls for SSH sessions', async () => {
			const sshSession = createMockSession({
				sshRemoteId: 'ssh-remote-456',
				sessionSshRemoteConfig: {
					enabled: true,
					remoteId: 'ssh-remote-456',
				},
			});
			const sessions = [sshSession];
			const groups = [createMockGroup()];

			// Start with one unchecked task, then return checked after agent run
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/remote/path'
				);
			});

			// Verify all readDoc calls included sshRemoteId
			const readDocCalls = mockReadDoc.mock.calls;
			expect(readDocCalls.length).toBeGreaterThan(0);

			// Every call should have sshRemoteId as the third argument
			for (const call of readDocCalls) {
				expect(call[2]).toBe('ssh-remote-456');
			}
		});

		it('should use sessionSshRemoteConfig.remoteId when sshRemoteId is not set', async () => {
			// This tests the fallback: session.sshRemoteId || session.sessionSshRemoteConfig?.remoteId
			const sshSession = createMockSession({
				sshRemoteId: undefined, // Not set (e.g., terminal-only SSH session)
				sessionSshRemoteConfig: {
					enabled: true,
					remoteId: 'fallback-remote-789',
				},
			});
			const sessions = [sshSession];
			const groups = [createMockGroup()];

			mockReadDoc.mockResolvedValue({ success: true, content: '- [x] Completed' });

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/remote/path'
				);
			});

			// Verify readDoc was called with the fallback sshRemoteId
			expect(mockReadDoc).toHaveBeenCalledWith(
				'/remote/path',
				'tasks.md',
				'fallback-remote-789' // Should use sessionSshRemoteConfig.remoteId as fallback
			);
		});

		it('should pass sshRemoteId to worktree operations for SSH sessions', async () => {
			const sshSession = createMockSession({
				sshRemoteId: 'ssh-worktree-remote',
				sessionSshRemoteConfig: {
					enabled: true,
					remoteId: 'ssh-worktree-remote',
				},
			});
			const sessions = [sshSession];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/remote/worktree',
							branchName: 'feature/ssh-test',
						},
					},
					'/remote/folder'
				);
			});

			// Verify worktreeSetup was called with sshRemoteId
			expect(mockWorktreeSetup).toHaveBeenCalledWith(
				'/test/path', // session.cwd
				'/remote/worktree',
				'feature/ssh-test',
				'ssh-worktree-remote' // sshRemoteId should be passed
			);
		});

		it('should not pass sshRemoteId for local sessions', async () => {
			// Regular local session without SSH config
			const localSession = createMockSession({
				sshRemoteId: undefined,
				sessionSshRemoteConfig: undefined,
			});
			const sessions = [localSession];
			const groups = [createMockGroup()];

			mockReadDoc.mockResolvedValue({ success: true, content: '- [x] Completed' });

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/local/path'
				);
			});

			// Verify readDoc was called without sshRemoteId (undefined)
			expect(mockReadDoc).toHaveBeenCalledWith(
				'/local/path',
				'tasks.md',
				undefined // No sshRemoteId for local sessions
			);
		});
	});

	describe('worktree-dispatched PR creation', () => {
		it('routes isolated DAG nodes through the prepared worktree target while keeping shared nodes on the parent session', async () => {
			const parentSession = createMockSession({
				id: 'parent-session-id',
				name: 'Parent Agent',
				cwd: '/main/repo',
			});
			const worktreeSession = createMockSession({
				id: 'isolated-session-id',
				name: 'Isolated Worktree Agent',
				cwd: '/main/repo/worktrees/feature-isolated',
				parentSessionId: 'parent-session-id',
				worktreeBranch: 'feature-isolated',
			});
			const sessions = [parentSession, worktreeSession];
			const groups = [createMockGroup()];

			const docState: Record<string, string> = {
				'shared.md': '- [ ] Shared task',
				'isolated.md': '- [ ] Isolated task',
			};
			mockReadDoc.mockImplementation(async (_folder: string, filename: string) => ({
				success: true,
				content: docState[filename] ?? '',
			}));
			mockOnSpawnAgent.mockImplementation(
				async (targetSessionId: string, prompt: string, cwd?: string) => {
					if (prompt.includes('/shared.md')) {
						docState['shared.md'] = '- [x] Shared task';
					}
					if (prompt.includes('/isolated.md')) {
						docState['isolated.md'] = '- [x] Isolated task';
					}
					return {
						success: true,
						agentSessionId: `agent-${targetSessionId}`,
						usageStats: {
							inputTokens: 10,
							outputTokens: 5,
							totalCostUsd: 0.001,
							cacheReadInputTokens: 0,
							cacheCreationInputTokens: 0,
							contextWindow: 0,
						},
						response: `completed from ${cwd || 'main'}`,
					};
				}
			);

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
					onPRResult: mockOnPRResult,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'parent-session-id',
					{
						documents: [
							{ filename: 'shared', resetOnCompletion: false },
							{ filename: 'isolated', resetOnCompletion: false },
						],
						prompt: 'Test',
						loopEnabled: false,
						taskGraph: {
							nodes: [
								{
									id: 'shared',
									documentIndex: 0,
									dependsOn: [],
									isolationMode: 'shared-checkout',
								},
								{
									id: 'isolated',
									documentIndex: 1,
									dependsOn: ['shared'],
									isolationMode: 'isolated-worktree',
								},
							],
						},
						isolatedWorktreeTarget: {
							sessionId: 'isolated-session-id',
							cwd: '/main/repo/worktrees/feature-isolated',
							branchName: 'feature-isolated',
						},
					},
					'/test/folder'
				);
			});

			expect(mockOnSpawnAgent).toHaveBeenNthCalledWith(
				1,
				'parent-session-id',
				expect.stringContaining('/shared.md'),
				undefined
			);
			expect(mockOnSpawnAgent).toHaveBeenNthCalledWith(
				2,
				'isolated-session-id',
				expect.stringContaining('/isolated.md'),
				undefined
			);
		});

		it('runs a DAG smoke path with shared fan-out, isolated dispatch, and join aggregation without trampling the main checkout', async () => {
			const parentSession = createMockSession({
				id: 'parent-session-id',
				name: 'Parent Agent',
				cwd: '/main/repo',
			});
			const isolatedSession = createMockSession({
				id: 'isolated-session-id',
				name: 'Isolated Agent',
				cwd: '/main/repo/worktrees/feature-isolated',
				parentSessionId: 'parent-session-id',
				worktreeBranch: 'feature-isolated',
			});
			const sessions = [parentSession, isolatedSession];
			const groups = [createMockGroup()];

			const docState: Record<string, string> = {
				'root.md': '- [ ] Root task',
				'shared-child.md': '- [ ] Shared child task',
				'isolated-child.md': '- [ ] Isolated child task',
				'join.md': '- [ ] Join task',
			};

			mockReadDoc.mockImplementation(async (_folderPath: string, filename: string) => ({
				success: true,
				content: docState[filename] ?? '',
			}));

			mockOnSpawnAgent.mockImplementation(
				async (targetSessionId: string, prompt: string, cwd?: string) => {
					if (prompt.includes('/root.md')) {
						docState['root.md'] = '- [x] Root task';
						return {
							success: true,
							agentSessionId: `agent-${targetSessionId}`,
							usageStats: {
								inputTokens: 10,
								outputTokens: 5,
								totalCostUsd: 0.001,
								cacheReadInputTokens: 0,
								cacheCreationInputTokens: 0,
								contextWindow: 0,
							},
							response: '**Summary:** Root branch prepared',
						};
					}

					if (prompt.includes('/shared-child.md')) {
						docState['shared-child.md'] = '- [x] Shared child task';
						return {
							success: true,
							agentSessionId: `agent-${targetSessionId}`,
							usageStats: {
								inputTokens: 10,
								outputTokens: 5,
								totalCostUsd: 0.001,
								cacheReadInputTokens: 0,
								cacheCreationInputTokens: 0,
								contextWindow: 0,
							},
							response: '**Summary:** Shared branch applied safely',
						};
					}

					if (prompt.includes('/isolated-child.md')) {
						docState['isolated-child.md'] = '- [x] Isolated child task';
						return {
							success: true,
							agentSessionId: `agent-${targetSessionId}`,
							usageStats: {
								inputTokens: 10,
								outputTokens: 5,
								totalCostUsd: 0.001,
								cacheReadInputTokens: 0,
								cacheCreationInputTokens: 0,
								contextWindow: 0,
							},
							response:
								'**Summary:** Isolated branch applied in /main/repo/worktrees/feature-isolated',
						};
					}

					if (prompt.includes('/join.md')) {
						docState['join.md'] = '- [x] Join task';
						return {
							success: true,
							agentSessionId: `agent-${targetSessionId}`,
							usageStats: {
								inputTokens: 10,
								outputTokens: 5,
								totalCostUsd: 0.001,
								cacheReadInputTokens: 0,
								cacheCreationInputTokens: 0,
								contextWindow: 0,
							},
							response: '**Summary:** Joined shared and isolated outputs',
						};
					}

					return {
						success: true,
						agentSessionId: `agent-${targetSessionId}`,
						usageStats: {
							inputTokens: 10,
							outputTokens: 5,
							totalCostUsd: 0.001,
							cacheReadInputTokens: 0,
							cacheCreationInputTokens: 0,
							contextWindow: 0,
						},
						response: `**Summary:** Fallback from ${cwd || 'main'}`,
					};
				}
			);

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
					onPRResult: mockOnPRResult,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'parent-session-id',
					{
						documents: [
							{ filename: 'root', resetOnCompletion: false },
							{ filename: 'shared-child', resetOnCompletion: false },
							{ filename: 'isolated-child', resetOnCompletion: false },
							{ filename: 'join', resetOnCompletion: false },
						],
						prompt: 'Test join smoke',
						loopEnabled: false,
						taskGraph: {
							nodes: [
								{ id: 'root', documentIndex: 0, dependsOn: [], isolationMode: 'shared-checkout' },
								{
									id: 'shared-child',
									documentIndex: 1,
									dependsOn: ['root'],
									isolationMode: 'shared-checkout',
								},
								{
									id: 'isolated-child',
									documentIndex: 2,
									dependsOn: ['root'],
									isolationMode: 'isolated-worktree',
								},
								{
									id: 'join',
									documentIndex: 3,
									dependsOn: ['shared-child', 'isolated-child'],
									isolationMode: 'shared-checkout',
								},
							],
						},
						isolatedWorktreeTarget: {
							sessionId: 'isolated-session-id',
							cwd: '/main/repo/worktrees/feature-isolated',
							branchName: 'feature-isolated',
						},
					},
					'/test/folder'
				);
			});

			expect(mockOnSpawnAgent).toHaveBeenNthCalledWith(
				1,
				'parent-session-id',
				expect.stringContaining('/root.md'),
				undefined
			);
			expect(mockOnSpawnAgent).toHaveBeenNthCalledWith(
				2,
				'parent-session-id',
				expect.stringContaining('/shared-child.md'),
				undefined
			);
			expect(mockOnSpawnAgent).toHaveBeenNthCalledWith(
				3,
				'isolated-session-id',
				expect.stringContaining('/isolated-child.md'),
				undefined
			);
			expect(mockOnSpawnAgent).toHaveBeenNthCalledWith(
				4,
				'parent-session-id',
				expect.stringContaining('/join.md'),
				undefined
			);

			const joinPrompt = mockOnSpawnAgent.mock.calls[3]?.[1] ?? '';
			expect(joinPrompt).toContain('## Predecessor Outputs');
			expect(joinPrompt).toContain('### shared-child [PASS]');
			expect(joinPrompt).toContain('- Shared branch applied safely');
			expect(joinPrompt).toContain('### isolated-child [PASS]');
			expect(joinPrompt).toContain(
				'- Isolated branch applied in /main/repo/worktrees/feature-isolated'
			);

			const completionCall = mockOnComplete.mock.calls.at(-1)?.[0];
			expect(completionCall?.completedTasks).toBe(4);
		});

		it('dequeues only the first ready fan-out node until it finishes even when maxParallelism is two', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];
			const docState: Record<string, string> = {
				'root.md': '- [ ] Root task',
				'left.md': '- [ ] Left task',
				'right.md': '- [ ] Right task',
			};

			mockReadDoc.mockImplementation(async (_folder: string, filename: string) => ({
				success: true,
				content: docState[filename] ?? '',
			}));

			let resolveLeftBranch:
				| ((value: {
						success: boolean;
						agentSessionId?: string;
						response?: string;
						usageStats?: UsageStats;
				  }) => void)
				| null = null;
			const leftBranchPromise = new Promise<{
				success: boolean;
				agentSessionId?: string;
				response?: string;
				usageStats?: UsageStats;
			}>((resolve) => {
				resolveLeftBranch = resolve;
			});

			mockOnSpawnAgent.mockImplementation(async (_targetSessionId: string, prompt: string) => {
				if (prompt.includes('/root.md')) {
					docState['root.md'] = '- [x] Root task';
					return {
						success: true,
						agentSessionId: 'root-session',
						response: 'Root finished',
					};
				}

				if (prompt.includes('/left.md')) {
					return leftBranchPromise;
				}

				if (prompt.includes('/right.md')) {
					docState['right.md'] = '- [x] Right task';
					return {
						success: true,
						agentSessionId: 'right-session',
						response: 'Right finished',
					};
				}

				return {
					success: true,
					agentSessionId: 'fallback-session',
					response: 'Fallback finished',
				};
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			let startPromise: Promise<void>;
			act(() => {
				startPromise = result.current.startBatchRun(
					'test-session-id',
					{
						documents: [
							{ filename: 'root', resetOnCompletion: false },
							{ filename: 'left', resetOnCompletion: false },
							{ filename: 'right', resetOnCompletion: false },
						],
						prompt: 'Sequential DAG proof',
						loopEnabled: false,
						maxParallelism: 2,
						taskGraph: {
							nodes: [
								{ id: 'root', documentIndex: 0, dependsOn: [] },
								{ id: 'left', documentIndex: 1, dependsOn: ['root'] },
								{ id: 'right', documentIndex: 2, dependsOn: ['root'] },
							],
						},
					},
					'/test/folder'
				);
			});

			await waitFor(() => {
				expect(mockOnSpawnAgent).toHaveBeenCalledTimes(2);
			});

			await waitFor(() => {
				const batchState = result.current.getBatchState('test-session-id');
				expect(batchState.scheduler?.mode).toBe('sequential');
				expect(batchState.scheduler?.configuredMode).toBe('dag');
				expect(batchState.scheduler?.readyNodeIds).toEqual(['right']);
			});

			expect(mockOnSpawnAgent).toHaveBeenNthCalledWith(
				1,
				'test-session-id',
				expect.stringContaining('/root.md'),
				undefined
			);
			expect(mockOnSpawnAgent).toHaveBeenNthCalledWith(
				2,
				'test-session-id',
				expect.stringContaining('/left.md'),
				undefined
			);

			await new Promise((resolve) => setTimeout(resolve, 25));
			expect(mockOnSpawnAgent).toHaveBeenCalledTimes(2);

			docState['left.md'] = '- [x] Left task';
			resolveLeftBranch?.({
				success: true,
				agentSessionId: 'left-session',
				response: 'Left finished',
			});

			await waitFor(() => {
				expect(mockOnSpawnAgent).toHaveBeenCalledTimes(3);
			});

			expect(mockOnSpawnAgent).toHaveBeenNthCalledWith(
				3,
				'test-session-id',
				expect.stringContaining('/right.md'),
				undefined
			);

			await startPromise;

			expect(result.current.getBatchState('test-session-id').isRunning).toBe(false);
			expect(mockOnAddHistoryEntry).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'AUTO',
					schedulerMode: 'sequential',
					configuredSchedulerMode: 'dag',
				})
			);
		});

		it('falls back to an implicit sequential graph for legacy playbooks without taskGraph metadata', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];
			const docState: Record<string, string> = {
				'phase-01.md': '- [ ] Phase 01 task',
				'phase-02.md': '- [ ] Phase 02 task',
			};

			mockReadDoc.mockImplementation(async (_folder: string, filename: string) => ({
				success: true,
				content: docState[filename] ?? '',
			}));

			mockOnSpawnAgent.mockImplementation(async (_targetSessionId: string, prompt: string) => {
				if (prompt.includes('/phase-01.md')) {
					docState['phase-01.md'] = '- [x] Phase 01 task';
					return {
						success: true,
						agentSessionId: 'phase-01-session',
						response: 'Phase 01 finished',
					};
				}

				if (prompt.includes('/phase-02.md')) {
					docState['phase-02.md'] = '- [x] Phase 02 task';
					return {
						success: true,
						agentSessionId: 'phase-02-session',
						response: 'Phase 02 finished',
					};
				}

				return {
					success: true,
					agentSessionId: 'fallback-session',
					response: 'Fallback finished',
				};
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [
							{ filename: 'phase-01', resetOnCompletion: false },
							{ filename: 'phase-02', resetOnCompletion: false },
						],
						prompt: 'Legacy sequential proof',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockOnSpawnAgent).toHaveBeenNthCalledWith(
				1,
				'test-session-id',
				expect.stringContaining('/phase-01.md'),
				undefined
			);
			expect(mockOnSpawnAgent).toHaveBeenNthCalledWith(
				2,
				'test-session-id',
				expect.stringContaining('/phase-02.md'),
				undefined
			);
			expect(mockOnAddHistoryEntry).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'AUTO',
					schedulerMode: 'sequential',
					configuredSchedulerMode: 'sequential',
				})
			);
		});

		it('launches multiple isolated-worktree fan-out nodes concurrently when safe targets exist', async () => {
			const sessions = [
				createMockSession({
					id: 'parent-session-id',
					cwd: '/main/repo',
				}),
				createMockSession({
					id: 'isolated-a',
					cwd: '/main/repo/worktrees/feature-a',
					parentSessionId: 'parent-session-id',
					worktreeBranch: 'feature-a',
				}),
				createMockSession({
					id: 'isolated-b',
					cwd: '/main/repo/worktrees/feature-b',
					parentSessionId: 'parent-session-id',
					worktreeBranch: 'feature-b',
				}),
			];
			const groups = [createMockGroup()];
			const docState: Record<string, string> = {
				'root.md': '- [ ] Root task',
				'left.md': '- [ ] Left isolated task',
				'right.md': '- [ ] Right isolated task',
			};

			mockReadDoc.mockImplementation(async (_folder: string, filename: string) => ({
				success: true,
				content: docState[filename] ?? '',
			}));

			let resolveLeft:
				| ((value: {
						success: boolean;
						agentSessionId?: string;
						response?: string;
						usageStats?: UsageStats;
				  }) => void)
				| null = null;
			let resolveRight:
				| ((value: {
						success: boolean;
						agentSessionId?: string;
						response?: string;
						usageStats?: UsageStats;
				  }) => void)
				| null = null;

			const leftPromise = new Promise<{
				success: boolean;
				agentSessionId?: string;
				response?: string;
				usageStats?: UsageStats;
			}>((resolve) => {
				resolveLeft = resolve;
			});
			const rightPromise = new Promise<{
				success: boolean;
				agentSessionId?: string;
				response?: string;
				usageStats?: UsageStats;
			}>((resolve) => {
				resolveRight = resolve;
			});

			mockOnSpawnAgent.mockImplementation(async (targetSessionId: string, prompt: string) => {
				if (prompt.includes('/root.md')) {
					docState['root.md'] = '- [x] Root task';
					return {
						success: true,
						agentSessionId: 'root-session',
						response: 'Root finished',
					};
				}

				if (prompt.includes('/left.md')) {
					return leftPromise;
				}

				if (prompt.includes('/right.md')) {
					return rightPromise;
				}

				return {
					success: true,
					agentSessionId: 'fallback-session',
					response: 'Fallback finished',
				};
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			let startPromise: Promise<void>;
			act(() => {
				startPromise = result.current.startBatchRun(
					'parent-session-id',
					{
						documents: [
							{ filename: 'root', resetOnCompletion: false },
							{ filename: 'left', resetOnCompletion: false },
							{ filename: 'right', resetOnCompletion: false },
						],
						prompt: 'Parallel isolated DAG proof',
						loopEnabled: false,
						maxParallelism: 2,
						taskGraph: {
							nodes: [
								{ id: 'root', documentIndex: 0, dependsOn: [] },
								{
									id: 'left',
									documentIndex: 1,
									dependsOn: ['root'],
									isolationMode: 'isolated-worktree',
								},
								{
									id: 'right',
									documentIndex: 2,
									dependsOn: ['root'],
									isolationMode: 'isolated-worktree',
								},
							],
						},
						isolatedWorktreeTargets: [
							{
								sessionId: 'isolated-a',
								cwd: '/main/repo/worktrees/feature-a',
								branchName: 'feature-a',
							},
							{
								sessionId: 'isolated-b',
								cwd: '/main/repo/worktrees/feature-b',
								branchName: 'feature-b',
							},
						],
					},
					'/test/folder'
				);
			});

			await waitFor(() => {
				expect(mockOnSpawnAgent).toHaveBeenCalledTimes(3);
			});

			expect(mockOnSpawnAgent).toHaveBeenNthCalledWith(
				1,
				'parent-session-id',
				expect.stringContaining('/root.md'),
				undefined
			);
			expect(mockOnSpawnAgent).toHaveBeenNthCalledWith(
				2,
				'isolated-a',
				expect.stringContaining('/left.md'),
				undefined
			);
			expect(mockOnSpawnAgent).toHaveBeenNthCalledWith(
				3,
				'isolated-b',
				expect.stringContaining('/right.md'),
				undefined
			);

			docState['left.md'] = '- [x] Left isolated task';
			docState['right.md'] = '- [x] Right isolated task';
			resolveLeft?.({
				success: true,
				agentSessionId: 'left-session',
				response: 'Left finished',
			});
			resolveRight?.({
				success: true,
				agentSessionId: 'right-session',
				response: 'Right finished',
			});

			await startPromise;

			expect(result.current.getBatchState('parent-session-id').isRunning).toBe(false);
		});

		it('runs one shared-checkout branch alongside one isolated-worktree sibling and waits for join readiness', async () => {
			const sessions = [
				createMockSession({
					id: 'parent-session-id',
					cwd: '/main/repo',
				}),
				createMockSession({
					id: 'isolated-a',
					cwd: '/main/repo/worktrees/feature-a',
					parentSessionId: 'parent-session-id',
					worktreeBranch: 'feature-a',
				}),
			];
			const groups = [createMockGroup()];
			const docState: Record<string, string> = {
				'root.md': '- [ ] Root task',
				'shared.md': '- [ ] Shared checkout task',
				'isolated.md': '- [ ] Isolated worktree task',
				'join.md': '- [ ] Join task',
			};

			mockReadDoc.mockImplementation(async (_folder: string, filename: string) => ({
				success: true,
				content: docState[filename] ?? '',
			}));

			let resolveShared:
				| ((value: {
						success: boolean;
						agentSessionId?: string;
						response?: string;
						usageStats?: UsageStats;
				  }) => void)
				| null = null;
			let resolveIsolated:
				| ((value: {
						success: boolean;
						agentSessionId?: string;
						response?: string;
						usageStats?: UsageStats;
				  }) => void)
				| null = null;

			const sharedPromise = new Promise<{
				success: boolean;
				agentSessionId?: string;
				response?: string;
				usageStats?: UsageStats;
			}>((resolve) => {
				resolveShared = resolve;
			});
			const isolatedPromise = new Promise<{
				success: boolean;
				agentSessionId?: string;
				response?: string;
				usageStats?: UsageStats;
			}>((resolve) => {
				resolveIsolated = resolve;
			});

			mockOnSpawnAgent.mockImplementation(async (targetSessionId: string, prompt: string) => {
				if (prompt.includes('/root.md')) {
					docState['root.md'] = '- [x] Root task';
					return {
						success: true,
						agentSessionId: 'root-session',
						response: 'Root finished',
					};
				}

				if (prompt.includes('/shared.md')) {
					expect(targetSessionId).toBe('parent-session-id');
					return sharedPromise;
				}

				if (prompt.includes('/isolated.md')) {
					expect(targetSessionId).toBe('isolated-a');
					return isolatedPromise;
				}

				if (prompt.includes('/join.md')) {
					docState['join.md'] = '- [x] Join task';
					return {
						success: true,
						agentSessionId: 'join-session',
						response: 'Join finished',
					};
				}

				return {
					success: true,
					agentSessionId: 'fallback-session',
					response: 'Fallback finished',
				};
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			let startPromise: Promise<void>;
			act(() => {
				startPromise = result.current.startBatchRun(
					'parent-session-id',
					{
						documents: [
							{ filename: 'root', resetOnCompletion: false },
							{ filename: 'shared', resetOnCompletion: false },
							{ filename: 'isolated', resetOnCompletion: false },
							{ filename: 'join', resetOnCompletion: false },
						],
						prompt: 'Mixed DAG proof',
						loopEnabled: false,
						maxParallelism: 3,
						taskGraph: {
							nodes: [
								{ id: 'root', documentIndex: 0, dependsOn: [] },
								{ id: 'shared', documentIndex: 1, dependsOn: ['root'] },
								{
									id: 'isolated',
									documentIndex: 2,
									dependsOn: ['root'],
									isolationMode: 'isolated-worktree',
								},
								{ id: 'join', documentIndex: 3, dependsOn: ['shared', 'isolated'] },
							],
						},
						isolatedWorktreeTargets: [
							{
								sessionId: 'isolated-a',
								cwd: '/main/repo/worktrees/feature-a',
								branchName: 'feature-a',
							},
						],
					},
					'/test/folder'
				);
			});

			await waitFor(() => {
				expect(mockOnSpawnAgent).toHaveBeenCalledTimes(3);
			});

			expect(mockOnSpawnAgent).toHaveBeenNthCalledWith(
				1,
				'parent-session-id',
				expect.stringContaining('/root.md'),
				undefined
			);
			expect(mockOnSpawnAgent).toHaveBeenNthCalledWith(
				2,
				'parent-session-id',
				expect.stringContaining('/shared.md'),
				undefined
			);
			expect(mockOnSpawnAgent).toHaveBeenNthCalledWith(
				3,
				'isolated-a',
				expect.stringContaining('/isolated.md'),
				undefined
			);

			docState['shared.md'] = '- [x] Shared checkout task';
			docState['isolated.md'] = '- [x] Isolated worktree task';
			resolveShared?.({
				success: true,
				agentSessionId: 'shared-session',
				response: 'Shared finished',
			});
			resolveIsolated?.({
				success: true,
				agentSessionId: 'isolated-session',
				response: 'Isolated finished',
			});

			await startPromise;

			expect(mockOnSpawnAgent).toHaveBeenNthCalledWith(
				4,
				'parent-session-id',
				expect.stringContaining('/join.md'),
				undefined
			);
			expect(result.current.getBatchState('parent-session-id').isRunning).toBe(false);
		});

		it('falls back one isolated node to the shared checkout lane when a safe target is unavailable', async () => {
			const sessions = [
				createMockSession({
					id: 'parent-session-id',
					cwd: '/main/repo',
				}),
				createMockSession({
					id: 'isolated-a',
					cwd: '/main/repo/worktrees/feature-a',
					parentSessionId: 'parent-session-id',
					worktreeBranch: 'feature-a',
				}),
			];
			const groups = [createMockGroup()];
			const docState: Record<string, string> = {
				'left.md': '- [ ] Left isolated task',
				'right.md': '- [ ] Right isolated task',
			};

			mockReadDoc.mockImplementation(async (_folder: string, filename: string) => ({
				success: true,
				content: docState[filename] ?? '',
			}));

			let resolveLeft:
				| ((value: {
						success: boolean;
						agentSessionId?: string;
						response?: string;
						usageStats?: UsageStats;
				  }) => void)
				| null = null;

			const leftPromise = new Promise<{
				success: boolean;
				agentSessionId?: string;
				response?: string;
				usageStats?: UsageStats;
			}>((resolve) => {
				resolveLeft = resolve;
			});

			mockOnSpawnAgent.mockImplementation(async (targetSessionId: string, prompt: string) => {
				if (prompt.includes('/left.md')) {
					return leftPromise;
				}

				if (prompt.includes('/right.md')) {
					docState['right.md'] = '- [x] Right isolated task';
					return {
						success: true,
						agentSessionId: `agent-${targetSessionId}`,
						response: 'Right finished on fallback checkout',
					};
				}

				return {
					success: true,
					agentSessionId: `agent-${targetSessionId}`,
					response: 'Fallback finished',
				};
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			let startPromise: Promise<void>;
			act(() => {
				startPromise = result.current.startBatchRun(
					'parent-session-id',
					{
						documents: [
							{ filename: 'left', resetOnCompletion: false },
							{ filename: 'right', resetOnCompletion: false },
						],
						prompt: 'Fallback isolated DAG proof',
						loopEnabled: false,
						maxParallelism: 2,
						taskGraph: {
							nodes: [
								{
									id: 'left',
									documentIndex: 0,
									dependsOn: [],
									isolationMode: 'isolated-worktree',
								},
								{
									id: 'right',
									documentIndex: 1,
									dependsOn: [],
									isolationMode: 'isolated-worktree',
								},
							],
						},
						isolatedWorktreeTargets: [
							{
								sessionId: 'unsafe-main',
								cwd: '/main/repo',
								branchName: 'main',
							},
							{
								sessionId: 'isolated-a',
								cwd: '/main/repo/worktrees/feature-a',
								branchName: 'feature-a',
							},
						],
					},
					'/test/folder'
				);
			});

			await waitFor(() => {
				expect(mockOnSpawnAgent).toHaveBeenCalledTimes(2);
			});

			expect(mockOnSpawnAgent).toHaveBeenNthCalledWith(
				1,
				'isolated-a',
				expect.stringContaining('/left.md'),
				undefined
			);
			expect(mockOnSpawnAgent).toHaveBeenNthCalledWith(
				2,
				'parent-session-id',
				expect.stringContaining('/right.md'),
				undefined
			);

			docState['left.md'] = '- [x] Left isolated task';
			resolveLeft?.({
				success: true,
				agentSessionId: 'agent-isolated-a',
				response: 'Left finished',
			});

			await startPromise;

			expect(result.current.getBatchState('parent-session-id').isRunning).toBe(false);
		});

		it('records sequential scheduler truth for legacy playbooks in renderer history', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];
			const docState: Record<string, string> = {
				'first.md': '- [ ] First task',
				'second.md': '- [ ] Second task',
			};

			mockReadDoc.mockImplementation(async (_folder: string, filename: string) => ({
				success: true,
				content: docState[filename] ?? '',
			}));

			mockOnSpawnAgent.mockImplementation(async (_targetSessionId: string, prompt: string) => {
				if (prompt.includes('/first.md')) {
					docState['first.md'] = '- [x] First task';
					return {
						success: true,
						agentSessionId: 'first-session',
						response: 'First finished',
					};
				}

				if (prompt.includes('/second.md')) {
					docState['second.md'] = '- [x] Second task';
					return {
						success: true,
						agentSessionId: 'second-session',
						response: 'Second finished',
					};
				}

				return {
					success: true,
					agentSessionId: 'fallback-session',
					response: 'Fallback finished',
				};
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [
							{ filename: 'first', resetOnCompletion: false },
							{ filename: 'second', resetOnCompletion: false },
						],
						prompt: 'Legacy sequential proof',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockOnAddHistoryEntry).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'AUTO',
					schedulerMode: 'sequential',
					configuredSchedulerMode: 'sequential',
				})
			);
		});

		it('should create PR when worktreeTarget is set with createPROnCompletion', async () => {
			// Create a worktree agent session with a parent
			const parentSession = createMockSession({
				id: 'parent-session-id',
				name: 'Parent Agent',
				cwd: '/main/repo',
			});
			const worktreeSession = createMockSession({
				id: 'worktree-session-id',
				name: 'Worktree Agent',
				cwd: '/main/repo/worktrees/feature-branch',
				parentSessionId: 'parent-session-id',
				worktreeBranch: 'feature-branch',
			});
			const sessions = [parentSession, worktreeSession];
			const groups = [createMockGroup()];

			// Mock task processing: first call returns unchecked, subsequent calls return checked
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			// Mock PR creation success
			mockCreatePR.mockResolvedValue({
				success: true,
				prUrl: 'https://github.com/test/repo/pull/42',
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
					onPRResult: mockOnPRResult,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'worktree-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktreeTarget: {
							mode: 'create-new',
							newBranchName: 'feature-branch',
							baseBranch: 'main',
							createPROnCompletion: true,
						},
						worktree: {
							enabled: true,
							path: '/main/repo/worktrees/feature-branch',
							branchName: 'feature-branch',
							createPROnCompletion: true,
							prTargetBranch: 'main',
						},
					},
					'/test/folder'
				);
			});

			// Should have called createPR with parent session's cwd as mainRepoCwd
			expect(mockCreatePR).toHaveBeenCalledWith(
				'/main/repo/worktrees/feature-branch', // worktreePath (session.cwd for worktree agent)
				'main', // prTargetBranch
				expect.any(String), // PR title
				expect.any(String), // PR body
				undefined // ghPath
			);

			// Verify onPRResult callback was called
			expect(mockOnPRResult).toHaveBeenCalledWith(
				expect.objectContaining({
					sessionId: 'worktree-session-id',
					success: true,
					prUrl: 'https://github.com/test/repo/pull/42',
				})
			);
		});

		it('should resolve mainRepoCwd from parent session for worktree-dispatched runs', async () => {
			// Parent session has a different cwd from the worktree agent
			const parentSession = createMockSession({
				id: 'parent-session-id',
				name: 'Parent Agent',
				cwd: '/projects/main-repo',
			});
			const worktreeSession = createMockSession({
				id: 'wt-session-id',
				name: 'WT Agent',
				cwd: '/projects/main-repo/worktrees/my-feature',
				parentSessionId: 'parent-session-id',
				worktreeBranch: 'my-feature',
			});
			const sessions = [parentSession, worktreeSession];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			mockGetDefaultBranch.mockResolvedValue({ success: true, branch: 'main' });

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
					onPRResult: mockOnPRResult,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'wt-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktreeTarget: {
							mode: 'existing-closed',
							worktreePath: '/projects/main-repo/worktrees/my-feature',
							createPROnCompletion: true,
						},
						worktree: {
							enabled: true,
							path: '/projects/main-repo/worktrees/my-feature',
							branchName: 'my-feature',
							createPROnCompletion: true,
						},
					},
					'/test/folder'
				);
			});

			// The createPR call's first arg is worktreePath, second is the base branch
			// mainRepoCwd should be the parent's cwd, not the worktree agent's cwd
			expect(mockCreatePR).toHaveBeenCalled();
			const createPRCallArgs = mockCreatePR.mock.calls[0];
			// The worktreeManager.createPR gets an options object, but it's the
			// internal createPR mock on window.maestro.git. The worktreeManager wrapper
			// passes worktreePath as the first arg to git.createPR
			expect(createPRCallArgs[0]).toBe('/projects/main-repo/worktrees/my-feature');
		});

		it('should not create PR when worktreeTarget is set but createPROnCompletion is false', async () => {
			const parentSession = createMockSession({
				id: 'parent-session-id',
				cwd: '/main/repo',
			});
			const worktreeSession = createMockSession({
				id: 'wt-session-id',
				cwd: '/main/repo/worktrees/feat',
				parentSessionId: 'parent-session-id',
				worktreeBranch: 'feat',
			});
			const sessions = [parentSession, worktreeSession];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
					onPRResult: mockOnPRResult,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'wt-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktreeTarget: {
							mode: 'create-new',
							newBranchName: 'feat',
							baseBranch: 'main',
							createPROnCompletion: false,
						},
						// No worktree.createPROnCompletion, so PR creation should not fire
					},
					'/test/folder'
				);
			});

			// createPR should NOT have been called
			expect(mockCreatePR).not.toHaveBeenCalled();
		});

		it('should use worktreeBranch from session when available', async () => {
			const parentSession = createMockSession({
				id: 'parent-id',
				cwd: '/main/repo',
			});
			const worktreeSession = createMockSession({
				id: 'wt-id',
				cwd: '/main/repo/worktrees/my-branch',
				parentSessionId: 'parent-id',
				worktreeBranch: 'my-branch-from-session',
			});
			const sessions = [parentSession, worktreeSession];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
					onPRResult: mockOnPRResult,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'wt-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktreeTarget: {
							mode: 'create-new',
							newBranchName: 'config-branch-name',
							baseBranch: 'main',
							createPROnCompletion: true,
						},
						worktree: {
							enabled: true,
							path: '/main/repo/worktrees/my-branch',
							branchName: 'config-branch-name',
							createPROnCompletion: true,
							prTargetBranch: 'main',
						},
					},
					'/test/folder'
				);
			});

			// PR should have been created (worktreeActive was overridden to true)
			expect(mockCreatePR).toHaveBeenCalled();
		});

		it('should skip setupWorktree when worktreeTarget is set (worktree already created)', async () => {
			const parentSession = createMockSession({
				id: 'parent-session-id',
				cwd: '/main/repo',
			});
			const worktreeSession = createMockSession({
				id: 'wt-session-id',
				cwd: '/main/repo/worktrees/auto-run-branch',
				parentSessionId: 'parent-session-id',
				worktreeBranch: 'auto-run-branch',
			});
			const sessions = [parentSession, worktreeSession];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
					onPRResult: mockOnPRResult,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'wt-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktreeTarget: {
							mode: 'create-new',
							newBranchName: 'auto-run-branch',
							baseBranch: 'main',
							createPROnCompletion: false,
						},
						worktree: {
							enabled: true,
							path: '/main/repo/worktrees/auto-run-branch',
							branchName: 'auto-run-branch',
						},
					},
					'/test/folder'
				);
			});

			// setupWorktree (git.worktreeSetup) should NOT be called when worktreeTarget is set,
			// because useAutoRunHandlers already created the worktree. Calling it again would fail
			// since the session's CWD is already a worktree (git-common-dir != git-dir).
			expect(mockWorktreeSetup).not.toHaveBeenCalled();
		});

		it('should fire "Auto Run Started" toast notification when batch starts with worktreeTarget', async () => {
			const parentSession = createMockSession({
				id: 'parent-session-id',
				name: 'Parent Agent',
				cwd: '/main/repo',
			});
			const worktreeSession = createMockSession({
				id: 'wt-session-id',
				name: 'WT Agent',
				cwd: '/main/repo/worktrees/feature',
				parentSessionId: 'parent-session-id',
				worktreeBranch: 'feature',
			});
			const sessions = [parentSession, worktreeSession];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) return { success: true, content: '- [ ] Task 1\n- [ ] Task 2' };
				return { success: true, content: '- [x] Task 1\n- [x] Task 2' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'wt-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktreeTarget: {
							mode: 'create-new',
							newBranchName: 'feature',
							baseBranch: 'main',
							createPROnCompletion: false,
						},
					},
					'/test/folder'
				);
			});

			// Verify "Auto Run Started" toast was fired
			expect(mockNotifyToast).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'info',
					title: 'Auto Run Started',
					sessionId: 'wt-session-id',
				})
			);

			// Verify the message includes task and document counts
			const toastCall = mockNotifyToast.mock.calls.find(
				(call: unknown[]) => (call[0] as { title?: string })?.title === 'Auto Run Started'
			);
			expect(toastCall).toBeDefined();
			expect((toastCall![0] as { message: string }).message).toMatch(
				/\d+ tasks? across \d+ documents?/
			);
		});

		it('should add history entry with PR URL on successful PR creation', async () => {
			const parentSession = createMockSession({
				id: 'parent-session-id',
				cwd: '/main/repo',
			});
			const worktreeSession = createMockSession({
				id: 'wt-session-id',
				name: 'WT Agent',
				cwd: '/main/repo/worktrees/pr-branch',
				parentSessionId: 'parent-session-id',
				worktreeBranch: 'pr-branch',
			});
			const sessions = [parentSession, worktreeSession];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			mockCreatePR.mockResolvedValue({
				success: true,
				prUrl: 'https://github.com/test/repo/pull/99',
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
					onPRResult: mockOnPRResult,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'wt-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktreeTarget: {
							mode: 'create-new',
							newBranchName: 'pr-branch',
							baseBranch: 'main',
							createPROnCompletion: true,
						},
						worktree: {
							enabled: true,
							path: '/main/repo/worktrees/pr-branch',
							branchName: 'pr-branch',
							createPROnCompletion: true,
							prTargetBranch: 'main',
						},
					},
					'/test/folder'
				);
			});

			// Verify onAddHistoryEntry was called with PR URL in summary
			expect(mockOnAddHistoryEntry).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'AUTO',
					summary: expect.stringContaining('https://github.com/test/repo/pull/99'),
					sessionId: 'wt-session-id',
					success: true,
				})
			);

			// Verify the full response contains PR details
			const prHistoryCall = mockOnAddHistoryEntry.mock.calls.find((call: unknown[]) => {
				const entry = call[0] as { summary?: string };
				return entry.summary?.includes('PR created');
			});
			expect(prHistoryCall).toBeDefined();
			const prEntry = prHistoryCall![0] as { fullResponse: string };
			expect(prEntry.fullResponse).toContain('Pull Request Created');
			expect(prEntry.fullResponse).toContain('pr-branch');
			expect(prEntry.fullResponse).toContain('https://github.com/test/repo/pull/99');
		});

		it('should add history entry with error on failed PR creation', async () => {
			const parentSession = createMockSession({
				id: 'parent-session-id',
				cwd: '/main/repo',
			});
			const worktreeSession = createMockSession({
				id: 'wt-session-id',
				name: 'WT Agent',
				cwd: '/main/repo/worktrees/fail-branch',
				parentSessionId: 'parent-session-id',
				worktreeBranch: 'fail-branch',
			});
			const sessions = [parentSession, worktreeSession];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			mockCreatePR.mockResolvedValue({
				success: false,
				error: 'gh: not authenticated',
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
					onPRResult: mockOnPRResult,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'wt-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktreeTarget: {
							mode: 'create-new',
							newBranchName: 'fail-branch',
							baseBranch: 'main',
							createPROnCompletion: true,
						},
						worktree: {
							enabled: true,
							path: '/main/repo/worktrees/fail-branch',
							branchName: 'fail-branch',
							createPROnCompletion: true,
							prTargetBranch: 'main',
						},
					},
					'/test/folder'
				);
			});

			// Verify onAddHistoryEntry was called with error info
			expect(mockOnAddHistoryEntry).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'AUTO',
					summary: expect.stringContaining('PR creation failed'),
					sessionId: 'wt-session-id',
					success: false,
				})
			);

			// Verify error details in full response
			const prHistoryCall = mockOnAddHistoryEntry.mock.calls.find((call: unknown[]) => {
				const entry = call[0] as { summary?: string };
				return entry.summary?.includes('PR creation failed');
			});
			expect(prHistoryCall).toBeDefined();
			const prEntry = prHistoryCall![0] as { fullResponse: string };
			expect(prEntry.fullResponse).toContain('Pull Request Creation Failed');
			expect(prEntry.fullResponse).toContain('gh: not authenticated');
		});
	});
});

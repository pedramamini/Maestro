/**
 * @file run-playbook.test.ts
 * @description Tests for the run-playbook CLI command
 *
 * Tests all functionality of the run-playbook command including:
 * - Playbook execution with various options
 * - Dry run mode
 * - JSON output mode
 * - Wait mode for busy agents
 * - Error handling
 * - Agent busy detection
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import type { Playbook, SessionInfo } from '../../../shared/types';
import { DEFAULT_AUTORUN_SKILLS } from '../../../shared/playbookDag';

// Mock fs and path first
vi.mock('fs', () => ({
	readFileSync: vi.fn(),
	existsSync: vi.fn(),
	mkdirSync: vi.fn(),
	writeFileSync: vi.fn(),
}));

vi.mock('os', () => ({
	platform: vi.fn(() => 'darwin'),
	homedir: vi.fn(() => '/Users/test'),
}));

vi.mock('child_process', async (importOriginal) => {
	const actual = await importOriginal<typeof import('child_process')>();
	return {
		default: actual,
		...actual,
		execFileSync: vi.fn(() => 'main\n'),
	};
});

// Mock the storage service
vi.mock('../../../cli/services/storage', () => ({
	getSessionById: vi.fn(),
}));

// Mock the playbooks service
vi.mock('../../../cli/services/playbooks', () => ({
	findPlaybookById: vi.fn(),
}));

// Mock the batch-processor service
vi.mock('../../../cli/services/batch-processor', () => ({
	runPlaybook: vi.fn(),
}));

vi.mock('../../../cli/services/task-sync', () => ({
	validateProjectMemoryExecutionStart: vi.fn(),
	readProjectMemorySnapshot: vi.fn(() => null),
	lockTask: vi.fn(() => null),
}));

vi.mock('../../../main/wizard-task-emitter', () => ({
	emitWizardTasks: vi.fn(() => ({
		success: true,
		emittedTaskIds: ['PM-01'],
		tasksFilePath: '/repo/project_memory/tasks/tasks.json',
	})),
}));

// Mock the agent-spawner service
vi.mock('../../../cli/services/agent-spawner', () => ({
	detectAgent: vi.fn(),
}));

// Mock agent definitions
vi.mock('../../../main/agents/definitions', () => ({
	getAgentDefinition: vi.fn((agentId: string) => {
		const defs: Record<string, { name: string; binaryName: string }> = {
			'claude-code': { name: 'Claude Code', binaryName: 'claude' },
			codex: { name: 'Codex', binaryName: 'codex' },
			opencode: { name: 'OpenCode', binaryName: 'opencode' },
			'factory-droid': { name: 'Factory Droid', binaryName: 'droid' },
		};
		return defs[agentId] || undefined;
	}),
}));

// Mock the jsonl output
vi.mock('../../../cli/output/jsonl', () => ({
	emitError: vi.fn((msg, code) => {
		console.error(JSON.stringify({ type: 'error', message: msg, code }));
	}),
}));

// Mock the formatter
vi.mock('../../../cli/output/formatter', () => ({
	formatRunEvent: vi.fn((event: any) => `[${event.type}] ${event.message || ''}`),
	formatError: vi.fn((msg) => `Error: ${msg}`),
	formatInfo: vi.fn((msg) => `Info: ${msg}`),
	formatWarning: vi.fn((msg) => `Warning: ${msg}`),
}));

// Mock cli-activity
vi.mock('../../../shared/cli-activity', () => ({
	isSessionBusyWithCli: vi.fn(),
	getCliActivityForSession: vi.fn(),
}));

import * as fs from 'fs';
import * as os from 'os';
import { execFileSync } from 'child_process';
import { runPlaybook } from '../../../cli/commands/run-playbook';
import { getSessionById } from '../../../cli/services/storage';
import { findPlaybookById } from '../../../cli/services/playbooks';
import { runPlaybook as executePlaybook } from '../../../cli/services/batch-processor';
import * as taskSyncService from '../../../cli/services/task-sync';
import { detectAgent } from '../../../cli/services/agent-spawner';
import { emitWizardTasks } from '../../../main/wizard-task-emitter';
import { emitError } from '../../../cli/output/jsonl';
import {
	formatRunEvent,
	formatError,
	formatInfo,
	formatWarning,
} from '../../../cli/output/formatter';
import { isSessionBusyWithCli, getCliActivityForSession } from '../../../shared/cli-activity';

describe('run-playbook command', () => {
	let consoleSpy: MockInstance;
	let consoleErrorSpy: MockInstance;
	let processExitSpy: MockInstance;

	const mockPlaybook = (overrides: Partial<Playbook> = {}): Playbook => ({
		id: 'pb-123',
		name: 'Test Playbook',
		documents: [{ filename: 'doc1.md', resetOnCompletion: false }],
		loopEnabled: false,
		maxLoops: null,
		...overrides,
	});

	const mockSession = (overrides: Partial<SessionInfo> = {}): SessionInfo => ({
		id: 'agent-1',
		name: 'Test Agent',
		toolType: 'claude-code',
		cwd: '/path/to/project',
		autoRunFolderPath: '/path/to/playbooks',
		...overrides,
	});

	// Helper to create an async generator for batch-processor mock
	async function* mockEventGenerator(events: any[]) {
		for (const event of events) {
			yield event;
		}
	}

	beforeEach(() => {
		vi.clearAllMocks();
		consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		processExitSpy = vi
			.spyOn(process, 'exit')
			.mockImplementation((code?: string | number | null | undefined) => {
				throw new Error(`process.exit(${code})`);
			});

		// Default: agent is available
		vi.mocked(detectAgent).mockResolvedValue({
			available: true,
			path: '/usr/local/bin/claude',
		});

		// Default: agent is not busy
		vi.mocked(isSessionBusyWithCli).mockReturnValue(false);
		vi.mocked(getCliActivityForSession).mockReturnValue(undefined);

		// Default: No sessions in sessions file (agent not busy in desktop)
		vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ sessions: [] }));
		vi.mocked(taskSyncService.validateProjectMemoryExecutionStart).mockReturnValue({
			ok: true,
			skipped: false,
			taskId: 'PM-01',
			executorId: 'codex-main',
			reason: null,
			bindingMode: 'shared-branch-serialized',
			expectedBranch: 'main',
			currentBranch: 'main',
		});
		vi.mocked(taskSyncService.readProjectMemorySnapshot).mockReturnValue(null);
		vi.mocked(taskSyncService.lockTask).mockReturnValue(null as any);

		// Default: platform is darwin
		vi.mocked(os.platform).mockReturnValue('darwin');
		vi.mocked(os.homedir).mockReturnValue('/Users/test');
		vi.mocked(execFileSync).mockReturnValue('main\n' as never);
	});

	afterEach(() => {
		consoleSpy.mockRestore();
		consoleErrorSpy.mockRestore();
		processExitSpy.mockRestore();
	});

	describe('successful execution', () => {
		it('should execute a playbook and stream events in human-readable format', async () => {
			const playbook = mockPlaybook();
			const agent = mockSession();

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);
			vi.mocked(executePlaybook).mockReturnValue(
				mockEventGenerator([
					{ type: 'start', timestamp: Date.now() },
					{ type: 'document_start', document: 'doc1.md', taskCount: 1, timestamp: Date.now() },
					{ type: 'complete', totalTasksCompleted: 1, totalElapsedMs: 1000, timestamp: Date.now() },
				])
			);

			await runPlaybook('pb-123', {});

			expect(findPlaybookById).toHaveBeenCalledWith('pb-123');
			expect(getSessionById).toHaveBeenCalledWith('agent-1');
			expect(executePlaybook).toHaveBeenCalledWith(
				agent,
				expect.objectContaining({
					id: playbook.id,
					name: playbook.name,
					maxParallelism: 1,
					skills: DEFAULT_AUTORUN_SKILLS,
					taskGraph: {
						nodes: [
							{
								id: 'doc1',
								documentIndex: 0,
								dependsOn: [],
								isolationMode: 'shared-checkout',
							},
						],
					},
				}),
				'/path/to/playbooks',
				{
					dryRun: undefined,
					writeHistory: true,
					debug: undefined,
					verbose: undefined,
				}
			);
			expect(formatInfo).toHaveBeenCalledWith('Running playbook: Test Playbook');
			expect(formatInfo).toHaveBeenCalledWith('Agent: Test Agent');
			expect(formatRunEvent).toHaveBeenCalled();
		});

		it('should execute a playbook with JSON output', async () => {
			const playbook = mockPlaybook();
			const agent = mockSession();

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);
			vi.mocked(executePlaybook).mockReturnValue(
				mockEventGenerator([
					{ type: 'start', timestamp: 12345 },
					{ type: 'complete', totalTasksCompleted: 1, totalElapsedMs: 1000, timestamp: 12346 },
				])
			);

			await runPlaybook('pb-123', { json: true });

			// JSON mode should output raw JSON strings
			expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify({ type: 'start', timestamp: 12345 }));
			expect(consoleSpy).toHaveBeenCalledWith(
				JSON.stringify({
					type: 'complete',
					totalTasksCompleted: 1,
					totalElapsedMs: 1000,
					timestamp: 12346,
				})
			);
			// formatInfo should NOT be called in JSON mode
			expect(formatInfo).not.toHaveBeenCalled();
		});

		it('should execute a playbook in dry run mode', async () => {
			const playbook = mockPlaybook();
			const agent = mockSession();

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);
			vi.mocked(executePlaybook).mockReturnValue(
				mockEventGenerator([
					{ type: 'complete', dryRun: true, wouldProcess: 5, timestamp: Date.now() },
				])
			);

			await runPlaybook('pb-123', { dryRun: true });

			expect(executePlaybook).toHaveBeenCalledWith(
				agent,
				expect.objectContaining({
					id: playbook.id,
					maxParallelism: 1,
					taskGraph: {
						nodes: [
							{
								id: 'doc1',
								documentIndex: 0,
								dependsOn: [],
								isolationMode: 'shared-checkout',
							},
						],
					},
				}),
				'/path/to/playbooks',
				{
					dryRun: true,
					writeHistory: true,
					debug: undefined,
					verbose: undefined,
				}
			);
			expect(formatInfo).toHaveBeenCalledWith('Dry run mode - no changes will be made');
		});

		it('should execute a playbook with --no-history flag', async () => {
			const playbook = mockPlaybook();
			const agent = mockSession();

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);
			vi.mocked(executePlaybook).mockReturnValue(mockEventGenerator([]));

			await runPlaybook('pb-123', { history: false });

			expect(executePlaybook).toHaveBeenCalledWith(
				agent,
				expect.objectContaining({
					id: playbook.id,
					taskGraph: {
						nodes: [
							{
								id: 'doc1',
								documentIndex: 0,
								dependsOn: [],
								isolationMode: 'shared-checkout',
							},
						],
					},
				}),
				'/path/to/playbooks',
				{
					dryRun: undefined,
					writeHistory: false,
					debug: undefined,
					verbose: undefined,
				}
			);
		});

		it('should execute a playbook with debug option', async () => {
			const playbook = mockPlaybook();
			const agent = mockSession();

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);
			vi.mocked(executePlaybook).mockReturnValue(mockEventGenerator([]));

			await runPlaybook('pb-123', { debug: true });

			expect(executePlaybook).toHaveBeenCalledWith(
				agent,
				expect.objectContaining({
					id: playbook.id,
					taskGraph: {
						nodes: [
							{
								id: 'doc1',
								documentIndex: 0,
								dependsOn: [],
								isolationMode: 'shared-checkout',
							},
						],
					},
				}),
				'/path/to/playbooks',
				{
					dryRun: undefined,
					writeHistory: true,
					debug: true,
					verbose: undefined,
				}
			);
		});

		it('should execute a playbook with verbose option', async () => {
			const playbook = mockPlaybook();
			const agent = mockSession();

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);
			vi.mocked(executePlaybook).mockReturnValue(mockEventGenerator([]));

			await runPlaybook('pb-123', { verbose: true });

			expect(executePlaybook).toHaveBeenCalledWith(
				agent,
				expect.objectContaining({
					id: playbook.id,
					taskGraph: {
						nodes: [
							{
								id: 'doc1',
								documentIndex: 0,
								dependsOn: [],
								isolationMode: 'shared-checkout',
							},
						],
					},
				}),
				'/path/to/playbooks',
				{
					dryRun: undefined,
					writeHistory: true,
					debug: undefined,
					verbose: true,
				}
			);
		});

		it('should display loop configuration when loopEnabled is true', async () => {
			const playbook = mockPlaybook({ loopEnabled: true, maxLoops: 5 });
			const agent = mockSession();

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);
			vi.mocked(executePlaybook).mockReturnValue(mockEventGenerator([]));

			await runPlaybook('pb-123', {});

			expect(formatInfo).toHaveBeenCalledWith('Loop: enabled (max 5)');
		});

		it('should display infinite loop configuration when maxLoops is null', async () => {
			const playbook = mockPlaybook({ loopEnabled: true, maxLoops: null });
			const agent = mockSession();

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);
			vi.mocked(executePlaybook).mockReturnValue(mockEventGenerator([]));

			await runPlaybook('pb-123', {});

			expect(formatInfo).toHaveBeenCalledWith('Loop: enabled (∞)');
		});

		it('should warn when shared-checkout playbooks request parallel execution', async () => {
			const playbook = mockPlaybook({
				documents: [
					{ filename: 'doc1.md', resetOnCompletion: false },
					{ filename: 'doc2.md', resetOnCompletion: false },
				],
				maxParallelism: 2,
				taskGraph: {
					nodes: [
						{
							id: 'doc1',
							documentIndex: 0,
							dependsOn: [],
							isolationMode: 'shared-checkout',
						},
						{
							id: 'doc2',
							documentIndex: 1,
							dependsOn: ['doc1'],
							isolationMode: 'shared-checkout',
						},
					],
				},
			});
			const agent = mockSession();

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);
			vi.mocked(executePlaybook).mockReturnValue(mockEventGenerator([]));

			await runPlaybook('pb-123', {});

			expect(formatWarning).toHaveBeenCalledWith(
				expect.stringContaining('falls back to sequential execution')
			);
		});
	});

	describe('agent CLI not found', () => {
		it('should error when agent CLI is not available (human-readable)', async () => {
			vi.mocked(detectAgent).mockResolvedValue({ available: false });

			await expect(runPlaybook('pb-123', {})).rejects.toThrow('process.exit(1)');

			expect(formatError).toHaveBeenCalledWith(
				'Claude Code CLI not found. Please install Claude Code.'
			);
		});

		it('should error when agent CLI is not available (JSON)', async () => {
			vi.mocked(detectAgent).mockResolvedValue({ available: false });

			await expect(runPlaybook('pb-123', { json: true })).rejects.toThrow('process.exit(1)');

			expect(emitError).toHaveBeenCalledWith(
				'Claude Code CLI not found. Please install Claude Code.',
				'CLAUDE_CODE_NOT_FOUND'
			);
		});
	});

	describe('playbook not found', () => {
		it('should error when playbook is not found (human-readable)', async () => {
			vi.mocked(findPlaybookById).mockImplementation(() => {
				throw new Error('Playbook not found: xyz');
			});

			await expect(runPlaybook('xyz', {})).rejects.toThrow('process.exit(1)');

			expect(formatError).toHaveBeenCalledWith('Playbook not found: xyz');
		});

		it('should error when playbook is not found (JSON)', async () => {
			vi.mocked(findPlaybookById).mockImplementation(() => {
				throw new Error('Playbook not found: xyz');
			});

			await expect(runPlaybook('xyz', { json: true })).rejects.toThrow('process.exit(1)');

			expect(emitError).toHaveBeenCalledWith('Playbook not found: xyz', 'PLAYBOOK_NOT_FOUND');
		});

		it('should handle non-Error throws in playbook lookup', async () => {
			vi.mocked(findPlaybookById).mockImplementation(() => {
				throw 'string error';
			});

			await expect(runPlaybook('xyz', {})).rejects.toThrow('process.exit(1)');

			expect(formatError).toHaveBeenCalledWith('Unknown error');
		});
	});

	describe('agent busy detection', () => {
		it('should error when agent is busy in CLI (human-readable)', async () => {
			const playbook = mockPlaybook();
			const agent = mockSession();

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);
			vi.mocked(isSessionBusyWithCli).mockReturnValue(true);
			vi.mocked(getCliActivityForSession).mockReturnValue({
				sessionId: 'agent-1',
				playbookId: 'pb-other',
				playbookName: 'Other Playbook',
				startedAt: Date.now(),
				pid: 12345,
			});

			await expect(runPlaybook('pb-123', {})).rejects.toThrow('process.exit(1)');

			expect(formatError).toHaveBeenCalledWith(
				expect.stringContaining(
					'Agent "Test Agent" is busy: Running playbook "Other Playbook" from CLI'
				)
			);
		});

		it('should error when agent is busy in CLI (JSON)', async () => {
			const playbook = mockPlaybook();
			const agent = mockSession();

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);
			vi.mocked(isSessionBusyWithCli).mockReturnValue(true);
			vi.mocked(getCliActivityForSession).mockReturnValue({
				sessionId: 'agent-1',
				playbookId: 'pb-other',
				playbookName: 'Other Playbook',
				startedAt: Date.now(),
				pid: 12345,
			});

			await expect(runPlaybook('pb-123', { json: true })).rejects.toThrow('process.exit(1)');

			expect(emitError).toHaveBeenCalledWith(
				expect.stringContaining('Agent "Test Agent" is busy'),
				'AGENT_BUSY'
			);
		});

		it('should error when agent is busy in desktop app', async () => {
			const playbook = mockPlaybook();
			const agent = mockSession();

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);
			vi.mocked(isSessionBusyWithCli).mockReturnValue(false);
			vi.mocked(getCliActivityForSession).mockReturnValue(undefined);
			vi.mocked(fs.readFileSync).mockReturnValue(
				JSON.stringify({
					sessions: [{ id: 'agent-1', state: 'busy' }],
				})
			);

			await expect(runPlaybook('pb-123', {})).rejects.toThrow('process.exit(1)');

			expect(formatError).toHaveBeenCalledWith(
				expect.stringContaining('Agent "Test Agent" is busy: Busy in desktop app')
			);
		});

		it('should handle sessions file read errors gracefully (assume not busy)', async () => {
			const playbook = mockPlaybook();
			const agent = mockSession();

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);
			vi.mocked(isSessionBusyWithCli).mockReturnValue(false);
			vi.mocked(getCliActivityForSession).mockReturnValue(undefined);
			vi.mocked(fs.readFileSync).mockImplementation(() => {
				throw new Error('ENOENT');
			});
			vi.mocked(executePlaybook).mockReturnValue(mockEventGenerator([]));

			// Should NOT throw - assume not busy when file read fails
			await runPlaybook('pb-123', {});

			expect(executePlaybook).toHaveBeenCalled();
		});
	});

	describe('wait mode', () => {
		// These tests use fake timers to test the wait functionality without actual delays

		it('should wait for agent to become available in wait mode', async () => {
			vi.useFakeTimers();
			try {
				const playbook = mockPlaybook();
				const agent = mockSession();

				vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
				vi.mocked(getSessionById).mockReturnValue(agent);
				vi.mocked(executePlaybook).mockReturnValue(mockEventGenerator([]));

				// First call: busy, subsequent calls: not busy
				let callCount = 0;
				vi.mocked(isSessionBusyWithCli).mockImplementation(() => {
					callCount++;
					return callCount === 1;
				});
				vi.mocked(getCliActivityForSession).mockImplementation(() => {
					if (callCount <= 1) {
						return {
							sessionId: 'agent-1',
							playbookId: 'pb-other',
							playbookName: 'Other Playbook',
							startedAt: Date.now(),
							pid: 12345,
						};
					}
					return undefined;
				});

				// Start the async operation
				const runPromise = runPlaybook('pb-123', { wait: true });

				// Advance timers to trigger the poll interval (5 seconds)
				await vi.advanceTimersByTimeAsync(5000);

				// Now let the promise complete
				await runPromise;

				expect(formatWarning).toHaveBeenCalledWith(
					expect.stringContaining('Agent "Test Agent" is busy')
				);
				expect(formatInfo).toHaveBeenCalledWith('Waiting for agent to become available...');
				expect(formatInfo).toHaveBeenCalledWith(
					expect.stringContaining('Agent available after waiting')
				);
				expect(executePlaybook).toHaveBeenCalled();
			} finally {
				vi.useRealTimers();
			}
		});

		it('should emit wait_complete event in JSON mode', async () => {
			vi.useFakeTimers();
			try {
				const playbook = mockPlaybook();
				const agent = mockSession();

				vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
				vi.mocked(getSessionById).mockReturnValue(agent);
				vi.mocked(executePlaybook).mockReturnValue(mockEventGenerator([]));

				let callCount = 0;
				vi.mocked(isSessionBusyWithCli).mockImplementation(() => {
					callCount++;
					return callCount === 1;
				});
				vi.mocked(getCliActivityForSession).mockImplementation(() => {
					if (callCount <= 1) {
						return {
							sessionId: 'agent-1',
							playbookId: 'pb-other',
							playbookName: 'Other Playbook',
							startedAt: Date.now(),
							pid: 12345,
						};
					}
					return undefined;
				});

				// Start the async operation
				const runPromise = runPlaybook('pb-123', { wait: true, json: true });

				// Advance timers to trigger the poll interval (5 seconds)
				await vi.advanceTimersByTimeAsync(5000);

				// Now let the promise complete
				await runPromise;

				// Should emit wait_complete event
				const waitCompleteCall = consoleSpy.mock.calls.find((call: any[]) => {
					try {
						const parsed = JSON.parse(call[0]);
						return parsed.type === 'wait_complete';
					} catch {
						return false;
					}
				});
				expect(waitCompleteCall).toBeDefined();
			} finally {
				vi.useRealTimers();
			}
		});

		it('should fail with AGENT_WAIT_TIMEOUT when wait exceeds maxWaitMs', async () => {
			vi.useFakeTimers();
			try {
				const playbook = mockPlaybook();
				const agent = mockSession();

				vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
				vi.mocked(getSessionById).mockReturnValue(agent);
				vi.mocked(isSessionBusyWithCli).mockReturnValue(true);
				vi.mocked(getCliActivityForSession).mockReturnValue({
					sessionId: 'agent-1',
					playbookId: 'pb-other',
					playbookName: 'Other Playbook',
					startedAt: Date.now(),
					pid: 12345,
				});

				const runPromise = runPlaybook('pb-123', {
					wait: true,
					json: true,
					maxWaitMs: 5000,
				});
				const settledPromise = runPromise.then(
					() => null,
					(error) => error
				);

				await vi.advanceTimersByTimeAsync(5000);

				const error = await settledPromise;
				expect(error).toBeInstanceOf(Error);
				expect((error as Error).message).toBe('process.exit(1)');
				expect(emitError).toHaveBeenCalledWith(
					expect.stringContaining('Timed out after waiting'),
					'AGENT_WAIT_TIMEOUT'
				);
				expect(executePlaybook).not.toHaveBeenCalled();
			} finally {
				vi.useRealTimers();
			}
		});
	});

	describe('no Auto Run folder', () => {
		it('should error when agent has no autoRunFolderPath (human-readable)', async () => {
			const playbook = mockPlaybook();
			const agent = mockSession({ autoRunFolderPath: undefined });

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);

			await expect(runPlaybook('pb-123', {})).rejects.toThrow('process.exit(1)');

			expect(formatError).toHaveBeenCalledWith('Agent does not have an Auto Run folder configured');
		});

		it('should error when agent has no autoRunFolderPath (JSON)', async () => {
			const playbook = mockPlaybook();
			const agent = mockSession({ autoRunFolderPath: undefined });

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);

			await expect(runPlaybook('pb-123', { json: true })).rejects.toThrow('process.exit(1)');

			expect(emitError).toHaveBeenCalledWith(
				'Agent does not have an Auto Run folder configured',
				'NO_AUTORUN_FOLDER'
			);
		});
	});

	describe('DAG validation', () => {
		it('should report invalid DAGs through the human-readable error path before execution', async () => {
			const playbook = mockPlaybook({
				documents: [
					{ filename: 'phase-1.md', resetOnCompletion: false },
					{ filename: 'phase-2.md', resetOnCompletion: false },
				],
				taskGraph: {
					nodes: [
						{ id: 'phase-1', documentIndex: 0, dependsOn: ['phase-2'] },
						{ id: 'phase-2', documentIndex: 1, dependsOn: [] },
					],
				},
			});
			const agent = mockSession();

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);

			await expect(runPlaybook('pb-123', {})).rejects.toThrow('process.exit(1)');

			expect(executePlaybook).not.toHaveBeenCalled();
			expect(formatError).toHaveBeenCalledWith(
				expect.stringContaining('Playbook DAG validation failed:')
			);
		});

		it('should report invalid DAGs through the JSON error path before execution', async () => {
			const playbook = mockPlaybook({
				documents: [
					{ filename: 'phase-1.md', resetOnCompletion: false },
					{ filename: 'phase-2.md', resetOnCompletion: false },
				],
				taskGraph: {
					nodes: [
						{ id: 'phase-1', documentIndex: 0, dependsOn: ['phase-2'] },
						{ id: 'phase-2', documentIndex: 1, dependsOn: [] },
					],
				},
			});
			const agent = mockSession();

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);

			await expect(runPlaybook('pb-123', { json: true })).rejects.toThrow('process.exit(1)');

			expect(executePlaybook).not.toHaveBeenCalled();
			expect(emitError).toHaveBeenCalledWith(
				expect.stringContaining('Playbook DAG validation failed:'),
				'PLAYBOOK_DAG_INVALID'
			);
		});
	});

	describe('project memory execution validation', () => {
		it('should block Codex execution before invoking batch processor when project memory metadata is missing', async () => {
			const playbook = mockPlaybook();
			const agent = mockSession({ toolType: 'codex' });

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);
			vi.mocked(executePlaybook).mockReturnValue(mockEventGenerator([]));

			await expect(runPlaybook('pb-123', {})).rejects.toThrow('process.exit(1)');

			expect(executePlaybook).not.toHaveBeenCalled();
			expect(taskSyncService.validateProjectMemoryExecutionStart).not.toHaveBeenCalled();
			expect(formatError).toHaveBeenCalledWith(
				'Codex Auto Run requires an active Project Memory binding for this repo.'
			);
		});

		it('should bootstrap project memory from binding intent before invoking batch processor', async () => {
			const playbook = mockPlaybook({
				projectMemoryBindingIntent: {
					policyVersion: '2026-04-04',
					repoRoot: '/repo',
					sourceBranch: 'main',
					bindingPreference: 'shared-branch-serialized',
					sharedCheckoutAllowed: true,
					reuseExistingBinding: true,
					allowRebindIfStale: true,
				},
				taskGraph: {
					nodes: [{ id: 'PM-01', documentIndex: 0, dependsOn: [] }],
				},
			});
			const agent = mockSession({ toolType: 'codex', cwd: '/repo' });

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);
			vi.mocked(taskSyncService.lockTask).mockReturnValue({
				task: { id: 'PM-01' },
			} as any);
			vi.mocked(executePlaybook).mockReturnValue(mockEventGenerator([]));

			await runPlaybook('pb-123', {});

			expect(emitWizardTasks).toHaveBeenCalledTimes(1);
			expect(taskSyncService.lockTask).toHaveBeenCalledWith(
				{
					repoRoot: '/repo',
					executorId: 'codex-main',
				},
				'PM-01'
			);
			expect(executePlaybook).toHaveBeenCalledWith(
				agent,
				expect.objectContaining({
					projectMemoryExecution: {
						repoRoot: '/repo',
						taskId: 'PM-01',
						executorId: 'codex-main',
					},
				}),
				'/path/to/playbooks',
				expect.any(Object)
			);
		});

		it('should reuse existing task store when binding intent exists and snapshot is present', async () => {
			const playbook = mockPlaybook({
				projectMemoryBindingIntent: {
					policyVersion: '2026-04-04',
					repoRoot: '/repo',
					sourceBranch: 'main',
					bindingPreference: 'shared-branch-serialized',
					sharedCheckoutAllowed: true,
					reuseExistingBinding: true,
					allowRebindIfStale: true,
				},
				documents: [
					{ filename: 'phase-1.md', resetOnCompletion: false },
					{ filename: 'phase-2.md', resetOnCompletion: false },
				],
				taskGraph: {
					nodes: [
						{ id: 'PM-01', documentIndex: 0, dependsOn: [] },
						{ id: 'PM-02', documentIndex: 1, dependsOn: [] },
					],
				},
			});
			const agent = mockSession({ toolType: 'codex', cwd: '/repo' });

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);
			vi.mocked(taskSyncService.readProjectMemorySnapshot).mockReturnValue({
				projectId: 'repo',
				version: '1',
				taskCount: 1,
				tasks: [],
				generatedAt: new Date().toISOString(),
			});
			vi.mocked(emitWizardTasks).mockReturnValue({
				success: false,
				partialSuccess: false,
				emittedTaskIds: [],
				skippedTaskIds: ['PM-01', 'PM-02'],
				tasksFilePath: '/repo/project_memory/tasks/tasks.json',
				error: 'All 2 task(s) already exist in task store',
			});
			vi.mocked(taskSyncService.lockTask)
				.mockImplementationOnce(() => {
					throw new Error('Task dependencies are not complete: PM-01');
				})
				.mockReturnValueOnce({
					task: { id: 'PM-02' },
				} as any);
			vi.mocked(executePlaybook).mockReturnValue(mockEventGenerator([]));

			await runPlaybook('pb-123', {});

			expect(emitWizardTasks).toHaveBeenCalledTimes(1);
			expect(taskSyncService.lockTask).toHaveBeenNthCalledWith(
				1,
				{
					repoRoot: '/repo',
					executorId: 'codex-main',
				},
				'PM-01'
			);
			expect(taskSyncService.lockTask).toHaveBeenNthCalledWith(
				2,
				{
					repoRoot: '/repo',
					executorId: 'codex-main',
				},
				'PM-02'
			);
			expect(executePlaybook).toHaveBeenCalledWith(
				agent,
				expect.objectContaining({
					projectMemoryExecution: {
						repoRoot: '/repo',
						taskId: 'PM-02',
						executorId: 'codex-main',
					},
				}),
				'/path/to/playbooks',
				expect.any(Object)
			);
		});

		it('should report playbook-specific task claim failures through the JSON error path', async () => {
			const playbook = mockPlaybook({
				projectMemoryBindingIntent: {
					policyVersion: '2026-04-04',
					repoRoot: '/repo',
					sourceBranch: 'main',
					bindingPreference: 'shared-branch-serialized',
					sharedCheckoutAllowed: true,
					reuseExistingBinding: true,
					allowRebindIfStale: true,
				},
				documents: [
					{ filename: 'phase-1.md', resetOnCompletion: false },
					{ filename: 'phase-2.md', resetOnCompletion: false },
				],
				taskGraph: {
					nodes: [
						{ id: 'PM-01', documentIndex: 0, dependsOn: [] },
						{ id: 'PM-02', documentIndex: 1, dependsOn: [] },
					],
				},
			});
			const agent = mockSession({ toolType: 'codex', cwd: '/repo' });

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);
			vi.mocked(taskSyncService.lockTask)
				.mockImplementationOnce(() => {
					throw new Error('Task is already completed: PM-01');
				})
				.mockImplementationOnce(() => {
					throw new Error('Task lock owner mismatch: PM-02');
				});
			vi.mocked(executePlaybook).mockReturnValue(mockEventGenerator([]));

			await expect(runPlaybook('pb-123', { json: true })).rejects.toThrow('process.exit(1)');

			expect(executePlaybook).not.toHaveBeenCalled();
			expect(emitError).toHaveBeenCalledWith(
				'Failed to run playbook: Project Memory bootstrap did not find a runnable task for this playbook. (PM-01: Task is already completed: PM-01; PM-02: Task lock owner mismatch: PM-02)',
				'EXECUTION_ERROR'
			);
		});

		it('should report missing Codex project memory metadata through the JSON error path', async () => {
			const playbook = mockPlaybook();
			const agent = mockSession({ toolType: 'codex' });

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);
			vi.mocked(executePlaybook).mockReturnValue(mockEventGenerator([]));

			await expect(runPlaybook('pb-123', { json: true })).rejects.toThrow('process.exit(1)');

			expect(executePlaybook).not.toHaveBeenCalled();
			expect(emitError).toHaveBeenCalledWith(
				'Codex Auto Run requires an active Project Memory binding for this repo.',
				'PROJECT_MEMORY_EXECUTION_REQUIRED'
			);
		});

		it('should report bootstrap failures through the JSON error path', async () => {
			const playbook = mockPlaybook({
				projectMemoryBindingIntent: {
					policyVersion: '2026-04-04',
					repoRoot: '/repo',
					sourceBranch: 'main',
					bindingPreference: 'shared-branch-serialized',
					sharedCheckoutAllowed: true,
					reuseExistingBinding: true,
					allowRebindIfStale: true,
				},
			});
			const agent = mockSession({ toolType: 'codex', cwd: '/repo' });

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);
			vi.mocked(emitWizardTasks).mockReturnValue({
				success: false,
				error: 'tasks.json write failed',
				emittedTaskIds: [],
				tasksFilePath: '/repo/project_memory/tasks/tasks.json',
			});
			vi.mocked(executePlaybook).mockReturnValue(mockEventGenerator([]));

			await expect(runPlaybook('pb-123', { json: true })).rejects.toThrow('process.exit(1)');

			expect(executePlaybook).not.toHaveBeenCalled();
			expect(emitError).toHaveBeenCalledWith(
				'Failed to run playbook: tasks.json write failed',
				'EXECUTION_ERROR'
			);
		});

		it('should block execution before invoking batch processor when project memory validation fails', async () => {
			const playbook = mockPlaybook({
				projectMemoryExecution: {
					repoRoot: '/repo',
					taskId: 'PM-01',
					executorId: 'codex-main',
				},
			});
			const agent = mockSession({ cwd: '/repo' });

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);
			vi.mocked(executePlaybook).mockReturnValue(mockEventGenerator([]));
			vi.mocked(taskSyncService.validateProjectMemoryExecutionStart).mockReturnValue({
				ok: false,
				skipped: false,
				taskId: 'PM-01',
				executorId: 'codex-main',
				reason: 'Task lock owner mismatch: expected codex-main, found other-executor',
				bindingMode: 'shared-branch-serialized',
				expectedBranch: 'main',
				currentBranch: 'main',
			});

			await expect(runPlaybook('pb-123', {})).rejects.toThrow('process.exit(1)');

			expect(executePlaybook).not.toHaveBeenCalled();
			expect(formatError).toHaveBeenCalledWith(
				'Task lock owner mismatch: expected codex-main, found other-executor'
			);
		});

		it('should use project memory repoRoot as validation input when provided', async () => {
			const projectMemoryRepoRoot = process.cwd();
			const playbook = mockPlaybook({
				projectMemoryExecution: {
					repoRoot: projectMemoryRepoRoot,
					taskId: 'PM-01',
					executorId: 'codex-main',
				},
			});
			const agent = mockSession({ cwd: '/agent-cwd' });

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);
			vi.mocked(executePlaybook).mockReturnValue(mockEventGenerator([]));

			await runPlaybook('pb-123', {});

			const validationCall = vi.mocked(taskSyncService.validateProjectMemoryExecutionStart).mock
				.calls[0]?.[0];
			expect(validationCall).toEqual(
				expect.objectContaining({
					repoRoot: projectMemoryRepoRoot,
					taskId: 'PM-01',
					executorId: 'codex-main',
				})
			);
		});
	});

	describe('execution errors', () => {
		it('should handle execution errors (human-readable)', async () => {
			const playbook = mockPlaybook();
			const agent = mockSession();

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);
			vi.mocked(executePlaybook).mockImplementation(() => {
				throw new Error('Execution failed');
			});

			await expect(runPlaybook('pb-123', {})).rejects.toThrow('process.exit(1)');

			expect(formatError).toHaveBeenCalledWith('Failed to run playbook: Execution failed');
		});

		it('should handle execution errors (JSON)', async () => {
			const playbook = mockPlaybook();
			const agent = mockSession();

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);
			vi.mocked(executePlaybook).mockImplementation(() => {
				throw new Error('Execution failed');
			});

			await expect(runPlaybook('pb-123', { json: true })).rejects.toThrow('process.exit(1)');

			expect(emitError).toHaveBeenCalledWith(
				'Failed to run playbook: Execution failed',
				'EXECUTION_ERROR'
			);
		});

		it('should handle non-Error throws in execution', async () => {
			const playbook = mockPlaybook();
			const agent = mockSession();

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);
			vi.mocked(executePlaybook).mockImplementation(() => {
				throw { message: 'object error' };
			});

			await expect(runPlaybook('pb-123', {})).rejects.toThrow('process.exit(1)');

			expect(formatError).toHaveBeenCalledWith('Failed to run playbook: Unknown error');
		});
	});

	describe('platform-specific paths', () => {
		it('should use correct path on Windows', async () => {
			const playbook = mockPlaybook();
			const agent = mockSession();

			vi.mocked(os.platform).mockReturnValue('win32');
			vi.mocked(os.homedir).mockReturnValue('C:\\Users\\test');

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);
			vi.mocked(fs.readFileSync).mockReturnValue(
				JSON.stringify({
					sessions: [{ id: 'agent-1', state: 'busy' }],
				})
			);

			await expect(runPlaybook('pb-123', {})).rejects.toThrow('process.exit(1)');

			// The path checking happens inside isSessionBusyInDesktop
			// We can verify it ran by checking the error is about busy agent
			expect(formatError).toHaveBeenCalledWith(expect.stringContaining('Busy in desktop app'));
		});

		it('should use correct path on Linux', async () => {
			const playbook = mockPlaybook();
			const agent = mockSession();

			vi.mocked(os.platform).mockReturnValue('linux');
			vi.mocked(os.homedir).mockReturnValue('/home/test');

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);
			vi.mocked(fs.readFileSync).mockReturnValue(
				JSON.stringify({
					sessions: [{ id: 'agent-1', state: 'busy' }],
				})
			);

			await expect(runPlaybook('pb-123', {})).rejects.toThrow('process.exit(1)');

			expect(formatError).toHaveBeenCalledWith(expect.stringContaining('Busy in desktop app'));
		});

		it('should use XDG_CONFIG_HOME on Linux if set', async () => {
			const playbook = mockPlaybook();
			const agent = mockSession();

			const originalEnv = process.env.XDG_CONFIG_HOME;
			process.env.XDG_CONFIG_HOME = '/custom/config';

			vi.mocked(os.platform).mockReturnValue('linux');
			vi.mocked(os.homedir).mockReturnValue('/home/test');

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);
			vi.mocked(fs.readFileSync).mockReturnValue(
				JSON.stringify({
					sessions: [{ id: 'agent-1', state: 'busy' }],
				})
			);

			await expect(runPlaybook('pb-123', {})).rejects.toThrow('process.exit(1)');

			expect(formatError).toHaveBeenCalledWith(expect.stringContaining('Busy in desktop app'));

			// Clean up
			if (originalEnv === undefined) {
				delete process.env.XDG_CONFIG_HOME;
			} else {
				process.env.XDG_CONFIG_HOME = originalEnv;
			}
		});

		it('should use APPDATA on Windows if set', async () => {
			const playbook = mockPlaybook();
			const agent = mockSession();

			const originalEnv = process.env.APPDATA;
			process.env.APPDATA = 'D:\\CustomAppData';

			vi.mocked(os.platform).mockReturnValue('win32');
			vi.mocked(os.homedir).mockReturnValue('C:\\Users\\test');

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);
			vi.mocked(fs.readFileSync).mockReturnValue(
				JSON.stringify({
					sessions: [{ id: 'agent-1', state: 'busy' }],
				})
			);

			await expect(runPlaybook('pb-123', {})).rejects.toThrow('process.exit(1)');

			expect(formatError).toHaveBeenCalledWith(expect.stringContaining('Busy in desktop app'));

			// Clean up
			if (originalEnv === undefined) {
				delete process.env.APPDATA;
			} else {
				process.env.APPDATA = originalEnv;
			}
		});
	});

	describe('edge cases', () => {
		it('should handle agent with state not "busy" (not busy)', async () => {
			const playbook = mockPlaybook();
			const agent = mockSession();

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);
			vi.mocked(fs.readFileSync).mockReturnValue(
				JSON.stringify({
					sessions: [{ id: 'agent-1', state: 'idle' }],
				})
			);
			vi.mocked(executePlaybook).mockReturnValue(mockEventGenerator([]));

			await runPlaybook('pb-123', {});

			expect(executePlaybook).toHaveBeenCalled();
		});

		it('should handle agent not in sessions list (not busy)', async () => {
			const playbook = mockPlaybook();
			const agent = mockSession();

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);
			vi.mocked(fs.readFileSync).mockReturnValue(
				JSON.stringify({
					sessions: [{ id: 'other-agent', state: 'busy' }],
				})
			);
			vi.mocked(executePlaybook).mockReturnValue(mockEventGenerator([]));

			await runPlaybook('pb-123', {});

			expect(executePlaybook).toHaveBeenCalled();
		});

		it('should handle empty sessions in file', async () => {
			const playbook = mockPlaybook();
			const agent = mockSession();

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);
			vi.mocked(fs.readFileSync).mockReturnValue(
				JSON.stringify({
					sessions: [],
				})
			);
			vi.mocked(executePlaybook).mockReturnValue(mockEventGenerator([]));

			await runPlaybook('pb-123', {});

			expect(executePlaybook).toHaveBeenCalled();
		});

		it('should handle playbook with multiple documents', async () => {
			const playbook = mockPlaybook({
				documents: [
					{ filename: 'doc1.md', resetOnCompletion: false },
					{ filename: 'doc2.md', resetOnCompletion: true },
					{ filename: 'doc3.md', resetOnCompletion: false },
				],
			});
			const agent = mockSession();

			vi.mocked(findPlaybookById).mockReturnValue({ playbook, agentId: 'agent-1' });
			vi.mocked(getSessionById).mockReturnValue(agent);
			vi.mocked(executePlaybook).mockReturnValue(mockEventGenerator([]));

			await runPlaybook('pb-123', {});

			expect(formatInfo).toHaveBeenCalledWith('Documents: 3');
		});
	});
});

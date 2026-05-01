import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AgentDispatchFleetEntry } from '../../../shared/agent-dispatch-types';
import type { WorkItem, WorkItemClaim } from '../../../shared/work-graph-types';
import type { AutoPickupExecution } from '../../../main/agent-dispatch/dispatch-engine';
import type { SshRemoteSettingsStore } from '../../../main/utils/ssh-remote-resolver';
import type { SshRemoteConfig } from '../../../shared/types';

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted() ensures variables are available inside vi.mock factories
// ---------------------------------------------------------------------------

const { mockInvokeRunnerScript, mockResolveRunnerScriptPath, mockAccessSync } = vi.hoisted(() => ({
	mockInvokeRunnerScript: vi.fn(),
	mockResolveRunnerScriptPath: vi.fn(() => '/opt/maestro-local-tools/symphony-fork-runner/run.sh'),
	mockAccessSync: vi.fn(),
}));

vi.mock('../../../main/agent-dispatch/runner-script-bridge', () => ({
	invokeRunnerScript: mockInvokeRunnerScript,
	resolveRunnerScriptPath: mockResolveRunnerScriptPath,
	DEFAULT_RUNNER_SCRIPT_DIR: '/opt/maestro-local-tools/symphony-fork-runner',
	createSshRemoteStoreAdapter: (store: unknown) => store,
}));

vi.mock('fs', async (importOriginal) => {
	const original = await importOriginal<typeof import('fs')>();
	return {
		...original,
		accessSync: mockAccessSync,
	};
});

// ---------------------------------------------------------------------------
// Subject under test (imported after mocks are hoisted)
// ---------------------------------------------------------------------------

import {
	createExecutorBridge,
	isWorktreeOwned,
	getWorktreeOwnership,
	releaseWorktreeOwnership,
	listWorktreeOwnerships,
	DEFAULT_RUNNER_SCRIPT_DIR,
} from '../../../main/agent-dispatch/executor-bridge';
import type { AutoRunTrigger } from '../../../main/agent-dispatch/executor-bridge';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeFleetEntry(overrides: Partial<AgentDispatchFleetEntry> = {}): AgentDispatchFleetEntry {
	return {
		id: 'session-1',
		agentId: 'claude-code',
		sessionId: 'session-1',
		providerSessionId: 'provider-1',
		displayName: 'Claude Code Agent',
		providerType: 'claude-code',
		host: 'local',
		locality: 'local',
		readiness: 'idle',
		currentClaims: [],
		currentLoad: 0,
		dispatchCapabilities: ['code', 'review'],
		dispatchProfile: {
			autoPickupEnabled: true,
			capabilityTags: ['code', 'review'],
			maxConcurrentClaims: 1,
		},
		pickupEnabled: true,
		updatedAt: '2026-04-30T10:00:00.000Z',
		...overrides,
	};
}

function makeSshFleetEntry(sshRemoteId = 'remote-1'): AgentDispatchFleetEntry {
	return makeFleetEntry({
		id: 'ssh-session-1',
		sessionId: 'ssh-session-1',
		locality: 'ssh',
		host: 'dev.example.com',
		sshRemote: {
			id: sshRemoteId,
			name: 'Dev Server',
			host: 'dev.example.com',
			enabled: true,
			source: 'session.sshRemoteId',
		},
	});
}

function makeWorkItem(overrides: Partial<WorkItem> = {}): WorkItem {
	return {
		id: 'work-1',
		type: 'task',
		status: 'claimed',
		title: 'Implement feature X',
		description: 'Add the X feature to the codebase',
		projectPath: '/repo',
		gitPath: '/repo',
		source: 'manual',
		readonly: false,
		tags: ['agent-ready', 'code'],
		createdAt: '2026-04-30T10:00:00.000Z',
		updatedAt: '2026-04-30T10:00:00.000Z',
		claim: {
			id: 'claim-1',
			workItemId: 'work-1',
			owner: {
				type: 'agent',
				id: 'session-1',
				agentId: 'claude-code',
			},
			status: 'active',
			source: 'auto-pickup',
			claimedAt: '2026-04-30T11:00:00.000Z',
		} as WorkItemClaim,
		...overrides,
	};
}

function makeExecution(
	entry: AgentDispatchFleetEntry = makeFleetEntry(),
	workItem: WorkItem = makeWorkItem()
): AutoPickupExecution {
	return {
		decision: {
			agent: entry,
			workItem,
			owner: {
				type: 'agent',
				id: entry.id,
				agentId: entry.agentId,
			},
			capabilityOverlap: ['code'],
			loadBeforeAssignment: 0,
			capacityBeforeAssignment: 1,
		},
		claimedItem: workItem,
	};
}

function defaultRunnerSuccess() {
	mockInvokeRunnerScript.mockResolvedValue({
		success: true,
		exitCode: 0,
		stdout: '',
		stderr: '',
		scriptPath: '/opt/maestro-local-tools/symphony-fork-runner/run.sh',
		usedSsh: false,
	});
}

function clearOwnership() {
	for (const rec of listWorktreeOwnerships()) {
		releaseWorktreeOwnership(rec.workItemId, rec.agentId);
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExecutorBridge — routing', () => {
	beforeEach(() => {
		clearOwnership();
		vi.clearAllMocks();
		mockAccessSync.mockReturnValue(undefined); // script exists
		defaultRunnerSuccess();
	});

	it('routes to runner script when no autoRunTrigger is provided', async () => {
		const bridge = createExecutorBridge({});
		const entry = makeFleetEntry();
		const workItem = makeWorkItem();

		await bridge.execute(makeExecution(entry, workItem));

		expect(mockInvokeRunnerScript).toHaveBeenCalledWith(
			entry,
			workItem,
			expect.objectContaining({ sshStore: undefined })
		);
	});

	it('routes to Auto Run when autoRunTrigger is provided and sessionId is set', async () => {
		const triggerAutoRun = vi.fn().mockResolvedValue(true);
		const autoRunTrigger: AutoRunTrigger = { triggerAutoRun };

		const bridge = createExecutorBridge({ autoRunTrigger });
		await bridge.execute(makeExecution());

		expect(triggerAutoRun).toHaveBeenCalledWith(
			'session-1',
			'work-1',
			expect.objectContaining({
				workItemTitle: 'Implement feature X',
				workItemProjectPath: '/repo',
				capabilityTags: ['code', 'review'],
			})
		);
		// Runner script should NOT have been called
		expect(mockInvokeRunnerScript).not.toHaveBeenCalled();
	});

	it('falls through to runner script when Auto Run trigger returns false', async () => {
		const triggerAutoRun = vi.fn().mockResolvedValue(false);
		const bridge = createExecutorBridge({ autoRunTrigger: { triggerAutoRun } });

		await bridge.execute(makeExecution());

		expect(mockInvokeRunnerScript).toHaveBeenCalledTimes(1);
	});

	it('falls through to runner script when Auto Run trigger throws', async () => {
		const triggerAutoRun = vi.fn().mockRejectedValue(new Error('session busy'));
		const bridge = createExecutorBridge({ autoRunTrigger: { triggerAutoRun } });

		await bridge.execute(makeExecution());

		expect(mockInvokeRunnerScript).toHaveBeenCalledTimes(1);
	});

	it('routes to runner script when autoRunTrigger provided but sessionId is absent', async () => {
		const triggerAutoRun = vi.fn();
		const bridge = createExecutorBridge({ autoRunTrigger: { triggerAutoRun } });
		const entry = makeFleetEntry({ sessionId: undefined });

		await bridge.execute(makeExecution(entry));

		expect(triggerAutoRun).not.toHaveBeenCalled();
		expect(mockInvokeRunnerScript).toHaveBeenCalledTimes(1);
	});
});

describe('ExecutorBridge — SSH config passthrough', () => {
	beforeEach(() => {
		clearOwnership();
		vi.clearAllMocks();
		mockAccessSync.mockReturnValue(undefined);
		defaultRunnerSuccess();
	});

	it('passes the sshStore to invokeRunnerScript for SSH-remote fleet entries', async () => {
		const sshStore: SshRemoteSettingsStore = {
			getSshRemotes: (): SshRemoteConfig[] => [
				{
					id: 'remote-1',
					name: 'Dev Server',
					host: 'dev.example.com',
					username: 'ubuntu',
					enabled: true,
					keyPath: '~/.ssh/id_rsa',
					port: 22,
				},
			],
		};

		const bridge = createExecutorBridge({ sshStore });
		const entry = makeSshFleetEntry('remote-1');

		await bridge.execute(makeExecution(entry));

		expect(mockInvokeRunnerScript).toHaveBeenCalledWith(
			entry,
			expect.anything(),
			expect.objectContaining({ sshStore })
		);
	});

	it('records usedSsh=true in ownership when locality is ssh', async () => {
		let capturedOwnership: ReturnType<typeof getWorktreeOwnership> | undefined;

		mockInvokeRunnerScript.mockImplementation(
			async (entry: AgentDispatchFleetEntry, workItem: WorkItem) => {
				capturedOwnership = getWorktreeOwnership(workItem.id, entry.agentId);
				return {
					success: true,
					exitCode: 0,
					stdout: '',
					stderr: '',
					scriptPath: '/opt/maestro-local-tools/symphony-fork-runner/run.sh',
					usedSsh: true,
				};
			}
		);

		const bridge = createExecutorBridge({});
		const entry = makeSshFleetEntry('remote-1');
		await bridge.execute(makeExecution(entry));

		expect(capturedOwnership).toBeDefined();
		expect(capturedOwnership!.usedSsh).toBe(true);
	});
});

describe('ExecutorBridge — worktree ownership', () => {
	beforeEach(() => {
		clearOwnership();
		vi.clearAllMocks();
		mockAccessSync.mockReturnValue(undefined);
		defaultRunnerSuccess();
	});

	it('records ownership for the duration of execution and releases afterward', async () => {
		let ownershipDuringExec: ReturnType<typeof getWorktreeOwnership> | undefined;

		mockInvokeRunnerScript.mockImplementation(
			async (entry: AgentDispatchFleetEntry, workItem: WorkItem) => {
				ownershipDuringExec = getWorktreeOwnership(workItem.id, entry.agentId);
				return {
					success: true,
					exitCode: 0,
					stdout: '',
					stderr: '',
					scriptPath: '/opt/maestro-local-tools/symphony-fork-runner/run.sh',
					usedSsh: false,
				};
			}
		);

		const bridge = createExecutorBridge({});
		await bridge.execute(makeExecution());

		expect(ownershipDuringExec).toBeDefined();
		expect(ownershipDuringExec!.workItemId).toBe('work-1');
		expect(ownershipDuringExec!.agentId).toBe('claude-code');
		expect(ownershipDuringExec!.executionMode).toBe('runner-script');

		// Ownership released after execute resolves
		expect(isWorktreeOwned('work-1', 'claude-code')).toBe(false);
	});

	it('releases ownership even when runner promise rejects', async () => {
		mockInvokeRunnerScript.mockRejectedValue(new Error('process crashed'));

		const bridge = createExecutorBridge({});

		await expect(bridge.execute(makeExecution())).rejects.toThrow('process crashed');
		expect(isWorktreeOwned('work-1', 'claude-code')).toBe(false);
	});

	it('skips duplicate execution for an already-owned (workItemId, agentId) pair', async () => {
		let resolveFirst!: () => void;
		let runnerCallCount = 0;

		mockInvokeRunnerScript.mockImplementation(async () => {
			runnerCallCount++;
			// Hold the first execution open until we manually resolve
			await new Promise<void>((res) => {
				resolveFirst = res;
			});
			return {
				success: true,
				exitCode: 0,
				stdout: '',
				stderr: '',
				scriptPath: '/opt/maestro-local-tools/symphony-fork-runner/run.sh',
				usedSsh: false,
			};
		});

		const bridge = createExecutorBridge({});
		// Start first execution (does not await — it's in-flight)
		const first = bridge.execute(makeExecution());
		// Give the first execute time to register ownership before we fire the second
		await Promise.resolve();
		await Promise.resolve();

		// Second attempt with same (workItemId, agentId) — should be skipped
		await bridge.execute(makeExecution());

		// Now let the first finish
		resolveFirst!();
		await first;

		expect(runnerCallCount).toBe(1);
	});

	it('bridge.getOwnership reflects in-flight ownership', async () => {
		let captured: ReturnType<typeof getWorktreeOwnership> | undefined;

		mockInvokeRunnerScript.mockImplementation(
			async (entry: AgentDispatchFleetEntry, workItem: WorkItem) => {
				captured = getWorktreeOwnership(workItem.id, entry.agentId);
				return {
					success: true,
					exitCode: 0,
					stdout: '',
					stderr: '',
					scriptPath: '/opt/maestro-local-tools/symphony-fork-runner/run.sh',
					usedSsh: false,
				};
			}
		);

		const bridge = createExecutorBridge({});
		await bridge.execute(makeExecution());

		expect(captured).toEqual(
			expect.objectContaining({
				workItemId: 'work-1',
				agentId: 'claude-code',
				executionMode: 'runner-script',
			})
		);
	});
});

describe('ExecutorBridge — runner failure handling', () => {
	beforeEach(() => {
		clearOwnership();
		vi.clearAllMocks();
		mockAccessSync.mockReturnValue(undefined);
	});

	it('does not throw when runner script exits with non-zero code', async () => {
		mockInvokeRunnerScript.mockResolvedValue({
			success: false,
			exitCode: 1,
			stdout: '',
			stderr: 'Build failed',
			scriptPath: '/opt/maestro-local-tools/symphony-fork-runner/run.sh',
			usedSsh: false,
		});

		const bridge = createExecutorBridge({});
		await expect(bridge.execute(makeExecution())).resolves.toBeUndefined();
	});

	it('does not call runner when script file does not exist locally', async () => {
		mockAccessSync.mockImplementation(() => {
			throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
		});

		const bridge = createExecutorBridge({});
		await bridge.execute(makeExecution());

		// Runner should not have been called (ENOENT short-circuit)
		expect(mockInvokeRunnerScript).not.toHaveBeenCalled();
	});

	it('retains the claim (does not rethrow) on runner script failure', async () => {
		mockInvokeRunnerScript.mockResolvedValue({
			success: false,
			exitCode: 127,
			stdout: '',
			stderr: 'command not found',
			scriptPath: '/opt/maestro-local-tools/symphony-fork-runner/run.sh',
			usedSsh: false,
		});

		const bridge = createExecutorBridge({});
		// Should resolve cleanly — caller handles claim retention
		await expect(bridge.execute(makeExecution())).resolves.toBeUndefined();
	});
});

describe('ExecutorBridge — ownership public API', () => {
	beforeEach(() => {
		clearOwnership();
		vi.clearAllMocks();
		mockAccessSync.mockReturnValue(undefined);
		defaultRunnerSuccess();
	});

	it('isWorktreeOwned returns false before and after execution', async () => {
		expect(isWorktreeOwned('work-1', 'claude-code')).toBe(false);

		const bridge = createExecutorBridge({});
		await bridge.execute(makeExecution());

		expect(isWorktreeOwned('work-1', 'claude-code')).toBe(false);
	});

	it('listWorktreeOwnerships returns a snapshot copy', () => {
		const snap = listWorktreeOwnerships();
		expect(Array.isArray(snap)).toBe(true);
		expect(snap).toHaveLength(0);
	});

	it('releaseWorktreeOwnership returns false when key not present', () => {
		expect(releaseWorktreeOwnership('nonexistent', 'some-agent')).toBe(false);
	});
});

describe('ExecutorBridge — DEFAULT_RUNNER_SCRIPT_DIR export', () => {
	it('exports the expected default runner script directory', () => {
		expect(DEFAULT_RUNNER_SCRIPT_DIR).toBe('/opt/maestro-local-tools/symphony-fork-runner');
	});
});

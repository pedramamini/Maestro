/**
 * Tests for inlineWizardDocumentGeneration.ts - Playbook defaults
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_AUTORUN_SKILLS } from '../../../shared/playbookDag';
import { useSessionStore } from '../../../renderer/stores/sessionStore';

let capturedDataCallback: ((sessionId: string, data: string) => void) | null = null;
let capturedExitCallback: ((sessionId: string, code: number) => void) | null = null;

const mockMaestro = {
	agents: {
		get: vi.fn(),
	},
	process: {
		spawn: vi.fn(),
		onData: vi.fn((callback: (sessionId: string, data: string) => void) => {
			capturedDataCallback = callback;
			return vi.fn();
		}),
		onExit: vi.fn((callback: (sessionId: string, code: number) => void) => {
			capturedExitCallback = callback;
			return vi.fn();
		}),
		kill: vi.fn().mockResolvedValue(undefined),
	},
	autorun: {
		watchFolder: vi.fn().mockResolvedValue({ success: true }),
		unwatchFolder: vi.fn().mockResolvedValue({ success: true }),
		onFileChanged: vi.fn(() => vi.fn()),
		listDocs: vi.fn().mockResolvedValue({ success: true, tree: [] }),
		writeDoc: vi.fn().mockResolvedValue({ success: true }),
	},
	projectMemory: {
		getSnapshot: vi.fn().mockResolvedValue({
			success: true,
			snapshot: null,
		}),
		validateState: vi.fn().mockResolvedValue({
			success: true,
			report: {
				ok: true,
				projectId: 'maestro',
				taskCount: 0,
				bindingCount: 0,
				runtimeCount: 0,
				taskLockCount: 0,
				worktreeLockCount: 0,
				expiredTaskLockCount: 0,
				expiredWorktreeLockCount: 0,
				issues: [],
			},
		}),
	},
	playbooks: {
		create: vi.fn().mockResolvedValue({
			success: true,
			playbook: { id: 'playbook-123', name: 'Token Efficiency' },
		}),
	},
};

vi.stubGlobal('window', { maestro: mockMaestro });

import { generateInlineDocuments } from '../../../renderer/services/inlineWizardDocumentGeneration';

describe('inlineWizardDocumentGeneration - Playbook defaults', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		capturedDataCallback = null;
		capturedExitCallback = null;
		mockMaestro.projectMemory.getSnapshot.mockResolvedValue({
			success: true,
			snapshot: null,
		});
		mockMaestro.projectMemory.validateState.mockResolvedValue({
			success: true,
			report: {
				ok: true,
				projectId: 'maestro',
				taskCount: 0,
				bindingCount: 0,
				runtimeCount: 0,
				taskLockCount: 0,
				worktreeLockCount: 0,
				expiredTaskLockCount: 0,
				expiredWorktreeLockCount: 0,
				issues: [],
			},
		});
		useSessionStore.setState({ sessions: [], activeSessionId: '' });
	});

	it('should create wizard playbooks with compact Auto Run defaults', async () => {
		mockMaestro.agents.get.mockResolvedValue({
			id: 'opencode',
			available: true,
			command: 'opencode',
			args: [],
		});
		mockMaestro.process.spawn.mockResolvedValue(undefined);

		const generationPromise = generateInlineDocuments({
			agentType: 'opencode',
			directoryPath: '/test/project',
			projectName: 'Token Efficiency',
			conversationHistory: [],
			mode: 'new',
			autoRunFolderPath: '/test/project/Auto Run Docs',
			sessionId: 'session-123',
		});

		await new Promise((resolve) => setTimeout(resolve, 10));

		const spawnCall = mockMaestro.process.spawn.mock.calls[0][0];
		expect(spawnCall).toBeDefined();
		expect(capturedDataCallback).not.toBeNull();
		expect(capturedExitCallback).not.toBeNull();

		capturedDataCallback?.(
			spawnCall.sessionId,
			[
				'---BEGIN DOCUMENT---',
				'FILENAME: Phase-01-Implementation.md',
				'CONTENT:',
				'# Phase 01',
				'',
				'- [ ] Add compact profile support',
				'---END DOCUMENT---',
			].join('\n')
		);
		capturedExitCallback?.(spawnCall.sessionId, 0);

		const result = await generationPromise;

		expect(result.success).toBe(true);
		expect(mockMaestro.playbooks.create).toHaveBeenCalledWith(
			'session-123',
			expect.objectContaining({
				name: 'Token Efficiency',
				taskTimeoutMs: 60000,
				prompt: '',
				skills: expect.arrayContaining([...DEFAULT_AUTORUN_SKILLS]),
				definitionOfDone: expect.arrayContaining([expect.stringContaining('active checkbox goal')]),
				verificationSteps: expect.arrayContaining([expect.stringContaining('Read CLAUDE.md')]),
				promptProfile: 'full',
				documentContextMode: 'active-task-only',
				skillPromptMode: 'full',
				agentStrategy: 'single',
				projectMemoryExecution: null,
				projectMemoryBindingIntent: null,
			})
		);
	});

	it('should infer a parallel final join graph for integration-style final documents', async () => {
		mockMaestro.agents.get.mockResolvedValue({
			id: 'opencode',
			available: true,
			command: 'opencode',
			args: [],
		});
		mockMaestro.process.spawn.mockResolvedValue(undefined);

		const generationPromise = generateInlineDocuments({
			agentType: 'opencode',
			directoryPath: '/test/project',
			projectName: 'Feature Delivery',
			conversationHistory: [],
			mode: 'new',
			autoRunFolderPath: '/test/project/Auto Run Docs',
			sessionId: 'session-123',
		});

		await new Promise((resolve) => setTimeout(resolve, 10));

		const spawnCall = mockMaestro.process.spawn.mock.calls[0][0];
		expect(spawnCall).toBeDefined();

		capturedDataCallback?.(
			spawnCall.sessionId,
			[
				'---BEGIN DOCUMENT---',
				'FILENAME: Phase-01-Backend.md',
				'CONTENT:',
				'# Backend',
				'',
				'- [ ] Implement API changes',
				'---END DOCUMENT---',
				'',
				'---BEGIN DOCUMENT---',
				'FILENAME: Phase-02-Frontend.md',
				'CONTENT:',
				'# Frontend',
				'',
				'- [ ] Wire the new UI flow',
				'---END DOCUMENT---',
				'',
				'---BEGIN DOCUMENT---',
				'FILENAME: Phase-03-Integration-Review.md',
				'CONTENT:',
				'# Integration Review',
				'',
				'- [ ] Verify the full flow end to end',
				'---END DOCUMENT---',
			].join('\n')
		);
		capturedExitCallback?.(spawnCall.sessionId, 0);

		const result = await generationPromise;

		expect(result.success).toBe(true);
		expect(mockMaestro.playbooks.create).toHaveBeenCalledWith(
			'session-123',
			expect.objectContaining({
				maxParallelism: 2,
				taskGraph: {
					nodes: expect.arrayContaining([
						expect.objectContaining({
							documentIndex: 0,
							dependsOn: [],
						}),
						expect.objectContaining({
							documentIndex: 1,
							dependsOn: [],
						}),
						expect.objectContaining({
							documentIndex: 2,
							dependsOn: expect.arrayContaining([
								'2026-04-04-feature-delivery-phase-01-backend',
								'2026-04-04-feature-delivery-phase-02-frontend',
							]),
						}),
					]),
				},
				projectMemoryExecution: null,
				projectMemoryBindingIntent: null,
			})
		);
	});

	it('should include projectMemoryExecution for codex when exactly one in-progress task is bound', async () => {
		mockMaestro.agents.get.mockResolvedValue({
			id: 'codex',
			available: true,
			command: 'codex',
			args: [],
		});
		mockMaestro.process.spawn.mockResolvedValue(undefined);
		mockMaestro.projectMemory.getSnapshot.mockResolvedValue({
			success: true,
			snapshot: {
				projectId: 'maestro',
				version: '2026-04-04',
				taskCount: 1,
				generatedAt: '2026-04-04T00:00:00.000Z',
				tasks: [
					{
						id: 'PM-01',
						title: 'Inline wizard seed task',
						status: 'in_progress',
						dependsOn: [],
						executionMode: 'shared-serialized',
						bindingMode: 'shared-branch-serialized',
						worktreePath: '/test/project',
						executorState: 'running',
						executorId: 'codex-main',
					},
				],
			},
		});
		mockMaestro.projectMemory.validateState.mockResolvedValue({
			success: true,
			report: {
				ok: true,
				projectId: 'maestro',
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

		const generationPromise = generateInlineDocuments({
			agentType: 'codex',
			directoryPath: '/test/project',
			projectName: 'Project Memory Flow',
			conversationHistory: [],
			mode: 'new',
			autoRunFolderPath: '/test/project/Auto Run Docs',
			sessionId: 'session-123',
		});

		await new Promise((resolve) => setTimeout(resolve, 10));

		const spawnCall = mockMaestro.process.spawn.mock.calls[0][0];
		expect(spawnCall).toBeDefined();

		capturedDataCallback?.(
			spawnCall.sessionId,
			[
				'---BEGIN DOCUMENT---',
				'FILENAME: Phase-01-Execution.md',
				'CONTENT:',
				'# Phase 01',
				'',
				'- [ ] Validate task sync handoff',
				'---END DOCUMENT---',
			].join('\n')
		);
		capturedExitCallback?.(spawnCall.sessionId, 0);

		const result = await generationPromise;

		expect(result.success).toBe(true);
		expect(mockMaestro.projectMemory.getSnapshot).toHaveBeenCalledWith('/test/project');
		expect(mockMaestro.playbooks.create).toHaveBeenCalledWith(
			'session-123',
			expect.objectContaining({
				projectMemoryExecution: {
					repoRoot: '/test/project',
					taskId: 'PM-01',
					executorId: 'codex-main',
				},
				projectMemoryBindingIntent: {
					policyVersion: '2026-04-04',
					repoRoot: '/test/project',
					sourceBranch: 'main',
					bindingPreference: 'shared-branch-serialized',
					sharedCheckoutAllowed: true,
					reuseExistingBinding: true,
					allowRebindIfStale: true,
				},
			})
		);
	});

	it('should create a same-branch saved playbook pack across PM sessions when docs match orchestration lanes', async () => {
		useSessionStore.setState({
			sessions: [
				{ id: 'lead-session', name: 'PM-Lead' } as any,
				{ id: 'desktop-session', name: 'PM-Desktop' } as any,
				{ id: 'cli-session', name: 'PM-CLI' } as any,
				{ id: 'integrator-session', name: 'PM-Integrator' } as any,
			],
			activeSessionId: 'cli-session',
		});
		mockMaestro.agents.get.mockResolvedValue({
			id: 'codex',
			available: true,
			command: 'codex',
			args: [],
		});
		mockMaestro.process.spawn.mockResolvedValue(undefined);

		const generationPromise = generateInlineDocuments({
			agentType: 'codex',
			directoryPath: '/test/project',
			projectName: 'Project Memory Runtime Fast Track',
			conversationHistory: [],
			mode: 'new',
			autoRunFolderPath: '/test/project/Auto Run Docs',
			sessionId: 'cli-session',
		});

		await new Promise((resolve) => setTimeout(resolve, 10));

		const spawnCall = mockMaestro.process.spawn.mock.calls[0][0];
		expect(spawnCall).toBeDefined();

		capturedDataCallback?.(
			spawnCall.sessionId,
			[
				'---BEGIN DOCUMENT---',
				'FILENAME: Phase-01-Runtime-Contract-Freeze.md',
				'CONTENT:',
				'# Contract Freeze',
				'',
				'- [ ] Freeze the runtime contract',
				'---END DOCUMENT---',
				'',
				'---BEGIN DOCUMENT---',
				'FILENAME: Phase-02A-Desktop-Executor-Fail-Closed.md',
				'CONTENT:',
				'# Desktop Lane',
				'',
				'- [ ] Wire desktop fail-closed execution',
				'---END DOCUMENT---',
				'',
				'---BEGIN DOCUMENT---',
				'FILENAME: Phase-02B-CLI-Executor-Fail-Closed.md',
				'CONTENT:',
				'# CLI Lane',
				'',
				'- [ ] Wire CLI fail-closed execution',
				'---END DOCUMENT---',
				'',
				'---BEGIN DOCUMENT---',
				'FILENAME: Phase-03-Shared-Checkout-Runtime-Join.md',
				'CONTENT:',
				'# Join',
				'',
				'- [ ] Integrate the shared runtime flow',
				'---END DOCUMENT---',
			].join('\n')
		);
		capturedExitCallback?.(spawnCall.sessionId, 0);

		const result = await generationPromise;

		expect(result.success).toBe(true);
		expect(mockMaestro.playbooks.create).toHaveBeenCalledTimes(4);
		expect(mockMaestro.playbooks.create).toHaveBeenNthCalledWith(
			1,
			'lead-session',
			expect.objectContaining({ name: 'PM-SB-01 Contract Freeze' })
		);
		expect(mockMaestro.playbooks.create).toHaveBeenNthCalledWith(
			2,
			'desktop-session',
			expect.objectContaining({ name: 'PM-SB-02 Desktop Lane' })
		);
		expect(mockMaestro.playbooks.create).toHaveBeenNthCalledWith(
			3,
			'cli-session',
			expect.objectContaining({ name: 'PM-SB-03 CLI Lane' })
		);
		expect(mockMaestro.playbooks.create).toHaveBeenNthCalledWith(
			4,
			'integrator-session',
			expect.objectContaining({ name: 'PM-SB-05 Shared Runtime Join' })
		);
		expect(result.playbooks).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					sessionId: 'cli-session',
					sessionName: 'PM-CLI',
				}),
			])
		);
		expect(result.playbook).toEqual({
			id: 'playbook-123',
			name: 'Token Efficiency',
		});
	});
});

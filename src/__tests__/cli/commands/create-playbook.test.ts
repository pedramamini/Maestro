import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('fs', () => ({
	existsSync: vi.fn(),
	readdirSync: vi.fn(),
	realpathSync: vi.fn((value: string) => value),
}));

vi.mock('child_process', async (importOriginal) => {
	const actual = await importOriginal<typeof import('child_process')>();
	return {
		default: actual,
		...actual,
		execFileSync: vi.fn(() => 'main\n'),
	};
});

vi.mock('../../../cli/services/storage', () => ({
	resolveAgentId: vi.fn((id: string) => id),
	getSessionById: vi.fn(),
}));

vi.mock('../../../cli/services/playbooks', () => ({
	readPlaybooks: vi.fn(),
	resolvePlaybooksFilePath: vi.fn(),
	writePlaybooks: vi.fn(),
}));

vi.mock('../../../cli/output/formatter', () => ({
	formatError: vi.fn((message: string) => `Error: ${message}`),
}));

import * as fs from 'fs';
import { createPlaybook } from '../../../cli/commands/create-playbook';
import { formatError } from '../../../cli/output/formatter';
import {
	readPlaybooks,
	resolvePlaybooksFilePath,
	writePlaybooks,
} from '../../../cli/services/playbooks';
import { getSessionById, resolveAgentId } from '../../../cli/services/storage';
import type { Playbook, SessionInfo } from '../../../shared/types';

describe('create-playbook command', () => {
	let consoleLogSpy: ReturnType<typeof vi.spyOn>;
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
	let processExitSpy: ReturnType<typeof vi.spyOn>;

	const mockSession = (overrides: Partial<SessionInfo> = {}): SessionInfo => ({
		id: 'agent-1',
		name: 'Test Agent',
		toolType: 'codex',
		cwd: '/repo',
		autoRunFolderPath: '/repo/Auto Run Docs',
		...overrides,
	});

	const mockPlaybook = (overrides: Partial<Playbook> = {}): Playbook => ({
		id: 'pb-existing',
		name: 'Existing Playbook',
		documents: [{ filename: 'existing.md', resetOnCompletion: false }],
		loopEnabled: false,
		maxLoops: null,
		createdAt: 1,
		updatedAt: 1,
		prompt: '',
		skills: [],
		definitionOfDone: [],
		verificationSteps: [],
		promptProfile: 'compact-code',
		documentContextMode: 'active-task-only',
		skillPromptMode: 'brief',
		agentStrategy: 'single',
		maxParallelism: null,
		...overrides,
	});

	beforeEach(() => {
		vi.clearAllMocks();
		consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		processExitSpy = vi
			.spyOn(process, 'exit')
			.mockImplementation((code?: string | number | null | undefined) => {
				throw new Error(`process.exit(${code})`);
			});

		vi.mocked(resolveAgentId).mockReturnValue('agent-1');
		vi.mocked(getSessionById).mockReturnValue(mockSession());
		vi.mocked(readPlaybooks).mockReturnValue([]);
		vi.mocked(resolvePlaybooksFilePath).mockReturnValue('/config/playbooks/agent-1.json');
		vi.mocked(fs.existsSync).mockReturnValue(true);
	});

	afterEach(() => {
		consoleLogSpy.mockRestore();
		consoleErrorSpy.mockRestore();
		processExitSpy.mockRestore();
	});

	it('creates a playbook from explicit docs and writes it to storage', () => {
		createPlaybook('My Playbook', {
			agent: 'agent-1',
			docs: 'intro,checklist.md',
			prompt: 'Run the tasks',
		});

		expect(writePlaybooks).toHaveBeenCalledTimes(1);
		expect(writePlaybooks).toHaveBeenCalledWith(
			'agent-1',
			expect.arrayContaining([
				expect.objectContaining({
					name: 'My Playbook',
					prompt: 'Run the tasks',
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
						{ filename: 'intro.md', resetOnCompletion: false },
						{ filename: 'checklist.md', resetOnCompletion: false },
					],
				}),
			])
		);
		expect(consoleLogSpy).toHaveBeenCalledWith('Created playbook "My Playbook" for Test Agent.');
	});

	it('returns dry-run JSON without writing files', () => {
		createPlaybook('Dry Run Playbook', {
			agent: 'agent-1',
			docs: 'phase-1',
			prompt: 'Do it',
			dryRun: true,
			json: true,
		});

		expect(writePlaybooks).not.toHaveBeenCalled();
		expect(consoleLogSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(String(consoleLogSpy.mock.calls[0][0]));
		expect(output.status).toBe('dry-run');
		expect(output.agentId).toBe('agent-1');
		expect(output.playbook.name).toBe('Dry Run Playbook');
		expect(output.playbook.documents).toEqual([
			{ filename: 'phase-1.md', resetOnCompletion: false },
		]);
	});

	it('rejects duplicate playbook names unless force is enabled', () => {
		vi.mocked(readPlaybooks).mockReturnValue([mockPlaybook({ name: 'Existing Playbook' })]);

		expect(() =>
			createPlaybook('Existing Playbook', {
				agent: 'agent-1',
				docs: 'phase-1',
			})
		).toThrow('process.exit(1)');

		expect(formatError).toHaveBeenCalledWith(
			'Failed to create playbook: Playbook already exists: Existing Playbook. Use --force to overwrite.'
		);
		expect(writePlaybooks).not.toHaveBeenCalled();
	});

	it('supports the agi-way template and merges description into prompt', () => {
		createPlaybook('Template Playbook', {
			agent: 'agent-1',
			docs: 'phase-1',
			template: 'agi-way',
			description: 'Important context',
		});

		expect(writePlaybooks).toHaveBeenCalledWith(
			'agent-1',
			expect.arrayContaining([
				expect.objectContaining({
					prompt:
						'Goal-driven execution. One checkbox, one outcome. Follow playbook docs.\n\nDescription: Important context',
				}),
			])
		);
	});

	it('defaults Codex playbooks to a compact-code prompt when prompt is omitted', () => {
		createPlaybook('Default Prompt Playbook', {
			agent: 'agent-1',
			docs: 'phase-1',
		});

		expect(writePlaybooks).toHaveBeenCalledWith(
			'agent-1',
			expect.arrayContaining([
				expect.objectContaining({
					prompt: expect.stringContaining('Complete only the next active unchecked task.'),
				}),
			])
		);
	});

	it('uses the session projectRoot when present for project memory binding intent', () => {
		vi.mocked(getSessionById).mockReturnValue(mockSession({ projectRoot: '/repo-root' }));
		vi.mocked(fs.realpathSync).mockReturnValue('/real/repo-root');

		createPlaybook('Project Root Playbook', {
			agent: 'agent-1',
			docs: 'phase-1',
			prompt: 'Run the tasks',
		});

		expect(writePlaybooks).toHaveBeenCalledWith(
			'agent-1',
			expect.arrayContaining([
				expect.objectContaining({
					projectMemoryBindingIntent: expect.objectContaining({
						repoRoot: '/real/repo-root',
					}),
				}),
			])
		);
	});
});

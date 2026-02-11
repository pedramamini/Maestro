/**
 * Tests for src/main/vibes/instrumenters/maestro-instrumenter.ts
 * Validates the Maestro orchestration instrumenter: agent spawn/complete handling,
 * batch run start/complete handling, prompt capture gating by assurance level,
 * and inactive/unknown session guards.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

import { MaestroInstrumenter } from '../../../main/vibes/instrumenters/maestro-instrumenter';
import { VibesSessionManager } from '../../../main/vibes/vibes-session';
import { readVibesManifest, ensureAuditDir } from '../../../main/vibes/vibes-io';
import type {
	VibesCommandEntry,
	VibesPromptEntry,
} from '../../../shared/vibes-types';

// ============================================================================
// Test Suite
// ============================================================================

describe('maestro-instrumenter', () => {
	const FIXED_ISO = '2026-02-10T12:00:00.000Z';
	let tmpDir: string;
	let manager: VibesSessionManager;

	beforeEach(async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(FIXED_ISO));
		tmpDir = await mkdtemp(path.join(os.tmpdir(), 'vibes-maestro-test-'));
		await ensureAuditDir(tmpDir);
		manager = new VibesSessionManager();
	});

	afterEach(async () => {
		vi.useRealTimers();
		await rm(tmpDir, { recursive: true, force: true });
	});

	/**
	 * Helper: start a Maestro session and set up the environment hash.
	 */
	async function setupSession(
		sessionId: string,
		assuranceLevel: 'low' | 'medium' | 'high' = 'medium',
	) {
		const state = await manager.startSession(sessionId, tmpDir, 'maestro', assuranceLevel);
		state.environmentHash = 'e'.repeat(64);
		return state;
	}

	// ========================================================================
	// handleAgentSpawn
	// ========================================================================
	describe('handleAgentSpawn', () => {
		it('should create a command manifest entry for agent dispatch', async () => {
			await setupSession('maestro-1');
			const instrumenter = new MaestroInstrumenter({
				sessionManager: manager,
				assuranceLevel: 'medium',
			});

			await instrumenter.handleAgentSpawn({
				maestroSessionId: 'maestro-1',
				agentSessionId: 'agent-abc',
				agentType: 'claude-code',
				projectPath: '/home/user/project',
			});

			const manifest = await readVibesManifest(tmpDir);
			const entries = Object.values(manifest.entries);
			const cmdEntries = entries.filter((e) => e.type === 'command') as VibesCommandEntry[];
			expect(cmdEntries).toHaveLength(1);
			expect(cmdEntries[0].command_type).toBe('tool_use');
			expect(cmdEntries[0].command_text).toContain('dispatch claude-code agent');
			expect(cmdEntries[0].command_text).toContain('agent-abc');
			expect(cmdEntries[0].working_directory).toBe('/home/user/project');
		});

		it('should create a prompt entry for task description at Medium assurance', async () => {
			await setupSession('maestro-1', 'medium');
			const instrumenter = new MaestroInstrumenter({
				sessionManager: manager,
				assuranceLevel: 'medium',
			});

			await instrumenter.handleAgentSpawn({
				maestroSessionId: 'maestro-1',
				agentSessionId: 'agent-abc',
				agentType: 'claude-code',
				taskDescription: 'Fix the login page bug',
				projectPath: '/home/user/project',
			});

			const manifest = await readVibesManifest(tmpDir);
			const entries = Object.values(manifest.entries);
			const promptEntries = entries.filter(
				(e) => e.type === 'prompt',
			) as VibesPromptEntry[];
			expect(promptEntries).toHaveLength(1);
			expect(promptEntries[0].prompt_text).toBe('Fix the login page bug');
			expect(promptEntries[0].prompt_type).toBe('user_instruction');
		});

		it('should create a prompt entry for task description at High assurance', async () => {
			await setupSession('maestro-1', 'high');
			const instrumenter = new MaestroInstrumenter({
				sessionManager: manager,
				assuranceLevel: 'high',
			});

			await instrumenter.handleAgentSpawn({
				maestroSessionId: 'maestro-1',
				agentSessionId: 'agent-abc',
				agentType: 'codex',
				taskDescription: 'Implement caching layer',
				projectPath: '/home/user/project',
			});

			const manifest = await readVibesManifest(tmpDir);
			const entries = Object.values(manifest.entries);
			const promptEntries = entries.filter((e) => e.type === 'prompt');
			expect(promptEntries).toHaveLength(1);
		});

		it('should NOT create a prompt entry at Low assurance', async () => {
			await setupSession('maestro-1', 'low');
			const instrumenter = new MaestroInstrumenter({
				sessionManager: manager,
				assuranceLevel: 'low',
			});

			await instrumenter.handleAgentSpawn({
				maestroSessionId: 'maestro-1',
				agentSessionId: 'agent-abc',
				agentType: 'claude-code',
				taskDescription: 'This prompt should be skipped',
				projectPath: '/home/user/project',
			});

			const manifest = await readVibesManifest(tmpDir);
			const entries = Object.values(manifest.entries);
			const promptEntries = entries.filter((e) => e.type === 'prompt');
			expect(promptEntries).toHaveLength(0);
			// But command entry should still be created
			const cmdEntries = entries.filter((e) => e.type === 'command');
			expect(cmdEntries).toHaveLength(1);
		});

		it('should NOT create a prompt entry when taskDescription is undefined', async () => {
			await setupSession('maestro-1', 'medium');
			const instrumenter = new MaestroInstrumenter({
				sessionManager: manager,
				assuranceLevel: 'medium',
			});

			await instrumenter.handleAgentSpawn({
				maestroSessionId: 'maestro-1',
				agentSessionId: 'agent-abc',
				agentType: 'claude-code',
				projectPath: '/home/user/project',
			});

			const manifest = await readVibesManifest(tmpDir);
			const entries = Object.values(manifest.entries);
			const promptEntries = entries.filter((e) => e.type === 'prompt');
			expect(promptEntries).toHaveLength(0);
		});

		it('should be a no-op for unknown session IDs', async () => {
			const instrumenter = new MaestroInstrumenter({
				sessionManager: manager,
				assuranceLevel: 'medium',
			});

			await instrumenter.handleAgentSpawn({
				maestroSessionId: 'nonexistent',
				agentSessionId: 'agent-abc',
				agentType: 'claude-code',
				projectPath: '/home/user/project',
			});

			const manifest = await readVibesManifest(tmpDir);
			expect(Object.keys(manifest.entries)).toHaveLength(0);
		});

		it('should be a no-op for inactive sessions', async () => {
			await setupSession('maestro-1');
			await manager.endSession('maestro-1');

			const instrumenter = new MaestroInstrumenter({
				sessionManager: manager,
				assuranceLevel: 'medium',
			});

			await instrumenter.handleAgentSpawn({
				maestroSessionId: 'maestro-1',
				agentSessionId: 'agent-abc',
				agentType: 'claude-code',
				projectPath: '/home/user/project',
			});

			const manifest = await readVibesManifest(tmpDir);
			expect(Object.keys(manifest.entries)).toHaveLength(0);
		});
	});

	// ========================================================================
	// handleAgentComplete
	// ========================================================================
	describe('handleAgentComplete', () => {
		it('should create a command entry for successful agent completion', async () => {
			await setupSession('maestro-1');
			const instrumenter = new MaestroInstrumenter({
				sessionManager: manager,
				assuranceLevel: 'medium',
			});

			await instrumenter.handleAgentComplete({
				maestroSessionId: 'maestro-1',
				agentSessionId: 'agent-abc',
				agentType: 'claude-code',
				success: true,
				duration: 45000,
			});

			const manifest = await readVibesManifest(tmpDir);
			const entries = Object.values(manifest.entries);
			const cmdEntries = entries.filter((e) => e.type === 'command') as VibesCommandEntry[];
			expect(cmdEntries).toHaveLength(1);
			expect(cmdEntries[0].command_type).toBe('tool_use');
			expect(cmdEntries[0].command_text).toContain('claude-code agent complete');
			expect(cmdEntries[0].command_text).toContain('agent-abc');
			expect(cmdEntries[0].command_exit_code).toBe(0);
			expect(cmdEntries[0].command_output_summary).toContain('completed successfully');
			expect(cmdEntries[0].command_output_summary).toContain('45.0s');
		});

		it('should record exit code 1 for failed agent completion', async () => {
			await setupSession('maestro-1');
			const instrumenter = new MaestroInstrumenter({
				sessionManager: manager,
				assuranceLevel: 'medium',
			});

			await instrumenter.handleAgentComplete({
				maestroSessionId: 'maestro-1',
				agentSessionId: 'agent-xyz',
				agentType: 'codex',
				success: false,
				duration: 12500,
			});

			const manifest = await readVibesManifest(tmpDir);
			const entries = Object.values(manifest.entries);
			const cmdEntries = entries.filter((e) => e.type === 'command') as VibesCommandEntry[];
			expect(cmdEntries).toHaveLength(1);
			expect(cmdEntries[0].command_exit_code).toBe(1);
			expect(cmdEntries[0].command_output_summary).toContain('failed');
			expect(cmdEntries[0].command_output_summary).toContain('12.5s');
		});

		it('should be a no-op for unknown session IDs', async () => {
			const instrumenter = new MaestroInstrumenter({
				sessionManager: manager,
				assuranceLevel: 'medium',
			});

			await instrumenter.handleAgentComplete({
				maestroSessionId: 'nonexistent',
				agentSessionId: 'agent-abc',
				agentType: 'claude-code',
				success: true,
				duration: 1000,
			});

			const manifest = await readVibesManifest(tmpDir);
			expect(Object.keys(manifest.entries)).toHaveLength(0);
		});

		it('should be a no-op for inactive sessions', async () => {
			await setupSession('maestro-1');
			await manager.endSession('maestro-1');

			const instrumenter = new MaestroInstrumenter({
				sessionManager: manager,
				assuranceLevel: 'medium',
			});

			await instrumenter.handleAgentComplete({
				maestroSessionId: 'maestro-1',
				agentSessionId: 'agent-abc',
				agentType: 'claude-code',
				success: true,
				duration: 1000,
			});

			const manifest = await readVibesManifest(tmpDir);
			expect(Object.keys(manifest.entries)).toHaveLength(0);
		});
	});

	// ========================================================================
	// handleBatchRunStart
	// ========================================================================
	describe('handleBatchRunStart', () => {
		it('should create a command entry for batch run start', async () => {
			await setupSession('maestro-1');
			const instrumenter = new MaestroInstrumenter({
				sessionManager: manager,
				assuranceLevel: 'medium',
			});

			await instrumenter.handleBatchRunStart({
				maestroSessionId: 'maestro-1',
				projectPath: '/home/user/project',
				documents: ['task-01.md', 'task-02.md', 'task-03.md'],
				agentType: 'claude-code',
			});

			const manifest = await readVibesManifest(tmpDir);
			const entries = Object.values(manifest.entries);
			const cmdEntries = entries.filter((e) => e.type === 'command') as VibesCommandEntry[];
			expect(cmdEntries).toHaveLength(1);
			expect(cmdEntries[0].command_type).toBe('tool_use');
			expect(cmdEntries[0].command_text).toContain('batch run start');
			expect(cmdEntries[0].command_text).toContain('3 document(s)');
			expect(cmdEntries[0].command_text).toContain('claude-code');
			expect(cmdEntries[0].working_directory).toBe('/home/user/project');
			expect(cmdEntries[0].command_output_summary).toContain('task-01.md');
			expect(cmdEntries[0].command_output_summary).toContain('task-02.md');
			expect(cmdEntries[0].command_output_summary).toContain('task-03.md');
		});

		it('should handle a single document', async () => {
			await setupSession('maestro-1');
			const instrumenter = new MaestroInstrumenter({
				sessionManager: manager,
				assuranceLevel: 'medium',
			});

			await instrumenter.handleBatchRunStart({
				maestroSessionId: 'maestro-1',
				projectPath: '/home/user/project',
				documents: ['only-one.md'],
				agentType: 'codex',
			});

			const manifest = await readVibesManifest(tmpDir);
			const entries = Object.values(manifest.entries);
			const cmdEntries = entries.filter((e) => e.type === 'command') as VibesCommandEntry[];
			expect(cmdEntries).toHaveLength(1);
			expect(cmdEntries[0].command_text).toContain('1 document(s)');
			expect(cmdEntries[0].command_text).toContain('codex');
		});

		it('should be a no-op for unknown session IDs', async () => {
			const instrumenter = new MaestroInstrumenter({
				sessionManager: manager,
				assuranceLevel: 'medium',
			});

			await instrumenter.handleBatchRunStart({
				maestroSessionId: 'nonexistent',
				projectPath: '/home/user/project',
				documents: ['task.md'],
				agentType: 'claude-code',
			});

			const manifest = await readVibesManifest(tmpDir);
			expect(Object.keys(manifest.entries)).toHaveLength(0);
		});

		it('should be a no-op for inactive sessions', async () => {
			await setupSession('maestro-1');
			await manager.endSession('maestro-1');

			const instrumenter = new MaestroInstrumenter({
				sessionManager: manager,
				assuranceLevel: 'medium',
			});

			await instrumenter.handleBatchRunStart({
				maestroSessionId: 'maestro-1',
				projectPath: '/home/user/project',
				documents: ['task.md'],
				agentType: 'claude-code',
			});

			const manifest = await readVibesManifest(tmpDir);
			expect(Object.keys(manifest.entries)).toHaveLength(0);
		});

		it('should truncate long document lists in output summary', async () => {
			await setupSession('maestro-1');
			const instrumenter = new MaestroInstrumenter({
				sessionManager: manager,
				assuranceLevel: 'medium',
			});

			const longDocs = Array.from({ length: 50 }, (_, i) => `very-long-document-name-${i}.md`);
			await instrumenter.handleBatchRunStart({
				maestroSessionId: 'maestro-1',
				projectPath: '/home/user/project',
				documents: longDocs,
				agentType: 'claude-code',
			});

			const manifest = await readVibesManifest(tmpDir);
			const entries = Object.values(manifest.entries);
			const cmdEntries = entries.filter((e) => e.type === 'command') as VibesCommandEntry[];
			expect(cmdEntries).toHaveLength(1);
			if (cmdEntries[0].command_output_summary) {
				expect(cmdEntries[0].command_output_summary.length).toBeLessThanOrEqual(200);
			}
		});
	});

	// ========================================================================
	// handleBatchRunComplete
	// ========================================================================
	describe('handleBatchRunComplete', () => {
		it('should create a command entry for batch run completion', async () => {
			await setupSession('maestro-1');
			const instrumenter = new MaestroInstrumenter({
				sessionManager: manager,
				assuranceLevel: 'medium',
			});

			await instrumenter.handleBatchRunComplete({
				maestroSessionId: 'maestro-1',
				documentsCompleted: 5,
				totalTasks: 12,
			});

			const manifest = await readVibesManifest(tmpDir);
			const entries = Object.values(manifest.entries);
			const cmdEntries = entries.filter((e) => e.type === 'command') as VibesCommandEntry[];
			expect(cmdEntries).toHaveLength(1);
			expect(cmdEntries[0].command_type).toBe('tool_use');
			expect(cmdEntries[0].command_text).toContain('batch run complete');
			expect(cmdEntries[0].command_text).toContain('5 document(s)');
			expect(cmdEntries[0].command_exit_code).toBe(0);
			expect(cmdEntries[0].command_output_summary).toContain('5 document(s)');
			expect(cmdEntries[0].command_output_summary).toContain('12 total task(s)');
		});

		it('should handle zero documents completed', async () => {
			await setupSession('maestro-1');
			const instrumenter = new MaestroInstrumenter({
				sessionManager: manager,
				assuranceLevel: 'medium',
			});

			await instrumenter.handleBatchRunComplete({
				maestroSessionId: 'maestro-1',
				documentsCompleted: 0,
				totalTasks: 0,
			});

			const manifest = await readVibesManifest(tmpDir);
			const entries = Object.values(manifest.entries);
			const cmdEntries = entries.filter((e) => e.type === 'command') as VibesCommandEntry[];
			expect(cmdEntries).toHaveLength(1);
			expect(cmdEntries[0].command_text).toContain('0 document(s)');
		});

		it('should be a no-op for unknown session IDs', async () => {
			const instrumenter = new MaestroInstrumenter({
				sessionManager: manager,
				assuranceLevel: 'medium',
			});

			await instrumenter.handleBatchRunComplete({
				maestroSessionId: 'nonexistent',
				documentsCompleted: 5,
				totalTasks: 10,
			});

			const manifest = await readVibesManifest(tmpDir);
			expect(Object.keys(manifest.entries)).toHaveLength(0);
		});

		it('should be a no-op for inactive sessions', async () => {
			await setupSession('maestro-1');
			await manager.endSession('maestro-1');

			const instrumenter = new MaestroInstrumenter({
				sessionManager: manager,
				assuranceLevel: 'medium',
			});

			await instrumenter.handleBatchRunComplete({
				maestroSessionId: 'maestro-1',
				documentsCompleted: 5,
				totalTasks: 10,
			});

			const manifest = await readVibesManifest(tmpDir);
			expect(Object.keys(manifest.entries)).toHaveLength(0);
		});
	});

	// ========================================================================
	// Integration: Full Orchestration Cycle
	// ========================================================================
	describe('integration', () => {
		it('should handle a full orchestration cycle: batch start → spawn → complete → batch complete', async () => {
			await setupSession('maestro-1', 'medium');
			const instrumenter = new MaestroInstrumenter({
				sessionManager: manager,
				assuranceLevel: 'medium',
			});

			// 1. Batch run starts
			await instrumenter.handleBatchRunStart({
				maestroSessionId: 'maestro-1',
				projectPath: '/home/user/project',
				documents: ['task-01.md', 'task-02.md'],
				agentType: 'claude-code',
			});

			// 2. Agent spawned for first task
			await instrumenter.handleAgentSpawn({
				maestroSessionId: 'maestro-1',
				agentSessionId: 'agent-001',
				agentType: 'claude-code',
				taskDescription: 'Implement feature A',
				projectPath: '/home/user/project',
			});

			// 3. Agent completes first task
			await instrumenter.handleAgentComplete({
				maestroSessionId: 'maestro-1',
				agentSessionId: 'agent-001',
				agentType: 'claude-code',
				success: true,
				duration: 30000,
			});

			// 4. Agent spawned for second task
			await instrumenter.handleAgentSpawn({
				maestroSessionId: 'maestro-1',
				agentSessionId: 'agent-002',
				agentType: 'claude-code',
				taskDescription: 'Fix bug B',
				projectPath: '/home/user/project',
			});

			// 5. Agent completes second task
			await instrumenter.handleAgentComplete({
				maestroSessionId: 'maestro-1',
				agentSessionId: 'agent-002',
				agentType: 'claude-code',
				success: true,
				duration: 15000,
			});

			// 6. Batch run completes
			await instrumenter.handleBatchRunComplete({
				maestroSessionId: 'maestro-1',
				documentsCompleted: 2,
				totalTasks: 4,
			});

			// Verify: should have batch start + 2 spawns + 2 completes + batch complete = 6 command entries
			// Plus 2 prompt entries (Medium assurance, with task descriptions)
			const manifest = await readVibesManifest(tmpDir);
			const entries = Object.values(manifest.entries);
			const cmdEntries = entries.filter((e) => e.type === 'command');
			const promptEntries = entries.filter((e) => e.type === 'prompt');

			expect(cmdEntries).toHaveLength(6);
			expect(promptEntries).toHaveLength(2);
		});

		it('should not record prompts in a full cycle at Low assurance', async () => {
			await setupSession('maestro-1', 'low');
			const instrumenter = new MaestroInstrumenter({
				sessionManager: manager,
				assuranceLevel: 'low',
			});

			await instrumenter.handleBatchRunStart({
				maestroSessionId: 'maestro-1',
				projectPath: '/home/user/project',
				documents: ['task.md'],
				agentType: 'claude-code',
			});

			await instrumenter.handleAgentSpawn({
				maestroSessionId: 'maestro-1',
				agentSessionId: 'agent-001',
				agentType: 'claude-code',
				taskDescription: 'This should not be recorded',
				projectPath: '/home/user/project',
			});

			await instrumenter.handleAgentComplete({
				maestroSessionId: 'maestro-1',
				agentSessionId: 'agent-001',
				agentType: 'claude-code',
				success: true,
				duration: 5000,
			});

			await instrumenter.handleBatchRunComplete({
				maestroSessionId: 'maestro-1',
				documentsCompleted: 1,
				totalTasks: 1,
			});

			const manifest = await readVibesManifest(tmpDir);
			const entries = Object.values(manifest.entries);
			const cmdEntries = entries.filter((e) => e.type === 'command');
			const promptEntries = entries.filter((e) => e.type === 'prompt');

			// 4 command entries: batch start, spawn, complete, batch complete
			expect(cmdEntries).toHaveLength(4);
			// No prompts at low assurance
			expect(promptEntries).toHaveLength(0);
		});

		it('should handle multiple sequential agent spawns', async () => {
			await setupSession('maestro-1', 'medium');
			const instrumenter = new MaestroInstrumenter({
				sessionManager: manager,
				assuranceLevel: 'medium',
			});

			// Spawn two agents sequentially (manifest file I/O is not concurrency-safe)
			await instrumenter.handleAgentSpawn({
				maestroSessionId: 'maestro-1',
				agentSessionId: 'agent-001',
				agentType: 'claude-code',
				taskDescription: 'Task A',
				projectPath: '/home/user/project',
			});
			await instrumenter.handleAgentSpawn({
				maestroSessionId: 'maestro-1',
				agentSessionId: 'agent-002',
				agentType: 'codex',
				taskDescription: 'Task B',
				projectPath: '/home/user/project',
			});

			const manifest = await readVibesManifest(tmpDir);
			const entries = Object.values(manifest.entries);
			const cmdEntries = entries.filter((e) => e.type === 'command');
			const promptEntries = entries.filter((e) => e.type === 'prompt');

			// 2 spawn commands + 2 prompt entries
			expect(cmdEntries).toHaveLength(2);
			expect(promptEntries).toHaveLength(2);
		});
	});
});

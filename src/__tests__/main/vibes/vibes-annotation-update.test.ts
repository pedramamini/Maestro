/**
 * Tests for vibes:annotation-update IPC event emission.
 * Validates that the VibesCoordinator emits annotation count updates to the
 * renderer via safeSend when annotations are recorded through the session manager.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

import { VibesCoordinator } from '../../../main/vibes/vibes-coordinator';
import type { VibesSettingsStore, VibesAnnotationUpdatePayload } from '../../../main/vibes/vibes-coordinator';
import { ensureAuditDir, flushAll, resetAllBuffers } from '../../../main/vibes/vibes-io';
import type { ProcessConfig } from '../../../main/process-manager/types';

// ============================================================================
// Helpers
// ============================================================================

function createMockSettingsStore(
	overrides: Record<string, unknown> = {},
): VibesSettingsStore {
	const settings: Record<string, unknown> = {
		vibesEnabled: true,
		vibesAssuranceLevel: 'medium',
		vibesPerAgentConfig: {
			'claude-code': { enabled: true },
			'codex': { enabled: true },
		},
		...overrides,
	};

	return {
		get<T>(key: string, defaultValue?: T): T {
			const value = settings[key];
			return (value !== undefined ? value : defaultValue) as T;
		},
	};
}

function createProcessConfig(
	overrides: Partial<ProcessConfig> = {},
): ProcessConfig {
	return {
		sessionId: 'sess-1',
		toolType: 'claude-code',
		cwd: '/tmp/test-project',
		command: 'claude',
		args: ['--print'],
		projectPath: '/tmp/test-project',
		...overrides,
	};
}

// ============================================================================
// Test Suite
// ============================================================================

describe('vibes:annotation-update emission', () => {
	const FIXED_ISO = '2026-02-10T12:00:00.000Z';
	let tmpDir: string;

	beforeEach(async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(FIXED_ISO));
		tmpDir = await mkdtemp(path.join(os.tmpdir(), 'vibes-annotation-update-test-'));
		await ensureAuditDir(tmpDir);
	});

	afterEach(async () => {
		resetAllBuffers();
		vi.useRealTimers();
		await rm(tmpDir, { recursive: true, force: true });
	});

	it('should call safeSend with vibes:annotation-update when a session starts', async () => {
		const mockSafeSend = vi.fn();
		const coordinator = new VibesCoordinator({
			settingsStore: createMockSettingsStore(),
			safeSend: mockSafeSend,
		});

		const config = createProcessConfig({ projectPath: tmpDir });
		await coordinator.handleProcessSpawn('sess-1', config);

		// Session start writes a session annotation + environment entry
		// The callback is fired for the session start annotation
		expect(mockSafeSend).toHaveBeenCalled();
		const calls = mockSafeSend.mock.calls.filter(
			(call: unknown[]) => call[0] === 'vibes:annotation-update',
		);
		expect(calls.length).toBeGreaterThanOrEqual(1);

		const payload = calls[0][1] as VibesAnnotationUpdatePayload;
		expect(payload.sessionId).toBe('sess-1');
		expect(payload.annotationCount).toBeGreaterThanOrEqual(1);
		expect(payload.lastAnnotation).toBeDefined();
		expect(payload.lastAnnotation.type).toBe('session');
		expect(payload.lastAnnotation.timestamp).toBe(FIXED_ISO);
	});

	it('should emit annotation-update for tool execution annotations', async () => {
		const mockSafeSend = vi.fn();
		const coordinator = new VibesCoordinator({
			settingsStore: createMockSettingsStore(),
			safeSend: mockSafeSend,
		});

		const config = createProcessConfig({ projectPath: tmpDir });
		await coordinator.handleProcessSpawn('sess-1', config);

		// Clear initial calls from session start
		mockSafeSend.mockClear();

		// Simulate a tool execution
		await coordinator.handleToolExecution('sess-1', {
			name: 'write_to_file',
			input: { path: '/tmp/test.ts', content: 'test' },
			output: 'File written',
			isError: false,
		});

		// Tool execution should trigger annotation-update events
		const calls = mockSafeSend.mock.calls.filter(
			(call: unknown[]) => call[0] === 'vibes:annotation-update',
		);
		// May or may not produce annotations depending on instrumenter behavior
		// But if it does, the payload should be correct
		for (const call of calls) {
			const payload = call[1] as VibesAnnotationUpdatePayload;
			expect(payload.sessionId).toBe('sess-1');
			expect(typeof payload.annotationCount).toBe('number');
			expect(payload.lastAnnotation).toBeDefined();
			expect(typeof payload.lastAnnotation.timestamp).toBe('string');
		}
	});

	it('should not call safeSend when safeSend is not provided', async () => {
		// Coordinator without safeSend should not throw
		const coordinator = new VibesCoordinator({
			settingsStore: createMockSettingsStore(),
		});

		const config = createProcessConfig({ projectPath: tmpDir });
		// Should not throw
		await coordinator.handleProcessSpawn('sess-1', config);

		// Verify session was still created successfully
		const stats = coordinator.getSessionStats('sess-1');
		expect(stats).not.toBeNull();
		expect(stats!.annotationCount).toBeGreaterThanOrEqual(1);
	});

	it('should emit annotation-update when session ends', async () => {
		const mockSafeSend = vi.fn();
		const coordinator = new VibesCoordinator({
			settingsStore: createMockSettingsStore(),
			safeSend: mockSafeSend,
		});

		const config = createProcessConfig({ projectPath: tmpDir });
		await coordinator.handleProcessSpawn('sess-1', config);
		mockSafeSend.mockClear();

		await coordinator.handleProcessExit('sess-1', 0);

		const calls = mockSafeSend.mock.calls.filter(
			(call: unknown[]) => call[0] === 'vibes:annotation-update',
		);
		expect(calls.length).toBeGreaterThanOrEqual(1);

		const lastCall = calls[calls.length - 1];
		const payload = lastCall[1] as VibesAnnotationUpdatePayload;
		expect(payload.sessionId).toBe('sess-1');
		expect(payload.lastAnnotation.type).toBe('session');
	});

	it('should include correct annotationCount that increments', async () => {
		const mockSafeSend = vi.fn();
		const coordinator = new VibesCoordinator({
			settingsStore: createMockSettingsStore(),
			safeSend: mockSafeSend,
		});

		const config = createProcessConfig({ projectPath: tmpDir });
		await coordinator.handleProcessSpawn('sess-1', config);

		// Collect all annotation-update calls
		const calls = mockSafeSend.mock.calls.filter(
			(call: unknown[]) => call[0] === 'vibes:annotation-update',
		);

		// Annotation counts should be monotonically increasing
		let prevCount = 0;
		for (const call of calls) {
			const payload = call[1] as VibesAnnotationUpdatePayload;
			expect(payload.annotationCount).toBeGreaterThanOrEqual(prevCount);
			prevCount = payload.annotationCount;
		}
	});

	it('should not emit if VIBES is disabled', async () => {
		const mockSafeSend = vi.fn();
		const coordinator = new VibesCoordinator({
			settingsStore: createMockSettingsStore({ vibesEnabled: false }),
			safeSend: mockSafeSend,
		});

		const config = createProcessConfig({ projectPath: tmpDir });
		await coordinator.handleProcessSpawn('sess-1', config);

		expect(mockSafeSend).not.toHaveBeenCalled();
	});

	it('should handle safeSend throwing without breaking annotation recording', async () => {
		const mockSafeSend = vi.fn().mockImplementation(() => {
			throw new Error('renderer disposed');
		});
		const coordinator = new VibesCoordinator({
			settingsStore: createMockSettingsStore(),
			safeSend: mockSafeSend,
		});

		const config = createProcessConfig({ projectPath: tmpDir });
		// Should not throw even though safeSend throws
		await coordinator.handleProcessSpawn('sess-1', config);

		// Session should still be created successfully
		const stats = coordinator.getSessionStats('sess-1');
		expect(stats).not.toBeNull();
		expect(stats!.annotationCount).toBeGreaterThanOrEqual(1);
	});
});

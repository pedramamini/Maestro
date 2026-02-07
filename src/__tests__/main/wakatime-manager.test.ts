/**
 * Tests for WakaTimeManager.
 * Verifies CLI detection, heartbeat sending, debouncing, and session cleanup.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WakaTimeManager } from '../../main/wakatime-manager';

// Mock execFileNoThrow
vi.mock('../../main/utils/execFile', () => ({
	execFileNoThrow: vi.fn(),
}));

// Mock logger
vi.mock('../../main/utils/logger', () => ({
	logger: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

import { execFileNoThrow } from '../../main/utils/execFile';
import { logger } from '../../main/utils/logger';

describe('WakaTimeManager', () => {
	let mockStore: { get: ReturnType<typeof vi.fn> };
	let manager: WakaTimeManager;

	beforeEach(() => {
		vi.clearAllMocks();
		mockStore = {
			get: vi.fn(),
		};
		manager = new WakaTimeManager(mockStore as never);
	});

	describe('detectCli', () => {
		it('should detect wakatime-cli when available', async () => {
			vi.mocked(execFileNoThrow).mockResolvedValueOnce({
				exitCode: 0,
				stdout: 'wakatime-cli 1.73.1\n',
				stderr: '',
			});

			const result = await manager.detectCli();

			expect(result).toBe(true);
			expect(execFileNoThrow).toHaveBeenCalledWith('wakatime-cli', ['--version']);
			expect(logger.info).toHaveBeenCalledWith(
				expect.stringContaining('Found WakaTime CLI: wakatime-cli'),
				'[WakaTime]'
			);
		});

		it('should fall back to wakatime binary', async () => {
			vi.mocked(execFileNoThrow)
				.mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'not found' })
				.mockResolvedValueOnce({ exitCode: 0, stdout: 'wakatime 1.73.1\n', stderr: '' });

			const result = await manager.detectCli();

			expect(result).toBe(true);
			expect(execFileNoThrow).toHaveBeenCalledTimes(2);
			expect(execFileNoThrow).toHaveBeenCalledWith('wakatime', ['--version']);
		});

		it('should return false when no CLI is found', async () => {
			vi.mocked(execFileNoThrow)
				.mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'not found' })
				.mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'not found' });

			const result = await manager.detectCli();

			expect(result).toBe(false);
			expect(logger.debug).toHaveBeenCalledWith(
				'WakaTime CLI not found on PATH',
				'[WakaTime]'
			);
		});

		it('should cache CLI detection result', async () => {
			vi.mocked(execFileNoThrow).mockResolvedValueOnce({
				exitCode: 0,
				stdout: 'wakatime-cli 1.73.1\n',
				stderr: '',
			});

			await manager.detectCli();
			const result = await manager.detectCli();

			expect(result).toBe(true);
			// Should only call execFileNoThrow once due to caching
			expect(execFileNoThrow).toHaveBeenCalledTimes(1);
		});

		it('should cache negative CLI detection result', async () => {
			vi.mocked(execFileNoThrow)
				.mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: '' })
				.mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: '' });

			await manager.detectCli();
			const result = await manager.detectCli();

			expect(result).toBe(false);
			// Should only call execFileNoThrow twice (for two binary names) on first call, then cache
			expect(execFileNoThrow).toHaveBeenCalledTimes(2);
		});
	});

	describe('sendHeartbeat', () => {
		beforeEach(() => {
			// Set up store to return enabled and API key
			mockStore.get.mockImplementation((key: string, defaultVal: unknown) => {
				if (key === 'wakatimeEnabled') return true;
				if (key === 'wakatimeApiKey') return 'test-api-key-123';
				return defaultVal;
			});
		});

		it('should skip when disabled', async () => {
			mockStore.get.mockImplementation((key: string, defaultVal: unknown) => {
				if (key === 'wakatimeEnabled') return false;
				return defaultVal;
			});

			await manager.sendHeartbeat('session-1', '/project', 'My Project');

			expect(execFileNoThrow).not.toHaveBeenCalled();
		});

		it('should skip when API key is empty', async () => {
			mockStore.get.mockImplementation((key: string, defaultVal: unknown) => {
				if (key === 'wakatimeEnabled') return true;
				if (key === 'wakatimeApiKey') return '';
				return defaultVal;
			});

			await manager.sendHeartbeat('session-1', '/project', 'My Project');

			expect(execFileNoThrow).not.toHaveBeenCalled();
		});

		it('should skip when CLI is not available', async () => {
			vi.mocked(execFileNoThrow)
				.mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: '' })
				.mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: '' });

			await manager.sendHeartbeat('session-1', '/project', 'My Project');

			expect(logger.warn).toHaveBeenCalledWith(
				'WakaTime CLI not installed — skipping heartbeat',
				'[WakaTime]'
			);
		});

		it('should send heartbeat with correct arguments', async () => {
			// First call to detectCli
			vi.mocked(execFileNoThrow).mockResolvedValueOnce({
				exitCode: 0,
				stdout: 'wakatime-cli 1.73.1\n',
				stderr: '',
			});
			// Second call is the actual heartbeat
			vi.mocked(execFileNoThrow).mockResolvedValueOnce({
				exitCode: 0,
				stdout: '',
				stderr: '',
			});

			await manager.sendHeartbeat('session-1', '/project/path', 'My Project');

			expect(execFileNoThrow).toHaveBeenCalledWith('wakatime-cli', [
				'--key', 'test-api-key-123',
				'--entity', '/project/path',
				'--entity-type', 'app',
				'--project', 'My Project',
				'--plugin', 'maestro-wakatime',
				'--category', 'coding',
			]);
			expect(logger.debug).toHaveBeenCalledWith(
				expect.stringContaining('Heartbeat sent for session session-1'),
				'[WakaTime]'
			);
		});

		it('should log warning on heartbeat failure', async () => {
			vi.mocked(execFileNoThrow)
				.mockResolvedValueOnce({ exitCode: 0, stdout: 'wakatime-cli 1.73.1\n', stderr: '' })
				.mockResolvedValueOnce({ exitCode: 102, stdout: '', stderr: 'API key invalid' });

			await manager.sendHeartbeat('session-1', '/project', 'My Project');

			expect(logger.warn).toHaveBeenCalledWith(
				expect.stringContaining('Heartbeat failed for session-1'),
				'[WakaTime]'
			);
		});

		it('should debounce heartbeats per session (within 2 minutes)', async () => {
			vi.mocked(execFileNoThrow)
				.mockResolvedValueOnce({ exitCode: 0, stdout: 'wakatime-cli 1.73.1\n', stderr: '' })
				.mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });

			await manager.sendHeartbeat('session-1', '/project', 'My Project');
			await manager.sendHeartbeat('session-1', '/project', 'My Project');

			// detectCli (1 call) + heartbeat (1 call) = 2 total, second heartbeat was debounced
			expect(execFileNoThrow).toHaveBeenCalledTimes(2);
		});

		it('should not debounce different sessions', async () => {
			vi.mocked(execFileNoThrow)
				.mockResolvedValueOnce({ exitCode: 0, stdout: 'wakatime-cli 1.73.1\n', stderr: '' })
				.mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
				.mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });

			await manager.sendHeartbeat('session-1', '/project1', 'Project 1');
			await manager.sendHeartbeat('session-2', '/project2', 'Project 2');

			// detectCli (1 call, cached) + heartbeat session-1 (1 call) + heartbeat session-2 (1 call) = 3
			expect(execFileNoThrow).toHaveBeenCalledTimes(3);
		});
	});

	describe('removeSession', () => {
		it('should remove session from debounce tracking', async () => {
			mockStore.get.mockImplementation((key: string, defaultVal: unknown) => {
				if (key === 'wakatimeEnabled') return true;
				if (key === 'wakatimeApiKey') return 'test-api-key-123';
				return defaultVal;
			});

			// Set up CLI detection
			vi.mocked(execFileNoThrow)
				.mockResolvedValueOnce({ exitCode: 0, stdout: 'wakatime-cli 1.73.1\n', stderr: '' })
				.mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
				.mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });

			// Send first heartbeat
			await manager.sendHeartbeat('session-1', '/project', 'My Project');
			// Remove session (resets debounce)
			manager.removeSession('session-1');
			// Send again — should NOT be debounced since session was removed
			await manager.sendHeartbeat('session-1', '/project', 'My Project');

			// detectCli (1, cached) + first heartbeat (1) + second heartbeat (1) = 3
			expect(execFileNoThrow).toHaveBeenCalledTimes(3);
		});
	});
});

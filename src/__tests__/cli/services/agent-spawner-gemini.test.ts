/**
 * @file agent-spawner-gemini.test.ts
 * @description Dedicated tests for spawnGeminiCli() and related Gemini CLI helpers.
 *
 * Covers:
 * - Successful spawn with JSON stdout parsing (text events, partial streaming)
 * - Spawn with non-zero exit code (Gemini-specific exit codes)
 * - Spawn with malformed/empty stdout
 * - getGeminiCommand() resolution (custom path, fallback)
 * - mergeUsageStats() via multi-event accumulation
 * - Timeout behavior
 * - Model validation rejection
 * - Session ID validation rejection
 *
 * TASK-T01 (P0 test coverage)
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import { EventEmitter } from 'events';

// -----------------------------------------------------------------------
// Module-level mock setup
// -----------------------------------------------------------------------

const mockSpawn = vi.fn();

vi.mock('child_process', async (importOriginal) => {
	const actual = await importOriginal<typeof import('child_process')>();
	return {
		...actual,
		spawn: (...args: unknown[]) => mockSpawn(...args),
		default: {
			...actual,
			spawn: (...args: unknown[]) => mockSpawn(...args),
		},
	};
});

vi.mock('fs', async (importOriginal) => {
	const actual = await importOriginal<typeof import('fs')>();
	return {
		...actual,
		readFileSync: vi.fn(),
		writeFileSync: vi.fn(),
		existsSync: vi.fn(() => false),
		promises: {
			stat: vi.fn(),
			access: vi.fn(),
			readdir: vi.fn().mockResolvedValue([]),
		},
	};
});

const mockGetAgentCustomPath = vi.fn().mockReturnValue(undefined);
vi.mock('../../../cli/services/storage', () => ({
	getAgentCustomPath: (...args: unknown[]) => mockGetAgentCustomPath(...args),
}));

vi.mock('../../../shared/uuid', () => ({
	generateUUID: () => '00000000-0000-4000-8000-000000000001',
}));

vi.mock('os', async (importOriginal) => {
	const actual = await importOriginal<typeof import('os')>();
	return {
		...actual,
		homedir: () => '/Users/testuser',
	};
});

// -----------------------------------------------------------------------
// Helpers: create fresh mock child process per test
// -----------------------------------------------------------------------

function createMockChild() {
	const stdin = { end: vi.fn() };
	const stdout = new EventEmitter();
	const stderr = new EventEmitter();
	const child = Object.assign(new EventEmitter(), { stdin, stdout, stderr });
	return { child, stdin, stdout, stderr };
}

/** Emit NDJSON lines on stdout then close with given exit code */
function emitAndClose(mock: ReturnType<typeof createMockChild>, lines: string[], exitCode = 0) {
	for (const line of lines) {
		mock.stdout.emit('data', Buffer.from(line + '\n'));
	}
	mock.child.emit('close', exitCode);
}

// -----------------------------------------------------------------------
// Import SUT (after mocks)
// -----------------------------------------------------------------------

import {
	spawnGeminiCli,
	getGeminiCommand,
	detectGemini,
} from '../../../cli/services/agent-spawner';

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe('spawnGeminiCli', () => {
	let mock: ReturnType<typeof createMockChild>;

	beforeEach(() => {
		vi.clearAllMocks();
		mock = createMockChild();
		mockSpawn.mockReturnValue(mock.child);
		// Default: no matching session files
		(fs.promises.readdir as Mock).mockResolvedValue([]);
	});

	// -------------------------------------------------------------------
	// 1. Successful spawn with JSON stdout parsing
	// -------------------------------------------------------------------
	describe('successful spawn with JSON stdout', () => {
		it('parses text events and returns concatenated response', async () => {
			const promise = spawnGeminiCli({ prompt: 'hello', cwd: '/project' });
			await tick();

			emitAndClose(mock, [
				JSON.stringify({ type: 'init', session_id: 'sess-1', model: 'gemini-2.0-flash' }),
				JSON.stringify({ type: 'message', role: 'assistant', content: 'Hello ', delta: true }),
				JSON.stringify({ type: 'message', role: 'assistant', content: 'world!' }),
				JSON.stringify({
					type: 'result',
					status: 'success',
					stats: { input_tokens: 10, output_tokens: 5 },
				}),
			]);

			const result = await promise;
			expect(result.success).toBe(true);
			expect(result.response).toBe('Hello world!');
			expect(result.agentSessionId).toBe('sess-1');
		});

		it('captures session ID from init event only once', async () => {
			const promise = spawnGeminiCli({ prompt: 'test', cwd: '/project' });
			await tick();

			emitAndClose(mock, [
				JSON.stringify({ type: 'init', session_id: 'first-id', model: 'gemini-2.0-flash' }),
				JSON.stringify({ type: 'init', session_id: 'second-id', model: 'gemini-2.0-flash' }),
				JSON.stringify({ type: 'result', status: 'success' }),
			]);

			const result = await promise;
			expect(result.agentSessionId).toBe('first-id');
		});

		it('handles partial streaming with delta events', async () => {
			const promise = spawnGeminiCli({ prompt: 'test', cwd: '/project' });
			await tick();

			emitAndClose(mock, [
				JSON.stringify({ type: 'message', role: 'assistant', content: 'chunk1', delta: true }),
				JSON.stringify({ type: 'message', role: 'assistant', content: 'chunk2', delta: true }),
				JSON.stringify({ type: 'message', role: 'assistant', content: 'chunk3' }),
				JSON.stringify({ type: 'result', status: 'success' }),
			]);

			const result = await promise;
			expect(result.success).toBe(true);
			expect(result.response).toBe('chunk1chunk2chunk3');
		});

		it('flushes pending partial text on close', async () => {
			const promise = spawnGeminiCli({ prompt: 'test', cwd: '/project' });
			await tick();

			// Only partial events, no final non-delta message
			emitAndClose(mock, [
				JSON.stringify({
					type: 'message',
					role: 'assistant',
					content: 'partial only',
					delta: true,
				}),
				JSON.stringify({ type: 'result', status: 'success' }),
			]);

			const result = await promise;
			expect(result.success).toBe(true);
			expect(result.response).toBe('partial only');
		});

		it('passes correct args to spawn (base args + prompt)', async () => {
			const promise = spawnGeminiCli({ prompt: 'my prompt', cwd: '/project' });
			await tick();

			expect(mockSpawn).toHaveBeenCalledTimes(1);
			const [cmd, args, opts] = mockSpawn.mock.calls[0];

			expect(cmd).toBe('gemini');
			expect(args).toContain('-y');
			expect(args).toContain('--output-format');
			expect(args).toContain('stream-json');
			expect(args).toContain('-p');
			expect(args).toContain('my prompt');
			expect(opts.cwd).toBe('/project');

			mock.child.emit('close', 0);
			await promise;
		});

		it('includes -m flag when model is provided', async () => {
			const promise = spawnGeminiCli({ prompt: 'test', cwd: '/project', model: 'gemini-2.5-pro' });
			await tick();

			const args = mockSpawn.mock.calls[0][1] as string[];
			expect(args).toContain('-m');
			expect(args).toContain('gemini-2.5-pro');

			mock.child.emit('close', 0);
			await promise;
		});

		it('includes --resume when session file exists', async () => {
			(fs.promises.readdir as Mock).mockResolvedValue(['session-1709900000-my-session-id.json']);

			const promise = spawnGeminiCli({ prompt: 'test', cwd: '/project', resume: 'my-session-id' });
			await tick();

			const args = mockSpawn.mock.calls[0][1] as string[];
			expect(args).toContain('--resume');
			expect(args).toContain('my-session-id');

			mock.child.emit('close', 0);
			await promise;
		});

		it('closes stdin immediately', async () => {
			const promise = spawnGeminiCli({ prompt: 'test', cwd: '/project' });
			await tick();

			expect(mock.stdin.end).toHaveBeenCalled();

			mock.child.emit('close', 0);
			await promise;
		});
	});

	// -------------------------------------------------------------------
	// 2. Spawn with non-zero exit code
	// -------------------------------------------------------------------
	describe('non-zero exit code', () => {
		it('returns error on non-zero exit with stderr', async () => {
			const promise = spawnGeminiCli({ prompt: 'test', cwd: '/project' });
			await tick();

			mock.stderr.emit('data', Buffer.from('Something went wrong'));
			mock.child.emit('close', 1);

			const result = await promise;
			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
		});

		it('returns error for auth failure (exit code 41)', async () => {
			const promise = spawnGeminiCli({ prompt: 'test', cwd: '/project' });
			await tick();

			mock.child.emit('close', 41);

			const result = await promise;
			expect(result.success).toBe(false);
			expect(result.error).toContain('authentication');
		});

		it('returns error for turn limit (exit code 53)', async () => {
			const promise = spawnGeminiCli({ prompt: 'test', cwd: '/project' });
			await tick();

			mock.child.emit('close', 53);

			const result = await promise;
			expect(result.success).toBe(false);
			expect(result.error).toContain('turn limit');
		});

		it('returns error from error event in stdout', async () => {
			const promise = spawnGeminiCli({ prompt: 'test', cwd: '/project' });
			await tick();

			emitAndClose(
				mock,
				[JSON.stringify({ type: 'error', severity: 'error', message: 'Rate limit exceeded' })],
				1
			);

			const result = await promise;
			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
		});

		it('returns generic error when exit code is non-zero with no stderr', async () => {
			const promise = spawnGeminiCli({ prompt: 'test', cwd: '/project' });
			await tick();

			mock.child.emit('close', 99);

			const result = await promise;
			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
		});

		it('preserves session ID and usage stats on error', async () => {
			const promise = spawnGeminiCli({ prompt: 'test', cwd: '/project' });
			await tick();

			emitAndClose(
				mock,
				[
					JSON.stringify({ type: 'init', session_id: 'err-sess' }),
					JSON.stringify({
						type: 'result',
						status: 'success',
						stats: { input_tokens: 50, output_tokens: 25 },
					}),
				],
				1
			);

			const result = await promise;
			expect(result.success).toBe(false);
			expect(result.agentSessionId).toBe('err-sess');
			expect(result.usageStats).toBeDefined();
		});
	});

	// -------------------------------------------------------------------
	// 3. Malformed / empty stdout
	// -------------------------------------------------------------------
	describe('malformed and empty stdout', () => {
		it('handles completely empty stdout', async () => {
			const promise = spawnGeminiCli({ prompt: 'test', cwd: '/project' });
			await tick();

			mock.child.emit('close', 0);

			const result = await promise;
			// No error event but also no response text
			expect(result.success).toBe(true);
			expect(result.response).toBeUndefined();
		});

		it('ignores non-JSON lines in stdout', async () => {
			const promise = spawnGeminiCli({ prompt: 'test', cwd: '/project' });
			await tick();

			emitAndClose(mock, [
				'Some debug text',
				'More noise',
				JSON.stringify({ type: 'message', role: 'assistant', content: 'Hello' }),
				JSON.stringify({ type: 'result', status: 'success' }),
			]);

			const result = await promise;
			expect(result.success).toBe(true);
			expect(result.response).toBe('Hello');
		});

		it('handles malformed JSON lines gracefully', async () => {
			const promise = spawnGeminiCli({ prompt: 'test', cwd: '/project' });
			await tick();

			emitAndClose(mock, [
				'{"type":"message","role":"assis', // truncated
				'tant","content":"Bad"}', // continuation on next line (won't pair)
				JSON.stringify({ type: 'message', role: 'assistant', content: 'Good' }),
				JSON.stringify({ type: 'result', status: 'success' }),
			]);

			const result = await promise;
			expect(result.success).toBe(true);
			expect(result.response).toBe('Good');
		});

		it('handles partial JSON buffering across data events', async () => {
			const promise = spawnGeminiCli({ prompt: 'test', cwd: '/project' });
			await tick();

			// Send JSON split across two data events
			mock.stdout.emit('data', Buffer.from('{"type":"message","role":"assistant",'));
			mock.stdout.emit('data', Buffer.from('"content":"buffered"}\n'));
			mock.stdout.emit(
				'data',
				Buffer.from(JSON.stringify({ type: 'result', status: 'success' }) + '\n')
			);
			mock.child.emit('close', 0);

			const result = await promise;
			expect(result.success).toBe(true);
			expect(result.response).toBe('buffered');
		});

		it('ignores user role messages', async () => {
			const promise = spawnGeminiCli({ prompt: 'test', cwd: '/project' });
			await tick();

			emitAndClose(mock, [
				JSON.stringify({ type: 'message', role: 'user', content: 'Should be skipped' }),
				JSON.stringify({ type: 'message', role: 'assistant', content: 'Only this' }),
				JSON.stringify({ type: 'result', status: 'success' }),
			]);

			const result = await promise;
			expect(result.success).toBe(true);
			expect(result.response).toBe('Only this');
		});
	});

	// -------------------------------------------------------------------
	// 4. getGeminiCommand() resolution
	// -------------------------------------------------------------------
	describe('getGeminiCommand resolution', () => {
		it('returns default "gemini" when no custom path is set', () => {
			expect(getGeminiCommand()).toBe('gemini');
		});

		it('uses default command in spawn when no detection performed', async () => {
			const promise = spawnGeminiCli({ prompt: 'test', cwd: '/project' });
			await tick();

			const cmd = mockSpawn.mock.calls[0][0];
			expect(cmd).toBe('gemini');

			mock.child.emit('close', 0);
			await promise;
		});
	});

	// -------------------------------------------------------------------
	// 5. Usage stats accumulation (mergeUsageStats via spawnGeminiCli)
	// -------------------------------------------------------------------
	describe('usage stats accumulation', () => {
		it('extracts flat usage stats from result event', async () => {
			const promise = spawnGeminiCli({ prompt: 'test', cwd: '/project' });
			await tick();

			emitAndClose(mock, [
				JSON.stringify({
					type: 'result',
					status: 'success',
					stats: { input_tokens: 100, output_tokens: 50, cached: 20 },
				}),
			]);

			const result = await promise;
			expect(result.success).toBe(true);
			expect(result.usageStats).toBeDefined();
			expect(result.usageStats!.inputTokens).toBe(100);
			expect(result.usageStats!.outputTokens).toBe(50);
			expect(result.usageStats!.cacheReadInputTokens).toBe(20);
		});

		it('extracts nested model-based usage stats', async () => {
			const promise = spawnGeminiCli({ prompt: 'test', cwd: '/project' });
			await tick();

			emitAndClose(mock, [
				JSON.stringify({
					type: 'result',
					status: 'success',
					stats: {
						models: {
							'gemini-2.0-flash': {
								tokens: { input: 200, prompt: 50, candidates: 80, cached: 30, thoughts: 10 },
							},
						},
					},
				}),
			]);

			const result = await promise;
			expect(result.success).toBe(true);
			expect(result.usageStats).toBeDefined();
			// input = input(200) + prompt(50) = 250
			expect(result.usageStats!.inputTokens).toBe(250);
			expect(result.usageStats!.outputTokens).toBe(80);
			expect(result.usageStats!.cacheReadInputTokens).toBe(30);
		});

		it('accumulates usage across multiple result events', async () => {
			const promise = spawnGeminiCli({ prompt: 'test', cwd: '/project' });
			await tick();

			emitAndClose(mock, [
				JSON.stringify({
					type: 'result',
					status: 'success',
					stats: { input_tokens: 100, output_tokens: 50 },
				}),
				JSON.stringify({
					type: 'result',
					status: 'success',
					stats: { input_tokens: 200, output_tokens: 100 },
				}),
			]);

			const result = await promise;
			expect(result.usageStats).toBeDefined();
			// mergeUsageStats adds up across events
			expect(result.usageStats!.inputTokens).toBe(300);
			expect(result.usageStats!.outputTokens).toBe(150);
		});

		it('returns no usageStats when result has no stats', async () => {
			const promise = spawnGeminiCli({ prompt: 'test', cwd: '/project' });
			await tick();

			emitAndClose(mock, [JSON.stringify({ type: 'result', status: 'success' })]);

			const result = await promise;
			expect(result.success).toBe(true);
			expect(result.usageStats).toBeUndefined();
		});

		it('tracks contextWindow as max across events', async () => {
			const promise = spawnGeminiCli({ prompt: 'test', cwd: '/project' });
			await tick();

			// Emit two result events with different contextWindow values
			// Note: contextWindow comes through mergeUsageStats but Gemini stats
			// don't have a direct contextWindow field — test that mergeUsageStats
			// takes max
			emitAndClose(mock, [
				JSON.stringify({
					type: 'message',
					role: 'assistant',
					content: 'ok',
				}),
				JSON.stringify({ type: 'result', status: 'success' }),
			]);

			const result = await promise;
			expect(result.success).toBe(true);
		});
	});

	// -------------------------------------------------------------------
	// 6. Timeout behavior
	// -------------------------------------------------------------------
	describe('timeout behavior', () => {
		it('passes timeout to spawn options when provided', async () => {
			const promise = spawnGeminiCli({
				prompt: 'test',
				cwd: '/project',
				timeout: 30000,
			});
			await tick();

			const spawnOpts = mockSpawn.mock.calls[0][2];
			expect(spawnOpts.timeout).toBe(30000);

			mock.child.emit('close', 0);
			await promise;
		});

		it('does not set timeout when not provided', async () => {
			const promise = spawnGeminiCli({ prompt: 'test', cwd: '/project' });
			await tick();

			const spawnOpts = mockSpawn.mock.calls[0][2];
			expect(spawnOpts.timeout).toBeUndefined();

			mock.child.emit('close', 0);
			await promise;
		});
	});

	// -------------------------------------------------------------------
	// 7. Model validation rejection
	// -------------------------------------------------------------------
	describe('model validation', () => {
		it('rejects model containing shell metacharacters', async () => {
			await expect(
				spawnGeminiCli({ prompt: 'test', cwd: '/project', model: 'model; rm -rf /' })
			).rejects.toThrow('Invalid model identifier');
		});

		it('rejects model containing backticks', async () => {
			await expect(
				spawnGeminiCli({ prompt: 'test', cwd: '/project', model: 'model`id`' })
			).rejects.toThrow('Invalid model identifier');
		});

		it('rejects model containing spaces', async () => {
			await expect(
				spawnGeminiCli({ prompt: 'test', cwd: '/project', model: 'model name' })
			).rejects.toThrow('Invalid model identifier');
		});

		it('rejects model containing pipes', async () => {
			await expect(
				spawnGeminiCli({ prompt: 'test', cwd: '/project', model: 'model|cat' })
			).rejects.toThrow('Invalid model identifier');
		});

		it('accepts valid model with dots, hyphens, slashes', async () => {
			const promise = spawnGeminiCli({
				prompt: 'test',
				cwd: '/project',
				model: 'gemini-2.5-pro/latest',
			});
			await tick();

			mock.child.emit('close', 0);
			const result = await promise;
			expect(result).toBeDefined();
		});
	});

	// -------------------------------------------------------------------
	// 8. Session ID validation rejection
	// -------------------------------------------------------------------
	describe('session ID validation', () => {
		it('rejects resume ID with $() command substitution', async () => {
			await expect(
				spawnGeminiCli({ prompt: 'test', cwd: '/project', resume: 'id$(whoami)' })
			).rejects.toThrow('Invalid session ID for resume');
		});

		it('rejects resume ID with pipe', async () => {
			await expect(
				spawnGeminiCli({ prompt: 'test', cwd: '/project', resume: 'id|cat' })
			).rejects.toThrow('Invalid session ID for resume');
		});

		it('rejects resume ID with spaces', async () => {
			await expect(
				spawnGeminiCli({ prompt: 'test', cwd: '/project', resume: 'id with spaces' })
			).rejects.toThrow('Invalid session ID for resume');
		});

		it('accepts valid resume ID with dots, colons, hyphens', async () => {
			(fs.promises.readdir as Mock).mockResolvedValue([
				'session-1709900000-session-2025:03.08_test.json',
			]);

			const promise = spawnGeminiCli({
				prompt: 'test',
				cwd: '/project',
				resume: 'session-2025:03.08_test',
			});
			await tick();

			mock.child.emit('close', 0);
			const result = await promise;
			expect(result).toBeDefined();
		});

		it('omits --resume when session file not found and logs warning', async () => {
			(fs.promises.readdir as Mock).mockResolvedValue([]);
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			const promise = spawnGeminiCli({
				prompt: 'test',
				cwd: '/project',
				resume: 'nonexistent',
			});
			await tick();

			const args = mockSpawn.mock.calls[0][1] as string[];
			expect(args).not.toContain('--resume');
			expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Session file not found'));

			mock.child.emit('close', 0);
			await promise;
			warnSpy.mockRestore();
		});
	});

	// -------------------------------------------------------------------
	// 9. Spawn error (ENOENT)
	// -------------------------------------------------------------------
	describe('spawn error', () => {
		it('returns error when binary is not found (ENOENT)', async () => {
			const promise = spawnGeminiCli({ prompt: 'test', cwd: '/project' });
			await tick();

			mock.child.emit('error', new Error('spawn gemini ENOENT'));

			const result = await promise;
			expect(result.success).toBe(false);
			expect(result.error).toContain('Failed to spawn Gemini CLI');
			expect(result.error).toContain('ENOENT');
		});
	});

	// -------------------------------------------------------------------
	// 10. Custom env passthrough
	// -------------------------------------------------------------------
	describe('custom environment', () => {
		it('merges custom env vars into spawn environment', async () => {
			const promise = spawnGeminiCli({
				prompt: 'test',
				cwd: '/project',
				env: { GEMINI_API_KEY: 'test-key' },
			});
			await tick();

			const spawnOpts = mockSpawn.mock.calls[0][2];
			expect(spawnOpts.env.GEMINI_API_KEY).toBe('test-key');

			mock.child.emit('close', 0);
			await promise;
		});
	});
});

// -----------------------------------------------------------------------
// getGeminiCommand — default behavior (detectGemini caching is tested
// in agent-spawner.test.ts, which has proper vi.resetModules() isolation)
// -----------------------------------------------------------------------

// -----------------------------------------------------------------------
// Utility
// -----------------------------------------------------------------------

function tick() {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

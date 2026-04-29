/**
 * Tests for src/main/shell-integration/fallbackDetector.ts
 *
 * The fallback detector shells out to `ps` (POSIX) or `wmic` (Windows) and
 * parses the output to find the first child of a given shell PID. We mock
 * `execFileNoThrow` to drive the parser deterministically without hitting
 * the real OS, and we cover the parser separately via the exported
 * `parsePosixPsOutput` / `parseWindowsWmicOutput` helpers so the parsing
 * logic is testable in isolation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../main/utils/execFile', () => ({
	execFileNoThrow: vi.fn(),
}));

import {
	detectForegroundCommand,
	parsePosixPsOutput,
	parseWindowsWmicOutput,
} from '../../../main/shell-integration/fallbackDetector';
import { execFileNoThrow } from '../../../main/utils/execFile';

const mockExecFileNoThrow = vi.mocked(execFileNoThrow);

const ORIGINAL_PLATFORM = process.platform;

function setPlatform(value: NodeJS.Platform): void {
	Object.defineProperty(process, 'platform', { value, configurable: true });
}

function restorePlatform(): void {
	Object.defineProperty(process, 'platform', { value: ORIGINAL_PLATFORM, configurable: true });
}

beforeEach(() => {
	mockExecFileNoThrow.mockReset();
});

afterEach(() => {
	restorePlatform();
});

describe('detectForegroundCommand', () => {
	describe('input validation', () => {
		it('returns null for shellPid 0 without invoking ps', async () => {
			expect(await detectForegroundCommand(0)).toBeNull();
			expect(mockExecFileNoThrow).not.toHaveBeenCalled();
		});

		it('returns null for negative shellPid', async () => {
			expect(await detectForegroundCommand(-1)).toBeNull();
			expect(mockExecFileNoThrow).not.toHaveBeenCalled();
		});

		it('returns null for non-integer shellPid', async () => {
			expect(await detectForegroundCommand(12.5)).toBeNull();
			expect(mockExecFileNoThrow).not.toHaveBeenCalled();
		});

		it('returns null for NaN shellPid', async () => {
			expect(await detectForegroundCommand(Number.NaN)).toBeNull();
			expect(mockExecFileNoThrow).not.toHaveBeenCalled();
		});
	});

	describe('POSIX (darwin/linux)', () => {
		beforeEach(() => setPlatform('darwin'));

		it('invokes ps with -A -o pid=,ppid=,command=', async () => {
			mockExecFileNoThrow.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
			await detectForegroundCommand(1234);
			expect(mockExecFileNoThrow).toHaveBeenCalledWith('ps', ['-A', '-o', 'pid=,ppid=,command=']);
		});

		it('returns the first child command line for the given ppid', async () => {
			mockExecFileNoThrow.mockResolvedValue({
				stdout: [
					'    1     0 /sbin/launchd',
					' 1234     0 /bin/zsh',
					' 5678  1234 /usr/local/bin/btop',
					' 9999     1 /usr/bin/syslogd',
				].join('\n'),
				stderr: '',
				exitCode: 0,
			});
			expect(await detectForegroundCommand(1234)).toBe('/usr/local/bin/btop');
		});

		it('returns null when no child matches the ppid', async () => {
			mockExecFileNoThrow.mockResolvedValue({
				stdout: ' 1234     0 /bin/zsh\n 9999     1 /usr/bin/syslogd\n',
				stderr: '',
				exitCode: 0,
			});
			expect(await detectForegroundCommand(1234)).toBeNull();
		});

		it('returns null when ps exits non-zero', async () => {
			mockExecFileNoThrow.mockResolvedValue({ stdout: '', stderr: 'boom', exitCode: 1 });
			expect(await detectForegroundCommand(1234)).toBeNull();
		});

		it('returns null when ps reports ENOENT (binary missing)', async () => {
			mockExecFileNoThrow.mockResolvedValue({
				stdout: '',
				stderr: 'spawn ps ENOENT',
				exitCode: 'ENOENT',
			});
			expect(await detectForegroundCommand(1234)).toBeNull();
		});

		it('routes through the POSIX branch on linux too', async () => {
			setPlatform('linux');
			mockExecFileNoThrow.mockResolvedValue({
				stdout: ' 5678  1234 /usr/bin/htop',
				stderr: '',
				exitCode: 0,
			});
			expect(await detectForegroundCommand(1234)).toBe('/usr/bin/htop');
			expect(mockExecFileNoThrow).toHaveBeenCalledWith('ps', expect.any(Array));
		});
	});

	describe('Windows', () => {
		beforeEach(() => setPlatform('win32'));

		it('invokes wmic with the expected argv', async () => {
			mockExecFileNoThrow.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
			await detectForegroundCommand(4321);
			expect(mockExecFileNoThrow).toHaveBeenCalledWith('wmic', [
				'process',
				'where',
				'(ParentProcessId=4321)',
				'get',
				'CommandLine,ProcessId',
				'/format:list',
			]);
		});

		it('returns the first CommandLine value', async () => {
			mockExecFileNoThrow.mockResolvedValue({
				stdout: [
					'',
					'CommandLine=C:\\Tools\\btop.exe',
					'ProcessId=5678',
					'',
					'CommandLine=C:\\Other\\thing.exe --flag',
					'ProcessId=9012',
					'',
				].join('\r\n'),
				stderr: '',
				exitCode: 0,
			});
			expect(await detectForegroundCommand(4321)).toBe('C:\\Tools\\btop.exe');
		});

		it('returns null when wmic exits non-zero', async () => {
			mockExecFileNoThrow.mockResolvedValue({ stdout: '', stderr: '', exitCode: 1 });
			expect(await detectForegroundCommand(4321)).toBeNull();
		});

		it('returns null when wmic produces no CommandLine records', async () => {
			mockExecFileNoThrow.mockResolvedValue({
				stdout: 'No Instance(s) Available.',
				stderr: '',
				exitCode: 0,
			});
			expect(await detectForegroundCommand(4321)).toBeNull();
		});
	});
});

describe('parsePosixPsOutput', () => {
	it('handles real-world ps output with leading whitespace', () => {
		const stdout = [
			'    1     0 /sbin/launchd',
			'  100     1 /usr/sbin/cfprefsd',
			' 1234     0 /bin/zsh',
			' 5678  1234 /usr/local/bin/btop',
			' 5679  1234 vim notes.md',
			' 9999     1 /usr/bin/syslogd',
		].join('\n');
		expect(parsePosixPsOutput(stdout, 1234)).toEqual(['/usr/local/bin/btop', 'vim notes.md']);
	});

	it('preserves spaces inside command lines', () => {
		const stdout = ' 5678  1234 npm run dev --workspace=app';
		expect(parsePosixPsOutput(stdout, 1234)).toEqual(['npm run dev --workspace=app']);
	});

	it('skips blank lines and unparseable rows', () => {
		const stdout = ['', '  ', 'garbage line with no numbers', ' 5678  1234 ok'].join('\n');
		expect(parsePosixPsOutput(stdout, 1234)).toEqual(['ok']);
	});

	it('returns empty array when no row matches the ppid', () => {
		const stdout = ' 5678  9999 something else';
		expect(parsePosixPsOutput(stdout, 1234)).toEqual([]);
	});

	it('returns empty array on empty stdout', () => {
		expect(parsePosixPsOutput('', 1234)).toEqual([]);
	});

	it('drops rows whose command field is whitespace only', () => {
		const stdout = ' 5678  1234   \n 5679  1234 real command';
		expect(parsePosixPsOutput(stdout, 1234)).toEqual(['real command']);
	});
});

describe('parseWindowsWmicOutput', () => {
	it('returns CommandLine values in record order', () => {
		const stdout = [
			'',
			'CommandLine=C:\\A\\first.exe',
			'ProcessId=10',
			'',
			'CommandLine=C:\\B\\second.exe --flag',
			'ProcessId=20',
			'',
		].join('\r\n');
		expect(parseWindowsWmicOutput(stdout)).toEqual([
			'C:\\A\\first.exe',
			'C:\\B\\second.exe --flag',
		]);
	});

	it('handles LF-only line endings', () => {
		const stdout = 'CommandLine=foo\nProcessId=1\n\nCommandLine=bar\nProcessId=2\n';
		expect(parseWindowsWmicOutput(stdout)).toEqual(['foo', 'bar']);
	});

	it('skips blank CommandLine entries', () => {
		const stdout = 'CommandLine=\r\nProcessId=1\r\nCommandLine=real\r\nProcessId=2\r\n';
		expect(parseWindowsWmicOutput(stdout)).toEqual(['real']);
	});

	it('returns empty array on empty stdout', () => {
		expect(parseWindowsWmicOutput('')).toEqual([]);
	});

	it('ignores ProcessId-only and unrelated lines', () => {
		const stdout = 'ProcessId=1\r\nCaption=foo.exe\r\nCommandLine=foo.exe arg\r\n';
		expect(parseWindowsWmicOutput(stdout)).toEqual(['foo.exe arg']);
	});
});

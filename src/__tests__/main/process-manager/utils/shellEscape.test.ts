import { describe, it, expect } from 'vitest';
import {
	escapeCmdArg,
	escapePowerShellArg,
	escapeCmdArgs,
	escapePowerShellArgs,
	isPowerShellShell,
	escapeArgsForShell,
} from '../../../../main/process-manager/utils/shellEscape';

describe('shellEscape', () => {
	describe('escapeCmdArg', () => {
		it('should not escape simple arguments', () => {
			expect(escapeCmdArg('hello')).toBe('hello');
			expect(escapeCmdArg('world123')).toBe('world123');
			expect(escapeCmdArg('file.txt')).toBe('file.txt');
		});

		it('should escape arguments with spaces', () => {
			expect(escapeCmdArg('hello world')).toBe('"hello world"');
			expect(escapeCmdArg('path with spaces')).toBe('"path with spaces"');
		});

		it('should escape arguments with special characters', () => {
			expect(escapeCmdArg('foo&bar')).toBe('"foo&bar"');
			expect(escapeCmdArg('foo|bar')).toBe('"foo|bar"');
			expect(escapeCmdArg('foo<bar')).toBe('"foo<bar"');
			expect(escapeCmdArg('foo>bar')).toBe('"foo>bar"');
		});

		it('should escape double quotes by doubling them', () => {
			expect(escapeCmdArg('say "hello"')).toBe('"say ""hello"""');
		});

		it('should escape carets by doubling them', () => {
			expect(escapeCmdArg('foo^bar')).toBe('"foo^^bar"');
		});

		it('should escape arguments with newlines', () => {
			expect(escapeCmdArg('line1\nline2')).toBe('"line1\nline2"');
			expect(escapeCmdArg('line1\r\nline2')).toBe('"line1\r\nline2"');
		});

		it('should escape long arguments', () => {
			const longArg = 'a'.repeat(150);
			expect(escapeCmdArg(longArg)).toBe(`"${longArg}"`);
		});
	});

	describe('escapePowerShellArg', () => {
		it('should not escape simple arguments', () => {
			expect(escapePowerShellArg('hello')).toBe('hello');
			expect(escapePowerShellArg('world123')).toBe('world123');
			expect(escapePowerShellArg('file.txt')).toBe('file.txt');
		});

		it('should escape arguments with spaces', () => {
			expect(escapePowerShellArg('hello world')).toBe("'hello world'");
		});

		it('should escape arguments with special characters', () => {
			expect(escapePowerShellArg('foo&bar')).toBe("'foo&bar'");
			expect(escapePowerShellArg('foo$bar')).toBe("'foo$bar'");
			expect(escapePowerShellArg('foo`bar')).toBe("'foo`bar'");
		});

		it('should escape single quotes by doubling them', () => {
			expect(escapePowerShellArg("it's")).toBe("'it''s'");
			expect(escapePowerShellArg("say 'hello'")).toBe("'say ''hello'''");
		});

		it('should escape arguments with PowerShell-specific characters', () => {
			expect(escapePowerShellArg('foo@bar')).toBe("'foo@bar'");
			expect(escapePowerShellArg('foo{bar}')).toBe("'foo{bar}'");
			expect(escapePowerShellArg('foo[bar]')).toBe("'foo[bar]'");
		});

		it('should escape long arguments', () => {
			const longArg = 'a'.repeat(150);
			expect(escapePowerShellArg(longArg)).toBe(`'${longArg}'`);
		});
	});

	describe('escapeCmdArgs', () => {
		it('should escape multiple arguments', () => {
			const result = escapeCmdArgs(['simple', 'with space', 'say "hi"']);
			expect(result).toEqual(['simple', '"with space"', '"say ""hi"""']);
		});
	});

	describe('escapePowerShellArgs', () => {
		it('should escape multiple arguments', () => {
			const result = escapePowerShellArgs(['simple', 'with space', "it's"]);
			expect(result).toEqual(['simple', "'with space'", "'it''s'"]);
		});
	});

	describe('isPowerShellShell', () => {
		it('should detect Windows PowerShell', () => {
			expect(isPowerShellShell('powershell.exe')).toBe(true);
			expect(isPowerShellShell('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')).toBe(
				true
			);
			expect(isPowerShellShell('PowerShell.exe')).toBe(true);
		});

		it('should detect PowerShell Core (pwsh)', () => {
			expect(isPowerShellShell('pwsh')).toBe(true);
			expect(isPowerShellShell('pwsh.exe')).toBe(true);
			expect(isPowerShellShell('C:\\Program Files\\PowerShell\\7\\pwsh.exe')).toBe(true);
		});

		it('should not detect cmd.exe as PowerShell', () => {
			expect(isPowerShellShell('cmd.exe')).toBe(false);
			expect(isPowerShellShell('C:\\Windows\\System32\\cmd.exe')).toBe(false);
		});

		it('should handle undefined and empty strings', () => {
			expect(isPowerShellShell(undefined)).toBe(false);
			expect(isPowerShellShell('')).toBe(false);
		});
	});

	describe('escapeArgsForShell', () => {
		it('should use PowerShell escaping for PowerShell shells', () => {
			const result = escapeArgsForShell(['with space', "it's"], 'powershell.exe');
			expect(result).toEqual(["'with space'", "'it''s'"]);
		});

		it('should use cmd.exe escaping for cmd.exe shells', () => {
			const result = escapeArgsForShell(['with space', 'say "hi"'], 'cmd.exe');
			expect(result).toEqual(['"with space"', '"say ""hi"""']);
		});

		it('should default to cmd.exe escaping when no shell specified', () => {
			const result = escapeArgsForShell(['with space', 'say "hi"']);
			expect(result).toEqual(['"with space"', '"say ""hi"""']);
		});
	});
});

import { describe, it, expect, vi } from 'vitest';
import {
	escapeCmdArg,
	escapePowerShellArg,
	escapeCmdArgs,
	escapePowerShellArgs,
	isPowerShellShell,
	escapeArgsForShell,
	canRunWithoutShell,
	getWindowsShellForAgentExecution,
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

		// ── Per-metacharacter tests (S-03 audit) ────────────────────────

		it('should escape & (command separator)', () => {
			expect(escapeCmdArg('foo&bar')).toBe('"foo&bar"');
			expect(escapeCmdArg('a && b')).toBe('"a && b"');
		});

		it('should escape | (pipe)', () => {
			expect(escapeCmdArg('foo|bar')).toBe('"foo|bar"');
		});

		it('should escape ; (separator)', () => {
			expect(escapeCmdArg('foo;bar')).toBe('"foo;bar"');
		});

		it('should escape > (redirect out)', () => {
			expect(escapeCmdArg('foo>bar')).toBe('"foo>bar"');
			expect(escapeCmdArg('a >> b')).toBe('"a >> b"');
		});

		it('should escape < (redirect in)', () => {
			expect(escapeCmdArg('foo<bar')).toBe('"foo<bar"');
		});

		it('should escape ^ (caret/escape char) by doubling', () => {
			expect(escapeCmdArg('foo^bar')).toBe('"foo^^bar"');
			expect(escapeCmdArg('a^^b')).toBe('"a^^^^b"');
		});

		it('should escape % (env var expansion) by doubling', () => {
			expect(escapeCmdArg('foo%PATH%bar')).toBe('"foo%%PATH%%bar"');
			expect(escapeCmdArg('%USERPROFILE%')).toBe('"%%USERPROFILE%%"');
			expect(escapeCmdArg('100%')).toBe('"100%%"');
		});

		it('should escape ! (delayed expansion)', () => {
			// ! triggers quoting; inside double quotes it is literal unless delayed expansion is enabled
			expect(escapeCmdArg('hello!')).toBe('"hello!"');
			expect(escapeCmdArg('!PATH!')).toBe('"!PATH!"');
		});

		it('should escape ( and ) (grouping)', () => {
			expect(escapeCmdArg('foo(bar)')).toBe('"foo(bar)"');
		});

		it('should escape backticks', () => {
			expect(escapeCmdArg('foo`bar')).toBe('"foo`bar"');
		});

		it('should escape $ (dollar sign)', () => {
			expect(escapeCmdArg('foo$bar')).toBe('"foo$bar"');
			expect(escapeCmdArg('$HOME')).toBe('"$HOME"');
		});

		it('should escape \\n (newline)', () => {
			expect(escapeCmdArg('line1\nline2')).toBe('"line1\nline2"');
		});

		it('should escape \\r (carriage return)', () => {
			expect(escapeCmdArg('line1\rline2')).toBe('"line1\rline2"');
			expect(escapeCmdArg('line1\r\nline2')).toBe('"line1\r\nline2"');
		});

		it('should escape double quotes by doubling them', () => {
			expect(escapeCmdArg('say "hello"')).toBe('"say ""hello"""');
		});

		it('should escape long arguments', () => {
			const longArg = 'a'.repeat(150);
			expect(escapeCmdArg(longArg)).toBe(`"${longArg}"`);
		});

		// ── Combined metacharacter tests ────────────────────────────────

		it('should handle combined ^ and % correctly', () => {
			// ^ is doubled by ^ replacement, % is doubled by % replacement (independent)
			expect(escapeCmdArg('^%PATH%')).toBe('"^^%%PATH%%"');
		});

		it('should handle prompt-like content with multiple metacharacters', () => {
			const prompt = 'Run: cmd /c "echo %PATH%" & dir > output.txt';
			const escaped = escapeCmdArg(prompt);
			// Should be wrapped in double quotes with " doubled and % doubled
			expect(escaped).toContain('%%PATH%%');
			expect(escaped).toContain('""echo');
			expect(escaped.startsWith('"')).toBe(true);
			expect(escaped.endsWith('"')).toBe(true);
		});

		it('should handle empty string', () => {
			// Empty string has no special chars and is short, returned as-is
			expect(escapeCmdArg('')).toBe('');
		});

		it('should handle all metacharacters in a single string', () => {
			const allMeta = '& | ; > < ^ % ! ( ) ` $ " \n \r';
			const result = escapeCmdArg(allMeta);
			// Should be quoted and have " doubled, ^ doubled, % doubled
			expect(result.startsWith('"')).toBe(true);
			expect(result.endsWith('"')).toBe(true);
			expect(result).toContain('""'); // doubled quotes
			expect(result).toContain('^^'); // doubled carets
			expect(result).toContain('%%'); // doubled percents
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

		// ── Per-metacharacter tests for PowerShell ──────────────────────

		it('should escape & (call operator)', () => {
			expect(escapePowerShellArg('foo&bar')).toBe("'foo&bar'");
		});

		it('should escape | (pipe)', () => {
			expect(escapePowerShellArg('foo|bar')).toBe("'foo|bar'");
		});

		it('should escape ; (statement separator)', () => {
			expect(escapePowerShellArg('foo;bar')).toBe("'foo;bar'");
		});

		it('should escape > and < (redirects)', () => {
			expect(escapePowerShellArg('foo>bar')).toBe("'foo>bar'");
			expect(escapePowerShellArg('foo<bar')).toBe("'foo<bar'");
		});

		it('should escape $ (variable prefix)', () => {
			expect(escapePowerShellArg('foo$bar')).toBe("'foo$bar'");
			expect(escapePowerShellArg('$env:PATH')).toBe("'$env:PATH'");
		});

		it('should escape ` (backtick/escape char)', () => {
			expect(escapePowerShellArg('foo`bar')).toBe("'foo`bar'");
			expect(escapePowerShellArg('`n')).toBe("'`n'");
		});

		it('should escape @ (array/splatting)', () => {
			expect(escapePowerShellArg('foo@bar')).toBe("'foo@bar'");
		});

		it('should escape { } (script blocks)', () => {
			expect(escapePowerShellArg('foo{bar}')).toBe("'foo{bar}'");
		});

		it('should escape [ ] (type literals)', () => {
			expect(escapePowerShellArg('foo[bar]')).toBe("'foo[bar]'");
		});

		it('should escape single quotes by doubling them', () => {
			expect(escapePowerShellArg("it's")).toBe("'it''s'");
			expect(escapePowerShellArg("say 'hello'")).toBe("'say ''hello'''");
		});

		it('should escape , (comma/array element separator)', () => {
			expect(escapePowerShellArg('a,b,c')).toBe("'a,b,c'");
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

		it('should escape % in multiple arguments', () => {
			const result = escapeCmdArgs(['--flag', '%PATH%', 'normal']);
			expect(result).toEqual(['--flag', '"%%PATH%%"', 'normal']);
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
			expect(
				isPowerShellShell('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
			).toBe(true);
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

		it('should escape % for cmd.exe but not PowerShell (uses single quotes)', () => {
			const cmdResult = escapeArgsForShell(['%PATH%'], 'cmd.exe');
			expect(cmdResult).toEqual(['"%%PATH%%"']);

			const psResult = escapeArgsForShell(['%PATH%'], 'powershell.exe');
			expect(psResult).toEqual(["'%PATH%'"]);
		});
	});

	describe('canRunWithoutShell', () => {
		it('should return true for fully-resolved .exe paths', () => {
			expect(canRunWithoutShell('C:\\Program Files\\Node\\node.exe')).toBe(true);
			expect(canRunWithoutShell('C:\\tools\\gemini.exe')).toBe(true);
			expect(canRunWithoutShell('/usr/local/bin/agent.exe')).toBe(true);
		});

		it('should return false for .cmd files (require shell)', () => {
			expect(canRunWithoutShell('C:\\Users\\user\\AppData\\Roaming\\npm\\gemini.cmd')).toBe(false);
		});

		it('should return false for .bat files (require shell)', () => {
			expect(canRunWithoutShell('C:\\scripts\\setup.bat')).toBe(false);
		});

		it('should return false for bare basenames without path', () => {
			expect(canRunWithoutShell('gemini.exe')).toBe(false);
			expect(canRunWithoutShell('node.exe')).toBe(false);
		});

		it('should return false for extensionless basenames', () => {
			expect(canRunWithoutShell('gemini')).toBe(false);
			expect(canRunWithoutShell('claude')).toBe(false);
		});

		it('should return false for extensionless paths (may be scripts)', () => {
			expect(canRunWithoutShell('/usr/local/bin/gemini')).toBe(false);
			expect(canRunWithoutShell('C:\\tools\\opencode')).toBe(false);
		});
	});

	describe('getWindowsShellForAgentExecution', () => {
		it('should prefer custom shell path when provided', () => {
			const result = getWindowsShellForAgentExecution({
				customShellPath: 'C:\\Custom\\MyShell.exe',
			});
			expect(result.shell).toBe('C:\\Custom\\MyShell.exe');
			expect(result.useShell).toBe(true);
			expect(result.source).toBe('custom');
		});

		it('should trim custom shell path', () => {
			const result = getWindowsShellForAgentExecution({
				customShellPath: '  C:\\Custom\\MyShell.exe  ',
			});
			expect(result.shell).toBe('C:\\Custom\\MyShell.exe');
			expect(result.source).toBe('custom');
		});

		it('should use current shell when provided and not cmd.exe', () => {
			const result = getWindowsShellForAgentExecution({
				currentShell: 'pwsh.exe',
			});
			expect(result.shell).toBe('pwsh.exe');
			expect(result.useShell).toBe(true);
			expect(result.source).toBe('current');
		});

		it('should skip cmd.exe as current shell and fall back to PowerShell', () => {
			const result = getWindowsShellForAgentExecution({
				currentShell: 'cmd.exe',
			});
			expect(result.shell).toContain('powershell');
			expect(result.useShell).toBe(true);
			expect(result.source).toBe('powershell-default');
		});

		it('should skip CMD.EXE (case insensitive) and fall back to PowerShell', () => {
			const result = getWindowsShellForAgentExecution({
				currentShell: 'C:\\Windows\\System32\\CMD.EXE',
			});
			expect(result.shell).toContain('powershell');
			expect(result.source).toBe('powershell-default');
		});

		it('should NOT skip shells with "cmd" in the path but not the basename', () => {
			// This tests the fix for overly broad .includes('cmd') check
			// e.g., C:\Users\commander\bash.exe should not be skipped
			const result = getWindowsShellForAgentExecution({
				currentShell: 'C:\\Users\\commander\\bash.exe',
			});
			expect(result.shell).toBe('C:\\Users\\commander\\bash.exe');
			expect(result.source).toBe('current');
		});

		it('should skip bare "cmd" as current shell', () => {
			const result = getWindowsShellForAgentExecution({
				currentShell: 'cmd',
			});
			expect(result.shell).toContain('powershell');
			expect(result.source).toBe('powershell-default');
		});

		it('should default to PowerShell when no options provided', () => {
			const result = getWindowsShellForAgentExecution();
			expect(result.shell).toContain('powershell');
			expect(result.useShell).toBe(true);
			expect(result.source).toBe('powershell-default');
		});

		it('should default to PowerShell when empty options provided', () => {
			const result = getWindowsShellForAgentExecution({});
			expect(result.shell).toContain('powershell');
			expect(result.source).toBe('powershell-default');
		});

		it('should ignore empty custom shell path', () => {
			const result = getWindowsShellForAgentExecution({
				customShellPath: '',
				currentShell: 'bash.exe',
			});
			expect(result.shell).toBe('bash.exe');
			expect(result.source).toBe('current');
		});

		it('should ignore whitespace-only custom shell path', () => {
			const result = getWindowsShellForAgentExecution({
				customShellPath: '   ',
				currentShell: 'bash.exe',
			});
			expect(result.shell).toBe('bash.exe');
			expect(result.source).toBe('current');
		});

		it('should prefer custom shell path over current shell', () => {
			const result = getWindowsShellForAgentExecution({
				customShellPath: 'C:\\Custom\\Shell.exe',
				currentShell: 'bash.exe',
			});
			expect(result.shell).toBe('C:\\Custom\\Shell.exe');
			expect(result.source).toBe('custom');
		});

		it('should use PSHOME environment variable when available', () => {
			const fs = require('fs');
			const originalExistsSync = fs.existsSync;
			const originalPshome = process.env.PSHOME;

			try {
				process.env.PSHOME = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0';
				fs.existsSync = vi.fn((p: string) =>
					p === 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
						? true
						: originalExistsSync(p)
				);
				const result = getWindowsShellForAgentExecution({});
				expect(result.shell).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
				expect(result.source).toBe('powershell-default');
			} finally {
				fs.existsSync = originalExistsSync;
				if (originalPshome === undefined) {
					delete process.env.PSHOME;
				} else {
					process.env.PSHOME = originalPshome;
				}
			}
		});
	});
});

/**
 * Shell argument escaping utilities for Windows cmd.exe and PowerShell.
 *
 * These functions handle escaping command line arguments to prevent injection
 * and ensure proper argument passing when spawning processes via shell.
 *
 * References:
 * - cmd.exe escaping: https://docs.microsoft.com/en-us/windows-server/administration/windows-commands/cmd
 * - PowerShell escaping: https://docs.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_quoting_rules
 *
 * For production use, consider using the 'shescape' npm package which provides
 * more comprehensive cross-platform shell escaping with extensive testing.
 */

/**
 * Characters that require quoting in cmd.exe.
 * Based on cmd.exe special characters: https://ss64.com/nt/syntax-esc.html
 */
const CMD_SPECIAL_CHARS = /[ &|<>^%!()"\n\r#?*]/;

/**
 * Characters that require quoting in PowerShell.
 * Based on PowerShell special characters: https://ss64.com/ps/syntax-esc.html
 */
const POWERSHELL_SPECIAL_CHARS = /[ &|<>^%!()"\n\r#?*`$@{}[\]';,]/;

/**
 * Escape a single argument for use in cmd.exe.
 *
 * Strategy:
 * 1. If the argument contains special characters or is long, wrap in double quotes
 * 2. Escape existing double quotes by doubling them
 * 3. Escape carets (^) as they're the escape character in cmd.exe
 *
 * @param arg - The argument to escape
 * @returns The escaped argument safe for cmd.exe
 */
export function escapeCmdArg(arg: string): string {
	// If no special characters and not too long, return as-is
	if (!CMD_SPECIAL_CHARS.test(arg) && arg.length <= 100) {
		return arg;
	}

	// Escape double quotes by doubling them, and carets by doubling
	const escaped = arg.replace(/"/g, '""').replace(/\^/g, '^^');

	// Wrap in double quotes
	return `"${escaped}"`;
}

/**
 * Escape a single argument for use in PowerShell.
 *
 * Strategy:
 * 1. If the argument contains special characters or is long, wrap in single quotes
 * 2. Escape existing single quotes by doubling them (PowerShell's single-quote escape)
 *
 * Single quotes in PowerShell treat the content as a literal string, which is
 * safer than double quotes (which allow variable expansion).
 *
 * @param arg - The argument to escape
 * @returns The escaped argument safe for PowerShell
 */
export function escapePowerShellArg(arg: string): string {
	// If no special characters and not too long, return as-is
	if (!POWERSHELL_SPECIAL_CHARS.test(arg) && arg.length <= 100) {
		return arg;
	}

	// Escape single quotes by doubling them (PowerShell's escape mechanism)
	const escaped = arg.replace(/'/g, "''");

	// Wrap in single quotes (prevents variable expansion)
	return `'${escaped}'`;
}

/**
 * Escape an array of arguments for use in cmd.exe.
 *
 * @param args - The arguments to escape
 * @returns The escaped arguments safe for cmd.exe
 */
export function escapeCmdArgs(args: string[]): string[] {
	return args.map(escapeCmdArg);
}

/**
 * Escape an array of arguments for use in PowerShell.
 *
 * @param args - The arguments to escape
 * @returns The escaped arguments safe for PowerShell
 */
export function escapePowerShellArgs(args: string[]): string[] {
	return args.map(escapePowerShellArg);
}

/**
 * Detect if a shell path refers to PowerShell.
 *
 * @param shellPath - The shell path to check
 * @returns True if the shell is PowerShell (either Windows PowerShell or PowerShell Core)
 */
export function isPowerShellShell(shellPath: string | undefined): boolean {
	if (!shellPath) return false;
	const lower = shellPath.toLowerCase();
	return lower.includes('powershell') || lower.includes('pwsh');
}

/**
 * Escape arguments based on the target shell.
 *
 * @param args - The arguments to escape
 * @param shell - The shell path or name (optional, defaults to cmd.exe behavior)
 * @returns The escaped arguments
 */
export function escapeArgsForShell(args: string[], shell?: string): string[] {
	if (isPowerShellShell(shell)) {
		return escapePowerShellArgs(args);
	}
	return escapeCmdArgs(args);
}

/**
 * Configuration options for Windows shell selection.
 */
export interface WindowsShellConfig {
	/**
	 * User-configured custom shell path (takes highest priority).
	 * This is typically from settingsStore.get('customShellPath').
	 */
	customShellPath?: string;
	/**
	 * Currently selected shell (e.g., from settings or terminal config).
	 * Used if no customShellPath is provided.
	 */
	currentShell?: string;
}

/**
 * Result of Windows shell selection.
 */
export interface WindowsShellResult {
	/**
	 * The shell path to use for spawning processes.
	 */
	shell: string;
	/**
	 * Whether shell execution should be enabled (runInShell: true).
	 */
	useShell: boolean;
	/**
	 * The source of the shell selection (for logging).
	 */
	source: 'custom' | 'current' | 'powershell-default';
}

/**
 * Escape prompt content for PowerShell stdin delivery.
 *
 * NOTE: When sending prompt content via stdin in raw mode to a PowerShell process,
 * PowerShell treats the input as literal text, NOT as code to parse. Therefore,
 * no escaping is needed. Special characters like `-`, `$`, etc. in plain text
 * content are not interpreted as operators.
 *
 * The original implementation incorrectly converted lines starting with `-` to comments,
 * which corrupted markdown list formatting and other content.
 *
 * PowerShell only interprets special characters as operators when they appear in
 * actual command code being executed, not in text data being read from stdin.
 *
 * @param content - The prompt content to escape
 * @returns The content unchanged (no escaping needed for stdin)
 */
export function escapePowerShellPromptContent(content: string): string {
	// PowerShell stdin treats input as literal text, so no escaping is needed.
	// Returning the content as-is ensures markdown formatting and other content
	// is preserved exactly as intended.
	return content;
}

/**
 * Get the preferred shell for Windows agent execution.
 *
 * This function implements the shell selection priority for Windows to avoid
 * cmd.exe command line length limits (~8191 characters). The priority is:
 *
 * 1. User-configured custom shell path (if provided)
 * 2. Currently selected shell (if provided and not cmd.exe)
 * 3. PowerShell (default fallback to avoid cmd.exe limits)
 *
 * Why avoid cmd.exe:
 * - cmd.exe has a hard limit of ~8191 characters for command lines
 * - Long prompts (especially with system prompts) can easily exceed this
 * - The error message is: "Die Befehlszeile ist zu lang" (German for "The command line is too long")
 * - PowerShell has a much higher limit (32KB or more depending on version)
 *
 * @param config - Configuration options for shell selection
 * @returns The shell to use and whether to enable shell execution
 */
export function getWindowsShellForAgentExecution(
	config: WindowsShellConfig = {}
): WindowsShellResult {
	const { customShellPath, currentShell } = config;

	// 1. User-configured custom shell path takes priority
	if (customShellPath && customShellPath.trim()) {
		return {
			shell: customShellPath.trim(),
			useShell: true,
			source: 'custom',
		};
	}

	// 2. Use current shell if provided (and not cmd.exe, which has limits)
	if (currentShell && currentShell.trim()) {
		const shellLower = currentShell.toLowerCase();
		// Skip cmd.exe to avoid command line length limits
		if (!shellLower.includes('cmd')) {
			return {
				shell: currentShell.trim(),
				useShell: true,
				source: 'current',
			};
		}
	}

	// 3. Default to PowerShell to avoid cmd.exe limits
	// Use PSHOME environment variable if available for a more reliable path
	const powerShellPath = process.env.PSHOME
		? `${process.env.PSHOME}\\powershell.exe`
		: 'powershell.exe';

	return {
		shell: powerShellPath,
		useShell: true,
		source: 'powershell-default',
	};
}

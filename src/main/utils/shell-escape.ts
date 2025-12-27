/**
 * Shell escaping utilities for SSH remote execution.
 *
 * These utilities ensure safe command construction when building
 * shell commands for remote execution via SSH. Critical for preventing
 * shell injection attacks.
 */

/**
 * Escape a string for safe inclusion in a shell command.
 *
 * Uses single quotes and escapes any single quotes within the string.
 * This is the safest method for shell escaping as single-quoted strings
 * are treated literally in POSIX shells (no variable expansion, no
 * command substitution).
 *
 * @param str The string to escape
 * @returns The escaped string, wrapped in single quotes
 *
 * @example
 * shellEscape("hello world") // => "'hello world'"
 * shellEscape("it's fine")   // => "'it'\\''s fine'"
 * shellEscape("$HOME")       // => "'$HOME'" (no expansion)
 */
export function shellEscape(str: string): string {
  // Handle empty string
  if (str === '') {
    return "''";
  }

  // Use single quotes and escape any single quotes within
  // The pattern 'text'\''more' breaks out of single quotes,
  // adds an escaped single quote, then re-enters single quotes
  return `'${str.replace(/'/g, "'\\''")}'`;
}

/**
 * Escape multiple strings for shell inclusion.
 *
 * @param args Array of strings to escape
 * @returns Array of escaped strings
 */
export function shellEscapeArgs(args: string[]): string[] {
  return args.map(shellEscape);
}

/**
 * Build a shell command string from a command and arguments.
 *
 * @param command The command to run
 * @param args Arguments to the command
 * @returns A properly escaped shell command string
 *
 * @example
 * buildShellCommand("echo", ["hello", "world"])
 * // => "echo 'hello' 'world'"
 */
export function buildShellCommand(command: string, args: string[]): string {
  return [command, ...shellEscapeArgs(args)].join(' ');
}

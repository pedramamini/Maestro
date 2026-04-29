/**
 * `ps`-based fallback for detecting the command currently running in a
 * terminal tab when shell integration is unavailable.
 *
 * The OSC-133 / OSC-7 path (zsh + bash hooks via PtySpawner OSC parser into
 * `proc.shellIntegration`) covers the supported shells, but a terminal tab
 * can launch any shell (sh, fish, dash, ksh, ...) or the user can disable
 * shell integration entirely. In those cases we still want to record the
 * foreground command so a restart can offer to re-run it.
 *
 * Strategy: enumerate child processes of the shell PID and return the first
 * child's command line. Loose by design — there is no portable "foreground
 * process group" lookup, and the primary use case is long-running foreground
 * programs (btop, vim, npm run dev, etc.) where a single child dominates the
 * shell's process tree.
 *
 * Returns `null` (not throws) on every failure mode: invalid PID, missing
 * binary, parse error, no children. This is a best-effort fallback — silently
 * giving up is the right behavior, since the persistence layer treats a null
 * command identically to "shell was idle".
 *
 * Note on the plan: the original Phase-7 plan referenced a hypothetical
 * `getChildProcesses()` helper at `src/main/process-manager/utils/childProcessInfo.ts`
 * that does not exist in this codebase. Rather than create a new shared utility
 * with no other consumer today, the per-platform child-listing logic lives in
 * this file. If a future feature needs the same primitive, lift the
 * `listChildProcesses()` private into a shared util at that point.
 */

import { execFileNoThrow } from '../utils/execFile';
import { isWindows } from '../../shared/platformDetection';

/**
 * Return the command line of the first child process of `shellPid`, or `null`
 * if no children exist or the platform-specific lookup fails.
 *
 * The "first" child is whatever the OS lists first — `ps` orders by PID on
 * POSIX, which roughly matches launch order. For typical interactive use
 * (one foreground program at a time) there is exactly one child, so the
 * ordering is moot.
 */
export async function detectForegroundCommand(shellPid: number): Promise<string | null> {
	if (!Number.isInteger(shellPid) || shellPid <= 0) return null;
	const children = await listChildProcesses(shellPid);
	return children.length > 0 ? children[0] : null;
}

async function listChildProcesses(ppid: number): Promise<string[]> {
	return isWindows() ? listChildrenWindows(ppid) : listChildrenPosix(ppid);
}

/**
 * POSIX listing via `ps -A -o pid=,ppid=,command=`. The trailing `=` on each
 * field name suppresses the header row, leaving only the data lines:
 *
 *     12345  6789 /usr/bin/btop
 *
 * macOS and Linux both accept this `ps` invocation with identical output, so
 * one branch covers both. We intentionally use the BSD-style command rather
 * than Linux-specific `--ppid` so the same code works on macOS without an
 * extra branch.
 */
async function listChildrenPosix(ppid: number): Promise<string[]> {
	const result = await execFileNoThrow('ps', ['-A', '-o', 'pid=,ppid=,command=']);
	if (result.exitCode !== 0) return [];
	return parsePosixPsOutput(result.stdout, ppid);
}

/**
 * Parse `ps -A -o pid=,ppid=,command=` output, returning the command lines
 * whose ppid matches. Exported for testability — the line-by-line tokenization
 * is the part most likely to break under unexpected `ps` output formatting.
 */
export function parsePosixPsOutput(stdout: string, ppid: number): string[] {
	const matches: string[] = [];
	for (const rawLine of stdout.split('\n')) {
		const line = rawLine.trimStart();
		if (!line) continue;
		// Two whitespace-delimited integers (pid, ppid), then the command line
		// which may itself contain spaces — so we cannot just split on /\s+/.
		const m = /^(\d+)\s+(\d+)\s+(.*)$/.exec(line);
		if (!m) continue;
		const lineParentPid = Number(m[2]);
		if (lineParentPid !== ppid) continue;
		const command = m[3].trim();
		if (command) matches.push(command);
	}
	return matches;
}

/**
 * Windows listing via `wmic process where ... get`. wmic is deprecated as of
 * Windows 11 22H2 but still ships and is the simplest cross-version primitive
 * available without a PowerShell startup tax. If wmic is missing on a given
 * host, the call returns a non-zero exit and we yield no children — same as
 * POSIX, the caller treats it as "shell was idle".
 *
 * Output format with `/format:list`:
 *
 *     CommandLine=C:\path\to\program.exe --flag
 *     ProcessId=1234
 *
 *     CommandLine=...
 *     ProcessId=...
 *
 * Records are blank-line separated; we only need the `CommandLine=` lines.
 */
async function listChildrenWindows(ppid: number): Promise<string[]> {
	const result = await execFileNoThrow('wmic', [
		'process',
		'where',
		`(ParentProcessId=${ppid})`,
		'get',
		'CommandLine,ProcessId',
		'/format:list',
	]);
	if (result.exitCode !== 0) return [];
	return parseWindowsWmicOutput(result.stdout);
}

/**
 * Parse `wmic ... /format:list` output and return the `CommandLine` values in
 * record order. Exported for testability.
 */
export function parseWindowsWmicOutput(stdout: string): string[] {
	const matches: string[] = [];
	for (const rawLine of stdout.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line.startsWith('CommandLine=')) continue;
		const command = line.slice('CommandLine='.length).trim();
		if (command) matches.push(command);
	}
	return matches;
}

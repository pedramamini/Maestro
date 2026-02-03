/**
 * SSH Command Builder utilities for remote agent execution.
 *
 * Provides functions to construct SSH command invocations that wrap
 * agent commands for remote execution. These utilities work with
 * SshRemoteManager and ProcessManager to enable executing AI agents
 * on remote hosts via SSH.
 */

import { SshRemoteConfig } from '../../shared/types';
import { shellEscape, buildShellCommand } from './shell-escape';
import { expandTilde } from '../../shared/pathUtils';
import { logger } from './logger';
import { resolveSshPath } from './cliDetection';

/**
 * Result of building an SSH command.
 * Contains the command and arguments to pass to spawn().
 */
export interface SshCommandResult {
	/** The command to execute ('ssh') */
	command: string;
	/** Arguments for the SSH command */
	args: string[];
}

/**
 * Options for building the remote command.
 */
export interface RemoteCommandOptions {
	/** The command to execute on the remote host */
	command: string;
	/** Arguments for the command */
	args: string[];
	/** Working directory on the remote host (optional) */
	cwd?: string;
	/** Environment variables to set on the remote (optional) */
	env?: Record<string, string>;
	/** Indicates the caller will send input via stdin to the remote command (optional) */
	useStdin?: boolean;
}

/**
 * Default SSH options for all connections.
 * These options ensure non-interactive, key-based authentication.
 */
const DEFAULT_SSH_OPTIONS: Record<string, string> = {
	BatchMode: 'yes', // Disable password prompts (key-only)
	StrictHostKeyChecking: 'accept-new', // Auto-accept new host keys
	ConnectTimeout: '10', // Connection timeout in seconds
	ClearAllForwardings: 'yes', // Disable port forwarding from SSH config (avoids "Address already in use" errors)
	RequestTTY: 'no', // Default: do NOT request a TTY. We only force a TTY for specific remote modes (e.g., --print)
	LogLevel: 'ERROR', // Suppress SSH warnings like "Pseudo-terminal will not be allocated..."
};

/**
 * Build the remote shell command string from command, args, cwd, and env.
 *
 * This function constructs a properly escaped shell command that:
 * 1. Changes to the specified working directory (if provided)
 * 2. Sets environment variables (if provided)
 * 3. Executes the command with its arguments
 *
 * The result is a single shell command string that can be passed to SSH.
 * All user-provided values are properly escaped to prevent shell injection.
 *
 * @param options Command options including command, args, cwd, and env
 * @returns Properly escaped shell command string for remote execution
 *
 * @example
 * buildRemoteCommand({
 *   command: 'claude',
 *   args: ['--print', '--verbose'],
 *   cwd: '/home/user/project',
 *   env: { ANTHROPIC_API_KEY: 'sk-...' }
 * })
 * // => "cd '/home/user/project' && ANTHROPIC_API_KEY='sk-...' 'claude' '--print' '--verbose'"
 */
export function buildRemoteCommand(options: RemoteCommandOptions): string {
	const { command, args, cwd, env } = options;

	const parts: string[] = [];

	// Add cd command if working directory is specified
	if (cwd) {
		parts.push(`cd ${shellEscape(cwd)}`);
	}

	// Build environment variable exports
	const envExports: string[] = [];
	if (env && Object.keys(env).length > 0) {
		for (const [key, value] of Object.entries(env)) {
			// Environment variable names are validated (alphanumeric + underscore)
			// but we still escape the value to be safe
			if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
				envExports.push(`${key}=${shellEscape(value)}`);
			}
		}
	}

	// Build the command with arguments
	const commandWithArgs = buildShellCommand(command, args);

	// Handle stdin input modes
	let finalCommandWithArgs: string;
	if (options.useStdin) {
		const hasStreamJsonInput =
			Array.isArray(args) && args.includes('--input-format') && args.includes('stream-json');
		if (hasStreamJsonInput) {
			// Stream-JSON mode: use exec to avoid shell control sequences
			finalCommandWithArgs = `exec ${commandWithArgs}`;
		} else {
			// Raw prompt mode: pipe stdin directly to the command
			finalCommandWithArgs = commandWithArgs;
		}
	} else {
		finalCommandWithArgs = commandWithArgs;
	}

	// Combine env exports with command
	let fullCommand: string;
	if (envExports.length > 0) {
		// Prepend env vars inline: VAR1='val1' VAR2='val2' command args
		fullCommand = `${envExports.join(' ')} ${finalCommandWithArgs}`;
	} else {
		fullCommand = finalCommandWithArgs;
	}

	parts.push(fullCommand);

	// Join with && to ensure cd succeeds before running command
	return parts.join(' && ');
}

/**
 * Build SSH command and arguments for remote execution.
 *
 * This function constructs the complete SSH invocation to execute
 * a command on a remote host. It uses the SSH config for authentication
 * details and builds a properly escaped remote command string.
 *
 * When config.useSshConfig is true, the function relies on ~/.ssh/config
 * for connection settings (User, IdentityFile, Port, HostName) and only
 * passes the Host pattern to SSH. This allows leveraging existing SSH
 * configurations including ProxyJump for bastion hosts.
 *
 * @param config SSH remote configuration
 * @param remoteOptions Options for the remote command (command, args, cwd, env)
 * @returns Object with 'ssh' command and arguments array
 *
 * @example
 * // Direct connection (no SSH config)
 * buildSshCommand(
 *   { host: 'dev.example.com', port: 22, username: 'user', privateKeyPath: '~/.ssh/id_ed25519', ... },
 *   { command: 'claude', args: ['--print', 'hello'], cwd: '/home/user/project' }
 * )
 * // => {
 * //   command: 'ssh',
 * //   args: [
 * //     '-i', '/Users/me/.ssh/id_ed25519',
 * //     '-o', 'BatchMode=yes',
 * //     '-o', 'StrictHostKeyChecking=accept-new',
 * //     '-o', 'ConnectTimeout=10',
 * //     '-p', '22',
 * //     'user@dev.example.com',
 * //     "cd '/home/user/project' && 'claude' '--print' 'hello'"
 * //   ]
 * // }
 *
 * @example
 * // Using SSH config (useSshConfig: true)
 * buildSshCommand(
 *   { host: 'dev-server', useSshConfig: true, ... },
 *   { command: 'claude', args: ['--print', 'hello'] }
 * )
 * // => {
 * //   command: 'ssh',
 * //   args: [
 * //     '-o', 'BatchMode=yes',
 * //     '-o', 'StrictHostKeyChecking=accept-new',
 * //     '-o', 'ConnectTimeout=10',
 * //     'dev-server',  // SSH will look up settings from ~/.ssh/config
 * //     "'claude' '--print' 'hello'"
 * //   ]
 * // }
 */
export async function buildSshCommand(
	config: SshRemoteConfig,
	remoteOptions: RemoteCommandOptions
): Promise<SshCommandResult> {
	const args: string[] = [];

	// Resolve the SSH binary path (handles packaged Electron apps where PATH is limited)
	const sshPath = await resolveSshPath();

	// Decide whether we need to force a TTY for the remote command.
	// Historically we forced a TTY for Claude Code when running with `--print`.
	// However, for stream-json input (sending JSON via stdin) a TTY injects terminal
	// control sequences that corrupt the stream. Only enable forced TTY for cases
	// that explicitly require it (e.g., `--print` without `--input-format stream-json`).
	const remoteArgs = remoteOptions.args || [];
	const hasPrintFlag = remoteArgs.includes('--print');
	const hasStreamJsonInput = remoteOptions.useStdin
		? true
		: remoteArgs.includes('--input-format') && remoteArgs.includes('stream-json');
	const forceTty = Boolean(hasPrintFlag && !hasStreamJsonInput);

	// Log the decision so callers can debug why a TTY was or was not forced
	logger.debug('SSH TTY decision', '[ssh-command-builder]', {
		host: config.host,
		useStdinFlag: !!remoteOptions.useStdin,
		hasPrintFlag,
		hasStreamJsonInput,
		forceTty,
	});

	if (forceTty) {
		// -tt must come first for reliable forced allocation in some SSH implementations
		args.push('-tt');
	}

	// Private key - only add if explicitly provided
	// SSH will use ~/.ssh/config or ssh-agent if no key is specified
	if (config.privateKeyPath && config.privateKeyPath.trim()) {
		args.push('-i', expandTilde(config.privateKeyPath));
	}

	// Default SSH options for non-interactive operation
	// These are always needed to ensure BatchMode behavior. If `forceTty` is true,
	// override RequestTTY to `force` so SSH will allocate a TTY even in non-interactive contexts.
	for (const [key, value] of Object.entries(DEFAULT_SSH_OPTIONS)) {
		// If we will force a TTY for this command, override the RequestTTY option
		if (key === 'RequestTTY' && forceTty) {
			args.push('-o', `${key}=force`);
		} else {
			args.push('-o', `${key}=${value}`);
		}
	}

	// Port specification - only add if not default and not using SSH config
	// (when using SSH config, let SSH config handle the port)
	if (!config.useSshConfig || config.port !== 22) {
		args.push('-p', config.port.toString());
	}

	// Build destination - use user@host if username provided, otherwise just host
	// SSH will use current user or ~/.ssh/config User directive if no username specified
	if (config.username && config.username.trim()) {
		args.push(`${config.username}@${config.host}`);
	} else {
		args.push(config.host);
	}

	// Merge remote config's environment with the command-specific environment
	// Command-specific env takes precedence over remote config env
	const mergedEnv: Record<string, string> = {
		...(config.remoteEnv || {}),
		...(remoteOptions.env || {}),
	};

	// Use working directory from remoteOptions if provided
	// No cd if not specified - agent will start in remote home directory
	const effectiveCwd = remoteOptions.cwd;

	// Build the remote command string
	const remoteCommand = buildRemoteCommand({
		command: remoteOptions.command,
		args: remoteOptions.args,
		cwd: effectiveCwd,
		env: Object.keys(mergedEnv).length > 0 ? mergedEnv : undefined,
	});

	// Wrap the command with explicit PATH setup instead of sourcing profile files.
	// Profile files often chain to zsh or contain syntax incompatible with -c embedding.
	//
	// CRITICAL: Use /bin/bash (full path) instead of just 'bash' because:
	// SSH passes the command to the remote's login shell (often zsh) which parses it.
	// If we use 'bash', zsh still sources its profile files while resolving the command.
	// Using /bin/bash directly bypasses this - zsh just executes the path without sourcing.
	//
	// We prepend common binary locations to PATH:
	// - ~/.local/bin: Claude Code, pip --user installs
	// - ~/bin: User scripts
	// - /usr/local/bin: Homebrew on Intel Mac, manual installs
	// - /opt/homebrew/bin: Homebrew on Apple Silicon
	// - ~/.cargo/bin: Rust tools
	//
	// This approach avoids all profile sourcing issues while ensuring agent binaries are found.
	//
	// CRITICAL: Use single quotes for the -c argument to prevent the remote shell (often zsh)
	// from parsing the command content. SSH passes the command to the remote's login shell,
	// which parses it before executing. Double quotes allow zsh to interpret $, `, \, etc.
	// Single quotes are parsed literally by zsh - it just passes the content to bash as-is.
	//
	// The inner command uses shellEscape() which handles embedded single quotes via '\'' pattern.
	const pathSetup =
		'export PATH="$HOME/.local/bin:$HOME/bin:/usr/local/bin:/opt/homebrew/bin:$HOME/.cargo/bin:$PATH"';
	const fullBashCommand = `${pathSetup} && ${remoteCommand}`;
	const wrappedCommand = `/bin/bash --norc --noprofile -c ${shellEscape(fullBashCommand)}`;
	args.push(wrappedCommand);

	// Log the exact command being built - use info level so it appears in system logs
	logger.info('SSH command built for remote execution', '[ssh-command-builder]', {
		host: config.host,
		username: config.username || '(using SSH config/system default)',
		port: config.port,
		useSshConfig: config.useSshConfig,
		privateKeyPath: config.privateKeyPath ? '***configured***' : '(using SSH config/agent)',
		remoteCommand,
		wrappedCommand,
		sshPath,
		sshArgsCount: args.length,
		// Full command for debugging - escape quotes for readability
		fullCommand: `${sshPath} ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`,
	});

	return {
		command: sshPath,
		args,
	};
}

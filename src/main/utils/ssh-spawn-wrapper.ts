/**
 * SSH Spawn Wrapper Utility
 *
 * Provides a reusable function to wrap spawn configurations with SSH remote execution.
 * This extracts the SSH wrapping logic from the process:spawn IPC handler so it can be
 * used by other components like Group Chat that spawn processes directly.
 *
 * IMPORTANT: Any feature that spawns agent processes must use this utility to properly
 * support SSH remote execution. Without it, agents will always run locally even when
 * the session is configured for SSH remote execution.
 */

import * as os from 'os';
import type { SshRemoteConfig, AgentSshRemoteConfig } from '../../shared/types';
import { getSshRemoteConfig, SshRemoteSettingsStore } from './ssh-remote-resolver';
import { buildSshCommand } from './ssh-command-builder';
import { logger } from './logger';

const LOG_CONTEXT = '[SshSpawnWrapper]';

/**
 * Configuration for wrapping a spawn with SSH.
 */
export interface SshSpawnWrapConfig {
	/** The command to execute */
	command: string;
	/** Arguments for the command */
	args: string[];
	/** Working directory */
	cwd: string;
	/** The prompt to send (if any) */
	prompt?: string;
	/** Custom environment variables */
	customEnvVars?: Record<string, string>;
	/** Agent's promptArgs function (for building prompt flags) */
	promptArgs?: (prompt: string) => string[];
	/** Whether agent uses -- separator before prompt */
	noPromptSeparator?: boolean;
	/** Agent's binary name (used for SSH remote command) */
	agentBinaryName?: string;
}

/**
 * Result of wrapping a spawn config with SSH.
 */
export interface SshSpawnWrapResult {
	/** The command to spawn (may be 'ssh' if SSH is enabled) */
	command: string;
	/** Arguments for the command */
	args: string[];
	/** Working directory (local home for SSH, original for local) */
	cwd: string;
	/** Custom environment variables (undefined for SSH since they're in the command) */
	customEnvVars?: Record<string, string>;
	/** The prompt to pass to ProcessManager (undefined for small SSH prompts, original for large) */
	prompt?: string;
	/** Whether SSH remote was used */
	sshRemoteUsed: SshRemoteConfig | null;
}

/**
 * Wrap a spawn configuration with SSH remote execution if configured.
 *
 * This function handles:
 * 1. Resolving the SSH remote configuration from session config
 * 2. Building the SSH command wrapper for remote execution
 * 3. Handling prompt embedding (small prompts in command line, large via stdin)
 * 4. Adjusting cwd and env vars for SSH execution
 *
 * @param config The original spawn configuration
 * @param sshConfig Session-level SSH configuration (if any)
 * @param sshStore Store adapter for resolving SSH remote settings
 * @returns Wrapped spawn configuration ready for ProcessManager
 *
 * @example
 * const wrapped = await wrapSpawnWithSsh(
 *   { command: 'claude', args: ['--print'], cwd: '/project', prompt: 'Hello' },
 *   { enabled: true, remoteId: 'my-server' },
 *   createSshRemoteStoreAdapter(settingsStore)
 * );
 * processManager.spawn(wrapped);
 */
export async function wrapSpawnWithSsh(
	config: SshSpawnWrapConfig,
	sshConfig: AgentSshRemoteConfig | undefined,
	sshStore: SshRemoteSettingsStore
): Promise<SshSpawnWrapResult> {
	// Check if SSH is enabled for this session
	if (!sshConfig?.enabled) {
		// Local execution - return config unchanged
		return {
			command: config.command,
			args: config.args,
			cwd: config.cwd,
			customEnvVars: config.customEnvVars,
			prompt: config.prompt,
			sshRemoteUsed: null,
		};
	}

	// Resolve the SSH remote configuration
	const sshResult = getSshRemoteConfig(sshStore, {
		sessionSshConfig: sshConfig,
	});

	if (!sshResult.config) {
		// SSH config not found or disabled - fall back to local execution
		logger.warn('SSH remote config not found, falling back to local execution', LOG_CONTEXT, {
			remoteId: sshConfig.remoteId,
			source: sshResult.source,
		});
		return {
			command: config.command,
			args: config.args,
			cwd: config.cwd,
			customEnvVars: config.customEnvVars,
			prompt: config.prompt,
			sshRemoteUsed: null,
		};
	}

	logger.info('Wrapping spawn with SSH remote execution', LOG_CONTEXT, {
		remoteId: sshResult.config.id,
		remoteName: sshResult.config.name,
		host: sshResult.config.host,
	});

	// For SSH execution, we need to include the prompt in the args
	// because ProcessManager.spawn() won't add it (we pass prompt: undefined for SSH)
	// Use promptArgs if available (e.g., OpenCode -p), otherwise use positional arg
	//
	// For large prompts (>4000 chars), don't embed in command line to avoid
	// command line length limits. Instead, use --input-format stream-json and
	// let ProcessManager send via stdin.
	const isLargePrompt = config.prompt && config.prompt.length > 4000;
	let sshArgs = [...config.args];
	let passPromptToSpawn: string | undefined;

	if (config.prompt && !isLargePrompt) {
		// Small prompt - embed in command line
		if (config.promptArgs) {
			sshArgs = [...config.args, ...config.promptArgs(config.prompt)];
		} else if (config.noPromptSeparator) {
			sshArgs = [...config.args, config.prompt];
		} else {
			sshArgs = [...config.args, '--', config.prompt];
		}
	} else if (config.prompt && isLargePrompt) {
		// Large prompt - use stdin mode
		sshArgs = [...config.args, '--input-format', 'stream-json'];
		passPromptToSpawn = config.prompt; // Pass to ProcessManager for stdin delivery
		logger.info('Using stdin for large prompt in SSH remote execution', LOG_CONTEXT, {
			promptLength: config.prompt.length,
			reason: 'avoid-command-line-length-limit',
		});
	}

	// Determine the command to run on the remote host:
	// Use agentBinaryName if provided (e.g., 'codex', 'claude'), otherwise use the command
	// This avoids using local paths like '/opt/homebrew/bin/codex' on the remote
	const remoteCommand = config.agentBinaryName || config.command;

	// Check if we'll send input via stdin
	const useStdin = sshArgs.includes('--input-format') && sshArgs.includes('stream-json');

	// Build the SSH command
	const sshCommand = await buildSshCommand(sshResult.config, {
		command: remoteCommand,
		args: sshArgs,
		cwd: config.cwd,
		env: config.customEnvVars,
		useStdin,
	});

	logger.debug('SSH command built', LOG_CONTEXT, {
		sshBinary: sshCommand.command,
		sshArgsCount: sshCommand.args.length,
		remoteCommand,
		remoteArgs: sshArgs,
		remoteCwd: config.cwd,
	});

	return {
		command: sshCommand.command,
		args: sshCommand.args,
		// Use local home directory as cwd - remote cwd is in the SSH command
		cwd: os.homedir(),
		// Env vars are passed via the SSH command, not locally
		customEnvVars: undefined,
		// For large prompts, pass to ProcessManager for stdin delivery
		prompt: passPromptToSpawn,
		sshRemoteUsed: sshResult.config,
	};
}

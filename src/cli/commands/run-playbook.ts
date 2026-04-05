// Run playbook command
// Executes a playbook and streams events to stdout

import { getSessionById } from '../services/storage';
import { findPlaybookById } from '../services/playbooks';
import { runPlaybook as executePlaybook } from '../services/batch-processor';
import { detectAgent } from '../services/agent-spawner';
import { getAgentDefinition } from '../../main/agents/definitions';
import { emitError } from '../output/jsonl';
import {
	formatRunEvent,
	formatError,
	formatInfo,
	formatWarning,
	RunEvent,
} from '../output/formatter';
import { isSessionBusyWithCli, getCliActivityForSession } from '../../shared/cli-activity';
import { normalizePersistedPlaybook, validatePlaybookDag } from '../../shared/playbookDag';
import { getPlaybookParallelismWarning } from '../../shared/playbookParallelism';
import type { ProjectMemoryBindingIntent } from '../../shared/projectMemory';
import type { Playbook, SessionInfo } from '../../shared/types';
import { emitWizardTasks } from '../../main/wizard-task-emitter';
import * as taskSyncService from '../services/task-sync';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Check if desktop app has the session in busy state.
 *
 * NOTE: This function uses lowercase "maestro" config directory, which matches
 * the electron-store default (from package.json "name": "maestro"). This is
 * intentionally different from cli/services/storage.ts which uses "Maestro"
 * (capitalized) for CLI-specific storage. This function needs to read the
 * desktop app's session state, not CLI storage.
 *
 * @internal
 */
function isSessionBusyInDesktop(sessionId: string): { busy: boolean; reason?: string } {
	try {
		const platform = os.platform();
		const home = os.homedir();
		let configDir: string;

		if (platform === 'darwin') {
			configDir = path.join(home, 'Library', 'Application Support', 'maestro');
		} else if (platform === 'win32') {
			configDir = path.join(
				process.env.APPDATA || path.join(home, 'AppData', 'Roaming'),
				'maestro'
			);
		} else {
			configDir = path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'maestro');
		}

		const sessionsPath = path.join(configDir, 'maestro-sessions.json');
		const content = fs.readFileSync(sessionsPath, 'utf-8');
		const data = JSON.parse(content);
		const sessions = data.sessions || [];

		const session = sessions.find((s: { id: string }) => s.id === sessionId);
		if (session && session.state === 'busy') {
			return { busy: true, reason: 'Desktop app shows agent is busy' };
		}
		return { busy: false };
	} catch {
		// Can't read sessions file, assume not busy
		return { busy: false };
	}
}

interface RunPlaybookOptions {
	dryRun?: boolean;
	history?: boolean; // commander uses --no-history which becomes history: false
	json?: boolean;
	debug?: boolean;
	verbose?: boolean;
	wait?: boolean;
	maxWaitMs?: number | string;
}

const DEFAULT_WAIT_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Format wait duration in human-readable format.
 *
 * NOTE: This is intentionally different from shared/formatters.ts formatElapsedTime,
 * which uses a combined format like "5m 12s". This function uses a simpler format
 * (e.g., "5s", "2m 30s") appropriate for CLI wait messages.
 *
 * @internal
 */
function formatWaitDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Pause execution for the specified duration.
 * @internal
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveMaxWaitMs(
	value: number | string | undefined
): { ok: true; value: number | null } | { ok: false; reason: string } {
	if (value === undefined || value === null || value === '') {
		return { ok: true, value: DEFAULT_WAIT_TIMEOUT_MS };
	}

	const parsed = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return { ok: false, reason: 'maxWaitMs must be a non-negative number.' };
	}

	if (parsed === 0) {
		return { ok: true, value: null };
	}

	return { ok: true, value: parsed };
}

function getCurrentGitBranch(cwd: string): string | undefined {
	try {
		const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
			cwd,
			encoding: 'utf-8',
			stdio: ['pipe', 'pipe', 'pipe'],
		}).trim();
		return branch || undefined;
	} catch {
		return undefined;
	}
}

function getCodexExecutorId(): string {
	return process.env.MAESTRO_TASK_EXECUTOR ?? 'codex-main';
}

function normalizeRepoRoot(repoRoot: string): string {
	try {
		return fs.realpathSync(repoRoot);
	} catch {
		return path.resolve(repoRoot);
	}
}

function bootstrapProjectMemoryExecution(
	playbook: Playbook,
	agent: SessionInfo
): { playbook: Playbook; bootstrapped: boolean; message?: string } {
	if (
		agent.toolType !== 'codex' ||
		playbook.projectMemoryExecution ||
		!playbook.projectMemoryBindingIntent
	) {
		return { playbook, bootstrapped: false };
	}

	const bindingIntent: ProjectMemoryBindingIntent = {
		...playbook.projectMemoryBindingIntent,
		repoRoot: normalizeRepoRoot(playbook.projectMemoryBindingIntent.repoRoot || agent.cwd),
	};
	const candidateTaskIds = playbook.taskGraph?.nodes?.map((node) => node.id) ?? [];
	if (candidateTaskIds.length === 0) {
		throw new Error(
			'Project Memory bootstrap could not find any taskGraph nodes for this playbook.'
		);
	}

	const emissionResult = emitWizardTasks(
		{
			...playbook,
			projectMemoryBindingIntent: bindingIntent,
		},
		{ force: false }
	);
	const duplicateOnlyEmission =
		!emissionResult.success &&
		(emissionResult.skippedTaskIds?.length ?? 0) > 0 &&
		(emissionResult.invalidTaskIds?.length ?? 0) === 0 &&
		(emissionResult.skippedTaskIds?.length ?? 0) === candidateTaskIds.length;
	if (!emissionResult.success && !duplicateOnlyEmission) {
		throw new Error(
			emissionResult.error ??
				'Project Memory bootstrap failed while emitting repo-local tasks for this playbook.'
		);
	}

	const executorId = getCodexExecutorId();

	let selection: ReturnType<typeof taskSyncService.lockTask> | null = null;
	const claimFailures: string[] = [];
	for (const taskId of candidateTaskIds) {
		try {
			selection = taskSyncService.lockTask(
				{
					repoRoot: bindingIntent.repoRoot,
					executorId,
				},
				taskId
			);
			break;
		} catch (error) {
			const reason = error instanceof Error ? error.message : 'Unknown lockTask failure';
			claimFailures.push(`${taskId}: ${reason}`);
		}
	}

	if (!selection) {
		const details = claimFailures.length > 0 ? ` (${claimFailures.join('; ')})` : '';
		throw new Error(
			`Project Memory bootstrap did not find a runnable task for this playbook.${details}`
		);
	}

	return {
		playbook: {
			...playbook,
			projectMemoryBindingIntent: bindingIntent,
			projectMemoryExecution: {
				repoRoot: bindingIntent.repoRoot,
				taskId: selection.task.id,
				executorId,
			},
		},
		bootstrapped: true,
		message: `Bootstrapped Project Memory execution: ${selection.task.id}`,
	};
}

/**
 * Check if agent is busy (either from another CLI instance or desktop app).
 * @internal
 */
function checkAgentBusy(agentId: string, _agentName: string): { busy: boolean; reason?: string } {
	// Check CLI activity first
	const cliActivity = getCliActivityForSession(agentId);
	if (cliActivity && isSessionBusyWithCli(agentId)) {
		return {
			busy: true,
			reason: `Running playbook "${cliActivity.playbookName}" from CLI (PID: ${cliActivity.pid})`,
		};
	}

	// Check desktop state
	const desktopBusy = isSessionBusyInDesktop(agentId);
	if (desktopBusy.busy) {
		return {
			busy: true,
			reason: 'Busy in desktop app',
		};
	}

	return { busy: false };
}

function validateProjectMemoryStartup(
	agent: { cwd: string; toolType: string },
	playbook: {
		projectMemoryExecution?: {
			repoRoot?: string | null;
			taskId?: string | null;
			executorId?: string | null;
		} | null;
	}
): { ok: true } | { ok: false; code: string; reason: string } {
	if (agent.toolType === 'codex' && !playbook.projectMemoryExecution) {
		return {
			ok: false,
			code: 'PROJECT_MEMORY_EXECUTION_REQUIRED',
			reason: 'Codex Auto Run requires an active Project Memory binding for this repo.',
		};
	}

	if (!playbook.projectMemoryExecution) {
		return { ok: true };
	}

	const { taskId, executorId } = playbook.projectMemoryExecution;
	if (!taskId || !executorId) {
		return {
			ok: false,
			code: 'PROJECT_MEMORY_EXECUTION_BLOCKED',
			reason:
				'Project Memory execution metadata is incomplete: taskId and executorId are required.',
		};
	}

	const validationRepoRoot = playbook.projectMemoryExecution.repoRoot || agent.cwd;
	const currentGitBranch = getCurrentGitBranch(validationRepoRoot);
	const validation = taskSyncService.validateProjectMemoryExecutionStart({
		...playbook.projectMemoryExecution,
		repoRoot: validationRepoRoot,
		taskId,
		executorId,
		currentBranch: currentGitBranch ?? null,
	});

	if (!validation.ok) {
		return {
			ok: false,
			code: 'PROJECT_MEMORY_EXECUTION_BLOCKED',
			reason: validation.reason ?? 'Project Memory execution validation blocked playbook start.',
		};
	}

	return { ok: true };
}

export async function runPlaybook(playbookId: string, options: RunPlaybookOptions): Promise<void> {
	const useJson = options.json;

	try {
		const maxWaitValidation = resolveMaxWaitMs(options.maxWaitMs);
		if (!maxWaitValidation.ok) {
			if (useJson) {
				emitError(maxWaitValidation.reason, 'INVALID_MAX_WAIT_MS');
			} else {
				console.error(formatError(maxWaitValidation.reason));
			}
			process.exit(1);
		}

		const maxWaitMs = maxWaitValidation.value;
		let agentId: string;
		let playbook: Playbook;

		// Find playbook across all agents
		try {
			const result = findPlaybookById(playbookId);
			playbook = normalizePersistedPlaybook(result.playbook);
			agentId = result.agentId;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			if (useJson) {
				emitError(message, 'PLAYBOOK_NOT_FOUND');
			} else {
				console.error(formatError(message));
			}
			process.exit(1);
		}

		const agent = getSessionById(agentId)!;
		const bootstrapResult = bootstrapProjectMemoryExecution(playbook, agent);
		playbook = bootstrapResult.playbook;

		const projectMemoryValidation = validateProjectMemoryStartup(agent, playbook);
		if (!projectMemoryValidation.ok) {
			if (useJson) {
				emitError(projectMemoryValidation.reason, projectMemoryValidation.code);
			} else {
				console.error(formatError(projectMemoryValidation.reason));
			}
			process.exit(1);
		}

		// Check if agent CLI is available
		const def = getAgentDefinition(agent.toolType);
		if (!def) {
			const message = `Agent type "${agent.toolType}" is not supported in CLI batch mode yet.`;
			if (useJson) {
				emitError(message, 'AGENT_UNSUPPORTED');
			} else {
				console.error(formatError(message));
			}
			process.exit(1);
		}

		const detection = await detectAgent(agent.toolType);
		if (!detection.available) {
			const errorCode = `${agent.toolType.toUpperCase().replace(/-/g, '_')}_NOT_FOUND`;
			const message = `${def.name} CLI not found. Please install ${def.name}.`;
			if (useJson) {
				emitError(message, errorCode);
			} else {
				console.error(formatError(message));
			}
			process.exit(1);
		}

		// Check if agent is busy (either from desktop or another CLI instance)
		let busyCheck = checkAgentBusy(agent.id, agent.name);

		if (busyCheck.busy) {
			if (options.wait) {
				// Wait mode - poll until agent becomes available
				const waitStartTime = Date.now();
				const pollIntervalMs = 5000; // Check every 5 seconds

				if (!useJson) {
					console.log(formatWarning(`Agent "${agent.name}" is busy: ${busyCheck.reason}`));
					console.log(formatInfo('Waiting for agent to become available...'));
				}

				let lastReason = busyCheck.reason;
				while (busyCheck.busy) {
					await sleep(pollIntervalMs);
					busyCheck = checkAgentBusy(agent.id, agent.name);
					const waitedMs = Date.now() - waitStartTime;
					if (busyCheck.busy && maxWaitMs !== null && waitedMs >= maxWaitMs) {
						const timeoutMessage = `Timed out after waiting ${formatWaitDuration(waitedMs)} for agent "${agent.name}" to become available.`;
						if (useJson) {
							emitError(timeoutMessage, 'AGENT_WAIT_TIMEOUT');
						} else {
							console.error(formatError(timeoutMessage));
						}
						process.exit(1);
					}

					// Log if reason changed (e.g., different playbook now running)
					if (busyCheck.busy && busyCheck.reason !== lastReason && !useJson) {
						console.log(formatWarning(`Still waiting: ${busyCheck.reason}`));
						lastReason = busyCheck.reason;
					}
				}

				const waitDuration = Date.now() - waitStartTime;
				if (!useJson) {
					console.log(
						formatInfo(`Agent available after waiting ${formatWaitDuration(waitDuration)}`)
					);
					console.log('');
				} else {
					// Emit wait event in JSON mode
					console.log(
						JSON.stringify({
							type: 'wait_complete',
							timestamp: Date.now(),
							waitDurationMs: waitDuration,
						})
					);
				}
			} else {
				// No wait mode - fail immediately
				const message = `Agent "${agent.name}" is busy: ${busyCheck.reason}. Use --wait to wait for availability.`;
				if (useJson) {
					emitError(message, 'AGENT_BUSY');
				} else {
					console.error(formatError(message));
				}
				process.exit(1);
			}
		}

		// Determine Auto Run folder path
		const folderPath = agent.autoRunFolderPath;
		if (!folderPath) {
			if (useJson) {
				emitError('Agent does not have an Auto Run folder configured', 'NO_AUTORUN_FOLDER');
			} else {
				console.error(formatError('Agent does not have an Auto Run folder configured'));
			}
			process.exit(1);
		}

		const dagValidation = validatePlaybookDag(
			playbook.documents,
			playbook.taskGraph,
			playbook.maxParallelism
		);
		if (!dagValidation.valid) {
			const message = `Playbook DAG validation failed: ${dagValidation.errors.join(' ')}`;
			if (useJson) {
				emitError(message, 'PLAYBOOK_DAG_INVALID');
			} else {
				console.error(formatError(message));
			}
			process.exit(1);
		}

		const parallelismWarning = getPlaybookParallelismWarning(
			playbook.taskGraph,
			playbook.maxParallelism
		);

		// Show startup info in human-readable mode
		if (!useJson) {
			console.log(formatInfo(`Running playbook: ${playbook.name}`));
			console.log(formatInfo(`Agent: ${agent.name}`));
			console.log(formatInfo(`Documents: ${playbook.documents.length}`));
			if (bootstrapResult.bootstrapped && bootstrapResult.message) {
				console.log(formatInfo(bootstrapResult.message));
			}
			if (parallelismWarning) {
				console.log(formatWarning(parallelismWarning.message));
			}
			// Show loop configuration
			if (playbook.loopEnabled) {
				const loopInfo = playbook.maxLoops ? `max ${playbook.maxLoops}` : '∞';
				console.log(formatInfo(`Loop: enabled (${loopInfo})`));
			}
			if (options.dryRun) {
				console.log(formatInfo('Dry run mode - no changes will be made'));
			}
			console.log('');
		}

		// Execute playbook and stream events
		const generator = executePlaybook(agent, playbook, folderPath, {
			dryRun: options.dryRun,
			writeHistory: options.history !== false, // --no-history sets history to false
			debug: options.debug,
			verbose: options.verbose,
		});

		for await (const event of generator) {
			if (useJson) {
				console.log(JSON.stringify(event));
			} else {
				console.log(formatRunEvent(event as RunEvent, { debug: options.debug }));
			}
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		if (useJson) {
			emitError(`Failed to run playbook: ${message}`, 'EXECUTION_ERROR');
		} else {
			console.error(formatError(`Failed to run playbook: ${message}`));
		}
		process.exit(1);
	}
}

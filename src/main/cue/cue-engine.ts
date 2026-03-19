/**
 * Cue Engine Core — the main coordinator for Maestro Cue event-driven automation.
 *
 * Discovers maestro-cue.yaml files per session, manages interval timers,
 * file watchers, and agent completion listeners. Runs in the Electron main process.
 *
 * Supports agent completion chains:
 * - Fan-out: a subscription fires its prompt against multiple target sessions
 * - Fan-in: a subscription waits for multiple source sessions to complete before firing
 * - Session bridging: completion events from user sessions (non-Cue) trigger Cue subscriptions
 */

import * as crypto from 'crypto';
import type { MainLogLevel } from '../../shared/logger-types';
import type { SessionInfo } from '../../shared/types';
import type {
	AgentCompletionData,
	CueConfig,
	CueEvent,
	CueGraphSession,
	CueRunResult,
	CueSessionStatus,
	CueSettings,
	CueSubscription,
} from './cue-types';
import { DEFAULT_CUE_SETTINGS } from './cue-types';
import { loadCueConfig, watchCueYaml } from './cue-yaml-loader';
import { matchesFilter, describeFilter } from './cue-filter';
import {
	setupHeartbeatSubscription,
	setupScheduledSubscription,
	setupFileWatcherSubscription,
	setupGitHubPollerSubscription,
	setupTaskScannerSubscription,
	type SubscriptionSetupDeps,
} from './cue-subscription-setup';
import { initCueDb, closeCueDb, pruneCueEvents } from './cue-db';
import { createCueActivityLog } from './cue-activity-log';
import type { CueActivityLog } from './cue-activity-log';
import { createCueHeartbeat, EVENT_PRUNE_AGE_MS } from './cue-heartbeat';
import type { CueHeartbeat } from './cue-heartbeat';
import { createCueFanInTracker, SOURCE_OUTPUT_MAX_CHARS } from './cue-fan-in-tracker';
import type { CueFanInTracker } from './cue-fan-in-tracker';
import { createCueRunManager } from './cue-run-manager';
import type { CueRunManager } from './cue-run-manager';
const MAX_CHAIN_DEPTH = 10;

// Re-export for backwards compat (tests import from cue-engine)
export { calculateNextScheduledTime } from './cue-subscription-setup';

/** Dependencies injected into the CueEngine */
export interface CueEngineDeps {
	getSessions: () => SessionInfo[];
	onCueRun: (request: {
		runId: string;
		sessionId: string;
		prompt: string;
		subscriptionName: string;
		event: CueEvent;
		timeoutMs: number;
	}) => Promise<CueRunResult>;
	onStopCueRun?: (runId: string) => boolean;
	onLog: (level: MainLogLevel, message: string, data?: unknown) => void;
}

/** Internal state per session with an active Cue config */
interface SessionState {
	config: CueConfig;
	timers: ReturnType<typeof setInterval>[];
	watchers: (() => void)[];
	yamlWatcher: (() => void) | null;
	lastTriggered?: string;
	nextTriggers: Map<string, number>; // subscriptionName -> next trigger timestamp
}

export class CueEngine {
	private enabled = false;
	private sessions = new Map<string, SessionState>();
	private activityLog: CueActivityLog = createCueActivityLog();
	private fanInTracker!: CueFanInTracker;
	private runManager!: CueRunManager;
	private pendingYamlWatchers = new Map<string, () => void>();
	/** Tracks "subName:HH:MM" keys that time.scheduled already fired, preventing double-fire on config refresh */
	private scheduledFiredKeys = new Set<string>();
	private heartbeat: CueHeartbeat;
	private deps: CueEngineDeps;

	constructor(deps: CueEngineDeps) {
		this.deps = deps;
		this.runManager = createCueRunManager({
			getSessions: deps.getSessions,
			getSessionSettings: (sessionId) => this.sessions.get(sessionId)?.config.settings,
			onCueRun: deps.onCueRun,
			onStopCueRun: deps.onStopCueRun,
			onLog: deps.onLog,
			onRunCompleted: (sessionId, result, subscriptionName, chainDepth) => {
				this.pushActivityLog(result);
				this.notifyAgentCompleted(sessionId, {
					sessionName: result.sessionName,
					status: result.status,
					exitCode: result.exitCode,
					durationMs: result.durationMs,
					stdout: result.stdout,
					triggeredBy: subscriptionName,
					chainDepth: (chainDepth ?? 0) + 1,
				});
			},
			onRunStopped: (result) => {
				this.pushActivityLog(result);
			},
		});
		this.fanInTracker = createCueFanInTracker({
			onLog: deps.onLog,
			getSessions: deps.getSessions,
			dispatchSubscription: (ownerSessionId, sub, event, sourceSessionName, chainDepth) => {
				this.dispatchSubscription(ownerSessionId, sub, event, sourceSessionName, chainDepth);
			},
		});
		this.heartbeat = createCueHeartbeat({
			onLog: deps.onLog,
			getSessions: () => {
				const result = new Map<string, { config: CueConfig; sessionName: string }>();
				const allSessions = deps.getSessions();
				for (const [sessionId, state] of this.sessions) {
					const session = allSessions.find((s) => s.id === sessionId);
					result.set(sessionId, {
						config: state.config,
						sessionName: session?.name ?? sessionId,
					});
				}
				return result;
			},
			onDispatch: (sessionId, sub, event) => {
				this.dispatchSubscription(sessionId, sub, event, sessionId);
			},
		});
	}

	/** Enable the engine and scan all sessions for Cue configs */
	start(): void {
		if (this.enabled) return;

		this.enabled = true;
		this.deps.onLog('cue', '[CUE] Engine started');

		// Initialize Cue database and prune old events
		try {
			initCueDb((level, msg) => this.deps.onLog(level as MainLogLevel, msg));
			pruneCueEvents(EVENT_PRUNE_AGE_MS);
		} catch (error) {
			this.deps.onLog('warn', `[CUE] Failed to initialize Cue database: ${error}`);
		}

		const sessions = this.deps.getSessions();
		for (const session of sessions) {
			this.initSession(session);
		}

		// Detect sleep gap from previous heartbeat
		this.heartbeat.detectSleepAndReconcile();

		// Start heartbeat writer (30s interval)
		this.heartbeat.start();
	}

	/** Disable the engine, clearing all timers and watchers */
	stop(): void {
		if (!this.enabled) return;

		this.enabled = false;
		for (const [sessionId] of this.sessions) {
			this.teardownSession(sessionId);
		}
		this.sessions.clear();

		// Clean up pending yaml watchers (watching for config re-creation after deletion)
		for (const [, cleanup] of this.pendingYamlWatchers) {
			cleanup();
		}
		this.pendingYamlWatchers.clear();

		// Clear concurrency and fan-in state
		this.runManager.reset();
		this.fanInTracker.reset();
		this.scheduledFiredKeys.clear();

		// Stop heartbeat and close database
		this.heartbeat.stop();
		try {
			closeCueDb();
		} catch {
			// Non-fatal — database may not have been initialized
		}

		this.deps.onLog('cue', '[CUE] Engine stopped');
	}

	/** Re-read the YAML for a specific session, tearing down old subscriptions */
	refreshSession(sessionId: string, projectRoot: string): void {
		const hadSession = this.sessions.has(sessionId);
		this.teardownSession(sessionId);
		this.sessions.delete(sessionId);

		// Clean up any pending yaml watcher for this session
		const pendingWatcher = this.pendingYamlWatchers.get(sessionId);
		if (pendingWatcher) {
			pendingWatcher();
			this.pendingYamlWatchers.delete(sessionId);
		}

		const session = this.deps.getSessions().find((s) => s.id === sessionId);
		if (!session) return;

		this.initSession({ ...session, projectRoot });

		const newState = this.sessions.get(sessionId);
		if (newState) {
			// Config was successfully reloaded
			const activeCount = newState.config.subscriptions.filter((s) => s.enabled !== false).length;
			this.deps.onLog(
				'cue',
				`[CUE] Config reloaded for "${session.name}" (${activeCount} subscriptions)`,
				{ type: 'configReloaded', sessionId }
			);
		} else if (hadSession) {
			// Config was removed — keep watching for re-creation
			const yamlWatcher = watchCueYaml(projectRoot, () => {
				this.refreshSession(sessionId, projectRoot);
			});
			this.pendingYamlWatchers.set(sessionId, yamlWatcher);
			this.deps.onLog('cue', `[CUE] Config removed for "${session.name}"`, {
				type: 'configRemoved',
				sessionId,
			});
		}
	}

	/** Teardown all subscriptions for a session */
	removeSession(sessionId: string): void {
		this.teardownSession(sessionId);
		this.sessions.delete(sessionId);
		this.runManager.clearQueue(sessionId);

		const pendingWatcher = this.pendingYamlWatchers.get(sessionId);
		if (pendingWatcher) {
			pendingWatcher();
			this.pendingYamlWatchers.delete(sessionId);
		}

		this.deps.onLog('cue', `[CUE] Session removed: ${sessionId}`);
	}

	/** Returns status of all sessions with Cue configs */
	getStatus(): CueSessionStatus[] {
		const result: CueSessionStatus[] = [];
		const allSessions = this.deps.getSessions();
		const reportedSessionIds = new Set<string>();

		// Report active sessions with live state
		for (const [sessionId, state] of this.sessions) {
			const session = allSessions.find((s) => s.id === sessionId);
			if (!session) continue;

			reportedSessionIds.add(sessionId);

			const activeRunCount = this.runManager.getActiveRunCount(sessionId);

			let nextTrigger: string | undefined;
			if (state.nextTriggers.size > 0) {
				const earliest = Math.min(...state.nextTriggers.values());
				nextTrigger = new Date(earliest).toISOString();
			}

			result.push({
				sessionId,
				sessionName: session.name,
				toolType: session.toolType,
				projectRoot: session.projectRoot,
				enabled: true,
				subscriptionCount: state.config.subscriptions.filter(
					(s) => s.enabled !== false && (!s.agent_id || s.agent_id === sessionId)
				).length,
				activeRuns: activeRunCount,
				lastTriggered: state.lastTriggered,
				nextTrigger,
			});
		}

		// When engine is disabled, scan for sessions with cue configs on disk
		if (!this.enabled) {
			for (const session of allSessions) {
				if (reportedSessionIds.has(session.id)) continue;
				const config = loadCueConfig(session.projectRoot);
				if (!config) continue;

				result.push({
					sessionId: session.id,
					sessionName: session.name,
					toolType: session.toolType,
					projectRoot: session.projectRoot,
					enabled: false,
					subscriptionCount: config.subscriptions.filter(
						(s) => s.enabled !== false && (!s.agent_id || s.agent_id === session.id)
					).length,
					activeRuns: 0,
				});
			}
		}

		return result;
	}

	/** Returns currently running Cue executions */
	getActiveRuns(): CueRunResult[] {
		return this.runManager.getActiveRuns();
	}

	/** Returns recent completed/failed runs */
	getActivityLog(limit?: number): CueRunResult[] {
		return this.activityLog.getAll(limit);
	}

	/** Stops a specific running execution */
	stopRun(runId: string): boolean {
		const result = this.runManager.stopRun(runId);
		return result;
	}

	/** Stops all running executions and clears all queues */
	stopAll(): void {
		this.runManager.stopAll();
	}

	/** Returns master enabled state */
	isEnabled(): boolean {
		return this.enabled;
	}

	/** Returns queue depth per session (for the Cue Modal) */
	getQueueStatus(): Map<string, number> {
		return this.runManager.getQueueStatus();
	}

	/** Returns the merged Cue settings from the first available session config */
	getSettings(): CueSettings {
		for (const [, state] of this.sessions) {
			return { ...state.config.settings };
		}
		return { ...DEFAULT_CUE_SETTINGS };
	}

	/** Returns all sessions with their parsed subscriptions (for graph visualization) */
	getGraphData(): CueGraphSession[] {
		const result: CueGraphSession[] = [];
		const allSessions = this.deps.getSessions();
		const reportedSessionIds = new Set<string>();

		for (const [sessionId, state] of this.sessions) {
			const session = allSessions.find((s) => s.id === sessionId);
			if (!session) continue;

			reportedSessionIds.add(sessionId);
			result.push({
				sessionId,
				sessionName: session.name,
				toolType: session.toolType,
				subscriptions: state.config.subscriptions.filter(
					(s) => !s.agent_id || s.agent_id === sessionId
				),
			});
		}

		// When engine is disabled, scan for sessions with cue configs on disk
		if (!this.enabled) {
			for (const session of allSessions) {
				if (reportedSessionIds.has(session.id)) continue;
				const config = loadCueConfig(session.projectRoot);
				if (!config) continue;

				result.push({
					sessionId: session.id,
					sessionName: session.name,
					toolType: session.toolType,
					subscriptions: config.subscriptions.filter(
						(s) => !s.agent_id || s.agent_id === session.id
					),
				});
			}
		}

		return result;
	}

	/**
	 * Manually trigger a subscription by name, bypassing its event conditions.
	 * Creates a synthetic event and dispatches through the normal execution path.
	 * Returns true if the subscription was found and triggered.
	 */
	triggerSubscription(subscriptionName: string): boolean {
		for (const [sessionId, state] of this.sessions) {
			for (const sub of state.config.subscriptions) {
				if (sub.name !== subscriptionName) continue;
				if (sub.agent_id && sub.agent_id !== sessionId) continue;

				const event: CueEvent = {
					id: crypto.randomUUID(),
					type: sub.event,
					timestamp: new Date().toISOString(),
					triggerName: sub.name,
					payload: { manual: true },
				};

				this.deps.onLog('cue', `[CUE] "${sub.name}" manually triggered`);
				state.lastTriggered = event.timestamp;
				this.dispatchSubscription(sessionId, sub, event, 'manual');
				return true;
			}
		}
		return false;
	}

	/** Clears queued events for a session */
	clearQueue(sessionId: string): void {
		this.runManager.clearQueue(sessionId);
	}

	/**
	 * Check if any Cue subscriptions are listening for a given session's completion.
	 * Used to avoid emitting completion events for sessions nobody cares about.
	 */
	hasCompletionSubscribers(sessionId: string): boolean {
		if (!this.enabled) return false;

		const allSessions = this.deps.getSessions();
		const completingSession = allSessions.find((s) => s.id === sessionId);
		const completingName = completingSession?.name ?? sessionId;

		for (const [ownerSessionId, state] of this.sessions) {
			for (const sub of state.config.subscriptions) {
				if (sub.event !== 'agent.completed' || sub.enabled === false) continue;
				if (sub.agent_id && sub.agent_id !== ownerSessionId) continue;

				const sources = Array.isArray(sub.source_session)
					? sub.source_session
					: sub.source_session
						? [sub.source_session]
						: [];

				if (sources.some((src) => src === sessionId || src === completingName)) {
					return true;
				}
			}
		}

		return false;
	}

	/** Notify the engine that an agent session has completed (for agent.completed triggers) */
	notifyAgentCompleted(sessionId: string, completionData?: AgentCompletionData): void {
		if (!this.enabled) return;

		// Guard against infinite chain loops (A triggers B triggers A).
		// chainDepth is propagated through AgentCompletionData so it persists across async hops.
		const chainDepth = completionData?.chainDepth ?? 0;
		if (chainDepth >= MAX_CHAIN_DEPTH) {
			this.deps.onLog(
				'error',
				`[CUE] Max chain depth (${MAX_CHAIN_DEPTH}) exceeded — aborting to prevent infinite loop`
			);
			return;
		}

		// Resolve the completing session's name for matching
		const allSessions = this.deps.getSessions();
		const completingSession = allSessions.find((s) => s.id === sessionId);
		const completingName = completionData?.sessionName ?? completingSession?.name ?? sessionId;

		for (const [ownerSessionId, state] of this.sessions) {
			for (const sub of state.config.subscriptions) {
				if (sub.event !== 'agent.completed' || sub.enabled === false) continue;
				if (sub.agent_id && sub.agent_id !== ownerSessionId) continue;

				const sources = Array.isArray(sub.source_session)
					? sub.source_session
					: sub.source_session
						? [sub.source_session]
						: [];

				// Match by session name or ID
				if (!sources.some((src) => src === sessionId || src === completingName)) continue;

				if (sources.length === 1) {
					// Single source — fire immediately
					const event: CueEvent = {
						id: crypto.randomUUID(),
						type: 'agent.completed',
						timestamp: new Date().toISOString(),
						triggerName: sub.name,
						payload: {
							sourceSession: completingName,
							sourceSessionId: sessionId,
							status: completionData?.status ?? 'completed',
							exitCode: completionData?.exitCode ?? null,
							durationMs: completionData?.durationMs ?? 0,
							sourceOutput: (completionData?.stdout ?? '').slice(-SOURCE_OUTPUT_MAX_CHARS),
							outputTruncated: (completionData?.stdout ?? '').length > SOURCE_OUTPUT_MAX_CHARS,
							triggeredBy: completionData?.triggeredBy,
						},
					};

					// Check payload filter
					if (sub.filter && !matchesFilter(event.payload, sub.filter)) {
						this.deps.onLog(
							'cue',
							`[CUE] "${sub.name}" filter not matched (${describeFilter(sub.filter)})`
						);
						continue;
					}

					this.deps.onLog('cue', `[CUE] "${sub.name}" triggered (agent.completed)`);
					this.dispatchSubscription(ownerSessionId, sub, event, completingName, chainDepth);
				} else {
					// Fan-in: track completions with data
					this.fanInTracker.handleCompletion(
						ownerSessionId,
						state.config.settings,
						sub,
						sources,
						sessionId,
						completingName,
						completionData
					);
				}
			}
		}
	}

	/** Clear all fan-in state for a session (when Cue is disabled or session removed) */
	clearFanInState(sessionId: string): void {
		this.fanInTracker.clearForSession(sessionId);
	}

	// --- Private methods ---

	/**
	 * Dispatch a subscription, handling fan-out if configured.
	 * If the subscription has fan_out targets, fires against each target session.
	 * Otherwise fires against the owner session.
	 */
	private dispatchSubscription(
		ownerSessionId: string,
		sub: CueSubscription,
		event: CueEvent,
		sourceSessionName: string,
		chainDepth?: number
	): void {
		if (sub.fan_out && sub.fan_out.length > 0) {
			// Fan-out: fire against each target session
			const targetNames = sub.fan_out.join(', ');
			this.deps.onLog('cue', `[CUE] Fan-out: "${sub.name}" → ${targetNames}`);

			const allSessions = this.deps.getSessions();
			for (let i = 0; i < sub.fan_out.length; i++) {
				const targetName = sub.fan_out[i];
				const targetSession = allSessions.find((s) => s.name === targetName || s.id === targetName);

				if (!targetSession) {
					this.deps.onLog('cue', `[CUE] Fan-out target not found: "${targetName}" — skipping`);
					continue;
				}

				const fanOutEvent: CueEvent = {
					...event,
					id: crypto.randomUUID(),
					payload: {
						...event.payload,
						fanOutSource: sourceSessionName,
						fanOutIndex: i,
					},
				};
				this.runManager.execute(
					targetSession.id,
					sub.prompt_file ?? sub.prompt,
					fanOutEvent,
					sub.name,
					sub.output_prompt,
					chainDepth
				);
			}
		} else {
			this.runManager.execute(
				ownerSessionId,
				sub.prompt_file ?? sub.prompt,
				event,
				sub.name,
				sub.output_prompt,
				chainDepth
			);
		}
	}

	private initSession(session: SessionInfo): void {
		if (!this.enabled) return;

		const config = loadCueConfig(session.projectRoot);
		if (!config) return;

		const state: SessionState = {
			config,
			timers: [],
			watchers: [],
			yamlWatcher: null,
			nextTriggers: new Map(),
		};

		// Watch the YAML file for changes (hot reload)
		state.yamlWatcher = watchCueYaml(session.projectRoot, () => {
			this.refreshSession(session.id, session.projectRoot);
		});

		// Warn about missing prompt files at setup time (not just at execution time)
		for (const sub of config.subscriptions) {
			if (sub.enabled === false) continue;
			if (sub.agent_id && sub.agent_id !== session.id) continue;
			if (sub.prompt_file && !sub.prompt) {
				this.deps.onLog(
					'warn',
					`[CUE] "${sub.name}" has prompt_file "${sub.prompt_file}" but the file was not found — subscription will fail on trigger`
				);
			}
			if (sub.output_prompt_file && !sub.output_prompt) {
				this.deps.onLog(
					'warn',
					`[CUE] "${sub.name}" has output_prompt_file "${sub.output_prompt_file}" but the file was not found`
				);
			}
		}

		// Set up subscriptions
		const setupDeps: SubscriptionSetupDeps = {
			enabled: () => this.enabled,
			scheduledFiredKeys: this.scheduledFiredKeys,
			onLog: this.deps.onLog,
			executeCueRun: (sid, prompt, event, subName, outputPrompt) => {
				this.runManager.execute(sid, prompt, event, subName, outputPrompt);
			},
		};

		for (const sub of config.subscriptions) {
			if (sub.enabled === false) continue;
			// Skip subscriptions bound to a different agent
			if (sub.agent_id && sub.agent_id !== session.id) continue;

			if (sub.event === 'time.heartbeat' && sub.interval_minutes) {
				setupHeartbeatSubscription(setupDeps, session, state, sub);
			} else if (sub.event === 'time.scheduled' && sub.schedule_times?.length) {
				setupScheduledSubscription(setupDeps, session, state, sub);
			} else if (sub.event === 'file.changed' && sub.watch) {
				setupFileWatcherSubscription(setupDeps, session, state, sub);
			} else if (sub.event === 'task.pending' && sub.watch) {
				setupTaskScannerSubscription(setupDeps, session, state, sub);
			} else if (sub.event === 'github.pull_request' || sub.event === 'github.issue') {
				setupGitHubPollerSubscription(setupDeps, session, state, sub);
			}
			// agent.completed subscriptions are handled reactively via notifyAgentCompleted
		}

		this.sessions.set(session.id, state);
		this.deps.onLog(
			'cue',
			`[CUE] Initialized session "${session.name}" with ${config.subscriptions.filter((s) => s.enabled !== false).length} active subscription(s)`
		);
	}

	private pushActivityLog(result: CueRunResult): void {
		this.activityLog.push(result);
	}

	private teardownSession(sessionId: string): void {
		const state = this.sessions.get(sessionId);
		if (!state) return;

		for (const timer of state.timers) {
			clearInterval(timer);
		}
		for (const cleanup of state.watchers) {
			cleanup();
		}
		if (state.yamlWatcher) {
			state.yamlWatcher();
		}

		// Clean up fan-in trackers and timers for this session
		this.clearFanInState(sessionId);

		// Clean up queued events for this session (prevents stale events after config reload)
		this.clearQueue(sessionId);

		// Clean up scheduledFiredKeys for this session's subscriptions
		for (const sub of state.config.subscriptions) {
			for (const key of this.scheduledFiredKeys) {
				if (key.startsWith(`${sessionId}:${sub.name}:`)) {
					this.scheduledFiredKeys.delete(key);
				}
			}
		}
	}
}

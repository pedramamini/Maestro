import type { MainLogLevel } from '../../shared/logger-types';
import type { SessionInfo } from '../../shared/types';
import { describeFilter, matchesFilter } from './cue-filter';
import { loadCueConfig, watchCueYaml } from './cue-yaml-loader';
import {
	setupFileWatcherSubscription,
	setupGitHubPollerSubscription,
	setupHeartbeatSubscription,
	setupScheduledSubscription,
	setupTaskScannerSubscription,
	type SubscriptionSetupDeps,
} from './cue-subscription-setup';
import { createCueEvent, type CueConfig, type CueEvent, type CueSubscription } from './cue-types';
import { hasTimeBasedSubscriptions, type SessionState } from './cue-session-state';

export interface CueSessionRuntimeServiceDeps {
	enabled: () => boolean;
	getSessions: () => SessionInfo[];
	onRefreshRequested: (sessionId: string, projectRoot: string) => void;
	onLog: (level: MainLogLevel, message: string, data?: unknown) => void;
	onPreventSleep?: (reason: string) => void;
	onAllowSleep?: (reason: string) => void;
	scheduledFiredKeys: Set<string>;
	startupFiredKeys: Set<string>;
	isBootScan: () => boolean;
	executeCueRun: (
		sessionId: string,
		prompt: string,
		event: CueEvent,
		subscriptionName: string,
		outputPrompt?: string,
		chainDepth?: number
	) => void;
	dispatchSubscription: (
		ownerSessionId: string,
		sub: CueSubscription,
		event: CueEvent,
		sourceSessionName: string,
		chainDepth?: number
	) => void;
	clearQueue: (sessionId: string, preserveStartup?: boolean) => void;
	clearFanInState: (sessionId: string) => void;
}

export interface CueSessionRuntimeService {
	getSessionStates(): Map<string, SessionState>;
	getSessionConfigs(): Map<string, CueConfig>;
	hasSession(sessionId: string): boolean;
	getSessionState(sessionId: string): SessionState | undefined;
	initSession(session: SessionInfo): void;
	refreshSession(
		sessionId: string,
		projectRoot: string
	): {
		reloaded: boolean;
		configRemoved: boolean;
		sessionName?: string;
		activeCount?: number;
	};
	removeSession(sessionId: string): void;
	teardownSession(sessionId: string): void;
	clearAll(): void;
}

export function createCueSessionRuntimeService(
	deps: CueSessionRuntimeServiceDeps
): CueSessionRuntimeService {
	const sessions = new Map<string, SessionState>();
	const pendingYamlWatchers = new Map<string, () => void>();

	function getSession(sessionId: string): SessionInfo | undefined {
		return deps.getSessions().find((session) => session.id === sessionId);
	}

	function initSession(session: SessionInfo): void {
		if (!deps.enabled()) return;

		const config = loadCueConfig(session.projectRoot);
		if (!config) return;

		const state: SessionState = {
			config,
			timers: [],
			watchers: [],
			yamlWatcher: null,
			nextTriggers: new Map(),
		};

		state.yamlWatcher = watchCueYaml(session.projectRoot, () => {
			deps.onRefreshRequested(session.id, session.projectRoot);
		});

		for (const sub of config.subscriptions) {
			if (sub.enabled === false) continue;
			if (sub.agent_id && sub.agent_id !== session.id) continue;
			if (sub.prompt_file && !sub.prompt) {
				deps.onLog(
					'warn',
					`[CUE] "${sub.name}" has prompt_file "${sub.prompt_file}" but the file was not found — subscription will fail on trigger`
				);
			}
			if (sub.output_prompt_file && !sub.output_prompt) {
				deps.onLog(
					'warn',
					`[CUE] "${sub.name}" has output_prompt_file "${sub.output_prompt_file}" but the file was not found`
				);
			}
		}

		const setupDeps: SubscriptionSetupDeps = {
			enabled: deps.enabled,
			scheduledFiredKeys: deps.scheduledFiredKeys,
			onLog: deps.onLog,
			executeCueRun: deps.executeCueRun,
		};

		for (const sub of config.subscriptions) {
			if (sub.enabled === false) continue;
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
		}

		for (const sub of config.subscriptions) {
			if (sub.enabled === false) continue;
			if (sub.agent_id && sub.agent_id !== session.id) continue;
			if (sub.event !== 'app.startup') continue;
			if (!deps.isBootScan()) continue;

			const firedKey = `${session.id}:${sub.name}`;
			if (deps.startupFiredKeys.has(firedKey)) continue;
			deps.startupFiredKeys.add(firedKey);

			const event = createCueEvent('app.startup', sub.name, {
				reason: 'system_startup',
			});

			if (sub.filter && !matchesFilter(event.payload, sub.filter)) {
				deps.onLog('cue', `[CUE] "${sub.name}" filter not matched (${describeFilter(sub.filter)})`);
				continue;
			}

			deps.onLog('cue', `[CUE] "${sub.name}" triggered (app.startup)`);
			state.lastTriggered = event.timestamp;
			deps.dispatchSubscription(session.id, sub, event, session.name);
		}

		sessions.set(session.id, state);

		if (hasTimeBasedSubscriptions(config, session.id)) {
			deps.onPreventSleep?.(`cue:schedule:${session.id}`);
		}

		deps.onLog(
			'cue',
			`[CUE] Initialized session "${session.name}" with ${config.subscriptions.filter((sub) => sub.enabled !== false).length} active subscription(s)`
		);
	}

	function teardownSession(sessionId: string): void {
		const state = sessions.get(sessionId);
		if (!state) return;

		deps.onAllowSleep?.(`cue:schedule:${sessionId}`);

		for (const timer of state.timers) {
			clearInterval(timer);
		}
		for (const cleanup of state.watchers) {
			cleanup();
		}
		if (state.yamlWatcher) {
			state.yamlWatcher();
		}

		deps.clearFanInState(sessionId);
		deps.clearQueue(sessionId, true);

		for (const sub of state.config.subscriptions) {
			for (const key of deps.scheduledFiredKeys) {
				if (key.startsWith(`${sessionId}:${sub.name}:`)) {
					deps.scheduledFiredKeys.delete(key);
				}
			}
		}
	}

	function refreshSession(
		sessionId: string,
		projectRoot: string
	): { reloaded: boolean; configRemoved: boolean; sessionName?: string; activeCount?: number } {
		const hadSession = sessions.has(sessionId);
		teardownSession(sessionId);
		sessions.delete(sessionId);

		const pendingWatcher = pendingYamlWatchers.get(sessionId);
		if (pendingWatcher) {
			pendingWatcher();
			pendingYamlWatchers.delete(sessionId);
		}

		const session = getSession(sessionId);
		if (!session) {
			return { reloaded: false, configRemoved: false };
		}

		initSession({ ...session, projectRoot });
		const newState = sessions.get(sessionId);
		if (newState) {
			const activeCount = newState.config.subscriptions.filter(
				(sub) => sub.enabled !== false
			).length;
			return {
				reloaded: true,
				configRemoved: false,
				sessionName: session.name,
				activeCount,
			};
		}

		if (hadSession) {
			const yamlWatcher = watchCueYaml(projectRoot, () => {
				deps.onRefreshRequested(sessionId, projectRoot);
			});
			pendingYamlWatchers.set(sessionId, yamlWatcher);
			return {
				reloaded: false,
				configRemoved: true,
				sessionName: session.name,
			};
		}

		return { reloaded: false, configRemoved: false, sessionName: session.name };
	}

	function removeSession(sessionId: string): void {
		teardownSession(sessionId);
		sessions.delete(sessionId);
		deps.clearQueue(sessionId);

		for (const key of deps.startupFiredKeys) {
			if (key.startsWith(`${sessionId}:`)) {
				deps.startupFiredKeys.delete(key);
			}
		}

		const pendingWatcher = pendingYamlWatchers.get(sessionId);
		if (pendingWatcher) {
			pendingWatcher();
			pendingYamlWatchers.delete(sessionId);
		}
	}

	return {
		getSessionStates(): Map<string, SessionState> {
			return new Map(sessions);
		},

		getSessionConfigs(): Map<string, CueConfig> {
			const configs = new Map<string, CueConfig>();
			for (const [sessionId, state] of sessions) {
				configs.set(sessionId, state.config);
			}
			return configs;
		},

		hasSession(sessionId: string): boolean {
			return sessions.has(sessionId);
		},

		getSessionState(sessionId: string): SessionState | undefined {
			return sessions.get(sessionId);
		},

		initSession,
		refreshSession,

		removeSession(sessionId: string): void {
			removeSession(sessionId);
			deps.onLog('cue', `[CUE] Session removed: ${sessionId}`);
		},

		teardownSession,

		clearAll(): void {
			for (const [sessionId] of sessions) {
				teardownSession(sessionId);
			}
			sessions.clear();

			for (const [, cleanup] of pendingYamlWatchers) {
				cleanup();
			}
			pendingYamlWatchers.clear();
		},
	};
}

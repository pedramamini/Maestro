import type { CueConfig, CueSessionStatus, CueSubscription } from './cue-types';

/** Internal state per session with an active Cue config */
export interface SessionState {
	config: CueConfig;
	timers: ReturnType<typeof setInterval>[];
	watchers: (() => void)[];
	yamlWatcher: (() => void) | null;
	sleepPrevented: boolean;
	lastTriggered?: string;
	nextTriggers: Map<string, number>;
}

export function countActiveSubscriptions(
	subscriptions: CueSubscription[],
	sessionId: string
): number {
	return subscriptions.filter(
		(sub) => sub.enabled !== false && (!sub.agent_id || sub.agent_id === sessionId)
	).length;
}

export function getEarliestNextTriggerIso(state: SessionState): string | undefined {
	if (state.nextTriggers.size === 0) {
		return undefined;
	}

	const earliest = Math.min(...state.nextTriggers.values());
	return new Date(earliest).toISOString();
}

export function hasTimeBasedSubscriptions(config: CueConfig, sessionId: string): boolean {
	return config.subscriptions.some(
		(sub) =>
			sub.enabled !== false &&
			(!sub.agent_id || sub.agent_id === sessionId) &&
			((sub.event === 'time.heartbeat' &&
				typeof sub.interval_minutes === 'number' &&
				sub.interval_minutes > 0) ||
				(sub.event === 'time.scheduled' &&
					Array.isArray(sub.schedule_times) &&
					sub.schedule_times.length > 0))
	);
}

export function toSessionStatus(params: {
	sessionId: string;
	sessionName: string;
	toolType: string;
	projectRoot: string;
	enabled: boolean;
	subscriptionCount: number;
	activeRuns: number;
	state?: SessionState;
}): CueSessionStatus {
	return {
		sessionId: params.sessionId,
		sessionName: params.sessionName,
		toolType: params.toolType,
		projectRoot: params.projectRoot,
		enabled: params.enabled,
		subscriptionCount: params.subscriptionCount,
		activeRuns: params.activeRuns,
		lastTriggered: params.state?.lastTriggered,
		nextTrigger: params.state ? getEarliestNextTriggerIso(params.state) : undefined,
	};
}

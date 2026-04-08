/**
 * Subscription setup logic for the Cue Engine.
 *
 * Sets up event source subscriptions (timers, file watchers, pollers, task scanners)
 * for a session's Cue config. Each setup method creates the necessary watchers/timers
 * and wires them to the engine's event dispatch pipeline.
 */

import type { MainLogLevel } from '../../shared/logger-types';
import type { SessionInfo } from '../../shared/types';
import { createCueEvent, type CueEvent, type CueSubscription } from './cue-types';
import { createCueFileWatcher } from './cue-file-watcher';
import { createCueGitHubPoller } from './cue-github-poller';
import { createCueTaskScanner } from './cue-task-scanner';
import { matchesFilter, describeFilter } from './cue-filter';

export const DEFAULT_FILE_DEBOUNCE_MS = 5000;

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/**
 * Calculates the next occurrence of a scheduled time.
 * Returns a timestamp in ms, or null if inputs are invalid.
 */
export function calculateNextScheduledTime(times: string[], days?: string[]): number | null {
	if (times.length === 0) return null;

	const now = new Date();
	const candidates: number[] = [];

	// Check up to 8 days ahead (0..7) to cover same-day-next-week when today's slot has passed
	for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
		const candidate = new Date(now);
		candidate.setDate(candidate.getDate() + dayOffset);
		const dayName = DAY_NAMES[candidate.getDay()];

		if (days && days.length > 0 && !days.includes(dayName)) continue;

		for (const time of times) {
			const [hourStr, minStr] = time.split(':');
			const hour = parseInt(hourStr, 10);
			const min = parseInt(minStr, 10);
			if (isNaN(hour) || isNaN(min)) continue;

			const target = new Date(candidate);
			target.setHours(hour, min, 0, 0);

			if (target.getTime() > now.getTime()) {
				candidates.push(target.getTime());
			}
		}
	}

	return candidates.length > 0 ? Math.min(...candidates) : null;
}

/** Mutable state passed to subscription setup functions */
export interface SubscriptionSetupState {
	timers: ReturnType<typeof setInterval>[];
	watchers: (() => void)[];
	lastTriggered?: string;
	nextTriggers: Map<string, number>;
}

/** Dependencies for subscription setup */
export interface SubscriptionSetupDeps {
	enabled: () => boolean;
	scheduledFiredKeys: Set<string>;
	onLog: (level: MainLogLevel, message: string, data?: unknown) => void;
	dispatchSubscription: (
		ownerSessionId: string,
		sub: CueSubscription,
		event: CueEvent,
		sourceSessionName: string
	) => void;
	executeCueRun: (
		sessionId: string,
		prompt: string,
		event: CueEvent,
		subscriptionName: string,
		outputPrompt?: string
	) => void;
}

function dispatchOrExecuteSubscription(
	deps: SubscriptionSetupDeps,
	session: SessionInfo,
	sub: CueSubscription,
	event: CueEvent
): void {
	if (sub.fan_out && sub.fan_out.length > 0) {
		deps.dispatchSubscription(session.id, sub, event, session.name);
		return;
	}

	deps.executeCueRun(session.id, sub.prompt ?? sub.prompt_file, event, sub.name, sub.output_prompt);
}

export function setupHeartbeatSubscription(
	deps: SubscriptionSetupDeps,
	session: SessionInfo,
	state: SubscriptionSetupState,
	sub: CueSubscription
): void {
	const intervalMs = (sub.interval_minutes ?? 0) * 60 * 1000;
	if (intervalMs <= 0) return;

	// Fire immediately on first setup
	const immediateEvent = createCueEvent('time.heartbeat', sub.name, {
		interval_minutes: sub.interval_minutes,
	});

	// Check payload filter (even for timer events)
	if (!sub.filter || matchesFilter(immediateEvent.payload, sub.filter)) {
		deps.onLog('cue', `[CUE] "${sub.name}" triggered (time.heartbeat, initial)`);
		state.lastTriggered = immediateEvent.timestamp;
		dispatchOrExecuteSubscription(deps, session, sub, immediateEvent);
	} else {
		deps.onLog('cue', `[CUE] "${sub.name}" filter not matched (${describeFilter(sub.filter)})`);
	}

	// Then on the interval
	const timer = setInterval(() => {
		if (!deps.enabled()) return;

		const event = createCueEvent('time.heartbeat', sub.name, {
			interval_minutes: sub.interval_minutes,
		});

		// Check payload filter
		if (sub.filter && !matchesFilter(event.payload, sub.filter)) {
			deps.onLog('cue', `[CUE] "${sub.name}" filter not matched (${describeFilter(sub.filter)})`);
			return;
		}

		deps.onLog('cue', `[CUE] "${sub.name}" triggered (time.heartbeat)`);
		state.lastTriggered = event.timestamp;
		state.nextTriggers.set(sub.name, Date.now() + intervalMs);
		dispatchOrExecuteSubscription(deps, session, sub, event);
	}, intervalMs);

	state.nextTriggers.set(sub.name, Date.now() + intervalMs);
	state.timers.push(timer);
}

export function setupScheduledSubscription(
	deps: SubscriptionSetupDeps,
	session: SessionInfo,
	state: SubscriptionSetupState,
	sub: CueSubscription
): void {
	const times = sub.schedule_times ?? [];
	if (times.length === 0) return;

	const checkAndFire = () => {
		if (!deps.enabled()) return;

		const now = new Date();
		const currentDay = DAY_NAMES[now.getDay()];
		const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

		// Check day filter (if specified, current day must match)
		if (sub.schedule_days && sub.schedule_days.length > 0) {
			if (!sub.schedule_days.includes(currentDay)) {
				return;
			}
		}

		// Check if current time matches any scheduled time
		if (!times.includes(currentTime)) {
			// Evict stale fired-keys from previous minutes
			for (const key of deps.scheduledFiredKeys) {
				if (key.startsWith(`${session.id}:${sub.name}:`) && !key.endsWith(`:${currentTime}`)) {
					deps.scheduledFiredKeys.delete(key);
				}
			}
			return;
		}

		// Guard against double-fire (e.g., config refresh within the same minute)
		const firedKey = `${session.id}:${sub.name}:${currentTime}`;
		if (deps.scheduledFiredKeys.has(firedKey)) {
			return;
		}
		deps.scheduledFiredKeys.add(firedKey);

		const event = createCueEvent('time.scheduled', sub.name, {
			schedule_times: sub.schedule_times,
			schedule_days: sub.schedule_days,
			matched_time: currentTime,
			matched_day: currentDay,
		});

		// Refresh next trigger time regardless of filter outcome so the UI stays current
		const nextMs = calculateNextScheduledTime(times, sub.schedule_days);
		if (nextMs != null) {
			state.nextTriggers.set(sub.name, nextMs);
		}

		if (sub.filter && !matchesFilter(event.payload, sub.filter)) {
			deps.onLog('cue', `[CUE] "${sub.name}" filter not matched (${describeFilter(sub.filter)})`);
			return;
		}

		deps.onLog('cue', `[CUE] "${sub.name}" triggered (time.scheduled, ${currentTime})`);
		state.lastTriggered = event.timestamp;
		dispatchOrExecuteSubscription(deps, session, sub, event);
	};

	// Check every 60 seconds to catch scheduled times
	const timer = setInterval(checkAndFire, 60_000);
	state.timers.push(timer);

	// Calculate and track the next trigger time
	const nextMs = calculateNextScheduledTime(times, sub.schedule_days);
	if (nextMs != null) {
		state.nextTriggers.set(sub.name, nextMs);
	}
}

export function setupFileWatcherSubscription(
	deps: SubscriptionSetupDeps,
	session: SessionInfo,
	state: SubscriptionSetupState,
	sub: CueSubscription
): void {
	if (!sub.watch) return;

	const cleanup = createCueFileWatcher({
		watchGlob: sub.watch,
		projectRoot: session.projectRoot,
		debounceMs: DEFAULT_FILE_DEBOUNCE_MS,
		triggerName: sub.name,
		onLog: (level, message) => deps.onLog(level as MainLogLevel, message),
		onEvent: (event) => {
			if (!deps.enabled()) return;

			// Check payload filter
			if (sub.filter && !matchesFilter(event.payload, sub.filter)) {
				deps.onLog('cue', `[CUE] "${sub.name}" filter not matched (${describeFilter(sub.filter)})`);
				return;
			}

			deps.onLog('cue', `[CUE] "${sub.name}" triggered (file.changed)`);
			state.lastTriggered = event.timestamp;
			dispatchOrExecuteSubscription(deps, session, sub, event);
		},
	});

	state.watchers.push(cleanup);
}

export function setupGitHubPollerSubscription(
	deps: SubscriptionSetupDeps,
	session: SessionInfo,
	state: SubscriptionSetupState,
	sub: CueSubscription
): void {
	const cleanup = createCueGitHubPoller({
		eventType: sub.event as 'github.pull_request' | 'github.issue',
		repo: sub.repo,
		pollMinutes: sub.poll_minutes ?? 5,
		projectRoot: session.projectRoot,
		triggerName: sub.name,
		subscriptionId: `${session.id}:${sub.name}`,
		ghState: sub.gh_state,
		onLog: (level, message) => deps.onLog(level as MainLogLevel, message),
		onEvent: (event) => {
			if (!deps.enabled()) return;

			// Check payload filter
			if (sub.filter && !matchesFilter(event.payload, sub.filter)) {
				deps.onLog('cue', `[CUE] "${sub.name}" filter not matched (${describeFilter(sub.filter)})`);
				return;
			}

			deps.onLog('cue', `[CUE] "${sub.name}" triggered (${sub.event})`);
			state.lastTriggered = event.timestamp;
			dispatchOrExecuteSubscription(deps, session, sub, event);
		},
	});

	state.watchers.push(cleanup);
}

export function setupTaskScannerSubscription(
	deps: SubscriptionSetupDeps,
	session: SessionInfo,
	state: SubscriptionSetupState,
	sub: CueSubscription
): void {
	if (!sub.watch) return;

	const cleanup = createCueTaskScanner({
		watchGlob: sub.watch,
		pollMinutes: sub.poll_minutes ?? 1,
		projectRoot: session.projectRoot,
		triggerName: sub.name,
		onLog: (level, message) => deps.onLog(level as MainLogLevel, message),
		onEvent: (event) => {
			if (!deps.enabled()) return;

			// Check payload filter
			if (sub.filter && !matchesFilter(event.payload, sub.filter)) {
				deps.onLog('cue', `[CUE] "${sub.name}" filter not matched (${describeFilter(sub.filter)})`);
				return;
			}

			deps.onLog(
				'cue',
				`[CUE] "${sub.name}" triggered (task.pending: ${event.payload.taskCount} task(s) in ${event.payload.filename})`
			);
			state.lastTriggered = event.timestamp;
			dispatchOrExecuteSubscription(deps, session, sub, event);
		},
	});

	state.watchers.push(cleanup);
}

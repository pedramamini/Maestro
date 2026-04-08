import {
	DEFAULT_CUE_SETTINGS,
	type CueConfig,
	type CueGraphSession,
	type CueSessionStatus,
	type CueSettings,
} from './cue-types';
import { countActiveSubscriptions, toSessionStatus, type SessionState } from './cue-session-state';

export interface CueQueryServiceDeps {
	enabled: () => boolean;
	getAllSessions: () => Array<{
		id: string;
		name: string;
		toolType: string;
		projectRoot: string;
	}>;
	getSessionStates: () => Map<string, SessionState>;
	getActiveRunCount: (sessionId: string) => number;
	loadConfigForProjectRoot: (projectRoot: string) => CueConfig | null;
}

export interface CueQueryService {
	getStatus(): CueSessionStatus[];
	getGraphData(): CueGraphSession[];
	getSettings(): CueSettings;
}

export function createCueQueryService(deps: CueQueryServiceDeps): CueQueryService {
	return {
		getStatus(): CueSessionStatus[] {
			const result: CueSessionStatus[] = [];
			const allSessions = deps.getAllSessions();
			const reportedSessionIds = new Set<string>();

			for (const [sessionId, state] of deps.getSessionStates()) {
				const session = allSessions.find((candidate) => candidate.id === sessionId);
				if (!session) continue;

				reportedSessionIds.add(sessionId);
				result.push(
					toSessionStatus({
						sessionId,
						sessionName: session.name,
						toolType: session.toolType,
						projectRoot: session.projectRoot,
						enabled: true,
						subscriptionCount: countActiveSubscriptions(state.config.subscriptions, sessionId),
						activeRuns: deps.getActiveRunCount(sessionId),
						state,
					})
				);
			}

			if (!deps.enabled()) {
				for (const session of allSessions) {
					if (reportedSessionIds.has(session.id)) continue;
					const config = deps.loadConfigForProjectRoot(session.projectRoot);
					if (!config) continue;

					result.push(
						toSessionStatus({
							sessionId: session.id,
							sessionName: session.name,
							toolType: session.toolType,
							projectRoot: session.projectRoot,
							enabled: false,
							subscriptionCount: countActiveSubscriptions(config.subscriptions, session.id),
							activeRuns: 0,
						})
					);
				}
			}

			return result;
		},

		getGraphData(): CueGraphSession[] {
			const result: CueGraphSession[] = [];
			const allSessions = deps.getAllSessions();
			const reportedSessionIds = new Set<string>();

			for (const [sessionId, state] of deps.getSessionStates()) {
				const session = allSessions.find((candidate) => candidate.id === sessionId);
				if (!session) continue;

				reportedSessionIds.add(sessionId);
				result.push({
					sessionId,
					sessionName: session.name,
					toolType: session.toolType,
					subscriptions: state.config.subscriptions,
				});
			}

			if (!deps.enabled()) {
				for (const session of allSessions) {
					if (reportedSessionIds.has(session.id)) continue;
					const config = deps.loadConfigForProjectRoot(session.projectRoot);
					if (!config) continue;

					result.push({
						sessionId: session.id,
						sessionName: session.name,
						toolType: session.toolType,
						subscriptions: config.subscriptions,
					});
				}
			}

			return result;
		},

		getSettings(): CueSettings {
			for (const [, state] of deps.getSessionStates()) {
				return { ...state.config.settings };
			}
			return { ...DEFAULT_CUE_SETTINGS };
		},
	};
}

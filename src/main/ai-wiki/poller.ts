import type { AiWikiProjectRequest, AiWikiSourceSnapshot } from '../../shared/ai-wiki-types';
import type { AiWikiService } from './service';

const DEFAULT_AI_WIKI_POLL_INTERVAL_MS = 3 * 60_000;
const LOG_CONTEXT = '[AIWikiPoller]';

export interface AiWikiPollerSession {
	aiWikiEnabled?: unknown;
	projectRoot?: unknown;
	cwd?: unknown;
	fullPath?: unknown;
	sshRemoteId?: unknown;
	sshRemote?: {
		id?: unknown;
	};
	sessionSshRemoteConfig?: {
		enabled?: unknown;
		remoteId?: unknown;
	};
}

export interface AiWikiPollerDeps {
	intervalMs?: number;
	getSessions: () => AiWikiPollerSession[];
	service: Pick<AiWikiService, 'getStatus' | 'refresh'>;
	logger?: {
		debug?: (message: string, context?: string, data?: unknown) => void;
		info?: (message: string, context?: string, data?: unknown) => void;
		warn?: (message: string, context?: string, data?: unknown) => void;
	};
}

function normalizeProjectRoot(value: string): string {
	return value.trim().replace(/[\\/]+$/g, '');
}

function resolveSessionProjectRoot(session: AiWikiPollerSession): string | null {
	const root = session.projectRoot || session.cwd || session.fullPath;
	return typeof root === 'string' && root.trim() ? normalizeProjectRoot(root) : null;
}

function resolveSessionSshRemoteId(session: AiWikiPollerSession): string | null {
	if (typeof session.sshRemoteId === 'string' && session.sshRemoteId.trim()) {
		return session.sshRemoteId.trim();
	}

	if (
		session.sessionSshRemoteConfig?.enabled === true &&
		typeof session.sessionSshRemoteConfig.remoteId === 'string' &&
		session.sessionSshRemoteConfig.remoteId.trim()
	) {
		return session.sessionSshRemoteConfig.remoteId.trim();
	}

	if (typeof session.sshRemote?.id === 'string' && session.sshRemote.id.trim()) {
		return session.sshRemote.id.trim();
	}

	return null;
}

export function discoverAiWikiProjectsFromSessions(
	sessions: AiWikiPollerSession[]
): AiWikiProjectRequest[] {
	const projects = new Map<string, AiWikiProjectRequest>();

	for (const session of sessions) {
		if (session.aiWikiEnabled !== true) continue;

		const projectRoot = resolveSessionProjectRoot(session);
		if (!projectRoot) continue;

		const sshRemoteId = resolveSessionSshRemoteId(session);
		const key = `${sshRemoteId ?? 'local'}:${projectRoot}`;
		if (projects.has(key)) continue;

		projects.set(key, {
			projectRoot,
			sshRemoteId,
		});
	}

	return Array.from(projects.values());
}

export async function runAiWikiPollTick(deps: AiWikiPollerDeps): Promise<void> {
	const log = deps.logger ?? {};
	const projects = discoverAiWikiProjectsFromSessions(deps.getSessions());
	if (projects.length === 0) return;

	log.debug?.(`AI Wiki poll tick checking ${projects.length} project(s)`, LOG_CONTEXT);

	for (const project of projects) {
		try {
			const status = await deps.service.getStatus(project);
			if (!shouldRefreshAiWiki(status)) continue;

			const refreshed = await deps.service.refresh(project);
			log.info?.(
				`AI Wiki refreshed "${refreshed.projectId}" at ${refreshed.state.lastIndexedSha ?? 'unknown HEAD'}`,
				LOG_CONTEXT,
				{
					projectRoot: project.projectRoot,
					sshRemoteId: project.sshRemoteId ?? null,
				}
			);
		} catch (error) {
			log.warn?.(
				`AI Wiki poll failed for "${project.projectRoot}": ${
					error instanceof Error ? error.message : String(error)
				}`,
				LOG_CONTEXT,
				{
					projectRoot: project.projectRoot,
					sshRemoteId: project.sshRemoteId ?? null,
				}
			);
		}
	}
}

export function startAiWikiPoller(deps: AiWikiPollerDeps): NodeJS.Timeout {
	const intervalMs = deps.intervalMs ?? DEFAULT_AI_WIKI_POLL_INTERVAL_MS;
	const log = deps.logger ?? {};
	let running = false;

	log.info?.(`AI Wiki poller started (intervalMs=${intervalMs})`, LOG_CONTEXT);

	const handle = setInterval(() => {
		if (running) {
			log.debug?.(
				'AI Wiki poll tick skipped because a previous tick is still running',
				LOG_CONTEXT
			);
			return;
		}

		running = true;
		void runAiWikiPollTick(deps).finally(() => {
			running = false;
		});
	}, intervalMs);

	if (handle.unref) {
		handle.unref();
	}

	return handle;
}

export function stopAiWikiPoller(timer: NodeJS.Timeout): void {
	clearInterval(timer);
}

function shouldRefreshAiWiki(status: AiWikiSourceSnapshot): boolean {
	return Boolean(status.headSha && status.headSha !== status.state.lastIndexedSha);
}

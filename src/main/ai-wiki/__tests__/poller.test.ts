import { describe, expect, it, vi } from 'vitest';
import {
	discoverAiWikiProjectsFromSessions,
	runAiWikiPollTick,
	startAiWikiPoller,
	stopAiWikiPoller,
} from '../poller';
import type { AiWikiSourceSnapshot } from '../../../shared/ai-wiki-types';

function makeStatus(headSha: string | null, lastIndexedSha: string | null): AiWikiSourceSnapshot {
	return {
		projectId: 'project-1',
		wikiPath: '/tmp/userData/project-wikis/project-1',
		headSha,
		remoteSha: null,
		changedFiles: [],
		state: {
			sourceMode: 'local',
			projectRoot: '/repo',
			branch: 'main',
			lastIndexedSha,
			lastKnownRemoteSha: null,
			lastUpdatedAt: '2026-05-02T00:00:00.000Z',
		},
	};
}

describe('ai-wiki poller', () => {
	it('groups sessions by project root and SSH remote id', () => {
		expect(
			discoverAiWikiProjectsFromSessions([
				{ projectRoot: '/repo/', sshRemoteId: 'remote-a', aiWikiEnabled: true },
				{ projectRoot: '/repo', sshRemoteId: 'remote-a', aiWikiEnabled: true },
				{ projectRoot: '/repo', sshRemoteId: 'remote-b', aiWikiEnabled: true },
				{ cwd: '/local/repo', aiWikiEnabled: true },
				{ fullPath: '   ', aiWikiEnabled: true },
				{ projectRoot: '/disabled', sshRemoteId: 'remote-a', aiWikiEnabled: false },
				{
					projectRoot: '/fallback-remote',
					sessionSshRemoteConfig: { enabled: true, remoteId: 'remote-c' },
					aiWikiEnabled: true,
				},
				{
					projectRoot: '/legacy-remote',
					sshRemote: { id: 'remote-d' },
					aiWikiEnabled: true,
				},
			])
		).toEqual([
			{ projectRoot: '/repo', sshRemoteId: 'remote-a' },
			{ projectRoot: '/repo', sshRemoteId: 'remote-b' },
			{ projectRoot: '/local/repo', sshRemoteId: null },
			{ projectRoot: '/fallback-remote', sshRemoteId: 'remote-c' },
			{ projectRoot: '/legacy-remote', sshRemoteId: 'remote-d' },
		]);
	});

	it('ignores unmarked sessions completely', async () => {
		const service = {
			getStatus: vi.fn().mockResolvedValue(makeStatus('new-sha', null)),
			refresh: vi.fn().mockResolvedValue(makeStatus('new-sha', 'new-sha')),
		};

		await runAiWikiPollTick({
			service,
			getSessions: () => [
				{ projectRoot: '/unmarked' },
				{ projectRoot: '/disabled', aiWikiEnabled: false },
			],
		});

		expect(discoverAiWikiProjectsFromSessions([{ projectRoot: '/unmarked' }])).toEqual([]);
		expect(service.getStatus).not.toHaveBeenCalled();
		expect(service.refresh).not.toHaveBeenCalled();
	});

	it('refreshes a project when HEAD differs from the indexed SHA', async () => {
		const service = {
			getStatus: vi.fn().mockResolvedValue(makeStatus('new-sha', 'old-sha')),
			refresh: vi.fn().mockResolvedValue(makeStatus('new-sha', 'new-sha')),
		};
		const logger = {
			info: vi.fn(),
			warn: vi.fn(),
			debug: vi.fn(),
		};

		await runAiWikiPollTick({
			service,
			getSessions: () => [
				{ projectRoot: '/repo', aiWikiEnabled: true },
				{ projectRoot: '/repo', aiWikiEnabled: true },
			],
			logger,
		});

		expect(service.getStatus).toHaveBeenCalledTimes(1);
		expect(service.getStatus).toHaveBeenCalledWith({ projectRoot: '/repo', sshRemoteId: null });
		expect(service.refresh).toHaveBeenCalledTimes(1);
		expect(service.refresh).toHaveBeenCalledWith({ projectRoot: '/repo', sshRemoteId: null });
		expect(logger.info).toHaveBeenCalledTimes(1);
		expect(logger.warn).not.toHaveBeenCalled();
	});

	it('skips refresh when HEAD matches the indexed SHA', async () => {
		const service = {
			getStatus: vi.fn().mockResolvedValue(makeStatus('same-sha', 'same-sha')),
			refresh: vi.fn(),
		};

		await runAiWikiPollTick({
			service,
			getSessions: () => [{ projectRoot: '/repo', aiWikiEnabled: true }],
		});

		expect(service.getStatus).toHaveBeenCalledTimes(1);
		expect(service.refresh).not.toHaveBeenCalled();
	});

	it('continues polling remaining projects after a project error', async () => {
		const service = {
			getStatus: vi
				.fn()
				.mockRejectedValueOnce(new Error('not a git repo'))
				.mockResolvedValueOnce(makeStatus('new-sha', null)),
			refresh: vi.fn().mockResolvedValue(makeStatus('new-sha', 'new-sha')),
		};
		const logger = {
			warn: vi.fn(),
		};

		await runAiWikiPollTick({
			service,
			getSessions: () => [
				{ projectRoot: '/bad', aiWikiEnabled: true },
				{ projectRoot: '/good', aiWikiEnabled: true },
			],
			logger,
		});

		expect(service.getStatus).toHaveBeenCalledTimes(2);
		expect(service.refresh).toHaveBeenCalledTimes(1);
		expect(logger.warn).toHaveBeenCalledTimes(1);
	});

	it('stops the interval when requested', () => {
		vi.useFakeTimers();
		const service = {
			getStatus: vi.fn().mockResolvedValue(makeStatus('new-sha', null)),
			refresh: vi.fn().mockResolvedValue(makeStatus('new-sha', 'new-sha')),
		};

		const timer = startAiWikiPoller({
			intervalMs: 100,
			service,
			getSessions: () => [{ projectRoot: '/repo', aiWikiEnabled: true }],
		});
		stopAiWikiPoller(timer);
		vi.advanceTimersByTime(100);

		expect(service.getStatus).not.toHaveBeenCalled();
		vi.useRealTimers();
	});
});

/**
 * GitHub poller provider for Maestro Cue github.pull_request and github.issue subscriptions.
 *
 * Polls GitHub CLI (`gh`) for new PRs/issues, tracks "seen" state in SQLite,
 * and fires CueEvents for new items. Follows the same factory pattern as cue-file-watcher.ts.
 */

import { execFile as cpExecFile } from 'child_process';
import { createCueEvent, type CueEvent } from './cue-types';
import { isGitHubItemSeen, markGitHubItemSeen, hasAnyGitHubSeen, pruneGitHubSeen } from './cue-db';

function execFileAsync(
	cmd: string,
	args: string[],
	opts?: { cwd?: string; timeout?: number }
): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		cpExecFile(cmd, args, opts ?? {}, (error, stdout, stderr) => {
			if (error) {
				reject(error);
			} else {
				resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
			}
		});
	});
}

export interface CueGitHubPollerConfig {
	eventType: 'github.pull_request' | 'github.issue';
	repo?: string;
	pollMinutes: number;
	projectRoot: string;
	onEvent: (event: CueEvent) => void;
	onLog: (level: string, message: string) => void;
	triggerName: string;
	subscriptionId: string;
	/** GitHub state filter: "open" (default), "closed", "merged" (PRs only), or "all" */
	ghState?: string;
}

/**
 * Creates a GitHub poller for a Cue subscription.
 * Returns a cleanup function to stop polling.
 */
export function createCueGitHubPoller(config: CueGitHubPollerConfig): () => void {
	const {
		eventType,
		pollMinutes,
		projectRoot,
		onEvent,
		onLog,
		triggerName,
		subscriptionId,
		ghState,
	} = config;
	const stateFilter = ghState ?? 'open';

	let stopped = false;
	let initialTimeout: ReturnType<typeof setTimeout> | null = null;
	let pollInterval: ReturnType<typeof setInterval> | null = null;
	let pruneInterval: ReturnType<typeof setInterval> | null = null;

	// Cached state
	let ghAvailable: boolean | null = null;
	let resolvedRepo: string | null = config.repo ?? null;
	/** Tracks whether a poll has been attempted (success or failure) to prevent event flooding on recovery */
	let firstPollAttempted = false;

	async function checkGhAvailable(): Promise<boolean> {
		if (ghAvailable !== null) return ghAvailable;
		try {
			await execFileAsync('gh', ['--version']);
			ghAvailable = true;
		} catch {
			ghAvailable = false;
			onLog('warn', `[CUE] GitHub CLI (gh) not found — skipping "${triggerName}"`);
		}
		return ghAvailable;
	}

	async function resolveRepo(): Promise<string | null> {
		if (resolvedRepo) return resolvedRepo;
		try {
			const { stdout } = await execFileAsync(
				'gh',
				['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'],
				{ cwd: projectRoot, timeout: 10000 }
			);
			resolvedRepo = stdout.trim();
			return resolvedRepo;
		} catch {
			onLog('warn', `[CUE] Could not auto-detect repo for "${triggerName}" — skipping poll`);
			return null;
		}
	}

	async function pollPRs(repo: string): Promise<void> {
		// For "merged" state, query closed PRs and filter by merge status client-side
		const ghStateArg = stateFilter === 'merged' ? 'closed' : stateFilter;
		const { stdout } = await execFileAsync(
			'gh',
			[
				'pr',
				'list',
				'--repo',
				repo,
				'--json',
				'number,title,author,url,body,state,isDraft,labels,headRefName,baseRefName,createdAt,updatedAt,mergedAt',
				'--state',
				ghStateArg,
				'--limit',
				'50',
			],
			{ cwd: projectRoot, timeout: 30000 }
		);

		let items = JSON.parse(stdout);

		// For "merged" state, filter to only merged PRs (have a mergedAt timestamp)
		if (stateFilter === 'merged') {
			items = items.filter((item: { mergedAt?: string }) => !!item.mergedAt);
		}

		const isFirstRun = !hasAnyGitHubSeen(subscriptionId);

		for (const item of items) {
			if (stopped) return;
			const itemKey = `pr:${repo}:${item.number}`;

			if (isFirstRun) {
				markGitHubItemSeen(subscriptionId, itemKey);
				continue;
			}

			if (isGitHubItemSeen(subscriptionId, itemKey)) continue;

			const event = createCueEvent('github.pull_request', triggerName, {
				type: 'pull_request',
				number: item.number,
				title: item.title,
				author: item.author?.login ?? 'unknown',
				url: item.url,
				body: (item.body ?? '').slice(0, 5000),
				state: item.mergedAt ? 'merged' : (item.state?.toLowerCase() ?? 'open'),
				draft: item.isDraft ?? false,
				labels: (item.labels ?? []).map((l: { name: string }) => l.name).join(','),
				head_branch: item.headRefName ?? '',
				base_branch: item.baseRefName ?? '',
				repo,
				created_at: item.createdAt ?? '',
				updated_at: item.updatedAt ?? '',
				merged_at: item.mergedAt ?? '',
			});

			onEvent(event);
			markGitHubItemSeen(subscriptionId, itemKey);
		}

		if (isFirstRun) {
			onLog('info', `[CUE] "${triggerName}" seeded ${items.length} existing pull_request(s)`);
		}
	}

	async function pollIssues(repo: string): Promise<void> {
		const { stdout } = await execFileAsync(
			'gh',
			[
				'issue',
				'list',
				'--repo',
				repo,
				'--json',
				'number,title,author,url,body,state,labels,assignees,createdAt,updatedAt',
				'--state',
				stateFilter === 'merged' ? 'open' : stateFilter, // "merged" not valid for issues, fall back
				'--limit',
				'50',
			],
			{ cwd: projectRoot, timeout: 30000 }
		);

		const items = JSON.parse(stdout);
		const isFirstRun = !hasAnyGitHubSeen(subscriptionId);

		for (const item of items) {
			if (stopped) return;
			const itemKey = `issue:${repo}:${item.number}`;

			if (isFirstRun) {
				markGitHubItemSeen(subscriptionId, itemKey);
				continue;
			}

			if (isGitHubItemSeen(subscriptionId, itemKey)) continue;

			const event = createCueEvent('github.issue', triggerName, {
				type: 'issue',
				number: item.number,
				title: item.title,
				author: item.author?.login ?? 'unknown',
				url: item.url,
				body: (item.body ?? '').slice(0, 5000),
				state: item.state?.toLowerCase() ?? 'open',
				labels: (item.labels ?? []).map((l: { name: string }) => l.name).join(','),
				assignees: (item.assignees ?? []).map((a: { login: string }) => a.login).join(','),
				repo,
				created_at: item.createdAt ?? '',
				updated_at: item.updatedAt ?? '',
			});

			onEvent(event);
			markGitHubItemSeen(subscriptionId, itemKey);
		}

		if (isFirstRun) {
			onLog('info', `[CUE] "${triggerName}" seeded ${items.length} existing issue(s)`);
		}
	}

	async function doPoll(): Promise<void> {
		if (stopped) return;

		try {
			if (!(await checkGhAvailable())) return;

			const repo = await resolveRepo();
			if (!repo) return;

			if (eventType === 'github.pull_request') {
				await pollPRs(repo);
			} else {
				await pollIssues(repo);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			onLog('error', `[CUE] GitHub poll error for "${triggerName}": ${message}`);

			// If the first poll ever fails, place a seed marker so the next successful
			// poll doesn't treat ALL existing items as new (which would swallow items
			// created during the outage by seeding them as "already seen")
			if (!firstPollAttempted) {
				try {
					markGitHubItemSeen(subscriptionId, '__seed_marker__');
					onLog(
						'info',
						`[CUE] First poll for "${triggerName}" failed — seed marker set to prevent silent event loss on recovery`
					);
				} catch {
					// Non-fatal: DB may not be available
				}
			}
		} finally {
			firstPollAttempted = true;
		}
	}

	// Initial poll after 2-second delay
	initialTimeout = setTimeout(() => {
		if (stopped) return;
		doPoll().then(() => {
			if (stopped) return;
			// Start recurring poll
			pollInterval = setInterval(
				() => {
					doPoll();
				},
				pollMinutes * 60 * 1000
			);
		});
	}, 2000);

	// Periodic prune every 24 hours (30-day retention)
	pruneInterval = setInterval(
		() => {
			pruneGitHubSeen(30 * 24 * 60 * 60 * 1000);
		},
		24 * 60 * 60 * 1000
	);

	// Cleanup function
	return () => {
		stopped = true;
		if (initialTimeout) {
			clearTimeout(initialTimeout);
			initialTimeout = null;
		}
		if (pollInterval) {
			clearInterval(pollInterval);
			pollInterval = null;
		}
		if (pruneInterval) {
			clearInterval(pruneInterval);
			pruneInterval = null;
		}
	};
}

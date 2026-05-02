import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { describe, expect, it, vi, afterEach } from 'vitest';

import type { GithubClient, GithubProjectItem } from '../../../main/agent-dispatch/github-client';
import {
	GithubProjectCoordinator,
	type GithubProjectReference,
} from '../../../main/agent-dispatch/github-project-coordinator';
import {
	flushPendingWrites,
	GithubProjectPendingWriteStore,
} from '../../../main/agent-dispatch/github-pending-writes';

const project: GithubProjectReference = {
	projectOwner: 'HumpfTech',
	projectNumber: 9,
	projectPath: '/opt/humpf-ai',
};

const items: GithubProjectItem[] = [
	{
		id: 'item-ready',
		issueNumber: 254,
		title: 'Ready task',
		fields: {
			'AI Status': 'Tasks Ready',
			'AI Assigned Slot': '',
		},
	},
	{
		id: 'item-progress',
		issueNumber: 255,
		title: 'In progress task',
		fields: {
			'AI Status': 'In Progress',
			'AI Assigned Slot': 'agent-1',
		},
	},
];

const tempDirs: string[] = [];

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('GithubProjectCoordinator', () => {
	it('shares a board snapshot across ready and in-flight filtered reads', async () => {
		const listProjectItems = vi.fn<() => Promise<GithubProjectItem[]>>().mockResolvedValue(items);
		const client = createClient({ listProjectItems });
		const coordinator = new GithubProjectCoordinator({
			clientFactory: () => client,
			now: () => 1_000,
		});

		const ready = await coordinator.getReadyItems(project);
		const inFlight = await coordinator.getInFlightItems(project, 'agent-1');

		expect(listProjectItems).toHaveBeenCalledTimes(1);
		expect(ready.map((item) => item.id)).toEqual(['item-ready']);
		expect(inFlight.map((item) => item.id)).toEqual(['item-progress']);
	});

	it('keeps failed field writes pending and replays them later', async () => {
		const tempDir = await mkdtemp(path.join(tmpdir(), 'maestro-github-writes-'));
		tempDirs.push(tempDir);
		const store = new GithubProjectPendingWriteStore({ baseDir: tempDir, now: () => 1_000 });
		const setItemFieldValue = vi
			.fn<(projectId: string, itemId: string, fieldName: string, value: string) => Promise<void>>()
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error('rate limit'))
			.mockResolvedValue(undefined);
		const client = createClient({ setItemFieldValue });
		const coordinator = new GithubProjectCoordinator({
			clientFactory: () => client,
			pendingWriteStore: store,
			now: () => 1_000,
		});

		await expect(
			coordinator.setItemFieldValues(project, 'item-ready', {
				'AI Assigned Slot': 'agent-1',
				'AI Status': 'In Progress',
			})
		).rejects.toThrow('rate limit');

		const pending = await store.listPendingWrites();
		expect(pending).toHaveLength(1);
		expect(pending[0]?.fields).toEqual({
			'AI Assigned Slot': 'agent-1',
			'AI Status': 'In Progress',
		});

		await flushPendingWrites(coordinator, store);

		expect(await store.listPendingWrites()).toEqual([]);
		expect(setItemFieldValue).toHaveBeenCalledTimes(4);
	});
});

function createClient(overrides: Partial<GithubClient>): GithubClient {
	return {
		listProjectItems: vi.fn<() => Promise<GithubProjectItem[]>>().mockResolvedValue([]),
		readProjectId: vi.fn<() => Promise<string>>().mockResolvedValue('project-id'),
		setItemFieldValue: vi
			.fn<(projectId: string, itemId: string, fieldName: string, value: string) => Promise<void>>()
			.mockResolvedValue(undefined),
		addItemComment: vi
			.fn<(issueNumber: number, repo: string, body: string) => Promise<void>>()
			.mockResolvedValue(undefined),
		...overrides,
	} as unknown as GithubClient;
}

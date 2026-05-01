/**
 * Integration test: Agent Dispatch completion → Living Wiki coverage refresh
 *
 * Cross-Major 004: When a Work Graph item with Living Wiki metadata transitions
 * to `done`, the LivingWikiService should debounce and trigger `runGeneration`
 * to refresh coverage.
 *
 * Only tests the event-subscription bridge — actual disk I/O in runGeneration
 * is bypassed by spying on the method.
 */

import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
	WorkGraphListResult,
	WorkItem,
	WorkItemCreateInput,
	WorkItemDependency,
	WorkItemEvent,
	WorkItemEventCreateInput,
	WorkItemFilters,
	WorkItemSearchFilters,
	WorkItemUpdateInput,
} from '../../shared/work-graph-types';
import type { LivingWikiWorkGraphStore } from '../../main/living-wiki/enrollment';
import { LivingWikiService } from '../../main/living-wiki/service';
import { publishWorkGraphEvent, subscribeWorkGraphEvents } from '../../main/work-graph/events';

// ---------------------------------------------------------------------------
// Minimal in-memory Work Graph store (no SQLite dependency)
// ---------------------------------------------------------------------------

class MemoryWorkGraphStore implements LivingWikiWorkGraphStore {
	items = new Map<string, WorkItem>();
	private seq = 0;
	private evtSeq = 0;

	async createItem(input: WorkItemCreateInput): Promise<WorkItem> {
		const now = new Date().toISOString();
		const item: WorkItem = {
			...input,
			id: `item-${++this.seq}`,
			status: input.status ?? 'discovered',
			readonly: input.readonly ?? false,
			tags: input.tags ?? [],
			createdAt: now,
			updatedAt: now,
		};
		this.items.set(item.id, item);
		return item;
	}

	async updateItem(input: WorkItemUpdateInput): Promise<WorkItem> {
		const current = this.items.get(input.id);
		if (!current) {
			throw new Error(`Unknown item: ${input.id}`);
		}
		const updated: WorkItem = {
			...current,
			...input.patch,
			updatedAt: new Date().toISOString(),
		};
		this.items.set(updated.id, updated);
		return updated;
	}

	async listItems(filters: WorkItemFilters = {}): Promise<WorkGraphListResult> {
		let items = [...this.items.values()];
		if (filters.ids?.length) {
			items = items.filter((i) => filters.ids!.includes(i.id));
		}
		if (filters.types?.length) {
			items = items.filter((i) => filters.types!.includes(i.type));
		}
		if (filters.source) {
			const sources = Array.isArray(filters.source) ? filters.source : [filters.source];
			items = items.filter((i) => sources.includes(i.source));
		}
		if (filters.gitPath) {
			items = items.filter((i) => i.gitPath === filters.gitPath);
		}
		if (filters.projectPath) {
			items = items.filter((i) => i.projectPath === filters.projectPath);
		}
		return { items, total: items.length };
	}

	async searchItems(filters: WorkItemSearchFilters): Promise<WorkGraphListResult> {
		const listed = await this.listItems(filters);
		const q = filters.query.toLowerCase();
		const items = listed.items.filter((i) =>
			[i.title, i.description ?? '', i.gitPath, JSON.stringify(i.metadata ?? {})]
				.join('\n')
				.toLowerCase()
				.includes(q)
		);
		return { items, total: items.length };
	}

	async recordEvent(input: WorkItemEventCreateInput): Promise<WorkItemEvent> {
		return {
			id: `evt-${++this.evtSeq}`,
			timestamp: input.timestamp ?? new Date().toISOString(),
			...input,
		};
	}

	async listEvents(_workItemId: string): Promise<WorkItemEvent[]> {
		return [];
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

async function makeService(): Promise<{
	service: LivingWikiService;
	store: MemoryWorkGraphStore;
}> {
	const store = new MemoryWorkGraphStore();
	const service = new LivingWikiService({
		workGraph: store,
		defaultActor: { type: 'system', id: 'test', name: 'Test' },
	});
	return { service, store };
}

/** Null BrowserWindow getter — prevents renderer IPC in tests */
const nullWindow = () => null;

/** Fire a workGraph.item.statusChanged event synchronously through the
 *  module-level event bus, just as the real IPC handler does. */
function fireStatusChanged(item: WorkItem): void {
	publishWorkGraphEvent(nullWindow, 'workGraph.item.statusChanged', { item });
}

/** Wait up to `ms` milliseconds for `predicate` to return true, polling every 100ms. */
async function waitFor(predicate: () => boolean, ms = 4000): Promise<void> {
	const deadline = Date.now() + ms;
	while (!predicate()) {
		if (Date.now() >= deadline) {
			throw new Error(`waitFor timed out after ${ms}ms`);
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dispatch-completion → living-wiki coverage refresh', () => {
	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maestro-dispatch-coverage-'));
		vi.useFakeTimers();
	});

	afterEach(async () => {
		vi.useRealTimers();
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it('triggers runGeneration when a done item has metadata.livingWiki.sourceGitPath', async () => {
		const { service } = await makeService();

		// Spy on runGeneration — we don't want real disk I/O in this test.
		const regenSpy = vi.spyOn(service, 'runGeneration').mockResolvedValue({
			projectId: 'test',
			startedAt: '',
			finishedAt: '',
			docs: [],
			coverage: {
				projectId: 'test',
				generatedAt: '',
				totalSourceFiles: 0,
				coveredSourceFiles: 0,
				uncoveredSourceGitPaths: [],
				diagnostics: [],
			},
			diagnostics: [],
			workGraphEvents: [],
		});

		const item: WorkItem = {
			id: 'task-001',
			type: 'task',
			status: 'done',
			title: 'Add authentication module',
			projectPath: tmpDir,
			gitPath: `${tmpDir}/tasks/task-001.md`,
			source: 'delivery-planner',
			readonly: false,
			tags: [],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			metadata: {
				livingWiki: {
					sourceGitPath: 'src/auth/index.ts',
				},
			},
		};

		fireStatusChanged(item);

		// Advance the 3-second debounce timer.
		vi.advanceTimersByTime(3500);

		// Allow any microtasks / pending promises to settle.
		await vi.runAllTimersAsync();

		expect(regenSpy).toHaveBeenCalledOnce();
		expect(regenSpy).toHaveBeenCalledWith({ projectPath: tmpDir });
	});

	it('triggers runGeneration when a done item has source living-wiki', async () => {
		const { service } = await makeService();

		const regenSpy = vi.spyOn(service, 'runGeneration').mockResolvedValue({
			projectId: 'test',
			startedAt: '',
			finishedAt: '',
			docs: [],
			coverage: {
				projectId: 'test',
				generatedAt: '',
				totalSourceFiles: 0,
				coveredSourceFiles: 0,
				uncoveredSourceGitPaths: [],
				diagnostics: [],
			},
			diagnostics: [],
			workGraphEvents: [],
		});

		const item: WorkItem = {
			id: 'wiki-doc-001',
			type: 'document',
			status: 'done',
			title: 'Auth Module Docs',
			projectPath: tmpDir,
			gitPath: `${tmpDir}/.maestro/wiki/auth.md`,
			source: 'living-wiki',
			readonly: false,
			tags: ['living-wiki'],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		fireStatusChanged(item);
		vi.advanceTimersByTime(3500);
		await vi.runAllTimersAsync();

		expect(regenSpy).toHaveBeenCalledOnce();
		expect(regenSpy).toHaveBeenCalledWith({ projectPath: tmpDir });
	});

	it('triggers runGeneration when a done item has living-wiki tag', async () => {
		const { service } = await makeService();

		const regenSpy = vi.spyOn(service, 'runGeneration').mockResolvedValue({
			projectId: 'test',
			startedAt: '',
			finishedAt: '',
			docs: [],
			coverage: {
				projectId: 'test',
				generatedAt: '',
				totalSourceFiles: 0,
				coveredSourceFiles: 0,
				uncoveredSourceGitPaths: [],
				diagnostics: [],
			},
			diagnostics: [],
			workGraphEvents: [],
		});

		const item: WorkItem = {
			id: 'tagged-item-001',
			type: 'chore',
			status: 'done',
			title: 'Update wiki docs',
			projectPath: tmpDir,
			gitPath: `${tmpDir}/chores/update-wiki.md`,
			source: 'manual',
			readonly: false,
			tags: ['living-wiki', 'docs'],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		fireStatusChanged(item);
		vi.advanceTimersByTime(3500);
		await vi.runAllTimersAsync();

		expect(regenSpy).toHaveBeenCalledOnce();
	});

	it('does NOT trigger runGeneration for non-wiki done items', async () => {
		const { service } = await makeService();

		const regenSpy = vi.spyOn(service, 'runGeneration').mockResolvedValue({
			projectId: 'test',
			startedAt: '',
			finishedAt: '',
			docs: [],
			coverage: {
				projectId: 'test',
				generatedAt: '',
				totalSourceFiles: 0,
				coveredSourceFiles: 0,
				uncoveredSourceGitPaths: [],
				diagnostics: [],
			},
			diagnostics: [],
			workGraphEvents: [],
		});

		const item: WorkItem = {
			id: 'plain-task-001',
			type: 'task',
			status: 'done',
			title: 'Fix linting errors',
			projectPath: tmpDir,
			gitPath: `${tmpDir}/tasks/lint-fix.md`,
			source: 'delivery-planner',
			readonly: false,
			tags: ['backend'],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		fireStatusChanged(item);
		vi.advanceTimersByTime(3500);
		await vi.runAllTimersAsync();

		expect(regenSpy).not.toHaveBeenCalled();
	});

	it('does NOT trigger runGeneration when status is not done', async () => {
		const { service } = await makeService();

		const regenSpy = vi.spyOn(service, 'runGeneration').mockResolvedValue({
			projectId: 'test',
			startedAt: '',
			finishedAt: '',
			docs: [],
			coverage: {
				projectId: 'test',
				generatedAt: '',
				totalSourceFiles: 0,
				coveredSourceFiles: 0,
				uncoveredSourceGitPaths: [],
				diagnostics: [],
			},
			diagnostics: [],
			workGraphEvents: [],
		});

		const item: WorkItem = {
			id: 'wiki-in-progress',
			type: 'task',
			status: 'in_progress', // Not done
			title: 'Write wiki docs',
			projectPath: tmpDir,
			gitPath: `${tmpDir}/tasks/wiki-task.md`,
			source: 'living-wiki',
			readonly: false,
			tags: ['living-wiki'],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		fireStatusChanged(item);
		vi.advanceTimersByTime(3500);
		await vi.runAllTimersAsync();

		expect(regenSpy).not.toHaveBeenCalled();
	});

	it('debounces multiple completions to a single regen per project', async () => {
		const { service } = await makeService();

		const regenSpy = vi.spyOn(service, 'runGeneration').mockResolvedValue({
			projectId: 'test',
			startedAt: '',
			finishedAt: '',
			docs: [],
			coverage: {
				projectId: 'test',
				generatedAt: '',
				totalSourceFiles: 0,
				coveredSourceFiles: 0,
				uncoveredSourceGitPaths: [],
				diagnostics: [],
			},
			diagnostics: [],
			workGraphEvents: [],
		});

		const makeItem = (id: string): WorkItem => ({
			id,
			type: 'task',
			status: 'done',
			title: `Wiki task ${id}`,
			projectPath: tmpDir,
			gitPath: `${tmpDir}/tasks/${id}.md`,
			source: 'living-wiki',
			readonly: false,
			tags: ['living-wiki'],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});

		// Fire three completions in quick succession (within debounce window).
		fireStatusChanged(makeItem('item-a'));
		vi.advanceTimersByTime(500);
		fireStatusChanged(makeItem('item-b'));
		vi.advanceTimersByTime(500);
		fireStatusChanged(makeItem('item-c'));

		// Advance past the full debounce window from the last event.
		vi.advanceTimersByTime(3500);
		await vi.runAllTimersAsync();

		// All three completions should coalesce to a single regen call.
		expect(regenSpy).toHaveBeenCalledOnce();
	});

	it('ignores events with wrong operation type', async () => {
		const { service } = await makeService();

		const regenSpy = vi.spyOn(service, 'runGeneration').mockResolvedValue({
			projectId: 'test',
			startedAt: '',
			finishedAt: '',
			docs: [],
			coverage: {
				projectId: 'test',
				generatedAt: '',
				totalSourceFiles: 0,
				coveredSourceFiles: 0,
				uncoveredSourceGitPaths: [],
				diagnostics: [],
			},
			diagnostics: [],
			workGraphEvents: [],
		});

		// Publish a different operation (item.updated, not statusChanged)
		publishWorkGraphEvent(nullWindow, 'workGraph.item.updated', {
			item: {
				id: 'item-x',
				type: 'task',
				status: 'done',
				title: 'Updated',
				projectPath: tmpDir,
				gitPath: `${tmpDir}/tasks/x.md`,
				source: 'living-wiki',
				readonly: false,
				tags: ['living-wiki'],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			} as WorkItem,
		});

		vi.advanceTimersByTime(3500);
		await vi.runAllTimersAsync();

		expect(regenSpy).not.toHaveBeenCalled();
	});
});

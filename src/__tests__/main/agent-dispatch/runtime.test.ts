import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import { AgentDispatchRuntime } from '../../../main/agent-dispatch';
import type { AgentDefinition } from '../../../main/agents/definitions';
import type { ManagedProcess } from '../../../main/process-manager';
import type { StoredSession } from '../../../main/stores/types';
import { publishWorkGraphEvent } from '../../../main/work-graph';
import {
	AGENT_DISPATCH_PROFILE_CONFIG_KEY,
	type AgentDispatchSettings,
} from '../../../shared/agent-dispatch-types';
import type {
	AgentReadyWorkFilter,
	WorkGraphActor,
	WorkGraphListResult,
	WorkItem,
	WorkItemClaimInput,
	WorkItemFilters,
} from '../../../shared/work-graph-types';

class MemoryStore<T extends Record<string, unknown>> {
	private readonly listeners = new Map<keyof T, Set<() => void>>();

	constructor(private data: T) {}

	get<K extends keyof T>(key: K, defaultValue: T[K]): T[K] {
		return this.data[key] ?? defaultValue;
	}

	set<K extends keyof T>(key: K, value: T[K]): void {
		this.data = { ...this.data, [key]: value };
		for (const listener of this.listeners.get(key) ?? []) {
			listener();
		}
	}

	onDidChange<K extends keyof T>(key: K, callback: () => void): () => void {
		const listeners = this.listeners.get(key) ?? new Set<() => void>();
		listeners.add(callback);
		this.listeners.set(key, listeners);
		return () => listeners.delete(callback);
	}
}

class MemoryWorkGraphStore {
	claims: WorkItemClaimInput[] = [];
	filters: AgentReadyWorkFilter[] = [];
	claimActors: Array<WorkGraphActor | undefined> = [];

	constructor(private items: WorkItem[]) {}

	async listItems(filters: WorkItemFilters = {}): Promise<WorkGraphListResult> {
		if (filters.statuses) {
			return {
				items: this.items.filter((item) => filters.statuses?.includes(item.status)),
				total: this.items.length,
			};
		}
		return { items: this.items, total: this.items.length };
	}

	async getUnblockedWorkItems(filters: AgentReadyWorkFilter = {}): Promise<WorkGraphListResult> {
		this.filters.push(filters);
		return { items: this.items.filter((item) => item.status === 'ready'), total: 1 };
	}

	async claimItem(input: WorkItemClaimInput, actor?: WorkGraphActor): Promise<WorkItem> {
		this.claims.push(input);
		this.claimActors.push(actor);
		const item = this.items.find((candidate) => candidate.id === input.workItemId) ?? workItem();
		const claimed: WorkItem = {
			...item,
			status: 'claimed',
			owner: input.owner,
			claim: {
				id: `claim-${input.workItemId}`,
				workItemId: input.workItemId,
				owner: input.owner,
				status: 'active',
				source: input.source,
				claimedAt: '2026-04-30T12:00:00.000Z',
			},
		};
		this.items = this.items.map((candidate) => (candidate.id === item.id ? claimed : candidate));
		return claimed;
	}
}

const definition: AgentDefinition = {
	id: 'codex',
	name: 'Codex',
	binaryName: 'codex',
	command: 'codex',
	args: [],
	dispatchSuggestedDefaults: {
		capabilityTags: ['typescript'],
		maxConcurrentClaims: 1,
	},
};

const dispatchSettings: AgentDispatchSettings = {
	globalAutoPickupEnabled: true,
	projectAutoPickupEnabled: {},
	sshRemoteAutoPickupEnabled: {},
};

function session(overrides: Partial<StoredSession> = {}): StoredSession {
	return {
		id: 'agent-1',
		name: 'Agent One',
		toolType: 'codex',
		cwd: '/repo',
		projectRoot: '/repo',
		state: 'idle',
		...overrides,
	};
}

function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
	return {
		id: 'work-1',
		type: 'task',
		status: 'ready',
		title: 'Implement feature',
		projectPath: '/repo',
		gitPath: '/repo',
		source: 'manual',
		readonly: false,
		tags: ['agent-ready', 'typescript'],
		createdAt: '2026-04-30T10:00:00.000Z',
		updatedAt: '2026-04-30T10:00:00.000Z',
		...overrides,
	};
}

describe('AgentDispatchRuntime', () => {
	it('wires Work Graph broadcasts to the real auto-pickup engine', async () => {
		const workGraph = new MemoryWorkGraphStore([workItem()]);
		const sessionsStore = new MemoryStore({ sessions: [session()] });
		const settingsStore = new MemoryStore({ dispatchSettings, sshRemotes: [] });
		const agentConfigsStore = new MemoryStore({
			configs: {
				codex: {
					[AGENT_DISPATCH_PROFILE_CONFIG_KEY]: {
						autoPickupEnabled: true,
						capabilityTags: ['typescript'],
						maxConcurrentClaims: 1,
					},
				},
			},
		});
		const processManager = new EventEmitter() as EventEmitter & {
			getAll(): ManagedProcess[];
		};
		processManager.getAll = () => [];
		const runtime = new AgentDispatchRuntime({
			getMainWindow: () => null,
			sessionsStore,
			settingsStore,
			agentConfigsStore,
			getProcessManager: () => processManager,
			workGraph,
			agentDefinitions: [definition],
		});

		runtime.start();
		await runtime.refreshFleet();
		publishWorkGraphEvent(() => null, 'workGraph.item.created', { item: workItem() });

		await vi.waitFor(() => expect(workGraph.claims).toHaveLength(1));
		expect(workGraph.filters[0]).toMatchObject({
			excludeClaimed: true,
			capabilityTags: ['typescript'],
		});
		expect(workGraph.claims[0]).toMatchObject({
			workItemId: 'work-1',
			source: 'auto-pickup',
			capabilityRouting: {
				requireReadyTag: true,
			},
		});

		runtime.stop();
	});

	it('refreshes fleet subscriptions when a session becomes idle', async () => {
		const workGraph = new MemoryWorkGraphStore([workItem()]);
		const sessionsStore = new MemoryStore({ sessions: [session({ state: 'busy' })] });
		const settingsStore = new MemoryStore({ dispatchSettings, sshRemotes: [] });
		const agentConfigsStore = new MemoryStore({
			configs: {
				codex: {
					[AGENT_DISPATCH_PROFILE_CONFIG_KEY]: {
						autoPickupEnabled: true,
						capabilityTags: ['typescript'],
						maxConcurrentClaims: 1,
					},
				},
			},
		});
		const processManager = new EventEmitter() as EventEmitter & {
			getAll(): ManagedProcess[];
		};
		processManager.getAll = () => [];
		const runtime = new AgentDispatchRuntime({
			getMainWindow: () => null,
			sessionsStore,
			settingsStore,
			agentConfigsStore,
			getProcessManager: () => processManager,
			workGraph,
			agentDefinitions: [definition],
		});

		runtime.start();
		await runtime.refreshFleet();
		expect(workGraph.claims).toHaveLength(0);

		sessionsStore.set('sessions', [session({ state: 'idle' })]);

		await vi.waitFor(() => expect(workGraph.claims).toHaveLength(1));
		expect(workGraph.claims[0].source).toBe('auto-pickup');

		runtime.stop();
	});
});

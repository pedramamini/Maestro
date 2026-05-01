/**
 * Tests for Agent Dispatch slash commands
 *
 * Covers:
 * - IPC handler registration and dispatch logic
 * - Assign/release/pause/resume lifecycle
 * - Subtask creation with parent/dependency metadata
 * - Error cases: bad status, unknown IDs, non-idle agent
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ipcMain } from 'electron';
import {
	registerAgentDispatchHandlers,
	_dispatchRegistry,
	registerAgent,
	unregisterAgent,
	upsertWorkItem,
} from '../../../main/ipc/handlers/agent-dispatch-mcp';
import type { DispatchAgent, DispatchWorkItem } from '../../../shared/agent-dispatch-types';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('electron', () => ({
	ipcMain: {
		handle: vi.fn(),
		removeHandler: vi.fn(),
	},
}));

vi.mock('../../../main/utils/logger', () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

// ── Helpers ────────────────────────────────────────────────────────────────

type HandlerFn = (_event: unknown, ...args: unknown[]) => Promise<unknown>;

function buildHandlerMap(): Map<string, HandlerFn> {
	const map = new Map<string, HandlerFn>();
	vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
		map.set(channel as string, handler as HandlerFn);
	});
	return map;
}

async function invoke(
	handlers: Map<string, HandlerFn>,
	channel: string,
	...args: unknown[]
): Promise<unknown> {
	const handler = handlers.get(channel);
	if (!handler) throw new Error(`No handler registered for ${channel}`);
	return handler(null, ...args);
}

function makeAgent(overrides: Partial<DispatchAgent> = {}): DispatchAgent {
	return {
		sessionId: 'agent-1',
		name: 'Test Agent',
		toolType: 'claude-code',
		availability: 'idle',
		...overrides,
	};
}

function makeItem(overrides: Partial<DispatchWorkItem> = {}): DispatchWorkItem {
	return {
		id: 'item-1',
		title: 'Do the thing',
		status: 'agent-ready',
		dependsOn: [],
		...overrides,
	};
}

// ── Test suite ─────────────────────────────────────────────────────────────

describe('registerAgentDispatchHandlers', () => {
	let handlers: Map<string, HandlerFn>;

	beforeEach(() => {
		vi.clearAllMocks();
		// Reset in-memory registry
		_dispatchRegistry.agents.clear();
		_dispatchRegistry.workItems.clear();

		handlers = buildHandlerMap();
		registerAgentDispatchHandlers();
	});

	afterEach(() => {
		handlers.clear();
	});

	// ── Registration ─────────────────────────────────────────────────────────

	describe('registration', () => {
		it('registers all expected channels', () => {
			const expected = [
				'agentDispatch:listAgents',
				'agentDispatch:listEligible',
				'agentDispatch:assign',
				'agentDispatch:release',
				'agentDispatch:pause',
				'agentDispatch:resume',
				'agentDispatch:createSubtask',
				'agentDispatch:status',
			];
			for (const channel of expected) {
				expect(handlers.has(channel)).toBe(true);
			}
		});
	});

	// ── listAgents ───────────────────────────────────────────────────────────

	describe('listAgents', () => {
		it('returns empty array when no agents registered', async () => {
			const result = (await invoke(handlers, 'agentDispatch:listAgents')) as any;
			expect(result.success).toBe(true);
			expect(result.agents).toEqual([]);
		});

		it('returns registered agents', async () => {
			const agent = makeAgent();
			registerAgent(agent);

			const result = (await invoke(handlers, 'agentDispatch:listAgents')) as any;
			expect(result.success).toBe(true);
			expect(result.agents).toHaveLength(1);
			expect(result.agents[0].sessionId).toBe('agent-1');
		});
	});

	// ── registerAgent / unregisterAgent helpers ──────────────────────────────

	describe('registerAgent / unregisterAgent', () => {
		it('adds agent to registry', () => {
			const agent = makeAgent();
			registerAgent(agent);
			expect(_dispatchRegistry.agents.has('agent-1')).toBe(true);
		});

		it('removes agent from registry', () => {
			registerAgent(makeAgent());
			unregisterAgent('agent-1');
			expect(_dispatchRegistry.agents.has('agent-1')).toBe(false);
		});
	});

	// ── upsertWorkItem helper ────────────────────────────────────────────────

	describe('upsertWorkItem', () => {
		it('inserts a new work item', () => {
			const item = makeItem();
			upsertWorkItem(item);
			expect(_dispatchRegistry.workItems.has('item-1')).toBe(true);
		});

		it('overwrites an existing work item', () => {
			upsertWorkItem(makeItem());
			upsertWorkItem(makeItem({ title: 'Updated title' }));
			expect(_dispatchRegistry.workItems.get('item-1')?.title).toBe('Updated title');
		});
	});

	// ── listEligible ─────────────────────────────────────────────────────────

	describe('listEligible', () => {
		it('returns only unclaimed agent-ready items', async () => {
			upsertWorkItem(makeItem({ id: 'ready', status: 'agent-ready' }));
			upsertWorkItem(makeItem({ id: 'claimed', status: 'agent-ready', claimedBySessionId: 'x' }));
			upsertWorkItem(makeItem({ id: 'blocked', status: 'blocked' }));
			upsertWorkItem(makeItem({ id: 'done', status: 'done' }));

			const result = (await invoke(handlers, 'agentDispatch:listEligible')) as any;
			expect(result.success).toBe(true);
			expect(result.items).toHaveLength(1);
			expect(result.items[0].id).toBe('ready');
		});
	});

	// ── assign ───────────────────────────────────────────────────────────────

	describe('assign', () => {
		it('assigns item to idle agent and marks both in-progress/busy', async () => {
			registerAgent(makeAgent());
			upsertWorkItem(makeItem());

			const result = (await invoke(handlers, 'agentDispatch:assign', {
				itemId: 'item-1',
				sessionId: 'agent-1',
			})) as any;

			expect(result.success).toBe(true);
			expect(result.item.status).toBe('in-progress');
			expect(result.item.claimedBySessionId).toBe('agent-1');
			expect(_dispatchRegistry.agents.get('agent-1')?.availability).toBe('busy');
		});

		it('rejects assignment when item is not agent-ready', async () => {
			registerAgent(makeAgent());
			upsertWorkItem(makeItem({ status: 'blocked' }));

			const result = (await invoke(handlers, 'agentDispatch:assign', {
				itemId: 'item-1',
				sessionId: 'agent-1',
			})) as any;

			expect(result.success).toBe(false);
			expect(result.error).toMatch(/blocked/);
		});

		it('rejects assignment when item is already claimed', async () => {
			registerAgent(makeAgent());
			upsertWorkItem(makeItem({ claimedBySessionId: 'other-agent' }));

			const result = (await invoke(handlers, 'agentDispatch:assign', {
				itemId: 'item-1',
				sessionId: 'agent-1',
			})) as any;

			expect(result.success).toBe(false);
			expect(result.error).toMatch(/already claimed/);
		});

		it('rejects assignment when agent is not idle', async () => {
			registerAgent(makeAgent({ availability: 'busy' }));
			upsertWorkItem(makeItem());

			const result = (await invoke(handlers, 'agentDispatch:assign', {
				itemId: 'item-1',
				sessionId: 'agent-1',
			})) as any;

			expect(result.success).toBe(false);
			expect(result.error).toMatch(/not idle/);
		});

		it('returns error for unknown item ID', async () => {
			registerAgent(makeAgent());
			const result = (await invoke(handlers, 'agentDispatch:assign', {
				itemId: 'unknown',
				sessionId: 'agent-1',
			})) as any;
			expect(result.success).toBe(false);
			expect(result.error).toMatch(/not found/);
		});

		it('returns error for unknown session ID', async () => {
			upsertWorkItem(makeItem());
			const result = (await invoke(handlers, 'agentDispatch:assign', {
				itemId: 'item-1',
				sessionId: 'unknown-session',
			})) as any;
			expect(result.success).toBe(false);
			expect(result.error).toMatch(/not found/);
		});
	});

	// ── release ──────────────────────────────────────────────────────────────

	describe('release', () => {
		it('releases an in-progress item and frees the agent', async () => {
			registerAgent(makeAgent({ availability: 'busy', currentWorkItemId: 'item-1' }));
			upsertWorkItem(makeItem({ status: 'in-progress', claimedBySessionId: 'agent-1' }));

			const result = (await invoke(handlers, 'agentDispatch:release', {
				itemId: 'item-1',
			})) as any;

			expect(result.success).toBe(true);
			expect(result.item.status).toBe('agent-ready');
			expect(result.item.claimedBySessionId).toBeUndefined();
			expect(_dispatchRegistry.agents.get('agent-1')?.availability).toBe('idle');
		});

		it('rejects release of non-in-progress item', async () => {
			upsertWorkItem(makeItem({ status: 'agent-ready' }));
			const result = (await invoke(handlers, 'agentDispatch:release', {
				itemId: 'item-1',
			})) as any;
			expect(result.success).toBe(false);
			expect(result.error).toMatch(/in-progress/);
		});

		it('returns error for unknown item', async () => {
			const result = (await invoke(handlers, 'agentDispatch:release', {
				itemId: 'no-such-item',
			})) as any;
			expect(result.success).toBe(false);
		});
	});

	// ── pause ────────────────────────────────────────────────────────────────

	describe('pause', () => {
		it('sets agent availability to offline', async () => {
			registerAgent(makeAgent());

			const result = (await invoke(handlers, 'agentDispatch:pause', {
				sessionId: 'agent-1',
			})) as any;

			expect(result.success).toBe(true);
			expect(result.agent.availability).toBe('offline');
		});

		it('returns error for unknown agent', async () => {
			const result = (await invoke(handlers, 'agentDispatch:pause', {
				sessionId: 'nobody',
			})) as any;
			expect(result.success).toBe(false);
		});
	});

	// ── resume ───────────────────────────────────────────────────────────────

	describe('resume', () => {
		it('sets offline agent back to idle', async () => {
			registerAgent(makeAgent({ availability: 'offline' }));

			const result = (await invoke(handlers, 'agentDispatch:resume', {
				sessionId: 'agent-1',
			})) as any;

			expect(result.success).toBe(true);
			expect(result.agent.availability).toBe('idle');
		});

		it('rejects resuming a non-paused agent', async () => {
			registerAgent(makeAgent({ availability: 'idle' }));

			const result = (await invoke(handlers, 'agentDispatch:resume', {
				sessionId: 'agent-1',
			})) as any;

			expect(result.success).toBe(false);
			expect(result.error).toMatch(/not paused/);
		});
	});

	// ── createSubtask ─────────────────────────────────────────────────────────

	describe('createSubtask', () => {
		it('creates a subtask with parent and dependency metadata', async () => {
			upsertWorkItem(makeItem({ id: 'parent-1' }));
			upsertWorkItem(makeItem({ id: 'dep-1', status: 'in-progress' }));

			const result = (await invoke(handlers, 'agentDispatch:createSubtask', {
				title: 'Sub-task: write tests',
				parentId: 'parent-1',
				dependsOn: ['dep-1'],
			})) as any;

			expect(result.success).toBe(true);
			expect(result.item.title).toBe('Sub-task: write tests');
			expect(result.item.parentId).toBe('parent-1');
			expect(result.item.dependsOn).toContain('dep-1');
			expect(result.item.status).toBe('agent-ready');
			// Newly created subtask should appear in the registry
			expect(_dispatchRegistry.workItems.has(result.item.id)).toBe(true);
		});

		it('creates subtask without explicit dependencies', async () => {
			upsertWorkItem(makeItem({ id: 'parent-2' }));

			const result = (await invoke(handlers, 'agentDispatch:createSubtask', {
				title: 'Independent sub-task',
				parentId: 'parent-2',
			})) as any;

			expect(result.success).toBe(true);
			expect(result.item.dependsOn).toEqual([]);
		});

		it('rejects creation when parent does not exist', async () => {
			const result = (await invoke(handlers, 'agentDispatch:createSubtask', {
				title: 'Orphaned subtask',
				parentId: 'non-existent',
			})) as any;

			expect(result.success).toBe(false);
			expect(result.error).toMatch(/not found/);
		});
	});

	// ── status ───────────────────────────────────────────────────────────────

	describe('status', () => {
		it('returns combined snapshot of agents, eligible, and in-progress items', async () => {
			registerAgent(makeAgent());
			upsertWorkItem(makeItem({ id: 'eligible', status: 'agent-ready' }));
			upsertWorkItem(makeItem({ id: 'wip', status: 'in-progress', claimedBySessionId: 'agent-1' }));
			upsertWorkItem(makeItem({ id: 'done', status: 'done' }));

			const result = (await invoke(handlers, 'agentDispatch:status')) as any;

			expect(result.success).toBe(true);
			expect(result.agents).toHaveLength(1);
			expect(result.eligible).toHaveLength(1);
			expect(result.eligible[0].id).toBe('eligible');
			expect(result.inProgress).toHaveLength(1);
			expect(result.inProgress[0].id).toBe('wip');
		});
	});
});

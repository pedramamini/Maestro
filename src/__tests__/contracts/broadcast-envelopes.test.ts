/**
 * Broadcast Envelope Schema Contract Test -- Wiring Audit 003 (Issue #215)
 *
 * Asserts that:
 *   1. Every public broadcast method on BroadcastService constructs an envelope
 *      whose type discriminant is registered in the shared schema registry.
 *   2. Every envelope captured from a fake socket passes the isBroadcastEnvelope
 *      runtime guard (i.e. has a known type string + numeric timestamp).
 *   3. The set of type discriminants emitted by BroadcastService is exactly
 *      equal to the set declared in BROADCAST_ENVELOPE_TYPES -- no dark types,
 *      no missing types.
 *
 * How it works
 * ─────────────
 * The test wires a BroadcastService instance to a fake WebSocket-like object.
 * Each broadcastFoo method is called with minimal stub data.  The captured
 * JSON payloads are decoded and validated against the registry type-guard.
 *
 * Known inconsistency (documented, tracked in issue #218)
 * ────────────────────────────────────────────────────────
 * broadcastGroupChatStateChange spreads Partial<GroupChatState> directly
 * into the envelope rather than nesting under a state key.  This is encoded
 * in GroupChatStateChangeEnvelope and tested here as-is.  A normalisation
 * follow-up is tracked in issue #218.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BroadcastService } from '../../main/web-server/services/broadcastService';
import {
	isBroadcastEnvelope,
	BROADCAST_ENVELOPE_TYPES,
	type BroadcastEnvelopeType,
	type AgentDispatchFleetUpdatedEnvelope,
} from '../../shared/broadcast-envelopes';
import { WebSocket } from 'ws';

// ---------------------------------------------------------------------------
// Upstream/rc compatibility note
// ---------------------------------------------------------------------------
// Several BroadcastService methods were added on humpf-dev as part of the
// wiring-audit epic and associated feature work. These methods do not yet
// exist on the upstream rc branch:
//   - broadcastGitStatus (added with web queue/git-status feature)
//   - broadcastExecutionQueue (added with execution queue feature)
//   - broadcastToolExecution (added with tool-execution broadcast feature)
//   - broadcastWorkGraphChanged (added with Work Graph feature)
//   - WebServer.broadcastAgentDispatchFleetUpdated (added with Agent Dispatch)
//
// Tests for those methods are marked with it.skip until those features land
// on rc. The BROADCAST_ENVELOPE_TYPES completeness test is also skipped since
// it exercises the full set of types including the above.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Fake socket harness
// ---------------------------------------------------------------------------

interface CapturedMessage {
	raw: string;
	parsed: unknown;
}

function makeFakeSocket(): { socket: WebSocket; captured: CapturedMessage[] } {
	const captured: CapturedMessage[] = [];
	// Minimal WebSocket stub -- only readyState and send matter for BroadcastService
	const socket = {
		readyState: WebSocket.OPEN,
		send(data: string) {
			captured.push({ raw: data, parsed: JSON.parse(data) });
		},
	} as unknown as WebSocket;
	return { socket, captured };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let service: BroadcastService;
let captured: CapturedMessage[];

beforeEach(() => {
	service = new BroadcastService();
	const { socket, captured: cap } = makeFakeSocket();
	captured = cap;
	service.setGetWebClientsCallback(() => {
		return new Map([
			[
				'client-1',
				{
					socket,
					id: 'client-1',
					connectedAt: Date.now(),
					subscribedSessionId: 'session-1',
				},
			],
		]);
	});
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function lastParsed(): unknown {
	return captured[captured.length - 1]?.parsed;
}

// ---------------------------------------------------------------------------
// Per-method envelope shape tests
// ---------------------------------------------------------------------------

describe('BroadcastService envelope schemas', () => {
	it('broadcastSessionStateChange emits session_state_change', () => {
		service.broadcastSessionStateChange('session-1', 'busy', { name: 'Agent' });
		// State 'busy' does NOT trigger a notification, so captured should have exactly 1 message
		expect(captured.length).toBe(1);
		const env = lastParsed();
		expect(isBroadcastEnvelope(env)).toBe(true);
		expect((env as Record<string, unknown>)['type']).toBe('session_state_change');
		expect((env as Record<string, unknown>)['sessionId']).toBe('session-1');
		expect((env as Record<string, unknown>)['state']).toBe('busy');
	});

	it('broadcastSessionStateChange emits notification_event on idle', () => {
		service.broadcastSessionStateChange('session-1', 'idle', { name: 'Agent' });
		// 1 state change + 1 notification
		expect(captured.length).toBe(2);
		const types = captured.map((m) => (m.parsed as Record<string, unknown>)['type']);
		expect(types).toContain('session_state_change');
		expect(types).toContain('notification_event');
		captured.forEach((m) => expect(isBroadcastEnvelope(m.parsed)).toBe(true));
	});

	it('broadcastSessionAdded emits session_added', () => {
		service.broadcastSessionAdded({
			id: 'session-1',
			name: 'Test',
			toolType: 'claude-code',
			state: 'idle',
			inputMode: 'ai',
			cwd: '/tmp',
		});
		expect(isBroadcastEnvelope(lastParsed())).toBe(true);
		expect((lastParsed() as Record<string, unknown>)['type']).toBe('session_added');
	});

	it('broadcastSessionRemoved emits session_removed', () => {
		service.broadcastSessionRemoved('session-1');
		expect(isBroadcastEnvelope(lastParsed())).toBe(true);
		expect((lastParsed() as Record<string, unknown>)['type']).toBe('session_removed');
	});

	it('broadcastSessionsList emits sessions_list', () => {
		service.broadcastSessionsList([]);
		expect(isBroadcastEnvelope(lastParsed())).toBe(true);
		expect((lastParsed() as Record<string, unknown>)['type']).toBe('sessions_list');
	});

	it('broadcastActiveSessionChange emits active_session_changed', () => {
		service.broadcastActiveSessionChange('session-1');
		expect(isBroadcastEnvelope(lastParsed())).toBe(true);
		expect((lastParsed() as Record<string, unknown>)['type']).toBe('active_session_changed');
	});

	it('broadcastTabsChange emits tabs_changed', () => {
		service.broadcastTabsChange('session-1', [], 'tab-1');
		expect(isBroadcastEnvelope(lastParsed())).toBe(true);
		expect((lastParsed() as Record<string, unknown>)['type']).toBe('tabs_changed');
	});

	it.skip('broadcastGitStatus emits git_status_changed', () => {
		service.broadcastGitStatus('session-1', null);
		expect(isBroadcastEnvelope(lastParsed())).toBe(true);
		expect((lastParsed() as Record<string, unknown>)['type']).toBe('git_status_changed');
	});

	it.skip('broadcastExecutionQueue emits execution_queue_changed', () => {
		service.broadcastExecutionQueue('session-1', []);
		expect(isBroadcastEnvelope(lastParsed())).toBe(true);
		expect((lastParsed() as Record<string, unknown>)['type']).toBe('execution_queue_changed');
	});

	it.skip('broadcastToolExecution emits tool_execution', () => {
		service.broadcastToolExecution('session-1', 'tab-1', {
			toolName: 'bash',
			timestamp: Date.now(),
		});
		expect(isBroadcastEnvelope(lastParsed())).toBe(true);
		expect((lastParsed() as Record<string, unknown>)['type']).toBe('tool_execution');
	});

	it('broadcastThemeChange emits theme', () => {
		service.broadcastThemeChange({ name: 'dark' } as Parameters<
			typeof service.broadcastThemeChange
		>[0]);
		expect(isBroadcastEnvelope(lastParsed())).toBe(true);
		expect((lastParsed() as Record<string, unknown>)['type']).toBe('theme');
	});

	it('broadcastBionifyReadingModeChange emits bionify_reading_mode', () => {
		service.broadcastBionifyReadingModeChange(true);
		expect(isBroadcastEnvelope(lastParsed())).toBe(true);
		expect((lastParsed() as Record<string, unknown>)['type']).toBe('bionify_reading_mode');
	});

	it('broadcastCustomCommands emits custom_commands', () => {
		service.broadcastCustomCommands([]);
		expect(isBroadcastEnvelope(lastParsed())).toBe(true);
		expect((lastParsed() as Record<string, unknown>)['type']).toBe('custom_commands');
	});

	it('broadcastSettingsChanged emits settings_changed', () => {
		service.broadcastSettingsChanged({} as Parameters<typeof service.broadcastSettingsChanged>[0]);
		expect(isBroadcastEnvelope(lastParsed())).toBe(true);
		expect((lastParsed() as Record<string, unknown>)['type']).toBe('settings_changed');
	});

	it('broadcastGroupsChanged emits groups_changed', () => {
		service.broadcastGroupsChanged([]);
		expect(isBroadcastEnvelope(lastParsed())).toBe(true);
		expect((lastParsed() as Record<string, unknown>)['type']).toBe('groups_changed');
	});

	it('broadcastAutoRunState emits autorun_state', () => {
		service.broadcastAutoRunState('session-1', null);
		expect(isBroadcastEnvelope(lastParsed())).toBe(true);
		expect((lastParsed() as Record<string, unknown>)['type']).toBe('autorun_state');
	});

	it('broadcastAutoRunDocsChanged emits autorun_docs_changed', () => {
		service.broadcastAutoRunDocsChanged('session-1', []);
		expect(isBroadcastEnvelope(lastParsed())).toBe(true);
		expect((lastParsed() as Record<string, unknown>)['type']).toBe('autorun_docs_changed');
	});

	it('broadcastUserInput emits user_input', () => {
		service.broadcastUserInput('session-1', 'hello', 'ai');
		expect(isBroadcastEnvelope(lastParsed())).toBe(true);
		expect((lastParsed() as Record<string, unknown>)['type']).toBe('user_input');
	});

	it('broadcastSessionLive emits session_live', () => {
		service.broadcastSessionLive('session-1');
		expect(isBroadcastEnvelope(lastParsed())).toBe(true);
		expect((lastParsed() as Record<string, unknown>)['type']).toBe('session_live');
	});

	it('broadcastSessionOffline emits session_offline', () => {
		service.broadcastSessionOffline('session-1');
		expect(isBroadcastEnvelope(lastParsed())).toBe(true);
		expect((lastParsed() as Record<string, unknown>)['type']).toBe('session_offline');
	});

	it.skip('broadcastWorkGraphChanged emits work_graph_changed', () => {
		service.broadcastWorkGraphChanged({
			type: 'workGraph',
			operation: 'workGraph.item.created',
			sequence: 1,
			timestamp: new Date().toISOString(),
			payload: {},
		});
		expect(isBroadcastEnvelope(lastParsed())).toBe(true);
		expect((lastParsed() as Record<string, unknown>)['type']).toBe('work_graph_changed');
	});

	it('broadcastGroupChatMessage emits group_chat_message', () => {
		service.broadcastGroupChatMessage('chat-1', {
			id: 'msg-1',
			participantId: 'agent-1',
			participantName: 'Agent',
			content: 'hello',
			timestamp: Date.now(),
			role: 'assistant',
		});
		expect(isBroadcastEnvelope(lastParsed())).toBe(true);
		expect((lastParsed() as Record<string, unknown>)['type']).toBe('group_chat_message');
	});

	it('broadcastGroupChatStateChange emits group_chat_state_change (spread inconsistency documented in issue #218)', () => {
		service.broadcastGroupChatStateChange('chat-1', { isActive: true });
		expect(isBroadcastEnvelope(lastParsed())).toBe(true);
		const env = lastParsed() as Record<string, unknown>;
		expect(env['type']).toBe('group_chat_state_change');
		// isActive is spread directly into the envelope (not nested) -- documented inconsistency
		expect(env['isActive']).toBe(true);
	});

	it('broadcastContextOperationProgress emits context_operation_progress', () => {
		service.broadcastContextOperationProgress('session-1', 'summarize', 50);
		expect(isBroadcastEnvelope(lastParsed())).toBe(true);
		expect((lastParsed() as Record<string, unknown>)['type']).toBe('context_operation_progress');
	});

	it('broadcastContextOperationComplete emits context_operation_complete', () => {
		service.broadcastContextOperationComplete('session-1', 'summarize', true);
		expect(isBroadcastEnvelope(lastParsed())).toBe(true);
		expect((lastParsed() as Record<string, unknown>)['type']).toBe('context_operation_complete');
	});

	it('broadcastCueActivity emits cue_activity_event', () => {
		service.broadcastCueActivity({
			id: 'entry-1',
			subscriptionId: 'sub-1',
			subscriptionName: 'test',
			eventType: 'file_change',
			sessionId: 'session-1',
			timestamp: Date.now(),
			status: 'triggered',
		});
		expect(isBroadcastEnvelope(lastParsed())).toBe(true);
		expect((lastParsed() as Record<string, unknown>)['type']).toBe('cue_activity_event');
	});

	it('broadcastCueSubscriptionsChanged emits cue_subscriptions_changed', () => {
		service.broadcastCueSubscriptionsChanged([]);
		expect(isBroadcastEnvelope(lastParsed())).toBe(true);
		expect((lastParsed() as Record<string, unknown>)['type']).toBe('cue_subscriptions_changed');
	});

	it('broadcastToolEvent emits tool_event (session-subscribed only)', () => {
		service.broadcastToolEvent('session-1', 'tab-1', {
			id: 'log-1',
			timestamp: Date.now(),
			source: 'tool',
			text: 'running bash',
		});
		expect(isBroadcastEnvelope(lastParsed())).toBe(true);
		expect((lastParsed() as Record<string, unknown>)['type']).toBe('tool_event');
	});

	it('broadcastNotificationEvent emits notification_event', () => {
		service.broadcastNotificationEvent({
			eventType: 'agent_complete',
			sessionId: 'session-1',
			sessionName: 'Agent',
			message: 'done',
			severity: 'info',
		});
		expect(isBroadcastEnvelope(lastParsed())).toBe(true);
		expect((lastParsed() as Record<string, unknown>)['type']).toBe('notification_event');
	});

	it.skip('agentDispatch.fleet.updated can be sent via broadcastToAll directly (used by WebServer.broadcastAgentDispatchFleetUpdated)', () => {
		// This envelope is emitted by WebServer.broadcastAgentDispatchFleetUpdated which calls
		// broadcastService.broadcastToAll directly with a typed AgentDispatchFleetUpdatedEnvelope.
		const envelope: AgentDispatchFleetUpdatedEnvelope = {
			type: 'agentDispatch.fleet.updated',
			fleet: null,
			timestamp: Date.now(),
		};
		service.broadcastToAll(envelope);
		expect(isBroadcastEnvelope(lastParsed())).toBe(true);
		expect((lastParsed() as Record<string, unknown>)['type']).toBe('agentDispatch.fleet.updated');
	});
});

// ---------------------------------------------------------------------------
// Coverage completeness: emitted types == registry types
// ---------------------------------------------------------------------------

describe('BroadcastService envelope registry completeness', () => {
	it.skip('every BROADCAST_ENVELOPE_TYPES entry is emitted by at least one method call', () => {
		// Call every broadcast method to collect the full set of emitted types
		service.broadcastSessionStateChange('session-1', 'busy');
		service.broadcastSessionAdded({
			id: 's',
			name: 'n',
			toolType: 'claude-code',
			state: 'idle',
			inputMode: 'ai',
			cwd: '/',
		});
		service.broadcastSessionRemoved('session-1');
		service.broadcastSessionsList([]);
		service.broadcastActiveSessionChange('session-1');
		service.broadcastTabsChange('session-1', [], 'tab-1');
		service.broadcastGitStatus('session-1', null);
		service.broadcastExecutionQueue('session-1', []);
		service.broadcastToolExecution('session-1', 'tab-1', {
			toolName: 'bash',
			timestamp: Date.now(),
		});
		service.broadcastThemeChange({ name: 'dark' } as Parameters<
			typeof service.broadcastThemeChange
		>[0]);
		service.broadcastBionifyReadingModeChange(false);
		service.broadcastCustomCommands([]);
		service.broadcastSettingsChanged({} as Parameters<typeof service.broadcastSettingsChanged>[0]);
		service.broadcastGroupsChanged([]);
		service.broadcastAutoRunState('session-1', null);
		service.broadcastAutoRunDocsChanged('session-1', []);
		service.broadcastUserInput('session-1', 'cmd', 'ai');
		service.broadcastSessionLive('session-1');
		service.broadcastSessionOffline('session-1');
		service.broadcastWorkGraphChanged({
			type: 'workGraph',
			operation: 'workGraph.item.created',
			sequence: 1,
			timestamp: new Date().toISOString(),
			payload: {},
		});
		service.broadcastGroupChatMessage('chat-1', {
			id: 'm',
			participantId: 'p',
			participantName: 'P',
			content: 'hi',
			timestamp: Date.now(),
			role: 'user',
		});
		service.broadcastGroupChatStateChange('chat-1', { isActive: false });
		service.broadcastContextOperationProgress('session-1', 'op', 0);
		service.broadcastContextOperationComplete('session-1', 'op', true);
		service.broadcastCueActivity({
			id: 'e',
			subscriptionId: 's',
			subscriptionName: 'n',
			eventType: 'file_change',
			sessionId: 'session-1',
			timestamp: Date.now(),
			status: 'completed',
		});
		service.broadcastCueSubscriptionsChanged([]);
		service.broadcastToolEvent('session-1', 'tab-1', {
			id: 'l',
			timestamp: Date.now(),
			source: 'tool',
			text: 'x',
		});
		service.broadcastNotificationEvent({
			eventType: 'agent_complete',
			sessionId: 'session-1',
			sessionName: 'A',
			message: 'm',
			severity: 'info',
		});
		// agentDispatch.fleet.updated is sent via WebServer.broadcastAgentDispatchFleetUpdated -> broadcastService.broadcastToAll
		service.broadcastToAll({
			type: 'agentDispatch.fleet.updated',
			fleet: null,
			timestamp: Date.now(),
		} as AgentDispatchFleetUpdatedEnvelope);

		const emittedTypes = new Set<string>(
			captured.map((m) => (m.parsed as Record<string, unknown>)['type'] as string)
		);

		// Every registered type must have been emitted
		for (const registeredType of BROADCAST_ENVELOPE_TYPES) {
			expect(
				emittedTypes.has(registeredType),
				`registered type '${registeredType}' was never emitted`
			).toBe(true);
		}

		// Every emitted type must be registered
		for (const emittedType of emittedTypes) {
			expect(
				BROADCAST_ENVELOPE_TYPES.has(emittedType as BroadcastEnvelopeType),
				`emitted type '${emittedType}' is not in BROADCAST_ENVELOPE_TYPES`
			).toBe(true);
		}
	});

	it.skip('every captured envelope passes the isBroadcastEnvelope guard', () => {
		// Emit one of each type
		service.broadcastSessionStateChange('session-1', 'busy');
		service.broadcastSessionAdded({
			id: 's',
			name: 'n',
			toolType: 'claude-code',
			state: 'idle',
			inputMode: 'ai',
			cwd: '/',
		});
		service.broadcastSessionRemoved('session-1');
		service.broadcastSessionsList([]);
		service.broadcastActiveSessionChange('session-1');
		service.broadcastTabsChange('session-1', [], 'tab-1');
		service.broadcastGitStatus('session-1', null);
		service.broadcastExecutionQueue('session-1', []);
		service.broadcastToolExecution('session-1', undefined, {
			toolName: 'bash',
			timestamp: Date.now(),
		});
		service.broadcastThemeChange({ name: 'dark' } as Parameters<
			typeof service.broadcastThemeChange
		>[0]);
		service.broadcastBionifyReadingModeChange(true);
		service.broadcastCustomCommands([]);
		service.broadcastSettingsChanged({} as Parameters<typeof service.broadcastSettingsChanged>[0]);
		service.broadcastGroupsChanged([]);
		service.broadcastAutoRunState('session-1', null);
		service.broadcastAutoRunDocsChanged('session-1', []);
		service.broadcastUserInput('session-1', 'cmd', 'terminal');
		service.broadcastSessionLive('session-1', 'agent-session-1');
		service.broadcastSessionOffline('session-1');
		service.broadcastWorkGraphChanged({
			type: 'workGraph',
			operation: 'workGraph.item.updated',
			sequence: 2,
			timestamp: new Date().toISOString(),
			payload: {},
		});
		service.broadcastGroupChatMessage('chat-1', {
			id: 'm',
			participantId: 'p',
			participantName: 'P',
			content: 'hi',
			timestamp: Date.now(),
			role: 'assistant',
		});
		service.broadcastGroupChatStateChange('chat-1', { isActive: true, topic: 'test' });
		service.broadcastContextOperationProgress('session-1', 'merge', 75);
		service.broadcastContextOperationComplete('session-1', 'merge', false);
		service.broadcastCueActivity({
			id: 'e',
			subscriptionId: 's',
			subscriptionName: 'n',
			eventType: 'file_change',
			sessionId: 'session-1',
			timestamp: Date.now(),
			status: 'failed',
		});
		service.broadcastCueSubscriptionsChanged([]);
		service.broadcastToolEvent('session-1', 'tab-1', {
			id: 'l',
			timestamp: Date.now(),
			source: 'tool',
			text: 'y',
		});
		service.broadcastNotificationEvent({
			eventType: 'agent_error',
			sessionId: 'session-1',
			sessionName: 'A',
			message: 'err',
			severity: 'error',
		});
		service.broadcastToAll({
			type: 'agentDispatch.fleet.updated',
			fleet: [],
			timestamp: Date.now(),
		} as AgentDispatchFleetUpdatedEnvelope);

		for (const msg of captured) {
			expect(
				isBroadcastEnvelope(msg.parsed),
				`envelope with type '${(msg.parsed as Record<string, unknown>)['type']}' failed isBroadcastEnvelope guard`
			).toBe(true);
		}
	});
});

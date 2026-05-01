/**
 * Broadcast Envelope Schema Registry -- Wiring Audit 003 (Issue #215)
 *
 * Canonical discriminated union of every WebSocket envelope shape published by
 * BroadcastService.  Each member maps 1-to-1 to a broadcastFoo method:
 *
 *   BroadcastService method               -> envelope type literal
 *   ---------------------------------------------------------------
 *   broadcastSessionStateChange           -> 'session_state_change'
 *   broadcastSessionAdded                 -> 'session_added'
 *   broadcastSessionRemoved               -> 'session_removed'
 *   broadcastSessionsList                 -> 'sessions_list'
 *   broadcastActiveSessionChange          -> 'active_session_changed'
 *   broadcastTabsChange                   -> 'tabs_changed'
 *   broadcastGitStatus                    -> 'git_status_changed'
 *   broadcastExecutionQueue               -> 'execution_queue_changed'
 *   broadcastToolExecution                -> 'tool_execution'
 *   broadcastThemeChange                  -> 'theme'
 *   broadcastBionifyReadingModeChange     -> 'bionify_reading_mode'
 *   broadcastCustomCommands               -> 'custom_commands'
 *   broadcastSettingsChanged              -> 'settings_changed'
 *   broadcastGroupsChanged                -> 'groups_changed'
 *   broadcastAutoRunState                 -> 'autorun_state'
 *   broadcastAutoRunDocsChanged           -> 'autorun_docs_changed'
 *   broadcastUserInput                    -> 'user_input'
 *   broadcastSessionLive                  -> 'session_live'
 *   broadcastSessionOffline               -> 'session_offline'
 *   broadcastWorkGraphChanged             -> 'work_graph_changed'
 *   broadcastGroupChatMessage             -> 'group_chat_message'
 *   broadcastGroupChatStateChange         -> 'group_chat_state_change'
 *   broadcastContextOperationProgress     -> 'context_operation_progress'
 *   broadcastContextOperationComplete     -> 'context_operation_complete'
 *   broadcastCueActivity                  -> 'cue_activity_event'
 *   broadcastCueSubscriptionsChanged      -> 'cue_subscriptions_changed'
 *   broadcastToolEvent                    -> 'tool_event'
 *   broadcastNotificationEvent            -> 'notification_event'
 *
 * WebServer wrapper methods that call broadcastToAll directly:
 *   WebServer.broadcastAgentDispatchFleetUpdated  -> 'agentDispatch.fleet.updated'
 *
 * Unregistered types emitted via WebServer.broadcastToWebClients /
 * WebServer.broadcastToSessionClients escape hatches (tracked in issue #219):
 *   'session_output'    -- data-listener.ts (agent stdout/stderr)
 *   'terminal_data'     -- data-listener.ts (terminal output)
 *   'session_exit'      -- exit-listener.ts (agent exit event)
 *
 * All envelopes include a timestamp: number field injected at the call site.
 *
 * Known inconsistency (tracked in issue #218):
 *   broadcastGroupChatStateChange spreads Partial<GroupChatState> directly into
 *   the envelope rather than nesting it under a state key.  The shape is
 *   therefore dynamically variable at the field level.  The registry encodes the
 *   current runtime shape; a follow-up should normalise this to { state: ... }.
 */

import type {
	Theme,
	CustomAICommand,
	AITabData,
	SessionBroadcastData,
	AutoRunState,
	AutoRunDocument,
	CliActivity,
	NotificationEvent,
	WebSettings,
	GroupData,
	GroupChatMessage,
	GroupChatState,
	CueActivityEntry,
	CueSubscriptionInfo,
} from '../main/web-server/types';

// ---------------------------------------------------------------------------
// Inline types: these are defined in main/web-server/types.ts on humpf-dev
// but inlined here so broadcast-envelopes.ts stays self-contained on rc.
// ---------------------------------------------------------------------------
interface GitStatusData {
	fileCount: number;
	branch?: string;
	remote?: string;
	behind: number;
	ahead: number;
	totalAdditions: number;
	totalDeletions: number;
	modifiedCount: number;
	lastUpdated: number;
}
interface QueuedItemData {
	id: string;
	timestamp: number;
	tabId: string;
	type: string;
	text?: string;
	images?: string[];
	command?: string;
}
interface ToolExecutionData {
	toolName: string;
	state?: unknown;
	timestamp: number;
}
// WorkGraphBroadcastEnvelope is defined in shared/work-graph-types.ts on humpf-dev;
// inlined here as a minimal compatible shape for upstream/rc compatibility.
interface WorkGraphBroadcastEnvelope {
	type: 'workGraph';
	operation: string;
	sequence: number;
	timestamp: string;
	projectPath?: string;
	payload: unknown;
}

// =============================================================================
// Envelope member types
// =============================================================================

export interface SessionStateChangeEnvelope {
	type: 'session_state_change';
	sessionId: string;
	state: string;
	name?: string;
	toolType?: string;
	inputMode?: string;
	cwd?: string;
	cliActivity?: CliActivity;
	currentCycleTokens?: number;
	thinkingStartTime?: number;
	timestamp: number;
}

export interface SessionAddedEnvelope {
	type: 'session_added';
	session: SessionBroadcastData;
	timestamp: number;
}

export interface SessionRemovedEnvelope {
	type: 'session_removed';
	sessionId: string;
	timestamp: number;
}

export interface SessionsListEnvelope {
	type: 'sessions_list';
	sessions: SessionBroadcastData[];
	timestamp: number;
}

export interface ActiveSessionChangedEnvelope {
	type: 'active_session_changed';
	sessionId: string;
	timestamp: number;
}

export interface TabsChangedEnvelope {
	type: 'tabs_changed';
	sessionId: string;
	aiTabs: AITabData[];
	activeTabId: string;
	timestamp: number;
}

export interface GitStatusChangedEnvelope {
	type: 'git_status_changed';
	sessionId: string;
	gitStatus: GitStatusData | null;
	timestamp: number;
}

export interface ExecutionQueueChangedEnvelope {
	type: 'execution_queue_changed';
	sessionId: string;
	executionQueue: QueuedItemData[];
	timestamp: number;
}

export interface ToolExecutionEnvelope {
	type: 'tool_execution';
	sessionId: string;
	tabId: string | undefined;
	tool: ToolExecutionData;
	timestamp: number;
}

export interface ThemeEnvelope {
	type: 'theme';
	theme: Theme;
	timestamp: number;
}

export interface BionifyReadingModeEnvelope {
	type: 'bionify_reading_mode';
	enabled: boolean;
	timestamp: number;
}

export interface CustomCommandsEnvelope {
	type: 'custom_commands';
	commands: CustomAICommand[];
	timestamp: number;
}

export interface SettingsChangedEnvelope {
	type: 'settings_changed';
	settings: WebSettings;
	timestamp: number;
}

export interface GroupsChangedEnvelope {
	type: 'groups_changed';
	groups: GroupData[];
	timestamp: number;
}

export interface AutoRunStateEnvelope {
	type: 'autorun_state';
	sessionId: string;
	state: AutoRunState | null;
	timestamp: number;
}

export interface AutoRunDocsChangedEnvelope {
	type: 'autorun_docs_changed';
	sessionId: string;
	documents: AutoRunDocument[];
	timestamp: number;
}

export interface UserInputEnvelope {
	type: 'user_input';
	sessionId: string;
	command: string;
	inputMode: 'ai' | 'terminal';
	timestamp: number;
}

export interface SessionLiveEnvelope {
	type: 'session_live';
	sessionId: string;
	agentSessionId?: string;
	timestamp: number;
}

export interface SessionOfflineEnvelope {
	type: 'session_offline';
	sessionId: string;
	timestamp: number;
}

export interface WorkGraphChangedEnvelope {
	type: 'work_graph_changed';
	workGraph: WorkGraphBroadcastEnvelope;
	timestamp: number;
}

export interface GroupChatMessageEnvelope {
	type: 'group_chat_message';
	chatId: string;
	message: GroupChatMessage;
	timestamp: number;
}

/**
 * NOTE (issue #218): BroadcastService spreads Partial<GroupChatState> directly
 * into this envelope rather than nesting under a state key.  The fields below
 * reflect the current runtime behaviour.  The id and topic fields come from
 * GroupChatState but are optional here because only a partial is passed.
 */
export interface GroupChatStateChangeEnvelope {
	type: 'group_chat_state_change';
	chatId: string;
	timestamp: number;
	// Partial<GroupChatState> spread fields
	id?: string;
	topic?: string;
	participants?: GroupChatState['participants'];
	messages?: GroupChatMessage[];
	isActive?: boolean;
	currentTurn?: string;
}

export interface ContextOperationProgressEnvelope {
	type: 'context_operation_progress';
	sessionId: string;
	operation: string;
	progress: number;
	timestamp: number;
}

export interface ContextOperationCompleteEnvelope {
	type: 'context_operation_complete';
	sessionId: string;
	operation: string;
	success: boolean;
	timestamp: number;
}

export interface CueActivityEventEnvelope {
	type: 'cue_activity_event';
	entry: CueActivityEntry;
	timestamp: number;
}

export interface CueSubscriptionsChangedEnvelope {
	type: 'cue_subscriptions_changed';
	subscriptions: CueSubscriptionInfo[];
	timestamp: number;
}

/** toolLog shape as emitted by broadcastToolEvent */
export interface ToolEventToolLog {
	id: string;
	timestamp: number;
	source: 'tool';
	text: string;
	metadata?: {
		toolState?: {
			name: string;
			status: 'running' | 'completed' | 'error';
			input?: Record<string, unknown>;
		};
	};
}

export interface ToolEventEnvelope {
	type: 'tool_event';
	sessionId: string;
	tabId: string;
	toolLog: ToolEventToolLog;
	timestamp: number;
}

export interface NotificationEventEnvelope extends NotificationEvent {
	type: 'notification_event';
	timestamp: number;
}

/**
 * Fleet entry shape for agent dispatch (mirrors FleetEntry from agentDispatchRoutes.ts).
 * Inlined here to avoid a circular dependency between shared/ and main/.
 */
export interface AgentDispatchFleetEntry {
	agentId: string;
	label?: string;
	state: 'idle' | 'busy' | 'paused' | 'error';
	currentItemId?: string | null;
	capabilities?: string[];
	lastSeenAt?: string;
}

/**
 * Emitted by WebServer.broadcastAgentDispatchFleetUpdated when the fleet
 * registry changes (agent connects, disconnects, or state change).
 */
export interface AgentDispatchFleetUpdatedEnvelope {
	type: 'agentDispatch.fleet.updated';
	fleet: AgentDispatchFleetEntry[] | null;
	timestamp: number;
}

// =============================================================================
// Master discriminated union
// =============================================================================

/**
 * Every envelope shape that BroadcastService can publish over the WebSocket.
 * Discriminated on the type field.
 */
export type BroadcastEnvelope =
	| SessionStateChangeEnvelope
	| SessionAddedEnvelope
	| SessionRemovedEnvelope
	| SessionsListEnvelope
	| ActiveSessionChangedEnvelope
	| TabsChangedEnvelope
	| GitStatusChangedEnvelope
	| ExecutionQueueChangedEnvelope
	| ToolExecutionEnvelope
	| ThemeEnvelope
	| BionifyReadingModeEnvelope
	| CustomCommandsEnvelope
	| SettingsChangedEnvelope
	| GroupsChangedEnvelope
	| AutoRunStateEnvelope
	| AutoRunDocsChangedEnvelope
	| UserInputEnvelope
	| SessionLiveEnvelope
	| SessionOfflineEnvelope
	| WorkGraphChangedEnvelope
	| GroupChatMessageEnvelope
	| GroupChatStateChangeEnvelope
	| ContextOperationProgressEnvelope
	| ContextOperationCompleteEnvelope
	| CueActivityEventEnvelope
	| CueSubscriptionsChangedEnvelope
	| ToolEventEnvelope
	| NotificationEventEnvelope
	| AgentDispatchFleetUpdatedEnvelope;

/**
 * All valid type discriminant values -- one per BroadcastService publish method.
 */
export type BroadcastEnvelopeType = BroadcastEnvelope['type'];

/**
 * Lookup: given a discriminant string, resolve the matching envelope member.
 */
export type EnvelopeByType<T extends BroadcastEnvelopeType> = Extract<
	BroadcastEnvelope,
	{ type: T }
>;

// =============================================================================
// Runtime type-guard
// =============================================================================

/** Set of all known envelope type discriminants (for O(1) runtime checks). */
export const BROADCAST_ENVELOPE_TYPES = new Set<BroadcastEnvelopeType>([
	'session_state_change',
	'session_added',
	'session_removed',
	'sessions_list',
	'active_session_changed',
	'tabs_changed',
	'git_status_changed',
	'execution_queue_changed',
	'tool_execution',
	'theme',
	'bionify_reading_mode',
	'custom_commands',
	'settings_changed',
	'groups_changed',
	'autorun_state',
	'autorun_docs_changed',
	'user_input',
	'session_live',
	'session_offline',
	'work_graph_changed',
	'group_chat_message',
	'group_chat_state_change',
	'context_operation_progress',
	'context_operation_complete',
	'cue_activity_event',
	'cue_subscriptions_changed',
	'tool_event',
	'notification_event',
	'agentDispatch.fleet.updated',
] as const);

/**
 * Returns true when value is a well-formed BroadcastEnvelope:
 *   - has a string type field
 *   - the type value is a registered envelope discriminant
 *   - has a numeric timestamp field
 *
 * Structural-field validation beyond these two invariants is left to
 * per-envelope unit tests so that this guard stays fast for hot paths.
 */
export function isBroadcastEnvelope(value: unknown): value is BroadcastEnvelope {
	if (typeof value !== 'object' || value === null) return false;
	const obj = value as Record<string, unknown>;
	return (
		typeof obj['type'] === 'string' &&
		BROADCAST_ENVELOPE_TYPES.has(obj['type'] as BroadcastEnvelopeType) &&
		typeof obj['timestamp'] === 'number'
	);
}

/**
 * Preload API for Agent Dispatch
 *
 * Provides the window.maestro.agentDispatch namespace for:
 * - Fetching work items in kanban (board) form
 * - Reading the current fleet from the FleetRegistry
 * - Manual work item assignment via the dispatch engine
 * - Releasing work item claims
 * - Pausing / resuming individual agents
 * - Slash-command friendly helpers (list eligible, create subtask)
 */

import { ipcRenderer } from 'electron';
import type { WorkItemFilters, WorkItemClaimReleaseInput } from '../../shared/work-graph-types';
import type {
	AgentDispatchFleetEntry,
	CreateSubtaskParams,
	DispatchAgent,
	DispatchWorkItem,
} from '../../shared/agent-dispatch-types';
import type { ManualAssignmentInput } from '../agent-dispatch/dispatch-engine';

export function createAgentDispatchApi() {
	return {
		/**
		 * List work items filtered for kanban display.
		 * Returns the same { success, data } envelope as all IPC data handlers.
		 */
		getBoard: (filters?: WorkItemFilters) => ipcRenderer.invoke('agentDispatch:getBoard', filters),

		/**
		 * Return all current entries from the in-process FleetRegistry.
		 * Returns an empty array if the runtime is not yet started.
		 */
		getFleet: (): Promise<
			{ success: true; data: AgentDispatchFleetEntry[] } | { success: false; error: string }
		> => ipcRenderer.invoke('agentDispatch:getFleet'),

		/**
		 * List unclaimed `agent-ready` work items, surfaced for slash commands and MCP.
		 */
		listEligible: (): Promise<
			{ success: true; items: DispatchWorkItem[] } | { success: false; error: string }
		> => ipcRenderer.invoke('agentDispatch:listEligible'),

		/**
		 * Manually assign a work item to an agent.
		 * Requires input.userInitiated === true (enforced by the engine).
		 */
		assignManually: (input: ManualAssignmentInput) =>
			ipcRenderer.invoke('agentDispatch:assignManually', input),

		/**
		 * Release an active claim on a work item.
		 */
		releaseClaim: (input: WorkItemClaimReleaseInput) =>
			ipcRenderer.invoke('agentDispatch:releaseClaim', input),

		/**
		 * Pause auto-pickup for the given agent (in-memory, resets on restart).
		 */
		pauseAgent: (agentId: string) => ipcRenderer.invoke('agentDispatch:pauseAgent', agentId),

		/**
		 * Resume auto-pickup for the given agent.
		 */
		resumeAgent: (agentId: string) => ipcRenderer.invoke('agentDispatch:resumeAgent', agentId),

		/**
		 * Agent self-service: create a subtask under an existing parent work item.
		 * Does not spawn a new process; only records the subtask in the Work Graph.
		 */
		createSubtask: (params: CreateSubtaskParams) =>
			ipcRenderer.invoke('agentDispatch:createSubtask', params),

		// -----------------------------------------------------------------------
		// MCP / slash-command helpers (backed by in-memory dispatch registry)
		// -----------------------------------------------------------------------

		/**
		 * List all agents currently registered in the in-memory dispatch registry.
		 */
		listAgents: (): Promise<
			{ success: true; agents: DispatchAgent[] } | { success: false; error: string }
		> => ipcRenderer.invoke('agentDispatch:listAgents'),

		/**
		 * Assign a work item to an agent via the in-memory dispatch registry.
		 */
		assign: (params: {
			itemId: string;
			sessionId: string;
		}): Promise<{ success: true; item: DispatchWorkItem } | { success: false; error: string }> =>
			ipcRenderer.invoke('agentDispatch:assign', params),

		/**
		 * Release an in-progress work item back to agent-ready state.
		 */
		release: (params: {
			itemId: string;
		}): Promise<{ success: true; item: DispatchWorkItem } | { success: false; error: string }> =>
			ipcRenderer.invoke('agentDispatch:release', params),

		/**
		 * Pause an agent (set availability to offline) via the in-memory registry.
		 */
		pause: (params: {
			sessionId: string;
		}): Promise<{ success: true; agent: DispatchAgent } | { success: false; error: string }> =>
			ipcRenderer.invoke('agentDispatch:pause', params),

		/**
		 * Resume a paused agent (set availability back to idle).
		 */
		resume: (params: {
			sessionId: string;
		}): Promise<{ success: true; agent: DispatchAgent } | { success: false; error: string }> =>
			ipcRenderer.invoke('agentDispatch:resume', params),

		/**
		 * Get a combined dispatch status snapshot for slash commands / MCP.
		 */
		status: (): Promise<
			| {
					success: true;
					agents: DispatchAgent[];
					eligible: DispatchWorkItem[];
					inProgress: DispatchWorkItem[];
			  }
			| { success: false; error: string }
		> => ipcRenderer.invoke('agentDispatch:status'),
	};
}

export type AgentDispatchApi = ReturnType<typeof createAgentDispatchApi>;

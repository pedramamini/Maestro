import { ipcRenderer } from 'electron';

import type {
	ConversationalPrdFinalizeRequest,
	ConversationalPrdFinalizeResponse,
	ConversationalPrdSession,
	ConversationalPrdStartRequest,
	ConversationalPrdStartResponse,
	ConversationalPrdTurnRequest,
	ConversationalPrdTurnResponse,
} from '../../shared/conversational-prd-types';
import type { WorkGraphActor } from '../../shared/work-graph-types';
import type { IpcResponse } from '../utils/ipcHandler';

export function createConversationalPrdApi() {
	return {
		createSession: (
			input: ConversationalPrdStartRequest
		): Promise<IpcResponse<ConversationalPrdStartResponse>> =>
			ipcRenderer.invoke('conversationalPrd:createSession', input),

		sendMessage: (
			input: ConversationalPrdTurnRequest
		): Promise<IpcResponse<ConversationalPrdTurnResponse>> =>
			ipcRenderer.invoke('conversationalPrd:sendMessage', input),

		getSession: (conversationId: string): Promise<IpcResponse<ConversationalPrdSession | null>> =>
			ipcRenderer.invoke('conversationalPrd:getSession', conversationId),

		listSessions: (filters?: {
			projectPath?: string;
			includeArchived?: boolean;
		}): Promise<IpcResponse<ConversationalPrdSession[]>> =>
			ipcRenderer.invoke('conversationalPrd:listSessions', filters),

		archiveSession: (input: {
			sessionId: string;
			actor?: WorkGraphActor;
		}): Promise<IpcResponse<ConversationalPrdSession>> =>
			ipcRenderer.invoke('conversationalPrd:archiveSession', input),

		finalizeSession: (
			input: ConversationalPrdFinalizeRequest
		): Promise<IpcResponse<ConversationalPrdFinalizeResponse>> =>
			ipcRenderer.invoke('conversationalPrd:finalizeSession', input),
	};
}

export type ConversationalPrdApi = ReturnType<typeof createConversationalPrdApi>;

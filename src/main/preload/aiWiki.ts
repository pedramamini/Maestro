import { ipcRenderer } from 'electron';
import type {
	AiWikiContextPacket,
	AiWikiProjectRequest,
	AiWikiSourceSnapshot,
} from '../../shared/ai-wiki-types';

export interface AiWikiResponse<T> {
	success: boolean;
	data?: T;
	error?: string;
}

export function createAiWikiApi() {
	return {
		status: (request: AiWikiProjectRequest): Promise<AiWikiResponse<AiWikiSourceSnapshot>> =>
			ipcRenderer.invoke('aiWiki:status', request),
		refresh: (request: AiWikiProjectRequest): Promise<AiWikiResponse<AiWikiSourceSnapshot>> =>
			ipcRenderer.invoke('aiWiki:refresh', request),
		getContextPacket: (
			request: AiWikiProjectRequest
		): Promise<AiWikiResponse<AiWikiContextPacket>> =>
			ipcRenderer.invoke('aiWiki:getContextPacket', request),
	};
}

export type AiWikiApi = ReturnType<typeof createAiWikiApi>;

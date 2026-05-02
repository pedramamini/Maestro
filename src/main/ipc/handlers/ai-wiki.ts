import { App, ipcMain } from 'electron';
import type { AiWikiProjectRequest } from '../../../shared/ai-wiki-types';
import { createIpcDataHandler } from '../../utils/ipcHandler';
import { AiWikiService } from '../../ai-wiki/service';

const LOG_CONTEXT = '[AIWiki]';

export interface AiWikiHandlerDependencies {
	app: App;
}

export function registerAiWikiHandlers(deps: AiWikiHandlerDependencies): AiWikiService {
	const service = new AiWikiService({ userDataPath: deps.app.getPath('userData') });

	ipcMain.handle('aiWiki:status', (event, request: AiWikiProjectRequest) =>
		createIpcDataHandler(
			{ context: LOG_CONTEXT, operation: 'status', logSuccess: false },
			(req: AiWikiProjectRequest) => service.getStatus(req)
		)(event, request)
	);

	ipcMain.handle('aiWiki:refresh', (event, request: AiWikiProjectRequest) =>
		createIpcDataHandler(
			{ context: LOG_CONTEXT, operation: 'refresh', logSuccess: false },
			(req: AiWikiProjectRequest) => service.refresh(req)
		)(event, request)
	);

	ipcMain.handle('aiWiki:getContextPacket', (event, request: AiWikiProjectRequest) =>
		createIpcDataHandler(
			{ context: LOG_CONTEXT, operation: 'getContextPacket', logSuccess: false },
			(req: AiWikiProjectRequest) => service.getContextPacket(req)
		)(event, request)
	);

	return service;
}

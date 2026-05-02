import { BrowserWindow, ipcMain } from 'electron';
import type {
	AgentReadyWorkFilter,
	TagDefinition,
	WorkGraphImportInput,
	WorkGraphListResult,
	WorkItem,
	WorkItemClaim,
	WorkItemClaimCompleteInput,
	WorkItemClaimInput,
	WorkItemClaimReleaseInput,
	WorkItemClaimRenewInput,
	WorkItemCreateInput,
	WorkItemEvent,
	WorkItemFilters,
	WorkItemSearchFilters,
	WorkItemUpdateInput,
} from '../../../shared/work-graph-types';
import { createIpcDataHandler } from '../../utils/ipcHandler';
import { getWorkGraphItemStore, publishWorkGraphEvent } from '../../work-graph';

const LOG_CONTEXT = '[WorkGraph]';

export interface WorkGraphHandlerDependencies {
	getMainWindow: () => BrowserWindow | null;
}

export function registerWorkGraphHandlers(deps: WorkGraphHandlerDependencies): void {
	const workGraph = getWorkGraphItemStore();

	ipcMain.handle('workGraph:listItems', (event, filters: WorkItemFilters = {}) =>
		createIpcDataHandler(
			{ context: LOG_CONTEXT, operation: 'listItems', logSuccess: false },
			(f: WorkItemFilters = {}): Promise<WorkGraphListResult> => workGraph.listItems(f)
		)(event, filters)
	);

	ipcMain.handle('workGraph:searchItems', (event, filters: WorkItemSearchFilters) =>
		createIpcDataHandler(
			{ context: LOG_CONTEXT, operation: 'searchItems', logSuccess: false },
			(f: WorkItemSearchFilters): Promise<WorkGraphListResult> => workGraph.searchItems(f)
		)(event, filters)
	);

	ipcMain.handle('workGraph:getItem', (event, id: string) =>
		createIpcDataHandler(
			{ context: LOG_CONTEXT, operation: 'getItem', logSuccess: false },
			(itemId: string): Promise<WorkItem | undefined> => workGraph.getItem(itemId)
		)(event, id)
	);

	ipcMain.handle('workGraph:createItem', (event, input: WorkItemCreateInput) =>
		createIpcDataHandler(
			{ context: LOG_CONTEXT, operation: 'createItem' },
			async (i: WorkItemCreateInput): Promise<WorkItem> => {
				const item = await workGraph.createItem(i, { type: 'user', id: 'renderer' });
				publishWorkGraphEvent(deps.getMainWindow, 'workGraph.item.created', { item });
				return item;
			}
		)(event, input)
	);

	ipcMain.handle('workGraph:updateItem', (event, input: WorkItemUpdateInput) =>
		createIpcDataHandler(
			{ context: LOG_CONTEXT, operation: 'updateItem' },
			async (i: WorkItemUpdateInput): Promise<WorkItem> => {
				const previous = await workGraph.getItem(i.id);
				const item = await workGraph.updateItem(i);
				publishWorkGraphEvent(deps.getMainWindow, 'workGraph.item.updated', {
					item,
					previous,
				});
				return item;
			}
		)(event, input)
	);

	ipcMain.handle('workGraph:deleteItem', (event, id: string) =>
		createIpcDataHandler(
			{ context: LOG_CONTEXT, operation: 'deleteItem' },
			async (itemId: string): Promise<boolean> => {
				const previous = await workGraph.getItem(itemId);
				const deleted = await workGraph.deleteItem(itemId);
				if (deleted) {
					publishWorkGraphEvent(deps.getMainWindow, 'workGraph.item.deleted', {
						item: previous,
					});
				}
				return deleted;
			}
		)(event, id)
	);

	ipcMain.handle('workGraph:claimItem', (event, input: WorkItemClaimInput) =>
		createIpcDataHandler(
			{ context: LOG_CONTEXT, operation: 'claimItem' },
			async (i: WorkItemClaimInput): Promise<WorkItemClaim> => {
				const claim = await workGraph.claimItem(i, { type: 'user', id: 'renderer' });
				const item = await workGraph.getItem(i.workItemId);
				publishWorkGraphEvent(deps.getMainWindow, 'workGraph.item.claimed', { item, claim });
				return claim;
			}
		)(event, input)
	);

	ipcMain.handle('workGraph:renewClaim', (event, input: WorkItemClaimRenewInput) =>
		createIpcDataHandler(
			{ context: LOG_CONTEXT, operation: 'renewClaim', logSuccess: false },
			(i: WorkItemClaimRenewInput): Promise<WorkItemClaim> => workGraph.renewClaim(i)
		)(event, input)
	);

	ipcMain.handle('workGraph:releaseClaim', (event, input: WorkItemClaimReleaseInput) =>
		createIpcDataHandler(
			{ context: LOG_CONTEXT, operation: 'releaseClaim' },
			async (i: WorkItemClaimReleaseInput): Promise<WorkItemClaim | undefined> => {
				const claim = await workGraph.releaseClaim(i);
				const item = await workGraph.getItem(i.workItemId);
				publishWorkGraphEvent(deps.getMainWindow, 'workGraph.item.released', { item, claim });
				return claim;
			}
		)(event, input)
	);

	ipcMain.handle('workGraph:completeClaim', (event, input: WorkItemClaimCompleteInput) =>
		createIpcDataHandler(
			{ context: LOG_CONTEXT, operation: 'completeClaim' },
			async (i: WorkItemClaimCompleteInput): Promise<WorkItemClaim | undefined> => {
				const claim = await workGraph.completeClaim(i);
				const item = await workGraph.getItem(i.workItemId);
				publishWorkGraphEvent(deps.getMainWindow, 'workGraph.item.statusChanged', {
					item,
					claim,
				});
				return claim;
			}
		)(event, input)
	);

	ipcMain.handle('workGraph:listEvents', (event, workItemId: string, limit?: number) =>
		createIpcDataHandler(
			{ context: LOG_CONTEXT, operation: 'listEvents', logSuccess: false },
			(id: string, count?: number): Promise<WorkItemEvent[]> => workGraph.listEvents(id, count)
		)(event, workItemId, limit)
	);

	ipcMain.handle('workGraph:listTags', (event) =>
		createIpcDataHandler(
			{ context: LOG_CONTEXT, operation: 'listTags', logSuccess: false },
			(): Promise<TagDefinition[]> => workGraph.listTags()
		)(event)
	);

	ipcMain.handle('workGraph:upsertTag', (event, input: TagDefinition) =>
		createIpcDataHandler(
			{ context: LOG_CONTEXT, operation: 'upsertTag' },
			async (definition: TagDefinition): Promise<TagDefinition> => {
				const tag = await workGraph.upsertTag(definition);
				publishWorkGraphEvent(deps.getMainWindow, 'workGraph.tags.updated', { tag });
				return tag;
			}
		)(event, input)
	);

	ipcMain.handle('workGraph:importItems', (event, input: WorkGraphImportInput) =>
		createIpcDataHandler(
			{ context: LOG_CONTEXT, operation: 'importItems' },
			async (i: WorkGraphImportInput) => {
				const result = await workGraph.importItems(i);
				publishWorkGraphEvent(deps.getMainWindow, 'workGraph.import.completed', result);
				return result;
			}
		)(event, input)
	);

	ipcMain.handle(
		'workGraph:getUnblockedAgentReadyWork',
		(event, filters: AgentReadyWorkFilter = {}) =>
			createIpcDataHandler(
				{ context: LOG_CONTEXT, operation: 'getUnblockedAgentReadyWork', logSuccess: false },
				(f: AgentReadyWorkFilter = {}): Promise<WorkGraphListResult> =>
					workGraph.getUnblockedWorkItems(f)
			)(event, filters)
	);
}

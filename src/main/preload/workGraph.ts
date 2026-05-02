import { ipcRenderer } from 'electron';

export function createWorkGraphApi() {
	return {
		listItems: (filters?: unknown) => ipcRenderer.invoke('workGraph:listItems', filters),
		searchItems: (filters: unknown) => ipcRenderer.invoke('workGraph:searchItems', filters),
		getItem: (id: string) => ipcRenderer.invoke('workGraph:getItem', id),
		createItem: (input: unknown) => ipcRenderer.invoke('workGraph:createItem', input),
		updateItem: (input: unknown) => ipcRenderer.invoke('workGraph:updateItem', input),
		deleteItem: (id: string) => ipcRenderer.invoke('workGraph:deleteItem', id),
		claimItem: (input: unknown) => ipcRenderer.invoke('workGraph:claimItem', input),
		renewClaim: (input: unknown) => ipcRenderer.invoke('workGraph:renewClaim', input),
		releaseClaim: (input: unknown) => ipcRenderer.invoke('workGraph:releaseClaim', input),
		completeClaim: (input: unknown) => ipcRenderer.invoke('workGraph:completeClaim', input),
		listEvents: (workItemId: string, limit?: number) =>
			ipcRenderer.invoke('workGraph:listEvents', workItemId, limit),
		listTags: () => ipcRenderer.invoke('workGraph:listTags'),
		upsertTag: (definition: unknown) => ipcRenderer.invoke('workGraph:upsertTag', definition),
		importItems: (input: unknown) => ipcRenderer.invoke('workGraph:importItems', input),
		getUnblockedAgentReadyWork: (filters?: unknown) =>
			ipcRenderer.invoke('workGraph:getUnblockedAgentReadyWork', filters),
		onChanged: (handler: (event: unknown) => void): (() => void) => {
			const listener = (_e: unknown, event: unknown) => handler(event);
			ipcRenderer.on('workGraph:changed', listener);
			return () => {
				ipcRenderer.removeListener('workGraph:changed', listener);
			};
		},
	};
}

export type WorkGraphApi = ReturnType<typeof createWorkGraphApi>;

import type {
	AgentReadyWorkFilter,
	TagDefinition,
	WorkGraphBroadcastEnvelope,
	WorkGraphImportInput,
	WorkGraphImportSummary,
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
} from '../../shared/work-graph-types';

type IpcResult<T> = { success: true; data: T } | { success: false; error: string };

function unwrap<T>(result: IpcResult<T>): T {
	if (!result.success) {
		throw new Error(result.error);
	}
	return result.data;
}

export const workGraphService = {
	listItems: async (filters?: WorkItemFilters): Promise<WorkGraphListResult> =>
		unwrap(await window.maestro.workGraph.listItems(filters)),

	searchItems: async (filters: WorkItemSearchFilters): Promise<WorkGraphListResult> =>
		unwrap(await window.maestro.workGraph.searchItems(filters)),

	getItem: async (id: string): Promise<WorkItem | undefined> =>
		unwrap(await window.maestro.workGraph.getItem(id)),

	createItem: async (input: WorkItemCreateInput): Promise<WorkItem> =>
		unwrap(await window.maestro.workGraph.createItem(input)),

	updateItem: async (input: WorkItemUpdateInput): Promise<WorkItem> =>
		unwrap(await window.maestro.workGraph.updateItem(input)),

	deleteItem: async (id: string): Promise<boolean> =>
		unwrap(await window.maestro.workGraph.deleteItem(id)),

	claimItem: async (input: WorkItemClaimInput): Promise<WorkItemClaim> =>
		unwrap(await window.maestro.workGraph.claimItem(input)),

	renewClaim: async (input: WorkItemClaimRenewInput): Promise<WorkItemClaim> =>
		unwrap(await window.maestro.workGraph.renewClaim(input)),

	releaseClaim: async (input: WorkItemClaimReleaseInput): Promise<WorkItemClaim | undefined> =>
		unwrap(await window.maestro.workGraph.releaseClaim(input)),

	completeClaim: async (input: WorkItemClaimCompleteInput): Promise<WorkItemClaim | undefined> =>
		unwrap(await window.maestro.workGraph.completeClaim(input)),

	listEvents: async (workItemId: string, limit?: number): Promise<WorkItemEvent[]> =>
		unwrap(await window.maestro.workGraph.listEvents(workItemId, limit)),

	listTags: async (): Promise<TagDefinition[]> => unwrap(await window.maestro.workGraph.listTags()),

	upsertTag: async (definition: TagDefinition): Promise<TagDefinition> =>
		unwrap(await window.maestro.workGraph.upsertTag(definition)),

	importItems: async (input: WorkGraphImportInput): Promise<WorkGraphImportSummary> =>
		unwrap(await window.maestro.workGraph.importItems(input)),

	getUnblockedAgentReadyWork: async (
		filters?: AgentReadyWorkFilter
	): Promise<WorkGraphListResult> =>
		unwrap(await window.maestro.workGraph.getUnblockedAgentReadyWork(filters)),

	onChanged: (handler: (event: WorkGraphBroadcastEnvelope) => void): (() => void) =>
		window.maestro.workGraph.onChanged((event) => handler(event as WorkGraphBroadcastEnvelope)),
};

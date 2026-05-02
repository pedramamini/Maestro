/**
 * Work Graph renderer service — IPC bridge placeholder
 *
 * Local PM/dispatch now uses Work Graph as durable state in the main process.
 * This renderer service remains a placeholder until a dedicated Work Graph
 * read IPC is re-exposed for UI boards and inspectors.
 *
 * All methods return empty results or no-ops so callers degrade gracefully
 * rather than crashing at runtime.
 *
 * TODO(#444-follow-up): remove this file once all callers are migrated.
 */

import type { WorkGraphListResult, WorkItem, WorkItemFilters } from '../../shared/work-graph-types';

const EMPTY_LIST: WorkGraphListResult = { items: [], total: 0 };

export const workGraphService = {
	listItems: (_filters?: WorkItemFilters): Promise<WorkGraphListResult> =>
		Promise.resolve(EMPTY_LIST),

	searchItems: (_filters: unknown): Promise<WorkGraphListResult> => Promise.resolve(EMPTY_LIST),

	getItem: (_id: string): Promise<WorkItem | undefined> => Promise.resolve(undefined),

	createItem: (_input: unknown): Promise<WorkItem> =>
		Promise.reject(new Error('Work Graph renderer write IPC is not exposed yet')),

	updateItem: (_input: unknown): Promise<WorkItem> =>
		Promise.reject(new Error('Work Graph renderer write IPC is not exposed yet')),

	deleteItem: (_id: string): Promise<boolean> =>
		Promise.reject(new Error('Work Graph renderer write IPC is not exposed yet')),

	claimItem: (_input: unknown): Promise<unknown> =>
		Promise.reject(new Error('Work Graph renderer claim IPC is not exposed yet')),

	renewClaim: (_input: unknown): Promise<unknown> =>
		Promise.reject(new Error('Work Graph renderer claim IPC is not exposed yet')),

	releaseClaim: (_input: unknown): Promise<unknown> =>
		Promise.reject(new Error('Work Graph renderer claim IPC is not exposed yet')),

	completeClaim: (_input: unknown): Promise<unknown> =>
		Promise.reject(new Error('Work Graph renderer claim IPC is not exposed yet')),

	listEvents: (_workItemId: string): Promise<unknown[]> => Promise.resolve([]),

	listTags: (): Promise<unknown[]> => Promise.resolve([]),

	upsertTag: (_definition: unknown): Promise<unknown> =>
		Promise.reject(new Error('Work Graph renderer tag IPC is not exposed yet')),

	importItems: (_input: unknown): Promise<unknown> =>
		Promise.reject(new Error('Work Graph renderer import IPC is not exposed yet')),

	getUnblockedAgentReadyWork: (_filters?: unknown): Promise<WorkGraphListResult> =>
		Promise.resolve(EMPTY_LIST),

	/** No-op: workGraph:changed events are gone (#444). Returns empty unsubscribe. */
	onChanged:
		(_handler: (event: unknown) => void): (() => void) =>
		() =>
			undefined,
};

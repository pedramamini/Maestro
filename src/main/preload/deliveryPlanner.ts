import { ipcRenderer } from 'electron';
import type {
	DeliveryPlannerBugFollowUpRequest,
	DeliveryPlannerCreatePrdRequest,
	DeliveryPlannerDecomposeEpicRequest,
	DeliveryPlannerDecomposePrdRequest,
	DeliveryPlannerPathResolutionRequest,
	DeliveryPlannerProgressCommentRequest,
	DeliveryPlannerProgressEvent,
	DeliveryPlannerPromoteDocGapRequest,
	DeliveryPlannerSyncRequest,
} from '../../shared/delivery-planner-types';

export function createDeliveryPlannerApi() {
	return {
		createPrd: (input: DeliveryPlannerCreatePrdRequest) =>
			ipcRenderer.invoke('deliveryPlanner:createPrd', input),
		decomposePrd: (input: DeliveryPlannerDecomposePrdRequest) =>
			ipcRenderer.invoke('deliveryPlanner:decomposePrd', input),
		decomposeEpic: (input: DeliveryPlannerDecomposeEpicRequest) =>
			ipcRenderer.invoke('deliveryPlanner:decomposeEpic', input),
		dashboard: (filters?: { projectPath?: string; gitPath?: string }) =>
			ipcRenderer.invoke('deliveryPlanner:dashboard', filters),
		sync: (input: DeliveryPlannerSyncRequest) => ipcRenderer.invoke('deliveryPlanner:sync', input),
		createBugFollowUp: (input: DeliveryPlannerBugFollowUpRequest) =>
			ipcRenderer.invoke('deliveryPlanner:createBugFollowUp', input),
		addProgressComment: (input: DeliveryPlannerProgressCommentRequest) =>
			ipcRenderer.invoke('deliveryPlanner:addProgressComment', input),
		resolvePaths: (input?: DeliveryPlannerPathResolutionRequest) =>
			ipcRenderer.invoke('deliveryPlanner:resolvePaths', input),
		getProgress: (id: string) => ipcRenderer.invoke('deliveryPlanner:getProgress', id),
		listProgress: () => ipcRenderer.invoke('deliveryPlanner:listProgress'),
		promoteDocGap: (input: DeliveryPlannerPromoteDocGapRequest) =>
			ipcRenderer.invoke('deliveryPlanner:promoteDocGap', input),
		onProgress: (handler: (event: DeliveryPlannerProgressEvent) => void) => {
			const wrappedHandler = (
				_event: Electron.IpcRendererEvent,
				data: DeliveryPlannerProgressEvent
			) => handler(data);
			ipcRenderer.on('deliveryPlanner:progress', wrappedHandler);
			return () => ipcRenderer.removeListener('deliveryPlanner:progress', wrappedHandler);
		},
	};
}

export type DeliveryPlannerApi = ReturnType<typeof createDeliveryPlannerApi>;

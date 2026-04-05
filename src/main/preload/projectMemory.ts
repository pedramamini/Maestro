import { ipcRenderer } from 'electron';
import type {
	ProjectMemoryExecutionContext,
	ProjectMemoryExecutionValidationResult,
	ProjectMemoryStateValidationReport,
	ProjectMemorySnapshot,
	ProjectMemoryTaskDetail,
} from '../../shared/projectMemory';
import type { Playbook } from '../../shared/types';
import type { WizardTaskEmissionError } from '../../main/wizard-task-emitter';

type IpcInvokeResult<T extends object> = Promise<
	(T & { success: true }) | { success: false; error: string }
>;

export function createProjectMemoryApi() {
	return {
		getSnapshot: (repoRoot: string): IpcInvokeResult<{ snapshot: ProjectMemorySnapshot | null }> =>
			ipcRenderer.invoke('projectMemory:getSnapshot', repoRoot),

		getTaskDetail: (
			repoRoot: string,
			taskId: string
		): IpcInvokeResult<{ detail: ProjectMemoryTaskDetail | null }> =>
			ipcRenderer.invoke('projectMemory:getTaskDetail', repoRoot, taskId),

		validateState: (
			repoRoot: string
		): IpcInvokeResult<{ report: ProjectMemoryStateValidationReport }> =>
			ipcRenderer.invoke('projectMemory:validateState', repoRoot),

		validateExecutionStart: (
			repoRoot: string,
			taskId: string,
			executorId: string,
			currentBranch?: string | null
		): IpcInvokeResult<{ validation: ProjectMemoryExecutionValidationResult }> =>
			ipcRenderer.invoke(
				'projectMemory:validateExecutionStart',
				repoRoot,
				taskId,
				executorId,
				currentBranch
			),

		claimNextExecution: (
			repoRoot: string,
			executorId: string
		): IpcInvokeResult<{ execution: ProjectMemoryExecutionContext | null }> =>
			ipcRenderer.invoke('projectMemory:claimNextExecution', repoRoot, executorId),

		emitWizardTasks: (
			playbook: Playbook,
			options?: { force?: boolean; dryRun?: boolean }
		): IpcInvokeResult<{
			success: true;
			emittedTaskIds: string[];
			tasksFilePath: string;
			partialSuccess?: boolean;
			skippedTaskIds?: string[];
			invalidTaskIds?: string[];
			validationErrors?: WizardTaskEmissionError[];
			diagnostics: {
				taskCount: number;
				repoRoot: string;
				sourceBranch: string;
				bindingPreference: string;
			};
		}> => ipcRenderer.invoke('wizard:emitTasks', playbook, options),
	};
}

export type ProjectMemoryApi = ReturnType<typeof createProjectMemoryApi>;

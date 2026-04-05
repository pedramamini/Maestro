import type {
	ProjectMemoryExecutionContext,
	ProjectMemoryExecutionValidationResult,
	ProjectMemoryStateValidationReport,
	ProjectMemorySnapshot,
	ProjectMemoryTaskDetail,
} from '../../shared/projectMemory';
import type { Playbook, ToolType } from '../../shared/types';
import { createIpcMethod } from './ipcWrapper';

function getProjectMemoryExecutorId(toolType: ToolType): string | null {
	return toolType === 'codex' ? 'codex-main' : null;
}

function normalizeProjectMemoryPath(value: string): string {
	return value.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
}

export const projectMemoryService = {
	async getSnapshot(repoRoot: string): Promise<ProjectMemorySnapshot | null> {
		return createIpcMethod({
			call: async () => {
				const result = await window.maestro.projectMemory.getSnapshot(repoRoot);
				if (!result.success) {
					throw new Error(result.error);
				}
				return result.snapshot;
			},
			errorContext: 'ProjectMemory snapshot',
			defaultValue: null,
		});
	},

	async getTaskDetail(repoRoot: string, taskId: string): Promise<ProjectMemoryTaskDetail | null> {
		return createIpcMethod({
			call: async () => {
				const result = await window.maestro.projectMemory.getTaskDetail(repoRoot, taskId);
				if (!result.success) {
					throw new Error(result.error);
				}
				return result.detail;
			},
			errorContext: 'ProjectMemory task detail',
			defaultValue: null,
		});
	},

	async validateState(repoRoot: string): Promise<ProjectMemoryStateValidationReport | null> {
		return createIpcMethod({
			call: async () => {
				const result = await window.maestro.projectMemory.validateState(repoRoot);
				if (!result.success) {
					throw new Error(result.error);
				}
				return result.report;
			},
			errorContext: 'ProjectMemory validateState',
			defaultValue: null,
		});
	},

	async validateExecutionStart(
		context: ProjectMemoryExecutionContext,
		currentBranch?: string | null
	): Promise<ProjectMemoryExecutionValidationResult> {
		try {
			const result = await window.maestro.projectMemory.validateExecutionStart(
				context.repoRoot,
				context.taskId,
				context.executorId,
				currentBranch
			);
			if (!result.success) {
				throw new Error(result.error);
			}
			return result.validation;
		} catch (error) {
			return {
				ok: false,
				skipped: false,
				taskId: context.taskId,
				executorId: context.executorId,
				reason:
					error instanceof Error
						? `ProjectMemory execution validation failed: ${error.message}`
						: 'ProjectMemory execution validation failed',
				bindingMode: null,
				expectedBranch: null,
				currentBranch: currentBranch ?? null,
			};
		}
	},

	async claimNextExecutionContext(
		repoRoot: string,
		toolType: ToolType
	): Promise<ProjectMemoryExecutionContext | null> {
		const executorId = getProjectMemoryExecutorId(toolType);
		if (!executorId) {
			return null;
		}

		return createIpcMethod({
			call: async () => {
				const result = await window.maestro.projectMemory.claimNextExecution(repoRoot, executorId);
				if (!result.success) {
					throw new Error(result.error);
				}
				return result.execution;
			},
			errorContext: 'ProjectMemory claimNextExecution',
			defaultValue: null,
		});
	},

	async emitWizardTasks(
		playbook: Playbook,
		options?: { force?: boolean; dryRun?: boolean }
	): Promise<
		| {
				success: true;
				emittedTaskIds: string[];
				tasksFilePath: string;
				partialSuccess?: boolean;
				skippedTaskIds?: string[];
				invalidTaskIds?: string[];
				validationErrors?: unknown[];
				diagnostics: {
					taskCount: number;
					repoRoot: string;
					sourceBranch: string;
					bindingPreference: string;
				};
		  }
		| { success: false; error: string }
	> {
		try {
			const result = await window.maestro.projectMemory.emitWizardTasks(playbook, options);
			if (!result.success) {
				return {
					success: false,
					error: result.error,
				};
			}
			return result;
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error
						? `ProjectMemory emitWizardTasks failed: ${error.message}`
						: 'ProjectMemory emitWizardTasks failed',
			};
		}
	},

	async inferExecutionContext(
		repoRoot: string,
		toolType: ToolType
	): Promise<ProjectMemoryExecutionContext | null> {
		const executorId = getProjectMemoryExecutorId(toolType);
		if (!executorId) {
			return null;
		}

		const snapshot = await projectMemoryService.getSnapshot(repoRoot);
		if (!snapshot) {
			return null;
		}
		const validationReport = await projectMemoryService.validateState(repoRoot);
		if (!validationReport?.ok) {
			return null;
		}

		const normalizedRepoRoot = normalizeProjectMemoryPath(repoRoot);
		const candidates = snapshot.tasks.filter(
			(task) =>
				task.status === 'in_progress' &&
				task.executorId === executorId &&
				task.executorState === 'running' &&
				typeof task.worktreePath === 'string' &&
				normalizeProjectMemoryPath(task.worktreePath) === normalizedRepoRoot
		);
		if (candidates.length !== 1) {
			return null;
		}

		return {
			repoRoot,
			taskId: candidates[0].id,
			executorId,
		};
	},
};

import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { createIpcHandler, CreateHandlerOptions } from '../../utils/ipcHandler';
import { logger } from '../../utils/logger';
import {
	getNextTask,
	readProjectMemorySnapshot,
	readProjectMemoryTaskDetail,
	validateTaskSyncProjectMemory,
	validateProjectMemoryExecutionStart,
} from '../../../cli/services/task-sync';
import { emitWizardTasks } from '../../wizard-task-emitter';
import type { Playbook } from '../../../shared/types';

const LOG_CONTEXT = '[ProjectMemory]';

const handlerOpts = (operation: string, logSuccess = true): CreateHandlerOptions => ({
	context: LOG_CONTEXT,
	operation,
	logSuccess,
});

export function registerProjectMemoryHandlers(): void {
	ipcMain.handle(
		'projectMemory:getSnapshot',
		createIpcHandler(handlerOpts('getSnapshot', false), async (repoRoot: string) => ({
			snapshot: readProjectMemorySnapshot(repoRoot),
		}))
	);

	ipcMain.handle(
		'projectMemory:getTaskDetail',
		createIpcHandler(
			handlerOpts('getTaskDetail', false),
			async (repoRoot: string, taskId: string) => ({
				detail: readProjectMemoryTaskDetail(repoRoot, taskId),
			})
		)
	);

	ipcMain.handle(
		'projectMemory:validateState',
		createIpcHandler(handlerOpts('validateState', false), async (repoRoot: string) => ({
			report: validateTaskSyncProjectMemory(repoRoot),
		}))
	);

	ipcMain.handle(
		'projectMemory:validateExecutionStart',
		createIpcHandler(
			handlerOpts('validateExecutionStart', false),
			async (
				repoRoot: string,
				taskId: string,
				executorId: string,
				currentBranch?: string | null
			) => ({
				validation: validateProjectMemoryExecutionStart({
					repoRoot,
					taskId,
					executorId,
					currentBranch,
				}),
			})
		)
	);

	ipcMain.handle(
		'projectMemory:claimNextExecution',
		createIpcHandler(
			handlerOpts('claimNextExecution', false),
			async (repoRoot: string, executorId: string) => {
				const selection = getNextTask({
					repoRoot,
					executorId,
				});

				return {
					execution: selection
						? {
								repoRoot,
								taskId: selection.task.id,
								executorId,
							}
						: null,
				};
			}
		)
	);

	ipcMain.handle(
		'wizard:emitTasks',
		createIpcHandler(
			handlerOpts('emitWizardTasks', true),
			async (playbook: Playbook, options?: { force?: boolean; dryRun?: boolean }) => {
				const dryRun = options?.dryRun || false;

				// Telemetry: emission start
				logger.info(`Wizard task emission started for playbook: ${playbook.name}`, LOG_CONTEXT, {
					taskCount: playbook.taskGraph?.nodes.length || 0,
					dryRun,
					force: options?.force || false,
				});

				// Safety check: verify playbook has required metadata
				if (!playbook.projectMemoryBindingIntent) {
					const error = 'Playbook missing projectMemoryBindingIntent metadata';
					logger.error(`Wizard task emission failed: ${error}`, LOG_CONTEXT);
					throw new Error(error);
				}

				const repoRoot = playbook.projectMemoryBindingIntent.repoRoot;

				// Safety check: verify repoRoot is provided and appears valid
				if (!repoRoot || typeof repoRoot !== 'string') {
					const error = 'Invalid or missing repoRoot in projectMemoryBindingIntent';
					logger.error(`Wizard task emission failed: ${error}`, LOG_CONTEXT, {
						playbookName: playbook.name,
					});
					throw new Error(error);
				}

				// Dry runs must stay side-effect free. Only verify the repo root exists.
				if (dryRun) {
					try {
						const repoRootStat = fs.statSync(repoRoot);
						if (!repoRootStat.isDirectory()) {
							throw new Error('Repo root is not a directory');
						}
					} catch (error) {
						const errorMessage = error instanceof Error ? error.message : String(error);
						logger.error(`Wizard task dry run failed: Invalid repo root ${repoRoot}`, LOG_CONTEXT, {
							error: errorMessage,
							playbookName: playbook.name,
						});
						throw new Error(`Invalid repo root for dry run: ${repoRoot}. ${errorMessage}`);
					}
				} else {
					// Safety check: verify caller has permission to write to target repo.
					const tasksDir = path.join(repoRoot, 'project_memory', 'tasks');

					try {
						// Check if directory exists or can be created
						if (!fs.existsSync(tasksDir)) {
							fs.mkdirSync(tasksDir, { recursive: true });
						}

						// Test write permission by checking directory access
						fs.accessSync(tasksDir, fs.constants.W_OK);
					} catch (error) {
						const errorMessage = error instanceof Error ? error.message : String(error);
						logger.error(
							`Wizard task emission failed: Cannot write to repo root ${repoRoot}`,
							LOG_CONTEXT,
							{ error: errorMessage, playbookName: playbook.name }
						);
						throw new Error(`Permission denied: Cannot write to ${repoRoot}. ${errorMessage}`);
					}
				}

				// Emit tasks
				const result = emitWizardTasks(playbook, options ?? {});

				if (!result.success) {
					logger.error(`Wizard task emission failed for playbook: ${playbook.name}`, LOG_CONTEXT, {
						error: result.error,
					});
					throw new Error(result.error || 'Failed to emit Wizard tasks');
				}

				// Telemetry: emission success
				logger.info(`Wizard task emission succeeded for playbook: ${playbook.name}`, LOG_CONTEXT, {
					emittedTaskCount: result.diagnostics?.taskCount || 0,
					emittedTaskIds: result.emittedTaskIds,
					tasksFilePath: result.tasksFilePath,
					repoRoot: result.diagnostics?.repoRoot,
				});

				return {
					success: true,
					emittedTaskIds: result.emittedTaskIds,
					tasksFilePath: result.tasksFilePath,
					partialSuccess: result.partialSuccess,
					skippedTaskIds: result.skippedTaskIds,
					invalidTaskIds: result.invalidTaskIds,
					validationErrors: result.validationErrors,
					diagnostics: result.diagnostics,
				};
			}
		)
	);
}

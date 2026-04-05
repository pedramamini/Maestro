import {
	cleanupStaleTaskSyncState,
	completeTask,
	failTask,
	getNextTask,
	heartbeatTask,
	lockTask,
	readProjectMemorySnapshot,
	readProjectMemoryTaskDetail,
	readTaskSyncLocks,
	rebindTaskSyncState,
	validateTaskSyncProjectMemory,
	releaseTask,
	type TaskSyncContext,
} from '../services/task-sync';

interface TaskSyncCommandOptions {
	repoRoot?: string;
	executor?: string;
	json?: boolean;
}

function resolveContext(options: TaskSyncCommandOptions): TaskSyncContext {
	return {
		repoRoot: options.repoRoot ?? process.cwd(),
		executorId: options.executor ?? process.env.MAESTRO_TASK_EXECUTOR ?? 'codex-main',
	};
}

function printResult(result: unknown, options: TaskSyncCommandOptions): void {
	if (options.json !== false) {
		console.log(JSON.stringify(result, null, 2));
		return;
	}
	console.log(result);
}

function handleError(error: unknown): never {
	const message = error instanceof Error ? error.message : 'Unknown task-sync error';
	console.error(JSON.stringify({ error: message }, null, 2));
	process.exit(1);
}

export function nextTaskCommand(options: TaskSyncCommandOptions): void {
	try {
		const result = getNextTask(resolveContext(options));
		printResult(result ?? { task: null }, options);
	} catch (error) {
		handleError(error);
	}
}

export function snapshotTaskCommand(options: TaskSyncCommandOptions): void {
	try {
		printResult(
			readProjectMemorySnapshot(resolveContext(options).repoRoot) ?? { snapshot: null },
			options
		);
	} catch (error) {
		handleError(error);
	}
}

export function showTaskCommand(taskId: string, options: TaskSyncCommandOptions): void {
	try {
		printResult(
			readProjectMemoryTaskDetail(resolveContext(options).repoRoot, taskId) ?? { detail: null },
			options
		);
	} catch (error) {
		handleError(error);
	}
}

export function lockTaskCommand(taskId: string, options: TaskSyncCommandOptions): void {
	try {
		printResult(lockTask(resolveContext(options), taskId), options);
	} catch (error) {
		handleError(error);
	}
}

export function heartbeatTaskCommand(taskId: string, options: TaskSyncCommandOptions): void {
	try {
		printResult(heartbeatTask(resolveContext(options), taskId), options);
	} catch (error) {
		handleError(error);
	}
}

export function completeTaskCommand(taskId: string, options: TaskSyncCommandOptions): void {
	try {
		printResult(completeTask(resolveContext(options), taskId), options);
	} catch (error) {
		handleError(error);
	}
}

export function failTaskCommand(taskId: string, options: TaskSyncCommandOptions): void {
	try {
		printResult(failTask(resolveContext(options), taskId), options);
	} catch (error) {
		handleError(error);
	}
}

export function releaseTaskCommand(taskId: string, options: TaskSyncCommandOptions): void {
	try {
		printResult(releaseTask(resolveContext(options), taskId), options);
	} catch (error) {
		handleError(error);
	}
}

export function locksTaskCommand(options: TaskSyncCommandOptions): void {
	try {
		printResult(readTaskSyncLocks(resolveContext(options).repoRoot), options);
	} catch (error) {
		handleError(error);
	}
}

export function validateTaskCommand(options: TaskSyncCommandOptions): void {
	try {
		printResult(validateTaskSyncProjectMemory(resolveContext(options).repoRoot), options);
	} catch (error) {
		handleError(error);
	}
}

export function cleanupStaleTaskCommand(options: TaskSyncCommandOptions): void {
	try {
		printResult(cleanupStaleTaskSyncState(resolveContext(options).repoRoot), options);
	} catch (error) {
		handleError(error);
	}
}

export function rebindTaskCommand(taskId: string, options: TaskSyncCommandOptions): void {
	try {
		printResult(rebindTaskSyncState(resolveContext(options).repoRoot, taskId), options);
	} catch (error) {
		handleError(error);
	}
}

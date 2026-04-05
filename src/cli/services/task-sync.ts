import * as fs from 'fs';
import * as path from 'path';
import type {
	ProjectMemoryExecutionContext,
	ProjectMemoryExecutionValidationResult,
	ProjectMemorySnapshot,
	ProjectMemoryTaskDetail,
	ProjectMemoryTaskSummary,
} from '../../shared/projectMemory';

type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked';
type ExecutionMode = 'shared-serialized' | 'isolated' | 'either';
type BindingPreference =
	| 'shared-branch-serialized'
	| 'prefer-shared-branch-serialized'
	| 'create-or-reuse-isolated'
	| 'reuse-existing-only'
	| 'blocked-until-bound';
type BindingMode = 'shared-branch-serialized' | 'isolated-worktree';
type RuntimeState = 'pending' | 'running' | 'blocked' | 'completed' | 'failed' | 'stale';

interface TaskBindingRequest {
	policy_version: string;
	binding_preference: BindingPreference;
	repo_root: string;
	source_branch: string;
	branch_slug?: string;
	shared_checkout_allowed?: boolean;
	reuse_existing_binding?: boolean;
	allow_rebind_if_stale?: boolean;
}

interface ProjectTask {
	id: string;
	title: string;
	status: TaskStatus;
	depends_on?: string[];
	goal?: string;
	execution_mode?: ExecutionMode;
	worktree_binding_request?: TaskBindingRequest;
}

interface TaskDefaults {
	repo_root?: string;
	source_branch?: string;
	execution_mode?: ExecutionMode;
	binding_preference?: BindingPreference;
	shared_checkout_allowed?: boolean;
	reuse_existing_binding?: boolean;
	allow_rebind_if_stale?: boolean;
}

interface TasksFile {
	version: string;
	project_id: string;
	project_name?: string;
	source_plan?: string;
	defaults?: TaskDefaults;
	tasks: ProjectTask[];
}

export interface TaskLockRecord {
	owner: string;
	acquired_at: string;
	expires_at: string;
}

export interface TaskBindingRecord {
	task_id: string;
	project_id: string;
	binding_status: 'assigned';
	binding_mode: BindingMode;
	worktree_id: string;
	worktree_path: string;
	branch_name: string;
	repo_root: string;
	source_branch: string;
	assigned_agent: string;
	shared_checkout_allowed: boolean;
	created_at: string;
	updated_at: string;
	resolver_reason: string;
	policy_version: string;
}

export interface TaskRuntimeRecord {
	task_id: string;
	executor_state: RuntimeState;
	executor_id: string;
	started_at: string | null;
	last_heartbeat_at: string | null;
	completed_at: string | null;
	result: 'success' | 'failed' | 'released' | 'timeout' | null;
	/** Duration in milliseconds between started_at and completed_at */
	duration_ms: number | null;
	/** Agent type used for execution (e.g., 'claude-code', 'codex') */
	agent_type: string | null;
	/** Brief summary of the execution result */
	result_summary: string | null;
	/** Error message if the task failed */
	error_message: string | null;
	/** Stack trace if available when task failed */
	error_stack: string | null;
	/** Whether the task will be retried */
	will_retry: boolean;
}

interface WorktreeRecord {
	worktree_id: string;
	repo_root: string;
	worktree_path: string;
	branch_name: string;
	status: 'active' | 'idle' | 'blocked' | 'stale' | 'quarantined' | 'released';
	bound_task_id: string;
	created_at: string;
	updated_at: string;
}

interface TaskSyncPaths {
	projectMemoryDir: string;
	tasksFile: string;
	bindingsDir: string;
	runtimeDir: string;
	worktreesDir: string;
	taskLocksDir: string;
	worktreeLocksDir: string;
}

export interface TaskSyncContext {
	repoRoot: string;
	executorId: string;
	now?: Date;
	lockTtlMs?: number;
}

export interface TaskSyncSelection {
	task: ProjectTask;
	binding: TaskBindingRecord;
	runtime: TaskRuntimeRecord;
	taskLock: TaskLockRecord;
	worktreeLock: TaskLockRecord;
}

export interface TaskSyncMutation {
	task: ProjectTask;
	runtime: TaskRuntimeRecord;
}

export interface TaskSyncLocksSnapshot {
	taskLocks: Array<{
		taskId: string;
		lock: TaskLockRecord;
		isExpired: boolean;
	}>;
	worktreeLocks: Array<{
		worktreeId: string;
		lock: TaskLockRecord;
		isExpired: boolean;
	}>;
}

export interface TaskSyncValidationReport {
	ok: boolean;
	projectId: string | null;
	taskCount: number;
	bindingCount: number;
	runtimeCount: number;
	taskLockCount: number;
	worktreeLockCount: number;
	expiredTaskLockCount: number;
	expiredWorktreeLockCount: number;
	issues: string[];
}

export function validateProjectMemoryExecutionStart(
	context: ProjectMemoryExecutionContext & { currentBranch?: string | null }
): ProjectMemoryExecutionValidationResult {
	const { repoRoot, taskId, executorId, currentBranch = null } = context;
	if (!repoRoot || !taskId || !executorId) {
		return {
			ok: true,
			skipped: true,
			taskId: taskId || null,
			executorId: executorId || null,
			reason: null,
			bindingMode: null,
			expectedBranch: null,
			currentBranch,
		};
	}

	const now = new Date();
	const paths = getPaths(repoRoot);
	ensureProjectMemoryDirs(paths);

	if (!fs.existsSync(paths.tasksFile)) {
		return {
			ok: false,
			skipped: false,
			taskId,
			executorId,
			reason: `project_memory tasks.json not found: ${paths.tasksFile}`,
			bindingMode: null,
			expectedBranch: null,
			currentBranch,
		};
	}

	const binding = readOptionalJsonFile<TaskBindingRecord>(getBindingPath(paths, taskId));
	if (!binding) {
		return {
			ok: false,
			skipped: false,
			taskId,
			executorId,
			reason: `Task binding not found for ${taskId}`,
			bindingMode: null,
			expectedBranch: null,
			currentBranch,
		};
	}

	const taskLock = readOptionalJsonFile<TaskLockRecord>(getTaskLockPath(paths, taskId));
	if (!taskLock || isLockExpired(taskLock, now)) {
		return {
			ok: false,
			skipped: false,
			taskId,
			executorId,
			reason: `Task lock is missing or expired for ${taskId}`,
			bindingMode: binding.binding_mode,
			expectedBranch: binding.branch_name,
			currentBranch,
		};
	}
	if (taskLock.owner !== executorId) {
		return {
			ok: false,
			skipped: false,
			taskId,
			executorId,
			reason: `Task lock owner mismatch: expected ${executorId}, found ${taskLock.owner}`,
			bindingMode: binding.binding_mode,
			expectedBranch: binding.branch_name,
			currentBranch,
		};
	}

	const worktreeLock = readOptionalJsonFile<TaskLockRecord>(
		getWorktreeLockPath(paths, binding.worktree_id)
	);
	if (!worktreeLock || isLockExpired(worktreeLock, now)) {
		return {
			ok: false,
			skipped: false,
			taskId,
			executorId,
			reason: `Worktree lock is missing or expired for ${binding.worktree_id}`,
			bindingMode: binding.binding_mode,
			expectedBranch: binding.branch_name,
			currentBranch,
		};
	}
	if (worktreeLock.owner !== executorId) {
		return {
			ok: false,
			skipped: false,
			taskId,
			executorId,
			reason: `Worktree lock owner mismatch: expected ${executorId}, found ${worktreeLock.owner}`,
			bindingMode: binding.binding_mode,
			expectedBranch: binding.branch_name,
			currentBranch,
		};
	}

	const runtime = readOptionalJsonFile<TaskRuntimeRecord>(getRuntimePath(paths, taskId));
	if (!runtime) {
		return {
			ok: false,
			skipped: false,
			taskId,
			executorId,
			reason: `Runtime record not found for ${taskId}`,
			bindingMode: binding.binding_mode,
			expectedBranch: binding.branch_name,
			currentBranch,
		};
	}
	if (runtime.executor_id !== executorId) {
		return {
			ok: false,
			skipped: false,
			taskId,
			executorId,
			reason: `Runtime owner mismatch: expected ${executorId}, found ${runtime.executor_id}`,
			bindingMode: binding.binding_mode,
			expectedBranch: binding.branch_name,
			currentBranch,
		};
	}

	if (!currentBranch) {
		return {
			ok: false,
			skipped: false,
			taskId,
			executorId,
			reason: `Current branch could not be determined for ${taskId}`,
			bindingMode: binding.binding_mode,
			expectedBranch: binding.branch_name,
			currentBranch,
		};
	}

	if (binding.branch_name !== currentBranch) {
		return {
			ok: false,
			skipped: false,
			taskId,
			executorId,
			reason: `Branch mismatch: expected ${binding.branch_name}, found ${currentBranch}`,
			bindingMode: binding.binding_mode,
			expectedBranch: binding.branch_name,
			currentBranch,
		};
	}

	return {
		ok: true,
		skipped: false,
		taskId,
		executorId,
		reason: null,
		bindingMode: binding.binding_mode,
		expectedBranch: binding.branch_name,
		currentBranch,
	};
}

export interface TaskSyncCleanupReport {
	ok: boolean;
	projectId: string | null;
	cleanedTaskLocks: string[];
	cleanedWorktreeLocks: string[];
	staleTasks: string[];
	staleRuntimes: string[];
	staleWorktrees: string[];
}

export interface TaskSyncRebindReport {
	ok: boolean;
	projectId: string;
	taskId: string;
	taskStatus: TaskStatus;
	clearedBinding: boolean;
	clearedRuntime: boolean;
	clearedTaskLock: boolean;
	clearedWorktreeLock: boolean;
	clearedWorktreeRecord: boolean;
}

/** Status values that can be set via updateTaskStatus */
export type TaskExecutionStatus = 'running' | 'completed' | 'failed' | 'timeout';

/** Valid status transitions for updateTaskStatus */
const VALID_STATUS_TRANSITIONS: Record<TaskStatus, Set<TaskExecutionStatus>> = {
	pending: new Set<TaskExecutionStatus>(['running']),
	in_progress: new Set<TaskExecutionStatus>(['running', 'completed', 'failed', 'timeout']),
	completed: new Set<TaskExecutionStatus>(), // Terminal state
	failed: new Set<TaskExecutionStatus>(['running']), // Can retry
	blocked: new Set<TaskExecutionStatus>(), // Cannot transition directly
};

/**
 * Extended runtime metadata for task execution
 */
export interface TaskExecutionMetadata {
	/** Agent type used for execution (e.g., 'claude-code', 'codex') */
	agentType?: string;
	/** Brief summary of the execution result */
	resultSummary?: string;
	/** Error message if the task failed */
	errorMessage?: string;
	/** Stack trace if available when task failed */
	errorStack?: string;
	/** Whether the task will be retried */
	willRetry?: boolean;
}

/**
 * Result of a task status update operation
 */
export interface TaskStatusUpdateResult {
	ok: boolean;
	taskId: string;
	previousStatus: TaskStatus;
	newStatus: TaskStatus;
	runtime: TaskRuntimeRecord;
}

/**
 * Validate if a status transition is allowed
 */
export function isValidStatusTransition(
	currentStatus: TaskStatus,
	newExecutionStatus: TaskExecutionStatus
): boolean {
	const allowedTransitions = VALID_STATUS_TRANSITIONS[currentStatus];
	if (!allowedTransitions) {
		return false;
	}
	return allowedTransitions.has(newExecutionStatus);
}

/**
 * Map execution status to task status
 */
function executionStatusToTaskStatus(status: TaskExecutionStatus): TaskStatus {
	switch (status) {
		case 'running':
			return 'in_progress';
		case 'completed':
			return 'completed';
		case 'failed':
			return 'failed';
		case 'timeout':
			return 'failed';
	}
}

/**
 * Map execution status to runtime state
 */
function executionStatusToRuntimeState(status: TaskExecutionStatus): RuntimeState {
	switch (status) {
		case 'running':
			return 'running';
		case 'completed':
			return 'completed';
		case 'failed':
			return 'failed';
		case 'timeout':
			return 'failed';
	}
}

const DEFAULT_LOCK_TTL_MS = 15 * 60 * 1000;

function getPaths(repoRoot: string): TaskSyncPaths {
	const projectMemoryDir = path.join(repoRoot, 'project_memory');
	return {
		projectMemoryDir,
		tasksFile: path.join(projectMemoryDir, 'tasks', 'tasks.json'),
		bindingsDir: path.join(projectMemoryDir, 'bindings'),
		runtimeDir: path.join(projectMemoryDir, 'runtime'),
		worktreesDir: path.join(projectMemoryDir, 'worktrees'),
		taskLocksDir: path.join(projectMemoryDir, 'locks', 'tasks'),
		worktreeLocksDir: path.join(projectMemoryDir, 'locks', 'worktrees'),
	};
}

function ensureProjectMemoryDirs(paths: TaskSyncPaths): void {
	for (const dir of [
		path.dirname(paths.tasksFile),
		paths.bindingsDir,
		paths.runtimeDir,
		paths.worktreesDir,
		paths.taskLocksDir,
		paths.worktreeLocksDir,
	]) {
		fs.mkdirSync(dir, { recursive: true });
	}
}

function readJsonFile<T>(filePath: string): T {
	return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

function readOptionalJsonFile<T>(filePath: string): T | null {
	try {
		return readJsonFile<T>(filePath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return null;
		}
		throw error;
	}
}

function readJsonFiles<T>(dirPath: string): Array<{ id: string; value: T }> {
	if (!fs.existsSync(dirPath)) {
		return [];
	}

	return fs
		.readdirSync(dirPath)
		.filter((name) => name.endsWith('.json'))
		.map((name) => ({
			id: name.slice(0, -'.json'.length),
			value: readJsonFile<T>(path.join(dirPath, name)),
		}));
}

function writeJsonFile(filePath: string, value: unknown): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

function deleteJsonFile(filePath: string): void {
	try {
		fs.unlinkSync(filePath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw error;
		}
	}
}

function toIsoString(now: Date): string {
	return now.toISOString();
}

function getLockTtlMs(context: TaskSyncContext): number {
	return context.lockTtlMs ?? DEFAULT_LOCK_TTL_MS;
}

function getNow(context: TaskSyncContext): Date {
	return context.now ?? new Date();
}

function readTasks(context: TaskSyncContext): { paths: TaskSyncPaths; data: TasksFile } {
	const paths = getPaths(context.repoRoot);
	ensureProjectMemoryDirs(paths);
	if (!fs.existsSync(paths.tasksFile)) {
		throw new Error(`tasks.json not found: ${paths.tasksFile}`);
	}
	return { paths, data: readJsonFile<TasksFile>(paths.tasksFile) };
}

function writeTasks(paths: TaskSyncPaths, data: TasksFile): void {
	writeJsonFile(paths.tasksFile, data);
}

function getTaskIndex(data: TasksFile, taskId: string): number {
	return data.tasks.findIndex((task) => task.id === taskId);
}

function requireTask(data: TasksFile, taskId: string): ProjectTask {
	const task = data.tasks.find((entry) => entry.id === taskId);
	if (!task) {
		throw new Error(`Task not found: ${taskId}`);
	}
	return task;
}

function getTaskLockPath(paths: TaskSyncPaths, taskId: string): string {
	return path.join(paths.taskLocksDir, `${taskId}.json`);
}

function getWorktreeLockPath(paths: TaskSyncPaths, worktreeId: string): string {
	return path.join(paths.worktreeLocksDir, `${worktreeId}.json`);
}

function getBindingPath(paths: TaskSyncPaths, taskId: string): string {
	return path.join(paths.bindingsDir, `${taskId}.json`);
}

function getRuntimePath(paths: TaskSyncPaths, taskId: string): string {
	return path.join(paths.runtimeDir, `${taskId}.json`);
}

function getWorktreePath(paths: TaskSyncPaths, worktreeId: string): string {
	return path.join(paths.worktreesDir, `${worktreeId}.json`);
}

function isLockExpired(lock: TaskLockRecord | null, now: Date): boolean {
	return !lock || new Date(lock.expires_at).getTime() <= now.getTime();
}

function hasLiveLock(lock: TaskLockRecord | null, now: Date): boolean {
	return !!lock && !isLockExpired(lock, now);
}

function assertLockOwner(
	lock: TaskLockRecord | null,
	owner: string,
	resource: string,
	now: Date
): void {
	if (!lock || isLockExpired(lock, now)) {
		throw new Error(`${resource} lock is missing or expired`);
	}
	if (lock.owner !== owner) {
		throw new Error(`${resource} lock is owned by ${lock.owner}`);
	}
}

function taskDependenciesSatisfied(task: ProjectTask, taskMap: Map<string, ProjectTask>): boolean {
	return (task.depends_on ?? []).every(
		(dependencyId) => taskMap.get(dependencyId)?.status === 'completed'
	);
}

function canClaimWorktree(paths: TaskSyncPaths, binding: TaskBindingRecord, now: Date): boolean {
	const worktreeLock = readOptionalJsonFile<TaskLockRecord>(
		getWorktreeLockPath(paths, binding.worktree_id)
	);
	return !hasLiveLock(worktreeLock, now);
}

function assertWorktreeClaimable(
	paths: TaskSyncPaths,
	binding: TaskBindingRecord,
	now: Date
): void {
	if (!canClaimWorktree(paths, binding, now)) {
		throw new Error(`Worktree is already locked: ${binding.worktree_id}`);
	}
}

function resolveTaskBinding(
	context: TaskSyncContext,
	task: ProjectTask,
	defaults: TaskDefaults,
	projectId: string,
	existingBinding: TaskBindingRecord | null
): TaskBindingRecord {
	if (existingBinding) {
		return {
			...existingBinding,
			updated_at: toIsoString(getNow(context)),
			assigned_agent: context.executorId,
		};
	}

	const now = getNow(context);
	const request = task.worktree_binding_request;
	const sourceBranch = request?.source_branch ?? defaults.source_branch ?? 'main';
	const branchSlug = request?.branch_slug ?? task.id.toLowerCase();
	const bindingPreference =
		request?.binding_preference ?? defaults.binding_preference ?? 'shared-branch-serialized';
	const bindingMode: BindingMode =
		bindingPreference === 'create-or-reuse-isolated' || task.execution_mode === 'isolated'
			? 'isolated-worktree'
			: 'shared-branch-serialized';
	const sharedCheckoutAllowed =
		request?.shared_checkout_allowed ?? defaults.shared_checkout_allowed ?? true;
	const worktreeId =
		bindingMode === 'isolated-worktree' ? `wt-${task.id.toLowerCase()}` : 'shared-main';
	const worktreePath =
		bindingMode === 'isolated-worktree'
			? path.join(context.repoRoot, '.worktrees', `${task.id.toLowerCase()}-${branchSlug}`)
			: context.repoRoot;
	const branchName =
		bindingMode === 'isolated-worktree'
			? `task/${task.id.toLowerCase()}-${branchSlug}`
			: sourceBranch;

	return {
		task_id: task.id,
		project_id: projectId,
		binding_status: 'assigned',
		binding_mode: bindingMode,
		worktree_id: worktreeId,
		worktree_path: worktreePath,
		branch_name: branchName,
		repo_root: context.repoRoot,
		source_branch: sourceBranch,
		assigned_agent: context.executorId,
		shared_checkout_allowed:
			bindingMode === 'shared-branch-serialized' ? true : sharedCheckoutAllowed,
		created_at: toIsoString(now),
		updated_at: toIsoString(now),
		resolver_reason:
			bindingMode === 'shared-branch-serialized'
				? 'default shared serialized path selected'
				: 'isolated worktree selected from task binding request',
		policy_version: request?.policy_version ?? '2026-04-04',
	};
}

function upsertWorktreeRecord(paths: TaskSyncPaths, binding: TaskBindingRecord, now: Date): void {
	const worktreeFile = getWorktreePath(paths, binding.worktree_id);
	const existing = readOptionalJsonFile<WorktreeRecord>(worktreeFile);
	const record: WorktreeRecord = {
		worktree_id: binding.worktree_id,
		repo_root: binding.repo_root,
		worktree_path: binding.worktree_path,
		branch_name: binding.branch_name,
		status: 'active',
		bound_task_id: binding.task_id,
		created_at: existing?.created_at ?? toIsoString(now),
		updated_at: toIsoString(now),
	};
	writeJsonFile(worktreeFile, record);
}

function acquireLock(filePath: string, owner: string, now: Date, ttlMs: number): TaskLockRecord {
	const existing = readOptionalJsonFile<TaskLockRecord>(filePath);
	if (existing && !isLockExpired(existing, now) && existing.owner !== owner) {
		throw new Error(`Lock already owned by ${existing.owner}`);
	}

	const record: TaskLockRecord = {
		owner,
		acquired_at: toIsoString(now),
		expires_at: new Date(now.getTime() + ttlMs).toISOString(),
	};
	writeJsonFile(filePath, record);
	return record;
}

function releaseLockIfOwned(filePath: string, owner: string, now: Date): void {
	const existing = readOptionalJsonFile<TaskLockRecord>(filePath);
	if (!existing) {
		return;
	}
	assertLockOwner(existing, owner, path.basename(filePath), now);
	deleteJsonFile(filePath);
}

function clearFinishedBindingState(paths: TaskSyncPaths, binding: TaskBindingRecord): void {
	deleteJsonFile(getBindingPath(paths, binding.task_id));
	const worktreePath = getWorktreePath(paths, binding.worktree_id);
	const worktree = readOptionalJsonFile<WorktreeRecord>(worktreePath);
	if (worktree?.bound_task_id === binding.task_id) {
		deleteJsonFile(worktreePath);
	}
}

function updateTaskStatus(
	paths: TaskSyncPaths,
	data: TasksFile,
	taskId: string,
	status: TaskStatus
): ProjectTask {
	const index = getTaskIndex(data, taskId);
	if (index < 0) {
		throw new Error(`Task not found: ${taskId}`);
	}
	const updated: ProjectTask = {
		...data.tasks[index],
		status,
	};
	data.tasks[index] = updated;
	writeTasks(paths, data);
	return updated;
}

function writeRuntime(paths: TaskSyncPaths, runtime: TaskRuntimeRecord): void {
	writeJsonFile(getRuntimePath(paths, runtime.task_id), runtime);
}

function requireRuntime(paths: TaskSyncPaths, taskId: string): TaskRuntimeRecord {
	const runtime = readOptionalJsonFile<TaskRuntimeRecord>(getRuntimePath(paths, taskId));
	if (!runtime) {
		throw new Error(`Runtime record not found for task: ${taskId}`);
	}
	return runtime;
}

function requireBinding(paths: TaskSyncPaths, taskId: string): TaskBindingRecord {
	const binding = readOptionalJsonFile<TaskBindingRecord>(getBindingPath(paths, taskId));
	if (!binding) {
		throw new Error(`Binding record not found for task: ${taskId}`);
	}
	return binding;
}

function buildSelection(
	context: TaskSyncContext,
	paths: TaskSyncPaths,
	data: TasksFile,
	task: ProjectTask
): TaskSyncSelection {
	const now = getNow(context);
	const existingBinding = readOptionalJsonFile<TaskBindingRecord>(getBindingPath(paths, task.id));
	const binding = resolveTaskBinding(
		context,
		task,
		data.defaults ?? {},
		data.project_id,
		existingBinding
	);
	assertWorktreeClaimable(paths, binding, now);
	writeJsonFile(getBindingPath(paths, task.id), binding);
	upsertWorktreeRecord(paths, binding, now);
	const taskLock = acquireLock(
		getTaskLockPath(paths, task.id),
		context.executorId,
		now,
		getLockTtlMs(context)
	);
	const worktreeLock = acquireLock(
		getWorktreeLockPath(paths, binding.worktree_id),
		context.executorId,
		now,
		getLockTtlMs(context)
	);
	const runtime: TaskRuntimeRecord = {
		task_id: task.id,
		executor_state: 'running',
		executor_id: context.executorId,
		started_at: toIsoString(now),
		last_heartbeat_at: toIsoString(now),
		completed_at: null,
		result: null,
		duration_ms: null,
		agent_type: null,
		result_summary: null,
		error_message: null,
		error_stack: null,
		will_retry: false,
	};
	writeRuntime(paths, runtime);
	const updatedTask = updateTaskStatus(paths, data, task.id, 'in_progress');
	return {
		task: updatedTask,
		binding,
		runtime,
		taskLock,
		worktreeLock,
	};
}

export function getNextTask(context: TaskSyncContext): TaskSyncSelection | null {
	const { paths, data } = readTasks(context);
	const taskMap = new Map(data.tasks.map((task) => [task.id, task]));
	const now = getNow(context);

	for (const task of data.tasks) {
		if (task.status !== 'pending') {
			continue;
		}
		if (!taskDependenciesSatisfied(task, taskMap)) {
			continue;
		}
		const existingTaskLock = readOptionalJsonFile<TaskLockRecord>(getTaskLockPath(paths, task.id));
		if (
			existingTaskLock &&
			!isLockExpired(existingTaskLock, now) &&
			existingTaskLock.owner !== context.executorId
		) {
			continue;
		}
		const existingBinding = readOptionalJsonFile<TaskBindingRecord>(getBindingPath(paths, task.id));
		const binding = resolveTaskBinding(
			context,
			task,
			data.defaults ?? {},
			data.project_id,
			existingBinding
		);
		if (!canClaimWorktree(paths, binding, now)) {
			continue;
		}
		return buildSelection(context, paths, data, task);
	}

	return null;
}

export function lockTask(context: TaskSyncContext, taskId: string): TaskSyncSelection {
	const { paths, data } = readTasks(context);
	const now = getNow(context);
	const task = requireTask(data, taskId);
	const taskMap = new Map(data.tasks.map((entry) => [entry.id, entry]));
	if (!taskDependenciesSatisfied(task, taskMap)) {
		throw new Error(`Task dependencies are not complete: ${task.id}`);
	}
	if (task.status === 'completed') {
		throw new Error(`Task is already completed: ${task.id}`);
	}
	const existingBinding = readOptionalJsonFile<TaskBindingRecord>(getBindingPath(paths, task.id));
	const binding = resolveTaskBinding(
		context,
		task,
		data.defaults ?? {},
		data.project_id,
		existingBinding
	);
	assertWorktreeClaimable(paths, binding, now);
	return buildSelection(context, paths, data, task);
}

export function heartbeatTask(context: TaskSyncContext, taskId: string): TaskSyncMutation {
	const { paths, data } = readTasks(context);
	const now = getNow(context);
	const binding = requireBinding(paths, taskId);
	assertLockOwner(
		readOptionalJsonFile(getTaskLockPath(paths, taskId)),
		context.executorId,
		'task',
		now
	);
	assertLockOwner(
		readOptionalJsonFile(getWorktreeLockPath(paths, binding.worktree_id)),
		context.executorId,
		'worktree',
		now
	);
	const runtime = requireRuntime(paths, taskId);
	if (runtime.executor_id !== context.executorId) {
		throw new Error(`Runtime is owned by ${runtime.executor_id}`);
	}
	acquireLock(getTaskLockPath(paths, taskId), context.executorId, now, getLockTtlMs(context));
	acquireLock(
		getWorktreeLockPath(paths, binding.worktree_id),
		context.executorId,
		now,
		getLockTtlMs(context)
	);
	const updatedRuntime: TaskRuntimeRecord = {
		...runtime,
		executor_state: 'running',
		last_heartbeat_at: toIsoString(now),
	};
	writeRuntime(paths, updatedRuntime);
	return {
		task: requireTask(data, taskId),
		runtime: updatedRuntime,
	};
}

function finishTask(
	context: TaskSyncContext,
	taskId: string,
	status: Extract<TaskStatus, 'completed' | 'failed' | 'pending'>,
	result: TaskRuntimeRecord['result']
): TaskSyncMutation {
	const { paths, data } = readTasks(context);
	const now = getNow(context);
	const binding = requireBinding(paths, taskId);
	assertLockOwner(
		readOptionalJsonFile(getTaskLockPath(paths, taskId)),
		context.executorId,
		'task',
		now
	);
	assertLockOwner(
		readOptionalJsonFile(getWorktreeLockPath(paths, binding.worktree_id)),
		context.executorId,
		'worktree',
		now
	);
	const runtime = requireRuntime(paths, taskId);
	if (runtime.executor_id !== context.executorId) {
		throw new Error(`Runtime is owned by ${runtime.executor_id}`);
	}
	const completedAt = status === 'pending' ? null : toIsoString(now);
	const durationMs =
		runtime.started_at && completedAt
			? new Date(completedAt).getTime() - new Date(runtime.started_at).getTime()
			: null;
	const updatedRuntime: TaskRuntimeRecord = {
		...runtime,
		executor_state:
			status === 'pending' ? 'pending' : status === 'completed' ? 'completed' : 'failed',
		last_heartbeat_at: toIsoString(now),
		completed_at: completedAt,
		result,
		duration_ms: durationMs,
	};
	writeRuntime(paths, updatedRuntime);
	const updatedTask = updateTaskStatus(paths, data, taskId, status);
	releaseLockIfOwned(getTaskLockPath(paths, taskId), context.executorId, now);
	releaseLockIfOwned(getWorktreeLockPath(paths, binding.worktree_id), context.executorId, now);
	clearFinishedBindingState(paths, binding);
	return {
		task: updatedTask,
		runtime: updatedRuntime,
	};
}

export function completeTask(context: TaskSyncContext, taskId: string): TaskSyncMutation {
	return finishTask(context, taskId, 'completed', 'success');
}

export function failTask(context: TaskSyncContext, taskId: string): TaskSyncMutation {
	return finishTask(context, taskId, 'failed', 'failed');
}

export function releaseTask(context: TaskSyncContext, taskId: string): TaskSyncMutation {
	return finishTask(context, taskId, 'pending', 'released');
}

/**
 * Update task status from the executor during execution.
 * This is the primary interface for bidirectional sync from executor to project memory.
 *
 * @param context - Task sync context with repo root and executor ID
 * @param taskId - The task ID to update
 * @param status - The new execution status (running, completed, failed, timeout)
 * @param metadata - Optional execution metadata (agent type, result summary, error details)
 * @returns Result of the status update operation
 * @throws Error if status transition is invalid or task/runtime not found
 */
export function updateTaskStatusFromExecutor(
	context: TaskSyncContext,
	taskId: string,
	status: TaskExecutionStatus,
	metadata?: TaskExecutionMetadata
): TaskStatusUpdateResult {
	const { paths, data } = readTasks(context);
	const now = getNow(context);
	const taskIndex = getTaskIndex(data, taskId);

	if (taskIndex < 0) {
		throw new Error(`Task not found: ${taskId}`);
	}

	const currentTask = data.tasks[taskIndex];
	const currentStatus = currentTask.status;

	// Validate status transition
	if (!isValidStatusTransition(currentStatus, status)) {
		throw new Error(
			`Invalid status transition: cannot go from ${currentStatus} to ${status} for task ${taskId}`
		);
	}

	const newTaskStatus = executionStatusToTaskStatus(status);
	const runtimeState = executionStatusToRuntimeState(status);

	// Read or create runtime record
	const existingRuntime = readOptionalJsonFile<TaskRuntimeRecord>(getRuntimePath(paths, taskId));
	const startedAt = existingRuntime?.started_at ?? (status === 'running' ? toIsoString(now) : null);
	const completedAt =
		status === 'completed' || status === 'failed' || status === 'timeout' ? toIsoString(now) : null;

	// Calculate duration
	let durationMs: number | null = null;
	if (startedAt && completedAt) {
		durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
	}

	const updatedRuntime: TaskRuntimeRecord = {
		task_id: taskId,
		executor_state: runtimeState,
		executor_id: context.executorId,
		started_at: startedAt,
		last_heartbeat_at: toIsoString(now),
		completed_at: completedAt,
		result:
			status === 'completed'
				? 'success'
				: status === 'failed'
					? 'failed'
					: status === 'timeout'
						? 'timeout'
						: null,
		duration_ms: durationMs,
		agent_type: metadata?.agentType ?? existingRuntime?.agent_type ?? null,
		result_summary: metadata?.resultSummary ?? existingRuntime?.result_summary ?? null,
		error_message: metadata?.errorMessage ?? existingRuntime?.error_message ?? null,
		error_stack: metadata?.errorStack ?? existingRuntime?.error_stack ?? null,
		will_retry: metadata?.willRetry ?? false,
	};

	writeRuntime(paths, updatedRuntime);

	// Update task status in tasks.json
	data.tasks[taskIndex] = {
		...currentTask,
		status: newTaskStatus,
	};
	writeTasks(paths, data);

	if (status === 'completed' || status === 'failed' || status === 'timeout') {
		const binding = readOptionalJsonFile<TaskBindingRecord>(getBindingPath(paths, taskId));
		releaseLockIfOwned(getTaskLockPath(paths, taskId), context.executorId, now);
		if (binding) {
			releaseLockIfOwned(getWorktreeLockPath(paths, binding.worktree_id), context.executorId, now);
			clearFinishedBindingState(paths, binding);
		}
	}

	return {
		ok: true,
		taskId,
		previousStatus: currentStatus,
		newStatus: newTaskStatus,
		runtime: updatedRuntime,
	};
}

function readTaskSummary(paths: TaskSyncPaths, task: ProjectTask): ProjectMemoryTaskSummary {
	const binding = readOptionalJsonFile<TaskBindingRecord>(getBindingPath(paths, task.id));
	const runtime = readOptionalJsonFile<TaskRuntimeRecord>(getRuntimePath(paths, task.id));
	return {
		id: task.id,
		title: task.title,
		status: task.status,
		dependsOn: task.depends_on ?? [],
		executionMode: task.execution_mode ?? null,
		bindingMode: binding?.binding_mode ?? null,
		worktreePath: binding?.worktree_path ?? null,
		executorState: runtime?.executor_state ?? null,
		executorId: runtime?.executor_id ?? null,
	};
}

export function readProjectMemorySnapshot(repoRoot: string): ProjectMemorySnapshot | null {
	const paths = getPaths(repoRoot);
	ensureProjectMemoryDirs(paths);
	if (!fs.existsSync(paths.tasksFile)) {
		return null;
	}
	const data = readJsonFile<TasksFile>(paths.tasksFile);
	return {
		projectId: data.project_id,
		version: data.version,
		taskCount: data.tasks.length,
		tasks: data.tasks.map((task) => readTaskSummary(paths, task)),
		generatedAt: new Date().toISOString(),
	};
}

export function readProjectMemoryTaskDetail(
	repoRoot: string,
	taskId: string
): ProjectMemoryTaskDetail | null {
	const paths = getPaths(repoRoot);
	ensureProjectMemoryDirs(paths);
	if (!fs.existsSync(paths.tasksFile)) {
		return null;
	}
	const data = readJsonFile<TasksFile>(paths.tasksFile);
	const task = data.tasks.find((entry) => entry.id === taskId);
	if (!task) {
		return null;
	}
	const binding = readOptionalJsonFile<TaskBindingRecord>(getBindingPath(paths, taskId));
	const runtime = readOptionalJsonFile<TaskRuntimeRecord>(getRuntimePath(paths, taskId));
	const taskLock = readOptionalJsonFile<TaskLockRecord>(getTaskLockPath(paths, taskId));
	const worktreeLock = binding
		? readOptionalJsonFile<TaskLockRecord>(getWorktreeLockPath(paths, binding.worktree_id))
		: null;
	const worktree = binding
		? readOptionalJsonFile<WorktreeRecord>(getWorktreePath(paths, binding.worktree_id))
		: null;

	return {
		task,
		binding,
		runtime,
		taskLock,
		worktreeLock,
		worktree,
	};
}

export function readTaskSyncLocks(repoRoot: string): TaskSyncLocksSnapshot {
	const paths = getPaths(repoRoot);
	ensureProjectMemoryDirs(paths);
	const now = new Date();
	return {
		taskLocks: readJsonFiles<TaskLockRecord>(paths.taskLocksDir).map(({ id, value }) => ({
			taskId: id,
			lock: value,
			isExpired: isLockExpired(value, now),
		})),
		worktreeLocks: readJsonFiles<TaskLockRecord>(paths.worktreeLocksDir).map(({ id, value }) => ({
			worktreeId: id,
			lock: value,
			isExpired: isLockExpired(value, now),
		})),
	};
}

export function validateTaskSyncProjectMemory(repoRoot: string): TaskSyncValidationReport {
	const paths = getPaths(repoRoot);
	ensureProjectMemoryDirs(paths);
	const now = new Date();

	const issues: string[] = [];
	if (!fs.existsSync(paths.tasksFile)) {
		return {
			ok: false,
			projectId: null,
			taskCount: 0,
			bindingCount: 0,
			runtimeCount: 0,
			taskLockCount: 0,
			worktreeLockCount: 0,
			expiredTaskLockCount: 0,
			expiredWorktreeLockCount: 0,
			issues: [`tasks.json not found: ${paths.tasksFile}`],
		};
	}

	const data = readJsonFile<TasksFile>(paths.tasksFile);
	const taskIds = new Set(data.tasks.map((task) => task.id));
	const bindings = readJsonFiles<TaskBindingRecord>(paths.bindingsDir);
	const runtimes = readJsonFiles<TaskRuntimeRecord>(paths.runtimeDir);
	const taskLocks = readJsonFiles<TaskLockRecord>(paths.taskLocksDir);
	const worktreeLocks = readJsonFiles<TaskLockRecord>(paths.worktreeLocksDir);
	const worktrees = readJsonFiles<WorktreeRecord>(paths.worktreesDir);
	const worktreeIds = new Set(bindings.map(({ value }) => value.worktree_id));
	const bindingByTaskId = new Map(bindings.map(({ id, value }) => [id, value]));
	const taskLockByTaskId = new Map(taskLocks.map(({ id, value }) => [id, value]));
	const worktreeLockById = new Map(worktreeLocks.map(({ id, value }) => [id, value]));
	const worktreeById = new Map(worktrees.map(({ id, value }) => [id, value]));
	const expiredTaskLockCount = taskLocks.filter(({ value }) => isLockExpired(value, now)).length;
	const expiredWorktreeLockCount = worktreeLocks.filter(({ value }) =>
		isLockExpired(value, now)
	).length;

	for (const { id, value } of bindings) {
		if (!taskIds.has(id)) {
			issues.push(`binding without task: ${id}`);
		}
		if (value.task_id !== id) {
			issues.push(`binding task_id mismatch: ${id}`);
		}
		const worktree = worktreeById.get(value.worktree_id);
		if (!worktree) {
			issues.push(`binding without worktree record: ${id}`);
			continue;
		}
		if (worktree.bound_task_id !== id) {
			issues.push(`worktree bound_task_id mismatch: ${value.worktree_id}`);
		}
	}

	for (const { id, value } of runtimes) {
		if (!taskIds.has(id)) {
			issues.push(`runtime without task: ${id}`);
		}
		if (value.task_id !== id) {
			issues.push(`runtime task_id mismatch: ${id}`);
		}
		const binding = bindingByTaskId.get(id);
		if (value.executor_state !== 'running') {
			continue;
		}

		if (!binding) {
			issues.push(`running runtime without binding: ${id}`);
			continue;
		}

		const taskLock = taskLockByTaskId.get(id);
		if (!taskLock) {
			issues.push(`running runtime without task lock: ${id}`);
		} else {
			if (isLockExpired(taskLock, now)) {
				issues.push(`expired task lock: ${id}`);
			}
			if (taskLock.owner !== value.executor_id) {
				issues.push(`runtime/task lock owner mismatch: ${id}`);
			}
		}

		const worktreeLock = worktreeLockById.get(binding.worktree_id);
		if (!worktreeLock) {
			issues.push(`running runtime without worktree lock: ${binding.worktree_id}`);
		} else {
			if (isLockExpired(worktreeLock, now)) {
				issues.push(`expired worktree lock: ${binding.worktree_id}`);
			}
			if (worktreeLock.owner !== value.executor_id) {
				issues.push(`runtime/worktree lock owner mismatch: ${id}`);
			}
		}
	}

	for (const { id, value } of taskLocks) {
		if (!taskIds.has(id)) {
			issues.push(`task lock without task: ${id}`);
		}
		if (isLockExpired(value, now)) {
			issues.push(`expired task lock: ${id}`);
		}
	}

	for (const { id, value } of worktreeLocks) {
		if (!worktreeIds.has(id)) {
			issues.push(`worktree lock without binding: ${id}`);
		}
		if (isLockExpired(value, now)) {
			issues.push(`expired worktree lock: ${id}`);
		}
	}

	for (const { id } of worktrees) {
		if (!worktreeIds.has(id)) {
			issues.push(`worktree record without binding: ${id}`);
		}
	}

	return {
		ok: issues.length === 0,
		projectId: data.project_id,
		taskCount: data.tasks.length,
		bindingCount: bindings.length,
		runtimeCount: runtimes.length,
		taskLockCount: taskLocks.length,
		worktreeLockCount: worktreeLocks.length,
		expiredTaskLockCount,
		expiredWorktreeLockCount,
		issues,
	};
}

export function cleanupStaleTaskSyncState(
	repoRoot: string,
	now = new Date()
): TaskSyncCleanupReport {
	const paths = getPaths(repoRoot);
	ensureProjectMemoryDirs(paths);

	if (!fs.existsSync(paths.tasksFile)) {
		return {
			ok: false,
			projectId: null,
			cleanedTaskLocks: [],
			cleanedWorktreeLocks: [],
			staleTasks: [],
			staleRuntimes: [],
			staleWorktrees: [],
		};
	}

	const data = readJsonFile<TasksFile>(paths.tasksFile);
	const bindings = readJsonFiles<TaskBindingRecord>(paths.bindingsDir);
	const runtimes = readJsonFiles<TaskRuntimeRecord>(paths.runtimeDir);
	const taskLocks = readJsonFiles<TaskLockRecord>(paths.taskLocksDir);
	const worktreeLocks = readJsonFiles<TaskLockRecord>(paths.worktreeLocksDir);
	const worktrees = readJsonFiles<WorktreeRecord>(paths.worktreesDir);

	const bindingByTaskId = new Map(bindings.map(({ id, value }) => [id, value]));
	const runtimeByTaskId = new Map(runtimes.map(({ id, value }) => [id, value]));
	const worktreeById = new Map(worktrees.map(({ id, value }) => [id, value]));
	const taskIndexById = new Map(data.tasks.map((task, index) => [task.id, index]));

	const cleanedTaskLocks: string[] = [];
	const cleanedWorktreeLocks: string[] = [];
	const staleTasks = new Set<string>();
	const staleRuntimes = new Set<string>();
	const staleWorktrees = new Set<string>();
	const timestamp = toIsoString(now);

	for (const { id, value } of taskLocks) {
		if (!isLockExpired(value, now)) {
			continue;
		}
		deleteJsonFile(getTaskLockPath(paths, id));
		cleanedTaskLocks.push(id);
		const runtime = runtimeByTaskId.get(id);
		if (runtime && runtime.executor_state === 'running') {
			const updatedRuntime: TaskRuntimeRecord = {
				...runtime,
				executor_state: 'stale',
				last_heartbeat_at: timestamp,
				completed_at: timestamp,
			};
			writeRuntime(paths, updatedRuntime);
			staleRuntimes.add(id);
		}
		const taskIndex = taskIndexById.get(id);
		if (taskIndex != null && data.tasks[taskIndex]?.status === 'in_progress') {
			data.tasks[taskIndex] = {
				...data.tasks[taskIndex],
				status: 'blocked',
			};
			staleTasks.add(id);
		}
	}

	for (const { id, value } of worktreeLocks) {
		if (!isLockExpired(value, now)) {
			continue;
		}
		deleteJsonFile(getWorktreeLockPath(paths, id));
		cleanedWorktreeLocks.push(id);

		const worktree = worktreeById.get(id);
		if (worktree) {
			const updatedWorktree: WorktreeRecord = {
				...worktree,
				status: 'stale',
				updated_at: timestamp,
			};
			writeJsonFile(getWorktreePath(paths, id), updatedWorktree);
			staleWorktrees.add(id);

			const binding = Array.from(bindingByTaskId.values()).find(
				(entry) => entry.worktree_id === id
			);
			if (binding) {
				const runtime = runtimeByTaskId.get(binding.task_id);
				if (runtime && runtime.executor_state === 'running') {
					const updatedRuntime: TaskRuntimeRecord = {
						...runtime,
						executor_state: 'stale',
						last_heartbeat_at: timestamp,
						completed_at: timestamp,
					};
					writeRuntime(paths, updatedRuntime);
					staleRuntimes.add(binding.task_id);
				}
				const taskIndex = taskIndexById.get(binding.task_id);
				if (taskIndex != null && data.tasks[taskIndex]?.status === 'in_progress') {
					data.tasks[taskIndex] = {
						...data.tasks[taskIndex],
						status: 'blocked',
					};
					staleTasks.add(binding.task_id);
				}
			}
		}
	}

	writeTasks(paths, data);

	return {
		ok: true,
		projectId: data.project_id,
		cleanedTaskLocks,
		cleanedWorktreeLocks,
		staleTasks: Array.from(staleTasks),
		staleRuntimes: Array.from(staleRuntimes),
		staleWorktrees: Array.from(staleWorktrees),
	};
}

export function rebindTaskSyncState(
	repoRoot: string,
	taskId: string,
	now = new Date()
): TaskSyncRebindReport {
	const paths = getPaths(repoRoot);
	ensureProjectMemoryDirs(paths);

	if (!fs.existsSync(paths.tasksFile)) {
		throw new Error(`tasks.json not found: ${paths.tasksFile}`);
	}

	const data = readJsonFile<TasksFile>(paths.tasksFile);
	const taskIndex = getTaskIndex(data, taskId);
	if (taskIndex < 0) {
		throw new Error(`Task not found: ${taskId}`);
	}

	const task = data.tasks[taskIndex];
	const taskMap = new Map(data.tasks.map((entry) => [entry.id, entry]));
	const taskLockPath = getTaskLockPath(paths, taskId);
	const existingTaskLock = readOptionalJsonFile<TaskLockRecord>(taskLockPath);
	if (hasLiveLock(existingTaskLock, now)) {
		throw new Error(`Task still has a live lock: ${taskId}`);
	}

	const bindingPath = getBindingPath(paths, taskId);
	const existingBinding = readOptionalJsonFile<TaskBindingRecord>(bindingPath);
	let clearedWorktreeLock = false;
	let clearedWorktreeRecord = false;

	if (existingBinding) {
		const worktreeLockPath = getWorktreeLockPath(paths, existingBinding.worktree_id);
		const existingWorktreeLock = readOptionalJsonFile<TaskLockRecord>(worktreeLockPath);
		if (hasLiveLock(existingWorktreeLock, now)) {
			throw new Error(`Worktree still has a live lock: ${existingBinding.worktree_id}`);
		}
		if (existingWorktreeLock) {
			deleteJsonFile(worktreeLockPath);
			clearedWorktreeLock = true;
		}

		const worktreePath = getWorktreePath(paths, existingBinding.worktree_id);
		if (readOptionalJsonFile<WorktreeRecord>(worktreePath)) {
			deleteJsonFile(worktreePath);
			clearedWorktreeRecord = true;
		}
	}

	const runtimePath = getRuntimePath(paths, taskId);
	const hadRuntime = !!readOptionalJsonFile<TaskRuntimeRecord>(runtimePath);
	if (hadRuntime) {
		deleteJsonFile(runtimePath);
	}

	if (existingTaskLock) {
		deleteJsonFile(taskLockPath);
	}

	if (existingBinding) {
		deleteJsonFile(bindingPath);
	}

	const nextStatus: TaskStatus = taskDependenciesSatisfied(task, taskMap) ? 'pending' : 'blocked';
	data.tasks[taskIndex] = {
		...task,
		status: nextStatus,
	};
	writeTasks(paths, data);

	return {
		ok: true,
		projectId: data.project_id,
		taskId,
		taskStatus: nextStatus,
		clearedBinding: !!existingBinding,
		clearedRuntime: hadRuntime,
		clearedTaskLock: !!existingTaskLock,
		clearedWorktreeLock,
		clearedWorktreeRecord,
	};
}

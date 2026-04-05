export interface ProjectMemoryTaskSummary {
	id: string;
	title: string;
	status: string;
	dependsOn: string[];
	executionMode: string | null;
	bindingMode: string | null;
	worktreePath: string | null;
	executorState: string | null;
	executorId: string | null;
}

export interface ProjectMemoryTaskDetail {
	task: unknown;
	binding: unknown | null;
	runtime: unknown | null;
	taskLock: unknown | null;
	worktreeLock: unknown | null;
	worktree: unknown | null;
}

export interface ProjectMemorySnapshot {
	projectId: string;
	version: string;
	taskCount: number;
	tasks: ProjectMemoryTaskSummary[];
	generatedAt: string;
}

export interface ProjectMemoryExecutionContext {
	repoRoot: string;
	taskId: string;
	executorId: string;
}

export interface ProjectMemoryBindingIntent {
	policyVersion: string;
	repoRoot: string;
	sourceBranch: string;
	bindingPreference: 'shared-branch-serialized' | 'prefer-shared-branch-serialized';
	sharedCheckoutAllowed: boolean;
	reuseExistingBinding: boolean;
	allowRebindIfStale: boolean;
}

export interface ProjectMemoryExecutionValidationResult {
	ok: boolean;
	skipped: boolean;
	taskId: string | null;
	executorId: string | null;
	reason: string | null;
	bindingMode: string | null;
	expectedBranch: string | null;
	currentBranch: string | null;
}

export interface ProjectMemoryStateValidationReport {
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

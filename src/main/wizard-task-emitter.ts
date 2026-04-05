/**
 * Wizard Task Emitter
 *
 * Transforms Wizard-generated playbook configs with `projectMemoryBindingIntent`
 * metadata into repo-local task records under `project_memory/tasks/`.
 *
 * This module bridges the gap between Wizard playbook generation and the
 * repo-local task-sync control plane, enabling true-DAG playbooks to emit
 * task records that can be consumed by the task-sync runtime.
 *
 * Edge Cases Handled:
 * - Empty task graphs with binding intent → helpful error message
 * - Circular dependencies → rejected with clear guidance
 * - Partial emission → emit valid tasks, report invalid ones separately
 * - Deduplication → prevent emitting the same task twice
 * - Repo root normalization → resolve symlinks/relative paths
 * - Auto-create project_memory/ → create directory structure if missing
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Playbook, PlaybookTaskGraphNode } from '../shared/types';
import type { ProjectMemoryBindingIntent } from '../shared/projectMemory';
import {
	validateWizardTaskEmission as validateWizardTaskEmissionWithZod,
	type WizardEmissionValidationResult,
} from '../shared/wizardTypes';

/**
 * Result of emitting Wizard tasks to repo-local storage
 */
export interface WizardTaskEmissionResult {
	/** Whether emission succeeded completely */
	success: boolean;
	/** Whether partial emission succeeded (some tasks valid, some invalid) */
	partialSuccess?: boolean;
	/** List of emitted task IDs */
	emittedTaskIds: string[];
	/** List of skipped task IDs (duplicates) */
	skippedTaskIds?: string[];
	/** List of invalid task IDs (validation failures) */
	invalidTaskIds?: string[];
	/** Validation errors for invalid tasks */
	validationErrors?: WizardTaskEmissionError[];
	/** Path to the written tasks.json file */
	tasksFilePath: string;
	/** Normalized repo root path (symlinks resolved) */
	normalizedRepoRoot?: string;
	/** Error message if emission failed */
	error?: string;
	/** Actionable suggestion for fixing the error */
	suggestion?: string;
	/** Additional diagnostic information */
	diagnostics?: {
		/** Number of tasks emitted */
		taskCount: number;
		/** Number of tasks skipped (duplicates) */
		skippedCount?: number;
		/** Number of tasks that failed validation */
		invalidCount?: number;
		/** Repo root where tasks were emitted */
		repoRoot: string;
		/** Source branch from binding intent */
		sourceBranch: string;
		/** Binding preference that was applied */
		bindingPreference: string;
	};
}

/**
 * Validate that a playbook has the required metadata for task emission
 *
 * Delegates to Zod-based validation from wizardTypes.
 */
export function validateWizardTaskEmission(
	playbook: Partial<Playbook>
): WizardEmissionValidationResult {
	// Delegate to the Zod-based validation from wizardTypes
	return validateWizardTaskEmissionWithZod(playbook);
}

/**
 * Internal structure for task emission with document context
 */
interface EmissionContext {
	playbook: Playbook;
	repoRoot: string;
	bindingIntent: ProjectMemoryBindingIntent;
	tasksFilePath: string;
}

/**
 * Task-sync paths structure (local definition)
 */
interface TaskSyncPaths {
	projectMemoryDir: string;
	tasksFile: string;
	bindingsDir: string;
	runtimeDir: string;
	worktreesDir: string;
	taskLocksDir: string;
	worktreeLocksDir: string;
}

/**
 * Local type definitions for task-sync (matching task-sync.ts format)
 */
type ExecutionMode = 'shared-serialized' | 'isolated' | 'either';
type BindingPreference =
	| 'shared-branch-serialized'
	| 'prefer-shared-branch-serialized'
	| 'create-or-reuse-isolated'
	| 'reuse-existing-only'
	| 'blocked-until-bound';

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
	status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked';
	depends_on?: string[];
	goal?: string;
	execution_mode?: ExecutionMode;
	worktree_binding_request?: TaskBindingRequest;
}

/**
 * Get the project memory paths for a given repo root
 */
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

/**
 * Normalize repo root path by resolving symlinks and relative paths
 *
 * This prevents duplicate task stores for the same repo accessed via
 * different paths (e.g., symlink vs real path, relative vs absolute).
 *
 * @param repoRoot - The repo root path to normalize
 * @returns Normalized absolute path
 */
function normalizeRepoRoot(repoRoot: string): string {
	// First resolve to absolute path
	let normalized = path.resolve(repoRoot);

	// Then resolve symlinks if the path exists
	if (fs.existsSync(normalized)) {
		try {
			normalized = fs.realpathSync(normalized);
		} catch {
			// If realpath fails (e.g., permission issues), use the resolved path
		}
	}

	return normalized;
}

/**
 * Ensure project memory directories exist
 */
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

/**
 * Error information for a single task that failed validation during emission
 */
export interface WizardTaskEmissionError {
	/** Task ID that failed */
	taskId: string;
	/** Error category */
	category:
		| 'empty-graph'
		| 'circular-dependency'
		| 'invalid-dependency'
		| 'validation-failed'
		| 'duplicate';
	/** Human-readable error message */
	message: string;
	/** Actionable suggestion for fixing the error */
	suggestion?: string;
}

/**
 * Generate actionable error suggestions based on error category
 */
function getErrorSuggestion(
	category: WizardTaskEmissionError['category'],
	context?: string
): string {
	switch (category) {
		case 'empty-graph':
			return 'Add tasks to the taskGraph or remove projectMemoryBindingIntent to create a sequential playbook without repo-local task emission.';
		case 'circular-dependency':
			return 'Restructure the task graph to break the circular dependency. Consider splitting tasks or using a sequential structure where A → B → C instead of A → B → A.';
		case 'invalid-dependency':
			return context
				? `Ensure all dependsOn references point to valid task IDs. The referenced task "${context}" does not exist in the taskGraph.`
				: 'Ensure all dependsOn references point to valid task IDs that exist in the taskGraph.';
		case 'validation-failed':
			return 'Check that all task nodes have valid id, documentIndex, and dependencies fields.';
		case 'duplicate':
			return context
				? `Task "${context}" already exists in the task store. Use force=true to overwrite or update the task ID to be unique.`
				: 'Task already exists in the task store. Use force=true to overwrite or update the task ID to be unique.';
		default:
			return 'Review the playbook configuration and ensure all tasks are properly defined.';
	}
}

/**
 * Transform a PlaybookTaskGraphNode into a ProjectTask for task-sync
 */
function transformTaskNode(
	node: PlaybookTaskGraphNode,
	documentIndex: number,
	documents: Array<{ filename: string }>,
	context: EmissionContext
): { id: string; task: ProjectTask } {
	const document = documents[documentIndex];
	const bindingPreference = context.bindingIntent.bindingPreference;
	const isolationMode =
		node.isolationMode === 'isolated-worktree' ? 'isolated' : 'shared-serialized';

	// Map isolation mode to execution mode
	const executionMode: ExecutionMode =
		isolationMode === 'isolated' ? 'isolated' : 'shared-serialized';

	// Map binding preference to task binding preference
	const taskBindingPreference: BindingPreference =
		bindingPreference === 'shared-branch-serialized'
			? 'shared-branch-serialized'
			: 'prefer-shared-branch-serialized';

	return {
		id: node.id,
		task: {
			id: node.id,
			title: document.filename,
			status: 'pending' as const,
			depends_on: node.dependsOn ?? [],
			goal: `Execute ${document.filename} as defined in the Wizard playbook`,
			execution_mode: executionMode,
			worktree_binding_request: {
				policy_version: context.bindingIntent.policyVersion,
				binding_preference: taskBindingPreference,
				repo_root: context.repoRoot,
				source_branch: context.bindingIntent.sourceBranch,
				shared_checkout_allowed: context.bindingIntent.sharedCheckoutAllowed,
				reuse_existing_binding: context.bindingIntent.reuseExistingBinding,
				allow_rebind_if_stale: context.bindingIntent.allowRebindIfStale,
			},
		},
	};
}

/**
 * Emit Wizard tasks from a playbook config to repo-local task-sync storage
 *
 * @param playbook - The playbook configuration with projectMemoryBindingIntent metadata
 * @param options - Optional configuration for emission behavior
 * @returns Emission result with success status and emitted task IDs
 */
export function emitWizardTasks(
	playbook: Playbook,
	options: {
		/** Force overwrite existing tasks.json (default: false) */
		force?: boolean;
		/** Dry run - don't write files, just validate and return result (default: false) */
		dryRun?: boolean;
		/** Allow partial emission - emit valid tasks even if some fail validation (default: true) */
		allowPartial?: boolean;
		/** Skip deduplication check (default: false) */
		skipDeduplication?: boolean;
	} = {}
): WizardTaskEmissionResult {
	const { force = false, dryRun = false, allowPartial = true, skipDeduplication = false } = options;

	// Validate playbook has required metadata
	const validation = validateWizardTaskEmission(playbook);
	if (!validation.valid) {
		// Check if this is a non-recoverable error (empty graph, circular deps, etc.)
		const nonRecoverableErrors = validation.errors.filter(
			(e) =>
				e.message.includes('Circular dependency') ||
				e.message.includes('no tasks') ||
				e.category === 'missing-metadata'
		);

		// If we have non-recoverable errors or partial emission is disabled, fail fast
		if (nonRecoverableErrors.length > 0 || !allowPartial) {
			const errorMessage = validation.errors.map((e) => e.message).join('; ');
			const suggestion = nonRecoverableErrors[0]?.message.includes('no tasks')
				? getErrorSuggestion('empty-graph')
				: nonRecoverableErrors[0]?.message.includes('Circular dependency')
					? getErrorSuggestion('circular-dependency')
					: undefined;

			return {
				success: false,
				emittedTaskIds: [],
				tasksFilePath: '',
				error: `Invalid playbook for task emission: ${errorMessage}`,
				suggestion,
				validationErrors: validation.errors.map((e) => ({
					taskId: e.relatedTaskIds?.[0] ?? 'unknown',
					category: 'validation-failed',
					message: e.message,
					suggestion: getErrorSuggestion('validation-failed'),
				})),
			};
		}

		// For partial emission, we'll continue but track invalid tasks
		// This will be handled after we extract binding intent
	}

	// Extract binding intent
	const { projectMemoryBindingIntent: bindingIntent } = playbook;
	if (!bindingIntent) {
		return {
			success: false,
			emittedTaskIds: [],
			tasksFilePath: '',
			error: 'Missing projectMemoryBindingIntent after validation',
			suggestion: 'Add projectMemoryBindingIntent to the playbook configuration.',
		};
	}

	// Normalize repo root to prevent duplicate task stores
	const normalizedRepoRoot = normalizeRepoRoot(bindingIntent.repoRoot);
	const paths = getPaths(normalizedRepoRoot);

	// Ensure directories exist (auto-create project_memory/ structure)
	if (!dryRun) {
		ensureProjectMemoryDirs(paths);
	}

	// Check for existing tasks and handle deduplication
	let existingTasks: ProjectTask[] = [];
	if (fs.existsSync(paths.tasksFile)) {
		if (!force && !skipDeduplication) {
			// Read existing tasks for deduplication check
			try {
				const existingData = JSON.parse(fs.readFileSync(paths.tasksFile, 'utf-8'));
				existingTasks = existingData.tasks ?? [];
			} catch {
				// If we can't parse the existing file, treat as force overwrite
			}
		} else if (!force && !dryRun) {
			return {
				success: false,
				emittedTaskIds: [],
				tasksFilePath: paths.tasksFile,
				error: 'tasks.json already exists. Use force=true to overwrite.',
				suggestion:
					'Add the --force flag to overwrite the existing task store, or use a different repo root.',
			};
		}
	}

	// Build emission context
	const context: EmissionContext = {
		playbook,
		repoRoot: normalizedRepoRoot,
		bindingIntent,
		tasksFilePath: paths.tasksFile,
	};

	// Transform task nodes into ProjectTask format
	const { taskGraph, documents } = playbook;

	if (!taskGraph) {
		return {
			success: false,
			emittedTaskIds: [],
			tasksFilePath: paths.tasksFile,
			error: 'Missing taskGraph in playbook',
			suggestion: 'Add a taskGraph with nodes to define task dependencies.',
		};
	}

	// Process tasks, handling validation and deduplication
	const emittedTasks: ProjectTask[] = [];
	const skippedTaskIds: string[] = [];
	const invalidTaskIds: string[] = [];
	const validationErrors: WizardTaskEmissionError[] = [];
	const existingTaskIds = new Set(existingTasks.map((t) => t.id));

	// Build a map of validation errors by task ID
	const validationErrorsByTaskId = new Map<string, WizardTaskEmissionError>();
	for (const error of validation.errors) {
		for (const taskId of error.relatedTaskIds ?? []) {
			validationErrorsByTaskId.set(taskId, {
				taskId,
				category: error.message.includes('Circular dependency')
					? 'circular-dependency'
					: error.message.includes('depends on non-existent')
						? 'invalid-dependency'
						: 'validation-failed',
				message: error.message,
				suggestion: getErrorSuggestion(
					error.message.includes('Circular dependency')
						? 'circular-dependency'
						: error.message.includes('depends on non-existent')
							? 'invalid-dependency'
							: 'validation-failed',
					error.message.match(/"([^"]+)"/)?.[1]
				),
			});
		}
	}

	for (const node of taskGraph.nodes) {
		// Skip tasks with validation errors
		if (validationErrorsByTaskId.has(node.id)) {
			invalidTaskIds.push(node.id);
			validationErrors.push(validationErrorsByTaskId.get(node.id)!);
			continue;
		}

		// Skip duplicate tasks (unless force is enabled)
		if (existingTaskIds.has(node.id) && !force && !skipDeduplication) {
			skippedTaskIds.push(node.id);
			continue;
		}

		const { task } = transformTaskNode(node, node.documentIndex, documents, context);
		emittedTasks.push(task);
	}

	// Determine if we have any tasks to emit
	if (emittedTasks.length === 0) {
		// Check why we have no tasks
		if (invalidTaskIds.length > 0 && skippedTaskIds.length > 0) {
			return {
				success: false,
				partialSuccess: false,
				emittedTaskIds: [],
				skippedTaskIds,
				invalidTaskIds,
				validationErrors,
				tasksFilePath: paths.tasksFile,
				error: `No tasks could be emitted: ${skippedTaskIds.length} skipped (duplicates), ${invalidTaskIds.length} invalid (validation failed)`,
				suggestion: 'Fix validation errors or use force=true to overwrite duplicates.',
			};
		} else if (invalidTaskIds.length > 0) {
			return {
				success: false,
				partialSuccess: false,
				emittedTaskIds: [],
				invalidTaskIds,
				validationErrors,
				tasksFilePath: paths.tasksFile,
				error: `All ${invalidTaskIds.length} task(s) failed validation`,
				suggestion: validationErrors[0]?.suggestion,
			};
		} else if (skippedTaskIds.length > 0) {
			return {
				success: false,
				partialSuccess: false,
				emittedTaskIds: [],
				skippedTaskIds,
				tasksFilePath: paths.tasksFile,
				error: `All ${skippedTaskIds.length} task(s) already exist in task store`,
				suggestion: 'Use force=true to overwrite existing tasks or update task IDs.',
			};
		} else {
			return {
				success: false,
				emittedTaskIds: [],
				tasksFilePath: paths.tasksFile,
				error: 'No tasks to emit (empty task graph)',
				suggestion: getErrorSuggestion('empty-graph'),
			};
		}
	}

	// Build tasks.json file structure
	// When force is false and we have existing tasks, merge them (deduplication mode)
	const finalTasks = force ? emittedTasks : [...existingTasks, ...emittedTasks];

	const tasksFile = {
		version: '2026-04-04',
		project_id: path.basename(normalizedRepoRoot),
		project_name: path.basename(normalizedRepoRoot),
		source_plan: `Wizard playbook: ${playbook.name}`,
		defaults: {
			repo_root: normalizedRepoRoot,
			source_branch: bindingIntent.sourceBranch,
			execution_mode: 'shared-serialized' as const,
			binding_preference: bindingIntent.bindingPreference,
			shared_checkout_allowed: bindingIntent.sharedCheckoutAllowed,
			reuse_existing_binding: bindingIntent.reuseExistingBinding,
			allow_rebind_if_stale: bindingIntent.allowRebindIfStale,
		},
		tasks: finalTasks,
	};

	// Write tasks.json atomically using temp file + rename (skip for dry run)
	if (!dryRun) {
		const tempFilePath = `${paths.tasksFile}.tmp`;
		try {
			fs.writeFileSync(tempFilePath, JSON.stringify(tasksFile, null, 2) + '\n', 'utf-8');
			fs.renameSync(tempFilePath, paths.tasksFile);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);

			// Provide more specific error suggestions based on error type
			let suggestion: string | undefined;
			if (errorMessage.includes('EACCES') || errorMessage.includes('permission')) {
				suggestion =
					'Permission denied. Check that you have write access to the project_memory directory.';
			} else if (errorMessage.includes('ENOSPC') || errorMessage.includes('disk')) {
				suggestion = 'Disk full. Free up space and try again.';
			} else if (errorMessage.includes('ENOENT')) {
				suggestion = 'Directory does not exist. Ensure the repo root path is correct.';
			}

			return {
				success: false,
				emittedTaskIds: [],
				tasksFilePath: paths.tasksFile,
				error: `Failed to write tasks.json: ${errorMessage}`,
				suggestion,
			};
		}
	}

	// Determine success state
	const hasPartialIssues = skippedTaskIds.length > 0 || invalidTaskIds.length > 0;

	// Return success result with diagnostics
	return {
		success: true,
		partialSuccess: hasPartialIssues ? true : undefined,
		emittedTaskIds: emittedTasks.map((task) => task.id),
		skippedTaskIds: skippedTaskIds.length > 0 ? skippedTaskIds : undefined,
		invalidTaskIds: invalidTaskIds.length > 0 ? invalidTaskIds : undefined,
		validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
		tasksFilePath: paths.tasksFile,
		normalizedRepoRoot,
		diagnostics: {
			taskCount: emittedTasks.length,
			skippedCount: skippedTaskIds.length > 0 ? skippedTaskIds.length : undefined,
			invalidCount: invalidTaskIds.length > 0 ? invalidTaskIds.length : undefined,
			repoRoot: normalizedRepoRoot,
			sourceBranch: bindingIntent.sourceBranch,
			bindingPreference: bindingIntent.bindingPreference,
		},
	};
}

/**
 * Check if a playbook is eligible for Wizard task emission
 *
 * Returns true if the playbook has both projectMemoryBindingIntent and
 * a valid taskGraph structure.
 */
export function canEmitWizardTasks(playbook: Partial<Playbook>): boolean {
	return validateWizardTaskEmission(playbook).valid;
}

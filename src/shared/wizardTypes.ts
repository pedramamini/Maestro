/**
 * Wizard Task Emission Types
 *
 * Type definitions for the contract between Wizard playbook metadata
 * and repo-local task-sync records. This module defines the validation
 * schema and transformation types used by wizard-task-emitter.ts.
 */

import { z } from 'zod';

// ============================================================================
// Zod Validation Schemas
// ============================================================================

/**
 * Zod schema for ProjectMemoryBindingIntent validation
 */
export const ProjectMemoryBindingIntentSchema = z.object({
	policyVersion: z.string().min(1, 'policyVersion must be a non-empty string'),
	repoRoot: z.string().min(1, 'repoRoot must be a non-empty string'),
	sourceBranch: z.string().min(1, 'sourceBranch must be a non-empty string'),
	bindingPreference: z.enum(['shared-branch-serialized', 'prefer-shared-branch-serialized'], {
		message:
			'bindingPreference must be either "shared-branch-serialized" or "prefer-shared-branch-serialized"',
	}),
	sharedCheckoutAllowed: z.boolean(),
	reuseExistingBinding: z.boolean(),
	allowRebindIfStale: z.boolean(),
});

/**
 * Zod schema for PlaybookTaskGraphNode validation
 */
export const PlaybookTaskGraphNodeSchema = z.object({
	id: z.string().min(1, 'Task node ID must be a non-empty string'),
	documentIndex: z.number().int().nonnegative('documentIndex must be a non-negative integer'),
	dependsOn: z.array(z.string()).optional().default([]),
	isolationMode: z
		.enum(['shared-checkout', 'isolated-worktree'], {
			message: 'isolationMode must be either "shared-checkout" or "isolated-worktree"',
		})
		.optional()
		.default('shared-checkout'),
});

/**
 * Zod schema for PlaybookTaskGraph validation
 */
export const PlaybookTaskGraphSchema = z.object({
	nodes: z.array(PlaybookTaskGraphNodeSchema).min(1, 'taskGraph must contain at least one node'),
});

/**
 * Zod schema for PlaybookDocumentEntry validation (subset for emission)
 */
export const PlaybookDocumentEntrySchema = z.object({
	filename: z.string().min(1, 'Document filename must be a non-empty string'),
	resetOnCompletion: z.boolean(),
});

/**
 * Zod schema for WizardTaskEmissionInput validation
 */
export const WizardTaskEmissionInputSchema = z.object({
	id: z.string().min(1, 'Playbook ID must be a non-empty string'),
	name: z.string().min(1, 'Playbook name must be a non-empty string'),
	documents: z
		.array(PlaybookDocumentEntrySchema)
		.min(1, 'Playbook must contain at least one document'),
	taskGraph: PlaybookTaskGraphSchema,
	projectMemoryBindingIntent: ProjectMemoryBindingIntentSchema,
});

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Contract type representing Wizard playbook metadata needed for task emission
 *
 * This is the subset of Playbook that the emitter requires to transform
 * taskGraph nodes into repo-local task records.
 */
export interface WizardTaskEmissionInput {
	/**
	 * Unique identifier for the playbook
	 */
	id: string;

	/**
	 * Human-readable name for the playbook
	 */
	name: string;

	/**
	 * Documents in the playbook (tasks to execute)
	 */
	documents: Array<{
		filename: string;
		resetOnCompletion: boolean;
	}>;

	/**
	 * DAG task graph defining execution order and dependencies
	 */
	taskGraph: {
		nodes: Array<{
			id: string;
			documentIndex: number;
			dependsOn?: string[];
			isolationMode?: 'shared-checkout' | 'isolated-worktree';
		}>;
	};

	/**
	 * Repo-local project memory binding intent metadata
	 * This carries the binding configuration from Wizard to task-sync
	 */
	projectMemoryBindingIntent: {
		policyVersion: string;
		repoRoot: string;
		sourceBranch: string;
		bindingPreference: 'shared-branch-serialized' | 'prefer-shared-branch-serialized';
		sharedCheckoutAllowed: boolean;
		reuseExistingBinding: boolean;
		allowRebindIfStale: boolean;
	};
}

/**
 * Result of emitting Wizard tasks to repo-local task-sync storage
 */
export interface WizardTaskEmissionResult {
	/** Whether emission succeeded */
	success: boolean;

	/** List of emitted task IDs (e.g., ["task-01", "task-02"]) */
	emittedTaskIds: string[];

	/** Path to the written tasks.json file (absolute path) */
	tasksFilePath: string;

	/** Error message if emission failed */
	error?: string;

	/** Additional diagnostic information */
	diagnostics?: {
		/** Number of tasks emitted */
		taskCount: number;

		/** Repo root where tasks were emitted */
		repoRoot: string;

		/** Source branch from binding intent */
		sourceBranch: string;

		/** Binding preference that was applied */
		bindingPreference: string;
	};
}

// ============================================================================
// Validation Error Types
// ============================================================================

/**
 * Validation error category for Wizard task emission
 */
export type WizardEmissionErrorCategory =
	| 'missing-metadata'
	| 'malformed-task-graph'
	| 'file-system-error'
	| 'validation-failed';

/**
 * Detailed error information for Wizard task emission failures
 */
export interface WizardEmissionError {
	/** Category of the error */
	category: WizardEmissionErrorCategory;

	/** Human-readable error message */
	message: string;

	/** Specific field or value that caused the error (if applicable) */
	field?: string;

	/** Invalid value that caused the error (if applicable) */
	invalidValue?: unknown;

	/** Related task/node IDs (if applicable) */
	relatedTaskIds?: string[];
}

/**
 * Result of validating Wizard playbook metadata for task emission
 */
export interface WizardEmissionValidationResult {
	/** Whether the playbook is valid for task emission */
	valid: boolean;

	/** List of validation errors (empty if valid) */
	errors: Array<WizardEmissionError>;

	/** List of validation warnings (non-blocking issues) */
	warnings: string[];
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate Wizard playbook metadata for task emission using Zod schemas
 *
 * @param input - Partial playbook data to validate
 * @param options - Validation options
 * @returns Validation result with structured errors
 */
export function validateWizardTaskEmission(
	input: unknown,
	options?: {
		/** Check for circular dependencies (default: true) */
		checkCircularDeps?: boolean;
		/** Check for invalid dependency references (default: true) */
		checkDepRefs?: boolean;
	}
): WizardEmissionValidationResult {
	const { checkCircularDeps = true, checkDepRefs = true } = options ?? {};
	const errors: WizardEmissionError[] = [];
	const warnings: string[] = [];

	try {
		// Parse using Zod schema
		const result = WizardTaskEmissionInputSchema.safeParse(input);

		if (!result.success) {
			// Transform Zod errors into WizardEmissionError format
			for (const issue of result.error.issues) {
				const field = issue.path.map(String).join('.');
				const error: WizardEmissionError = {
					category: 'validation-failed',
					message: issue.message,
					field,
				};

				// Categorize errors based on field
				if (field.startsWith('projectMemoryBindingIntent')) {
					error.category = 'missing-metadata';
				} else if (field.startsWith('taskGraph')) {
					error.category = 'malformed-task-graph';
				}

				errors.push(error);
			}
		} else {
			// Additional semantic validation beyond Zod
			const data = result.data;

			// Check for empty task graph with binding intent
			if (data.taskGraph.nodes.length === 0) {
				errors.push({
					category: 'malformed-task-graph',
					message:
						'Playbook has projectMemoryBindingIntent but contains no tasks. Add tasks to the taskGraph or remove projectMemoryBindingIntent to create a sequential playbook.',
					field: 'taskGraph.nodes',
				});
			}

			// Check that taskGraph nodes have valid documentIndex references
			const maxDocumentIndex = data.documents.length - 1;
			for (const node of data.taskGraph.nodes) {
				if (node.documentIndex > maxDocumentIndex) {
					errors.push({
						category: 'malformed-task-graph',
						message: `Node "${node.id}" references documentIndex ${node.documentIndex} but only ${data.documents.length} documents exist`,
						field: 'taskGraph.nodes',
						invalidValue: node,
						relatedTaskIds: [node.id],
					});
				}
			}

			// Check for duplicate node IDs
			const nodeIds = new Set<string>();
			const duplicateIds = new Set<string>();
			for (const node of data.taskGraph.nodes) {
				if (nodeIds.has(node.id)) {
					duplicateIds.add(node.id);
				}
				nodeIds.add(node.id);
			}

			if (duplicateIds.size > 0) {
				errors.push({
					category: 'malformed-task-graph',
					message: `Duplicate taskGraph node IDs detected: ${Array.from(duplicateIds).join(', ')}`,
					field: 'taskGraph.nodes',
					relatedTaskIds: Array.from(duplicateIds),
				});
			}

			// Check for invalid dependency references (dependencies pointing to non-existent nodes)
			if (checkDepRefs && data.taskGraph.nodes.length > 0) {
				const depValidation = validateDependencyReferences(
					data.taskGraph.nodes.map((n) => ({
						id: n.id,
						dependsOn: n.dependsOn,
					}))
				);

				if (!depValidation.valid) {
					for (const { taskId, missingDep } of depValidation.invalidRefs) {
						errors.push({
							category: 'malformed-task-graph',
							message: `Task "${taskId}" depends on non-existent task "${missingDep}". Ensure all dependencies reference valid task IDs.`,
							field: 'taskGraph.nodes',
							relatedTaskIds: [taskId],
						});
					}
				}
			}

			// Check for circular dependencies
			if (checkCircularDeps && data.taskGraph.nodes.length > 0) {
				const cycleDetection = detectCircularDependencies(
					data.taskGraph.nodes.map((n) => ({
						id: n.id,
						dependsOn: n.dependsOn,
					}))
				);

				if (cycleDetection.hasCycle) {
					errors.push({
						category: 'malformed-task-graph',
						message: `Circular dependency detected: ${cycleDetection.cyclePath.join(' → ')}. Tasks cannot have circular dependencies. Restructure the task graph to break the cycle.`,
						field: 'taskGraph.nodes',
						relatedTaskIds: cycleDetection.cycleTaskIds,
					});
				}
			}
		}
	} catch (error) {
		// Catch unexpected errors during validation
		errors.push({
			category: 'validation-failed',
			message: `Unexpected validation error: ${error instanceof Error ? error.message : String(error)}`,
		});
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	};
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if playbook has sequential execution (no taskGraph)
 *
 * Sequential playbooks don't have a taskGraph and are not eligible
 * for repo-local task emission.
 */
export function isSequentialPlaybook(playbook: Partial<WizardTaskEmissionInput>): boolean {
	return (
		!playbook.taskGraph ||
		!Array.isArray(playbook.taskGraph.nodes) ||
		playbook.taskGraph.nodes.length === 0
	);
}

/**
 * Type guard to check if playbook has DAG-shaped execution (with taskGraph)
 *
 * Only DAG-shaped playbooks with taskGraph can emit repo-local tasks.
 */
export function isDagPlaybook(playbook: Partial<WizardTaskEmissionInput>): boolean {
	return !isSequentialPlaybook(playbook);
}

// ============================================================================
// Circular Dependency Detection
// ============================================================================

/**
 * Detect circular dependencies in a task graph using DFS
 *
 * @param nodes - Task graph nodes to check
 * @returns Object with detected cycles (if any)
 */
export function detectCircularDependencies(nodes: Array<{ id: string; dependsOn?: string[] }>): {
	hasCycle: boolean;
	cyclePath: string[];
	cycleTaskIds: string[];
} {
	const visited = new Set<string>();
	const recursionStack = new Set<string>();
	const cyclePath: string[] = [];
	let cycleDetected = false;

	// Build adjacency map
	const adjacency = new Map<string, string[]>();
	for (const node of nodes) {
		adjacency.set(node.id, node.dependsOn ?? []);
	}

	/**
	 * DFS helper to detect cycles
	 */
	function dfs(nodeId: string, path: string[]): boolean {
		if (recursionStack.has(nodeId)) {
			// Found a cycle - extract the cycle path
			const cycleStartIndex = path.indexOf(nodeId);
			cyclePath.push(...path.slice(cycleStartIndex), nodeId);
			return true;
		}

		if (visited.has(nodeId)) {
			return false;
		}

		visited.add(nodeId);
		recursionStack.add(nodeId);
		path.push(nodeId);

		const dependencies = adjacency.get(nodeId) ?? [];
		for (const dep of dependencies) {
			// Only check dependencies that exist in the node list
			if (adjacency.has(dep) && dfs(dep, path)) {
				return true;
			}
		}

		path.pop();
		recursionStack.delete(nodeId);
		return false;
	}

	// Check each node for cycles
	for (const node of nodes) {
		if (!visited.has(node.id)) {
			if (dfs(node.id, [])) {
				cycleDetected = true;
				break;
			}
		}
	}

	// Extract unique task IDs involved in the cycle
	const cycleTaskIds = cycleDetected
		? [...new Set(cyclePath.filter((id) => adjacency.has(id)))]
		: [];

	return {
		hasCycle: cycleDetected,
		cyclePath,
		cycleTaskIds,
	};
}

/**
 * Validate dependencies reference existing nodes
 *
 * @param nodes - Task graph nodes to check
 * @returns Object with invalid dependency references
 */
export function validateDependencyReferences(nodes: Array<{ id: string; dependsOn?: string[] }>): {
	valid: boolean;
	invalidRefs: Array<{ taskId: string; missingDep: string }>;
} {
	const nodeIds = new Set(nodes.map((n) => n.id));
	const invalidRefs: Array<{ taskId: string; missingDep: string }> = [];

	for (const node of nodes) {
		for (const dep of node.dependsOn ?? []) {
			if (!nodeIds.has(dep)) {
				invalidRefs.push({ taskId: node.id, missingDep: dep });
			}
		}
	}

	return {
		valid: invalidRefs.length === 0,
		invalidRefs,
	};
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract repo root from Wizard playbook metadata
 *
 * @param playbook - Wizard playbook with projectMemoryBindingIntent
 * @returns Repo root path or null if not found
 */
export function extractRepoRoot(playbook: Partial<WizardTaskEmissionInput>): string | null {
	return playbook.projectMemoryBindingIntent?.repoRoot ?? null;
}

/**
 * Extract binding preference from Wizard playbook metadata
 *
 * @param playbook - Wizard playbook with projectMemoryBindingIntent
 * @returns Binding preference or null if not found
 */
export function extractBindingPreference(
	playbook: Partial<WizardTaskEmissionInput>
): 'shared-branch-serialized' | 'prefer-shared-branch-serialized' | null {
	return playbook.projectMemoryBindingIntent?.bindingPreference ?? null;
}

/**
 * Build a summary of the task emission for logging/display
 *
 * @param result - Emission result from emitWizardTasks()
 * @returns Human-readable summary string
 */
export function summarizeEmissionResult(result: WizardTaskEmissionResult): string {
	if (result.success) {
		return `Emitted ${result.emittedTaskIds.length} task(s) to ${result.tasksFilePath}`;
	} else {
		return `Task emission failed: ${result.error}`;
	}
}

// ============================================================================
// Re-exports
// ============================================================================

/**
 * Infer type from Zod schema for better type safety
 */
export type WizardTaskEmissionInputFromZod = z.infer<typeof WizardTaskEmissionInputSchema>;
export type ProjectMemoryBindingIntentFromZod = z.infer<typeof ProjectMemoryBindingIntentSchema>;
export type PlaybookTaskGraphNodeFromZod = z.infer<typeof PlaybookTaskGraphNodeSchema>;

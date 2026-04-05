/**
 * Wizard Task Emission Service
 *
 * Service wrapper for Wizard integration with task emission IPC.
 * Provides loading state management, user-friendly error handling,
 * and success callbacks for the Wizard UI.
 */

import type { Playbook } from '../../shared/types';
import type { WizardEmissionErrorCategory } from '../../shared/wizardTypes';
import type { WizardTaskEmissionError } from '../../main/wizard-task-emitter';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for emitting Wizard tasks
 */
export interface EmitWizardTasksOptions {
	/** Force overwrite if tasks.json already exists */
	force?: boolean;
	/** Preview emission without writing files */
	dryRun?: boolean;
}

/**
 * Diagnostics returned after emission
 */
export interface EmissionDiagnostics {
	/** Number of tasks emitted */
	taskCount: number;
	/** Number of duplicate tasks skipped during emission */
	skippedCount?: number;
	/** Number of invalid tasks rejected during emission */
	invalidCount?: number;
	/** Repo root where tasks were emitted */
	repoRoot: string;
	/** Source branch from binding intent */
	sourceBranch: string;
	/** Binding preference that was applied */
	bindingPreference: string;
}

/**
 * Result of successful task emission
 */
export interface EmitWizardTasksSuccess {
	/** Emission succeeded */
	success: true;
	/** List of emitted task IDs */
	emittedTaskIds: string[];
	/** Path to the written tasks.json file */
	tasksFilePath: string;
	/** Whether emission only partially succeeded */
	partialSuccess?: boolean;
	/** Duplicate task ids that were not emitted */
	skippedTaskIds?: string[];
	/** Invalid task ids that were not emitted */
	invalidTaskIds?: string[];
	/** Validation errors returned by the emitter */
	validationErrors?: WizardTaskEmissionError[];
	/** Diagnostic information about the emission */
	diagnostics: EmissionDiagnostics;
}

/**
 * Result of failed task emission
 */
export interface EmitWizardTasksFailure {
	/** Emission failed */
	success: false;
	/** Error message describing what went wrong */
	error: string;
	/** Category of error for programmatic handling */
	errorCategory?: WizardEmissionErrorCategory;
	/** Suggested actions to fix the error */
	recoverySuggestions?: string[];
}

/**
 * Result of task emission operation
 */
export type EmitWizardTasksResult = EmitWizardTasksSuccess | EmitWizardTasksFailure;

/**
 * Callback fired when emission succeeds
 */
export type EmissionSuccessCallback = (result: EmitWizardTasksSuccess) => void;

/**
 * Callback fired when emission fails
 */
export type EmissionErrorCallback = (error: EmitWizardTasksFailure) => void;

/**
 * Callback fired when loading state changes
 */
export type LoadingStateCallback = (isLoading: boolean) => void;

// ============================================================================
// Error Recovery Suggestions
// ============================================================================

/**
 * Map of error patterns to recovery suggestions
 */
const ERROR_RECOVERY_SUGGESTIONS: Record<string, string[]> = {
	// Permission errors
	'Permission denied': [
		'Check that you have write permissions to the repository directory',
		'On macOS/Linux, run: chmod -R u+w <repo-root>/project_memory',
		'On Windows, check folder properties and ensure your user has Write access',
	],
	EACCES: [
		'You do not have permission to write to this directory',
		'Check the repository folder permissions',
	],
	EPERM: [
		'The file or directory is locked or read-only',
		'Close any other applications using the repository',
		'Check if the directory is set to read-only',
	],

	// Path errors
	ENOENT: [
		'The specified repository path does not exist',
		'Verify the repo root path is correct',
		'Use an absolute path like /Users/you/project or C:\\Users\\you\\project',
	],
	'not a directory': [
		'The path specified is a file, not a directory',
		'Point to the repository root folder instead',
	],
	'Invalid or missing repoRoot': [
		'The playbook does not have a valid repository root configured',
		'Ensure projectMemoryBindingIntent.repoRoot is set in the playbook',
		'The repoRoot should be an absolute path to your project',
	],

	// Validation errors
	'missing projectMemoryBindingIntent': [
		'This playbook does not have project memory binding configured',
		'Only DAG-shaped playbooks with taskGraph can emit tasks',
		'Try saving the playbook again with project memory binding enabled',
	],
	'malformed-task-graph': [
		'The task graph has structural issues',
		'Check that all task IDs are unique',
		'Verify all dependency references point to existing tasks',
		'Ensure there are no circular dependencies',
	],
	'validation-failed': [
		'The playbook metadata is invalid',
		'Check that all required fields are present',
		'Verify the taskGraph has at least one node',
	],

	// File system errors
	'tasks.json already exists': [
		'The tasks.json file already exists in this repository',
		'Use the "force" option to overwrite existing tasks',
		'Or delete the existing file: <repo-root>/project_memory/tasks/tasks.json',
	],
	'disk full': [
		'There is not enough disk space to write the tasks file',
		'Free up disk space and try again',
	],
};

/**
 * Get recovery suggestions for an error message
 *
 * @param errorMessage - The error message from emission
 * @returns Array of recovery suggestions
 */
function getRecoverySuggestions(errorMessage: string): string[] {
	const suggestions: string[] = [];

	// Check each error pattern
	for (const [pattern, patternSuggestions] of Object.entries(ERROR_RECOVERY_SUGGESTIONS)) {
		if (errorMessage.toLowerCase().includes(pattern.toLowerCase())) {
			suggestions.push(...patternSuggestions);
		}
	}

	// Default suggestion if no patterns matched
	if (suggestions.length === 0) {
		suggestions.push(
			'Check the repository path and permissions',
			'Try running the wizard-emit CLI command manually for more details'
		);
	}

	return [...new Set(suggestions)]; // Remove duplicates
}

/**
 * Determine error category from error message
 *
 * @param errorMessage - The error message from emission
 * @returns Error category or undefined if unknown
 */
function categorizeError(errorMessage: string): WizardEmissionErrorCategory | undefined {
	const lowerError = errorMessage.toLowerCase();

	if (lowerError.includes('missing') || lowerError.includes('invalid')) {
		return 'missing-metadata';
	}

	if (
		lowerError.includes('taskgraph') ||
		lowerError.includes('task graph') ||
		lowerError.includes('circular')
	) {
		return 'malformed-task-graph';
	}

	if (
		lowerError.includes('permission') ||
		lowerError.includes('eacces') ||
		lowerError.includes('eperm') ||
		lowerError.includes('enoent')
	) {
		return 'file-system-error';
	}

	return 'validation-failed';
}

// ============================================================================
// Service Interface
// ============================================================================

export interface WizardTaskEmissionService {
	/**
	 * Emit Wizard tasks to repo-local task-sync storage
	 *
	 * @param playbook - The playbook to emit tasks from
	 * @param options - Emission options (force, dryRun)
	 * @returns Promise resolving to emission result
	 */
	emitWizardTasks: (
		playbook: Playbook,
		options?: EmitWizardTasksOptions
	) => Promise<EmitWizardTasksResult>;

	/**
	 * Subscribe to loading state changes
	 *
	 * @param callback - Callback fired when loading state changes
	 * @returns Unsubscribe function
	 */
	onLoadingChange: (callback: LoadingStateCallback) => () => void;

	/**
	 * Subscribe to emission success events
	 *
	 * @param callback - Callback fired when emission succeeds
	 * @returns Unsubscribe function
	 */
	onSuccess: (callback: EmissionSuccessCallback) => () => void;

	/**
	 * Subscribe to emission error events
	 *
	 * @param callback - Callback fired when emission fails
	 * @returns Unsubscribe function
	 */
	onError: (callback: EmissionErrorCallback) => () => void;

	/**
	 * Get current loading state
	 */
	isLoading: () => boolean;

	/**
	 * Get user-friendly error message with recovery suggestions
	 *
	 * @param error - The emission failure
	 * @returns Formatted error message with suggestions
	 */
	formatError: (error: EmitWizardTasksFailure) => string;
}

// ============================================================================
// Service Implementation
// ============================================================================

class WizardTaskEmissionServiceImpl implements WizardTaskEmissionService {
	private loading = false;
	private loadingCallbacks: Set<LoadingStateCallback> = new Set();
	private successCallbacks: Set<EmissionSuccessCallback> = new Set();
	private errorCallbacks: Set<EmissionErrorCallback> = new Set();

	/**
	 * Update loading state and notify subscribers
	 */
	private setLoading(loading: boolean): void {
		this.loading = loading;
		this.loadingCallbacks.forEach((cb) => cb(loading));
	}

	/**
	 * Notify success subscribers
	 */
	private notifySuccess(result: EmitWizardTasksSuccess): void {
		this.successCallbacks.forEach((cb) => cb(result));
	}

	/**
	 * Notify error subscribers
	 */
	private notifyError(error: EmitWizardTasksFailure): void {
		this.errorCallbacks.forEach((cb) => cb(error));
	}

	/**
	 * Emit Wizard tasks to repo-local task-sync storage
	 */
	emitWizardTasks = async (
		playbook: Playbook,
		options?: EmitWizardTasksOptions
	): Promise<EmitWizardTasksResult> => {
		this.setLoading(true);

		try {
			// Call IPC directly to preserve return type
			const ipcResult = await window.maestro.projectMemory.emitWizardTasks(playbook, options);

			// Handle IPC failure response
			if (!ipcResult.success) {
				const errorMessage = ipcResult.error;
				const recoverySuggestions = getRecoverySuggestions(errorMessage);
				const errorCategory = categorizeError(errorMessage);

				const failureResult: EmitWizardTasksFailure = {
					success: false,
					error: errorMessage,
					errorCategory,
					recoverySuggestions,
				};

				this.notifyError(failureResult);
				return failureResult;
			}

			// Transform IPC result to our result type
			const successResult: EmitWizardTasksSuccess = {
				success: true,
				emittedTaskIds: ipcResult.emittedTaskIds,
				tasksFilePath: ipcResult.tasksFilePath,
				partialSuccess: ipcResult.partialSuccess,
				skippedTaskIds: ipcResult.skippedTaskIds,
				invalidTaskIds: ipcResult.invalidTaskIds,
				validationErrors: ipcResult.validationErrors,
				diagnostics: ipcResult.diagnostics,
			};

			this.notifySuccess(successResult);
			return successResult;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			const recoverySuggestions = getRecoverySuggestions(errorMessage);
			const errorCategory = categorizeError(errorMessage);

			const failureResult: EmitWizardTasksFailure = {
				success: false,
				error: errorMessage,
				errorCategory,
				recoverySuggestions,
			};

			this.notifyError(failureResult);
			return failureResult;
		} finally {
			this.setLoading(false);
		}
	};

	/**
	 * Subscribe to loading state changes
	 */
	onLoadingChange = (callback: LoadingStateCallback): (() => void) => {
		this.loadingCallbacks.add(callback);
		return () => this.loadingCallbacks.delete(callback);
	};

	/**
	 * Subscribe to emission success events
	 */
	onSuccess = (callback: EmissionSuccessCallback): (() => void) => {
		this.successCallbacks.add(callback);
		return () => this.successCallbacks.delete(callback);
	};

	/**
	 * Subscribe to emission error events
	 */
	onError = (callback: EmissionErrorCallback): (() => void) => {
		this.errorCallbacks.add(callback);
		return () => this.errorCallbacks.delete(callback);
	};

	/**
	 * Get current loading state
	 */
	isLoading = (): boolean => this.loading;

	/**
	 * Format error with recovery suggestions
	 */
	formatError = (error: EmitWizardTasksFailure): string => {
		let message = `Task emission failed: ${error.error}`;

		if (error.recoverySuggestions && error.recoverySuggestions.length > 0) {
			message += '\n\nSuggested fixes:\n';
			message += error.recoverySuggestions.map((s) => `• ${s}`).join('\n');
		}

		return message;
	};
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Singleton instance of the Wizard task emission service
 */
export const wizardTaskEmissionService: WizardTaskEmissionService =
	new WizardTaskEmissionServiceImpl();

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick emission function for simple use cases
 *
 * @param playbook - The playbook to emit tasks from
 * @param options - Emission options
 * @returns Promise resolving to emission result
 */
export async function emitWizardTasks(
	playbook: Playbook,
	options?: EmitWizardTasksOptions
): Promise<EmitWizardTasksResult> {
	return wizardTaskEmissionService.emitWizardTasks(playbook, options);
}

/**
 * Format an emission error for display
 *
 * @param error - The emission failure
 * @returns User-friendly error message
 */
export function formatEmissionError(error: EmitWizardTasksFailure): string {
	return wizardTaskEmissionService.formatError(error);
}

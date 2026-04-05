// Wizard Emit Command
// CLI tool for emitting repo-local tasks from Wizard-generated playbooks

import * as fs from 'fs';
import { emitWizardTasks, validateWizardTaskEmission } from '../../main/wizard-task-emitter';
import type { Playbook } from '../../shared/types';

interface WizardEmitOptions {
	/** Dry run - don't write files */
	dryRun?: boolean;
	/** Validate only - check structure without emission */
	validate?: boolean;
	/** Force overwrite existing tasks.json */
	force?: boolean;
	/** Output as JSON */
	json?: boolean;
	/** Override repo root from playbook */
	repoRoot?: string;
}

interface LoadPlaybookResult {
	playbook?: Playbook;
	error?: string;
}

/**
 * Load a playbook from a file path
 */
function loadPlaybook(playbookPath: string): LoadPlaybookResult {
	try {
		// Resolve absolute path
		const absolutePath = playbookPath.startsWith('/')
			? playbookPath
			: `${process.cwd()}/${playbookPath}`;

		// Check file exists
		if (!fs.existsSync(absolutePath)) {
			return {
				error: `Playbook file not found: ${absolutePath}`,
			};
		}

		// Read and parse playbook
		const content = fs.readFileSync(absolutePath, 'utf-8');
		const playbook = JSON.parse(content) as Playbook;

		// Basic structure validation
		if (!playbook || typeof playbook !== 'object') {
			return {
				error: 'Invalid playbook: not a valid JSON object',
			};
		}

		return { playbook };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			error: `Failed to load playbook: ${message}`,
		};
	}
}

/**
 * Override repo root in playbook if specified
 */
function overrideRepoRootIfNeeded(playbook: Playbook, repoRoot?: string): Playbook {
	if (!repoRoot || !playbook.projectMemoryBindingIntent) {
		return playbook;
	}

	return {
		...playbook,
		projectMemoryBindingIntent: {
			...playbook.projectMemoryBindingIntent,
			repoRoot,
		},
	};
}

/**
 * Format emission result for output
 */
function formatResult(result: ReturnType<typeof emitWizardTasks>, playbookPath: string): string {
	const lines = [
		'Wizard Task Emission Result',
		'===========================',
		``,
		`Playbook: ${playbookPath}`,
		`Success: ${result.success ? '✓' : '✗'}`,
	];

	if (result.success) {
		lines.push(`Emitted Tasks: ${result.emittedTaskIds.length}`);
		if (result.emittedTaskIds.length > 0) {
			lines.push('Task IDs:');
			result.emittedTaskIds.forEach((id) => {
				lines.push(`  - ${id}`);
			});
		}
		lines.push(`Tasks File: ${result.tasksFilePath}`);

		if (result.diagnostics) {
			lines.push('');
			lines.push('Diagnostics:');
			lines.push(`  Task Count: ${result.diagnostics.taskCount}`);
			lines.push(`  Repo Root: ${result.diagnostics.repoRoot}`);
			lines.push(`  Source Branch: ${result.diagnostics.sourceBranch}`);
			lines.push(`  Binding Preference: ${result.diagnostics.bindingPreference}`);
		}
	} else {
		lines.push(`Error: ${result.error}`);
	}

	return lines.join('\n');
}

/**
 * Format validation result for output
 */
function formatValidationResult(
	playbookPath: string,
	result: ReturnType<typeof validateWizardTaskEmission>
): string {
	const lines = [
		'Wizard Task Emission Validation',
		'=================================',
		``,
		`Playbook: ${playbookPath}`,
		`Valid: ${result.valid ? '✓' : '✗'}`,
	];

	if (!result.valid && result.errors.length > 0) {
		lines.push('');
		lines.push('Errors:');
		result.errors.forEach((error, index) => {
			lines.push(`  ${index + 1}. ${error.message}`);
			if (error.field) {
				lines.push(`     Field: ${error.field}`);
			}
		});
	}

	if (result.warnings.length > 0) {
		lines.push('');
		lines.push('Warnings:');
		result.warnings.forEach((warning, index) => {
			lines.push(`  ${index + 1}. ${warning}`);
		});
	}

	return lines.join('\n');
}

/**
 * Print usage examples
 */
function printExamples(): void {
	const examples = [
		'',
		'Examples:',
		'',
		'  # Validate a playbook structure',
		'  maestro-cli wizard-emit ./playbook.json --validate',
		'',
		'  # Dry run to see what would be emitted',
		'  maestro-cli wizard-emit ./playbook.json --dry-run',
		'',
		'  # Emit tasks to repo-local storage',
		'  maestro-cli wizard-emit ./playbook.json',
		'',
		'  # Override repo root',
		'  maestro-cli wizard-emit ./playbook.json --repo-root /path/to/repo',
		'',
		'  # Force overwrite existing tasks.json',
		'  maestro-cli wizard-emit ./playbook.json --force',
		'',
		'  # Output as JSON for scripting',
		'  maestro-cli wizard-emit ./playbook.json --json',
		'',
	].join('\n');

	console.error(examples);
}

/**
 * Main command handler for wizard-emit
 */
export function wizardEmitCommand(playbookPath: string, options: WizardEmitOptions): void {
	// Load playbook from file
	const { playbook, error: loadError } = loadPlaybook(playbookPath);

	if (loadError || !playbook) {
		const output = {
			success: false,
			error: loadError || 'Unknown load error',
		};

		if (options.json) {
			console.log(JSON.stringify(output, null, 2));
		} else {
			console.error(`Error: ${loadError}`);
			console.error('');
			console.error('Usage: maestro-cli wizard-emit <playbook-file> [options]');
			console.error('');
			printExamples();
		}

		process.exit(1);
	}

	// Apply repo root override if specified
	const playbookToProcess = overrideRepoRootIfNeeded(playbook, options.repoRoot);

	// Handle validation-only mode
	if (options.validate) {
		const validationResult = validateWizardTaskEmission(playbookToProcess);

		if (options.json) {
			console.log(JSON.stringify(validationResult, null, 2));
		} else {
			console.log(formatValidationResult(playbookPath, validationResult));
		}

		process.exit(validationResult.valid ? 0 : 1);
	}

	// Perform emission (or dry run)
	const result = emitWizardTasks(playbookToProcess, {
		dryRun: options.dryRun,
		force: options.force,
	});

	if (options.json) {
		console.log(JSON.stringify(result, null, 2));
	} else {
		console.log(formatResult(result, playbookPath));

		if (!result.success && result.error) {
			console.error('');
			console.error('Common issues:');
			console.error('  • Missing projectMemoryBindingIntent in playbook');
			console.error('  • Malformed taskGraph (missing nodes or invalid structure)');
			console.error('  • tasks.json already exists (use --force to overwrite)');
			console.error('');
			console.error('Use --validate to check playbook structure before emission');
			console.error('');
			printExamples();
		}
	}

	process.exit(result.success ? 0 : 1);
}

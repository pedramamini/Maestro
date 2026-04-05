/**
 * Tests for wizard-task-emitter module
 *
 * Tests the transformation of Wizard playbook configs with projectMemoryBindingIntent
 * metadata into repo-local task records under project_memory/tasks/.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
	emitWizardTasks,
	validateWizardTaskEmission,
	canEmitWizardTasks,
} from '../../main/wizard-task-emitter';
import type { Playbook } from '../../shared/types';
import type { ProjectMemoryBindingIntent } from '../../shared/projectMemory';

describe('wizard-task-emitter', () => {
	// Temporary directory for test files
	let tempDir: string;
	let repoRoot: string;

	beforeEach(() => {
		// Create a unique temporary directory for each test
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-test-'));
		repoRoot = tempDir;
	});

	afterEach(() => {
		// Clean up temporary directory
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	describe('validateWizardTaskEmission', () => {
		it('should validate a playbook with all required fields', () => {
			const playbook: Partial<Playbook> = {
				id: 'test-playbook-1',
				name: 'Test Playbook',
				documents: [
					{ filename: 'task-01.md', resetOnCompletion: false },
					{ filename: 'task-02.md', resetOnCompletion: false },
				],
				taskGraph: {
					nodes: [
						{ id: 'task-01', documentIndex: 0, dependsOn: [] },
						{ id: 'task-02', documentIndex: 1, dependsOn: ['task-01'] },
					],
				},
				projectMemoryBindingIntent: {
					policyVersion: '2026-04-04',
					repoRoot: '/test/repo',
					sourceBranch: 'main',
					bindingPreference: 'shared-branch-serialized',
					sharedCheckoutAllowed: true,
					reuseExistingBinding: false,
					allowRebindIfStale: false,
				},
			};

			const result = validateWizardTaskEmission(playbook);

			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
			expect(result.warnings).toHaveLength(0);
		});

		it('should fail validation when projectMemoryBindingIntent is missing', () => {
			const playbook: Partial<Playbook> = {
				id: 'test-playbook-1',
				name: 'Test Playbook',
				documents: [{ filename: 'task-01.md', resetOnCompletion: false }],
				taskGraph: {
					nodes: [{ id: 'task-01', documentIndex: 0, dependsOn: [] }],
				},
				// Missing projectMemoryBindingIntent
			};

			const result = validateWizardTaskEmission(playbook);

			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
			expect(result.errors[0].category).toBe('missing-metadata');
		});

		it('should fail validation when projectMemoryBindingIntent has missing required fields', () => {
			const playbook: Partial<Playbook> = {
				id: 'test-playbook-1',
				name: 'Test Playbook',
				documents: [{ filename: 'task-01.md', resetOnCompletion: false }],
				taskGraph: {
					nodes: [{ id: 'task-01', documentIndex: 0, dependsOn: [] }],
				},
				projectMemoryBindingIntent: {
					policyVersion: '2026-04-04',
					repoRoot: '/test/repo',
					// Missing sourceBranch
					bindingPreference: 'shared-branch-serialized',
					sharedCheckoutAllowed: true,
					reuseExistingBinding: false,
					allowRebindIfStale: false,
				} as ProjectMemoryBindingIntent,
			};

			const result = validateWizardTaskEmission(playbook);

			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.field === 'projectMemoryBindingIntent.sourceBranch')).toBe(
				true
			);
		});

		it('should fail validation when taskGraph is missing', () => {
			const playbook: Partial<Playbook> = {
				id: 'test-playbook-1',
				name: 'Test Playbook',
				documents: [{ filename: 'task-01.md', resetOnCompletion: false }],
				// Missing taskGraph
				projectMemoryBindingIntent: {
					policyVersion: '2026-04-04',
					repoRoot: '/test/repo',
					sourceBranch: 'main',
					bindingPreference: 'shared-branch-serialized',
					sharedCheckoutAllowed: true,
					reuseExistingBinding: false,
					allowRebindIfStale: false,
				},
			};

			const result = validateWizardTaskEmission(playbook);

			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.field === 'taskGraph')).toBe(true);
		});

		it('should fail validation when taskGraph.nodes is empty', () => {
			const playbook: Partial<Playbook> = {
				id: 'test-playbook-1',
				name: 'Test Playbook',
				documents: [{ filename: 'task-01.md', resetOnCompletion: false }],
				taskGraph: {
					nodes: [], // Empty nodes array
				},
				projectMemoryBindingIntent: {
					policyVersion: '2026-04-04',
					repoRoot: '/test/repo',
					sourceBranch: 'main',
					bindingPreference: 'shared-branch-serialized',
					sharedCheckoutAllowed: true,
					reuseExistingBinding: false,
					allowRebindIfStale: false,
				},
			};

			const result = validateWizardTaskEmission(playbook);

			expect(result.valid).toBe(false);
		});

		it('should fail validation when task nodes are missing required properties', () => {
			const playbook: Partial<Playbook> = {
				id: 'test-playbook-1',
				name: 'Test Playbook',
				documents: [{ filename: 'task-01.md', resetOnCompletion: false }],
				taskGraph: {
					nodes: [
						{
							// Missing id
							documentIndex: 0,
							dependsOn: [],
						} as any,
					],
				},
				projectMemoryBindingIntent: {
					policyVersion: '2026-04-04',
					repoRoot: '/test/repo',
					sourceBranch: 'main',
					bindingPreference: 'shared-branch-serialized',
					sharedCheckoutAllowed: true,
					reuseExistingBinding: false,
					allowRebindIfStale: false,
				},
			};

			const result = validateWizardTaskEmission(playbook);

			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
		});

		it('should fail validation when node references non-existent documentIndex', () => {
			const playbook: Partial<Playbook> = {
				id: 'test-playbook-1',
				name: 'Test Playbook',
				documents: [{ filename: 'task-01.md', resetOnCompletion: false }],
				taskGraph: {
					nodes: [
						{ id: 'task-01', documentIndex: 0, dependsOn: [] },
						{ id: 'task-02', documentIndex: 5, dependsOn: ['task-01'] }, // documentIndex 5 doesn't exist
					],
				},
				projectMemoryBindingIntent: {
					policyVersion: '2026-04-04',
					repoRoot: '/test/repo',
					sourceBranch: 'main',
					bindingPreference: 'shared-branch-serialized',
					sharedCheckoutAllowed: true,
					reuseExistingBinding: false,
					allowRebindIfStale: false,
				},
			};

			const result = validateWizardTaskEmission(playbook);

			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.category === 'malformed-task-graph')).toBe(true);
			expect(result.errors.some((e) => e.relatedTaskIds?.includes('task-02'))).toBe(true);
		});

		it('should fail validation when duplicate node IDs exist', () => {
			const playbook: Partial<Playbook> = {
				id: 'test-playbook-1',
				name: 'Test Playbook',
				documents: [
					{ filename: 'task-01.md', resetOnCompletion: false },
					{ filename: 'task-02.md', resetOnCompletion: false },
				],
				taskGraph: {
					nodes: [
						{ id: 'task-01', documentIndex: 0, dependsOn: [] },
						{ id: 'task-02', documentIndex: 1, dependsOn: ['task-01'] },
						{ id: 'task-01', documentIndex: 1, dependsOn: [] }, // Duplicate ID
					],
				},
				projectMemoryBindingIntent: {
					policyVersion: '2026-04-04',
					repoRoot: '/test/repo',
					sourceBranch: 'main',
					bindingPreference: 'shared-branch-serialized',
					sharedCheckoutAllowed: true,
					reuseExistingBinding: false,
					allowRebindIfStale: false,
				},
			};

			const result = validateWizardTaskEmission(playbook);

			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.category === 'malformed-task-graph')).toBe(true);
			expect(result.errors.some((e) => e.message.includes('Duplicate taskGraph node IDs'))).toBe(
				true
			);
		});
	});

	describe('emitWizardTasks - simple 3-task sequential playbook', () => {
		it('should successfully emit a simple 3-task sequential playbook', () => {
			const playbook: Playbook = {
				id: 'test-playbook-1',
				name: 'Test Sequential Playbook',
				createdAt: Date.now(),
				updatedAt: Date.now(),
				documents: [
					{ filename: 'task-01-setup.md', resetOnCompletion: false },
					{ filename: 'task-02-implement.md', resetOnCompletion: false },
					{ filename: 'task-03-test.md', resetOnCompletion: false },
				],
				loopEnabled: false,
				prompt: 'Test prompt',
				taskGraph: {
					nodes: [
						{ id: 'task-01', documentIndex: 0, dependsOn: [] },
						{ id: 'task-02', documentIndex: 1, dependsOn: ['task-01'] },
						{ id: 'task-03', documentIndex: 2, dependsOn: ['task-02'] },
					],
				},
				projectMemoryBindingIntent: {
					policyVersion: '2026-04-04',
					repoRoot,
					sourceBranch: 'main',
					bindingPreference: 'shared-branch-serialized',
					sharedCheckoutAllowed: true,
					reuseExistingBinding: false,
					allowRebindIfStale: false,
				},
			};

			const result = emitWizardTasks(playbook);

			// Verify success
			expect(result.success).toBe(true);
			expect(result.emittedTaskIds).toEqual(['task-01', 'task-02', 'task-03']);
			expect(result.error).toBeUndefined();

			// Verify diagnostics
			expect(result.diagnostics).toBeDefined();
			expect(result.diagnostics!.taskCount).toBe(3);
			// repoRoot is normalized (symlinks resolved), so use realpathSync for comparison
			expect(result.diagnostics!.repoRoot).toBe(fs.realpathSync(repoRoot));
			expect(result.diagnostics!.sourceBranch).toBe('main');
			expect(result.diagnostics!.bindingPreference).toBe('shared-branch-serialized');

			// Verify tasks.json file was created
			// tasksFilePath uses normalized (symlink-resolved) path
			const normalizedRepoRoot = fs.realpathSync(repoRoot);
			const tasksFilePath = path.join(normalizedRepoRoot, 'project_memory', 'tasks', 'tasks.json');
			expect(result.tasksFilePath).toBe(tasksFilePath);
			expect(fs.existsSync(tasksFilePath)).toBe(true);

			// Verify file contents
			const tasksFile = JSON.parse(fs.readFileSync(tasksFilePath, 'utf-8'));
			expect(tasksFile.version).toBe('2026-04-04');
			expect(tasksFile.project_id).toBe(path.basename(repoRoot));
			expect(tasksFile.tasks).toHaveLength(3);

			// Verify task structure
			const task1 = tasksFile.tasks.find((t: any) => t.id === 'task-01');
			expect(task1).toBeDefined();
			expect(task1.title).toBe('task-01-setup.md');
			expect(task1.status).toBe('pending');
			expect(task1.depends_on).toEqual([]);

			const task2 = tasksFile.tasks.find((t: any) => t.id === 'task-02');
			expect(task2).toBeDefined();
			expect(task2.depends_on).toEqual(['task-01']);

			const task3 = tasksFile.tasks.find((t: any) => t.id === 'task-03');
			expect(task3).toBeDefined();
			expect(task3.depends_on).toEqual(['task-02']);

			// Verify defaults
			expect(tasksFile.defaults.repo_root).toBe(fs.realpathSync(repoRoot));
			expect(tasksFile.defaults.source_branch).toBe('main');
			expect(tasksFile.defaults.execution_mode).toBe('shared-serialized');
		});

		it('should emit with dryRun flag without writing files', () => {
			const playbook: Playbook = {
				id: 'test-playbook-1',
				name: 'Test Playbook',
				createdAt: Date.now(),
				updatedAt: Date.now(),
				documents: [
					{ filename: 'task-01.md', resetOnCompletion: false },
					{ filename: 'task-02.md', resetOnCompletion: false },
				],
				loopEnabled: false,
				prompt: 'Test prompt',
				taskGraph: {
					nodes: [
						{ id: 'task-01', documentIndex: 0, dependsOn: [] },
						{ id: 'task-02', documentIndex: 1, dependsOn: ['task-01'] },
					],
				},
				projectMemoryBindingIntent: {
					policyVersion: '2026-04-04',
					repoRoot,
					sourceBranch: 'main',
					bindingPreference: 'shared-branch-serialized',
					sharedCheckoutAllowed: true,
					reuseExistingBinding: false,
					allowRebindIfStale: false,
				},
			};

			const result = emitWizardTasks(playbook, { dryRun: true });

			// Verify success but no file written
			expect(result.success).toBe(true);
			expect(result.emittedTaskIds).toEqual(['task-01', 'task-02']);

			const tasksFilePath = path.join(repoRoot, 'project_memory', 'tasks', 'tasks.json');
			expect(fs.existsSync(tasksFilePath)).toBe(false);
		});
	});

	describe('emitWizardTasks - DAG-shaped playbook with fork and join', () => {
		it('should successfully emit a DAG-shaped playbook with fork and join nodes', () => {
			const playbook: Playbook = {
				id: 'test-playbook-dag',
				name: 'Test DAG Playbook',
				createdAt: Date.now(),
				updatedAt: Date.now(),
				documents: [
					{ filename: 'setup.md', resetOnCompletion: false },
					{ filename: 'feature-a.md', resetOnCompletion: false },
					{ filename: 'feature-b.md', resetOnCompletion: false },
					{ filename: 'integration.md', resetOnCompletion: false },
				],
				loopEnabled: false,
				prompt: 'Test prompt',
				taskGraph: {
					nodes: [
						{ id: 'setup', documentIndex: 0, dependsOn: [] },
						{ id: 'feature-a', documentIndex: 1, dependsOn: ['setup'] }, // Fork from setup
						{ id: 'feature-b', documentIndex: 2, dependsOn: ['setup'] }, // Fork from setup
						{ id: 'integration', documentIndex: 3, dependsOn: ['feature-a', 'feature-b'] }, // Join
					],
				},
				projectMemoryBindingIntent: {
					policyVersion: '2026-04-04',
					repoRoot,
					sourceBranch: 'main',
					bindingPreference: 'shared-branch-serialized',
					sharedCheckoutAllowed: true,
					reuseExistingBinding: false,
					allowRebindIfStale: false,
				},
			};

			const result = emitWizardTasks(playbook);

			// Verify success
			expect(result.success).toBe(true);
			expect(result.emittedTaskIds).toEqual(['setup', 'feature-a', 'feature-b', 'integration']);
			expect(result.diagnostics!.taskCount).toBe(4);

			// Verify file contents
			const tasksFilePath = path.join(repoRoot, 'project_memory', 'tasks', 'tasks.json');
			const tasksFile = JSON.parse(fs.readFileSync(tasksFilePath, 'utf-8'));

			// Verify DAG structure is preserved
			const setupTask = tasksFile.tasks.find((t: any) => t.id === 'setup');
			expect(setupTask.depends_on).toEqual([]);

			const featureATask = tasksFile.tasks.find((t: any) => t.id === 'feature-a');
			expect(featureATask.depends_on).toEqual(['setup']);

			const featureBTask = tasksFile.tasks.find((t: any) => t.id === 'feature-b');
			expect(featureBTask.depends_on).toEqual(['setup']);

			const integrationTask = tasksFile.tasks.find((t: any) => t.id === 'integration');
			expect(integrationTask.depends_on).toEqual(['feature-a', 'feature-b']); // Multiple dependencies preserved
		});

		it('should handle isolated-worktree mode correctly', () => {
			const playbook: Playbook = {
				id: 'test-playbook-isolated',
				name: 'Test Isolated Playbook',
				createdAt: Date.now(),
				updatedAt: Date.now(),
				documents: [
					{ filename: 'task-01.md', resetOnCompletion: false },
					{ filename: 'task-02.md', resetOnCompletion: false },
				],
				loopEnabled: false,
				prompt: 'Test prompt',
				taskGraph: {
					nodes: [
						{ id: 'task-01', documentIndex: 0, dependsOn: [], isolationMode: 'isolated-worktree' },
						{
							id: 'task-02',
							documentIndex: 1,
							dependsOn: ['task-01'],
							isolationMode: 'shared-checkout',
						},
					],
				},
				projectMemoryBindingIntent: {
					policyVersion: '2026-04-04',
					repoRoot,
					sourceBranch: 'main',
					bindingPreference: 'shared-branch-serialized',
					sharedCheckoutAllowed: true,
					reuseExistingBinding: false,
					allowRebindIfStale: false,
				},
			};

			const result = emitWizardTasks(playbook);

			expect(result.success).toBe(true);

			const tasksFilePath = path.join(repoRoot, 'project_memory', 'tasks', 'tasks.json');
			const tasksFile = JSON.parse(fs.readFileSync(tasksFilePath, 'utf-8'));

			// Verify isolation mode is mapped to execution_mode
			const task1 = tasksFile.tasks.find((t: any) => t.id === 'task-01');
			expect(task1.execution_mode).toBe('isolated');

			const task2 = tasksFile.tasks.find((t: any) => t.id === 'task-02');
			expect(task2.execution_mode).toBe('shared-serialized');
		});
	});

	describe('emitWizardTasks - dependency preservation', () => {
		it('should preserve complex dependency chains correctly', () => {
			const playbook: Playbook = {
				id: 'test-playbook-complex-deps',
				name: 'Test Complex Dependencies',
				createdAt: Date.now(),
				updatedAt: Date.now(),
				documents: [
					{ filename: 'base.md', resetOnCompletion: false },
					{ filename: 'layer1-a.md', resetOnCompletion: false },
					{ filename: 'layer1-b.md', resetOnCompletion: false },
					{ filename: 'layer2-a.md', resetOnCompletion: false },
					{ filename: 'layer2-b.md', resetOnCompletion: false },
					{ filename: 'final.md', resetOnCompletion: false },
				],
				loopEnabled: false,
				prompt: 'Test prompt',
				taskGraph: {
					nodes: [
						{ id: 'base', documentIndex: 0, dependsOn: [] },
						{ id: 'layer1-a', documentIndex: 1, dependsOn: ['base'] },
						{ id: 'layer1-b', documentIndex: 2, dependsOn: ['base'] },
						{ id: 'layer2-a', documentIndex: 3, dependsOn: ['layer1-a'] },
						{ id: 'layer2-b', documentIndex: 4, dependsOn: ['layer1-b'] },
						{ id: 'final', documentIndex: 5, dependsOn: ['layer2-a', 'layer2-b'] },
					],
				},
				projectMemoryBindingIntent: {
					policyVersion: '2026-04-04',
					repoRoot,
					sourceBranch: 'main',
					bindingPreference: 'shared-branch-serialized',
					sharedCheckoutAllowed: true,
					reuseExistingBinding: false,
					allowRebindIfStale: false,
				},
			};

			const result = emitWizardTasks(playbook);

			expect(result.success).toBe(true);

			const tasksFilePath = path.join(repoRoot, 'project_memory', 'tasks', 'tasks.json');
			const tasksFile = JSON.parse(fs.readFileSync(tasksFilePath, 'utf-8'));

			// Verify all dependency relationships are preserved
			const getTask = (id: string) => tasksFile.tasks.find((t: any) => t.id === id);

			expect(getTask('base').depends_on).toEqual([]);
			expect(getTask('layer1-a').depends_on).toEqual(['base']);
			expect(getTask('layer1-b').depends_on).toEqual(['base']);
			expect(getTask('layer2-a').depends_on).toEqual(['layer1-a']);
			expect(getTask('layer2-b').depends_on).toEqual(['layer1-b']);
			expect(getTask('final').depends_on).toEqual(['layer2-a', 'layer2-b']);
		});
	});

	describe('emitWizardTasks - error handling', () => {
		it('should succeed with deduplication when tasks.json already exists without force flag', () => {
			const playbook: Playbook = {
				id: 'test-playbook-1',
				name: 'Test Playbook',
				createdAt: Date.now(),
				updatedAt: Date.now(),
				documents: [{ filename: 'task-01.md', resetOnCompletion: false }],
				loopEnabled: false,
				prompt: 'Test prompt',
				taskGraph: {
					nodes: [{ id: 'task-01', documentIndex: 0, dependsOn: [] }],
				},
				projectMemoryBindingIntent: {
					policyVersion: '2026-04-04',
					repoRoot,
					sourceBranch: 'main',
					bindingPreference: 'shared-branch-serialized',
					sharedCheckoutAllowed: true,
					reuseExistingBinding: false,
					allowRebindIfStale: false,
				},
			};

			// Create an existing tasks.json file with task-01 already present
			const tasksDir = path.join(repoRoot, 'project_memory', 'tasks');
			fs.mkdirSync(tasksDir, { recursive: true });
			const existingTasksPath = path.join(tasksDir, 'tasks.json');
			fs.writeFileSync(
				existingTasksPath,
				JSON.stringify({
					version: '2026-04-04',
					tasks: [{ id: 'task-01', title: 'task-01.md', status: 'completed' }],
				})
			);

			const result = emitWizardTasks(playbook);

			// When all tasks are duplicates, success=false with skippedTaskIds
			expect(result.success).toBe(false);
			expect(result.partialSuccess).toBe(false);
			expect(result.emittedTaskIds).toEqual([]); // No new tasks emitted
			expect(result.skippedTaskIds).toEqual(['task-01']); // task-01 was skipped as duplicate
			expect(result.error).toContain('already exist');
		});

		it('should overwrite when tasks.json exists with force flag', () => {
			const playbook: Playbook = {
				id: 'test-playbook-1',
				name: 'Test Playbook',
				createdAt: Date.now(),
				updatedAt: Date.now(),
				documents: [{ filename: 'task-01.md', resetOnCompletion: false }],
				loopEnabled: false,
				prompt: 'Test prompt',
				taskGraph: {
					nodes: [{ id: 'task-01', documentIndex: 0, dependsOn: [] }],
				},
				projectMemoryBindingIntent: {
					policyVersion: '2026-04-04',
					repoRoot,
					sourceBranch: 'main',
					bindingPreference: 'shared-branch-serialized',
					sharedCheckoutAllowed: true,
					reuseExistingBinding: false,
					allowRebindIfStale: false,
				},
			};

			// Create an existing tasks.json file
			const tasksDir = path.join(repoRoot, 'project_memory', 'tasks');
			fs.mkdirSync(tasksDir, { recursive: true });
			const existingTasksPath = path.join(tasksDir, 'tasks.json');
			fs.writeFileSync(existingTasksPath, '{"old": "data"}');

			const result = emitWizardTasks(playbook, { force: true });

			expect(result.success).toBe(true);
			expect(result.emittedTaskIds).toEqual(['task-01']);

			// Verify file was overwritten
			const tasksFile = JSON.parse(fs.readFileSync(existingTasksPath, 'utf-8'));
			expect(tasksFile.old).toBeUndefined();
			expect(tasksFile.tasks).toBeDefined();
		});

		it('should fail when project_memory directory is not writable', () => {
			const playbook: Playbook = {
				id: 'test-playbook-1',
				name: 'Test Playbook',
				createdAt: Date.now(),
				updatedAt: Date.now(),
				documents: [{ filename: 'task-01.md', resetOnCompletion: false }],
				loopEnabled: false,
				prompt: 'Test prompt',
				taskGraph: {
					nodes: [{ id: 'task-01', documentIndex: 0, dependsOn: [] }],
				},
				projectMemoryBindingIntent: {
					policyVersion: '2026-04-04',
					repoRoot,
					sourceBranch: 'main',
					bindingPreference: 'shared-branch-serialized',
					sharedCheckoutAllowed: true,
					reuseExistingBinding: false,
					allowRebindIfStale: false,
				},
			};

			// Create project_memory directory structure and make the tasks directory read-only
			const projectMemoryDir = path.join(repoRoot, 'project_memory');
			const tasksDir = path.join(projectMemoryDir, 'tasks');
			fs.mkdirSync(tasksDir, { recursive: true });
			fs.chmodSync(tasksDir, 0o444); // Make tasks directory read-only

			const result = emitWizardTasks(playbook);

			// Clean up - restore permissions before test ends
			fs.chmodSync(tasksDir, 0o755);

			expect(result.success).toBe(false);
			expect(result.error).toContain('Failed to write tasks.json');
		});

		it('should fail validation for invalid playbook', () => {
			const playbook: Playbook = {
				id: 'test-playbook-1',
				name: 'Test Playbook',
				createdAt: Date.now(),
				updatedAt: Date.now(),
				documents: [{ filename: 'task-01.md', resetOnCompletion: false }],
				loopEnabled: false,
				prompt: 'Test prompt',
				taskGraph: {
					nodes: [{ id: 'task-01', documentIndex: 0, dependsOn: [] }],
				},
				// Missing projectMemoryBindingIntent
			} as any;

			const result = emitWizardTasks(playbook);

			expect(result.success).toBe(false);
			expect(result.error).toContain('Invalid playbook for task emission');
		});

		it('should fail when taskGraph is missing', () => {
			const playbook: Playbook = {
				id: 'test-playbook-1',
				name: 'Test Playbook',
				createdAt: Date.now(),
				updatedAt: Date.now(),
				documents: [{ filename: 'task-01.md', resetOnCompletion: false }],
				loopEnabled: false,
				prompt: 'Test prompt',
				taskGraph: undefined as any, // Explicitly undefined
				projectMemoryBindingIntent: {
					policyVersion: '2026-04-04',
					repoRoot,
					sourceBranch: 'main',
					bindingPreference: 'shared-branch-serialized',
					sharedCheckoutAllowed: true,
					reuseExistingBinding: false,
					allowRebindIfStale: false,
				},
			} as any;

			const result = emitWizardTasks(playbook);

			expect(result.success).toBe(false);
			expect(result.error).toContain('Missing taskGraph');
		});
	});

	describe('canEmitWizardTasks', () => {
		it('should return true for a valid playbook', () => {
			const playbook: Partial<Playbook> = {
				id: 'test-playbook-1',
				name: 'Test Playbook',
				documents: [{ filename: 'task-01.md', resetOnCompletion: false }],
				taskGraph: {
					nodes: [{ id: 'task-01', documentIndex: 0, dependsOn: [] }],
				},
				projectMemoryBindingIntent: {
					policyVersion: '2026-04-04',
					repoRoot: '/test/repo',
					sourceBranch: 'main',
					bindingPreference: 'shared-branch-serialized',
					sharedCheckoutAllowed: true,
					reuseExistingBinding: false,
					allowRebindIfStale: false,
				},
			};

			expect(canEmitWizardTasks(playbook)).toBe(true);
		});

		it('should return false for an invalid playbook', () => {
			const playbook: Partial<Playbook> = {
				id: 'test-playbook-1',
				name: 'Test Playbook',
				documents: [{ filename: 'task-01.md', resetOnCompletion: false }],
				// Missing taskGraph and projectMemoryBindingIntent
			};

			expect(canEmitWizardTasks(playbook)).toBe(false);
		});
	});
});

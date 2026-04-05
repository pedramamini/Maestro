#!/usr/bin/env node
// Maestro CLI
// Command-line interface for Maestro

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { listGroups } from './commands/list-groups';
import { listAgents } from './commands/list-agents';
import { listPlaybooks } from './commands/list-playbooks';
import { showPlaybook } from './commands/show-playbook';
import { showAgent } from './commands/show-agent';
import { cleanPlaybooks } from './commands/clean-playbooks';
import { createPlaybook } from './commands/create-playbook';
import { listTemplates } from './commands/list-templates';
import { send } from './commands/send';
import { listSessions } from './commands/list-sessions';
import {
	cleanupStaleTaskCommand,
	completeTaskCommand,
	failTaskCommand,
	heartbeatTaskCommand,
	lockTaskCommand,
	locksTaskCommand,
	nextTaskCommand,
	releaseTaskCommand,
	rebindTaskCommand,
	showTaskCommand,
	snapshotTaskCommand,
	validateTaskCommand,
} from './commands/task-sync';
import { wizardEmitCommand } from './commands/wizard-emit';

// Read version from package.json at runtime
function getVersion(): string {
	try {
		// When bundled, __dirname points to dist/cli, so go up to project root
		const packagePath = path.resolve(__dirname, '../../package.json');
		const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
		return packageJson.version;
	} catch {
		return '0.0.0';
	}
}

const program = new Command();

program.name('maestro-cli').description('Command-line interface for Maestro').version(getVersion());

// List commands
const list = program.command('list').description('List resources');

list
	.command('groups')
	.description('List all session groups')
	.option('--json', 'Output as JSON lines (for scripting)')
	.action(listGroups);

list
	.command('agents')
	.description('List all agents')
	.option('-g, --group <id>', 'Filter by group ID')
	.option('--json', 'Output as JSON lines (for scripting)')
	.action(listAgents);

list
	.command('playbooks')
	.description('List playbooks (optionally filter by agent)')
	.option('-a, --agent <id>', 'Agent ID (shows all if not specified)')
	.option('--json', 'Output as JSON lines (for scripting)')
	.action(listPlaybooks);

// Create commands
const create = program.command('create').description('Create resources');

create
	.command('playbook <name>')
	.description('Create a new playbook for an agent')
	.requiredOption('-a, --agent <id>', 'Agent ID (partial ok)')
	.option('-f, --folder <path>', 'Folder containing playbook documents')
	.option('-d, --docs <list>', 'Comma-separated list of document filenames')
	.option('-p, --prompt <text>', 'Optional prompt for the playbook')
	.option('-t, --template <name>', 'Template name (agi-way)')
	.option('--description <text>', 'Optional description stored in the prompt')
	.option('--tasks <json>', 'JSON array of task ids or task objects')
	.option('--dry-run', 'Show what would be created without writing')
	.option('--json', 'Output as JSON (for scripting)')
	.option('--force', 'Overwrite an existing playbook with the same name')
	.option('--print-path', 'Print the playbooks file path after creation')
	.action(createPlaybook);

const templates = program.command('templates').description('List templates');

templates
	.command('list')
	.description('List available playbook templates')
	.option('--json', 'Output as JSON (for scripting)')
	.action(listTemplates);

list
	.command('sessions <agent-id>')
	.description('List agent sessions (most recent first)')
	.option('-l, --limit <count>', 'Maximum number of sessions to show (default: 25)')
	.option('-k, --skip <count>', 'Number of sessions to skip for pagination (default: 0)')
	.option('-s, --search <keyword>', 'Filter sessions by keyword in name or first message')
	.option('--json', 'Output as JSON (for scripting)')
	.action(listSessions);

// Show command
const show = program.command('show').description('Show details of a resource');

show
	.command('agent <id>')
	.description('Show agent details including history and usage stats')
	.option('--json', 'Output as JSON (for scripting)')
	.action(showAgent);

show
	.command('playbook <id>')
	.description('Show detailed information about a playbook')
	.option('--json', 'Output as JSON (for scripting)')
	.action(showPlaybook);

// Playbook command (lazy-loaded to avoid eager resolution of generated/prompts)
program
	.command('playbook <playbook-id>')
	.description('Run a playbook')
	.option('--dry-run', 'Show what would be executed without running')
	.option('--no-history', 'Do not write history entries')
	.option('--json', 'Output as JSON lines (for scripting)')
	.option('--debug', 'Show detailed debug output for troubleshooting')
	.option('--verbose', 'Show full prompt sent to agent on each iteration')
	.option('--wait', 'Wait for agent to become available if busy')
	.option(
		'--max-wait-ms <ms>',
		'Maximum time to wait for a busy agent before failing (default: 600000, use 0 to disable)',
		(value: string) => Number(value)
	)
	.action(async (playbookId: string, options: Record<string, unknown>) => {
		const { runPlaybook } = await import('./commands/run-playbook');
		return runPlaybook(playbookId, options);
	});

// Clean command
const clean = program.command('clean').description('Clean up orphaned resources');

clean
	.command('playbooks')
	.description('Remove playbooks for deleted sessions')
	.option('--dry-run', 'Show what would be removed without actually removing')
	.option('--json', 'Output as JSON (for scripting)')
	.action(cleanPlaybooks);

// Send command - send a message to an agent and get a JSON response
program
	.command('send <agent-id> <message>')
	.description('Send a message to an agent and get a JSON response')
	.option('-s, --session <id>', 'Resume an existing agent session (for multi-turn conversations)')
	.action(send);

const taskSync = program
	.command('task-sync')
	.description('Manage project_memory task locks and execution state');

taskSync
	.command('next')
	.description('Claim the next runnable task')
	.option('--repo-root <path>', 'Repo root containing project_memory')
	.option('--executor <id>', 'Executor ID to own the lock')
	.option('--no-json', 'Print plain output instead of JSON')
	.action(nextTaskCommand);

taskSync
	.command('snapshot')
	.description('Show repo-local project_memory snapshot')
	.option('--repo-root <path>', 'Repo root containing project_memory')
	.option('--no-json', 'Print plain output instead of JSON')
	.action(snapshotTaskCommand);

taskSync
	.command('show <task-id>')
	.description('Show repo-local project_memory detail for one task')
	.option('--repo-root <path>', 'Repo root containing project_memory')
	.option('--no-json', 'Print plain output instead of JSON')
	.action(showTaskCommand);

taskSync
	.command('lock <task-id>')
	.description('Claim a specific task')
	.option('--repo-root <path>', 'Repo root containing project_memory')
	.option('--executor <id>', 'Executor ID to own the lock')
	.option('--no-json', 'Print plain output instead of JSON')
	.action(lockTaskCommand);

taskSync
	.command('heartbeat <task-id>')
	.description('Refresh runtime heartbeat and lock expiry')
	.option('--repo-root <path>', 'Repo root containing project_memory')
	.option('--executor <id>', 'Executor ID that owns the task')
	.option('--no-json', 'Print plain output instead of JSON')
	.action(heartbeatTaskCommand);

taskSync
	.command('complete <task-id>')
	.description('Mark a task as completed and release its locks')
	.option('--repo-root <path>', 'Repo root containing project_memory')
	.option('--executor <id>', 'Executor ID that owns the task')
	.option('--no-json', 'Print plain output instead of JSON')
	.action(completeTaskCommand);

taskSync
	.command('fail <task-id>')
	.description('Mark a task as failed and release its locks')
	.option('--repo-root <path>', 'Repo root containing project_memory')
	.option('--executor <id>', 'Executor ID that owns the task')
	.option('--no-json', 'Print plain output instead of JSON')
	.action(failTaskCommand);

taskSync
	.command('release <task-id>')
	.description('Release a task lock and return it to pending')
	.option('--repo-root <path>', 'Repo root containing project_memory')
	.option('--executor <id>', 'Executor ID that owns the task')
	.option('--no-json', 'Print plain output instead of JSON')
	.action(releaseTaskCommand);

taskSync
	.command('locks')
	.description('Show current task and worktree lock records')
	.option('--repo-root <path>', 'Repo root containing project_memory')
	.option('--no-json', 'Print plain output instead of JSON')
	.action(locksTaskCommand);

taskSync
	.command('validate')
	.description('Validate repo-local project_memory task-sync state')
	.option('--repo-root <path>', 'Repo root containing project_memory')
	.option('--no-json', 'Print plain output instead of JSON')
	.action(validateTaskCommand);

taskSync
	.command('cleanup-stale')
	.description('Delete expired lock records and mark related runtime state as stale')
	.option('--repo-root <path>', 'Repo root containing project_memory')
	.option('--no-json', 'Print plain output instead of JSON')
	.action(cleanupStaleTaskCommand);

taskSync
	.command('rebind <task-id>')
	.description('Clear stale task state so the task can be bound again explicitly')
	.option('--repo-root <path>', 'Repo root containing project_memory')
	.option('--no-json', 'Print plain output instead of JSON')
	.action(rebindTaskCommand);

// Wizard emit command
program
	.command('wizard-emit <playbook-file>')
	.description('Emit repo-local tasks from a Wizard-generated playbook')
	.option('--dry-run', 'Show what would be emitted without writing files')
	.option('--validate', 'Validate playbook structure without emission')
	.option('--force', 'Force overwrite existing tasks.json')
	.option('--repo-root <path>', 'Override repo root from playbook')
	.option('--json', 'Output as JSON (for scripting)')
	.action(wizardEmitCommand);

program.parse();

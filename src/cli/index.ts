#!/usr/bin/env node
// Maestro Playbook CLI
// Run Maestro playbooks from the command line

import { Command } from 'commander';
import { listGroups } from './commands/list-groups';
import { listAgents } from './commands/list-agents';
import { listPlaybooks } from './commands/list-playbooks';
import { runPlaybook } from './commands/run-playbook';

const program = new Command();

program
  .name('maestro-playbook')
  .description('CLI for running Maestro playbooks')
  .version('0.1.0');

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

// Run command
program
  .command('run')
  .description('Run a playbook')
  .requiredOption('-p, --playbook <id>', 'Playbook ID')
  .option('-a, --agent <id>', 'Agent ID (auto-detected from playbook if not specified)')
  .option('--dry-run', 'Show what would be executed without running')
  .option('--no-history', 'Do not write history entries')
  .option('--json', 'Output as JSON lines (for scripting)')
  .option('--debug', 'Show detailed debug output for troubleshooting')
  .action(runPlaybook);

program.parse();

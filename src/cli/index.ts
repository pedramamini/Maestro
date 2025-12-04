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
  .action(listGroups);

list
  .command('agents')
  .description('List all agents/sessions')
  .option('-g, --group <id>', 'Filter by group ID')
  .action(listAgents);

list
  .command('playbooks')
  .description('List playbooks for a session')
  .requiredOption('-s, --session <id>', 'Session ID')
  .action(listPlaybooks);

// Run command
program
  .command('run')
  .description('Run a playbook')
  .requiredOption('-s, --session <id>', 'Session ID')
  .requiredOption('-p, --playbook <id>', 'Playbook ID')
  .option('--dry-run', 'Show what would be executed without running')
  .option('--no-history', 'Do not write history entries')
  .action(runPlaybook);

program.parse();

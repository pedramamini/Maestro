// Run playbook command
// Executes a playbook and streams JSONL events to stdout

import { getSessionById } from '../services/storage';
import { getPlaybook } from '../services/playbooks';
import { runPlaybook as executePlaybook } from '../services/batch-processor';
import { detectClaude } from '../services/agent-spawner';
import { emitError } from '../output/jsonl';

interface RunPlaybookOptions {
  session: string;
  playbook: string;
  dryRun?: boolean;
  noHistory?: boolean;
}

export async function runPlaybook(options: RunPlaybookOptions): Promise<void> {
  try {
    // Check if Claude is available
    const claude = await detectClaude();
    if (!claude.available) {
      emitError('Claude Code not found. Please install claude-code CLI.', 'CLAUDE_NOT_FOUND');
      process.exit(1);
    }

    // Get session
    const session = getSessionById(options.session);
    if (!session) {
      emitError(`Session not found: ${options.session}`, 'SESSION_NOT_FOUND');
      process.exit(1);
    }

    // Get playbook
    const playbook = getPlaybook(options.session, options.playbook);
    if (!playbook) {
      emitError(`Playbook not found: ${options.playbook}`, 'PLAYBOOK_NOT_FOUND');
      process.exit(1);
    }

    // Determine Auto Run folder path
    const folderPath = session.autoRunFolderPath;
    if (!folderPath) {
      emitError('Session does not have an Auto Run folder configured', 'NO_AUTORUN_FOLDER');
      process.exit(1);
    }

    // Execute playbook and stream events
    const generator = executePlaybook(session, playbook, folderPath, {
      dryRun: options.dryRun,
      writeHistory: !options.noHistory,
    });

    for await (const event of generator) {
      console.log(JSON.stringify(event));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    emitError(`Failed to run playbook: ${message}`, 'EXECUTION_ERROR');
    process.exit(1);
  }
}

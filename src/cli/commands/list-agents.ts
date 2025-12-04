// List agents command
// Lists all agents/sessions from Maestro storage

import { readSessions, getSessionsByGroup } from '../services/storage';
import { emitAgent, emitError } from '../output/jsonl';

interface ListAgentsOptions {
  group?: string;
}

export function listAgents(options: ListAgentsOptions): void {
  try {
    let sessions;

    if (options.group) {
      sessions = getSessionsByGroup(options.group);
    } else {
      sessions = readSessions();
    }

    for (const session of sessions) {
      emitAgent({
        id: session.id,
        name: session.name,
        toolType: session.toolType,
        cwd: session.cwd,
        groupId: session.groupId,
        autoRunFolderPath: session.autoRunFolderPath,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    emitError(`Failed to list agents: ${message}`, 'STORAGE_ERROR');
    process.exit(1);
  }
}

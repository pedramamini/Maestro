// List playbooks command
// Lists all playbooks for a given session

import { readPlaybooks } from '../services/playbooks';
import { emitPlaybook, emitError } from '../output/jsonl';

interface ListPlaybooksOptions {
  session: string;
}

export function listPlaybooks(options: ListPlaybooksOptions): void {
  try {
    const playbooks = readPlaybooks(options.session);

    for (const playbook of playbooks) {
      emitPlaybook({
        id: playbook.id,
        name: playbook.name,
        sessionId: options.session,
        documents: playbook.documents.map(d => d.filename),
        loopEnabled: playbook.loopEnabled,
        maxLoops: playbook.maxLoops,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    emitError(`Failed to list playbooks: ${message}`, 'STORAGE_ERROR');
    process.exit(1);
  }
}

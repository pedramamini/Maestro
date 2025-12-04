// List groups command
// Lists all session groups from Maestro storage

import { readGroups } from '../services/storage';
import { emitGroup, emitError } from '../output/jsonl';

export function listGroups(): void {
  try {
    const groups = readGroups();

    for (const group of groups) {
      emitGroup({
        id: group.id,
        name: group.name,
        emoji: group.emoji,
        collapsed: group.collapsed,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    emitError(`Failed to list groups: ${message}`, 'STORAGE_ERROR');
    process.exit(1);
  }
}

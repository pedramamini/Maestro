// Playbooks service for CLI
// Reads playbook files from the Maestro config directory

import * as fs from 'fs';
import * as path from 'path';
import { getConfigDirectory } from './storage';
import type { Playbook } from '../../shared/types';

// Playbook file structure
interface PlaybooksFile {
  playbooks: Playbook[];
}

/**
 * Get the playbooks directory path
 */
function getPlaybooksDir(): string {
  return path.join(getConfigDirectory(), 'playbooks');
}

/**
 * Get the playbooks file path for a session
 */
function getPlaybooksFilePath(sessionId: string): string {
  return path.join(getPlaybooksDir(), `${sessionId}.json`);
}

/**
 * Read playbooks for a session
 * Returns empty array if no playbooks file exists
 */
export function readPlaybooks(sessionId: string): Playbook[] {
  const filePath = getPlaybooksFilePath(sessionId);

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content) as PlaybooksFile;
    return Array.isArray(data.playbooks) ? data.playbooks : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Get a specific playbook by ID
 */
export function getPlaybook(sessionId: string, playbookId: string): Playbook | undefined {
  const playbooks = readPlaybooks(sessionId);
  return playbooks.find(p => p.id === playbookId);
}

/**
 * List all playbooks across all sessions
 * Returns playbooks with their session IDs
 */
export function listAllPlaybooks(): Array<Playbook & { sessionId: string }> {
  const playbooksDir = getPlaybooksDir();
  const result: Array<Playbook & { sessionId: string }> = [];

  try {
    if (!fs.existsSync(playbooksDir)) {
      return result;
    }

    const files = fs.readdirSync(playbooksDir);

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const sessionId = file.replace('.json', '');
      const playbooks = readPlaybooks(sessionId);

      for (const playbook of playbooks) {
        result.push({ ...playbook, sessionId });
      }
    }

    return result;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return result;
    }
    throw error;
  }
}

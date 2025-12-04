// Storage service for CLI
// Reads Electron Store JSON files directly from disk

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { Group, SessionInfo, HistoryEntry } from '../../shared/types';

// Get the Maestro config directory path
function getConfigDir(): string {
  const platform = os.platform();
  const home = os.homedir();

  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Maestro');
  } else if (platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Maestro');
  } else {
    // Linux and others
    return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'Maestro');
  }
}

/**
 * Read and parse an Electron Store JSON file
 * Returns undefined if file doesn't exist
 */
function readStoreFile<T>(filename: string): T | undefined {
  const filePath = path.join(getConfigDir(), filename);

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

// Store file structures (as used by Electron Store)
interface SessionsStore {
  sessions: SessionInfo[];
}

interface GroupsStore {
  groups: Group[];
}

interface HistoryStore {
  entries: HistoryEntry[];
}

interface SettingsStore {
  activeThemeId?: string;
  [key: string]: unknown;
}

/**
 * Read all sessions from storage
 */
export function readSessions(): SessionInfo[] {
  const data = readStoreFile<SessionsStore>('maestro-sessions.json');
  return data?.sessions || [];
}

/**
 * Read all groups from storage
 */
export function readGroups(): Group[] {
  const data = readStoreFile<GroupsStore>('maestro-groups.json');
  return data?.groups || [];
}

/**
 * Read history entries from storage
 * Optionally filter by project path or session ID
 */
export function readHistory(projectPath?: string, sessionId?: string): HistoryEntry[] {
  const data = readStoreFile<HistoryStore>('maestro-history.json');
  let entries = data?.entries || [];

  if (projectPath) {
    entries = entries.filter(e => e.projectPath === projectPath);
  }

  if (sessionId) {
    entries = entries.filter(e => e.sessionId === sessionId);
  }

  return entries;
}

/**
 * Read settings from storage
 */
export function readSettings(): SettingsStore {
  const data = readStoreFile<SettingsStore>('maestro-settings.json');
  return data || {};
}

/**
 * Get a session by ID
 */
export function getSessionById(sessionId: string): SessionInfo | undefined {
  const sessions = readSessions();
  return sessions.find(s => s.id === sessionId);
}

/**
 * Get sessions by group ID
 */
export function getSessionsByGroup(groupId: string): SessionInfo[] {
  const sessions = readSessions();
  return sessions.filter(s => s.groupId === groupId);
}

/**
 * Get the config directory path (exported for playbooks service)
 */
export function getConfigDirectory(): string {
  return getConfigDir();
}

/**
 * Add a history entry
 */
export function addHistoryEntry(entry: HistoryEntry): void {
  const filePath = path.join(getConfigDir(), 'maestro-history.json');
  const data = readStoreFile<HistoryStore>('maestro-history.json') || { entries: [] };

  data.entries.push(entry);

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

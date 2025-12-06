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

interface AgentConfigsStore {
  configs: Record<string, Record<string, unknown>>;
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
 * Read agent configurations from storage
 * This includes custom paths set by the user in the desktop app
 */
export function readAgentConfigs(): Record<string, Record<string, unknown>> {
  const data = readStoreFile<AgentConfigsStore>('maestro-agent-configs.json');
  return data?.configs || {};
}

/**
 * Get the custom path for a specific agent (e.g., 'claude-code')
 * Returns undefined if no custom path is configured
 */
export function getAgentCustomPath(agentId: string): string | undefined {
  const configs = readAgentConfigs();
  const agentConfig = configs[agentId];
  if (agentConfig && typeof agentConfig.customPath === 'string' && agentConfig.customPath) {
    return agentConfig.customPath;
  }
  return undefined;
}

/**
 * Resolve a partial ID to a full ID
 * Returns: { id, ambiguous, matches }
 * - If exact match found, returns that ID
 * - If single prefix match found, returns that ID
 * - If multiple matches, returns ambiguous: true with all matches
 * - If no match, returns undefined id
 */
export interface IdResolution {
  id?: string;
  ambiguous: boolean;
  matches: string[];
}

function resolveId(partialId: string, allIds: string[]): IdResolution {
  // First try exact match
  if (allIds.includes(partialId)) {
    return { id: partialId, ambiguous: false, matches: [partialId] };
  }

  // Try prefix match
  const matches = allIds.filter((id) => id.startsWith(partialId));

  if (matches.length === 1) {
    return { id: matches[0], ambiguous: false, matches };
  } else if (matches.length > 1) {
    return { id: undefined, ambiguous: true, matches };
  }

  return { id: undefined, ambiguous: false, matches: [] };
}

/**
 * Resolve an agent ID (partial or full)
 * Throws if ambiguous or not found
 */
export function resolveAgentId(partialId: string): string {
  const sessions = readSessions();
  const allIds = sessions.map((s) => s.id);
  const resolution = resolveId(partialId, allIds);

  if (resolution.ambiguous) {
    const matchList = resolution.matches.map((id) => {
      const session = sessions.find((s) => s.id === id);
      return `  ${id.slice(0, 8)}  ${session?.name || 'Unknown'}`;
    }).join('\n');
    throw new Error(`Ambiguous agent ID '${partialId}'. Matches:\n${matchList}`);
  }

  if (!resolution.id) {
    throw new Error(`Agent not found: ${partialId}`);
  }

  return resolution.id;
}

/**
 * Resolve a group ID (partial or full)
 * Throws if ambiguous or not found
 */
export function resolveGroupId(partialId: string): string {
  const groups = readGroups();
  const allIds = groups.map((g) => g.id);
  const resolution = resolveId(partialId, allIds);

  if (resolution.ambiguous) {
    const matchList = resolution.matches.map((id) => {
      const group = groups.find((g) => g.id === id);
      return `  ${id}  ${group?.name || 'Unknown'}`;
    }).join('\n');
    throw new Error(`Ambiguous group ID '${partialId}'. Matches:\n${matchList}`);
  }

  if (!resolution.id) {
    throw new Error(`Group not found: ${partialId}`);
  }

  return resolution.id;
}

/**
 * Get a session by ID (supports partial IDs)
 */
export function getSessionById(sessionId: string): SessionInfo | undefined {
  const sessions = readSessions();

  // First try exact match
  const exact = sessions.find((s) => s.id === sessionId);
  if (exact) return exact;

  // Try prefix match
  const matches = sessions.filter((s) => s.id.startsWith(sessionId));
  if (matches.length === 1) {
    return matches[0];
  }

  return undefined;
}

/**
 * Get sessions by group ID (supports partial IDs)
 */
export function getSessionsByGroup(groupId: string): SessionInfo[] {
  const sessions = readSessions();
  const groups = readGroups();

  // Resolve group ID
  const allGroupIds = groups.map((g) => g.id);

  // Exact match first
  if (allGroupIds.includes(groupId)) {
    return sessions.filter((s) => s.groupId === groupId);
  }

  // Prefix match
  const matches = allGroupIds.filter((id) => id.startsWith(groupId));
  if (matches.length === 1) {
    return sessions.filter((s) => s.groupId === matches[0]);
  }

  return [];
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
  try {
    const filePath = path.join(getConfigDir(), 'maestro-history.json');
    const data = readStoreFile<HistoryStore>('maestro-history.json') || { entries: [] };

    data.entries.unshift(entry); // Add to beginning (most recent first)

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    // Log error but don't throw - history writing shouldn't break playbook execution
    console.error(`[WARNING] Failed to write history entry: ${error instanceof Error ? error.message : String(error)}`);
  }
}

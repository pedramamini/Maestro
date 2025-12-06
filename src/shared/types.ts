// Shared type definitions for Maestro CLI and Electron app
// These types are used by both the CLI tool and the renderer process

export type ToolType = 'claude' | 'claude-code' | 'aider' | 'opencode' | 'terminal';

// Session group
export interface Group {
  id: string;
  name: string;
  emoji: string;
  collapsed: boolean;
}

// Simplified session interface for CLI (subset of full Session)
export interface SessionInfo {
  id: string;
  groupId?: string;
  name: string;
  toolType: ToolType;
  cwd: string;
  projectRoot: string;
  autoRunFolderPath?: string;
}

// Usage statistics from Claude Code CLI
export interface UsageStats {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  totalCostUsd: number;
  contextWindow: number;
}

// History entry types for the History panel
export type HistoryEntryType = 'AUTO' | 'USER' | 'LOOP';

export interface HistoryEntry {
  id: string;
  type: HistoryEntryType;
  timestamp: number;
  summary: string;
  fullResponse?: string;
  claudeSessionId?: string;
  sessionName?: string;
  projectPath: string;
  sessionId?: string;
  contextUsage?: number;
  usageStats?: UsageStats;
  success?: boolean;
  elapsedTimeMs?: number;
  validated?: boolean;
}

// Document entry within a playbook
export interface PlaybookDocumentEntry {
  filename: string;
  resetOnCompletion: boolean;
}

// A saved Playbook configuration
export interface Playbook {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  documents: PlaybookDocumentEntry[];
  loopEnabled: boolean;
  maxLoops?: number | null;
  prompt: string;
  worktreeSettings?: {
    branchNameTemplate: string;
    createPROnCompletion: boolean;
    prTargetBranch?: string;
  };
}

// Document entry in the batch run queue (runtime version with IDs)
export interface BatchDocumentEntry {
  id: string;
  filename: string;
  resetOnCompletion: boolean;
  isDuplicate: boolean;
  isMissing?: boolean;
}

// Git worktree configuration for Auto Run
export interface WorktreeConfig {
  enabled: boolean;
  path: string;
  branchName: string;
  createPROnCompletion: boolean;
  prTargetBranch: string;
}

// Configuration for starting a batch run
export interface BatchRunConfig {
  documents: BatchDocumentEntry[];
  prompt: string;
  loopEnabled: boolean;
  maxLoops?: number | null;
  worktree?: WorktreeConfig;
}

// Agent configuration
export interface AgentConfig {
  id: string;
  name: string;
  binaryName: string;
  command: string;
  args: string[];
  available: boolean;
  path?: string;
  requiresPty?: boolean;
  hidden?: boolean;
}

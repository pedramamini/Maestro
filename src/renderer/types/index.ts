// Type definitions for Maestro renderer

// Re-export theme types from shared location
export { Theme, ThemeId, ThemeMode, ThemeColors, isValidThemeId } from '../../shared/theme-types';

export type ToolType = 'claude' | 'aider' | 'opencode' | 'terminal';
export type SessionState = 'idle' | 'busy' | 'waiting_input' | 'connecting' | 'error';
export type FileChangeType = 'modified' | 'added' | 'deleted';
export type RightPanelTab = 'files' | 'history' | 'scratchpad';
export type ScratchPadMode = 'raw' | 'preview' | 'wysiwyg';
export type FocusArea = 'sidebar' | 'main' | 'right';
export type LLMProvider = 'openrouter' | 'anthropic' | 'ollama';

export interface Shortcut {
  id: string;
  label: string;
  keys: string[];
}

export interface FileArtifact {
  path: string;
  type: FileChangeType;
  linesAdded?: number;
  linesRemoved?: number;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  source: 'stdout' | 'stderr' | 'system' | 'user';
  text: string;
  interactive?: boolean;
  options?: string[];
  images?: string[];
  // For custom AI commands - stores the command metadata for display
  aiCommand?: {
    command: string;      // e.g., '/commit'
    description: string;  // e.g., 'Commit outstanding changes and push up'
  };
  // For user messages - tracks if message was successfully delivered to the agent
  delivered?: boolean;
}

export interface WorkLogItem {
  id: string;
  title: string;
  description: string;
  timestamp: number;
  relatedFiles?: number;
}

// History entry types for the History panel
export type HistoryEntryType = 'AUTO' | 'USER';

export interface HistoryEntry {
  id: string;
  type: HistoryEntryType;
  timestamp: number;
  summary: string;
  fullResponse?: string; // Complete agent response for expansion
  claudeSessionId?: string; // For clicking to jump to session
  projectPath: string; // For per-project filtering
  sessionId?: string; // Maestro session ID for isolation (interactive sessions exclude batch entries)
  contextUsage?: number; // Context window usage percentage at time of entry
  usageStats?: UsageStats; // Token usage and cost at time of entry
  success?: boolean; // For AUTO entries: whether the task completed successfully (true) or failed (false)
  elapsedTimeMs?: number; // Time taken to complete this task in milliseconds
}

// Batch processing state
export interface BatchRunState {
  isRunning: boolean;
  isStopping: boolean; // Waiting for current task to finish before stopping
  totalTasks: number;
  completedTasks: number;
  currentTaskIndex: number;
  scratchpadPath?: string; // Path to temp file
  originalContent: string; // Original scratchpad content for sync back
  customPrompt?: string; // User's custom prompt if modified
  sessionIds: string[]; // Claude session IDs from each iteration
}

// Usage statistics from Claude Code CLI
export interface UsageStats {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  totalCostUsd: number;
  contextWindow: number; // e.g., 200000 for Claude
}

// Persistent global statistics (survives app restarts)
export interface GlobalStats {
  totalSessions: number;
  totalMessages: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  totalCostUsd: number;
  totalActiveTimeMs: number;
}

// Recent Claude session for quick access breadcrumbs (per Maestro session)
export interface RecentClaudeSession {
  sessionId: string;
  firstMessage: string;
  timestamp: string;
  sessionName?: string;
}

export interface Session {
  id: string;
  groupId?: string;
  name: string;
  toolType: ToolType;
  state: SessionState;
  cwd: string;
  fullPath: string;
  aiLogs: LogEntry[];
  shellLogs: LogEntry[];
  workLog: WorkLogItem[];
  scratchPadContent: string;
  contextUsage: number;
  // Usage statistics from AI responses
  usageStats?: UsageStats;
  inputMode: 'terminal' | 'ai';
  // Dual-process PIDs: each session has both AI and terminal processes
  aiPid: number;
  terminalPid: number;
  port: number;
  // Live mode - makes session accessible via web interface
  isLive: boolean;
  liveUrl?: string;
  changedFiles: FileArtifact[];
  isGitRepo: boolean;
  // File Explorer per-session state
  fileTree: any[];
  fileExplorerExpanded: string[];
  fileExplorerScrollPos: number;
  fileTreeError?: string;
  // Shell state tracking
  shellCwd?: string;
  // Command history (separate for each mode)
  aiCommandHistory?: string[];
  shellCommandHistory?: string[];
  // Scratchpad state tracking
  scratchPadCursorPosition?: number;
  scratchPadEditScrollPos?: number;
  scratchPadPreviewScrollPos?: number;
  scratchPadMode?: 'edit' | 'preview';
  // Claude Code session ID for conversation continuity
  claudeSessionId?: string;
  // Pending jump path for /jump command (relative path within file tree)
  pendingJumpPath?: string;
  // Custom status message for the thinking indicator (e.g., "Agent is synopsizing...")
  statusMessage?: string;
  // Timestamp when agent started processing (for elapsed time display)
  thinkingStartTime?: number;
  // Tracks which mode (ai/terminal) triggered the busy state
  // Used to show the correct busy indicator message when user switches modes
  busySource?: 'ai' | 'terminal';
  // Message queue for AI mode - messages sent while busy are queued here
  messageQueue: LogEntry[];
  // Active time tracking - cumulative milliseconds of active use
  activeTimeMs: number;
  // Claude Code slash commands available for this session (fetched per session based on cwd)
  claudeCommands?: { command: string; description: string; }[];
  // Bookmark flag - bookmarked sessions appear in a dedicated section at the top
  bookmarked?: boolean;
  // Recent Claude sessions breadcrumbs for quick access (persisted per Maestro session)
  recentClaudeSessions?: RecentClaudeSession[];
  // Pending AI command that will trigger a synopsis on completion (e.g., '/commit')
  pendingAICommandForSynopsis?: string;
  // Custom batch runner prompt (persisted per session)
  batchRunnerPrompt?: string;
  // Timestamp when the batch runner prompt was last modified
  batchRunnerPromptModifiedAt?: number;
}

export interface Group {
  id: string;
  name: string;
  emoji: string;
  collapsed: boolean;
}

export interface AgentConfig {
  id: string;
  name: string;
  available: boolean;
  path?: string;
}

// Process spawning configuration
export interface ProcessConfig {
  sessionId: string;
  toolType: string;
  cwd: string;
  command: string;
  args: string[];
  prompt?: string; // For batch mode agents like Claude (passed as CLI argument)
  shell?: string; // Shell to use for terminal sessions (e.g., 'zsh', 'bash', 'fish')
}

// Directory entry from fs:readDir
export interface DirectoryEntry {
  name: string;
  isDirectory: boolean;
  path: string;
}

// Shell information from shells:detect
export interface ShellInfo {
  id: string;
  name: string;
  available: boolean;
  path?: string;
}

// Custom AI command definition for user-configurable slash commands
export interface CustomAICommand {
  id: string;
  command: string; // The slash command (e.g., '/commit')
  description: string; // Short description shown in autocomplete
  prompt: string; // The actual prompt sent to the AI agent
  isBuiltIn?: boolean; // If true, cannot be deleted (only edited)
  isSystemCommand?: boolean; // If true, handled by slashCommands.ts instead of sending prompt
}


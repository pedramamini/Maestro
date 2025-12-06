// Type definitions for Maestro renderer

// Re-export theme types from shared location
export type { Theme, ThemeId, ThemeMode, ThemeColors } from '../../shared/theme-types';
export { isValidThemeId } from '../../shared/theme-types';

export type ToolType = 'claude' | 'claude-code' | 'aider' | 'opencode' | 'terminal';
export type SessionState = 'idle' | 'busy' | 'waiting_input' | 'connecting' | 'error';
export type FileChangeType = 'modified' | 'added' | 'deleted';
export type RightPanelTab = 'files' | 'history' | 'autorun';
// Note: ScratchPadMode was removed as part of the Scratchpad → Auto Run migration
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
  source: 'stdout' | 'stderr' | 'system' | 'user' | 'ai';
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
  // For user messages - tracks if message was sent in read-only mode
  readOnly?: boolean;
}

// Queued item for the session-level execution queue
// Supports both messages and slash commands, processed sequentially
export type QueuedItemType = 'message' | 'command';

export interface QueuedItem {
  id: string;                        // Unique item ID
  timestamp: number;                 // When it was queued (for ordering)
  tabId: string;                     // Target tab for this item
  type: QueuedItemType;              // 'message' or 'command'
  // For messages
  text?: string;                     // Message text
  images?: string[];                 // Attached images (base64)
  // For commands
  command?: string;                  // Slash command (e.g., '/commit')
  commandDescription?: string;       // Command description for display
  // Display metadata
  tabName?: string;                  // Tab name at time of queuing (for display)
  // Read-only mode tracking (for parallel execution bypass)
  readOnlyMode?: boolean;            // True if queued from a read-only tab
}

export interface WorkLogItem {
  id: string;
  title: string;
  description: string;
  timestamp: number;
  relatedFiles?: number;
}

// History entry types for the History panel
// AUTO = task completed by Auto Run, USER = manual user prompt, LOOP = loop iteration summary
export type HistoryEntryType = 'AUTO' | 'USER' | 'LOOP';

export interface HistoryEntry {
  id: string;
  type: HistoryEntryType;
  timestamp: number;
  summary: string;
  fullResponse?: string; // Complete agent response for expansion
  claudeSessionId?: string; // For clicking to jump to session
  sessionName?: string; // Display name for the session (from active AI tab)
  projectPath: string; // For per-project filtering
  sessionId?: string; // Maestro session ID for isolation (interactive sessions exclude batch entries)
  contextUsage?: number; // Context window usage percentage at time of entry
  usageStats?: UsageStats; // Token usage and cost at time of entry
  success?: boolean; // For AUTO entries: whether the task completed successfully (true) or failed (false)
  elapsedTimeMs?: number; // Time taken to complete this task in milliseconds
  validated?: boolean; // For AUTO entries: whether a human has validated the task completion
}

// Document entry in the batch run queue (supports duplicates)
export interface BatchDocumentEntry {
  id: string;              // Unique ID for this entry (for drag-drop and duplicates)
  filename: string;        // The actual document filename (without .md)
  resetOnCompletion: boolean;  // Uncheck all boxes when done
  isDuplicate: boolean;    // True if this is a duplicate (can be removed)
  isMissing?: boolean;     // True if this document no longer exists in the folder (for playbook loading)
}

// Git worktree configuration for Auto Run
export interface WorktreeConfig {
  enabled: boolean;              // Whether to use a worktree
  path: string;                  // Absolute path for the worktree
  branchName: string;            // Branch name to use/create
  createPROnCompletion: boolean; // Create PR when Auto Run finishes
  prTargetBranch: string;        // Target branch for the PR (e.g., 'main')
}

// Configuration for starting a batch run
export interface BatchRunConfig {
  documents: BatchDocumentEntry[];  // Ordered list of docs to run
  prompt: string;
  loopEnabled: boolean;    // Loop back to first doc when done
  maxLoops?: number | null;  // Max loop iterations (null/undefined = infinite)
  worktree?: WorktreeConfig;     // Optional worktree configuration
}

// Batch processing state
export interface BatchRunState {
  isRunning: boolean;
  isStopping: boolean; // Waiting for current task to finish before stopping

  // Document-level progress (multi-document support)
  documents: string[];           // Ordered list of document filenames to process
  currentDocumentIndex: number;  // Which document we're on (0-based)

  // Task-level progress within current document
  currentDocTasksTotal: number;     // Total tasks in current document
  currentDocTasksCompleted: number; // Completed tasks in current document

  // Overall progress (grows as reset docs add tasks back)
  totalTasksAcrossAllDocs: number;
  completedTasksAcrossAllDocs: number;

  // Loop mode
  loopEnabled: boolean;
  loopIteration: number;  // How many times we've looped (0 = first pass)
  maxLoops?: number | null;  // Max loop iterations (null/undefined = infinite)

  // Folder path for file operations
  folderPath: string;

  // Worktree tracking
  worktreeActive: boolean;       // Currently running in a worktree
  worktreePath?: string;         // Path to the active worktree
  worktreeBranch?: string;       // Branch name in the worktree

  // Legacy fields (kept for backwards compatibility during migration)
  totalTasks: number;
  completedTasks: number;
  currentTaskIndex: number;
  scratchpadPath?: string; // Path to temp file
  originalContent: string; // Original scratchpad content for sync back

  // Prompt configuration
  customPrompt?: string; // User's custom prompt if modified
  sessionIds: string[]; // Claude session IDs from each iteration
  startTime?: number; // Timestamp when batch run started
}

// Document entry within a playbook (similar to BatchDocumentEntry but for storage)
export interface PlaybookDocumentEntry {
  filename: string;                  // Document filename (without .md)
  resetOnCompletion: boolean;
  // Note: isDuplicate is not stored - duplicates are just repeated entries
}

// A saved Playbook configuration
export interface Playbook {
  id: string;                        // Unique ID (UUID)
  name: string;                      // User-defined name
  createdAt: number;                 // Timestamp
  updatedAt: number;                 // Timestamp

  // Configuration
  documents: PlaybookDocumentEntry[];  // Ordered list of documents
  loopEnabled: boolean;
  maxLoops?: number | null;          // Max loop iterations (null/undefined = infinite)
  prompt: string;                    // Custom agent prompt

  // Optional worktree settings (path not stored - user selects each time)
  worktreeSettings?: {
    branchNameTemplate: string;    // e.g., "autorun-{playbook}-{timestamp}"
    createPROnCompletion: boolean;
    prTargetBranch?: string;       // Target branch for PR (e.g., 'main')
  };
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

// Badge unlock record for history tracking
export interface BadgeUnlockRecord {
  level: number;
  unlockedAt: number;  // Timestamp when badge was unlocked
}

// Auto-run achievement statistics (survives app restarts)
export interface AutoRunStats {
  cumulativeTimeMs: number;       // Total cumulative AutoRun time across all sessions
  longestRunMs: number;           // Longest single AutoRun session
  longestRunTimestamp: number;    // When the longest run occurred
  totalRuns: number;              // Total number of AutoRun sessions completed
  currentBadgeLevel: number;      // Current badge level (1-11)
  lastBadgeUnlockLevel: number;   // Last badge level that triggered unlock notification
  badgeHistory: BadgeUnlockRecord[]; // History of badge unlocks with timestamps
}

// AI Tab for multi-tab support within a Maestro session
// Each tab represents a separate Claude Code conversation
export interface AITab {
  id: string;                      // Unique tab ID (generated UUID)
  claudeSessionId: string | null;  // Claude Code session UUID (null for new tabs)
  name: string | null;             // User-defined name (null = show UUID octet)
  starred: boolean;                // Whether session is starred (for pill display)
  logs: LogEntry[];                // Conversation history
  inputValue: string;              // Pending input text for this tab
  stagedImages: string[];          // Staged images (base64) for this tab
  usageStats?: UsageStats;         // Token usage for this tab
  createdAt: number;               // Timestamp for ordering
  state: 'idle' | 'busy';          // Tab-level state for write-mode tracking
  readOnlyMode?: boolean;          // When true, Claude operates in plan/read-only mode
  saveToHistory?: boolean;         // When true, synopsis is requested after each completion and saved to History
  awaitingSessionId?: boolean;     // True when this tab sent a message and is awaiting its session ID
  thinkingStartTime?: number;      // Timestamp when tab started thinking (for elapsed time display)
  scrollTop?: number;              // Saved scroll position for this tab's output view
  hasUnread?: boolean;             // True when tab has new messages while not active
}

// Closed tab entry for undo functionality (Cmd+Shift+T)
// Stores tab data with original position for restoration
export interface ClosedTab {
  tab: AITab;                      // The closed tab data
  index: number;                   // Original position in the tab array
  closedAt: number;                // Timestamp when closed
}

export interface Session {
  id: string;
  groupId?: string;
  name: string;
  toolType: ToolType;
  state: SessionState;
  cwd: string;
  fullPath: string;
  projectRoot: string; // The initial working directory (never changes, used for Claude session storage)
  aiLogs: LogEntry[];
  shellLogs: LogEntry[];
  workLog: WorkLogItem[];
  contextUsage: number;
  // Usage statistics from AI responses
  usageStats?: UsageStats;
  inputMode: 'terminal' | 'ai';
  // AI process PID (for non-batch agents like Aider)
  // For Claude batch mode, this is 0 since processes spawn per-message
  aiPid: number;
  // Terminal uses runCommand() which spawns fresh shells per command
  // This field is kept for backwards compatibility but is always 0
  terminalPid: number;
  port: number;
  // Live mode - makes session accessible via web interface
  isLive: boolean;
  liveUrl?: string;
  changedFiles: FileArtifact[];
  isGitRepo: boolean;
  // Git branches and tags cache (for tab completion)
  gitBranches?: string[];
  gitTags?: string[];
  gitRefsCacheTime?: number;  // Timestamp when branches/tags were last fetched
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
  // Claude Code session ID for conversation continuity
  // DEPRECATED: Use aiTabs[activeIndex].claudeSessionId instead
  claudeSessionId?: string;
  // Pending jump path for /jump command (relative path within file tree)
  pendingJumpPath?: string;
  // Custom status message for the thinking indicator (e.g., "Agent is synopsizing...")
  statusMessage?: string;
  // Timestamp when agent started processing (for elapsed time display)
  thinkingStartTime?: number;
  // Token count for current thinking cycle (reset when new request starts)
  currentCycleTokens?: number;
  // Bytes received during current thinking cycle (for real-time progress display)
  currentCycleBytes?: number;
  // Tracks which mode (ai/terminal) triggered the busy state
  // Used to show the correct busy indicator message when user switches modes
  busySource?: 'ai' | 'terminal';
  // Execution queue for sequential processing within this session
  // All messages and commands are queued here and processed one at a time
  executionQueue: QueuedItem[];
  // Active time tracking - cumulative milliseconds of active use
  activeTimeMs: number;
  // Claude Code slash commands available for this session (fetched per session based on cwd)
  claudeCommands?: { command: string; description: string; }[];
  // Bookmark flag - bookmarked sessions appear in a dedicated section at the top
  bookmarked?: boolean;
  // Pending AI command that will trigger a synopsis on completion (e.g., '/commit')
  pendingAICommandForSynopsis?: string;
  // Custom batch runner prompt (persisted per session)
  batchRunnerPrompt?: string;
  // Timestamp when the batch runner prompt was last modified
  batchRunnerPromptModifiedAt?: number;
  // CLI activity - present when CLI is running a playbook on this session
  cliActivity?: {
    playbookId: string;
    playbookName: string;
    startedAt: number;
  };

  // Tab management for AI mode (multi-tab Claude Code sessions)
  // Each tab represents a separate Claude Code conversation
  aiTabs: AITab[];
  // Currently active tab ID
  activeTabId: string;
  // Stack of recently closed tabs for undo (max 25, runtime-only, not persisted)
  closedTabHistory: ClosedTab[];
  // Saved scroll position for terminal/shell output view
  terminalScrollTop?: number;
  // Draft input for terminal mode (persisted across session switches)
  terminalDraftInput?: string;

  // Auto Run panel state (file-based document runner)
  autoRunFolderPath?: string;           // Persisted folder path for Runner Docs
  autoRunSelectedFile?: string;          // Currently selected markdown filename
  autoRunMode?: 'edit' | 'preview';      // Current editing mode
  autoRunEditScrollPos?: number;         // Scroll position in edit mode
  autoRunPreviewScrollPos?: number;      // Scroll position in preview mode
  autoRunCursorPosition?: number;        // Cursor position in edit mode

  // File tree auto-refresh interval in seconds (0 = disabled)
  fileTreeAutoRefreshInterval?: number;
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
  customPath?: string; // User-specified custom path (shown in UI even if not available)
  command?: string;
  args?: string[];
  hidden?: boolean; // If true, agent is hidden from UI (internal use only)
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


// Shared type definitions for Maestro CLI and Electron app
// These types are used by both the CLI tool and the renderer process

export type ToolType = 'claude' | 'claude-code' | 'aider' | 'opencode' | 'codex' | 'terminal';

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

// Usage statistics from AI agent CLI (Claude Code, Codex, etc.)
export interface UsageStats {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  totalCostUsd: number;
  contextWindow: number;
  /**
   * Reasoning/thinking tokens (separate from outputTokens)
   * Some models like OpenAI o3/o4-mini report reasoning tokens separately.
   * These are already included in outputTokens but tracked separately for UI display.
   */
  reasoningTokens?: number;
}

// History entry types for the History panel
export type HistoryEntryType = 'AUTO' | 'USER';

export interface HistoryEntry {
  id: string;
  type: HistoryEntryType;
  timestamp: number;
  summary: string;
  fullResponse?: string;
  agentSessionId?: string;
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

// ============================================================================
// Agent Error Handling Types
// ============================================================================

/**
 * Types of errors that agents can encounter.
 * Used to determine appropriate recovery actions and UI display.
 */
export type AgentErrorType =
  | 'auth_expired'        // API key invalid, token expired, login required
  | 'token_exhaustion'    // Context window full, max tokens reached
  | 'rate_limited'        // Too many requests, quota exceeded
  | 'network_error'       // Connection failed, timeout
  | 'agent_crashed'       // Process exited unexpectedly
  | 'permission_denied'   // Agent lacks required permissions
  | 'session_not_found'   // Session was deleted or doesn't exist
  | 'unknown';            // Unrecognized error

/**
 * Structured error information from an AI agent.
 * Contains details needed for error display and recovery.
 */
export interface AgentError {
  /** The category of error */
  type: AgentErrorType;

  /** Human-readable error message for display */
  message: string;

  /** Whether the error can be recovered from (vs. requiring user intervention) */
  recoverable: boolean;

  /** The agent that encountered the error (e.g., 'claude-code', 'opencode') */
  agentId: string;

  /** The session ID where the error occurred (if applicable) */
  sessionId?: string;

  /** Timestamp when the error occurred */
  timestamp: number;

  /** Original error data for debugging (stderr, exit code, etc.) */
  raw?: {
    exitCode?: number;
    stderr?: string;
    stdout?: string;
    errorLine?: string;
  };

  /** Parsed JSON error details (if the error contains structured JSON) */
  parsedJson?: unknown;
}

/**
 * Recovery action for an agent error.
 * Provides both the action metadata and the action function.
 */
export interface AgentErrorRecovery {
  /** The error type this recovery addresses */
  type: AgentErrorType;

  /** Button label for the recovery action (e.g., "Re-authenticate", "Start New Session") */
  label: string;

  /** Description of what the recovery action will do */
  description?: string;

  /** Whether this is the recommended/primary action */
  primary?: boolean;

  /** Icon identifier for the action button (optional) */
  icon?: string;
}

// ============================================================================
// Marketplace Types (re-exported from marketplace-types.ts)
// ============================================================================

export type {
  MarketplaceManifest,
  MarketplacePlaybook,
  MarketplaceDocument,
  MarketplaceCache,
  MarketplaceDocumentContent,
  MarketplaceErrorType,
  MarketplaceError,
  GetManifestResponse,
  GetDocumentResponse,
  GetReadmeResponse,
  ImportPlaybookResponse,
  MarketplaceErrorResponse,
} from './marketplace-types';

export {
  MarketplaceFetchError,
  MarketplaceCacheError,
  MarketplaceImportError,
} from './marketplace-types';

/**
 * Agent Capabilities System
 *
 * Defines what features each AI agent supports. This enables Maestro to:
 * - Show/hide UI features based on agent capabilities
 * - Use correct APIs and formats for each agent
 * - Handle agent differences in a consistent way
 *
 * When adding a new agent, define its capabilities here.
 */

/**
 * Capability flags that determine what features are available for each agent.
 */
export interface AgentCapabilities {
  /** Agent supports resuming existing sessions (e.g., --resume flag) */
  supportsResume: boolean;

  /** Agent supports read-only/plan mode (e.g., --permission-mode plan) */
  supportsReadOnlyMode: boolean;

  /** Agent outputs JSON-formatted responses (for parsing) */
  supportsJsonOutput: boolean;

  /** Agent provides a session ID for conversation continuity */
  supportsSessionId: boolean;

  /** Agent can accept image inputs (screenshots, diagrams, etc.) */
  supportsImageInput: boolean;

  /** Agent supports slash commands (e.g., /help, /compact) */
  supportsSlashCommands: boolean;

  /** Agent stores session history in a discoverable location */
  supportsSessionStorage: boolean;

  /** Agent provides cost/pricing information */
  supportsCostTracking: boolean;

  /** Agent provides token usage statistics */
  supportsUsageStats: boolean;

  /** Agent supports batch/headless mode (non-interactive) */
  supportsBatchMode: boolean;

  /** Agent requires a prompt to start (no eager spawn on session creation) */
  requiresPromptToStart: boolean;

  /** Agent streams responses in real-time */
  supportsStreaming: boolean;

  /** Agent provides distinct "result" messages when done */
  supportsResultMessages: boolean;

  /** Agent supports selecting different models (e.g., --model flag) */
  supportsModelSelection: boolean;
}

/**
 * Default capabilities - safe defaults for unknown agents.
 * All capabilities disabled by default (conservative approach).
 */
export const DEFAULT_CAPABILITIES: AgentCapabilities = {
  supportsResume: false,
  supportsReadOnlyMode: false,
  supportsJsonOutput: false,
  supportsSessionId: false,
  supportsImageInput: false,
  supportsSlashCommands: false,
  supportsSessionStorage: false,
  supportsCostTracking: false,
  supportsUsageStats: false,
  supportsBatchMode: false,
  requiresPromptToStart: false,
  supportsStreaming: false,
  supportsResultMessages: false,
  supportsModelSelection: false,
};

/**
 * Capability definitions for each supported agent.
 *
 * NOTE: These are the current known capabilities. As agents evolve,
 * these may need to be updated. When in doubt, set capabilities to false
 * and mark them as "Unverified" or "PLACEHOLDER" until tested.
 *
 * Agents marked as PLACEHOLDER have not been integrated yet - their
 * capabilities are conservative defaults that should be updated when
 * the agent CLI becomes available and can be tested.
 */
export const AGENT_CAPABILITIES: Record<string, AgentCapabilities> = {
  /**
   * Claude Code - Full-featured AI coding assistant from Anthropic
   * https://github.com/anthropics/claude-code
   */
  'claude-code': {
    supportsResume: true,        // --resume flag
    supportsReadOnlyMode: true,  // --permission-mode plan
    supportsJsonOutput: true,    // --output-format stream-json
    supportsSessionId: true,     // session_id in JSON output
    supportsImageInput: true,    // Supports image attachments
    supportsSlashCommands: true, // /help, /compact, etc.
    supportsSessionStorage: true, // ~/.claude/projects/
    supportsCostTracking: true,  // Cost info in usage stats
    supportsUsageStats: true,    // Token counts in output
    supportsBatchMode: true,     // --print flag
    requiresPromptToStart: false, // Claude Code can run in --print mode waiting for input
    supportsStreaming: true,     // Stream JSON events
    supportsResultMessages: true, // "result" event type
    supportsModelSelection: false, // Model is configured via Anthropic account
  },

  /**
   * Terminal - Internal agent for shell sessions
   * Not a real AI agent, used for terminal process management
   */
  'terminal': {
    supportsResume: false,
    supportsReadOnlyMode: false,
    supportsJsonOutput: false,
    supportsSessionId: false,
    supportsImageInput: false,
    supportsSlashCommands: false,
    supportsSessionStorage: false,
    supportsCostTracking: false,
    supportsUsageStats: false,
    supportsBatchMode: false,
    requiresPromptToStart: false,
    supportsStreaming: true,  // PTY streams output
    supportsResultMessages: false,
    supportsModelSelection: false,
  },

  /**
   * Codex - OpenAI's Codex CLI
   * https://github.com/openai/codex
   *
   * Verified capabilities based on CLI testing (v0.73.0+) and documentation review.
   * See Auto Run Docs/Codex-Support.md for investigation details.
   */
  'codex': {
    supportsResume: true,         // exec resume <id> (v0.30.0+) - Verified
    supportsReadOnlyMode: true,   // --sandbox read-only - Verified
    supportsJsonOutput: true,     // --json flag - Verified
    supportsSessionId: true,      // thread_id in thread.started event - Verified
    supportsImageInput: true,     // -i, --image flag - Documented
    supportsSlashCommands: false, // None - Verified
    supportsSessionStorage: true, // ~/.codex/sessions/YYYY/MM/DD/*.jsonl - Verified
    supportsCostTracking: false,  // Token counts only - Codex doesn't provide cost, pricing varies by model
    supportsUsageStats: true,     // usage in turn.completed events - Verified
    supportsBatchMode: true,      // exec subcommand - Verified
    requiresPromptToStart: true,  // Codex requires 'exec' subcommand with prompt, no interactive mode via PTY
    supportsStreaming: true,      // Streams JSONL events - Verified
    supportsResultMessages: false, // All messages are agent_message type (no distinct result) - Verified
    supportsModelSelection: true, // -m, --model flag - Documented
  },

  /**
   * Gemini CLI - Google's Gemini model CLI
   *
   * PLACEHOLDER: Most capabilities set to false until Gemini CLI is stable
   * and can be tested. Update this configuration when integrating the agent.
   */
  'gemini-cli': {
    supportsResume: false,
    supportsReadOnlyMode: false,
    supportsJsonOutput: false,
    supportsSessionId: false,
    supportsImageInput: true,    // Gemini supports multimodal
    supportsSlashCommands: false,
    supportsSessionStorage: false,
    supportsCostTracking: false,
    supportsUsageStats: false,
    supportsBatchMode: false,
    requiresPromptToStart: false, // Not yet investigated
    supportsStreaming: true,     // Likely streams
    supportsResultMessages: false,
    supportsModelSelection: false, // Not yet investigated
  },

  /**
   * Qwen3 Coder - Alibaba's Qwen coding model
   *
   * PLACEHOLDER: Most capabilities set to false until Qwen3 Coder CLI is available
   * and can be tested. Update this configuration when integrating the agent.
   */
  'qwen3-coder': {
    supportsResume: false,
    supportsReadOnlyMode: false,
    supportsJsonOutput: false,
    supportsSessionId: false,
    supportsImageInput: false,
    supportsSlashCommands: false,
    supportsSessionStorage: false,
    supportsCostTracking: false, // Local model - no cost
    supportsUsageStats: false,
    supportsBatchMode: false,
    requiresPromptToStart: false, // Not yet investigated
    supportsStreaming: true,     // Likely streams
    supportsResultMessages: false,
    supportsModelSelection: false, // Not yet investigated
  },

  /**
   * Aider - AI pair programming in your terminal
   * https://github.com/paul-gauthier/aider
   *
   * PLACEHOLDER: Most capabilities set to false until Aider integration is
   * implemented. Update this configuration when integrating the agent.
   */
  'aider': {
    supportsResume: false,       // Not yet investigated
    supportsReadOnlyMode: false, // Not yet investigated
    supportsJsonOutput: false,   // Not yet investigated
    supportsSessionId: false,    // Not yet investigated
    supportsImageInput: true,    // Aider supports vision models
    supportsSlashCommands: true, // Aider has /commands
    supportsSessionStorage: false, // Not yet investigated
    supportsCostTracking: true,  // Aider tracks costs
    supportsUsageStats: true,    // Aider shows token usage
    supportsBatchMode: false,    // Not yet investigated
    requiresPromptToStart: false, // Not yet investigated
    supportsStreaming: true,     // Likely streams
    supportsResultMessages: false, // Not yet investigated
    supportsModelSelection: true, // --model flag
  },

  /**
   * OpenCode - Open source coding assistant
   * https://github.com/opencode-ai/opencode
   *
   * Verified capabilities based on CLI testing and documentation review.
   * See Auto Run Docs/OpenCode-Support.md for investigation details.
   */
  'opencode': {
    supportsResume: true,         // --session flag (sessionID in output) - Verified
    supportsReadOnlyMode: true,   // --agent plan (plan mode) - Verified
    supportsJsonOutput: true,     // --format json - Verified
    supportsSessionId: true,      // sessionID in JSON output (camelCase) - Verified
    supportsImageInput: true,     // -f, --file flag documented - Documented
    supportsSlashCommands: false, // Not investigated
    supportsSessionStorage: true, // ~/.local/share/opencode/storage/ (JSON files) - Verified
    supportsCostTracking: true,   // part.cost in step_finish events - Verified
    supportsUsageStats: true,     // part.tokens in step_finish events - Verified
    supportsBatchMode: true,      // run subcommand (auto-approves all permissions) - Verified
    requiresPromptToStart: true,  // OpenCode requires 'run' subcommand with prompt, no interactive mode via PTY
    supportsStreaming: true,      // Streams JSONL events - Verified
    supportsResultMessages: true, // step_finish with part.reason:"stop" - Verified
    supportsModelSelection: true, // --model provider/model (e.g., 'ollama/qwen3:8b') - Verified
  },
};

/**
 * Get capabilities for a specific agent.
 *
 * @param agentId - The agent identifier (e.g., 'claude-code', 'opencode')
 * @returns AgentCapabilities for the agent, or DEFAULT_CAPABILITIES if unknown
 */
export function getAgentCapabilities(agentId: string): AgentCapabilities {
  return AGENT_CAPABILITIES[agentId] || { ...DEFAULT_CAPABILITIES };
}

/**
 * Check if an agent has a specific capability.
 *
 * @param agentId - The agent identifier
 * @param capability - The capability key to check
 * @returns true if the agent supports the capability
 */
export function hasCapability(
  agentId: string,
  capability: keyof AgentCapabilities
): boolean {
  const capabilities = getAgentCapabilities(agentId);
  return capabilities[capability];
}

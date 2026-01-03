/**
 * Context Usage Estimation Utilities
 *
 * Provides fallback estimation for context window usage when agents
 * don't report their context window size directly.
 */

import type { ToolType } from '../types';
import type { UsageStats } from '../../shared/types';

/**
 * Default context window sizes for different agents.
 * Used as fallback when the agent doesn't report its context window size.
 */
export const DEFAULT_CONTEXT_WINDOWS: Record<ToolType, number> = {
  'claude-code': 200000,  // Claude 3.5 Sonnet/Claude 4 default context
  'claude': 200000,       // Legacy Claude
  'codex': 200000,        // OpenAI o3/o4-mini context window
  'opencode': 128000,     // OpenCode (depends on model, 128k is conservative default)
  'aider': 128000,        // Aider (varies by model, 128k is conservative default)
  'terminal': 0,          // Terminal has no context window
};

/**
 * Estimate context usage percentage when the agent doesn't provide it directly.
 * Uses agent-specific default context window sizes for accurate estimation.
 *
 * IMPORTANT: The actual prompt sent to the API includes:
 * - inputTokens: new tokens in this turn
 * - outputTokens: response tokens
 * - cacheReadInputTokens: cached conversation history sent with each request
 *
 * The cacheReadInputTokens are critical because they represent the full
 * conversation context being sent, even though they're served from cache
 * for billing purposes.
 *
 * @param stats - The usage statistics containing token counts
 * @param agentId - The agent identifier for agent-specific context window size
 * @returns Estimated context usage percentage (0-100), or null if cannot be estimated
 */
export function estimateContextUsage(
  stats: Pick<UsageStats, 'inputTokens' | 'outputTokens' | 'cacheReadInputTokens' | 'cacheCreationInputTokens' | 'contextWindow'>,
  agentId?: ToolType
): number | null {
  // Calculate total context: new input + output + cached conversation history
  // The cacheReadInputTokens represent previous conversation being sent with each request
  const totalContextTokens = stats.inputTokens + stats.outputTokens + (stats.cacheReadInputTokens || 0);

  // If context window is provided and valid, use it
  if (stats.contextWindow && stats.contextWindow > 0) {
    return Math.min(100, Math.round((totalContextTokens / stats.contextWindow) * 100));
  }

  // If no agent specified or terminal, cannot estimate
  if (!agentId || agentId === 'terminal') {
    return null;
  }

  // Use agent-specific default context window
  const defaultContextWindow = DEFAULT_CONTEXT_WINDOWS[agentId];
  if (!defaultContextWindow || defaultContextWindow <= 0) {
    return null;
  }

  if (totalContextTokens <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((totalContextTokens / defaultContextWindow) * 100));
}

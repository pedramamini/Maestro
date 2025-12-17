/**
 * OpenCode Session Storage Implementation (Stub)
 *
 * This module provides a stub implementation of AgentSessionStorage for OpenCode.
 * OpenCode uses server-managed sessions, so this implementation serves as a
 * placeholder until the actual session storage location and format are known.
 *
 * TODO: Implement when OpenCode session storage format is documented
 * - Investigate where OpenCode stores session data
 * - Determine the file format (JSON, JSONL, SQLite, etc.)
 * - Implement actual session reading/searching logic
 */

import { logger } from '../utils/logger';
import type {
  AgentSessionStorage,
  AgentSessionInfo,
  PaginatedSessionsResult,
  SessionMessagesResult,
  SessionSearchResult,
  SessionSearchMode,
  SessionListOptions,
  SessionReadOptions,
} from '../agent-session-storage';
import type { ToolType } from '../../shared/types';

const LOG_CONTEXT = '[OpenCodeSessionStorage]';

/**
 * OpenCode Session Storage Implementation (Stub)
 *
 * This is a placeholder implementation that returns empty results.
 * When OpenCode session storage is better understood, this class
 * will be updated with actual implementation.
 */
export class OpenCodeSessionStorage implements AgentSessionStorage {
  readonly agentId: ToolType = 'opencode';

  async listSessions(_projectPath: string): Promise<AgentSessionInfo[]> {
    logger.debug('OpenCode session storage not yet implemented', LOG_CONTEXT);
    // TODO: Implement when OpenCode session storage location is known
    return [];
  }

  async listSessionsPaginated(
    _projectPath: string,
    _options?: SessionListOptions
  ): Promise<PaginatedSessionsResult> {
    logger.debug('OpenCode session storage not yet implemented', LOG_CONTEXT);
    // TODO: Implement when OpenCode session storage location is known
    return {
      sessions: [],
      hasMore: false,
      totalCount: 0,
      nextCursor: null,
    };
  }

  async readSessionMessages(
    _projectPath: string,
    _sessionId: string,
    _options?: SessionReadOptions
  ): Promise<SessionMessagesResult> {
    logger.debug('OpenCode session storage not yet implemented', LOG_CONTEXT);
    // TODO: Implement when OpenCode session storage format is known
    return {
      messages: [],
      total: 0,
      hasMore: false,
    };
  }

  async searchSessions(
    _projectPath: string,
    _query: string,
    _searchMode: SessionSearchMode
  ): Promise<SessionSearchResult[]> {
    logger.debug('OpenCode session storage not yet implemented', LOG_CONTEXT);
    // TODO: Implement when OpenCode session storage format is known
    return [];
  }

  getSessionPath(_projectPath: string, _sessionId: string): string | null {
    // OpenCode may use server-managed sessions without local files
    // Return null until we know the actual storage mechanism
    return null;
  }

  async deleteMessagePair(
    _projectPath: string,
    _sessionId: string,
    _userMessageUuid: string,
    _fallbackContent?: string
  ): Promise<{ success: boolean; error?: string; linesRemoved?: number }> {
    logger.debug('OpenCode session storage not yet implemented', LOG_CONTEXT);
    return {
      success: false,
      error: 'OpenCode session storage not yet implemented',
    };
  }
}

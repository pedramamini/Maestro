/**
 * Claude Code Session Storage Implementation
 *
 * This module implements the AgentSessionStorage interface for Claude Code.
 * Claude Code stores sessions as JSONL files in ~/.claude/projects/<encoded-path>/
 *
 * File structure:
 * - Each session is a .jsonl file named <session-id>.jsonl
 * - Each line is a JSON object with type, timestamp, message, etc.
 * - User and assistant messages contain the actual conversation
 * - Result messages contain token usage and cost information
 */

import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import Store from 'electron-store';
import { logger } from '../utils/logger';
import { CLAUDE_SESSION_PARSE_LIMITS, CLAUDE_PRICING } from '../constants';
import { encodeClaudeProjectPath } from '../utils/statsCache';
import type {
  AgentSessionStorage,
  AgentSessionInfo,
  PaginatedSessionsResult,
  SessionMessagesResult,
  SessionSearchResult,
  SessionSearchMode,
  SessionListOptions,
  SessionReadOptions,
  AgentSessionOrigin,
  SessionOriginInfo,
  SessionMessage,
} from '../agent-session-storage';
import type { ToolType } from '../../shared/types';

const LOG_CONTEXT = '[ClaudeSessionStorage]';

/**
 * Origin data structure stored in electron-store
 */
type StoredOriginData =
  | AgentSessionOrigin
  | {
      origin: AgentSessionOrigin;
      sessionName?: string;
      starred?: boolean;
    };

export interface ClaudeSessionOriginsData {
  origins: Record<string, Record<string, StoredOriginData>>;
}

/**
 * Extract semantic text from message content.
 * Skips images, tool_use, and tool_result - only returns actual text content.
 */
function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    const textParts = content
      .filter((part: { type?: string }) => part.type === 'text')
      .map((part: { type?: string; text?: string }) => part.text || '')
      .filter((text: string) => text.trim());
    return textParts.join(' ');
  }
  return '';
}

/**
 * Calculate cost from token counts using Claude pricing
 */
function calculateCost(
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheCreationTokens: number
): number {
  const inputCost = (inputTokens / 1_000_000) * CLAUDE_PRICING.INPUT_PER_MILLION;
  const outputCost = (outputTokens / 1_000_000) * CLAUDE_PRICING.OUTPUT_PER_MILLION;
  const cacheReadCost = (cacheReadTokens / 1_000_000) * CLAUDE_PRICING.CACHE_READ_PER_MILLION;
  const cacheCreationCost =
    (cacheCreationTokens / 1_000_000) * CLAUDE_PRICING.CACHE_CREATION_PER_MILLION;
  return inputCost + outputCost + cacheReadCost + cacheCreationCost;
}

/**
 * Parse a session file and extract metadata
 */
async function parseSessionFile(
  filePath: string,
  sessionId: string,
  projectPath: string,
  stats: { size: number; mtimeMs: number }
): Promise<AgentSessionInfo | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());

    let firstAssistantMessage = '';
    let firstUserMessage = '';
    let timestamp = new Date(stats.mtimeMs).toISOString();

    // Fast regex-based extraction for message counts
    const userMessageCount = (content.match(/"type"\s*:\s*"user"/g) || []).length;
    const assistantMessageCount = (content.match(/"type"\s*:\s*"assistant"/g) || []).length;
    const messageCount = userMessageCount + assistantMessageCount;

    // Extract first meaningful message content
    // Prefer first assistant response as preview (more meaningful than system context)
    // Fall back to first user message if no assistant response exists
    for (
      let i = 0;
      i < Math.min(lines.length, CLAUDE_SESSION_PARSE_LIMITS.FIRST_MESSAGE_SCAN_LINES);
      i++
    ) {
      try {
        const entry = JSON.parse(lines[i]);
        // Capture first user message as fallback
        if (!firstUserMessage && entry.type === 'user' && entry.message?.content) {
          const textContent = extractTextFromContent(entry.message.content);
          if (textContent.trim()) {
            firstUserMessage = textContent;
            timestamp = entry.timestamp || timestamp;
          }
        }
        // Capture first assistant message as preferred preview
        if (!firstAssistantMessage && entry.type === 'assistant' && entry.message?.content) {
          const textContent = extractTextFromContent(entry.message.content);
          if (textContent.trim()) {
            firstAssistantMessage = textContent;
            // Once we have assistant message, we can stop scanning
            break;
          }
        }
      } catch {
        // Skip malformed lines
      }
    }

    // Use assistant response as preview if available, otherwise fall back to user message
    const previewMessage = firstAssistantMessage || firstUserMessage;

    // Fast regex-based token extraction
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheReadTokens = 0;
    let totalCacheCreationTokens = 0;

    const inputMatches = content.matchAll(/"input_tokens"\s*:\s*(\d+)/g);
    for (const m of inputMatches) totalInputTokens += parseInt(m[1], 10);

    const outputMatches = content.matchAll(/"output_tokens"\s*:\s*(\d+)/g);
    for (const m of outputMatches) totalOutputTokens += parseInt(m[1], 10);

    const cacheReadMatches = content.matchAll(/"cache_read_input_tokens"\s*:\s*(\d+)/g);
    for (const m of cacheReadMatches) totalCacheReadTokens += parseInt(m[1], 10);

    const cacheCreationMatches = content.matchAll(/"cache_creation_input_tokens"\s*:\s*(\d+)/g);
    for (const m of cacheCreationMatches) totalCacheCreationTokens += parseInt(m[1], 10);

    const costUsd = calculateCost(
      totalInputTokens,
      totalOutputTokens,
      totalCacheReadTokens,
      totalCacheCreationTokens
    );

    // Extract last timestamp for duration
    let lastTimestamp = timestamp;
    for (
      let i = lines.length - 1;
      i >= Math.max(0, lines.length - CLAUDE_SESSION_PARSE_LIMITS.LAST_TIMESTAMP_SCAN_LINES);
      i--
    ) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.timestamp) {
          lastTimestamp = entry.timestamp;
          break;
        }
      } catch {
        // Skip malformed lines
      }
    }

    const startTime = new Date(timestamp).getTime();
    const endTime = new Date(lastTimestamp).getTime();
    const durationSeconds = Math.max(0, Math.floor((endTime - startTime) / 1000));

    return {
      sessionId,
      projectPath,
      timestamp,
      modifiedAt: new Date(stats.mtimeMs).toISOString(),
      firstMessage: previewMessage.slice(
        0,
        CLAUDE_SESSION_PARSE_LIMITS.FIRST_MESSAGE_PREVIEW_LENGTH
      ),
      messageCount,
      sizeBytes: stats.size,
      costUsd,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      cacheReadTokens: totalCacheReadTokens,
      cacheCreationTokens: totalCacheCreationTokens,
      durationSeconds,
    };
  } catch (error) {
    logger.error(`Error reading session file: ${filePath}`, LOG_CONTEXT, error);
    return null;
  }
}

/**
 * Claude Code Session Storage Implementation
 *
 * Provides access to Claude Code's local session storage at ~/.claude/projects/
 */
export class ClaudeSessionStorage implements AgentSessionStorage {
  readonly agentId: ToolType = 'claude-code';

  private originsStore: Store<ClaudeSessionOriginsData>;

  constructor(originsStore?: Store<ClaudeSessionOriginsData>) {
    // Use provided store or create a new one
    this.originsStore =
      originsStore ||
      new Store<ClaudeSessionOriginsData>({
        name: 'claude-session-origins',
        defaults: { origins: {} },
      });
  }

  /**
   * Get the Claude projects directory path
   */
  private getProjectsDir(): string {
    return path.join(os.homedir(), '.claude', 'projects');
  }

  /**
   * Get the encoded project directory path
   */
  private getEncodedProjectDir(projectPath: string): string {
    const encodedPath = encodeClaudeProjectPath(projectPath);
    return path.join(this.getProjectsDir(), encodedPath);
  }

  /**
   * Get origin info for sessions in a project
   */
  private getProjectOrigins(projectPath: string): Record<string, StoredOriginData> {
    const origins = this.originsStore.get('origins', {});
    return origins[projectPath] || {};
  }

  /**
   * Attach origin info to session metadata
   */
  private attachOriginInfo(
    session: AgentSessionInfo,
    projectOrigins: Record<string, StoredOriginData>
  ): AgentSessionInfo {
    const originData = projectOrigins[session.sessionId];
    const origin = typeof originData === 'string' ? originData : originData?.origin;
    const sessionName = typeof originData === 'object' ? originData?.sessionName : undefined;
    const starred = typeof originData === 'object' ? originData?.starred : undefined;
    return {
      ...session,
      origin: origin as AgentSessionOrigin | undefined,
      sessionName,
      starred,
    };
  }

  async listSessions(projectPath: string): Promise<AgentSessionInfo[]> {
    const projectDir = this.getEncodedProjectDir(projectPath);

    // Check if the directory exists
    try {
      await fs.access(projectDir);
    } catch {
      logger.info(`No Claude sessions directory found for project: ${projectPath}`, LOG_CONTEXT);
      return [];
    }

    // List all .jsonl files in the directory
    const files = await fs.readdir(projectDir);
    const sessionFiles = files.filter((f) => f.endsWith('.jsonl'));

    // Get metadata for each session
    const sessions = await Promise.all(
      sessionFiles.map(async (filename) => {
        const sessionId = filename.replace('.jsonl', '');
        const filePath = path.join(projectDir, filename);

        try {
          const stats = await fs.stat(filePath);
          return await parseSessionFile(filePath, sessionId, projectPath, {
            size: stats.size,
            mtimeMs: stats.mtimeMs,
          });
        } catch (error) {
          logger.error(`Error processing session file: ${filename}`, LOG_CONTEXT, error);
          return null;
        }
      })
    );

    // Filter out nulls, 0-byte sessions, and sort by modified date
    const validSessions = sessions
      .filter((s): s is NonNullable<typeof s> => s !== null)
      // Filter out 0-byte sessions (created but abandoned before any content was written)
      .filter((s) => s.sizeBytes > 0)
      .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

    // Attach origin info
    const projectOrigins = this.getProjectOrigins(projectPath);
    const sessionsWithOrigins = validSessions.map((session) =>
      this.attachOriginInfo(session, projectOrigins)
    );

    logger.info(
      `Found ${validSessions.length} Claude sessions for project: ${projectPath}`,
      LOG_CONTEXT
    );
    return sessionsWithOrigins;
  }

  async listSessionsPaginated(
    projectPath: string,
    options?: SessionListOptions
  ): Promise<PaginatedSessionsResult> {
    const { cursor, limit = 100 } = options || {};
    const projectDir = this.getEncodedProjectDir(projectPath);

    // Check if the directory exists
    try {
      await fs.access(projectDir);
    } catch {
      return { sessions: [], hasMore: false, totalCount: 0, nextCursor: null };
    }

    // List all .jsonl files and get their stats
    const files = await fs.readdir(projectDir);
    const sessionFiles = files.filter((f) => f.endsWith('.jsonl'));

    const fileStats = await Promise.all(
      sessionFiles.map(async (filename) => {
        const sessionId = filename.replace('.jsonl', '');
        const filePath = path.join(projectDir, filename);
        try {
          const stats = await fs.stat(filePath);
          return {
            sessionId,
            filename,
            filePath,
            modifiedAt: stats.mtime.getTime(),
            sizeBytes: stats.size,
          };
        } catch {
          return null;
        }
      })
    );

    const sortedFiles = fileStats
      .filter((s): s is NonNullable<typeof s> => s !== null)
      // Filter out 0-byte sessions (created but abandoned before any content was written)
      .filter((s) => s.sizeBytes > 0)
      .sort((a, b) => b.modifiedAt - a.modifiedAt);

    const totalCount = sortedFiles.length;

    // Find cursor position
    let startIndex = 0;
    if (cursor) {
      const cursorIndex = sortedFiles.findIndex((f) => f.sessionId === cursor);
      startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
    }

    const pageFiles = sortedFiles.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < totalCount;
    const nextCursor = hasMore ? pageFiles[pageFiles.length - 1]?.sessionId : null;

    // Get project origins
    const projectOrigins = this.getProjectOrigins(projectPath);

    // Read full content for sessions in this page
    const sessions = await Promise.all(
      pageFiles.map(async (fileInfo) => {
        const session = await parseSessionFile(fileInfo.filePath, fileInfo.sessionId, projectPath, {
          size: fileInfo.sizeBytes,
          mtimeMs: fileInfo.modifiedAt,
        });
        if (session) {
          return this.attachOriginInfo(session, projectOrigins);
        }
        return null;
      })
    );

    const validSessions = sessions.filter((s): s is NonNullable<typeof s> => s !== null);

    logger.info(
      `Paginated Claude sessions - returned ${validSessions.length} of ${totalCount} total`,
      LOG_CONTEXT
    );

    return {
      sessions: validSessions,
      hasMore,
      totalCount,
      nextCursor,
    };
  }

  async readSessionMessages(
    projectPath: string,
    sessionId: string,
    options?: SessionReadOptions
  ): Promise<SessionMessagesResult> {
    const projectDir = this.getEncodedProjectDir(projectPath);
    const sessionFile = path.join(projectDir, `${sessionId}.jsonl`);

    const content = await fs.readFile(sessionFile, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());

    const messages: SessionMessage[] = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'user' || entry.type === 'assistant') {
          let msgContent = '';
          let toolUse = undefined;

          if (entry.message?.content) {
            if (typeof entry.message.content === 'string') {
              msgContent = entry.message.content;
            } else if (Array.isArray(entry.message.content)) {
              const textBlocks = entry.message.content.filter(
                (b: { type?: string }) => b.type === 'text'
              );
              const toolBlocks = entry.message.content.filter(
                (b: { type?: string }) => b.type === 'tool_use'
              );

              msgContent = textBlocks.map((b: { text?: string }) => b.text).join('\n');
              if (toolBlocks.length > 0) {
                toolUse = toolBlocks;
              }
            }
          }

          if (msgContent && msgContent.trim()) {
            messages.push({
              type: entry.type,
              role: entry.message?.role,
              content: msgContent,
              timestamp: entry.timestamp,
              uuid: entry.uuid,
              toolUse,
            });
          }
        }
      } catch {
        // Skip malformed lines
      }
    }

    // Apply offset and limit for lazy loading
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 20;

    const startIndex = Math.max(0, messages.length - offset - limit);
    const endIndex = messages.length - offset;
    const slice = messages.slice(startIndex, endIndex);

    return {
      messages: slice,
      total: messages.length,
      hasMore: startIndex > 0,
    };
  }

  async searchSessions(
    projectPath: string,
    query: string,
    searchMode: SessionSearchMode
  ): Promise<SessionSearchResult[]> {
    if (!query.trim()) {
      return [];
    }

    const projectDir = this.getEncodedProjectDir(projectPath);

    try {
      await fs.access(projectDir);
    } catch {
      return [];
    }

    const files = await fs.readdir(projectDir);
    const sessionFiles = files.filter((f) => f.endsWith('.jsonl'));

    const searchLower = query.toLowerCase();
    const matchingSessions: SessionSearchResult[] = [];

    for (const filename of sessionFiles) {
      const sessionId = filename.replace('.jsonl', '');
      const filePath = path.join(projectDir, filename);

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n').filter((l) => l.trim());

        let titleMatch = false;
        let userMatches = 0;
        let assistantMatches = 0;
        let matchPreview = '';

        for (const line of lines) {
          try {
            const entry = JSON.parse(line);

            let textContent = '';
            if (entry.message?.content) {
              if (typeof entry.message.content === 'string') {
                textContent = entry.message.content;
              } else if (Array.isArray(entry.message.content)) {
                textContent = entry.message.content
                  .filter((b: { type?: string }) => b.type === 'text')
                  .map((b: { text?: string }) => b.text)
                  .join('\n');
              }
            }

            const textLower = textContent.toLowerCase();

            if (entry.type === 'user' && !titleMatch && textLower.includes(searchLower)) {
              titleMatch = true;
              if (!matchPreview) {
                const idx = textLower.indexOf(searchLower);
                const start = Math.max(0, idx - 60);
                const end = Math.min(textContent.length, idx + query.length + 60);
                matchPreview =
                  (start > 0 ? '...' : '') +
                  textContent.slice(start, end) +
                  (end < textContent.length ? '...' : '');
              }
            }

            if (entry.type === 'user' && textLower.includes(searchLower)) {
              userMatches++;
              if (!matchPreview && (searchMode === 'user' || searchMode === 'all')) {
                const idx = textLower.indexOf(searchLower);
                const start = Math.max(0, idx - 60);
                const end = Math.min(textContent.length, idx + query.length + 60);
                matchPreview =
                  (start > 0 ? '...' : '') +
                  textContent.slice(start, end) +
                  (end < textContent.length ? '...' : '');
              }
            }

            if (entry.type === 'assistant' && textLower.includes(searchLower)) {
              assistantMatches++;
              if (!matchPreview && (searchMode === 'assistant' || searchMode === 'all')) {
                const idx = textLower.indexOf(searchLower);
                const start = Math.max(0, idx - 60);
                const end = Math.min(textContent.length, idx + query.length + 60);
                matchPreview =
                  (start > 0 ? '...' : '') +
                  textContent.slice(start, end) +
                  (end < textContent.length ? '...' : '');
              }
            }
          } catch {
            // Skip malformed lines
          }
        }

        let matches = false;
        let matchType: 'title' | 'user' | 'assistant' = 'title';
        let matchCount = 0;

        switch (searchMode) {
          case 'title':
            matches = titleMatch;
            matchType = 'title';
            matchCount = titleMatch ? 1 : 0;
            break;
          case 'user':
            matches = userMatches > 0;
            matchType = 'user';
            matchCount = userMatches;
            break;
          case 'assistant':
            matches = assistantMatches > 0;
            matchType = 'assistant';
            matchCount = assistantMatches;
            break;
          case 'all':
            matches = titleMatch || userMatches > 0 || assistantMatches > 0;
            matchType = titleMatch ? 'title' : userMatches > 0 ? 'user' : 'assistant';
            matchCount = userMatches + assistantMatches;
            break;
        }

        if (matches) {
          matchingSessions.push({
            sessionId,
            matchType,
            matchPreview,
            matchCount,
          });
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return matchingSessions;
  }

  getSessionPath(projectPath: string, sessionId: string): string | null {
    const projectDir = this.getEncodedProjectDir(projectPath);
    return path.join(projectDir, `${sessionId}.jsonl`);
  }

  async deleteMessagePair(
    projectPath: string,
    sessionId: string,
    userMessageUuid: string,
    fallbackContent?: string
  ): Promise<{ success: boolean; error?: string; linesRemoved?: number }> {
    const projectDir = this.getEncodedProjectDir(projectPath);
    const sessionFile = path.join(projectDir, `${sessionId}.jsonl`);

    try {
      const content = await fs.readFile(sessionFile, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim());

      const parsedLines: Array<{ line: string; entry: unknown }> = [];
      let userMessageIndex = -1;

      for (let i = 0; i < lines.length; i++) {
        try {
          const entry = JSON.parse(lines[i]);
          parsedLines.push({ line: lines[i], entry });

          if (entry.uuid === userMessageUuid && entry.type === 'user') {
            userMessageIndex = parsedLines.length - 1;
          }
        } catch {
          parsedLines.push({ line: lines[i], entry: null });
        }
      }

      // If UUID match failed, try content match
      if (userMessageIndex === -1 && fallbackContent) {
        const normalizedFallback = fallbackContent.trim();

        for (let i = parsedLines.length - 1; i >= 0; i--) {
          const entry = parsedLines[i].entry as {
            type?: string;
            message?: { content?: unknown };
          } | null;
          if (entry?.type === 'user') {
            let messageText = '';
            if (entry.message?.content) {
              if (typeof entry.message.content === 'string') {
                messageText = entry.message.content;
              } else if (Array.isArray(entry.message.content)) {
                const textBlocks = (
                  entry.message.content as Array<{ type?: string; text?: string }>
                ).filter((b) => b.type === 'text');
                messageText = textBlocks.map((b) => b.text).join('\n');
              }
            }

            if (messageText.trim() === normalizedFallback) {
              userMessageIndex = i;
              logger.info('Found message by content match', LOG_CONTEXT, { sessionId, index: i });
              break;
            }
          }
        }
      }

      if (userMessageIndex === -1) {
        logger.warn('User message not found for deletion', LOG_CONTEXT, {
          sessionId,
          userMessageUuid,
          hasFallback: !!fallbackContent,
        });
        return { success: false, error: 'User message not found' };
      }

      // Find the end of the response and collect tool_use IDs being deleted
      let endIndex = parsedLines.length;
      const deletedToolUseIds = new Set<string>();

      for (let i = userMessageIndex + 1; i < parsedLines.length; i++) {
        const entry = parsedLines[i].entry as {
          type?: string;
          message?: { content?: unknown };
        } | null;

        if (entry?.type === 'user') {
          endIndex = i;
          break;
        }

        // Collect tool_use IDs from assistant messages being deleted
        if (entry?.type === 'assistant' && entry.message?.content) {
          const content = entry.message.content;
          if (Array.isArray(content)) {
            for (const block of content as Array<{ type?: string; id?: string }>) {
              if (block.type === 'tool_use' && block.id) {
                deletedToolUseIds.add(block.id);
              }
            }
          }
        }
      }

      // Remove the message pair
      let linesToKeep = [...parsedLines.slice(0, userMessageIndex), ...parsedLines.slice(endIndex)];

      // If we deleted any tool_use blocks, clean up orphaned tool_result blocks
      if (deletedToolUseIds.size > 0) {
        linesToKeep = linesToKeep.map((item) => {
          const entry = item.entry as {
            type?: string;
            message?: { content?: unknown };
          } | null;

          // Only process user messages (tool_result blocks are in user messages)
          if (entry?.type !== 'user' || !entry.message?.content) {
            return item;
          }

          const content = entry.message.content;
          if (!Array.isArray(content)) {
            return item;
          }

          // Filter out tool_result blocks that reference deleted tool_use IDs
          const filteredContent = (content as Array<{ type?: string; tool_use_id?: string }>).filter(
            (block) => {
              if (block.type === 'tool_result' && block.tool_use_id) {
                return !deletedToolUseIds.has(block.tool_use_id);
              }
              return true;
            }
          );

          // If we removed all content blocks, mark this line for removal
          if (filteredContent.length === 0) {
            return { line: '', entry: null, remove: true };
          }

          // If content changed, update the line
          if (filteredContent.length !== content.length) {
            const updatedEntry = {
              ...entry,
              message: {
                ...entry.message,
                content: filteredContent,
              },
            };
            return { line: JSON.stringify(updatedEntry), entry: updatedEntry };
          }

          return item;
        }).filter((item) => !(item as { remove?: boolean }).remove);

        logger.info(`Cleaned up orphaned tool_result blocks`, LOG_CONTEXT, {
          sessionId,
          deletedToolUseIds: Array.from(deletedToolUseIds),
        });
      }

      const newContent = linesToKeep.map((p) => p.line).join('\n') + '\n';
      await fs.writeFile(sessionFile, newContent, 'utf-8');

      logger.info(`Deleted message pair from Claude session`, LOG_CONTEXT, {
        sessionId,
        userMessageUuid,
        linesRemoved: endIndex - userMessageIndex,
      });

      return { success: true, linesRemoved: endIndex - userMessageIndex };
    } catch (error) {
      logger.error(`Error deleting message pair: ${sessionId}`, LOG_CONTEXT, error);
      return { success: false, error: String(error) };
    }
  }

  // ============ Origin Management Methods ============
  // These are additional methods specific to Claude session management

  /**
   * Register the origin of a session (user or auto)
   */
  registerSessionOrigin(
    projectPath: string,
    agentSessionId: string,
    origin: AgentSessionOrigin,
    sessionName?: string
  ): void {
    const origins = this.originsStore.get('origins', {});
    if (!origins[projectPath]) {
      origins[projectPath] = {};
    }
    origins[projectPath][agentSessionId] = sessionName ? { origin, sessionName } : origin;
    this.originsStore.set('origins', origins);
    logger.debug(
      `Registered Claude session origin: ${agentSessionId} = ${origin}${sessionName ? ` (name: ${sessionName})` : ''}`,
      LOG_CONTEXT
    );
  }

  /**
   * Update the name of a session
   */
  updateSessionName(projectPath: string, agentSessionId: string, sessionName: string): void {
    const origins = this.originsStore.get('origins', {});
    if (!origins[projectPath]) {
      origins[projectPath] = {};
    }
    const existing = origins[projectPath][agentSessionId];
    if (typeof existing === 'string') {
      origins[projectPath][agentSessionId] = { origin: existing, sessionName };
    } else if (existing) {
      origins[projectPath][agentSessionId] = { ...existing, sessionName };
    } else {
      origins[projectPath][agentSessionId] = { origin: 'user', sessionName };
    }
    this.originsStore.set('origins', origins);
    logger.debug(`Updated Claude session name: ${agentSessionId} = ${sessionName}`, LOG_CONTEXT);
  }

  /**
   * Update the starred status of a session
   */
  updateSessionStarred(projectPath: string, agentSessionId: string, starred: boolean): void {
    const origins = this.originsStore.get('origins', {});
    if (!origins[projectPath]) {
      origins[projectPath] = {};
    }
    const existing = origins[projectPath][agentSessionId];
    if (typeof existing === 'string') {
      origins[projectPath][agentSessionId] = { origin: existing, starred };
    } else if (existing) {
      origins[projectPath][agentSessionId] = { ...existing, starred };
    } else {
      origins[projectPath][agentSessionId] = { origin: 'user', starred };
    }
    this.originsStore.set('origins', origins);
    logger.debug(`Updated Claude session starred: ${agentSessionId} = ${starred}`, LOG_CONTEXT);
  }

  /**
   * Get all origin info for a project
   */
  getSessionOrigins(projectPath: string): Record<string, SessionOriginInfo> {
    const origins = this.originsStore.get('origins', {});
    const projectOrigins = origins[projectPath] || {};

    // Normalize to SessionOriginInfo format
    const result: Record<string, SessionOriginInfo> = {};
    for (const [sessionId, data] of Object.entries(projectOrigins)) {
      if (typeof data === 'string') {
        result[sessionId] = { origin: data };
      } else {
        result[sessionId] = {
          origin: data.origin,
          sessionName: data.sessionName,
          starred: data.starred,
        };
      }
    }
    return result;
  }

  /**
   * Get all named sessions across all projects
   */
  async getAllNamedSessions(): Promise<
    Array<{
      agentSessionId: string;
      projectPath: string;
      sessionName: string;
      starred?: boolean;
      lastActivityAt?: number;
    }>
  > {
    const allOrigins = this.originsStore.get('origins', {});
    const namedSessions: Array<{
      agentSessionId: string;
      projectPath: string;
      sessionName: string;
      starred?: boolean;
      lastActivityAt?: number;
    }> = [];

    for (const [projectPath, sessions] of Object.entries(allOrigins)) {
      for (const [agentSessionId, info] of Object.entries(sessions)) {
        if (typeof info === 'object' && info.sessionName) {
          let lastActivityAt: number | undefined;
          try {
            const sessionFile = this.getSessionPath(projectPath, agentSessionId);
            if (sessionFile) {
              const stats = await fs.stat(sessionFile);
              lastActivityAt = stats.mtime.getTime();
            }
          } catch {
            // Session file may not exist or be inaccessible
          }

          namedSessions.push({
            agentSessionId,
            projectPath,
            sessionName: info.sessionName,
            starred: info.starred,
            lastActivityAt,
          });
        }
      }
    }

    return namedSessions;
  }
}

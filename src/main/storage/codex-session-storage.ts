/**
 * Codex CLI Session Storage Implementation
 *
 * This module implements the AgentSessionStorage interface for OpenAI Codex CLI.
 * Codex stores sessions as JSONL files in ~/.codex/sessions/YYYY/MM/DD/
 *
 * File structure:
 * - Each session is a .jsonl file named rollout-<timestamp>-<uuid>.jsonl
 * - First line contains session metadata (id, timestamp, git info)
 * - Subsequent lines contain message entries
 *
 * Session format (from Codex --json output):
 * ```json
 * // First line: session metadata
 * {"id":"uuid","timestamp":"ISO8601","git":{"commit_hash":"...","branch":"main","repository_url":"..."}}
 *
 * // Subsequent lines: conversation messages
 * {"type":"message","role":"user","content":[{"type":"input_text","text":"..."}]}
 * {"type":"message","role":"assistant","content":[...]}
 * ```
 */

import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { logger } from '../utils/logger';
import { execFileNoThrow } from '../utils/execFile';
import type {
  AgentSessionStorage,
  AgentSessionInfo,
  PaginatedSessionsResult,
  SessionMessagesResult,
  SessionSearchResult,
  SessionSearchMode,
  SessionListOptions,
  SessionReadOptions,
  SessionMessage,
} from '../agent-session-storage';
import type { ToolType } from '../../shared/types';

const LOG_CONTEXT = '[CodexSessionStorage]';

/**
 * Codex storage base directory
 */
const CODEX_SESSIONS_DIR = path.join(os.homedir(), '.codex', 'sessions');

/**
 * Parse limits for session files
 */
const CODEX_SESSION_PARSE_LIMITS = {
  FIRST_MESSAGE_SCAN_LINES: 50,
  LAST_TIMESTAMP_SCAN_LINES: 20,
  FIRST_MESSAGE_PREVIEW_LENGTH: 200,
} as const;

/**
 * Codex session metadata structure (first line of JSONL)
 */
interface CodexSessionMetadata {
  id: string;
  timestamp?: string;
  git?: {
    commit_hash?: string;
    branch?: string;
    repository_url?: string;
  };
}

/**
 * Codex message content structure
 */
interface CodexMessageContent {
  type: string;
  text?: string;
  // Tool use fields
  tool?: string;
  args?: unknown;
  output?: string;
}

/**
 * Extract the session ID (UUID) from a Codex session filename
 * Format: rollout-TIMESTAMP-UUID.jsonl
 */
function extractSessionIdFromFilename(filename: string): string | null {
  // Match pattern: rollout-YYYYMMDD_HHMMSS_MMM-UUID.jsonl or similar
  const match = filename.match(/rollout-[\d_]+-([a-f0-9-]+)\.jsonl$/i);
  if (match) {
    return match[1];
  }
  // Fallback: use filename without extension
  return filename.replace('.jsonl', '');
}

/**
 * Extract text from Codex message content array
 */
function extractTextFromContent(content: CodexMessageContent[] | undefined): string {
  if (!content || !Array.isArray(content)) {
    return '';
  }

  const textParts = content
    .filter((part) => part.type === 'input_text' || part.type === 'text')
    .map((part) => part.text || '')
    .filter((text) => text.trim());

  return textParts.join(' ');
}


/**
 * Get the git remote URL for a project path
 */
async function getGitRemoteUrl(projectPath: string): Promise<string | null> {
  try {
    const result = await execFileNoThrow('git', ['remote', 'get-url', 'origin'], projectPath);
    if (result.exitCode === 0 && result.stdout) {
      return result.stdout.trim();
    }
  } catch {
    // Not a git repo or no remote
  }
  return null;
}

/**
 * Normalize git URL for comparison
 * Handles SSH vs HTTPS differences and trailing .git
 */
function normalizeGitUrl(url: string | undefined): string {
  if (!url) return '';

  // Remove trailing .git
  let normalized = url.replace(/\.git$/, '');

  // Convert SSH to HTTPS format for comparison
  // git@github.com:user/repo -> https://github.com/user/repo
  const sshMatch = normalized.match(/^git@([^:]+):(.+)$/);
  if (sshMatch) {
    normalized = `https://${sshMatch[1]}/${sshMatch[2]}`;
  }

  return normalized.toLowerCase();
}

/**
 * Parse a Codex session file and extract metadata
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

    if (lines.length === 0) {
      return null;
    }

    // Parse first line as metadata
    let metadata: CodexSessionMetadata | null = null;
    let timestamp = new Date(stats.mtimeMs).toISOString();

    try {
      const firstLine = JSON.parse(lines[0]);
      if (firstLine.id && firstLine.timestamp) {
        metadata = firstLine as CodexSessionMetadata;
        timestamp = metadata.timestamp || timestamp;
      }
    } catch {
      // First line may not be metadata, continue parsing
    }

    // Count messages and find first user message
    let firstUserMessage = '';
    let userMessageCount = 0;
    let assistantMessageCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCachedTokens = 0;
    let firstTimestamp = timestamp;
    let lastTimestamp = timestamp;

    for (let i = 0; i < lines.length; i++) {
      try {
        const entry = JSON.parse(lines[i]);

        // Handle turn.completed for usage stats
        if (entry.type === 'turn.completed' && entry.usage) {
          totalInputTokens += entry.usage.input_tokens || 0;
          totalOutputTokens += entry.usage.output_tokens || 0;
          totalOutputTokens += entry.usage.reasoning_output_tokens || 0;
          totalCachedTokens += entry.usage.cached_input_tokens || 0;
        }

        // Handle message entries
        if (entry.type === 'message') {
          if (entry.role === 'user') {
            userMessageCount++;
            if (!firstUserMessage && entry.content) {
              const text = extractTextFromContent(entry.content);
              if (text.trim()) {
                firstUserMessage = text;
              }
            }
          } else if (entry.role === 'assistant') {
            assistantMessageCount++;
          }
        }

        // Handle item.completed for agent messages
        if (entry.type === 'item.completed' && entry.item) {
          if (entry.item.type === 'agent_message') {
            assistantMessageCount++;
            if (!firstUserMessage && entry.item.text) {
              firstUserMessage = entry.item.text;
            }
          }
        }

        // Track timestamps for duration
        if (entry.timestamp) {
          const entryTime = new Date(entry.timestamp).getTime();
          const firstTime = new Date(firstTimestamp).getTime();
          const lastTime = new Date(lastTimestamp).getTime();

          if (entryTime < firstTime) {
            firstTimestamp = entry.timestamp;
          }
          if (entryTime > lastTime) {
            lastTimestamp = entry.timestamp;
          }
        }
      } catch {
        // Skip malformed lines
      }
    }

    const messageCount = userMessageCount + assistantMessageCount;

    const startTime = new Date(firstTimestamp).getTime();
    const endTime = new Date(lastTimestamp).getTime();
    const durationSeconds = Math.max(0, Math.floor((endTime - startTime) / 1000));

    return {
      sessionId: metadata?.id || sessionId,
      projectPath,
      timestamp: firstTimestamp,
      modifiedAt: new Date(stats.mtimeMs).toISOString(),
      firstMessage: firstUserMessage.slice(0, CODEX_SESSION_PARSE_LIMITS.FIRST_MESSAGE_PREVIEW_LENGTH),
      messageCount,
      sizeBytes: stats.size,
      // Note: costUsd omitted - Codex doesn't provide cost and pricing varies by model
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      cacheReadTokens: totalCachedTokens,
      cacheCreationTokens: 0, // Codex doesn't report cache creation separately
      durationSeconds,
    };
  } catch (error) {
    logger.error(`Error reading Codex session file: ${filePath}`, LOG_CONTEXT, error);
    return null;
  }
}

/**
 * Codex CLI Session Storage Implementation
 *
 * Provides access to Codex CLI's local session storage at ~/.codex/sessions/
 */
export class CodexSessionStorage implements AgentSessionStorage {
  readonly agentId: ToolType = 'codex';

  /**
   * Get the Codex sessions directory path
   */
  private getSessionsDir(): string {
    return CODEX_SESSIONS_DIR;
  }

  /**
   * Find all session files, organized by date directories
   */
  private async findAllSessionFiles(): Promise<
    Array<{ filePath: string; filename: string }>
  > {
    const sessionsDir = this.getSessionsDir();
    const sessionFiles: Array<{ filePath: string; filename: string }> = [];

    try {
      await fs.access(sessionsDir);
    } catch {
      return [];
    }

    // Scan YYYY directories
    const years = await fs.readdir(sessionsDir);
    for (const year of years) {
      if (!/^\d{4}$/.test(year)) continue;

      const yearDir = path.join(sessionsDir, year);
      try {
        const yearStat = await fs.stat(yearDir);
        if (!yearStat.isDirectory()) continue;
      } catch {
        continue;
      }

      // Scan MM directories
      const months = await fs.readdir(yearDir);
      for (const month of months) {
        if (!/^\d{2}$/.test(month)) continue;

        const monthDir = path.join(yearDir, month);
        try {
          const monthStat = await fs.stat(monthDir);
          if (!monthStat.isDirectory()) continue;
        } catch {
          continue;
        }

        // Scan DD directories
        const days = await fs.readdir(monthDir);
        for (const day of days) {
          if (!/^\d{2}$/.test(day)) continue;

          const dayDir = path.join(monthDir, day);
          try {
            const dayStat = await fs.stat(dayDir);
            if (!dayStat.isDirectory()) continue;

            // Find session files
            const files = await fs.readdir(dayDir);
            for (const file of files) {
              if (file.endsWith('.jsonl')) {
                sessionFiles.push({
                  filePath: path.join(dayDir, file),
                  filename: file,
                });
              }
            }
          } catch {
            continue;
          }
        }
      }
    }

    return sessionFiles;
  }

  /**
   * Check if a session belongs to a project based on git repository URL
   */
  private async sessionMatchesProject(
    sessionFilePath: string,
    projectGitUrl: string | null
  ): Promise<boolean> {
    if (!projectGitUrl) {
      // If project has no git remote, we can't filter sessions by git URL
      // Return false to avoid showing unrelated sessions
      return false;
    }

    try {
      const content = await fs.readFile(sessionFilePath, 'utf-8');
      const firstLine = content.split('\n')[0];

      if (!firstLine) return false;

      const metadata = JSON.parse(firstLine) as CodexSessionMetadata;

      if (metadata.git?.repository_url) {
        const sessionGitUrl = normalizeGitUrl(metadata.git.repository_url);
        const normalizedProjectUrl = normalizeGitUrl(projectGitUrl);
        return sessionGitUrl === normalizedProjectUrl;
      }

      // No git info in session metadata - can't determine match
      return false;
    } catch {
      return false;
    }
  }

  async listSessions(projectPath: string): Promise<AgentSessionInfo[]> {
    const projectGitUrl = await getGitRemoteUrl(projectPath);
    const allSessionFiles = await this.findAllSessionFiles();

    if (allSessionFiles.length === 0) {
      logger.info(`No Codex sessions found`, LOG_CONTEXT);
      return [];
    }

    // Filter and parse sessions that match the project
    const sessions: AgentSessionInfo[] = [];

    for (const { filePath, filename } of allSessionFiles) {
      // Check if session matches project
      const matches = await this.sessionMatchesProject(filePath, projectGitUrl);
      if (!matches) continue;

      const sessionId = extractSessionIdFromFilename(filename) || filename;

      try {
        const stats = await fs.stat(filePath);
        const session = await parseSessionFile(filePath, sessionId, projectPath, {
          size: stats.size,
          mtimeMs: stats.mtimeMs,
        });

        if (session) {
          sessions.push(session);
        }
      } catch (error) {
        logger.error(`Error processing Codex session file: ${filename}`, LOG_CONTEXT, error);
      }
    }

    // Sort by modified date (newest first)
    sessions.sort(
      (a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
    );

    logger.info(
      `Found ${sessions.length} Codex sessions for project: ${projectPath}`,
      LOG_CONTEXT
    );

    return sessions;
  }

  async listSessionsPaginated(
    projectPath: string,
    options?: SessionListOptions
  ): Promise<PaginatedSessionsResult> {
    const allSessions = await this.listSessions(projectPath);
    const { cursor, limit = 100 } = options || {};

    let startIndex = 0;
    if (cursor) {
      const cursorIndex = allSessions.findIndex((s) => s.sessionId === cursor);
      startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
    }

    const pageSessions = allSessions.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < allSessions.length;
    const nextCursor = hasMore ? pageSessions[pageSessions.length - 1]?.sessionId : null;

    return {
      sessions: pageSessions,
      hasMore,
      totalCount: allSessions.length,
      nextCursor,
    };
  }

  async readSessionMessages(
    _projectPath: string,
    sessionId: string,
    options?: SessionReadOptions
  ): Promise<SessionMessagesResult> {
    // Find the session file by sessionId
    const sessionFilePath = await this.findSessionFile(sessionId);

    if (!sessionFilePath) {
      logger.warn(`Codex session file not found: ${sessionId}`, LOG_CONTEXT);
      return { messages: [], total: 0, hasMore: false };
    }

    try {
      const content = await fs.readFile(sessionFilePath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim());

      const messages: SessionMessage[] = [];
      let messageIndex = 0;

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);

          // Handle direct message entries
          if (entry.type === 'message' && (entry.role === 'user' || entry.role === 'assistant')) {
            const textContent = extractTextFromContent(entry.content);

            if (textContent) {
              messages.push({
                type: entry.role,
                role: entry.role,
                content: textContent,
                timestamp: entry.timestamp || '',
                uuid: `codex-msg-${messageIndex}`,
              });
              messageIndex++;
            }
          }

          // Handle item.completed agent_message events
          if (entry.type === 'item.completed' && entry.item?.type === 'agent_message') {
            messages.push({
              type: 'assistant',
              role: 'assistant',
              content: entry.item.text || '',
              timestamp: entry.timestamp || '',
              uuid: entry.item.id || `codex-msg-${messageIndex}`,
            });
            messageIndex++;
          }

          // Handle item.completed tool_call events
          if (entry.type === 'item.completed' && entry.item?.type === 'tool_call') {
            const toolInfo = {
              tool: entry.item.tool,
              args: entry.item.args,
            };
            messages.push({
              type: 'assistant',
              role: 'assistant',
              content: `Tool: ${entry.item.tool}`,
              timestamp: entry.timestamp || '',
              uuid: entry.item.id || `codex-msg-${messageIndex}`,
              toolUse: [toolInfo],
            });
            messageIndex++;
          }

          // Handle item.completed tool_result events
          if (entry.type === 'item.completed' && entry.item?.type === 'tool_result') {
            let resultContent = '';
            if (entry.item.output) {
              // Output may be a byte array that needs decoding
              if (Array.isArray(entry.item.output)) {
                resultContent = Buffer.from(entry.item.output).toString('utf-8');
              } else {
                resultContent = String(entry.item.output);
              }
            }

            messages.push({
              type: 'assistant',
              role: 'assistant',
              content: resultContent || '[Tool result]',
              timestamp: entry.timestamp || '',
              uuid: entry.item.id || `codex-msg-${messageIndex}`,
            });
            messageIndex++;
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
    } catch (error) {
      logger.error(`Error reading Codex session: ${sessionId}`, LOG_CONTEXT, error);
      return { messages: [], total: 0, hasMore: false };
    }
  }

  async searchSessions(
    projectPath: string,
    query: string,
    searchMode: SessionSearchMode
  ): Promise<SessionSearchResult[]> {
    if (!query.trim()) {
      return [];
    }

    const sessions = await this.listSessions(projectPath);
    const searchLower = query.toLowerCase();
    const results: SessionSearchResult[] = [];

    for (const session of sessions) {
      const sessionFilePath = await this.findSessionFile(session.sessionId);
      if (!sessionFilePath) continue;

      try {
        const content = await fs.readFile(sessionFilePath, 'utf-8');
        const lines = content.split('\n').filter((l) => l.trim());

        let titleMatch = false;
        let userMatches = 0;
        let assistantMatches = 0;
        let matchPreview = '';

        for (const line of lines) {
          try {
            const entry = JSON.parse(line);

            let textContent = '';
            let role: 'user' | 'assistant' | null = null;

            // Handle message entries
            if (entry.type === 'message') {
              role = entry.role;
              textContent = extractTextFromContent(entry.content);
            }

            // Handle item.completed agent_message
            if (entry.type === 'item.completed' && entry.item?.type === 'agent_message') {
              role = 'assistant';
              textContent = entry.item.text || '';
            }

            const textLower = textContent.toLowerCase();

            if (role === 'user' && textLower.includes(searchLower)) {
              if (!titleMatch) {
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
              userMatches++;
            }

            if (role === 'assistant' && textLower.includes(searchLower)) {
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
          results.push({
            sessionId: session.sessionId,
            matchType,
            matchPreview,
            matchCount,
          });
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return results;
  }

  getSessionPath(_projectPath: string, _sessionId: string): string | null {
    // Synchronous version - returns null since we need async file search
    // Use findSessionFile for async access
    return null;
  }

  /**
   * Find the file path for a session by ID (async)
   */
  private async findSessionFile(sessionId: string): Promise<string | null> {
    const allFiles = await this.findAllSessionFiles();

    for (const { filePath, filename } of allFiles) {
      const fileSessionId = extractSessionIdFromFilename(filename);
      if (fileSessionId === sessionId) {
        return filePath;
      }

      // Also check by reading first line for session ID
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const firstLine = content.split('\n')[0];
        if (firstLine) {
          const metadata = JSON.parse(firstLine) as CodexSessionMetadata;
          if (metadata.id === sessionId) {
            return filePath;
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return null;
  }

  async deleteMessagePair(
    _projectPath: string,
    sessionId: string,
    userMessageUuid: string,
    fallbackContent?: string
  ): Promise<{ success: boolean; error?: string; linesRemoved?: number }> {
    const sessionFilePath = await this.findSessionFile(sessionId);

    if (!sessionFilePath) {
      logger.warn('Codex session file not found for deletion', LOG_CONTEXT, { sessionId });
      return { success: false, error: 'Session file not found' };
    }

    try {
      const content = await fs.readFile(sessionFilePath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim());

      interface ParsedLine {
        line: string;
        entry: {
          type?: string;
          role?: string;
          content?: CodexMessageContent[];
          item?: {
            id?: string;
            type?: string;
            tool?: string;
            tool_call_id?: string;
          };
        } | null;
        remove?: boolean;
      }

      const parsedLines: ParsedLine[] = [];
      let userMessageIndex = -1;

      // Parse all lines and find the target user message
      for (let i = 0; i < lines.length; i++) {
        try {
          const entry = JSON.parse(lines[i]);
          parsedLines.push({ line: lines[i], entry });

          // Match by UUID (format: codex-msg-N)
          if (entry.type === 'message' && entry.role === 'user') {
            const msgIndex = parsedLines.length - 1;
            if (userMessageUuid === `codex-msg-${msgIndex}`) {
              userMessageIndex = msgIndex;
            }
          }
        } catch {
          parsedLines.push({ line: lines[i], entry: null });
        }
      }

      // Fallback: try content match if UUID didn't work
      if (userMessageIndex === -1 && fallbackContent) {
        const normalizedFallback = fallbackContent.trim().toLowerCase();

        for (let i = parsedLines.length - 1; i >= 0; i--) {
          const entry = parsedLines[i].entry;
          if (entry?.type === 'message' && entry?.role === 'user' && entry.content) {
            const textContent = extractTextFromContent(entry.content);
            if (textContent.trim().toLowerCase() === normalizedFallback) {
              userMessageIndex = i;
              logger.info('Found Codex message by content match', LOG_CONTEXT, { sessionId, index: i });
              break;
            }
          }
        }
      }

      if (userMessageIndex === -1) {
        logger.warn('User message not found for deletion in Codex session', LOG_CONTEXT, {
          sessionId,
          userMessageUuid,
          hasFallback: !!fallbackContent,
        });
        return { success: false, error: 'User message not found' };
      }

      // Find the end of the response (next user message) and collect tool_call IDs being deleted
      let endIndex = parsedLines.length;
      const deletedToolCallIds = new Set<string>();

      for (let i = userMessageIndex + 1; i < parsedLines.length; i++) {
        const entry = parsedLines[i].entry;

        // Stop at the next user message
        if (entry?.type === 'message' && entry?.role === 'user') {
          endIndex = i;
          break;
        }

        // Collect tool_call IDs from item.completed events being deleted
        if (entry?.type === 'item.completed' && entry?.item?.type === 'tool_call' && entry?.item?.id) {
          deletedToolCallIds.add(entry.item.id);
        }
      }

      // Remove the message pair
      let linesToKeep = [...parsedLines.slice(0, userMessageIndex), ...parsedLines.slice(endIndex)];

      // If we deleted any tool_call blocks, clean up orphaned tool_result blocks
      if (deletedToolCallIds.size > 0) {
        linesToKeep = linesToKeep.filter((item) => {
          const entry = item.entry;

          // Remove tool_result events that reference deleted tool_call IDs
          if (entry?.type === 'item.completed' && entry?.item?.type === 'tool_result') {
            // tool_result items reference tool_call via tool_call_id or the item.id pattern
            const toolCallId = entry.item.tool_call_id || entry.item.id;
            if (toolCallId && deletedToolCallIds.has(toolCallId)) {
              return false;
            }
          }

          return true;
        });

        logger.info('Cleaned up orphaned tool_result blocks in Codex session', LOG_CONTEXT, {
          sessionId,
          deletedToolCallIds: Array.from(deletedToolCallIds),
        });
      }

      const newContent = linesToKeep.map((p) => p.line).join('\n') + '\n';
      await fs.writeFile(sessionFilePath, newContent, 'utf-8');

      const linesRemoved = parsedLines.length - linesToKeep.length;
      logger.info('Deleted message pair from Codex session', LOG_CONTEXT, {
        sessionId,
        userMessageUuid,
        linesRemoved,
      });

      return { success: true, linesRemoved };
    } catch (error) {
      logger.error('Error deleting message pair from Codex session', LOG_CONTEXT, { sessionId, error });
      return { success: false, error: String(error) };
    }
  }
}

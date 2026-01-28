/**
 * Factory Droid Session Storage Implementation
 *
 * This module implements the AgentSessionStorage interface for Factory Droid.
 * Factory Droid stores sessions as JSONL files in ~/.factory/sessions/
 *
 * Directory structure:
 * - ~/.factory/sessions/<encoded-project-path>/<uuid>.jsonl - Message history
 * - ~/.factory/sessions/<encoded-project-path>/<uuid>.settings.json - Session metadata
 *
 * Path encoding: Project paths have `/` replaced with `-`
 * Example: /Users/octavia/myproject -> -Users-octavia-myproject
 *
 * JSONL format:
 * - {"type":"message","id":"...","timestamp":"...","message":{"role":"user"|"assistant","content":[...]}}
 *
 * Settings.json contains:
 * - assistantActiveTimeMs: Session duration
 * - model: Model ID used
 * - reasoningEffort: Reasoning level
 * - autonomyMode: Autonomy mode
 * - tokenUsage: { inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, thinkingTokens }
 *
 * Verified against Factory Droid session files (2026-01-16)
 * @see https://docs.factory.ai/cli
 */

import path from 'path';
import os from 'os';
import fs from 'fs/promises';
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
	SessionMessage,
} from '../agent-session-storage';
import type { ToolType, SshRemoteConfig } from '../../shared/types';

const LOG_CONTEXT = '[FactoryDroidSessionStorage]';

/**
 * Get Factory Droid storage base directory
 * - All platforms: ~/.factory/sessions
 */
function getFactorySessionsDir(): string {
	return path.join(os.homedir(), '.factory', 'sessions');
}

/**
 * Content item types in Factory Droid messages
 */
interface FactoryContentItem {
	type: 'text' | 'thinking' | 'tool_use' | 'tool_result';
	text?: string;
	thinking?: string;
	signature?: string;
	id?: string;
	name?: string;
	input?: Record<string, unknown>;
	tool_use_id?: string;
	content?: string;
}

/**
 * Factory Droid message structure from JSONL
 */
interface FactoryMessage {
	type: 'message';
	id: string;
	timestamp: string;
	message: {
		role: 'user' | 'assistant';
		content: FactoryContentItem[] | string;
	};
	parentId?: string;
}

/**
 * Factory Droid settings.json structure
 */
interface FactorySettings {
	assistantActiveTimeMs?: number;
	model?: string;
	reasoningEffort?: string;
	autonomyMode?: string;
	tokenUsage?: {
		inputTokens?: number;
		outputTokens?: number;
		cacheCreationTokens?: number;
		cacheReadTokens?: number;
		thinkingTokens?: number;
	};
	providerLock?: string;
	providerLockTimestamp?: string;
}

/**
 * Encode a project path for Factory Droid's directory structure
 * Factory replaces / with - in the path
 */
function encodeProjectPath(projectPath: string): string {
	// Normalize and encode: /Users/octavia/proj -> -Users-octavia-proj
	const normalized = path.resolve(projectPath);
	return normalized.replace(/\//g, '-');
}

/**
 * Read a JSON file safely
 */
async function readJsonFile<T>(filePath: string): Promise<T | null> {
	try {
		const content = await fs.readFile(filePath, 'utf-8');
		return JSON.parse(content) as T;
	} catch {
		return null;
	}
}

/**
 * Extract text content from Factory Droid message content array
 */
function extractTextFromContent(content: FactoryContentItem[] | string): string {
	if (typeof content === 'string') {
		return content;
	}

	if (Array.isArray(content)) {
		return content
			.filter((c) => c.type === 'text' && c.text)
			.map((c) => c.text || '')
			.join(' ')
			.trim();
	}

	return '';
}

/**
 * Factory Droid Session Storage Implementation
 *
 * Provides access to Factory Droid's local session storage at ~/.factory/sessions/
 */
export class FactoryDroidSessionStorage implements AgentSessionStorage {
	readonly agentId: ToolType = 'factory-droid';

	/**
	 * Get the session directory for a project
	 */
	private getProjectSessionDir(projectPath: string): string {
		return path.join(getFactorySessionsDir(), encodeProjectPath(projectPath));
	}

	/**
	 * Load and parse messages from a session JSONL file
	 */
	private async loadSessionMessages(sessionPath: string): Promise<FactoryMessage[]> {
		try {
			const content = await fs.readFile(sessionPath, 'utf-8');
			const lines = content.trim().split('\n').filter((l) => l.trim());
			const messages: FactoryMessage[] = [];

			for (const line of lines) {
				try {
					const parsed = JSON.parse(line);
					if (parsed.type === 'message' && parsed.message) {
						messages.push(parsed as FactoryMessage);
					}
				} catch {
					// Skip unparseable lines
				}
			}

			return messages;
		} catch {
			return [];
		}
	}

	async listSessions(
		projectPath: string,
		_sshConfig?: SshRemoteConfig
	): Promise<AgentSessionInfo[]> {
		// TODO: Implement SSH remote support
		const projectDir = this.getProjectSessionDir(projectPath);

		try {
			await fs.access(projectDir);
		} catch {
			logger.info(`No Factory Droid sessions directory for project: ${projectPath}`, LOG_CONTEXT);
			return [];
		}

		const files = await fs.readdir(projectDir);
		const sessions: AgentSessionInfo[] = [];

		for (const file of files) {
			if (!file.endsWith('.jsonl')) continue;

			const sessionId = path.basename(file, '.jsonl');
			const jsonlPath = path.join(projectDir, file);
			const settingsPath = path.join(projectDir, `${sessionId}.settings.json`);

			try {
				const [jsonlStat, settings] = await Promise.all([
					fs.stat(jsonlPath),
					readJsonFile<FactorySettings>(settingsPath),
				]);

				// Load messages to get first message and count
				const messages = await this.loadSessionMessages(jsonlPath);

				// Get first user message for preview
				let firstMessage = '';
				for (const msg of messages) {
					if (msg.message.role === 'user') {
						const textContent = extractTextFromContent(msg.message.content);
						if (textContent.trim()) {
							firstMessage = textContent.slice(0, 200);
							break;
						}
					}
				}

				// Count user and assistant messages
				const messageCount = messages.filter(
					(m) => m.message.role === 'user' || m.message.role === 'assistant'
				).length;

				// Calculate duration from settings or timestamps
				let durationSeconds = 0;
				if (settings?.assistantActiveTimeMs) {
					durationSeconds = Math.round(settings.assistantActiveTimeMs / 1000);
				} else if (messages.length >= 2) {
					const firstTime = new Date(messages[0].timestamp).getTime();
					const lastTime = new Date(messages[messages.length - 1].timestamp).getTime();
					durationSeconds = Math.max(0, Math.floor((lastTime - firstTime) / 1000));
				}

				// Get timestamps
				const createdAt = messages[0]?.timestamp || jsonlStat.birthtime.toISOString();
				const modifiedAt =
					messages[messages.length - 1]?.timestamp || jsonlStat.mtime.toISOString();

				sessions.push({
					sessionId,
					projectPath,
					timestamp: createdAt,
					modifiedAt,
					firstMessage: firstMessage || 'Factory Droid session',
					messageCount,
					sizeBytes: jsonlStat.size,
					inputTokens: settings?.tokenUsage?.inputTokens || 0,
					outputTokens: settings?.tokenUsage?.outputTokens || 0,
					cacheReadTokens: settings?.tokenUsage?.cacheReadTokens || 0,
					cacheCreationTokens: settings?.tokenUsage?.cacheCreationTokens || 0,
					durationSeconds,
					// Factory Droid doesn't provide cost in settings.json
				});
			} catch (e) {
				logger.warn(`Error reading Factory Droid session ${sessionId}`, LOG_CONTEXT, { error: e });
			}
		}

		// Sort by modified date (newest first)
		sessions.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

		logger.info(
			`Found ${sessions.length} Factory Droid sessions for project: ${projectPath}`,
			LOG_CONTEXT
		);
		return sessions;
	}

	async listSessionsPaginated(
		projectPath: string,
		options?: SessionListOptions,
		sshConfig?: SshRemoteConfig
	): Promise<PaginatedSessionsResult> {
		const allSessions = await this.listSessions(projectPath, sshConfig);
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
		projectPath: string,
		sessionId: string,
		options?: SessionReadOptions,
		_sshConfig?: SshRemoteConfig
	): Promise<SessionMessagesResult> {
		const sessionPath = path.join(
			this.getProjectSessionDir(projectPath),
			`${sessionId}.jsonl`
		);

		const factoryMessages = await this.loadSessionMessages(sessionPath);

		const sessionMessages: SessionMessage[] = [];

		for (const msg of factoryMessages) {
			const role = msg.message.role;
			if (role !== 'user' && role !== 'assistant') continue;

			const textContent = extractTextFromContent(msg.message.content);

			// Extract tool use if present
			let toolUse: unknown = undefined;
			if (Array.isArray(msg.message.content)) {
				const toolItems = msg.message.content.filter(
					(c) => c.type === 'tool_use' || c.type === 'tool_result'
				);
				if (toolItems.length > 0) {
					toolUse = toolItems;
				}
			}

			if (textContent || toolUse) {
				sessionMessages.push({
					type: role,
					role,
					content: textContent,
					timestamp: msg.timestamp,
					uuid: msg.id,
					toolUse,
				});
			}
		}

		// Apply offset and limit for lazy loading
		const offset = options?.offset ?? 0;
		const limit = options?.limit ?? 20;

		const startIndex = Math.max(0, sessionMessages.length - offset - limit);
		const endIndex = sessionMessages.length - offset;
		const slice = sessionMessages.slice(startIndex, endIndex);

		return {
			messages: slice,
			total: sessionMessages.length,
			hasMore: startIndex > 0,
		};
	}

	async searchSessions(
		projectPath: string,
		query: string,
		searchMode: SessionSearchMode,
		sshConfig?: SshRemoteConfig
	): Promise<SessionSearchResult[]> {
		if (!query.trim()) {
			return [];
		}

		const sessions = await this.listSessions(projectPath, sshConfig);
		const searchLower = query.toLowerCase();
		const results: SessionSearchResult[] = [];

		for (const session of sessions) {
			const sessionPath = path.join(
				this.getProjectSessionDir(projectPath),
				`${session.sessionId}.jsonl`
			);
			const messages = await this.loadSessionMessages(sessionPath);

			let titleMatch = false;
			let userMatches = 0;
			let assistantMatches = 0;
			let matchPreview = '';

			for (const msg of messages) {
				const textContent = extractTextFromContent(msg.message.content);
				const textLower = textContent.toLowerCase();

				if (msg.message.role === 'user' && textLower.includes(searchLower)) {
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

				if (msg.message.role === 'assistant' && textLower.includes(searchLower)) {
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
		}

		return results;
	}

	getSessionPath(
		projectPath: string,
		sessionId: string,
		_sshConfig?: SshRemoteConfig
	): string | null {
		return path.join(this.getProjectSessionDir(projectPath), `${sessionId}.jsonl`);
	}

	async deleteMessagePair(
		projectPath: string,
		sessionId: string,
		userMessageUuid: string,
		fallbackContent?: string,
		_sshConfig?: SshRemoteConfig
	): Promise<{ success: boolean; error?: string; linesRemoved?: number }> {
		try {
			const sessionPath = path.join(
				this.getProjectSessionDir(projectPath),
				`${sessionId}.jsonl`
			);

			const content = await fs.readFile(sessionPath, 'utf-8');
			const lines = content.trim().split('\n');
			const newLines: string[] = [];
			let linesRemoved = 0;
			let foundUserMessage = false;
			let skipUntilNextUser = false;

			for (const line of lines) {
				if (!line.trim()) {
					newLines.push(line);
					continue;
				}

				try {
					const parsed = JSON.parse(line);

					// Check if this is the target user message
					if (!foundUserMessage && parsed.type === 'message') {
						const isTargetByUuid = parsed.id === userMessageUuid;
						const isTargetByContent =
							fallbackContent &&
							parsed.message?.role === 'user' &&
							extractTextFromContent(parsed.message.content)
								.trim()
								.toLowerCase() === fallbackContent.trim().toLowerCase();

						if (isTargetByUuid || isTargetByContent) {
							foundUserMessage = true;
							skipUntilNextUser = true;
							linesRemoved++;
							continue;
						}
					}

					// Skip assistant messages after the target user message
					if (skipUntilNextUser) {
						if (parsed.type === 'message' && parsed.message?.role === 'user') {
							skipUntilNextUser = false;
							newLines.push(line);
						} else {
							linesRemoved++;
							continue;
						}
					} else {
						newLines.push(line);
					}
				} catch {
					newLines.push(line);
				}
			}

			if (!foundUserMessage) {
				return { success: false, error: 'User message not found' };
			}

			// Write the modified content back
			await fs.writeFile(sessionPath, newLines.join('\n') + '\n', 'utf-8');

			logger.info('Deleted message pair from Factory Droid session', LOG_CONTEXT, {
				sessionId,
				userMessageUuid,
				linesRemoved,
			});

			return { success: true, linesRemoved };
		} catch (error) {
			logger.error('Error deleting message pair from Factory Droid session', LOG_CONTEXT, {
				sessionId,
				error,
			});
			return { success: false, error: String(error) };
		}
	}
}

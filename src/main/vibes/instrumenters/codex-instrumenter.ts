// VIBES v1.0 Codex Instrumenter — Processes events from the Codex agent
// output parser to generate VIBES annotations. Handles tool executions,
// reasoning chunks, usage stats, prompts, and final results.
//
// Codex tool events differ from Claude Code:
// - Tool names come from Codex's internal tool registry (e.g. 'shell', 'write_file',
//   'read_file', 'apply_patch', 'container_shell')
// - Tool state has { status: 'running', input: { ...args } } for tool_call events
//   and { status: 'completed', output: '...' } for tool_result events
// - Reasoning comes via isPartial:true text events (from 'reasoning' items)

import type { VibesSessionManager } from '../vibes-session';
import {
	createCommandEntry,
	createLineAnnotation,
	createReasoningEntry,
	createPromptEntry,
} from '../vibes-annotations';
import type { ParsedEvent } from '../../parsers/agent-output-parser';
import type {
	VibesAssuranceLevel,
	VibesAction,
	VibesCommandType,
} from '../../../shared/vibes-types';

// ============================================================================
// Tool Name Mapping
// ============================================================================

/** Map Codex tool names to VIBES command types. */
const TOOL_COMMAND_TYPE_MAP: Record<string, VibesCommandType> = {
	shell: 'shell',
	container_shell: 'shell',
	write_file: 'file_write',
	apply_patch: 'file_write',
	create_file: 'file_write',
	read_file: 'file_read',
	list_directory: 'file_read',
	file_search: 'tool_use',
	grep_search: 'tool_use',
	codebase_search: 'tool_use',
};

/** Map Codex tool names to VIBES actions for file-modifying tools. */
const TOOL_ACTION_MAP: Record<string, VibesAction> = {
	write_file: 'modify',
	apply_patch: 'modify',
	create_file: 'create',
};

// ============================================================================
// Input Extraction Helpers
// ============================================================================

/**
 * Extract file path from a Codex tool's input object.
 * Codex tools use various field names for file paths.
 */
function extractFilePath(input: unknown): string | null {
	if (!input || typeof input !== 'object') {
		return null;
	}
	const obj = input as Record<string, unknown>;
	if (typeof obj.file_path === 'string') return obj.file_path;
	if (typeof obj.path === 'string') return obj.path;
	if (typeof obj.filename === 'string') return obj.filename;
	if (typeof obj.target_file === 'string') return obj.target_file;
	return null;
}

/**
 * Extract a command summary from shell tool input.
 */
function extractShellCommand(input: unknown): string | null {
	if (!input || typeof input !== 'object') {
		return null;
	}
	const obj = input as Record<string, unknown>;
	if (typeof obj.command === 'string') return obj.command;
	if (typeof obj.cmd === 'string') return obj.cmd;
	return null;
}

/**
 * Extract a truncated output summary (max 200 chars).
 */
function truncateSummary(text: string, maxLen = 200): string {
	if (text.length <= maxLen) return text;
	return text.slice(0, maxLen - 3) + '...';
}

// ============================================================================
// Codex Instrumenter
// ============================================================================

/**
 * Processes Codex agent events and generates VIBES annotations.
 *
 * Handles:
 * - Tool execution events (shell commands, file writes, reads, search tools)
 * - Thinking chunk events (reasoning text buffering for High assurance)
 * - Usage events (token counts and model info)
 * - Result events (final responses, flushes buffered reasoning)
 * - Prompt events (captures prompts at Medium+ assurance)
 */
export class CodexInstrumenter {
	private sessionManager: VibesSessionManager;
	private assuranceLevel: VibesAssuranceLevel;

	/** Buffered reasoning text per session, accumulated from thinking chunks. */
	private reasoningBuffers: Map<string, string> = new Map();

	/** Buffered reasoning token counts per session from usage events. */
	private reasoningTokenCounts: Map<string, number> = new Map();

	/** Cached model name from usage events per session. */
	private modelNames: Map<string, string> = new Map();

	constructor(params: {
		sessionManager: VibesSessionManager;
		assuranceLevel: VibesAssuranceLevel;
	}) {
		this.sessionManager = params.sessionManager;
		this.assuranceLevel = params.assuranceLevel;
	}

	/**
	 * Process a tool_use / tool-execution event from the StdoutHandler.
	 *
	 * The event shape matches what StdoutHandler emits:
	 *   { toolName: string; state: unknown; timestamp: number }
	 *
	 * For file write/patch tools: creates line annotations and command entries.
	 * For file read tools: creates command entries with type 'file_read'.
	 * For shell tools: creates command entries with type 'shell'.
	 * For search tools: creates command entries with type 'tool_use'.
	 */
	async handleToolExecution(
		sessionId: string,
		event: { toolName: string; state: unknown; timestamp: number },
	): Promise<void> {
		const session = this.sessionManager.getSession(sessionId);
		if (!session || !session.isActive) {
			return;
		}

		// Flush any buffered reasoning before recording a tool execution
		await this.flushReasoning(sessionId);

		const commandType = TOOL_COMMAND_TYPE_MAP[event.toolName] ?? 'other';
		const toolInput = this.extractToolInput(event.state);

		// Build command text from the tool execution
		const commandText = this.buildCommandText(event.toolName, toolInput);

		// Create and record command manifest entry
		const { entry: cmdEntry, hash: cmdHash } = createCommandEntry({
			commandText,
			commandType,
		});
		await this.sessionManager.recordManifestEntry(sessionId, cmdHash, cmdEntry);

		// For file-modifying tools, also create a line annotation
		const action = TOOL_ACTION_MAP[event.toolName];
		if (action) {
			const filePath = extractFilePath(toolInput);
			if (filePath && session.environmentHash) {
				const annotation = createLineAnnotation({
					filePath,
					lineStart: 1,
					lineEnd: 1,
					environmentHash: session.environmentHash,
					commandHash: cmdHash,
					action,
					sessionId: session.vibesSessionId,
					assuranceLevel: session.assuranceLevel,
				});
				await this.sessionManager.recordAnnotation(sessionId, annotation);
			}
		}
	}

	/**
	 * Buffer a thinking/reasoning chunk for later flushing.
	 * Only captures at High assurance level.
	 * Codex reasoning comes from 'reasoning' item.completed events,
	 * which are emitted as text events with isPartial: true.
	 */
	handleThinkingChunk(sessionId: string, text: string): void {
		if (this.assuranceLevel !== 'high') {
			return;
		}

		const session = this.sessionManager.getSession(sessionId);
		if (!session || !session.isActive) {
			return;
		}

		const existing = this.reasoningBuffers.get(sessionId) ?? '';
		this.reasoningBuffers.set(sessionId, existing + text);
	}

	/**
	 * Capture model info and token counts from a usage event.
	 * Codex usage events come from turn.completed messages and include
	 * reasoning_output_tokens tracked separately.
	 */
	handleUsage(sessionId: string, usage: ParsedEvent['usage']): void {
		if (!usage) {
			return;
		}

		const session = this.sessionManager.getSession(sessionId);
		if (!session || !session.isActive) {
			return;
		}

		if (usage.reasoningTokens !== undefined) {
			const existing = this.reasoningTokenCounts.get(sessionId) ?? 0;
			this.reasoningTokenCounts.set(sessionId, existing + usage.reasoningTokens);
		}
	}

	/**
	 * Process the final result from the agent.
	 * Codex results come from 'agent_message' item.completed events.
	 * Flushes any buffered reasoning data.
	 */
	async handleResult(sessionId: string, _text: string): Promise<void> {
		const session = this.sessionManager.getSession(sessionId);
		if (!session || !session.isActive) {
			return;
		}

		await this.flushReasoning(sessionId);
	}

	/**
	 * Capture a prompt sent to the agent.
	 * Only recorded at Medium+ assurance levels.
	 */
	async handlePrompt(
		sessionId: string,
		promptText: string,
		contextFiles?: string[],
	): Promise<void> {
		if (this.assuranceLevel === 'low') {
			return;
		}

		const session = this.sessionManager.getSession(sessionId);
		if (!session || !session.isActive) {
			return;
		}

		const { entry, hash } = createPromptEntry({
			promptText,
			promptType: 'user_instruction',
			contextFiles,
		});
		await this.sessionManager.recordManifestEntry(sessionId, hash, entry);
	}

	/**
	 * Flush all buffered data for a session.
	 * Called when a session ends or when explicitly requested.
	 */
	async flush(sessionId: string): Promise<void> {
		await this.flushReasoning(sessionId);
		this.cleanupSession(sessionId);
	}

	// ========================================================================
	// Private Helpers
	// ========================================================================

	/**
	 * Flush buffered reasoning text to a reasoning manifest entry.
	 * Only operates at High assurance level.
	 */
	private async flushReasoning(sessionId: string): Promise<void> {
		if (this.assuranceLevel !== 'high') {
			return;
		}

		const text = this.reasoningBuffers.get(sessionId);
		if (!text) {
			return;
		}

		const session = this.sessionManager.getSession(sessionId);
		if (!session || !session.isActive) {
			return;
		}

		const tokenCount = this.reasoningTokenCounts.get(sessionId);
		const model = this.modelNames.get(sessionId);

		const { entry, hash } = createReasoningEntry({
			reasoningText: text,
			tokenCount,
			model,
		});
		await this.sessionManager.recordManifestEntry(sessionId, hash, entry);

		// Clear the buffer after flushing
		this.reasoningBuffers.delete(sessionId);
		this.reasoningTokenCounts.delete(sessionId);
	}

	/**
	 * Extract the tool input from the state object emitted by StdoutHandler.
	 * For tool_call events the state is `{ status: 'running', input: { ...args } }`.
	 * For tool_result events the state is `{ status: 'completed', output: '...' }`.
	 */
	private extractToolInput(state: unknown): unknown {
		if (!state || typeof state !== 'object') {
			return state;
		}
		const obj = state as Record<string, unknown>;
		if (obj.input !== undefined) {
			return obj.input;
		}
		return state;
	}

	/**
	 * Build a human-readable command text from tool name and input.
	 */
	private buildCommandText(toolName: string, input: unknown): string {
		const filePath = extractFilePath(input);
		const shellCmd = extractShellCommand(input);

		if (shellCmd) {
			return truncateSummary(shellCmd);
		}
		if (filePath) {
			return `${toolName}: ${filePath}`;
		}
		return toolName;
	}

	/**
	 * Clean up all internal state for a session.
	 */
	private cleanupSession(sessionId: string): void {
		this.reasoningBuffers.delete(sessionId);
		this.reasoningTokenCounts.delete(sessionId);
		this.modelNames.delete(sessionId);
	}
}

/**
 * conversationManager.ts
 *
 * Manages the back-and-forth conversation flow between the wizard and the
 * AI agent during project discovery. Handles message sending, response parsing,
 * and conversation state management.
 */

import type { ToolType, LogEntry } from '../../../types';
import type { WizardMessage } from '../WizardContext';
import {
  generateSystemPrompt,
  parseStructuredOutput,
  formatUserMessage,
  isReadyToProceed,
  type StructuredAgentResponse,
  type ParsedResponse,
  type ExistingDocument,
  READY_CONFIDENCE_THRESHOLD,
} from './wizardPrompts';

/**
 * Configuration for starting a conversation
 */
export interface ConversationConfig {
  /** The agent type to use for the conversation */
  agentType: ToolType;
  /** The working directory for the agent */
  directoryPath: string;
  /** Project name (used in system prompt) */
  projectName: string;
  /** Existing Auto Run documents (when continuing from previous session) */
  existingDocs?: ExistingDocument[];
}

/**
 * Result of sending a message
 */
export interface SendMessageResult {
  /** Whether the message was sent and response received successfully */
  success: boolean;
  /** The parsed agent response */
  response?: ParsedResponse;
  /** Error message if unsuccessful */
  error?: string;
  /** The raw output data (for debugging) */
  rawOutput?: string;
}

/**
 * Callback type for receiving agent output chunks
 */
export type OutputChunkCallback = (chunk: string) => void;

/**
 * Callback type for conversation state changes
 */
export interface ConversationCallbacks {
  /** Called when a message is being sent */
  onSending?: () => void;
  /** Called when agent starts responding */
  onReceiving?: () => void;
  /** Called with partial output chunks (for streaming display) */
  onChunk?: OutputChunkCallback;
  /** Called when response is complete */
  onComplete?: (result: SendMessageResult) => void;
  /** Called when an error occurs */
  onError?: (error: string) => void;
}

/**
 * State of an active conversation session
 */
interface ConversationSession {
  /** Unique session ID for this wizard conversation */
  sessionId: string;
  /** The agent type */
  agentType: ToolType;
  /** Working directory */
  directoryPath: string;
  /** Project name */
  projectName: string;
  /** Whether the agent process is active */
  isActive: boolean;
  /** System prompt used for this session */
  systemPrompt: string;
  /** Accumulated output buffer for parsing */
  outputBuffer: string;
  /** Resolve function for pending message */
  pendingResolve?: (result: SendMessageResult) => void;
  /** Callbacks for the conversation */
  callbacks?: ConversationCallbacks;
  /** Cleanup function for data listener */
  dataListenerCleanup?: () => void;
  /** Cleanup function for exit listener */
  exitListenerCleanup?: () => void;
  /** Timeout ID for response timeout (for cleanup) */
  responseTimeoutId?: NodeJS.Timeout;
}

/**
 * Generate a unique session ID for wizard conversations
 */
function generateWizardSessionId(): string {
  return `wizard-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * ConversationManager class
 *
 * Manages a single conversation session between the wizard and an AI agent.
 * Handles:
 * - Spawning the agent process with the wizard system prompt
 * - Sending user messages with structured output reminders
 * - Parsing and validating agent responses
 * - Tracking conversation state and history
 */
class ConversationManager {
  /** Current active session (only one wizard conversation at a time) */
  private session: ConversationSession | null = null;

  /**
   * Start a new conversation session
   *
   * @param config Configuration for the conversation
   * @returns Session ID for the conversation
   */
  async startConversation(config: ConversationConfig): Promise<string> {
    // End any existing session first
    if (this.session) {
      await this.endConversation();
    }

    const sessionId = generateWizardSessionId();
    const systemPrompt = generateSystemPrompt({
      agentName: config.projectName,
      agentPath: config.directoryPath,
      existingDocs: config.existingDocs,
    });

    this.session = {
      sessionId,
      agentType: config.agentType,
      directoryPath: config.directoryPath,
      projectName: config.projectName,
      isActive: true,
      systemPrompt,
      outputBuffer: '',
    };

    return sessionId;
  }

  /**
   * Send a message to the agent and wait for a response
   *
   * This method:
   * 1. Spawns a new agent process with the full conversation context
   * 2. Waits for the agent to complete its response
   * 3. Parses the structured output
   * 4. Returns the result
   *
   * @param userMessage The user's message to send
   * @param conversationHistory Previous messages in the conversation
   * @param callbacks Optional callbacks for progress updates
   * @returns SendMessageResult with the parsed response
   */
  async sendMessage(
    userMessage: string,
    conversationHistory: WizardMessage[],
    callbacks?: ConversationCallbacks
  ): Promise<SendMessageResult> {
    if (!this.session) {
      return {
        success: false,
        error: 'No active conversation session. Call startConversation first.',
      };
    }

    // Update callbacks
    this.session.callbacks = callbacks;
    this.session.outputBuffer = '';

    // Notify sending
    callbacks?.onSending?.();

    try {
      // Get the agent configuration
      const agent = await window.maestro.agents.get(this.session.agentType);
      if (!agent || !agent.available) {
        return {
          success: false,
          error: `Agent ${this.session.agentType} is not available`,
        };
      }

      // Build the full prompt with conversation context
      const fullPrompt = this.buildPromptWithContext(
        userMessage,
        conversationHistory
      );

      // Spawn the agent process and wait for completion
      // spawnAgentForMessage returns when the agent exits with parsed response
      const result = await this.spawnAgentForMessage(agent, fullPrompt);

      if (!result.success) {
        callbacks?.onError?.(result.error || 'Failed to get response from agent');
        return result;
      }

      // Notify complete with the result
      callbacks?.onComplete?.(result);

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      callbacks?.onError?.(errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Build the full prompt including conversation context
   */
  private buildPromptWithContext(
    userMessage: string,
    conversationHistory: WizardMessage[]
  ): string {
    if (!this.session) {
      return formatUserMessage(userMessage);
    }

    // Start with the system prompt
    let prompt = this.session.systemPrompt + '\n\n';

    // Add conversation history
    if (conversationHistory.length > 0) {
      prompt += '## Previous Conversation\n\n';
      for (const msg of conversationHistory) {
        if (msg.role === 'user') {
          prompt += `User: ${msg.content}\n\n`;
        } else if (msg.role === 'assistant') {
          prompt += `Assistant: ${msg.content}\n\n`;
        }
      }
    }

    // Add the current user message with the structured output suffix
    prompt += '## Current Message\n\n';
    prompt += formatUserMessage(userMessage);

    return prompt;
  }

  /**
   * Spawn the agent process for a single message exchange
   */
  private async spawnAgentForMessage(
    agent: any,
    prompt: string
  ): Promise<SendMessageResult> {
    if (!this.session) {
      return { success: false, error: 'No active session' };
    }

    return new Promise<SendMessageResult>((resolve) => {
      console.log('[Wizard] Setting up listeners for session:', this.session!.sessionId);

      // Set up timeout (5 minutes for wizard's complex prompts)
      const timeoutId = setTimeout(() => {
        console.log('[Wizard] TIMEOUT fired! Session:', this.session?.sessionId, 'Buffer length:', this.session?.outputBuffer?.length);
        this.cleanupListeners();
        resolve({
          success: false,
          error: 'Response timeout - agent did not complete in time',
          rawOutput: this.session?.outputBuffer,
        });
      }, 300000);

      if (this.session) {
        this.session.responseTimeoutId = timeoutId;
      }

      // Set up data listener
      this.session!.dataListenerCleanup = window.maestro.process.onData(
        (sessionId: string, data: string) => {
          if (sessionId === this.session?.sessionId) {
            this.session.outputBuffer += data;
            this.session.callbacks?.onChunk?.(data);
          }
        }
      );

      // Set up exit listener
      this.session!.exitListenerCleanup = window.maestro.process.onExit(
        (sessionId: string, code: number) => {
          console.log('[Wizard] Exit event received:', { receivedId: sessionId, expectedId: this.session?.sessionId, code });
          if (sessionId === this.session?.sessionId) {
            console.log('[Wizard] Session ID matched! Processing exit...');
            // Clear timeout since we got a response
            clearTimeout(timeoutId);
            if (this.session) {
              this.session.responseTimeoutId = undefined;
            }

            // Agent finished - resolve with parsed output
            this.cleanupListeners();

            if (code === 0) {
              const parsedResponse = this.parseAgentOutput();
              console.log('[Wizard] Parsed response:', parsedResponse);
              resolve({
                success: true,
                response: parsedResponse,
                rawOutput: this.session?.outputBuffer,
              });
            } else {
              resolve({
                success: false,
                error: `Agent exited with code ${code}`,
                rawOutput: this.session?.outputBuffer,
              });
            }
          } else {
            console.log('[Wizard] Session ID mismatch, ignoring exit event');
          }
        }
      );

      // Store resolve for potential early termination
      this.session!.pendingResolve = resolve;

      // Build args based on agent type
      // Each agent has different CLI structure for batch mode
      const argsForSpawn = this.buildArgsForAgent(agent);

      window.maestro.process
        .spawn({
          sessionId: this.session!.sessionId,
          toolType: this.session!.agentType,
          cwd: this.session!.directoryPath,
          command: agent.command,
          args: argsForSpawn,
          prompt: prompt,
        })
        .then(() => {
          // Notify that we're receiving
          this.session?.callbacks?.onReceiving?.();
        })
        .catch((error: Error) => {
          this.cleanupListeners();
          resolve({
            success: false,
            error: `Failed to spawn agent: ${error.message}`,
          });
        });
    });
  }


  /**
   * Build CLI args for the agent based on its type and capabilities.
   *
   * Note: The main process IPC handler (process.ts) automatically adds:
   * - batchModePrefix (e.g., 'exec' for Codex, 'run' for OpenCode)
   * - batchModeArgs (e.g., YOLO mode flags)
   * - jsonOutputArgs (e.g., --json, --format json)
   * - workingDirArgs (e.g., -C dir for Codex)
   *
   * So we only need to add agent-specific flags that aren't covered by
   * the standard argument builders.
   */
  private buildArgsForAgent(agent: any): string[] {
    const agentId = agent.id || this.session?.agentType;

    switch (agentId) {
      case 'claude-code': {
        // Claude Code: start with base args, add --include-partial-messages for streaming
        const args = [...(agent.args || [])];
        if (!args.includes('--include-partial-messages')) {
          args.push('--include-partial-messages');
        }
        return args;
      }

      case 'codex':
      case 'opencode': {
        // For Codex and OpenCode, use base args only
        // The IPC handler will add batchModePrefix, jsonOutputArgs, batchModeArgs, workingDirArgs
        return [...(agent.args || [])];
      }

      default: {
        // For unknown agents, use base args
        return [...(agent.args || [])];
      }
    }
  }

  /**
   * Parse the accumulated agent output to extract the structured response
   */
  private parseAgentOutput(): ParsedResponse {
    if (!this.session) {
      return {
        structured: null,
        rawText: '',
        parseSuccess: false,
        parseError: 'No active session',
      };
    }

    const output = this.session.outputBuffer;
    console.log('[Wizard] Raw output buffer length:', output.length);
    console.log('[Wizard] Raw output preview (last 500):', output.slice(-500));

    // Try to extract the result from stream-json format
    const extractedResult = this.extractResultFromStreamJson(output);
    const textToParse = extractedResult || output;

    console.log('[Wizard] Extracted result:', extractedResult ? 'YES' : 'NO (using raw)');
    console.log('[Wizard] Text to parse:', textToParse.slice(0, 300));

    const parsed = parseStructuredOutput(textToParse);
    console.log('[Wizard] Parse result:', {
      parseSuccess: parsed.parseSuccess,
      hasStructured: !!parsed.structured,
      confidence: parsed.structured?.confidence,
      ready: parsed.structured?.ready,
      parseError: parsed.parseError,
    });

    return parsed;
  }

  /**
   * Extract the result text from agent JSON output.
   * Handles different agent output formats:
   * - Claude Code: stream-json with { type: 'result', result: '...' }
   * - OpenCode: JSONL with { type: 'text', part: { text: '...' } }
   * - Codex: JSONL with { type: 'message', content: '...' } or similar
   */
  private extractResultFromStreamJson(output: string): string | null {
    const agentType = this.session?.agentType;

    try {
      const lines = output.split('\n');

      // For OpenCode: concatenate all text parts
      if (agentType === 'opencode') {
        const textParts: string[] = [];
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            // OpenCode text messages have type: 'text' and part.text
            if (msg.type === 'text' && msg.part?.text) {
              textParts.push(msg.part.text);
            }
          } catch {
            // Ignore non-JSON lines
          }
        }
        if (textParts.length > 0) {
          return textParts.join('');
        }
      }

      // For Codex: look for message content
      if (agentType === 'codex') {
        const textParts: string[] = [];
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            // Codex uses agent_message type with content array
            if (msg.type === 'agent_message' && msg.content) {
              for (const block of msg.content) {
                if (block.type === 'text' && block.text) {
                  textParts.push(block.text);
                }
              }
            }
            // Also check for message type with text field (older format)
            if (msg.type === 'message' && msg.text) {
              textParts.push(msg.text);
            }
          } catch {
            // Ignore non-JSON lines
          }
        }
        if (textParts.length > 0) {
          return textParts.join('');
        }
      }

      // For Claude Code: look for result message
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'result' && msg.result) {
            return msg.result;
          }
        } catch {
          // Ignore non-JSON lines
        }
      }
    } catch {
      // Fallback to raw output
    }
    return null;
  }

  /**
   * Clean up event listeners and any pending timeouts
   */
  private cleanupListeners(): void {
    if (this.session?.dataListenerCleanup) {
      this.session.dataListenerCleanup();
      this.session.dataListenerCleanup = undefined;
    }
    if (this.session?.exitListenerCleanup) {
      this.session.exitListenerCleanup();
      this.session.exitListenerCleanup = undefined;
    }
    if (this.session?.responseTimeoutId) {
      clearTimeout(this.session.responseTimeoutId);
      this.session.responseTimeoutId = undefined;
    }
  }

  /**
   * End the current conversation session
   */
  async endConversation(): Promise<void> {
    if (!this.session) return;

    this.cleanupListeners();

    // Kill any running process
    try {
      await window.maestro.process.kill(this.session.sessionId);
    } catch {
      // Process may already be dead
    }

    this.session = null;
  }

  /**
   * Check if there's an active conversation
   */
  isConversationActive(): boolean {
    return this.session !== null && this.session.isActive;
  }

  /**
   * Get the current session ID (if any)
   */
  getSessionId(): string | null {
    return this.session?.sessionId || null;
  }

  /**
   * Get the ready confidence threshold
   */
  getReadyThreshold(): number {
    return READY_CONFIDENCE_THRESHOLD;
  }

  /**
   * Check if a response indicates ready to proceed
   */
  checkIsReady(response: StructuredAgentResponse): boolean {
    return isReadyToProceed(response);
  }
}

// Export singleton instance
export const conversationManager = new ConversationManager();

/**
 * Helper function to create a user message for the conversation history
 */
export function createUserMessage(content: string): Omit<WizardMessage, 'id' | 'timestamp'> {
  return {
    role: 'user',
    content,
  };
}

/**
 * Helper function to create an assistant message for the conversation history
 */
export function createAssistantMessage(
  response: ParsedResponse
): Omit<WizardMessage, 'id' | 'timestamp'> {
  const structured = response.structured;
  return {
    role: 'assistant',
    content: structured?.message || response.rawText,
    confidence: structured?.confidence,
    ready: structured?.ready,
  };
}

/**
 * Helper function to determine if conversation should auto-proceed
 */
export function shouldAutoProceed(response: ParsedResponse): boolean {
  return (
    response.parseSuccess &&
    response.structured !== null &&
    isReadyToProceed(response.structured)
  );
}

/**
 * Generate a unique log entry ID
 */
function generateLogEntryId(): string {
  return `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Convert wizard conversation history to session log entries.
 *
 * This function is used when the wizard completes to populate the
 * "Project Discovery" tab's conversation history with the wizard's
 * project discovery conversation.
 *
 * @param messages The wizard's conversation history (WizardMessage[])
 * @returns LogEntry[] suitable for populating an AITab's logs
 */
export function convertWizardMessagesToLogEntries(messages: WizardMessage[]): LogEntry[] {
  return messages.map((msg) => {
    const logEntry: LogEntry = {
      id: generateLogEntryId(),
      timestamp: msg.timestamp,
      source: msg.role === 'user' ? 'user' : msg.role === 'assistant' ? 'ai' : 'system',
      text: msg.content,
    };

    // Mark user messages as delivered (they were successfully sent during wizard)
    if (msg.role === 'user') {
      logEntry.delivered = true;
    }

    return logEntry;
  });
}

/**
 * Create initial log entries for a Project Discovery tab.
 *
 * This prepends a system message indicating the conversation was from the
 * wizard setup, then includes the full conversation history.
 *
 * @param messages The wizard's conversation history
 * @param projectName The project name for the header message
 * @returns LogEntry[] with header and conversation
 */
export function createProjectDiscoveryLogs(
  messages: WizardMessage[],
  projectName: string
): LogEntry[] {
  const logs: LogEntry[] = [];

  // Add a system message to indicate this is from the wizard
  logs.push({
    id: generateLogEntryId(),
    timestamp: Date.now(),
    source: 'system',
    text: `📋 Project Discovery conversation from setup wizard for "${projectName || 'your project'}"`,
  });

  // Add the converted conversation history
  logs.push(...convertWizardMessagesToLogEntries(messages));

  return logs;
}

/**
 * Default name for the Project Discovery tab
 */
export const PROJECT_DISCOVERY_TAB_NAME = 'Project Discovery';

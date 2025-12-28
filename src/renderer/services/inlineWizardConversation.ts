/**
 * inlineWizardConversation.ts
 *
 * Service for managing AI conversations during inline wizard mode.
 * This service handles starting conversations with appropriate system prompts,
 * sending messages to the AI agent, and parsing structured responses.
 *
 * Unlike the onboarding wizard's conversationManager which uses a class singleton,
 * this service exports stateless functions that work with the useInlineWizard hook's state.
 */

import type { ToolType } from '../types';
import type { InlineWizardMessage } from '../hooks/useInlineWizard';
import type { ExistingDocument as BaseExistingDocument } from '../utils/existingDocsDetector';
import {
  wizardInlineIteratePrompt,
  wizardInlineNewPrompt,
} from '../../prompts';

/**
 * Extended ExistingDocument interface that includes loaded content.
 * The base ExistingDocument from existingDocsDetector only has metadata;
 * this interface adds the content field needed for the iterate mode prompt.
 */
export interface ExistingDocumentWithContent extends BaseExistingDocument {
  /** Document content (must be loaded before passing to conversation) */
  content: string;
}

/**
 * Existing document type that can be either loaded (with content) or unloaded.
 * For iterate mode, documents should be loaded before passing to the service.
 */
export type ExistingDocument = BaseExistingDocument | ExistingDocumentWithContent;

/**
 * Type guard to check if a document has content loaded.
 */
function hasContent(doc: ExistingDocument): doc is ExistingDocumentWithContent {
  return 'content' in doc && typeof doc.content === 'string';
}
import {
  substituteTemplateVariables,
  type TemplateContext,
} from '../utils/templateVariables';

/**
 * Structured response format expected from the agent.
 * Same format as the onboarding wizard for consistency.
 */
export interface WizardResponse {
  /** Confidence level (0-100) indicating how well the agent understands the work */
  confidence: number;
  /** Whether the agent feels ready to proceed with document generation */
  ready: boolean;
  /** The agent's message to display to the user */
  message: string;
}

/**
 * Result of sending a message to the wizard conversation.
 */
export interface InlineWizardSendResult {
  /** Whether the operation was successful */
  success: boolean;
  /** The parsed response (if successful) */
  response?: WizardResponse;
  /** Error message (if unsuccessful) */
  error?: string;
  /** Raw output from the agent (for debugging) */
  rawOutput?: string;
}

/**
 * Configuration for starting an inline wizard conversation.
 */
export interface InlineWizardConversationConfig {
  /** Wizard mode ('new' or 'iterate') */
  mode: 'new' | 'iterate';
  /** The AI agent type to use */
  agentType: ToolType;
  /** Working directory path */
  directoryPath: string;
  /** Project name (derived from session or directory) */
  projectName: string;
  /** Goal for iterate mode (what the user wants to add/change) */
  goal?: string;
  /** Existing Auto Run documents (for iterate mode context) */
  existingDocs?: ExistingDocument[];
  /** Auto Run folder path */
  autoRunFolderPath?: string;
}

/**
 * Session state for tracking the inline wizard conversation.
 */
export interface InlineWizardConversationSession {
  /** Unique session ID for this wizard conversation */
  sessionId: string;
  /** The agent type */
  agentType: ToolType;
  /** Working directory */
  directoryPath: string;
  /** Project name */
  projectName: string;
  /** The generated system prompt */
  systemPrompt: string;
  /** Whether the session is active */
  isActive: boolean;
}

/**
 * Callback type for receiving output chunks during streaming.
 */
export type OnChunkCallback = (chunk: string) => void;

/**
 * Callbacks for conversation progress.
 */
export interface ConversationCallbacks {
  /** Called when message is being sent */
  onSending?: () => void;
  /** Called when agent starts responding */
  onReceiving?: () => void;
  /** Called with partial output chunks */
  onChunk?: OnChunkCallback;
  /** Called when response is complete */
  onComplete?: (result: InlineWizardSendResult) => void;
  /** Called when an error occurs */
  onError?: (error: string) => void;
}

/**
 * Confidence threshold for the agent to be considered "ready".
 * Matches the onboarding wizard's threshold for consistency.
 */
export const READY_CONFIDENCE_THRESHOLD = 80;

/**
 * Suffix appended to each user message to remind the agent about JSON format.
 */
const STRUCTURED_OUTPUT_SUFFIX = `

IMPORTANT: Remember to respond ONLY with valid JSON in this exact format:
{"confidence": <0-100>, "ready": <true/false>, "message": "<your response>"}`;

/**
 * Generate a unique session ID for wizard conversations.
 */
function generateWizardSessionId(): string {
  return `inline-wizard-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate the appropriate system prompt based on wizard mode.
 *
 * @param config Configuration including mode, project info, and existing docs
 * @returns The complete system prompt for the agent
 */
export function generateInlineWizardPrompt(config: InlineWizardConversationConfig): string {
  const { mode, projectName, directoryPath, goal, existingDocs, autoRunFolderPath } = config;

  // Select the base prompt based on mode
  let basePrompt: string;
  if (mode === 'iterate') {
    basePrompt = wizardInlineIteratePrompt;
  } else {
    // 'new' mode uses the new plan prompt
    basePrompt = wizardInlineNewPrompt;
  }

  // Handle wizard-specific variables that have different semantics from the central template system
  let prompt = basePrompt
    .replace(/\{\{PROJECT_NAME\}\}/gi, projectName || 'this project')
    .replace(/\{\{READY_CONFIDENCE_THRESHOLD\}\}/gi, String(READY_CONFIDENCE_THRESHOLD));

  // For iterate mode, add existing docs and goal
  if (mode === 'iterate') {
    // Format existing documents - only include content if loaded
    let docsContent = 'No existing documents found.';
    if (existingDocs && existingDocs.length > 0) {
      const formattedDocs = existingDocs.map(doc => {
        if (hasContent(doc)) {
          return `### ${doc.filename}\n\n${doc.content}`;
        } else {
          // Document exists but content not loaded - show just the filename
          return `### ${doc.filename}\n\n(Content not loaded)`;
        }
      });
      docsContent = formattedDocs.join('\n\n---\n\n');
    }

    prompt = prompt
      .replace(/\{\{EXISTING_DOCS\}\}/gi, docsContent)
      .replace(/\{\{ITERATE_GOAL\}\}/gi, goal || 'Not specified');
  }

  // Build template context for remaining variables
  const templateContext: TemplateContext = {
    session: {
      id: 'inline-wizard',
      name: projectName,
      toolType: config.agentType,
      cwd: directoryPath,
      fullPath: directoryPath,
      autoRunFolderPath: autoRunFolderPath,
    },
    autoRunFolder: autoRunFolderPath,
  };

  // Substitute any remaining template variables
  prompt = substituteTemplateVariables(prompt, templateContext);

  return prompt;
}

/**
 * Start an inline wizard conversation session.
 *
 * This creates a session configuration that can be used for subsequent
 * message exchanges. Unlike the onboarding wizard, this doesn't spawn
 * a persistent process - each message is a separate agent invocation.
 *
 * @param config Configuration for the conversation
 * @returns Session information for the conversation
 */
export function startInlineWizardConversation(
  config: InlineWizardConversationConfig
): InlineWizardConversationSession {
  const sessionId = generateWizardSessionId();
  const systemPrompt = generateInlineWizardPrompt(config);

  return {
    sessionId,
    agentType: config.agentType,
    directoryPath: config.directoryPath,
    projectName: config.projectName,
    systemPrompt,
    isActive: true,
  };
}

/**
 * Build the full prompt including conversation context.
 *
 * @param session The conversation session
 * @param userMessage The current user message
 * @param conversationHistory Previous messages in the conversation
 * @returns The complete prompt to send to the agent
 */
function buildPromptWithContext(
  session: InlineWizardConversationSession,
  userMessage: string,
  conversationHistory: InlineWizardMessage[]
): string {
  // Start with the system prompt
  let prompt = session.systemPrompt + '\n\n';

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

  // Add the current user message with structured output suffix
  prompt += '## Current Message\n\n';
  prompt += userMessage + STRUCTURED_OUTPUT_SUFFIX;

  return prompt;
}

/**
 * Parse a structured response from the agent.
 *
 * Attempts to extract JSON from the response with multiple fallback strategies.
 *
 * @param response The raw response string from the agent
 * @returns Parsed WizardResponse or null if parsing failed
 */
export function parseWizardResponse(response: string): WizardResponse | null {
  const rawText = response.trim();

  // Strategy 1: Direct JSON parse
  try {
    const parsed = JSON.parse(rawText);
    if (isValidWizardResponse(parsed)) {
      return normalizeResponse(parsed);
    }
  } catch {
    // Continue to next strategy
  }

  // Strategy 2: Extract JSON from markdown code blocks
  const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      if (isValidWizardResponse(parsed)) {
        return normalizeResponse(parsed);
      }
    } catch {
      // Continue to next strategy
    }
  }

  // Strategy 3: Find JSON object pattern with required fields
  const jsonMatch = rawText.match(/\{[\s\S]*"confidence"[\s\S]*"ready"[\s\S]*"message"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (isValidWizardResponse(parsed)) {
        return normalizeResponse(parsed);
      }
    } catch {
      // Continue to next strategy
    }
  }

  // Strategy 4: Find any JSON object pattern
  const anyJsonMatch = rawText.match(/\{[^{}]*\}/);
  if (anyJsonMatch) {
    try {
      const parsed = JSON.parse(anyJsonMatch[0]);
      if (isValidWizardResponse(parsed)) {
        return normalizeResponse(parsed);
      }
    } catch {
      // Continue to fallback
    }
  }

  // Fallback: Create a response from raw text with heuristics
  return createFallbackResponse(rawText);
}

/**
 * Check if an object matches the expected wizard response format.
 */
function isValidWizardResponse(obj: unknown): obj is WizardResponse {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const response = obj as Record<string, unknown>;

  return (
    typeof response.confidence === 'number' &&
    typeof response.ready === 'boolean' &&
    typeof response.message === 'string'
  );
}

/**
 * Normalize a response to ensure valid ranges and types.
 */
function normalizeResponse(response: WizardResponse): WizardResponse {
  return {
    confidence: Math.max(0, Math.min(100, Math.round(response.confidence))),
    ready: response.ready && response.confidence >= READY_CONFIDENCE_THRESHOLD,
    message: response.message.trim(),
  };
}

/**
 * Create a fallback response when parsing fails.
 * Uses heuristics to extract useful information from raw text.
 */
function createFallbackResponse(rawText: string): WizardResponse {
  const DEFAULT_CONFIDENCE = 20;

  // Try to extract confidence from text patterns
  let confidence = DEFAULT_CONFIDENCE;
  const confidenceMatch = rawText.match(/confidence[:\s]*(\d+)/i) ||
    rawText.match(/(\d+)\s*%?\s*confiden/i);
  if (confidenceMatch) {
    const extractedConfidence = parseInt(confidenceMatch[1], 10);
    if (extractedConfidence >= 0 && extractedConfidence <= 100) {
      confidence = extractedConfidence;
    }
  }

  // Try to detect ready status from text
  const readyPatterns = /\b(ready to proceed|ready to create|let's proceed|shall we proceed|i'm ready)\b/i;
  const notReadyPatterns = /\b(need more|clarif|question|tell me more|could you explain)\b/i;

  let ready = false;
  if (confidence >= READY_CONFIDENCE_THRESHOLD && readyPatterns.test(rawText)) {
    ready = true;
  }
  if (notReadyPatterns.test(rawText)) {
    ready = false;
  }

  // Clean up the message
  let message = rawText
    .replace(/```(?:json)?/g, '')
    .replace(/```/g, '')
    .replace(/^\s*\{[\s\S]*?\}\s*$/g, '')
    .trim();

  if (!message) {
    message = rawText;
  }

  return {
    confidence,
    ready,
    message,
  };
}

/**
 * Extract the result text from agent JSON output.
 * Handles different agent output formats (Claude Code stream-json, etc.)
 */
function extractResultFromStreamJson(output: string, agentType: ToolType): string | null {
  try {
    const lines = output.split('\n');

    // For OpenCode: concatenate all text parts
    if (agentType === 'opencode') {
      const textParts: string[] = [];
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
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
          if (msg.type === 'agent_message' && msg.content) {
            for (const block of msg.content) {
              if (block.type === 'text' && block.text) {
                textParts.push(block.text);
              }
            }
          }
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
 * Build CLI args for the agent based on its type and capabilities.
 */
function buildArgsForAgent(agent: any): string[] {
  const agentId = agent.id;

  switch (agentId) {
    case 'claude-code': {
      const args = [...(agent.args || [])];
      if (!args.includes('--include-partial-messages')) {
        args.push('--include-partial-messages');
      }
      return args;
    }

    case 'codex':
    case 'opencode': {
      return [...(agent.args || [])];
    }

    default: {
      return [...(agent.args || [])];
    }
  }
}

/**
 * Send a message to the inline wizard conversation and wait for a response.
 *
 * This spawns a new agent process for each message (batch mode), waits for
 * completion, and parses the structured response.
 *
 * @param session The conversation session
 * @param userMessage The user's message to send
 * @param conversationHistory Previous messages in the conversation
 * @param callbacks Optional callbacks for progress updates
 * @returns The result of sending the message
 */
export async function sendWizardMessage(
  session: InlineWizardConversationSession,
  userMessage: string,
  conversationHistory: InlineWizardMessage[],
  callbacks?: ConversationCallbacks
): Promise<InlineWizardSendResult> {
  if (!session.isActive) {
    return {
      success: false,
      error: 'Session is not active',
    };
  }

  callbacks?.onSending?.();

  try {
    // Get the agent configuration
    const agent = await window.maestro.agents.get(session.agentType);
    if (!agent || !agent.available) {
      return {
        success: false,
        error: `Agent ${session.agentType} is not available`,
      };
    }

    // Build the full prompt with conversation context
    const fullPrompt = buildPromptWithContext(session, userMessage, conversationHistory);

    // Build args for the agent
    const argsForSpawn = buildArgsForAgent(agent);

    // Spawn agent and collect output
    const result = await new Promise<InlineWizardSendResult>((resolve) => {
      let outputBuffer = '';
      let dataListenerCleanup: (() => void) | undefined;
      let exitListenerCleanup: (() => void) | undefined;

      // Set up timeout (5 minutes for complex prompts)
      const timeoutId = setTimeout(() => {
        console.log('[InlineWizard] TIMEOUT fired! Session:', session.sessionId);
        cleanupListeners();
        resolve({
          success: false,
          error: 'Response timeout - agent did not complete in time',
          rawOutput: outputBuffer,
        });
      }, 300000);

      function cleanupListeners() {
        if (dataListenerCleanup) {
          dataListenerCleanup();
          dataListenerCleanup = undefined;
        }
        if (exitListenerCleanup) {
          exitListenerCleanup();
          exitListenerCleanup = undefined;
        }
      }

      // Set up data listener
      dataListenerCleanup = window.maestro.process.onData(
        (receivedSessionId: string, data: string) => {
          if (receivedSessionId === session.sessionId) {
            outputBuffer += data;
            callbacks?.onChunk?.(data);
          }
        }
      );

      // Set up exit listener
      exitListenerCleanup = window.maestro.process.onExit(
        (receivedSessionId: string, code: number) => {
          if (receivedSessionId === session.sessionId) {
            clearTimeout(timeoutId);
            cleanupListeners();

            if (code === 0) {
              // Extract result from stream-json format
              const extractedResult = extractResultFromStreamJson(outputBuffer, session.agentType);
              const textToParse = extractedResult || outputBuffer;

              // Parse the wizard response
              const parsedResponse = parseWizardResponse(textToParse);

              if (parsedResponse) {
                resolve({
                  success: true,
                  response: parsedResponse,
                  rawOutput: outputBuffer,
                });
              } else {
                resolve({
                  success: false,
                  error: 'Failed to parse agent response',
                  rawOutput: outputBuffer,
                });
              }
            } else {
              resolve({
                success: false,
                error: `Agent exited with code ${code}`,
                rawOutput: outputBuffer,
              });
            }
          }
        }
      );

      // Spawn the agent process
      window.maestro.process
        .spawn({
          sessionId: session.sessionId,
          toolType: session.agentType,
          cwd: session.directoryPath,
          command: agent.command,
          args: argsForSpawn,
          prompt: fullPrompt,
        })
        .then(() => {
          callbacks?.onReceiving?.();
        })
        .catch((error: Error) => {
          cleanupListeners();
          clearTimeout(timeoutId);
          resolve({
            success: false,
            error: `Failed to spawn agent: ${error.message}`,
          });
        });
    });

    if (result.success) {
      callbacks?.onComplete?.(result);
    } else {
      callbacks?.onError?.(result.error || 'Unknown error');
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    callbacks?.onError?.(errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Check if a response indicates the agent is ready to proceed.
 *
 * @param response The wizard response to check
 * @returns Whether the agent is ready (confidence >= threshold and ready=true)
 */
export function isReadyToProceed(response: WizardResponse): boolean {
  return response.ready && response.confidence >= READY_CONFIDENCE_THRESHOLD;
}

/**
 * End an inline wizard conversation session.
 *
 * @param session The session to end
 */
export async function endInlineWizardConversation(
  session: InlineWizardConversationSession
): Promise<void> {
  if (!session.isActive) return;

  // Mark session as inactive
  session.isActive = false;

  // Try to kill any running process
  try {
    await window.maestro.process.kill(session.sessionId);
  } catch {
    // Process may already be dead
  }
}

/**
 * Get the color for the confidence meter based on the level.
 *
 * @param confidence The confidence level (0-100)
 * @returns HSL color string transitioning from red to yellow to green
 */
export function getConfidenceColor(confidence: number): string {
  const clampedConfidence = Math.max(0, Math.min(100, confidence));

  let hue: number;
  if (clampedConfidence <= 50) {
    hue = (clampedConfidence / 50) * 60; // 0 to 60 (red to yellow)
  } else {
    hue = 60 + ((clampedConfidence - 50) / 50) * 60; // 60 to 120 (yellow to green)
  }

  return `hsl(${hue}, 80%, 45%)`;
}

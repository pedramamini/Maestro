/**
 * inlineWizardDocumentGeneration.ts
 *
 * Service for generating Auto Run documents during inline wizard mode.
 * This service handles constructing the generation prompt, spawning the AI agent,
 * parsing document markers from the response, and saving documents to disk.
 *
 * Reuses patterns from the onboarding wizard's phaseGenerator.ts but adapted
 * for the inline wizard's stateless service approach.
 */

import type { ToolType } from '../types';
import type { InlineWizardMessage, InlineGeneratedDocument } from '../hooks/useInlineWizard';
import type { ExistingDocument } from '../utils/existingDocsDetector';
import { wizardDocumentGenerationPrompt } from '../../prompts';
import { substituteTemplateVariables, type TemplateContext } from '../utils/templateVariables';

/**
 * Auto Run folder name constant.
 */
export const AUTO_RUN_FOLDER_NAME = 'Auto Run Docs';

/**
 * Generation timeout in milliseconds (5 minutes).
 */
const GENERATION_TIMEOUT = 300000;

/**
 * Callbacks for document generation progress.
 */
export interface DocumentGenerationCallbacks {
  /** Called when generation starts */
  onStart?: () => void;
  /** Called with progress updates */
  onProgress?: (message: string) => void;
  /** Called with output chunks (for streaming display) */
  onChunk?: (chunk: string) => void;
  /** Called when a single document is complete and saved */
  onDocumentComplete?: (doc: InlineGeneratedDocument) => void;
  /** Called when all documents are complete */
  onComplete?: (documents: InlineGeneratedDocument[]) => void;
  /** Called on error */
  onError?: (error: string) => void;
}

/**
 * Configuration for document generation.
 */
export interface DocumentGenerationConfig {
  /** Agent type to use for generation */
  agentType: ToolType;
  /** Working directory for the agent */
  directoryPath: string;
  /** Project name from wizard */
  projectName: string;
  /** Conversation history from the wizard */
  conversationHistory: InlineWizardMessage[];
  /** Existing documents (for iterate mode) */
  existingDocuments?: ExistingDocument[];
  /** Wizard mode */
  mode: 'new' | 'iterate';
  /** Goal for iterate mode */
  goal?: string;
  /** Auto Run folder path */
  autoRunFolderPath: string;
  /** Optional callbacks */
  callbacks?: DocumentGenerationCallbacks;
}

/**
 * Result of document generation.
 */
export interface DocumentGenerationResult {
  /** Whether generation was successful */
  success: boolean;
  /** Generated documents (if successful) */
  documents?: InlineGeneratedDocument[];
  /** Error message (if failed) */
  error?: string;
  /** Raw agent output (for debugging) */
  rawOutput?: string;
}

/**
 * Parsed document from agent output.
 */
interface ParsedDocument {
  filename: string;
  content: string;
  phase: number;
}

/**
 * Sanitize a filename to prevent path traversal attacks.
 *
 * @param filename - The raw filename from AI-generated output
 * @returns A safe filename with dangerous characters removed
 */
export function sanitizeFilename(filename: string): string {
  return filename
    // Remove path separators (both Unix and Windows)
    .replace(/[\/\\]/g, '-')
    // Remove directory traversal sequences
    .replace(/\.\./g, '')
    // Remove null bytes and control characters
    .replace(/[\x00-\x1f\x7f]/g, '')
    // Remove leading dots (hidden files / relative paths)
    .replace(/^\.+/, '')
    // Remove leading/trailing whitespace
    .trim()
    // Ensure we have something left, default to 'document' if empty
    || 'document';
}

/**
 * Count tasks (checkbox items) in document content.
 */
export function countTasks(content: string): number {
  const taskPattern = /^-\s*\[\s*[xX ]?\s*\]/gm;
  const matches = content.match(taskPattern);
  return matches ? matches.length : 0;
}

/**
 * Generate the document generation prompt.
 *
 * @param config Configuration for generation
 * @returns The complete prompt for the agent
 */
function generateDocumentPrompt(config: DocumentGenerationConfig): string {
  const { projectName, directoryPath, conversationHistory } = config;
  const projectDisplay = projectName || 'this project';

  // Build conversation summary from the wizard conversation
  const conversationSummary = conversationHistory
    .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
    .map((msg) => {
      const prefix = msg.role === 'user' ? 'User' : 'Assistant';
      return `${prefix}: ${msg.content}`;
    })
    .join('\n\n');

  // Handle wizard-specific template variables
  let prompt = wizardDocumentGenerationPrompt
    .replace(/\{\{PROJECT_NAME\}\}/gi, projectDisplay)
    .replace(/\{\{DIRECTORY_PATH\}\}/gi, directoryPath)
    .replace(/\{\{AUTO_RUN_FOLDER_NAME\}\}/gi, AUTO_RUN_FOLDER_NAME)
    .replace(/\{\{CONVERSATION_SUMMARY\}\}/gi, conversationSummary);

  // Build template context for remaining variables
  const templateContext: TemplateContext = {
    session: {
      id: 'inline-wizard-gen',
      name: projectDisplay,
      toolType: config.agentType,
      cwd: directoryPath,
      fullPath: directoryPath,
    },
  };

  // Substitute any remaining template variables
  prompt = substituteTemplateVariables(prompt, templateContext);

  return prompt;
}

/**
 * Parse the agent's output to extract individual documents.
 *
 * Looks for document blocks with markers:
 * ---BEGIN DOCUMENT---
 * FILENAME: Phase-01-Setup.md
 * CONTENT:
 * [markdown content]
 * ---END DOCUMENT---
 */
export function parseGeneratedDocuments(output: string): ParsedDocument[] {
  const documents: ParsedDocument[] = [];

  // Pattern to match document blocks
  const docPattern = /---BEGIN DOCUMENT---\s*\nFILENAME:\s*(.+?)\s*\nCONTENT:\s*\n([\s\S]*?)(?=---END DOCUMENT---|$)/g;

  let match;
  while ((match = docPattern.exec(output)) !== null) {
    const filename = match[1].trim();
    let content = match[2].trim();

    // Remove any trailing ---END DOCUMENT--- marker from content
    content = content.replace(/---END DOCUMENT---\s*$/, '').trim();

    // Extract phase number from filename (Phase-01-..., Phase-02-..., etc.)
    const phaseMatch = filename.match(/Phase-(\d+)/i);
    const phase = phaseMatch ? parseInt(phaseMatch[1], 10) : 0;

    if (filename && content) {
      documents.push({
        filename,
        content,
        phase,
      });
    }
  }

  // Sort by phase number
  documents.sort((a, b) => a.phase - b.phase);

  return documents;
}

/**
 * Intelligent splitting of a single large document into phases.
 *
 * If the agent generates one large document instead of multiple phases,
 * this function attempts to split it intelligently.
 */
export function splitIntoPhases(content: string): ParsedDocument[] {
  const documents: ParsedDocument[] = [];

  // Try to find phase-like sections within the content
  const phaseSectionPattern = /(?:^|\n)(#{1,2}\s*Phase\s*\d+[^\n]*)\n([\s\S]*?)(?=\n#{1,2}\s*Phase\s*\d+|$)/gi;

  let match;
  let phaseNumber = 1;

  while ((match = phaseSectionPattern.exec(content)) !== null) {
    const header = match[1].trim();
    const sectionContent = match[2].trim();

    // Create a proper document from this section
    const fullContent = `${header}\n\n${sectionContent}`;

    // Try to extract a description from the header
    const descMatch = header.match(/Phase\s*\d+[:\s-]*(.*)/i);
    const description = descMatch && descMatch[1].trim()
      ? descMatch[1].trim().replace(/[^a-zA-Z0-9\s-]/g, '').trim().replace(/\s+/g, '-')
      : 'Tasks';

    documents.push({
      filename: `Phase-${String(phaseNumber).padStart(2, '0')}-${description}.md`,
      content: fullContent,
      phase: phaseNumber,
    });

    phaseNumber++;
  }

  // If no phase sections found, treat the whole content as Phase 1
  if (documents.length === 0 && content.trim()) {
    documents.push({
      filename: 'Phase-01-Initial-Setup.md',
      content: content.trim(),
      phase: 1,
    });
  }

  return documents;
}

/**
 * Extract the result from Claude's stream-json format.
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
function buildArgsForAgent(agent: { id: string; args?: string[] }): string[] {
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
 * Save a single document to the Auto Run folder.
 *
 * @param autoRunFolderPath - The Auto Run folder path
 * @param doc - The parsed document to save
 * @returns The saved document with path information
 */
async function saveDocument(
  autoRunFolderPath: string,
  doc: ParsedDocument
): Promise<InlineGeneratedDocument> {
  // Sanitize filename to prevent path traversal attacks
  const sanitized = sanitizeFilename(doc.filename);
  // Ensure filename has .md extension
  const filename = sanitized.endsWith('.md') ? sanitized : `${sanitized}.md`;

  console.log('[InlineWizardDocGen] Saving document:', filename);

  // Write the document
  const result = await window.maestro.autorun.writeDoc(
    autoRunFolderPath,
    filename,
    doc.content
  );

  if (!result.success) {
    throw new Error(result.error || `Failed to save ${filename}`);
  }

  const fullPath = `${autoRunFolderPath}/${filename}`;

  return {
    filename,
    content: doc.content,
    taskCount: countTasks(doc.content),
    savedPath: fullPath,
  };
}

/**
 * Generate Auto Run documents based on the inline wizard conversation.
 *
 * This function:
 * 1. Constructs a prompt using wizard-document-generation.md
 * 2. Spawns the AI agent and collects streamed output
 * 3. Parses document markers from the response
 * 4. Saves each document to the Auto Run folder
 * 5. Returns the list of generated documents
 *
 * @param config - Configuration for document generation
 * @returns Result containing generated documents or error
 */
export async function generateInlineDocuments(
  config: DocumentGenerationConfig
): Promise<DocumentGenerationResult> {
  const { agentType, directoryPath, autoRunFolderPath, callbacks } = config;

  callbacks?.onStart?.();
  callbacks?.onProgress?.('Preparing to generate your action plan...');

  try {
    // Get the agent configuration
    const agent = await window.maestro.agents.get(agentType);
    if (!agent || !agent.available) {
      throw new Error(`Agent ${agentType} is not available`);
    }

    // Generate the prompt
    const prompt = generateDocumentPrompt(config);

    callbacks?.onProgress?.('Generating Auto Run Documents...');

    // Spawn agent and collect output
    const sessionId = `inline-wizard-gen-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const argsForSpawn = buildArgsForAgent(agent);

    const result = await new Promise<{ success: boolean; rawOutput: string; error?: string }>((resolve) => {
      let outputBuffer = '';
      let dataListenerCleanup: (() => void) | undefined;
      let exitListenerCleanup: (() => void) | undefined;

      // Set up timeout (5 minutes for complex generation)
      const timeoutId = setTimeout(() => {
        console.error('[InlineWizardDocGen] TIMEOUT fired! Session:', sessionId);
        cleanupListeners();
        window.maestro.process.kill(sessionId).catch(() => {});
        resolve({
          success: false,
          rawOutput: outputBuffer,
          error: 'Generation timed out after 5 minutes. Please try again.',
        });
      }, GENERATION_TIMEOUT);

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
          if (receivedSessionId === sessionId) {
            outputBuffer += data;
            callbacks?.onChunk?.(data);
          }
        }
      );

      // Set up exit listener
      exitListenerCleanup = window.maestro.process.onExit(
        (receivedSessionId: string, code: number) => {
          if (receivedSessionId === sessionId) {
            clearTimeout(timeoutId);
            cleanupListeners();

            console.log('[InlineWizardDocGen] Agent exited with code:', code);

            if (code === 0) {
              resolve({
                success: true,
                rawOutput: outputBuffer,
              });
            } else {
              resolve({
                success: false,
                rawOutput: outputBuffer,
                error: `Agent exited with code ${code}`,
              });
            }
          }
        }
      );

      // Spawn the agent process
      window.maestro.process
        .spawn({
          sessionId,
          toolType: agentType,
          cwd: directoryPath,
          command: agent.command,
          args: argsForSpawn,
          prompt,
        })
        .then(() => {
          console.log('[InlineWizardDocGen] Agent spawned successfully');
        })
        .catch((error: Error) => {
          cleanupListeners();
          clearTimeout(timeoutId);
          resolve({
            success: false,
            rawOutput: outputBuffer,
            error: `Failed to spawn agent: ${error.message}`,
          });
        });
    });

    if (!result.success) {
      callbacks?.onError?.(result.error || 'Generation failed');
      return {
        success: false,
        error: result.error,
        rawOutput: result.rawOutput,
      };
    }

    // Parse the output
    callbacks?.onProgress?.('Parsing generated documents...');

    const rawOutput = result.rawOutput;

    // Try to extract result from stream-json format
    const extractedResult = extractResultFromStreamJson(rawOutput, agentType);
    const textToParse = extractedResult || rawOutput;

    let documents = parseGeneratedDocuments(textToParse);

    // If no documents parsed with markers, try splitting intelligently
    if (documents.length === 0 && textToParse.trim()) {
      callbacks?.onProgress?.('Processing document structure...');
      documents = splitIntoPhases(textToParse);
    }

    // Check if we got valid documents with tasks
    const totalTasks = documents.reduce((sum, doc) => sum + countTasks(doc.content), 0);
    if (documents.length === 0 || totalTasks === 0) {
      // Check for files on disk (agent may have written directly)
      callbacks?.onProgress?.('Checking for documents on disk...');
      const diskDocs = await readDocumentsFromDisk(autoRunFolderPath);
      if (diskDocs.length > 0) {
        console.log('[InlineWizardDocGen] Found documents on disk:', diskDocs.length);
        documents = diskDocs;
      }
    }

    if (documents.length === 0) {
      throw new Error('No documents were generated. Please try again.');
    }

    // Save each document and collect results
    callbacks?.onProgress?.(`Saving ${documents.length} document(s)...`);

    const savedDocuments: InlineGeneratedDocument[] = [];
    for (const doc of documents) {
      try {
        const savedDoc = await saveDocument(autoRunFolderPath, doc);
        savedDocuments.push(savedDoc);
        callbacks?.onDocumentComplete?.(savedDoc);
      } catch (error) {
        console.error('[InlineWizardDocGen] Failed to save document:', doc.filename, error);
        // Continue saving other documents even if one fails
      }
    }

    if (savedDocuments.length === 0) {
      throw new Error('Failed to save any documents. Please check permissions and try again.');
    }

    callbacks?.onProgress?.(`Generated ${savedDocuments.length} Auto Run document(s)`);
    callbacks?.onComplete?.(savedDocuments);

    return {
      success: true,
      documents: savedDocuments,
      rawOutput,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('[InlineWizardDocGen] Error:', error);
    callbacks?.onError?.(errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Read documents from the Auto Run folder on disk.
 *
 * This is a fallback for when the agent writes files directly
 * instead of outputting them with markers.
 */
async function readDocumentsFromDisk(autoRunFolderPath: string): Promise<ParsedDocument[]> {
  const documents: ParsedDocument[] = [];

  try {
    // List files in the Auto Run folder
    const listResult = await window.maestro.autorun.listDocs(autoRunFolderPath);
    if (!listResult.success || !listResult.files) {
      return [];
    }

    // Read each .md file
    // Note: listDocs returns filenames WITHOUT the .md extension
    for (const fileBaseName of listResult.files) {
      const filename = fileBaseName.endsWith('.md') ? fileBaseName : `${fileBaseName}.md`;

      const readResult = await window.maestro.autorun.readDoc(autoRunFolderPath, fileBaseName);
      if (readResult.success && readResult.content) {
        // Extract phase number from filename
        const phaseMatch = filename.match(/Phase-(\d+)/i);
        const phase = phaseMatch ? parseInt(phaseMatch[1], 10) : 0;

        documents.push({
          filename,
          content: readResult.content,
          phase,
        });
      }
    }

    // Sort by phase number
    documents.sort((a, b) => a.phase - b.phase);

    return documents;
  } catch (error) {
    console.error('[InlineWizardDocGen] Error reading documents from disk:', error);
    return [];
  }
}

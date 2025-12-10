/**
 * phaseGenerator.ts
 *
 * Service for generating phased markdown documents based on the wizard's
 * project discovery conversation. Creates actionable task lists organized
 * into phases, with Phase 1 designed to be completable without user input.
 */

import type { ToolType } from '../../../types';
import type { WizardMessage, GeneratedDocument } from '../WizardContext';

/**
 * Configuration for document generation
 */
export interface GenerationConfig {
  /** Agent type to use for generation */
  agentType: ToolType;
  /** Working directory for the agent */
  directoryPath: string;
  /** Project name from wizard */
  projectName: string;
  /** Full conversation history from project discovery */
  conversationHistory: WizardMessage[];
}

/**
 * Result of document generation
 */
export interface GenerationResult {
  /** Whether generation was successful */
  success: boolean;
  /** Generated documents (if successful) */
  documents?: GeneratedDocument[];
  /** Error message (if failed) */
  error?: string;
  /** Raw agent output (for debugging) */
  rawOutput?: string;
}

/**
 * Callbacks for generation progress
 */
export interface GenerationCallbacks {
  /** Called when generation starts */
  onStart?: () => void;
  /** Called with progress updates */
  onProgress?: (message: string) => void;
  /** Called with output chunks (for streaming display) */
  onChunk?: (chunk: string) => void;
  /** Called when generation completes */
  onComplete?: (result: GenerationResult) => void;
  /** Called on error */
  onError?: (error: string) => void;
}

/**
 * Parsed document from agent output
 */
interface ParsedDocument {
  filename: string;
  content: string;
  phase: number;
}

/**
 * Default Auto Run folder name
 */
export const AUTO_RUN_FOLDER_NAME = 'Auto Run Docs';

/**
 * Generation timeout in milliseconds (2.5 minutes)
 */
const GENERATION_TIMEOUT = 150000;

/**
 * Generate the system prompt for document generation
 *
 * This prompt instructs the agent to:
 * - Create multiple phased markdown documents
 * - Make Phase 1 achievable without user input
 * - Make Phase 1 deliver a working prototype
 * - Use checkbox task format
 * - Name files as Phase-XX-Description.md
 */
export function generateDocumentGenerationPrompt(config: GenerationConfig): string {
  const { projectName, directoryPath, conversationHistory } = config;
  const projectDisplay = projectName || 'this project';

  // Build conversation summary
  const conversationSummary = conversationHistory
    .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
    .map((msg) => {
      const prefix = msg.role === 'user' ? 'User' : 'Assistant';
      return `${prefix}: ${msg.content}`;
    })
    .join('\n\n');

  return `You are an expert project planner creating actionable task documents for "${projectDisplay}".

## Your Task

Based on the project discovery conversation below, create a series of phased markdown documents that will guide an AI coding assistant through building this project step by step.

## Working Directory

All files will be created in: ${directoryPath}
The documents will be saved to: ${directoryPath}/${AUTO_RUN_FOLDER_NAME}/

## Critical Requirements for Phase 1

Phase 1 is the MOST IMPORTANT phase. It MUST:

1. **Be Completely Self-Contained**: Phase 1 must be executable without ANY user input or decisions during execution. The AI should be able to start and complete Phase 1 entirely on its own.

2. **Deliver a Working Prototype**: By the end of Phase 1, there should be something tangible that runs/works. This could be:
   - A running web server (even if minimal)
   - An executable script that produces output
   - A basic UI that displays something
   - A function that can be called and tested
   - A document structure that renders

3. **Excite the User**: Phase 1 should deliver enough visible progress that the user feels excited about what's possible. Show them the magic of AI-assisted development early.

4. **Foundation First**: Set up project structure, dependencies, and core scaffolding before building features.

## Document Format

Each phase document MUST follow this exact format:

\`\`\`markdown
# Phase XX: [Brief Title]

[One paragraph describing what this phase accomplishes and why it matters]

## Tasks

- [ ] First specific task to complete
- [ ] Second specific task to complete
- [ ] Continue with more tasks...
\`\`\`

## Task Writing Guidelines

Each task should be:
- **Specific**: Not "set up the project" but "Create package.json with required dependencies"
- **Actionable**: Clear what needs to be done
- **Verifiable**: You can tell when it's complete
- **Autonomous**: Can be done without asking the user questions

Bad task examples (too vague):
- [ ] Build the UI
- [ ] Add features
- [ ] Set up the backend

Good task examples (specific and actionable):
- [ ] Create src/components/Header.tsx with logo, navigation links, and responsive menu
- [ ] Add Express route GET /api/users that returns mock user data array
- [ ] Create CSS module for Button component with primary and secondary variants

## Phase Guidelines

- **Phase 1**: Foundation + Working Prototype (MUST work end-to-end, even if minimal)
- **Phase 2-N**: Additional features, improvements, polish
- Each phase should build on the previous
- Keep phases focused (5-15 tasks typically)
- Avoid tasks that require user decisions mid-execution
- No documentation-only tasks (docs can be part of implementation tasks)

## Output Format

Output each document in this format (including the markers):

---BEGIN DOCUMENT---
FILENAME: Phase-01-[Description].md
CONTENT:
[Full markdown content here]
---END DOCUMENT---

---BEGIN DOCUMENT---
FILENAME: Phase-02-[Description].md
CONTENT:
[Full markdown content here]
---END DOCUMENT---

Continue for as many phases as needed.

## Project Discovery Conversation

${conversationSummary}

## Now Generate the Documents

Based on the conversation above, create the phased documents. Start with Phase 1 (the working prototype), then create additional phases as needed. Remember: Phase 1 must be completely autonomous and deliver something that works!`;
}

/**
 * Parse the agent's output to extract individual documents
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
 * Count tasks in a document
 */
export function countTasks(content: string): number {
  const taskPattern = /^-\s*\[\s*[xX ]?\s*\]/gm;
  const matches = content.match(taskPattern);
  return matches ? matches.length : 0;
}

/**
 * Validate that generated documents have proper structure
 */
export function validateDocuments(documents: ParsedDocument[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (documents.length === 0) {
    errors.push('No documents were generated');
    return { valid: false, errors };
  }

  // Check each document
  for (const doc of documents) {
    const taskCount = countTasks(doc.content);

    if (taskCount === 0) {
      errors.push(`${doc.filename} has no tasks (checkbox items)`);
    }

    // Check for required structure
    if (!doc.content.includes('# Phase')) {
      errors.push(`${doc.filename} is missing a phase header`);
    }

    if (!doc.content.includes('## Tasks')) {
      errors.push(`${doc.filename} is missing a Tasks section`);
    }
  }

  // Ensure we have a Phase 1
  const hasPhase1 = documents.some((d) => d.phase === 1);
  if (!hasPhase1) {
    errors.push('No Phase 1 document was generated');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Intelligent splitting of a single large document into phases
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
 * Extract the result from Claude's stream-json format
 */
function extractResultFromStreamJson(output: string): string | null {
  try {
    const lines = output.split('\n');
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
 * PhaseGenerator class
 *
 * Manages the document generation process, including:
 * - Spawning the agent with the generation prompt
 * - Parsing and validating generated documents
 * - Saving documents to the Auto Run folder
 */
class PhaseGenerator {
  private isGenerating = false;
  private outputBuffer = '';
  private dataListenerCleanup?: () => void;
  private exitListenerCleanup?: () => void;

  /**
   * Generate phase documents based on the project discovery conversation
   */
  async generateDocuments(
    config: GenerationConfig,
    callbacks?: GenerationCallbacks
  ): Promise<GenerationResult> {
    if (this.isGenerating) {
      return {
        success: false,
        error: 'Generation already in progress',
      };
    }

    this.isGenerating = true;
    this.outputBuffer = '';

    callbacks?.onStart?.();
    callbacks?.onProgress?.('Preparing to generate your action plan...');

    try {
      // Get the agent configuration
      const agent = await window.maestro.agents.get(config.agentType);
      if (!agent || !agent.available) {
        throw new Error(`Agent ${config.agentType} is not available`);
      }

      // Generate the prompt
      const prompt = generateDocumentGenerationPrompt(config);

      callbacks?.onProgress?.('Generating phased documents...');

      // Spawn the agent and wait for completion
      const result = await this.runAgent(agent, config, prompt, callbacks);

      if (!result.success) {
        callbacks?.onError?.(result.error || 'Generation failed');
        return result;
      }

      // Parse the output
      callbacks?.onProgress?.('Parsing generated documents...');

      const rawOutput = result.rawOutput || '';
      let documents = parseGeneratedDocuments(rawOutput);

      // If no documents parsed with markers, try splitting intelligently
      if (documents.length === 0 && rawOutput.trim()) {
        callbacks?.onProgress?.('Processing document structure...');
        documents = splitIntoPhases(rawOutput);
      }

      // Validate documents
      const validation = validateDocuments(documents);
      if (!validation.valid) {
        // Try to salvage what we can if there's at least some content
        if (documents.length > 0) {
          callbacks?.onProgress?.(
            `Note: ${validation.errors.length} validation warning(s), proceeding anyway`
          );
        } else {
          throw new Error(
            `Document validation failed: ${validation.errors.join('; ')}`
          );
        }
      }

      // Convert to GeneratedDocument format
      const generatedDocs: GeneratedDocument[] = documents.map((doc) => ({
        filename: doc.filename,
        content: doc.content,
        taskCount: countTasks(doc.content),
      }));

      callbacks?.onProgress?.(`Generated ${generatedDocs.length} phase document(s)`);

      const finalResult: GenerationResult = {
        success: true,
        documents: generatedDocs,
        rawOutput,
      };

      callbacks?.onComplete?.(finalResult);
      return finalResult;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      callbacks?.onError?.(errorMessage);
      return {
        success: false,
        error: errorMessage,
        rawOutput: this.outputBuffer,
      };
    } finally {
      this.isGenerating = false;
      this.cleanup();
    }
  }

  /**
   * Run the agent and collect output
   */
  private runAgent(
    agent: any,
    config: GenerationConfig,
    prompt: string,
    callbacks?: GenerationCallbacks
  ): Promise<GenerationResult> {
    const sessionId = `wizard-gen-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return new Promise<GenerationResult>((resolve) => {
      let timeoutId: ReturnType<typeof setTimeout>;

      // Set up data listener
      this.dataListenerCleanup = window.maestro.process.onData(
        (sid: string, data: string) => {
          if (sid === sessionId) {
            this.outputBuffer += data;
            callbacks?.onChunk?.(data);
          }
        }
      );

      // Set up exit listener
      this.exitListenerCleanup = window.maestro.process.onExit(
        (sid: string, code: number) => {
          if (sid === sessionId) {
            clearTimeout(timeoutId);
            this.cleanup();

            if (code === 0) {
              // Try to extract result from stream-json format
              const extracted = extractResultFromStreamJson(this.outputBuffer);
              const output = extracted || this.outputBuffer;

              resolve({
                success: true,
                rawOutput: output,
              });
            } else {
              resolve({
                success: false,
                error: `Agent exited with code ${code}`,
                rawOutput: this.outputBuffer,
              });
            }
          }
        }
      );

      // Set up timeout
      timeoutId = setTimeout(() => {
        this.cleanup();
        window.maestro.process.kill(sessionId).catch(() => {});
        resolve({
          success: false,
          error: 'Generation timed out. Please try again.',
          rawOutput: this.outputBuffer,
        });
      }, GENERATION_TIMEOUT);

      // Spawn the agent using the secure IPC channel
      window.maestro.process
        .spawn({
          sessionId,
          toolType: config.agentType,
          cwd: config.directoryPath,
          command: agent.command,
          args: [...(agent.args || [])],
          prompt,
        })
        .catch((error: Error) => {
          clearTimeout(timeoutId);
          this.cleanup();
          resolve({
            success: false,
            error: `Failed to spawn agent: ${error.message}`,
          });
        });
    });
  }

  /**
   * Clean up listeners
   */
  private cleanup(): void {
    if (this.dataListenerCleanup) {
      this.dataListenerCleanup();
      this.dataListenerCleanup = undefined;
    }
    if (this.exitListenerCleanup) {
      this.exitListenerCleanup();
      this.exitListenerCleanup = undefined;
    }
  }

  /**
   * Save generated documents to the Auto Run folder
   *
   * Creates the Auto Run Docs folder if it doesn't exist.
   */
  async saveDocuments(
    directoryPath: string,
    documents: GeneratedDocument[]
  ): Promise<{ success: boolean; savedPaths: string[]; error?: string }> {
    const autoRunPath = `${directoryPath}/${AUTO_RUN_FOLDER_NAME}`;
    const savedPaths: string[] = [];

    try {
      // Save each document
      for (const doc of documents) {
        // Ensure filename has .md extension
        const filename = doc.filename.endsWith('.md')
          ? doc.filename
          : `${doc.filename}.md`;

        // Write the document (autorun:writeDoc creates the folder if needed)
        const result = await window.maestro.autorun.writeDoc(
          autoRunPath,
          filename,
          doc.content
        );

        if (result.success) {
          const fullPath = `${autoRunPath}/${filename}`;
          savedPaths.push(fullPath);

          // Update the document with the saved path
          doc.savedPath = fullPath;
        } else {
          throw new Error(
            result.error || `Failed to save ${filename}`
          );
        }
      }

      return { success: true, savedPaths };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to save documents';
      return { success: false, savedPaths, error: errorMessage };
    }
  }

  /**
   * Get the Auto Run folder path for a directory
   */
  getAutoRunPath(directoryPath: string): string {
    return `${directoryPath}/${AUTO_RUN_FOLDER_NAME}`;
  }

  /**
   * Check if generation is in progress
   */
  isGenerationInProgress(): boolean {
    return this.isGenerating;
  }
}

// Export singleton instance
export const phaseGenerator = new PhaseGenerator();

// Export utility functions for use elsewhere
export const phaseGeneratorUtils = {
  generateDocumentGenerationPrompt,
  parseGeneratedDocuments,
  countTasks,
  validateDocuments,
  splitIntoPhases,
  AUTO_RUN_FOLDER_NAME,
};

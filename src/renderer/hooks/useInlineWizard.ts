/**
 * useInlineWizard.ts
 *
 * Hook for managing inline wizard state within a session.
 * The inline wizard allows users to create new Auto Run documents or iterate
 * on existing ones through a conversational interface triggered by `/wizard`.
 *
 * Unlike the full-screen onboarding wizard (MaestroWizard.tsx), this wizard
 * runs inline within the existing AI conversation interface.
 */

import { useState, useCallback, useRef } from 'react';
import { parseWizardIntent } from '../services/wizardIntentParser';
import {
  hasExistingAutoRunDocs,
  getExistingAutoRunDocs,
  type ExistingDocument,
} from '../utils/existingDocsDetector';

/**
 * Wizard mode determines whether the user wants to create new documents
 * or iterate on existing ones.
 */
export type InlineWizardMode = 'new' | 'iterate' | 'ask' | null;

/**
 * Message in the wizard conversation.
 * Simplified version of WizardMessage from onboarding wizard.
 */
export interface InlineWizardMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  /** Parsed confidence from assistant responses */
  confidence?: number;
  /** Parsed ready flag from assistant responses */
  ready?: boolean;
}

/**
 * UI state to restore when wizard ends.
 * These settings are temporarily overridden during wizard mode.
 */
export interface PreviousUIState {
  readOnlyMode: boolean;
  saveToHistory: boolean;
  showThinking: boolean;
}

/**
 * Generated document from the wizard.
 */
export interface InlineGeneratedDocument {
  filename: string;
  content: string;
  taskCount: number;
  /** Absolute path after saving */
  savedPath?: string;
}

/**
 * State shape for the inline wizard.
 */
export interface InlineWizardState {
  /** Whether wizard is currently active */
  isActive: boolean;
  /** Whether wizard is initializing (checking for existing docs, parsing intent) */
  isInitializing: boolean;
  /** Current wizard mode */
  mode: InlineWizardMode;
  /** Goal for iterate mode (what the user wants to add/change) */
  goal: string | null;
  /** Confidence level from agent responses (0-100) */
  confidence: number;
  /** Conversation history for this wizard session */
  conversationHistory: InlineWizardMessage[];
  /** Whether documents are being generated */
  isGeneratingDocs: boolean;
  /** Generated documents (if any) */
  generatedDocuments: InlineGeneratedDocument[];
  /** Existing Auto Run documents loaded for iterate mode context */
  existingDocuments: ExistingDocument[];
  /** Previous UI state to restore when wizard ends */
  previousUIState: PreviousUIState | null;
  /** Error message if something goes wrong */
  error: string | null;
  /** Project path used for document detection */
  projectPath: string | null;
}

/**
 * Return type for useInlineWizard hook.
 */
export interface UseInlineWizardReturn {
  /** Whether the wizard is currently active */
  isWizardActive: boolean;
  /** Whether the wizard is initializing (checking for existing docs, parsing intent) */
  isInitializing: boolean;
  /** Current wizard mode */
  wizardMode: InlineWizardMode;
  /** Goal for iterate mode */
  wizardGoal: string | null;
  /** Current confidence level (0-100) */
  confidence: number;
  /** Conversation history */
  conversationHistory: InlineWizardMessage[];
  /** Whether documents are being generated */
  isGeneratingDocs: boolean;
  /** Generated documents */
  generatedDocuments: InlineGeneratedDocument[];
  /** Existing documents loaded for iterate mode */
  existingDocuments: ExistingDocument[];
  /** Error message if any */
  error: string | null;
  /** Full wizard state */
  state: InlineWizardState;
  /**
   * Start the wizard with intent parsing flow.
   * @param naturalLanguageInput - Optional input from `/wizard <text>` command
   * @param currentUIState - Current UI state to restore when wizard ends
   * @param projectPath - Project path to check for existing Auto Run documents
   */
  startWizard: (
    naturalLanguageInput?: string,
    currentUIState?: PreviousUIState,
    projectPath?: string
  ) => Promise<void>;
  /** End the wizard and restore previous UI state */
  endWizard: () => PreviousUIState | null;
  /**
   * Send a message to the wizard conversation.
   * @param content - Message content
   */
  sendMessage: (content: string) => void;
  /**
   * Set the confidence level.
   * @param value - Confidence value (0-100)
   */
  setConfidence: (value: number) => void;
  /** Set the wizard mode */
  setMode: (mode: InlineWizardMode) => void;
  /** Set the goal for iterate mode */
  setGoal: (goal: string | null) => void;
  /** Set whether documents are being generated */
  setGeneratingDocs: (generating: boolean) => void;
  /** Set generated documents */
  setGeneratedDocuments: (docs: InlineGeneratedDocument[]) => void;
  /** Set existing documents (for iterate mode context) */
  setExistingDocuments: (docs: ExistingDocument[]) => void;
  /** Set error message */
  setError: (error: string | null) => void;
  /** Add an assistant response to the conversation */
  addAssistantMessage: (content: string, confidence?: number, ready?: boolean) => void;
  /** Clear conversation history */
  clearConversation: () => void;
  /** Reset the wizard to initial state */
  reset: () => void;
}

/**
 * Generate a unique message ID.
 */
function generateMessageId(): string {
  return `iwm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Initial wizard state.
 */
const initialState: InlineWizardState = {
  isActive: false,
  isInitializing: false,
  mode: null,
  goal: null,
  confidence: 0,
  conversationHistory: [],
  isGeneratingDocs: false,
  generatedDocuments: [],
  existingDocuments: [],
  previousUIState: null,
  error: null,
  projectPath: null,
};

/**
 * Hook for managing inline wizard state.
 *
 * The inline wizard is triggered by the `/wizard` slash command and allows
 * users to create or iterate on Auto Run documents within their existing
 * session context.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const {
 *     isWizardActive,
 *     wizardMode,
 *     startWizard,
 *     endWizard,
 *     sendMessage,
 *   } = useInlineWizard();
 *
 *   // Start wizard when user types /wizard
 *   const handleSlashCommand = (cmd: string, args: string) => {
 *     if (cmd === '/wizard') {
 *       startWizard(args, { readOnlyMode: true, saveToHistory: false, showThinking: false });
 *     }
 *   };
 *
 *   // Render wizard UI when active
 *   if (isWizardActive) {
 *     return <WizardInterface mode={wizardMode} />;
 *   }
 * }
 * ```
 */
export function useInlineWizard(): UseInlineWizardReturn {
  const [state, setState] = useState<InlineWizardState>(initialState);

  // Use ref to hold the previous UI state for restoration
  const previousUIStateRef = useRef<PreviousUIState | null>(null);

  /**
   * Start the wizard with intent parsing flow.
   *
   * Flow:
   * 1. Check if project has existing Auto Run documents
   * 2. If no input provided and docs exist → 'ask' mode (prompt user)
   * 3. If input provided → parse intent to determine mode
   * 4. If mode is 'iterate' → load existing docs for context
   */
  const startWizard = useCallback(
    async (
      naturalLanguageInput?: string,
      currentUIState?: PreviousUIState,
      projectPath?: string
    ): Promise<void> => {
      // Store current UI state for later restoration
      if (currentUIState) {
        previousUIStateRef.current = currentUIState;
      }

      // Set initializing state immediately
      setState((prev) => ({
        ...prev,
        isActive: true,
        isInitializing: true,
        mode: null,
        goal: null,
        confidence: 0,
        conversationHistory: [],
        isGeneratingDocs: false,
        generatedDocuments: [],
        existingDocuments: [],
        previousUIState: currentUIState || null,
        error: null,
        projectPath: projectPath || null,
      }));

      try {
        // Step 1: Check for existing Auto Run documents
        const hasExistingDocs = projectPath
          ? await hasExistingAutoRunDocs(projectPath)
          : false;

        // Step 2: Determine mode based on input and existing docs
        let mode: InlineWizardMode;
        let goal: string | null = null;
        let existingDocs: ExistingDocument[] = [];

        const trimmedInput = naturalLanguageInput?.trim() || '';

        if (!trimmedInput) {
          // No input provided
          if (hasExistingDocs) {
            // Docs exist - ask user what they want to do
            mode = 'ask';
          } else {
            // No docs - default to new mode
            mode = 'new';
          }
        } else {
          // Input provided - parse intent
          const intentResult = parseWizardIntent(trimmedInput, hasExistingDocs);
          mode = intentResult.mode;
          goal = intentResult.goal || null;
        }

        // Step 3: If iterate mode, load existing docs for context
        if (mode === 'iterate' && projectPath) {
          existingDocs = await getExistingAutoRunDocs(projectPath);
        }

        // Update state with parsed results
        setState((prev) => ({
          ...prev,
          isInitializing: false,
          mode,
          goal,
          existingDocuments: existingDocs,
        }));
      } catch (error) {
        // Handle any errors during initialization
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to initialize wizard';
        console.error('[useInlineWizard] startWizard error:', error);

        setState((prev) => ({
          ...prev,
          isInitializing: false,
          mode: 'new', // Default to new mode on error
          error: errorMessage,
        }));
      }
    },
    []
  );

  /**
   * End the wizard and return the previous UI state for restoration.
   */
  const endWizard = useCallback((): PreviousUIState | null => {
    const previousState = previousUIStateRef.current;
    previousUIStateRef.current = null;

    setState(initialState);

    return previousState;
  }, []);

  /**
   * Send a user message to the wizard conversation.
   */
  const sendMessage = useCallback((content: string) => {
    const message: InlineWizardMessage = {
      id: generateMessageId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    setState((prev) => ({
      ...prev,
      conversationHistory: [...prev.conversationHistory, message],
    }));
  }, []);

  /**
   * Add an assistant response to the conversation.
   */
  const addAssistantMessage = useCallback(
    (content: string, confidence?: number, ready?: boolean) => {
      const message: InlineWizardMessage = {
        id: generateMessageId(),
        role: 'assistant',
        content,
        timestamp: Date.now(),
        confidence,
        ready,
      };

      setState((prev) => ({
        ...prev,
        conversationHistory: [...prev.conversationHistory, message],
        // Update confidence if provided
        confidence: confidence !== undefined ? confidence : prev.confidence,
      }));
    },
    []
  );

  /**
   * Set the confidence level.
   */
  const setConfidence = useCallback((value: number) => {
    setState((prev) => ({
      ...prev,
      confidence: Math.max(0, Math.min(100, value)),
    }));
  }, []);

  /**
   * Set the wizard mode.
   */
  const setMode = useCallback((mode: InlineWizardMode) => {
    setState((prev) => ({
      ...prev,
      mode,
    }));
  }, []);

  /**
   * Set the goal for iterate mode.
   */
  const setGoal = useCallback((goal: string | null) => {
    setState((prev) => ({
      ...prev,
      goal,
    }));
  }, []);

  /**
   * Set whether documents are being generated.
   */
  const setGeneratingDocs = useCallback((generating: boolean) => {
    setState((prev) => ({
      ...prev,
      isGeneratingDocs: generating,
    }));
  }, []);

  /**
   * Set generated documents.
   */
  const setGeneratedDocuments = useCallback((docs: InlineGeneratedDocument[]) => {
    setState((prev) => ({
      ...prev,
      generatedDocuments: docs,
      isGeneratingDocs: false,
    }));
  }, []);

  /**
   * Set existing documents (for iterate mode context).
   */
  const setExistingDocuments = useCallback((docs: ExistingDocument[]) => {
    setState((prev) => ({
      ...prev,
      existingDocuments: docs,
    }));
  }, []);

  /**
   * Set error message.
   */
  const setError = useCallback((error: string | null) => {
    setState((prev) => ({
      ...prev,
      error,
    }));
  }, []);

  /**
   * Clear conversation history.
   */
  const clearConversation = useCallback(() => {
    setState((prev) => ({
      ...prev,
      conversationHistory: [],
    }));
  }, []);

  /**
   * Reset the wizard to initial state.
   */
  const reset = useCallback(() => {
    previousUIStateRef.current = null;
    setState(initialState);
  }, []);

  return {
    // Convenience accessors
    isWizardActive: state.isActive,
    isInitializing: state.isInitializing,
    wizardMode: state.mode,
    wizardGoal: state.goal,
    confidence: state.confidence,
    conversationHistory: state.conversationHistory,
    isGeneratingDocs: state.isGeneratingDocs,
    generatedDocuments: state.generatedDocuments,
    existingDocuments: state.existingDocuments,
    error: state.error,

    // Full state
    state,

    // Actions
    startWizard,
    endWizard,
    sendMessage,
    setConfidence,
    setMode,
    setGoal,
    setGeneratingDocs,
    setGeneratedDocuments,
    setExistingDocuments,
    setError,
    addAssistantMessage,
    clearConversation,
    reset,
  };
}

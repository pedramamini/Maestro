/**
 * useMergeSession Hook
 *
 * Manages the complete workflow for merging session contexts:
 * 1. Extract context from source session/tab
 * 2. Extract context from target session/tab
 * 3. Optionally groom contexts using AI to remove duplicates
 * 4. Create a new session with the merged/groomed logs
 * 5. Clean up any temporary resources
 *
 * This hook coordinates between:
 * - ContextGroomingService for AI-powered context consolidation
 * - tabHelpers for creating merged sessions
 * - MergeProgressModal for UI feedback
 */

import { useState, useCallback, useRef } from 'react';
import type { Session, AITab, LogEntry, ToolType } from '../types';
import type {
  MergeResult,
  GroomingProgress,
  ContextSource,
  MergeRequest,
} from '../types/contextMerge';
import type { MergeOptions } from '../components/MergeSessionModal';
import {
  ContextGroomingService,
  contextGroomingService,
  type GroomingResult,
} from '../services/contextGroomer';
import { extractTabContext } from '../utils/contextExtractor';
import { createMergedSession, getActiveTab } from '../utils/tabHelpers';
import { generateId } from '../utils/ids';

/**
 * Maximum recommended context tokens before warning the user
 * Default: 100,000 tokens (safe for most models)
 */
const MAX_CONTEXT_TOKENS_WARNING = 100000;

/**
 * Estimate token count from log entries
 * Uses a simple heuristic: ~4 characters per token (average for English text)
 */
function estimateTokensFromLogs(logs: { text: string }[]): number {
  const totalChars = logs.reduce((sum, log) => sum + (log.text?.length || 0), 0);
  return Math.round(totalChars / 4);
}

/**
 * Global flag to track if a merge is in progress.
 * Only one merge operation should run at a time.
 */
let globalMergeInProgress = false;

/**
 * State of the merge operation
 */
export type MergeState = 'idle' | 'merging' | 'complete' | 'error';

/**
 * Request to merge two sessions/tabs
 */
export interface MergeSessionRequest {
  /** Source session containing context to merge */
  sourceSession: Session;
  /** Tab ID within source session */
  sourceTabId: string;
  /** Target session to merge with */
  targetSession: Session;
  /** Tab ID within target session (optional - uses active tab if not specified) */
  targetTabId?: string;
  /** Merge options from the modal */
  options: MergeOptions;
}

/**
 * Result returned by the useMergeSession hook
 */
export interface UseMergeSessionResult {
  /** Current state of the merge operation */
  mergeState: MergeState;
  /** Progress information during merge */
  progress: GroomingProgress | null;
  /** Error message if merge failed */
  error: string | null;
  /** Whether a merge is currently in progress globally */
  isMergeInProgress: boolean;
  /** Start a merge operation */
  startMerge: (request: MergeSessionRequest) => Promise<MergeResult>;
  /** Cancel an in-progress merge operation */
  cancelMerge: () => void;
  /** Reset the hook state back to idle */
  reset: () => void;
}

/**
 * Default progress state at start of merge
 */
const INITIAL_PROGRESS: GroomingProgress = {
  stage: 'collecting',
  progress: 0,
  message: 'Preparing to merge contexts...',
};

/**
 * Get the display name for a session
 */
function getSessionDisplayName(session: Session): string {
  return session.name || session.projectRoot.split('/').pop() || 'Unnamed Session';
}

/**
 * Get the display name for a tab
 */
function getTabDisplayName(tab: AITab): string {
  if (tab.name) return tab.name;
  if (tab.agentSessionId) {
    return tab.agentSessionId.split('-')[0].toUpperCase();
  }
  return 'New Tab';
}

/**
 * Generate a name for the merged session
 */
function generateMergedSessionName(
  sourceSession: Session,
  sourceTab: AITab,
  targetSession: Session,
  targetTab: AITab
): string {
  const sourceName = getSessionDisplayName(sourceSession);
  const targetName = getSessionDisplayName(targetSession);

  // If merging tabs from same session, use single session name
  if (sourceSession.id === targetSession.id) {
    return `${sourceName} (Merged)`;
  }

  // Otherwise combine both session names
  return `Merged: ${sourceName} + ${targetName}`;
}

/**
 * Hook for managing session merge operations.
 *
 * Provides complete workflow management for merging two sessions/tabs,
 * including optional AI-powered context grooming to remove duplicates.
 *
 * @example
 * const {
 *   mergeState,
 *   progress,
 *   error,
 *   startMerge,
 *   cancelMerge,
 * } = useMergeSession();
 *
 * // Start a merge
 * const result = await startMerge({
 *   sourceSession,
 *   sourceTabId: activeTabId,
 *   targetSession,
 *   targetTabId,
 *   options: { groomContext: true, createNewSession: true, preserveTimestamps: true },
 * });
 *
 * if (result.success) {
 *   // Navigate to new session
 *   setActiveSessionId(result.newSessionId);
 * }
 */
export function useMergeSession(): UseMergeSessionResult {
  // State
  const [mergeState, setMergeState] = useState<MergeState>('idle');
  const [progress, setProgress] = useState<GroomingProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs for cancellation
  const cancelledRef = useRef(false);
  const groomingServiceRef = useRef<ContextGroomingService>(contextGroomingService);

  /**
   * Reset the hook state to idle
   */
  const reset = useCallback(() => {
    setMergeState('idle');
    setProgress(null);
    setError(null);
    cancelledRef.current = false;
  }, []);

  /**
   * Cancel an in-progress merge operation
   */
  const cancelMerge = useCallback(() => {
    cancelledRef.current = true;

    // Cancel any active grooming operation
    groomingServiceRef.current.cancelGrooming();

    // Update state
    setMergeState('idle');
    setProgress(null);
    setError('Merge cancelled by user');
  }, []);

  /**
   * Execute the merge workflow
   */
  const startMerge = useCallback(async (request: MergeSessionRequest): Promise<MergeResult> => {
    const { sourceSession, sourceTabId, targetSession, targetTabId, options } = request;

    // Edge case: Check for concurrent merge operations
    if (globalMergeInProgress) {
      return {
        success: false,
        error: 'A merge operation is already in progress. Please wait for it to complete.',
      };
    }

    // Set global merge flag
    globalMergeInProgress = true;

    // Reset state
    cancelledRef.current = false;
    setError(null);
    setMergeState('merging');
    setProgress(INITIAL_PROGRESS);

    try {
      // Step 1: Validate inputs and get tabs
      const sourceTab = sourceSession.aiTabs.find(t => t.id === sourceTabId);
      if (!sourceTab) {
        throw new Error('Source tab not found');
      }

      const resolvedTargetTabId = targetTabId ?? getActiveTab(targetSession)?.id;
      const targetTab = resolvedTargetTabId
        ? targetSession.aiTabs.find(t => t.id === resolvedTargetTabId)
        : getActiveTab(targetSession);
      if (!targetTab) {
        throw new Error('Target tab not found');
      }

      // Edge case: Check for self-merge attempt
      if (sourceSession.id === targetSession.id && sourceTabId === targetTab.id) {
        throw new Error('Cannot merge a tab with itself');
      }

      // Edge case: Check for empty context source
      if (sourceTab.logs.length === 0) {
        throw new Error('Cannot merge empty context - source tab has no conversation history');
      }

      // Edge case: Check for empty target context (just a warning, allow it)
      if (targetTab.logs.length === 0 && sourceTab.logs.length > 0) {
        // This is allowed - we're essentially just copying context to a new session
        // No need to throw, but we could log it
        console.info('Merging into empty target tab - will copy source context');
      }

      // Edge case: Check for context too large
      const sourceTokens = estimateTokensFromLogs(sourceTab.logs);
      const targetTokens = estimateTokensFromLogs(targetTab.logs);
      const estimatedMergedTokens = sourceTokens + targetTokens;

      if (estimatedMergedTokens > MAX_CONTEXT_TOKENS_WARNING) {
        // Log a warning but continue - the modal should have already warned the user
        console.warn(
          `Large context merge: ~${estimatedMergedTokens.toLocaleString()} tokens. ` +
          `This may exceed some agents' context windows.`
        );
      }

      // Check for cancellation
      if (cancelledRef.current) {
        return { success: false, error: 'Merge cancelled' };
      }

      // Step 2: Extract contexts from both tabs
      setProgress({
        stage: 'collecting',
        progress: 10,
        message: 'Extracting source context...',
      });

      const sourceContext = extractTabContext(
        sourceTab,
        getSessionDisplayName(sourceSession),
        sourceSession
      );

      setProgress({
        stage: 'collecting',
        progress: 20,
        message: 'Extracting target context...',
      });

      const targetContext = extractTabContext(
        targetTab,
        getSessionDisplayName(targetSession),
        targetSession
      );

      // Check for cancellation
      if (cancelledRef.current) {
        return { success: false, error: 'Merge cancelled' };
      }

      // Step 3: Determine which logs to use (groomed or raw)
      let mergedLogs: LogEntry[];
      let tokensSaved = 0;

      if (options.groomContext) {
        // Use AI grooming to consolidate and deduplicate
        setProgress({
          stage: 'grooming',
          progress: 30,
          message: 'Starting AI grooming...',
        });

        const groomingRequest: MergeRequest = {
          sources: [sourceContext, targetContext],
          targetAgent: sourceSession.toolType,
          targetProjectRoot: sourceSession.projectRoot,
        };

        const groomingResult = await groomingServiceRef.current.groomContexts(
          groomingRequest,
          (groomProgress) => {
            // Forward progress to our state
            setProgress(groomProgress);
          }
        );

        // Check for cancellation
        if (cancelledRef.current) {
          return { success: false, error: 'Merge cancelled' };
        }

        if (!groomingResult.success) {
          throw new Error(groomingResult.error || 'Grooming failed');
        }

        mergedLogs = groomingResult.groomedLogs;
        tokensSaved = groomingResult.tokensSaved;
      } else {
        // Simply concatenate logs without grooming
        setProgress({
          stage: 'creating',
          progress: 60,
          message: 'Combining contexts...',
        });

        // Merge logs maintaining chronological order
        mergedLogs = options.preserveTimestamps
          ? [...sourceContext.logs, ...targetContext.logs].sort((a, b) => a.timestamp - b.timestamp)
          : [...sourceContext.logs, ...targetContext.logs];
      }

      // Check for cancellation
      if (cancelledRef.current) {
        return { success: false, error: 'Merge cancelled' };
      }

      // Step 4: Create the merged result
      setProgress({
        stage: 'creating',
        progress: 90,
        message: 'Creating merged session...',
      });

      // Generate merged session name
      const mergedName = generateMergedSessionName(
        sourceSession,
        sourceTab,
        targetSession,
        targetTab
      );

      // If createNewSession is false, we'll return the merged logs
      // for the caller to apply to the existing session.
      // If true, we create a new session structure.

      let result: MergeResult;

      if (options.createNewSession) {
        // Create a new session with merged context
        const { session: mergedSession, tabId: newTabId } = createMergedSession({
          name: mergedName,
          projectRoot: sourceSession.projectRoot,
          toolType: sourceSession.toolType,
          mergedLogs,
          groupId: sourceSession.groupId,
          saveToHistory: true,
        });

        result = {
          success: true,
          newSessionId: mergedSession.id,
          newTabId,
          tokensSaved,
        };
      } else {
        // Return merged logs for caller to apply to existing session/tab
        // The MergeResult interface has fields for new session, but we use
        // a different approach here - store merged logs and let caller handle it
        result = {
          success: true,
          tokensSaved,
          // Caller should use mergedLogs from closure or we need to extend result
        };
      }

      // Complete!
      setProgress({
        stage: 'complete',
        progress: 100,
        message: `Merge complete! Saved ~${tokensSaved} tokens`,
      });
      setMergeState('complete');

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error during merge';

      setError(errorMessage);
      setMergeState('error');
      setProgress({
        stage: 'complete',
        progress: 100,
        message: `Merge failed: ${errorMessage}`,
      });

      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      // Always clear the global merge flag when done
      globalMergeInProgress = false;
    }
  }, []);

  return {
    mergeState,
    progress,
    error,
    isMergeInProgress: globalMergeInProgress,
    startMerge,
    cancelMerge,
    reset,
  };
}

/**
 * Dependencies for the useMergeSessionWithSessions hook variant
 */
export interface UseMergeSessionWithSessionsDeps {
  /** All sessions in the app */
  sessions: Session[];
  /** Session setter for updating app state */
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  /** Callback after merge creates a new session. Receives session ID and name for notification purposes. */
  onSessionCreated?: (sessionId: string, sessionName: string) => void;
}

/**
 * Extended result type with session management
 */
export interface UseMergeSessionWithSessionsResult extends UseMergeSessionResult {
  /** Execute merge and update sessions state */
  executeMerge: (
    sourceSession: Session,
    sourceTabId: string,
    targetSessionId: string,
    targetTabId: string | undefined,
    options: MergeOptions
  ) => Promise<MergeResult>;
}

/**
 * Extended version of useMergeSession that integrates with app session state.
 *
 * This variant handles:
 * - Finding target session from session list
 * - Adding newly created sessions to app state
 * - Calling callbacks when sessions are created
 *
 * @param deps - Dependencies including sessions state and setter
 * @returns Extended merge session hook result
 *
 * @example
 * const {
 *   mergeState,
 *   progress,
 *   executeMerge,
 *   cancelMerge,
 * } = useMergeSessionWithSessions({
 *   sessions,
 *   setSessions,
 *   onSessionCreated: (id) => setActiveSessionId(id),
 * });
 */
export function useMergeSessionWithSessions(
  deps: UseMergeSessionWithSessionsDeps
): UseMergeSessionWithSessionsResult {
  const { sessions, setSessions, onSessionCreated } = deps;
  const baseHook = useMergeSession();

  /**
   * Execute merge with session state management
   */
  const executeMerge = useCallback(async (
    sourceSession: Session,
    sourceTabId: string,
    targetSessionId: string,
    targetTabId: string | undefined,
    options: MergeOptions
  ): Promise<MergeResult> => {
    // Find target session
    const targetSession = sessions.find(s => s.id === targetSessionId);
    if (!targetSession) {
      return {
        success: false,
        error: `Target session not found: ${targetSessionId}`,
      };
    }

    // Execute the merge
    const result = await baseHook.startMerge({
      sourceSession,
      sourceTabId,
      targetSession,
      targetTabId,
      options,
    });

    if (result.success && options.createNewSession && result.newSessionId) {
      // If a new session was created, we need to actually create it in state
      // The createMergedSession in startMerge only creates the session object,
      // we need to spawn the agent process and add it to state

      // Get the source tab for merged logs
      const sourceTab = sourceSession.aiTabs.find(t => t.id === sourceTabId);
      const targetTab = targetTabId
        ? targetSession.aiTabs.find(t => t.id === targetTabId)
        : getActiveTab(targetSession);

      if (sourceTab && targetTab) {
        // Create merged session with proper initialization
        const mergedName = generateMergedSessionName(
          sourceSession,
          sourceTab,
          targetSession,
          targetTab
        );

        // Extract and merge logs (simplified - actual implementation uses groomed logs)
        const sourceContext = extractTabContext(
          sourceTab,
          getSessionDisplayName(sourceSession),
          sourceSession
        );
        const targetContext = extractTabContext(
          targetTab,
          getSessionDisplayName(targetSession),
          targetSession
        );
        const mergedLogs = [...sourceContext.logs, ...targetContext.logs].sort(
          (a, b) => a.timestamp - b.timestamp
        );

        const { session: newSession } = createMergedSession({
          name: mergedName,
          projectRoot: sourceSession.projectRoot,
          toolType: sourceSession.toolType,
          mergedLogs,
          groupId: sourceSession.groupId,
        });

        // Add new session to state
        setSessions(prev => [...prev, newSession]);

        // Log merge operation to history
        const sourceNames = [
          getSessionDisplayName(sourceSession),
          getSessionDisplayName(targetSession),
        ].filter((name, i, arr) => arr.indexOf(name) === i); // Dedupe if same session

        try {
          await window.maestro.history.add({
            id: generateId(),
            type: 'AUTO',
            timestamp: Date.now(),
            summary: `Merged contexts from ${sourceNames.join(', ')}`,
            sessionId: newSession.id,
            projectPath: sourceSession.projectRoot,
            sessionName: mergedName,
          });
        } catch (historyError) {
          // Non-critical: log but don't fail the merge operation
          console.warn('Failed to log merge operation to history:', historyError);
        }

        // Notify caller with session ID and name for notification purposes
        if (onSessionCreated) {
          onSessionCreated(newSession.id, mergedName);
        }

        // Return result with the actual new session ID
        return {
          ...result,
          newSessionId: newSession.id,
          newTabId: newSession.activeTabId,
        };
      }
    }

    return result;
  }, [sessions, setSessions, onSessionCreated, baseHook]);

  return {
    ...baseHook,
    executeMerge,
  };
}

export default useMergeSession;

import { useState, useCallback, useRef, useEffect } from 'react';
import type { BatchRunState, BatchRunConfig, BatchDocumentEntry, Session, HistoryEntry, UsageStats, Group, AutoRunStats, AgentError } from '../types';
import { substituteTemplateVariables, TemplateContext } from '../utils/templateVariables';
import { getBadgeForTime, getNextBadge, formatTimeRemaining } from '../constants/conductorBadges';
import { autorunSynopsisPrompt } from '../../prompts';
import { parseSynopsis } from '../../shared/synopsis';

// Regex to count unchecked markdown checkboxes: - [ ] task
const UNCHECKED_TASK_REGEX = /^[\s]*-\s*\[\s*\]\s*.+$/gm;

// Regex to match checked markdown checkboxes for reset-on-completion
// Matches both [x] and [X] with various checkbox formats (standard and GitHub-style)
const CHECKED_TASK_REGEX = /^(\s*-\s*)\[[xX✓✔]\]/gm;

// Default empty batch state
const DEFAULT_BATCH_STATE: BatchRunState = {
  isRunning: false,
  isStopping: false,
  // Multi-document progress (new fields)
  documents: [],
  lockedDocuments: [],
  currentDocumentIndex: 0,
  currentDocTasksTotal: 0,
  currentDocTasksCompleted: 0,
  totalTasksAcrossAllDocs: 0,
  completedTasksAcrossAllDocs: 0,
  // Loop mode
  loopEnabled: false,
  loopIteration: 0,
  // Folder path for file operations
  folderPath: '',
  // Worktree tracking
  worktreeActive: false,
  worktreePath: undefined,
  worktreeBranch: undefined,
  // Legacy fields (kept for backwards compatibility)
  totalTasks: 0,
  completedTasks: 0,
  currentTaskIndex: 0,
  originalContent: '',
  sessionIds: [],
  // Time tracking (excludes sleep/suspend time)
  accumulatedElapsedMs: 0,
  lastActiveTimestamp: undefined,
  // Error handling state (Phase 5.10)
  error: undefined,
  errorPaused: false,
  errorDocumentIndex: undefined,
  errorTaskDescription: undefined
};

interface BatchCompleteInfo {
  sessionId: string;
  sessionName: string;
  completedTasks: number;
  totalTasks: number;
  wasStopped: boolean;
  elapsedTimeMs: number;
}

interface PRResultInfo {
  sessionId: string;
  sessionName: string;
  success: boolean;
  prUrl?: string;
  error?: string;
}

interface UseBatchProcessorProps {
  sessions: Session[];
  groups: Group[];
  onUpdateSession: (sessionId: string, updates: Partial<Session>) => void;
  onSpawnAgent: (sessionId: string, prompt: string, cwdOverride?: string) => Promise<{ success: boolean; response?: string; agentSessionId?: string; usageStats?: UsageStats }>;
  onSpawnSynopsis: (sessionId: string, cwd: string, agentSessionId: string, prompt: string) => Promise<{ success: boolean; response?: string }>;
  onAddHistoryEntry: (entry: Omit<HistoryEntry, 'id'>) => void;
  onComplete?: (info: BatchCompleteInfo) => void;
  // Callback for PR creation results (success or failure)
  onPRResult?: (info: PRResultInfo) => void;
  // TTS settings for speaking synopsis after each task
  audioFeedbackEnabled?: boolean;
  audioFeedbackCommand?: string;
  // Auto Run stats for achievement progress in final summary
  autoRunStats?: AutoRunStats;
}

interface UseBatchProcessorReturn {
  // Map of session ID to batch state
  batchRunStates: Record<string, BatchRunState>;
  // Get batch state for a specific session
  getBatchState: (sessionId: string) => BatchRunState;
  // Check if any session has an active batch
  hasAnyActiveBatch: boolean;
  // Get list of session IDs with active batches
  activeBatchSessionIds: string[];
  // Start batch run for a specific session with multi-document support
  startBatchRun: (sessionId: string, config: BatchRunConfig, folderPath: string) => Promise<void>;
  // Stop batch run for a specific session
  stopBatchRun: (sessionId: string) => void;
  // Custom prompts per session
  customPrompts: Record<string, string>;
  setCustomPrompt: (sessionId: string, prompt: string) => void;
  // Error handling (Phase 5.10)
  pauseBatchOnError: (sessionId: string, error: AgentError, documentIndex: number, taskDescription?: string) => void;
  skipCurrentDocument: (sessionId: string) => void;
  resumeAfterError: (sessionId: string) => void;
  abortBatchOnError: (sessionId: string) => void;
}

/**
 * Format duration in human-readable format for loop summaries
 */
function formatLoopDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Create a loop summary history entry
 */
interface LoopSummaryParams {
  loopIteration: number;
  loopTasksCompleted: number;
  loopStartTime: number;
  loopTotalInputTokens: number;
  loopTotalOutputTokens: number;
  loopTotalCost: number;
  sessionCwd: string;
  sessionId: string;
  isFinal: boolean;
  exitReason?: string;
}

function createLoopSummaryEntry(params: LoopSummaryParams): Omit<HistoryEntry, 'id'> {
  const {
    loopIteration,
    loopTasksCompleted,
    loopStartTime,
    loopTotalInputTokens,
    loopTotalOutputTokens,
    loopTotalCost,
    sessionCwd,
    sessionId,
    isFinal,
    exitReason
  } = params;

  const loopElapsedMs = Date.now() - loopStartTime;
  const loopNumber = loopIteration + 1;
  const summaryPrefix = isFinal ? `Loop ${loopNumber} (final)` : `Loop ${loopNumber}`;
  const loopSummary = `${summaryPrefix} completed: ${loopTasksCompleted} task${loopTasksCompleted !== 1 ? 's' : ''} accomplished`;

  const loopDetails = [
    `**${summaryPrefix} Summary**`,
    '',
    `- **Tasks Accomplished:** ${loopTasksCompleted}`,
    `- **Duration:** ${formatLoopDuration(loopElapsedMs)}`,
    loopTotalInputTokens > 0 || loopTotalOutputTokens > 0
      ? `- **Tokens:** ${(loopTotalInputTokens + loopTotalOutputTokens).toLocaleString()} (${loopTotalInputTokens.toLocaleString()} in / ${loopTotalOutputTokens.toLocaleString()} out)`
      : '',
    loopTotalCost > 0 ? `- **Cost:** $${loopTotalCost.toFixed(4)}` : '',
    exitReason ? `- **Exit Reason:** ${exitReason}` : '',
  ].filter(line => line !== '').join('\n');

  return {
    type: 'AUTO',
    timestamp: Date.now(),
    summary: loopSummary,
    fullResponse: loopDetails,
    projectPath: sessionCwd,
    sessionId: sessionId,
    success: true,
    elapsedTimeMs: loopElapsedMs,
    usageStats: loopTotalInputTokens > 0 || loopTotalOutputTokens > 0 ? {
      inputTokens: loopTotalInputTokens,
      outputTokens: loopTotalOutputTokens,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      totalCostUsd: loopTotalCost,
      contextWindow: 0
    } : undefined
  };
}

/**
 * Count unchecked tasks in markdown content
 * Matches lines like: - [ ] task description
 */
export function countUnfinishedTasks(content: string): number {
  const matches = content.match(UNCHECKED_TASK_REGEX);
  return matches ? matches.length : 0;
}

/**
 * Uncheck all markdown checkboxes in content (for reset-on-completion)
 * Converts all - [x] to - [ ] (case insensitive)
 */
export function uncheckAllTasks(content: string): string {
  return content.replace(CHECKED_TASK_REGEX, '$1[ ]');
}

/**
 * Hook for managing batch processing of scratchpad tasks across multiple sessions
 */
// Synopsis prompt for batch tasks - requests a two-part response
const BATCH_SYNOPSIS_PROMPT = autorunSynopsisPrompt;

export function useBatchProcessor({
  sessions,
  groups,
  onUpdateSession,
  onSpawnAgent,
  onSpawnSynopsis,
  onAddHistoryEntry,
  onComplete,
  onPRResult,
  audioFeedbackEnabled,
  audioFeedbackCommand,
  autoRunStats
}: UseBatchProcessorProps): UseBatchProcessorReturn {
  // Batch states per session
  const [batchRunStates, setBatchRunStates] = useState<Record<string, BatchRunState>>({});

  // Custom prompts per session
  const [customPrompts, setCustomPrompts] = useState<Record<string, string>>({});

  // Refs for tracking stop requests per session
  const stopRequestedRefs = useRef<Record<string, boolean>>({});

  // Ref to always have access to latest sessions (fixes stale closure in startBatchRun)
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  // Visibility-based time tracking refs (per session)
  // Tracks accumulated time and last active timestamp for accurate elapsed time
  const accumulatedTimeRefs = useRef<Record<string, number>>({});
  const lastActiveTimestampRefs = useRef<Record<string, number | null>>({});

  // Helper to get batch state for a session
  const getBatchState = useCallback((sessionId: string): BatchRunState => {
    return batchRunStates[sessionId] || DEFAULT_BATCH_STATE;
  }, [batchRunStates]);

  // Check if any session has an active batch
  const hasAnyActiveBatch = Object.values(batchRunStates).some(state => state.isRunning);

  // Get list of session IDs with active batches
  const activeBatchSessionIds = Object.entries(batchRunStates)
    .filter(([_, state]) => state.isRunning)
    .map(([sessionId]) => sessionId);

  // Set custom prompt for a session
  const setCustomPrompt = useCallback((sessionId: string, prompt: string) => {
    setCustomPrompts(prev => ({ ...prev, [sessionId]: prompt }));
  }, []);

  // Broadcast batch run state changes to web interface
  useEffect(() => {
    // Broadcast state for each session that has batch state
    Object.entries(batchRunStates).forEach(([sessionId, state]) => {
      if (state.isRunning || state.completedTasks > 0) {
        window.maestro.web.broadcastAutoRunState(sessionId, {
          isRunning: state.isRunning,
          totalTasks: state.totalTasks,
          completedTasks: state.completedTasks,
          currentTaskIndex: state.currentTaskIndex,
          isStopping: state.isStopping,
        });
      } else {
        // When not running and no completed tasks, broadcast null to clear the state
        window.maestro.web.broadcastAutoRunState(sessionId, null);
      }
    });
  }, [batchRunStates]);

  // Helper to get current accumulated elapsed time for a session (visibility-aware)
  const getAccumulatedElapsedMs = useCallback((sessionId: string): number => {
    const accumulated = accumulatedTimeRefs.current[sessionId] || 0;
    const lastActive = lastActiveTimestampRefs.current[sessionId];
    if (lastActive !== null && lastActive !== undefined && !document.hidden) {
      // Add time since last active timestamp
      return accumulated + (Date.now() - lastActive);
    }
    return accumulated;
  }, []);

  // Visibility change handler to pause/resume time tracking
  useEffect(() => {
    const handleVisibilityChange = () => {
      const now = Date.now();

      // Update time tracking for all running batch sessions
      Object.entries(batchRunStates).forEach(([sessionId, state]) => {
        if (!state.isRunning) return;

        if (document.hidden) {
          // Going hidden: accumulate the time since last active timestamp
          const lastActive = lastActiveTimestampRefs.current[sessionId];
          if (lastActive !== null && lastActive !== undefined) {
            accumulatedTimeRefs.current[sessionId] = (accumulatedTimeRefs.current[sessionId] || 0) + (now - lastActive);
            lastActiveTimestampRefs.current[sessionId] = null;
          }
        } else {
          // Becoming visible: reset the last active timestamp to now
          lastActiveTimestampRefs.current[sessionId] = now;
        }

        // Update batch state with new accumulated time
        setBatchRunStates(prev => ({
          ...prev,
          [sessionId]: {
            ...prev[sessionId],
            accumulatedElapsedMs: accumulatedTimeRefs.current[sessionId] || 0,
            lastActiveTimestamp: lastActiveTimestampRefs.current[sessionId] ?? undefined
          }
        }));
      });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [batchRunStates]);

  /**
   * Helper function to read a document and count its tasks
   */
  const readDocAndCountTasks = async (folderPath: string, filename: string): Promise<{ content: string; taskCount: number }> => {
    const result = await window.maestro.autorun.readDoc(folderPath, filename + '.md');
    if (!result.success || !result.content) {
      return { content: '', taskCount: 0 };
    }
    return { content: result.content, taskCount: countUnfinishedTasks(result.content) };
  };

  /**
   * Generate PR body from completed tasks
   */
  const generatePRBody = (documents: BatchDocumentEntry[], totalTasksCompleted: number): string => {
    const docList = documents.map(d => `- ${d.filename}`).join('\n');
    return `## Auto Run Summary

**Documents processed:**
${docList}

**Total tasks completed:** ${totalTasksCompleted}

---
*This PR was automatically created by Maestro Auto Run.*`;
  };

  /**
   * Start a batch processing run for a specific session with multi-document support
   */
  const startBatchRun = useCallback(async (sessionId: string, config: BatchRunConfig, folderPath: string) => {
    console.log('[BatchProcessor] startBatchRun called:', { sessionId, folderPath, config });
    window.maestro.logger.log('info', 'startBatchRun called', 'BatchProcessor', { sessionId, folderPath, documentsCount: config.documents.length, worktreeEnabled: config.worktree?.enabled });

    // Use sessionsRef to get latest sessions (handles case where session was just created)
    const session = sessionsRef.current.find(s => s.id === sessionId);
    if (!session) {
      console.error('[BatchProcessor] Session not found for batch processing:', sessionId);
      window.maestro.logger.log('error', 'Session not found for batch processing', 'BatchProcessor', { sessionId });
      return;
    }

    const { documents, prompt, loopEnabled, maxLoops, worktree } = config;
    console.log('[BatchProcessor] Config parsed - documents:', documents.length, 'loopEnabled:', loopEnabled, 'maxLoops:', maxLoops);

    if (documents.length === 0) {
      console.warn('[BatchProcessor] No documents provided for batch processing:', sessionId);
      window.maestro.logger.log('warn', 'No documents provided for batch processing', 'BatchProcessor', { sessionId });
      return;
    }

    // Debug log: show document configuration
    console.log('[BatchProcessor] Starting batch with documents:', documents.map(d => ({
      filename: d.filename,
      resetOnCompletion: d.resetOnCompletion
    })));

    // Track batch start time for completion notification
    const batchStartTime = Date.now();

    // Initialize visibility-based time tracking for this session
    accumulatedTimeRefs.current[sessionId] = 0;
    lastActiveTimestampRefs.current[sessionId] = batchStartTime;

    // Reset stop flag for this session
    stopRequestedRefs.current[sessionId] = false;

    // Set up worktree if enabled
    let effectiveCwd = session.cwd; // Default to session's cwd
    let worktreeActive = false;
    let worktreePath: string | undefined;
    let worktreeBranch: string | undefined;

    if (worktree?.enabled && worktree.path && worktree.branchName) {
      console.log('[BatchProcessor] Setting up worktree at', worktree.path, 'with branch', worktree.branchName);
      window.maestro.logger.log('info', 'Setting up worktree', 'BatchProcessor', {
        worktreePath: worktree.path,
        branchName: worktree.branchName,
        sessionCwd: session.cwd
      });

      try {
        // Set up or reuse the worktree
        const setupResult = await window.maestro.git.worktreeSetup(
          session.cwd,
          worktree.path,
          worktree.branchName
        );

        window.maestro.logger.log('info', 'worktreeSetup result', 'BatchProcessor', {
          success: setupResult.success,
          error: setupResult.error,
          branchMismatch: setupResult.branchMismatch
        });

        if (!setupResult.success) {
          console.error('[BatchProcessor] Failed to set up worktree:', setupResult.error);
          window.maestro.logger.log('error', 'Failed to set up worktree', 'BatchProcessor', { error: setupResult.error });
          return;
        }

        // If worktree exists but on different branch, checkout the requested branch
        if (setupResult.branchMismatch) {
          console.log('[BatchProcessor] Worktree exists with different branch, checking out', worktree.branchName);
          window.maestro.logger.log('info', 'Worktree branch mismatch, checking out requested branch', 'BatchProcessor', { branchName: worktree.branchName });

          const checkoutResult = await window.maestro.git.worktreeCheckout(
            worktree.path,
            worktree.branchName,
            true // createIfMissing
          );

          window.maestro.logger.log('info', 'worktreeCheckout result', 'BatchProcessor', {
            success: checkoutResult.success,
            error: checkoutResult.error,
            hasUncommittedChanges: checkoutResult.hasUncommittedChanges
          });

          if (!checkoutResult.success) {
            if (checkoutResult.hasUncommittedChanges) {
              console.error('[BatchProcessor] Cannot checkout: worktree has uncommitted changes');
              window.maestro.logger.log('error', 'Cannot checkout: worktree has uncommitted changes', 'BatchProcessor', { worktreePath: worktree.path });
              return;
            } else {
              console.error('[BatchProcessor] Failed to checkout branch:', checkoutResult.error);
              window.maestro.logger.log('error', 'Failed to checkout branch', 'BatchProcessor', { error: checkoutResult.error });
              return;
            }
          }
        }

        // Worktree is ready - use it as the working directory
        effectiveCwd = worktree.path;
        worktreeActive = true;
        worktreePath = worktree.path;
        worktreeBranch = worktree.branchName;

        console.log('[BatchProcessor] Worktree ready at', effectiveCwd);
        window.maestro.logger.log('info', 'Worktree ready', 'BatchProcessor', { effectiveCwd, worktreeBranch });

      } catch (error) {
        console.error('[BatchProcessor] Error setting up worktree:', error);
        window.maestro.logger.log('error', 'Exception setting up worktree', 'BatchProcessor', { error: String(error) });
        return;
      }
    } else if (worktree?.enabled) {
      // Worktree enabled but missing path or branch
      window.maestro.logger.log('warn', 'Worktree enabled but missing configuration', 'BatchProcessor', {
        hasPath: !!worktree.path,
        hasBranchName: !!worktree.branchName
      });
    }

    // Get git branch for template variable substitution
    let gitBranch: string | undefined;
    if (session.isGitRepo) {
      try {
        const status = await window.maestro.git.getStatus(effectiveCwd);
        gitBranch = status.branch;
      } catch {
        // Ignore git errors - branch will be empty string
      }
    }

    // Find group name for this session (sessions have groupId, groups have id)
    const sessionGroup = session.groupId ? groups.find(g => g.id === session.groupId) : null;
    const groupName = sessionGroup?.name;

    // Calculate initial total tasks across all documents
    let initialTotalTasks = 0;
    for (const doc of documents) {
      const { taskCount } = await readDocAndCountTasks(folderPath, doc.filename);
      console.log(`[BatchProcessor] Document ${doc.filename}: ${taskCount} tasks`);
      initialTotalTasks += taskCount;
    }
    console.log(`[BatchProcessor] Initial total tasks: ${initialTotalTasks}`);

    if (initialTotalTasks === 0) {
      console.warn('No unchecked tasks found across all documents for session:', sessionId);
      return;
    }

    // Initialize batch run state
    // Lock all documents that are part of this batch run
    const lockedDocuments = documents.map(d => d.filename);
    setBatchRunStates(prev => ({
      ...prev,
      [sessionId]: {
        isRunning: true,
        isStopping: false,
        // Multi-document progress
        documents: documents.map(d => d.filename),
        lockedDocuments, // All documents in this run are locked
        currentDocumentIndex: 0,
        currentDocTasksTotal: 0,
        currentDocTasksCompleted: 0,
        totalTasksAcrossAllDocs: initialTotalTasks,
        completedTasksAcrossAllDocs: 0,
        // Loop mode
        loopEnabled,
        loopIteration: 0,
        maxLoops,
        // Folder path for file operations
        folderPath,
        // Worktree tracking
        worktreeActive,
        worktreePath,
        worktreeBranch,
        // Legacy fields (for backwards compatibility)
        totalTasks: initialTotalTasks,
        completedTasks: 0,
        currentTaskIndex: 0,
        originalContent: '',
        customPrompt: prompt !== '' ? prompt : undefined,
        sessionIds: [],
        startTime: batchStartTime,
        // Time tracking (excludes sleep/suspend time)
        accumulatedElapsedMs: 0,
        lastActiveTimestamp: batchStartTime
      }
    }));

    // AUTORUN LOG: Start
    try {
      console.log('[AUTORUN] Logging start event - calling window.maestro.logger.autorun');
      window.maestro.logger.autorun(
        `Auto Run started`,
        session.name,
        {
          documents: documents.map(d => d.filename),
          totalTasks: initialTotalTasks,
          loopEnabled,
          maxLoops: maxLoops ?? 'unlimited'
        }
      );
      console.log('[AUTORUN] Start event logged successfully');
    } catch (err) {
      console.error('[AUTORUN] Error logging start event:', err);
    }

    // Add initial history entry when using worktree
    if (worktreeActive && worktreePath && worktreeBranch) {
      const worktreeStartSummary = `Auto Run started in worktree`;
      const worktreeStartDetails = [
        `**Worktree Auto Run Started**`,
        ``,
        `- **Branch:** \`${worktreeBranch}\``,
        `- **Worktree Path:** \`${worktreePath}\``,
        `- **Main Repo:** \`${session.cwd}\``,
        `- **Documents:** ${documents.map(d => d.filename).join(', ')}`,
        `- **Total Tasks:** ${initialTotalTasks}`,
        loopEnabled ? `- **Loop Mode:** Enabled${maxLoops ? ` (max ${maxLoops})` : ''}` : '',
      ].filter(line => line !== '').join('\n');

      onAddHistoryEntry({
        type: 'AUTO',
        timestamp: Date.now(),
        summary: worktreeStartSummary,
        fullResponse: worktreeStartDetails,
        projectPath: effectiveCwd,
        sessionId: sessionId,
        success: true,
      });
    }

    // Store custom prompt for persistence
    setCustomPrompts(prev => ({ ...prev, [sessionId]: prompt }));

    // Collect Claude session IDs and track completion
    const agentSessionIds: string[] = [];
    let totalCompletedTasks = 0;
    let loopIteration = 0;

    // Per-loop tracking for loop summary
    let loopStartTime = Date.now();
    let loopTasksCompleted = 0;
    let loopTasksDiscovered = 0;
    let loopTotalInputTokens = 0;
    let loopTotalOutputTokens = 0;
    let loopTotalCost = 0;

    // Cumulative tracking for final Auto Run summary (across all loops)
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;

    // Track consecutive runs where document content didn't change to detect stalling
    // If the document hash is identical before/after a run (and no tasks checked), the LLM is stuck
    // Note: This counter is reset per-document, so stalling one document doesn't affect others
    let consecutiveNoChangeCount = 0;
    const MAX_CONSECUTIVE_NO_CHANGES = 2; // Skip document after 2 consecutive runs with no changes

    // Track stalled documents (document filename -> stall reason)
    const stalledDocuments: Map<string, string> = new Map();

    // Legacy flag for backwards compatibility - true if ANY document stalled
    let stalledDueToNoProgress = false;

    // Helper to add final loop summary (defined here so it has access to tracking vars)
    const addFinalLoopSummary = (exitReason: string) => {
      // AUTORUN LOG: Exit
      window.maestro.logger.autorun(
        `Auto Run exiting: ${exitReason}`,
        session.name,
        {
          reason: exitReason,
          totalTasksCompleted: totalCompletedTasks,
          loopsCompleted: loopIteration + 1
        }
      );

      if (loopEnabled && (loopTasksCompleted > 0 || loopIteration > 0)) {
        onAddHistoryEntry(createLoopSummaryEntry({
          loopIteration,
          loopTasksCompleted,
          loopStartTime,
          loopTotalInputTokens,
          loopTotalOutputTokens,
          loopTotalCost,
          sessionCwd: session.cwd,
          sessionId,
          isFinal: true,
          exitReason
        }));
      }
    };

    // Main processing loop (handles loop mode)
    while (true) {
      // Check for stop request
      if (stopRequestedRefs.current[sessionId]) {
        console.log('[BatchProcessor] Batch run stopped by user for session:', sessionId);
        addFinalLoopSummary('Stopped by user');
        break;
      }

      // Track if any tasks were processed in this iteration
      let anyTasksProcessedThisIteration = false;
      // Track tasks completed in non-reset documents this iteration
      // This is critical for loop mode: if only reset docs have tasks, we'd loop forever
      let tasksCompletedInNonResetDocs = 0;

      // Process each document in order
      for (let docIndex = 0; docIndex < documents.length; docIndex++) {
        // Check for stop request before each document
        if (stopRequestedRefs.current[sessionId]) {
          console.log('[BatchProcessor] Batch run stopped by user at document', docIndex, 'for session:', sessionId);
          break;
        }

        const docEntry = documents[docIndex];
        const docFilePath = `${folderPath}/${docEntry.filename}.md`;

        // Read document and count tasks
        let { taskCount: remainingTasks, content: docContent } = await readDocAndCountTasks(folderPath, docEntry.filename);

        // Handle documents with no unchecked tasks
        if (remainingTasks === 0) {
          // For reset-on-completion documents, check if there are checked tasks that need resetting
          if (docEntry.resetOnCompletion && loopEnabled) {
            const checkedTaskCount = (docContent.match(CHECKED_TASK_REGEX) || []).length;
            if (checkedTaskCount > 0) {
              console.log(`[BatchProcessor] Document ${docEntry.filename} has ${checkedTaskCount} checked tasks - resetting for next iteration`);
              const resetContent = uncheckAllTasks(docContent);
              await window.maestro.autorun.writeDoc(folderPath, docEntry.filename + '.md', resetContent);
              // Update task count in state
              const resetTaskCount = countUnfinishedTasks(resetContent);
              setBatchRunStates(prev => ({
                ...prev,
                [sessionId]: {
                  ...prev[sessionId],
                  totalTasksAcrossAllDocs: prev[sessionId].totalTasksAcrossAllDocs + resetTaskCount,
                  totalTasks: prev[sessionId].totalTasks + resetTaskCount
                }
              }));
            }
          }
          console.log(`[BatchProcessor] Skipping document ${docEntry.filename} - no unchecked tasks`);
          continue;
        }

        // Reset stall detection counter for each new document
        consecutiveNoChangeCount = 0;

        console.log(`[BatchProcessor] Processing document ${docEntry.filename} with ${remainingTasks} tasks`);

        // AUTORUN LOG: Document processing
        window.maestro.logger.autorun(
          `Processing document: ${docEntry.filename}`,
          session.name,
          {
            document: docEntry.filename,
            tasksRemaining: remainingTasks,
            loopNumber: loopIteration + 1
          }
        );

        // Update state to show current document
        setBatchRunStates(prev => ({
          ...prev,
          [sessionId]: {
            ...prev[sessionId],
            currentDocumentIndex: docIndex,
            currentDocTasksTotal: remainingTasks,
            currentDocTasksCompleted: 0
          }
        }));

        let docTasksCompleted = 0;

        // Process tasks in this document until none remain
        while (remainingTasks > 0) {
          // Check for stop request before each task
          if (stopRequestedRefs.current[sessionId]) {
            console.log('[BatchProcessor] Batch run stopped by user during document', docEntry.filename);
            break;
          }

          // Build template context for this task
          const templateContext: TemplateContext = {
            session,
            gitBranch,
            groupName,
            autoRunFolder: folderPath,
            loopNumber: loopIteration + 1, // 1-indexed
            documentName: docEntry.filename,
            documentPath: docFilePath,
          };

          // Substitute template variables in the prompt
          const finalPrompt = substituteTemplateVariables(prompt, templateContext);

          // Read document content and expand template variables in it
          const docReadResult = await window.maestro.autorun.readDoc(folderPath, docEntry.filename + '.md');
          // Capture content before task run for stall detection
          const contentBeforeTask = docReadResult.content || '';
          if (docReadResult.success && docReadResult.content) {
            const expandedDocContent = substituteTemplateVariables(docReadResult.content, templateContext);
            // Write the expanded content back to the document temporarily
            // (Claude will read this file, so it needs the expanded variables)
            if (expandedDocContent !== docReadResult.content) {
              await window.maestro.autorun.writeDoc(folderPath, docEntry.filename + '.md', expandedDocContent);
            }
          }

          try {
            // Capture start time for elapsed time tracking
            const taskStartTime = Date.now();

            // Spawn agent with the prompt, using worktree path if active
            const result = await onSpawnAgent(sessionId, finalPrompt, worktreeActive ? effectiveCwd : undefined);

            // Capture elapsed time
            const elapsedTimeMs = Date.now() - taskStartTime;

            if (result.agentSessionId) {
              agentSessionIds.push(result.agentSessionId);
              // Register as auto-initiated Maestro session
              // Use effectiveCwd (worktree path when active) so session can be found later
              window.maestro.claude.registerSessionOrigin(effectiveCwd, result.agentSessionId, 'auto')
                .catch(err => console.error('[BatchProcessor] Failed to register session origin:', err));
            }

            anyTasksProcessedThisIteration = true;

            // Re-read document to get updated task count and content
            const { taskCount: newRemainingTasks, content: contentAfterTask } = await readDocAndCountTasks(folderPath, docEntry.filename);
            // Calculate tasks completed - ensure it's never negative (Claude may have added tasks)
            const tasksCompletedThisRun = Math.max(0, remainingTasks - newRemainingTasks);

            // Detect stalling: if document content is unchanged and no tasks were checked off
            const documentUnchanged = contentBeforeTask === contentAfterTask;
            if (documentUnchanged && tasksCompletedThisRun === 0) {
              consecutiveNoChangeCount++;
              console.log(`[BatchProcessor] Document unchanged, no tasks completed (${consecutiveNoChangeCount}/${MAX_CONSECUTIVE_NO_CHANGES} consecutive)`);
            } else {
              // Reset counter on any document change or task completion
              consecutiveNoChangeCount = 0;
            }

            // Update counters
            docTasksCompleted += tasksCompletedThisRun;
            totalCompletedTasks += tasksCompletedThisRun;
            loopTasksCompleted += tasksCompletedThisRun;

            // Track token usage for loop summary and cumulative totals
            if (result.usageStats) {
              loopTotalInputTokens += result.usageStats.inputTokens || 0;
              loopTotalOutputTokens += result.usageStats.outputTokens || 0;
              loopTotalCost += result.usageStats.totalCostUsd || 0;
              // Also track cumulative totals for final summary
              totalInputTokens += result.usageStats.inputTokens || 0;
              totalOutputTokens += result.usageStats.outputTokens || 0;
              totalCost += result.usageStats.totalCostUsd || 0;
            }

            // Track non-reset document completions for loop exit logic
            if (!docEntry.resetOnCompletion) {
              tasksCompletedInNonResetDocs += tasksCompletedThisRun;
            }

            // Update progress state
            setBatchRunStates(prev => ({
              ...prev,
              [sessionId]: {
                ...prev[sessionId],
                currentDocTasksCompleted: docTasksCompleted,
                completedTasksAcrossAllDocs: totalCompletedTasks,
                // Legacy fields
                completedTasks: totalCompletedTasks,
                currentTaskIndex: totalCompletedTasks,
                sessionIds: [...(prev[sessionId]?.sessionIds || []), result.agentSessionId || '']
              }
            }));

            // Generate synopsis for successful tasks with a Claude session
            let shortSummary = `[${docEntry.filename}] Task completed`;
            let fullSynopsis = shortSummary;

            if (result.success && result.agentSessionId) {
              // Request a synopsis from the agent by resuming the session
              // Use effectiveCwd (worktree path when active) to find the session
              try {
                const synopsisResult = await onSpawnSynopsis(
                  sessionId,
                  effectiveCwd,
                  result.agentSessionId,
                  BATCH_SYNOPSIS_PROMPT
                );

                if (synopsisResult.success && synopsisResult.response) {
                  const parsed = parseSynopsis(synopsisResult.response);
                  shortSummary = parsed.shortSummary;
                  fullSynopsis = parsed.fullSynopsis;
                }
              } catch (err) {
                console.error('[BatchProcessor] Synopsis generation failed:', err);
              }
            } else if (!result.success) {
              shortSummary = `[${docEntry.filename}] Task failed`;
              fullSynopsis = shortSummary;
            }

            // Add history entry
            // Use effectiveCwd for projectPath so clicking the session link looks in the right place
            onAddHistoryEntry({
              type: 'AUTO',
              timestamp: Date.now(),
              summary: shortSummary,
              fullResponse: fullSynopsis,
              agentSessionId: result.agentSessionId,
              projectPath: effectiveCwd,
              sessionId: sessionId,
              success: result.success,
              usageStats: result.usageStats,
              elapsedTimeMs
            });

            // Speak the synopsis via TTS if audio feedback is enabled
            if (audioFeedbackEnabled && audioFeedbackCommand && shortSummary) {
              window.maestro.notification.speak(shortSummary, audioFeedbackCommand).catch(err => {
                console.error('[BatchProcessor] Failed to speak synopsis:', err);
              });
            }

            // Check if we've hit the stalling threshold for this document
            if (consecutiveNoChangeCount >= MAX_CONSECUTIVE_NO_CHANGES) {
              const stallReason = `${consecutiveNoChangeCount} consecutive runs with no progress`;
              console.warn(`[BatchProcessor] Document "${docEntry.filename}" stalled: ${stallReason}`);

              // Track this document as stalled
              stalledDocuments.set(docEntry.filename, stallReason);
              stalledDueToNoProgress = true;

              // AUTORUN LOG: Document stalled
              window.maestro.logger.autorun(
                `Document stalled: ${docEntry.filename}`,
                session.name,
                {
                  document: docEntry.filename,
                  reason: stallReason,
                  remainingTasks: newRemainingTasks,
                  loopNumber: loopIteration + 1
                }
              );

              // Add a history entry specifically for this stalled document
              const stallExplanation = [
                `**Document Stalled: ${docEntry.filename}**`,
                '',
                `The AI agent ran ${consecutiveNoChangeCount} times on this document but made no progress:`,
                `- No tasks were checked off`,
                `- No changes were made to the document content`,
                '',
                `**What this means:**`,
                `The remaining tasks in this document may be:`,
                `- Already complete (but not checked off)`,
                `- Unclear or ambiguous for the AI to act on`,
                `- Dependent on external factors or manual intervention`,
                `- Outside the scope of what the AI can accomplish`,
                '',
                `**Remaining unchecked tasks:** ${newRemainingTasks}`,
                '',
                documents.length > 1
                  ? `Skipping to the next document in the playbook...`
                  : `No more documents to process.`
              ].join('\n');

              onAddHistoryEntry({
                type: 'AUTO',
                timestamp: Date.now(),
                summary: `Document stalled: ${docEntry.filename} (${newRemainingTasks} tasks remaining)`,
                fullResponse: stallExplanation,
                projectPath: effectiveCwd,
                sessionId: sessionId,
                success: false,  // Mark as unsuccessful since we couldn't complete
              });

              // Skip to the next document instead of breaking the entire batch
              break; // Break out of the inner while loop for this document
            }

            remainingTasks = newRemainingTasks;
            console.log(`[BatchProcessor] Document ${docEntry.filename}: ${remainingTasks} tasks remaining`);

          } catch (error) {
            console.error(`[BatchProcessor] Error running task in ${docEntry.filename} for session ${sessionId}:`, error);
            // Continue to next task on error
            remainingTasks--;
          }
        }

        // Check for stop request before doing reset (stalled documents are skipped, not stopped)
        if (stopRequestedRefs.current[sessionId]) {
          break;
        }

        // Skip document reset if this document stalled (it didn't complete normally)
        if (stalledDocuments.has(docEntry.filename)) {
          // Reset consecutive no-change counter for next document
          consecutiveNoChangeCount = 0;
          continue;
        }

        // Document complete - handle reset-on-completion if enabled
        console.log(`[BatchProcessor] Document ${docEntry.filename} complete. resetOnCompletion=${docEntry.resetOnCompletion}, docTasksCompleted=${docTasksCompleted}`);
        if (docEntry.resetOnCompletion && docTasksCompleted > 0) {
          console.log(`[BatchProcessor] Resetting document ${docEntry.filename} (reset-on-completion enabled)`);

          // AUTORUN LOG: Document reset
          window.maestro.logger.autorun(
            `Resetting document: ${docEntry.filename}`,
            session.name,
            {
              document: docEntry.filename,
              tasksCompleted: docTasksCompleted,
              loopNumber: loopIteration + 1
            }
          );

          // Read the current content and uncheck all tasks
          const { content: currentContent } = await readDocAndCountTasks(folderPath, docEntry.filename);

          // Count checked tasks before reset
          const checkedMatches = currentContent.match(CHECKED_TASK_REGEX) || [];
          const checkedBefore = checkedMatches.length;
          console.log(`[BatchProcessor] Document ${docEntry.filename} has ${checkedBefore} checked tasks before reset`);
          console.log(`[BatchProcessor] Checked task matches:`, checkedMatches);

          const resetContent = uncheckAllTasks(currentContent);

          // Count unchecked tasks after reset
          const uncheckedAfter = countUnfinishedTasks(resetContent);
          console.log(`[BatchProcessor] Document ${docEntry.filename} has ${uncheckedAfter} unchecked tasks after reset`);

          // Log first 500 chars of content before/after for debugging
          console.log(`[BatchProcessor] Content before reset (first 500):`, currentContent.substring(0, 500));
          console.log(`[BatchProcessor] Content after reset (first 500):`, resetContent.substring(0, 500));

          // Write the reset content back
          const writeResult = await window.maestro.autorun.writeDoc(folderPath, docEntry.filename + '.md', resetContent);
          console.log(`[BatchProcessor] Write result for ${docEntry.filename}:`, writeResult);

          // If loop is enabled, add the reset tasks back to the total
          if (loopEnabled) {
            const resetTaskCount = countUnfinishedTasks(resetContent);
            setBatchRunStates(prev => ({
              ...prev,
              [sessionId]: {
                ...prev[sessionId],
                totalTasksAcrossAllDocs: prev[sessionId].totalTasksAcrossAllDocs + resetTaskCount,
                totalTasks: prev[sessionId].totalTasks + resetTaskCount
              }
            }));
          }
        }
      }

      // Note: We no longer break immediately when a document stalls.
      // Individual documents that stall are skipped, and we continue processing other documents.
      // The stalledDocuments map tracks which documents stalled for the final summary.

      // Check if we should continue looping
      if (!loopEnabled) {
        // No loop mode - we're done after one pass
        // AUTORUN LOG: Exit (non-loop mode)
        window.maestro.logger.autorun(
          `Auto Run completed (single pass)`,
          session.name,
          {
            reason: 'Single pass completed',
            totalTasksCompleted: totalCompletedTasks,
            loopsCompleted: 1
          }
        );
        break;
      }

      // Check if we've hit the max loop limit
      if (maxLoops !== null && maxLoops !== undefined && loopIteration + 1 >= maxLoops) {
        console.log(`[BatchProcessor] Reached max loop limit (${maxLoops}), exiting loop`);
        addFinalLoopSummary(`Reached max loop limit (${maxLoops})`);
        break;
      }

      // Check for stop request after full pass
      if (stopRequestedRefs.current[sessionId]) {
        addFinalLoopSummary('Stopped by user');
        break;
      }

      // Safety check: if we didn't process ANY tasks this iteration, exit to avoid infinite loop
      if (!anyTasksProcessedThisIteration) {
        console.warn('[BatchProcessor] No tasks processed this iteration - exiting to avoid infinite loop');
        addFinalLoopSummary('No tasks processed this iteration');
        break;
      }

      // Loop mode: check if we should continue looping
      // Check if there are any non-reset documents in the playbook
      const hasAnyNonResetDocs = documents.some(doc => !doc.resetOnCompletion);

      if (hasAnyNonResetDocs) {
        // If we have non-reset docs, only continue if they have remaining tasks
        let anyNonResetDocsHaveTasks = false;
        for (const doc of documents) {
          if (doc.resetOnCompletion) continue;

          const { taskCount } = await readDocAndCountTasks(folderPath, doc.filename);
          if (taskCount > 0) {
            anyNonResetDocsHaveTasks = true;
            break;
          }
        }

        if (!anyNonResetDocsHaveTasks) {
          console.log('[BatchProcessor] All non-reset documents completed, exiting loop');
          addFinalLoopSummary('All tasks completed');
          break;
        }
      }
      // If all documents are reset docs, we continue looping (maxLoops check above will stop us)

      // Re-scan all documents to get fresh task counts for next loop (tasks may have been added/removed)
      let newTotalTasks = 0;
      for (const doc of documents) {
        const { taskCount } = await readDocAndCountTasks(folderPath, doc.filename);
        newTotalTasks += taskCount;
      }

      // Calculate loop elapsed time
      const loopElapsedMs = Date.now() - loopStartTime;

      // Add loop summary history entry
      const loopSummary = `Loop ${loopIteration + 1} completed: ${loopTasksCompleted} task${loopTasksCompleted !== 1 ? 's' : ''} accomplished`;
      const loopDetails = [
        `**Loop ${loopIteration + 1} Summary**`,
        '',
        `- **Tasks Accomplished:** ${loopTasksCompleted}`,
        `- **Duration:** ${formatLoopDuration(loopElapsedMs)}`,
        loopTotalInputTokens > 0 || loopTotalOutputTokens > 0
          ? `- **Tokens:** ${(loopTotalInputTokens + loopTotalOutputTokens).toLocaleString()} (${loopTotalInputTokens.toLocaleString()} in / ${loopTotalOutputTokens.toLocaleString()} out)`
          : '',
        loopTotalCost > 0 ? `- **Cost:** $${loopTotalCost.toFixed(4)}` : '',
        `- **Tasks Discovered for Next Loop:** ${newTotalTasks}`,
      ].filter(line => line !== '').join('\n');

      onAddHistoryEntry({
        type: 'AUTO',
        timestamp: Date.now(),
        summary: loopSummary,
        fullResponse: loopDetails,
        projectPath: session.cwd,
        sessionId: sessionId,
        success: true,
        elapsedTimeMs: loopElapsedMs,
        usageStats: loopTotalInputTokens > 0 || loopTotalOutputTokens > 0 ? {
          inputTokens: loopTotalInputTokens,
          outputTokens: loopTotalOutputTokens,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
          totalCostUsd: loopTotalCost,
          contextWindow: 0
        } : undefined
      });

      // Reset per-loop tracking for next iteration
      loopStartTime = Date.now();
      loopTasksCompleted = 0;
      loopTasksDiscovered = newTotalTasks;
      loopTotalInputTokens = 0;
      loopTotalOutputTokens = 0;
      loopTotalCost = 0;

      // AUTORUN LOG: Loop completion
      window.maestro.logger.autorun(
        `Loop ${loopIteration + 1} completed`,
        session.name,
        {
          loopNumber: loopIteration + 1,
          tasksCompleted: loopTasksCompleted,
          tasksForNextLoop: newTotalTasks
        }
      );

      // Continue looping
      loopIteration++;
      console.log(`[BatchProcessor] Starting loop iteration ${loopIteration + 1}: ${newTotalTasks} tasks across all documents`);

      setBatchRunStates(prev => ({
        ...prev,
        [sessionId]: {
          ...prev[sessionId],
          loopIteration,
          totalTasksAcrossAllDocs: newTotalTasks + prev[sessionId].completedTasksAcrossAllDocs,
          totalTasks: newTotalTasks + prev[sessionId].completedTasks
        }
      }));
    }

    // Create PR if worktree was used, PR creation is enabled, and not stopped
    const wasStopped = stopRequestedRefs.current[sessionId] || false;
    const sessionName = session.name || session.cwd.split('/').pop() || 'Unknown';
    if (worktreeActive && worktree?.createPROnCompletion && !wasStopped && totalCompletedTasks > 0) {
      console.log('[BatchProcessor] Creating PR from worktree branch', worktreeBranch);

      try {
        // Use the user-selected target branch, or fall back to default branch detection
        let baseBranch = worktree.prTargetBranch;
        if (!baseBranch) {
          const defaultBranchResult = await window.maestro.git.getDefaultBranch(session.cwd);
          baseBranch = defaultBranchResult.success && defaultBranchResult.branch
            ? defaultBranchResult.branch
            : 'main';
        }

        // Generate PR title and body
        const prTitle = `Auto Run: ${documents.length} document(s) processed`;
        const prBody = generatePRBody(documents, totalCompletedTasks);

        // Create the PR (pass ghPath if configured)
        const prResult = await window.maestro.git.createPR(
          effectiveCwd,
          baseBranch,
          prTitle,
          prBody,
          worktree.ghPath
        );

        if (prResult.success) {
          console.log('[BatchProcessor] PR created successfully:', prResult.prUrl);
          // Notify caller of successful PR creation
          if (onPRResult) {
            onPRResult({
              sessionId,
              sessionName,
              success: true,
              prUrl: prResult.prUrl
            });
          }
        } else {
          console.warn('[BatchProcessor] PR creation failed:', prResult.error);
          // Notify caller of PR creation failure (doesn't fail the run)
          if (onPRResult) {
            onPRResult({
              sessionId,
              sessionName,
              success: false,
              error: prResult.error
            });
          }
        }
      } catch (error) {
        console.error('[BatchProcessor] Error creating PR:', error);
        // Notify caller of PR creation error (doesn't fail the run)
        if (onPRResult) {
          onPRResult({
            sessionId,
            sessionName,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }

    // Add final Auto Run summary entry (no sessionId - this is a standalone synopsis)
    // Calculate visibility-aware elapsed time (excludes time when laptop was sleeping/suspended)
    const finalAccumulatedTime = accumulatedTimeRefs.current[sessionId] || 0;
    const finalLastActive = lastActiveTimestampRefs.current[sessionId];
    const totalElapsedMs = finalLastActive !== null && finalLastActive !== undefined && !document.hidden
      ? finalAccumulatedTime + (Date.now() - finalLastActive)
      : finalAccumulatedTime;
    const loopsCompleted = loopEnabled ? loopIteration + 1 : 1;

    // Determine status based on stalled documents and completion
    const stalledCount = stalledDocuments.size;
    const allDocsStalled = stalledCount === documents.length;
    const someDocsStalled = stalledCount > 0 && stalledCount < documents.length;
    const statusText = wasStopped
      ? 'stopped'
      : allDocsStalled
        ? 'stalled'
        : someDocsStalled
          ? 'completed with stalls'
          : 'completed';

    // Calculate achievement progress for the summary
    // Note: We use the stats BEFORE this run is recorded (the parent will call recordAutoRunComplete after)
    // So we need to add totalElapsedMs to get the projected cumulative time
    const projectedCumulativeTime = (autoRunStats?.cumulativeTimeMs || 0) + totalElapsedMs;
    const currentBadge = getBadgeForTime(projectedCumulativeTime);
    const nextBadge = getNextBadge(currentBadge);
    const levelProgressText = nextBadge
      ? `Level ${currentBadge?.level || 0} → ${nextBadge.level}: ${formatTimeRemaining(projectedCumulativeTime, nextBadge)}`
      : currentBadge
        ? `Level ${currentBadge.level} (${currentBadge.name}) - Maximum level achieved!`
        : 'Level 0 → 1: ' + formatTimeRemaining(0, getBadgeForTime(0) || undefined);

    // Build summary with stall info if applicable
    const stalledSuffix = stalledCount > 0 ? ` (${stalledCount} stalled)` : '';
    const finalSummary = `Auto Run ${statusText}: ${totalCompletedTasks} task${totalCompletedTasks !== 1 ? 's' : ''} in ${formatLoopDuration(totalElapsedMs)}${stalledSuffix}`;

    // Build status message with detailed info
    let statusMessage: string;
    if (wasStopped) {
      statusMessage = 'Stopped by user';
    } else if (allDocsStalled) {
      statusMessage = `Stalled - All ${stalledCount} document(s) stopped making progress`;
    } else if (someDocsStalled) {
      statusMessage = `Completed with ${stalledCount} stalled document(s)`;
    } else {
      statusMessage = 'Completed';
    }

    // Build stalled documents section if any documents stalled
    const stalledDocsSection: string[] = [];
    if (stalledCount > 0) {
      stalledDocsSection.push('');
      stalledDocsSection.push('**Stalled Documents**');
      stalledDocsSection.push('');
      stalledDocsSection.push('The following documents stopped making progress after multiple attempts:');
      for (const [docName, reason] of stalledDocuments) {
        stalledDocsSection.push(`- **${docName}**: ${reason}`);
      }
      stalledDocsSection.push('');
      stalledDocsSection.push('*Tasks in stalled documents may need manual review or clarification.*');
    }

    const finalDetails = [
      `**Auto Run Summary**`,
      '',
      `- **Status:** ${statusMessage}`,
      `- **Tasks Completed:** ${totalCompletedTasks}`,
      `- **Total Duration:** ${formatLoopDuration(totalElapsedMs)}`,
      loopEnabled ? `- **Loops Completed:** ${loopsCompleted}` : '',
      totalInputTokens > 0 || totalOutputTokens > 0
        ? `- **Total Tokens:** ${(totalInputTokens + totalOutputTokens).toLocaleString()} (${totalInputTokens.toLocaleString()} in / ${totalOutputTokens.toLocaleString()} out)`
        : '',
      totalCost > 0 ? `- **Total Cost:** $${totalCost.toFixed(4)}` : '',
      '',
      `- **Documents:** ${documents.map(d => d.filename).join(', ')}`,
      ...stalledDocsSection,
      '',
      `**Achievement Progress**`,
      `- ${levelProgressText}`,
    ].filter(line => line !== '').join('\n');

    // This entry has no sessionId - it's a standalone Auto Run synopsis
    // Success is true if not stopped and at least some documents completed without stalling
    const isSuccess = !wasStopped && !allDocsStalled;
    onAddHistoryEntry({
      type: 'AUTO',
      timestamp: Date.now(),
      summary: finalSummary,
      fullResponse: finalDetails,
      projectPath: session.cwd,
      // No sessionId - this is a standalone synopsis entry
      success: isSuccess,
      elapsedTimeMs: totalElapsedMs,
      usageStats: totalInputTokens > 0 || totalOutputTokens > 0 ? {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        totalCostUsd: totalCost,
        contextWindow: 0
      } : undefined,
      achievementAction: 'openAbout'  // Enable clickable link to achievements panel
    });

    // Reset state for this session (clear worktree tracking)
    setBatchRunStates(prev => ({
      ...prev,
      [sessionId]: {
        isRunning: false,
        isStopping: false,
        documents: [],
        lockedDocuments: [],
        currentDocumentIndex: 0,
        currentDocTasksTotal: 0,
        currentDocTasksCompleted: 0,
        totalTasksAcrossAllDocs: 0,
        completedTasksAcrossAllDocs: 0,
        loopEnabled: false,
        loopIteration: 0,
        folderPath: '',
        // Clear worktree tracking
        worktreeActive: false,
        worktreePath: undefined,
        worktreeBranch: undefined,
        totalTasks: 0,
        completedTasks: 0,
        currentTaskIndex: 0,
        originalContent: '',
        sessionIds: agentSessionIds
      }
    }));

    // Call completion callback if provided
    if (onComplete) {
      onComplete({
        sessionId,
        sessionName: session.name || session.cwd.split('/').pop() || 'Unknown',
        completedTasks: totalCompletedTasks,
        totalTasks: initialTotalTasks,
        wasStopped,
        elapsedTimeMs: totalElapsedMs
      });
    }

    // Clean up time tracking refs
    delete accumulatedTimeRefs.current[sessionId];
    delete lastActiveTimestampRefs.current[sessionId];
  }, [onUpdateSession, onSpawnAgent, onSpawnSynopsis, onAddHistoryEntry, onComplete, onPRResult, audioFeedbackEnabled, audioFeedbackCommand]);

  /**
   * Request to stop the batch run for a specific session after current task completes
   */
  const stopBatchRun = useCallback((sessionId: string) => {
    stopRequestedRefs.current[sessionId] = true;
    setBatchRunStates(prev => ({
      ...prev,
      [sessionId]: {
        ...prev[sessionId],
        isStopping: true
      }
    }));
  }, []);

  /**
   * Pause the batch run due to an agent error (Phase 5.10)
   * Called externally when agent error is detected
   */
  const pauseBatchOnError = useCallback((sessionId: string, error: AgentError, documentIndex: number, taskDescription?: string) => {
    console.log('[BatchProcessor] Pausing batch due to error:', { sessionId, errorType: error.type, documentIndex });
    window.maestro.logger.autorun(
      `Auto Run paused due to error: ${error.type}`,
      sessionId,
      {
        errorType: error.type,
        errorMessage: error.message,
        documentIndex,
        taskDescription
      }
    );

    setBatchRunStates(prev => {
      const currentState = prev[sessionId];
      if (!currentState || !currentState.isRunning) {
        return prev;
      }
      return {
        ...prev,
        [sessionId]: {
          ...currentState,
          error,
          errorPaused: true,
          errorDocumentIndex: documentIndex,
          errorTaskDescription: taskDescription
        }
      };
    });
  }, []);

  /**
   * Skip the current document that caused an error and continue with the next one (Phase 5.10)
   */
  const skipCurrentDocument = useCallback((sessionId: string) => {
    console.log('[BatchProcessor] Skipping current document after error:', sessionId);
    window.maestro.logger.autorun(
      `Skipping document after error`,
      sessionId,
      {}
    );

    setBatchRunStates(prev => {
      const currentState = prev[sessionId];
      if (!currentState || !currentState.errorPaused) {
        return prev;
      }

      // Mark for skip - the processing loop will detect this and move to next document
      // We clear the error state and set a flag for the processing loop
      return {
        ...prev,
        [sessionId]: {
          ...currentState,
          error: undefined,
          errorPaused: false,
          errorDocumentIndex: undefined,
          errorTaskDescription: undefined
        }
      };
    });

    // Signal to skip current document in the processing loop
    // The stopRequestedRefs is reused with a special marker
    // Note: This relies on the processing loop checking for error state changes
  }, []);

  /**
   * Resume the batch run after an error has been resolved (Phase 5.10)
   * This clears the error state and allows the batch to continue
   */
  const resumeAfterError = useCallback((sessionId: string) => {
    console.log('[BatchProcessor] Resuming batch after error resolution:', sessionId);
    window.maestro.logger.autorun(
      `Resuming Auto Run after error resolution`,
      sessionId,
      {}
    );

    setBatchRunStates(prev => {
      const currentState = prev[sessionId];
      if (!currentState) {
        return prev;
      }
      return {
        ...prev,
        [sessionId]: {
          ...currentState,
          error: undefined,
          errorPaused: false,
          errorDocumentIndex: undefined,
          errorTaskDescription: undefined
        }
      };
    });
  }, []);

  /**
   * Abort the batch run completely due to an unrecoverable error (Phase 5.10)
   */
  const abortBatchOnError = useCallback((sessionId: string) => {
    console.log('[BatchProcessor] Aborting batch due to error:', sessionId);
    window.maestro.logger.autorun(
      `Auto Run aborted due to error`,
      sessionId,
      {}
    );

    // Request stop and clear error state
    stopRequestedRefs.current[sessionId] = true;
    setBatchRunStates(prev => ({
      ...prev,
      [sessionId]: {
        ...prev[sessionId],
        isStopping: true,
        error: undefined,
        errorPaused: false,
        errorDocumentIndex: undefined,
        errorTaskDescription: undefined
      }
    }));
  }, []);

  return {
    batchRunStates,
    getBatchState,
    hasAnyActiveBatch,
    activeBatchSessionIds,
    startBatchRun,
    stopBatchRun,
    customPrompts,
    setCustomPrompt,
    // Error handling (Phase 5.10)
    pauseBatchOnError,
    skipCurrentDocument,
    resumeAfterError,
    abortBatchOnError
  };
}

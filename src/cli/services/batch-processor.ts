// Batch processor service for CLI
// Executes playbooks and yields JSONL events

import type { Playbook, SessionInfo, UsageStats, HistoryEntry } from '../../shared/types';
import type { JsonlEvent } from '../output/jsonl';
import {
  spawnAgent,
  readDocAndCountTasks,
  uncheckAllTasks,
  writeDoc,
} from './agent-spawner';
import { addHistoryEntry } from './storage';

// Synopsis prompt for batch tasks
const BATCH_SYNOPSIS_PROMPT = `Provide a brief synopsis of what you just accomplished in this task using this exact format:

**Summary:** [1-2 sentences describing the key outcome]

**Details:** [A paragraph with more specifics about what was done, files changed, etc.]

Rules:
- Be specific about what was actually accomplished, not what was attempted.
- Focus only on meaningful work that was done. Omit filler phrases like "the task is complete", "no further action needed", "everything is working", etc.
- If nothing meaningful was accomplished, respond with only: **Summary:** No changes made.`;

/**
 * Parse a synopsis response into short summary and full synopsis
 */
function parseSynopsis(response: string): { shortSummary: string; fullSynopsis: string } {
  const clean = response
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/─+/g, '')
    .replace(/[│┌┐└┘├┤┬┴┼]/g, '')
    .trim();

  const summaryMatch = clean.match(/\*\*Summary:\*\*\s*(.+?)(?=\*\*Details:\*\*|$)/is);
  const detailsMatch = clean.match(/\*\*Details:\*\*\s*(.+?)$/is);

  const shortSummary = summaryMatch?.[1]?.trim() || clean.split('\n')[0]?.trim() || 'Task completed';
  const details = detailsMatch?.[1]?.trim() || '';

  const fullSynopsis = details ? `${shortSummary}\n\n${details}` : shortSummary;

  return { shortSummary, fullSynopsis };
}

/**
 * Generate a UUID (simple implementation without uuid package)
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Process a playbook and yield JSONL events
 */
export async function* runPlaybook(
  session: SessionInfo,
  playbook: Playbook,
  folderPath: string,
  options: {
    dryRun?: boolean;
    writeHistory?: boolean;
  } = {}
): AsyncGenerator<JsonlEvent> {
  const { dryRun = false, writeHistory = true } = options;
  const batchStartTime = Date.now();

  // Emit start event
  yield {
    type: 'start',
    timestamp: Date.now(),
    playbook: { id: playbook.id, name: playbook.name },
    session: { id: session.id, name: session.name, cwd: session.cwd },
  };

  // Calculate initial total tasks
  let initialTotalTasks = 0;
  for (const doc of playbook.documents) {
    const { taskCount } = readDocAndCountTasks(folderPath, doc.filename);
    initialTotalTasks += taskCount;
  }

  if (initialTotalTasks === 0) {
    yield {
      type: 'error',
      timestamp: Date.now(),
      message: 'No unchecked tasks found in any documents',
      code: 'NO_TASKS',
    };
    return;
  }

  if (dryRun) {
    // Dry run - just show what would be executed
    yield {
      type: 'complete',
      timestamp: Date.now(),
      success: true,
      totalTasksCompleted: 0,
      totalElapsedMs: 0,
      dryRun: true,
      wouldProcess: initialTotalTasks,
    };
    return;
  }

  // Track totals
  let totalCompletedTasks = 0;
  let totalCost = 0;
  let loopIteration = 0;

  // Per-loop tracking
  let loopStartTime = Date.now();
  let loopTasksCompleted = 0;
  let loopTotalInputTokens = 0;
  let loopTotalOutputTokens = 0;
  let loopTotalCost = 0;

  // Main processing loop
  while (true) {
    let anyTasksProcessedThisIteration = false;

    // Process each document in order
    for (let docIndex = 0; docIndex < playbook.documents.length; docIndex++) {
      const docEntry = playbook.documents[docIndex];

      // Read document and count tasks
      let { taskCount: remainingTasks } = readDocAndCountTasks(folderPath, docEntry.filename);

      // Skip documents with no tasks
      if (remainingTasks === 0) {
        continue;
      }

      // Emit document start event
      yield {
        type: 'document_start',
        timestamp: Date.now(),
        document: docEntry.filename,
        index: docIndex,
        taskCount: remainingTasks,
      };

      let docTasksCompleted = 0;
      let taskIndex = 0;

      // Process tasks in this document
      while (remainingTasks > 0) {
        // Emit task start
        yield {
          type: 'task_start',
          timestamp: Date.now(),
          document: docEntry.filename,
          taskIndex,
        };

        const taskStartTime = Date.now();

        // Replace $$SCRATCHPAD$$ placeholder with actual document path
        const docFilePath = `${folderPath}/${docEntry.filename}.md`;
        const finalPrompt = playbook.prompt.replace(/\$\$SCRATCHPAD\$\$/g, docFilePath);

        // Spawn agent
        const result = await spawnAgent(session.cwd, finalPrompt);

        const elapsedMs = Date.now() - taskStartTime;

        // Re-read document to get new task count
        const { taskCount: newRemainingTasks } = readDocAndCountTasks(folderPath, docEntry.filename);
        const tasksCompletedThisRun = remainingTasks - newRemainingTasks;

        // Update counters
        docTasksCompleted += tasksCompletedThisRun;
        totalCompletedTasks += tasksCompletedThisRun;
        loopTasksCompleted += tasksCompletedThisRun;
        anyTasksProcessedThisIteration = true;

        // Track usage
        if (result.usageStats) {
          loopTotalInputTokens += result.usageStats.inputTokens || 0;
          loopTotalOutputTokens += result.usageStats.outputTokens || 0;
          loopTotalCost += result.usageStats.totalCostUsd || 0;
          totalCost += result.usageStats.totalCostUsd || 0;
        }

        // Generate synopsis
        let shortSummary = `[${docEntry.filename}] Task completed`;
        let fullSynopsis = shortSummary;

        if (result.success && result.claudeSessionId) {
          // Request synopsis from the agent
          const synopsisResult = await spawnAgent(
            session.cwd,
            BATCH_SYNOPSIS_PROMPT,
            result.claudeSessionId
          );

          if (synopsisResult.success && synopsisResult.response) {
            const parsed = parseSynopsis(synopsisResult.response);
            shortSummary = parsed.shortSummary;
            fullSynopsis = parsed.fullSynopsis;
          }
        } else if (!result.success) {
          shortSummary = `[${docEntry.filename}] Task failed`;
          fullSynopsis = result.error || shortSummary;
        }

        // Emit task complete event
        yield {
          type: 'task_complete',
          timestamp: Date.now(),
          document: docEntry.filename,
          taskIndex,
          success: result.success,
          summary: shortSummary,
          fullResponse: fullSynopsis,
          elapsedMs,
          usageStats: result.usageStats,
          claudeSessionId: result.claudeSessionId,
        };

        // Add history entry if enabled
        if (writeHistory) {
          const historyEntry: HistoryEntry = {
            id: generateUUID(),
            type: 'AUTO',
            timestamp: Date.now(),
            summary: shortSummary,
            fullResponse: fullSynopsis,
            claudeSessionId: result.claudeSessionId,
            projectPath: session.cwd,
            sessionId: session.id,
            success: result.success,
            usageStats: result.usageStats,
            elapsedTimeMs: elapsedMs,
          };
          addHistoryEntry(historyEntry);
        }

        remainingTasks = newRemainingTasks;
        taskIndex++;
      }

      // Document complete - handle reset-on-completion
      if (docEntry.resetOnCompletion && docTasksCompleted > 0) {
        const { content: currentContent } = readDocAndCountTasks(folderPath, docEntry.filename);
        const resetContent = uncheckAllTasks(currentContent);
        writeDoc(folderPath, docEntry.filename + '.md', resetContent);
      }

      // Emit document complete event
      yield {
        type: 'document_complete',
        timestamp: Date.now(),
        document: docEntry.filename,
        tasksCompleted: docTasksCompleted,
      };
    }

    // Check if we should continue looping
    if (!playbook.loopEnabled) {
      break;
    }

    // Check max loop limit
    if (playbook.maxLoops !== null && playbook.maxLoops !== undefined && loopIteration + 1 >= playbook.maxLoops) {
      break;
    }

    // Check if any non-reset documents have remaining tasks
    const hasAnyNonResetDocs = playbook.documents.some(doc => !doc.resetOnCompletion);

    if (hasAnyNonResetDocs) {
      let anyNonResetDocsHaveTasks = false;
      for (const doc of playbook.documents) {
        if (doc.resetOnCompletion) continue;
        const { taskCount } = readDocAndCountTasks(folderPath, doc.filename);
        if (taskCount > 0) {
          anyNonResetDocsHaveTasks = true;
          break;
        }
      }
      if (!anyNonResetDocsHaveTasks) {
        break;
      }
    } else {
      // All documents are reset docs - exit after one pass
      break;
    }

    // Safety check
    if (!anyTasksProcessedThisIteration) {
      break;
    }

    // Emit loop complete event
    const loopElapsedMs = Date.now() - loopStartTime;
    const loopUsageStats: UsageStats | undefined =
      loopTotalInputTokens > 0 || loopTotalOutputTokens > 0
        ? {
            inputTokens: loopTotalInputTokens,
            outputTokens: loopTotalOutputTokens,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            totalCostUsd: loopTotalCost,
            contextWindow: 200000,
          }
        : undefined;

    yield {
      type: 'loop_complete',
      timestamp: Date.now(),
      iteration: loopIteration + 1,
      tasksCompleted: loopTasksCompleted,
      elapsedMs: loopElapsedMs,
      usageStats: loopUsageStats,
    };

    // Add loop summary history entry
    if (writeHistory) {
      const loopSummary = `Loop ${loopIteration + 1} completed: ${loopTasksCompleted} tasks accomplished`;
      const historyEntry: HistoryEntry = {
        id: generateUUID(),
        type: 'LOOP_SUMMARY',
        timestamp: Date.now(),
        summary: loopSummary,
        projectPath: session.cwd,
        sessionId: session.id,
        success: true,
        elapsedTimeMs: loopElapsedMs,
        usageStats: loopUsageStats,
      };
      addHistoryEntry(historyEntry);
    }

    // Reset per-loop tracking
    loopStartTime = Date.now();
    loopTasksCompleted = 0;
    loopTotalInputTokens = 0;
    loopTotalOutputTokens = 0;
    loopTotalCost = 0;

    loopIteration++;
  }

  // Emit complete event
  yield {
    type: 'complete',
    timestamp: Date.now(),
    success: true,
    totalTasksCompleted: totalCompletedTasks,
    totalElapsedMs: Date.now() - batchStartTime,
    totalCost,
  };
}

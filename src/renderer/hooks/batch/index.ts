/**
 * Batch processing modules
 * Extracted from useBatchProcessor.ts for modularity
 */

// Utility functions for markdown task processing
export { countUnfinishedTasks, countCheckedTasks, uncheckAllTasks } from './batchUtils';

// Debounce hook for per-session state updates
export { useSessionDebounce } from './useSessionDebounce';
export type { UseSessionDebounceOptions, UseSessionDebounceReturn } from './useSessionDebounce';

// Batch state reducer and types
export { batchReducer, DEFAULT_BATCH_STATE } from './batchReducer';
export type {
  BatchState,
  BatchAction,
  StartBatchPayload,
  UpdateProgressPayload,
  SetErrorPayload,
} from './batchReducer';

// Visibility-aware time tracking hook
export { useTimeTracking } from './useTimeTracking';
export type { UseTimeTrackingOptions, UseTimeTrackingReturn } from './useTimeTracking';

// Document processing hook
export { useDocumentProcessor } from './useDocumentProcessor';
export type {
  DocumentProcessorConfig,
  TaskResult,
  DocumentReadResult,
  DocumentProcessorCallbacks,
  UseDocumentProcessorReturn,
} from './useDocumentProcessor';

// Git worktree management hook
export { useWorktreeManager } from './useWorktreeManager';
export type {
  WorktreeConfig,
  WorktreeSetupResult,
  PRCreationResult,
  CreatePROptions,
  UseWorktreeManagerReturn,
} from './useWorktreeManager';

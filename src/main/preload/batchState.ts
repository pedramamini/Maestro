/**
 * Preload API for batch state persistence
 *
 * Provides the window.maestro.batchState namespace for:
 * - Saving batch run state snapshots to main process
 * - Loading persisted batch state after renderer reload
 * - Clearing persisted state on clean completion
 * - Flushing pending writes on shutdown
 */

import { ipcRenderer } from 'electron';
import type {
	PersistedBatchRunState,
	PersistedBatchSnapshot,
} from '../../shared/batch-state-types';

export type { PersistedBatchRunState, PersistedBatchSnapshot };

/**
 * Batch State API type
 */
export interface BatchStateApi {
	save: (activeBatches: PersistedBatchRunState[]) => Promise<void>;
	load: () => Promise<PersistedBatchSnapshot | null>;
	clear: () => Promise<void>;
	flush: () => Promise<void>;
}

/**
 * Creates the Batch State API object for preload exposure
 */
export function createBatchStateApi(): BatchStateApi {
	return {
		save: (activeBatches: PersistedBatchRunState[]): Promise<void> =>
			ipcRenderer.invoke('batch-state:save', activeBatches),

		load: (): Promise<PersistedBatchSnapshot | null> => ipcRenderer.invoke('batch-state:load'),

		clear: (): Promise<void> => ipcRenderer.invoke('batch-state:clear'),

		flush: (): Promise<void> => ipcRenderer.invoke('batch-state:flush'),
	};
}

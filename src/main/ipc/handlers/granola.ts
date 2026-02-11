/**
 * Granola IPC Handlers
 *
 * Two IPC channels for fetching Granola meeting documents and transcripts.
 * Data functions live in src/main/granola.ts (reads local cache).
 */

import { ipcMain } from 'electron';
import { withIpcErrorLogging, CreateHandlerOptions } from '../../utils/ipcHandler';
import { getRecentMeetings, getTranscript } from '../../granola';

const LOG_CONTEXT = '[Granola]';

const handlerOpts = (operation: string): Pick<CreateHandlerOptions, 'context' | 'operation'> => ({
	context: LOG_CONTEXT,
	operation,
});

export function registerGranolaHandlers(): void {
	ipcMain.handle(
		'granola:get-documents',
		withIpcErrorLogging(handlerOpts('get-documents'), async (limit?: number) => {
			const safeLimit = typeof limit === 'number' && limit > 0 ? Math.min(limit, 500) : undefined;
			return getRecentMeetings(safeLimit);
		})
	);

	ipcMain.handle(
		'granola:get-transcript',
		withIpcErrorLogging(handlerOpts('get-transcript'), async (documentId: string) => {
			if (typeof documentId !== 'string' || !documentId.trim()) {
				return { success: false, error: 'cache_not_found' as const };
			}
			return getTranscript(documentId);
		})
	);
}

/**
 * Safe IPC message sending utility.
 * Handles cases where the renderer has been disposed.
 *
 * Multi-window support (GitHub issue #133):
 * - Process events (process:data, process:exit, etc.) are broadcast to ALL windows
 * - Each renderer filters events by its own WindowContext.sessionIds
 * - This keeps the architecture simple and ensures web interface receives all events
 */

import { BrowserWindow } from 'electron';
import { logger } from './logger';
import { windowRegistry } from '../window-registry';

/** Function type for getting the main window reference */
export type GetMainWindow = () => BrowserWindow | null;

/**
 * Creates a safeSend function with the provided window getter.
 * This allows dependency injection of the window reference.
 *
 * Multi-window support: IPC messages are broadcast to ALL windows.
 * This is intentional - renderers filter events by their own sessionIds.
 *
 * @param getMainWindow - Function that returns the current main window or null (fallback for single-window mode)
 * @returns A function that safely sends IPC messages to all renderer windows
 */
export function createSafeSend(getMainWindow: GetMainWindow) {
	/**
	 * Safely send IPC message to ALL renderer windows.
	 * Handles cases where a renderer has been disposed (e.g., GPU crash, window closing).
	 * This prevents "Render frame was disposed before WebFrameMain could be accessed" errors.
	 *
	 * Multi-window support: Messages are broadcast to ALL windows.
	 * Each window's renderer filters events by its own WindowContext.sessionIds.
	 * This ensures:
	 * - Sessions in multiple windows (not supported, but harmless if it happens)
	 * - Web interface continues to receive all events
	 * - Simple, predictable broadcast model
	 */
	return function safeSend(channel: string, ...args: unknown[]): void {
		try {
			// Get all registered windows from the WindowRegistry
			const allWindows = windowRegistry.getAll();

			if (allWindows.length > 0) {
				// Multi-window mode: broadcast to all registered windows
				let sentCount = 0;
				for (const [_windowId, entry] of allWindows) {
					const browserWindow = entry.browserWindow;
					if (
						browserWindow &&
						!browserWindow.isDestroyed() &&
						browserWindow.webContents &&
						!browserWindow.webContents.isDestroyed()
					) {
						browserWindow.webContents.send(channel, ...args);
						sentCount++;
					}
				}

				// Log if we broadcast to multiple windows (debug level)
				if (sentCount > 1) {
					logger.debug(`Broadcast IPC message to ${sentCount} windows: ${channel}`, 'IPC');
				}
			} else {
				// Fallback: single-window mode (pre-multi-window compatibility)
				// This handles edge cases during app startup before WindowRegistry is populated
				const mainWindow = getMainWindow();
				if (
					mainWindow &&
					!mainWindow.isDestroyed() &&
					mainWindow.webContents &&
					!mainWindow.webContents.isDestroyed()
				) {
					mainWindow.webContents.send(channel, ...args);
				}
			}
		} catch (error) {
			// Silently ignore - renderer is not available
			// This can happen during GPU crashes, window closing, or app shutdown
			logger.debug(`Failed to send IPC message to renderer: ${channel}`, 'IPC', {
				error: String(error),
			});
		}
	};
}

/** Type for the safeSend function */
export type SafeSendFn = ReturnType<typeof createSafeSend>;

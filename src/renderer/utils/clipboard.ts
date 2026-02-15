/**
 * @file clipboard.ts
 * @description Safe clipboard operations that handle focus-related errors.
 *
 * The Clipboard API throws NotAllowedError when the document is not focused.
 * This utility wraps clipboard.writeText with proper error handling to prevent
 * unhandled exceptions from reaching Sentry.
 *
 * Fixes MAESTRO-4Z
 */

/**
 * Safely write text to the clipboard.
 * Returns true on success, false if the document is not focused or clipboard is unavailable.
 */
export async function safeClipboardWrite(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		// NotAllowedError when document not focused, or other clipboard failures.
		// Not actionable — the user can retry when the window is focused.
		return false;
	}
}

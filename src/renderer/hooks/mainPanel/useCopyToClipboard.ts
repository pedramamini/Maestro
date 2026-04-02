import { useState, useCallback, useRef, useEffect } from 'react';
import { safeClipboardWrite } from '../../utils/clipboard';

/**
 * Clipboard copy handler with a centered flash notification.
 *
 * Returns the notification message (or null) and an async copy function.
 * The notification auto-dismisses after 2 seconds. Rapid successive copies
 * cancel the previous timer so the notification stays visible for the full
 * duration from the latest copy.
 */
export function useCopyToClipboard() {
	const [copyNotification, setCopyNotification] = useState<string | null>(null);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Clean up timer on unmount
	useEffect(() => {
		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
		};
	}, []);

	const copyToClipboard = useCallback(async (text: string, message?: string) => {
		const ok = await safeClipboardWrite(text);
		if (ok) {
			// Cancel any existing dismiss timer
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
			// Show centered flash notification
			setCopyNotification(message || 'Copied to Clipboard');
			timeoutRef.current = setTimeout(() => setCopyNotification(null), 2000);
		}
	}, []);

	return { copyNotification, copyToClipboard };
}

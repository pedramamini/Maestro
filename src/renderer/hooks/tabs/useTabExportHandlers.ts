/**
 * useTabExportHandlers — extracted from App.tsx
 *
 * Provides handlers for tab content export operations:
 *   - Copy tab context to clipboard
 *   - Export tab as HTML file
 *   - Publish tab as GitHub Gist
 *
 * Reads from: sessionStore (sessions, activeSessionId), tabStore, modalStore
 */

import { useCallback } from 'react';
import type { Session, Theme, AITab } from '../../types';
import { useTabStore } from '../../stores/tabStore';
import { formatLogsForClipboard } from '../../utils/contextExtractor';
import { tNotify } from '../../utils/tNotify';

// ============================================================================
// Dependencies interface
// ============================================================================

export interface UseTabExportHandlersDeps {
	/** Ref to latest sessions array */
	sessionsRef: React.RefObject<Session[]>;
	/** Ref to latest active session ID */
	activeSessionIdRef: React.RefObject<string | null>;
	/** Ref to latest theme */
	themeRef: React.RefObject<Theme>;
	/** Open the gist publish modal (local App.tsx state) */
	setGistPublishModalOpen: (open: boolean) => void;
}

// ============================================================================
// Return type
// ============================================================================

export interface UseTabExportHandlersReturn {
	/** Copy tab conversation to clipboard */
	handleCopyContext: (tabId: string) => void;
	/** Export tab as HTML file download */
	handleExportHtml: (tabId: string) => Promise<void>;
	/** Open Gist publish modal with tab content */
	handlePublishTabGist: (tabId: string) => void;
}

// ============================================================================
// Hook implementation
// ============================================================================

export function useTabExportHandlers(deps: UseTabExportHandlersDeps): UseTabExportHandlersReturn {
	const { sessionsRef, activeSessionIdRef, themeRef, setGistPublishModalOpen } = deps;

	/**
	 * Resolve the active session and the specified tab.
	 * Returns null if session/tab is missing or tab has no logs.
	 */
	const resolveSessionAndTab = (tabId: string): { session: Session; tab: AITab } | null => {
		const currentSession = sessionsRef.current?.find((s) => s.id === activeSessionIdRef.current);
		if (!currentSession) return null;
		const tab = currentSession.aiTabs.find((t) => t.id === tabId);
		if (!tab || !tab.logs || tab.logs.length === 0) return null;
		return { session: currentSession, tab };
	};

	const handleCopyContext = useCallback((tabId: string) => {
		const resolved = resolveSessionAndTab(tabId);
		if (!resolved) return;

		const text = formatLogsForClipboard(resolved.tab.logs);
		if (!text.trim()) {
			tNotify({
				type: 'warning',
				titleKey: 'notifications:export.nothing_to_copy_title',
				messageKey: 'notifications:export.nothing_to_copy_message',
			});
			return;
		}

		navigator.clipboard
			.writeText(text)
			.then(() => {
				tNotify({
					type: 'success',
					titleKey: 'notifications:export.context_copied_title',
					messageKey: 'notifications:export.context_copied_message',
				});
			})
			.catch((err) => {
				console.error('Failed to copy context:', err);
				tNotify({
					type: 'error',
					titleKey: 'notifications:export.copy_failed_title',
					messageKey: 'notifications:export.copy_failed_message',
				});
			});
	}, []);

	const handleExportHtml = useCallback(async (tabId: string) => {
		const resolved = resolveSessionAndTab(tabId);
		if (!resolved) return;

		if (!themeRef.current) return;

		try {
			const { downloadTabExport } = await import('../../utils/tabExport');
			await downloadTabExport(
				resolved.tab,
				{
					name: resolved.session.name,
					cwd: resolved.session.cwd,
					toolType: resolved.session.toolType,
				},
				themeRef.current
			);
			tNotify({
				type: 'success',
				titleKey: 'notifications:export.export_complete_title',
				messageKey: 'notifications:export.export_complete_message',
			});
		} catch (err) {
			console.error('Failed to export tab:', err);
			tNotify({
				type: 'error',
				titleKey: 'notifications:export.export_failed_title',
				messageKey: 'notifications:export.export_failed_message',
			});
		}
	}, []);

	const handlePublishTabGist = useCallback((tabId: string) => {
		const resolved = resolveSessionAndTab(tabId);
		if (!resolved) return;

		// Convert logs to markdown-like text format
		const content = formatLogsForClipboard(resolved.tab.logs);
		if (!content.trim()) {
			tNotify({
				type: 'warning',
				titleKey: 'notifications:export.nothing_to_publish_title',
				messageKey: 'notifications:export.nothing_to_publish_message',
			});
			return;
		}

		// Generate filename based on tab name or session ID
		const tabName =
			resolved.tab.name || (resolved.tab.agentSessionId?.slice(0, 8) ?? 'conversation');
		const filename = `${tabName.replace(/[^a-zA-Z0-9-_]/g, '_')}_context.md`;

		// Set content and open the modal
		useTabStore.getState().setTabGistContent({ filename, content });
		setGistPublishModalOpen(true);
	}, []);

	return {
		handleCopyContext,
		handleExportHtml,
		handlePublishTabGist,
	};
}

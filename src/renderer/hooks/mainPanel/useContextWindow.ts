import { useState, useEffect, useMemo } from 'react';
import { calculateContextDisplay } from '../../utils/contextUsage';
import { captureException } from '../../utils/sentry';
import type { Session, AITab } from '../../types';

/**
 * Loads and computes context window metrics for the active tab.
 *
 * Resolves the configured context window from session override or agent settings,
 * then calculates token usage and usage percentage.
 */
export function useContextWindow(activeSession: Session | null, activeTab: AITab | null) {
	const [configuredContextWindow, setConfiguredContextWindow] = useState(0);

	// Resolve the configured context window from session override or agent settings.
	useEffect(() => {
		let isActive = true;

		const loadContextWindow = async () => {
			if (!activeSession) {
				if (isActive) setConfiguredContextWindow(0);
				return;
			}

			if (
				typeof activeSession.customContextWindow === 'number' &&
				activeSession.customContextWindow > 0
			) {
				if (isActive) setConfiguredContextWindow(activeSession.customContextWindow);
				return;
			}

			try {
				const config = await window.maestro.agents.getConfig(activeSession.toolType);
				const value = typeof config?.contextWindow === 'number' ? config.contextWindow : 0;
				if (isActive) setConfiguredContextWindow(value);
			} catch (error) {
				captureException(error, {
					extra: {
						message: 'Failed to load agent context window setting',
						toolType: activeSession.toolType,
					},
				});
				if (isActive) setConfiguredContextWindow(0);
			}
		};

		loadContextWindow();
		return () => {
			isActive = false;
		};
	}, [activeSession?.toolType, activeSession?.customContextWindow]);

	const activeTabContextWindow = useMemo(() => {
		const configured = configuredContextWindow;
		const reported = activeTab?.usageStats?.contextWindow ?? 0;
		return configured > 0 ? configured : reported;
	}, [configuredContextWindow, activeTab?.usageStats?.contextWindow]);

	// Compute context tokens and percentage using the shared helper.
	// Handles accumulated multi-tool turns by falling back to session.contextUsage.
	const { tokens: activeTabContextTokens, percentage: activeTabContextUsage } = useMemo(() => {
		if (!activeTab?.usageStats) return { tokens: 0, percentage: 0 };
		return calculateContextDisplay(
			{
				inputTokens: activeTab.usageStats.inputTokens,
				outputTokens: activeTab.usageStats.outputTokens,
				cacheCreationInputTokens: activeTab.usageStats.cacheCreationInputTokens ?? 0,
				cacheReadInputTokens: activeTab.usageStats.cacheReadInputTokens ?? 0,
			},
			activeTabContextWindow,
			activeSession?.toolType,
			activeSession?.contextUsage
		);
	}, [
		activeTab?.usageStats,
		activeSession?.toolType,
		activeTabContextWindow,
		activeSession?.contextUsage,
	]);

	return {
		activeTabContextWindow,
		activeTabContextTokens,
		activeTabContextUsage,
	};
}

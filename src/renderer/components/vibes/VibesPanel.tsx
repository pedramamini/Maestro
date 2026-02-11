import React, { useState, useCallback, useEffect } from 'react';
import { Shield, Settings } from 'lucide-react';
import type { Theme } from '../../types';
import { useSettings, useVibesData } from '../../hooks';
import { VibesDashboard } from './VibesDashboard';
import { VibesAnnotationLog } from './VibesAnnotationLog';
import { VibesModelAttribution } from './VibesModelAttribution';
import { VibesBlameView } from './VibesBlameView';
import { VibeCoverageView } from './VibeCoverageView';
import { VibesReportView } from './VibesReportView';

// ============================================================================
// Sub-tab type
// ============================================================================

type VibesSubTab = 'overview' | 'log' | 'models' | 'blame' | 'coverage' | 'reports';

const SUB_TABS: { key: VibesSubTab; label: string }[] = [
	{ key: 'overview', label: 'Overview' },
	{ key: 'log', label: 'Log' },
	{ key: 'models', label: 'Models' },
	{ key: 'blame', label: 'Blame' },
	{ key: 'coverage', label: 'Coverage' },
	{ key: 'reports', label: 'Reports' },
];

// ============================================================================
// Props
// ============================================================================

interface VibesPanelProps {
	theme: Theme;
	projectPath: string | undefined;
	/** Optional file path to pre-select in the blame view (e.g. from file explorer context menu). */
	initialBlameFilePath?: string;
	/** Callback to clear the initialBlameFilePath after it has been consumed. */
	onBlameFileConsumed?: () => void;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Main VIBES panel container component.
 * Rendered in the Right Panel when the VIBES tab is active.
 *
 * Features:
 * - Sub-navigation bar with Overview / Log / Models / Blame / Coverage / Reports tabs
 * - Scrollable tab bar to accommodate 6 sub-tabs
 * - Disabled state message when VIBES is off, with button to open Settings
 * - Passes projectPath and vibesData to child components
 * - Accepts initialBlameFilePath to auto-navigate to blame view with a pre-selected file
 */
export const VibesPanel: React.FC<VibesPanelProps> = ({
	theme,
	projectPath,
	initialBlameFilePath,
	onBlameFileConsumed,
}) => {
	const [activeSubTab, setActiveSubTab] = useState<VibesSubTab>('overview');
	const [blameFilePath, setBlameFilePath] = useState<string | undefined>(undefined);
	const { vibesEnabled, vibesAssuranceLevel, vibesAutoInit } = useSettings();
	const vibesData = useVibesData(projectPath, vibesEnabled);

	// When an initialBlameFilePath is provided, switch to blame tab and set the file path
	useEffect(() => {
		if (initialBlameFilePath) {
			setBlameFilePath(initialBlameFilePath);
			setActiveSubTab('blame');
			onBlameFileConsumed?.();
		}
	}, [initialBlameFilePath, onBlameFileConsumed]);

	const handleOpenSettings = useCallback(() => {
		// Dispatch tour:action event to open settings (same event bus as other UI actions)
		window.dispatchEvent(
			new CustomEvent('tour:action', {
				detail: { type: 'openSettings' },
			}),
		);
	}, []);

	// ========================================================================
	// Disabled state — VIBES is off in settings
	// ========================================================================

	if (!vibesEnabled) {
		return (
			<div className="h-full flex flex-col items-center justify-center gap-3 text-center px-4">
				<Shield className="w-8 h-8 opacity-40" style={{ color: theme.colors.textDim }} />
				<span
					className="text-sm font-medium"
					style={{ color: theme.colors.textMain }}
				>
					VIBES is disabled
				</span>
				<span
					className="text-xs max-w-xs"
					style={{ color: theme.colors.textDim }}
				>
					Enable VIBES in Settings to start tracking AI attribution metadata for your project.
				</span>
				<button
					onClick={handleOpenSettings}
					className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-opacity hover:opacity-80 mt-1"
					style={{
						backgroundColor: theme.colors.accent,
						color: theme.colors.accentForeground,
					}}
				>
					<Settings className="w-3.5 h-3.5" />
					Open Settings
				</button>
			</div>
		);
	}

	// ========================================================================
	// Active state — sub-tab navigation + content
	// ========================================================================

	return (
		<div className="h-full flex flex-col">
			{/* Sub-tab navigation bar — scrollable for 6 tabs */}
			<div
				className="flex overflow-x-auto border-b shrink-0 scrollbar-thin"
				style={{ borderColor: theme.colors.border }}
			>
				{SUB_TABS.map((tab) => (
					<button
						key={tab.key}
						onClick={() => setActiveSubTab(tab.key)}
						className="shrink-0 px-3 py-2 text-[11px] font-semibold border-b-2 transition-colors whitespace-nowrap"
						style={{
							borderColor: activeSubTab === tab.key ? theme.colors.accent : 'transparent',
							color: activeSubTab === tab.key ? theme.colors.textMain : theme.colors.textDim,
						}}
					>
						{tab.label}
					</button>
				))}
			</div>

			{/* Sub-tab content */}
			<div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
				{activeSubTab === 'overview' && (
					<VibesDashboard
						theme={theme}
						projectPath={projectPath}
						vibesData={vibesData}
						vibesEnabled={vibesEnabled}
						vibesAssuranceLevel={vibesAssuranceLevel}
						vibesAutoInit={vibesAutoInit}
					/>
				)}

				{activeSubTab === 'log' && (
					<VibesAnnotationLog
						theme={theme}
						annotations={vibesData.annotations}
						isLoading={vibesData.isLoading}
					/>
				)}

				{activeSubTab === 'models' && (
					<VibesModelAttribution
						theme={theme}
						models={vibesData.models}
						isLoading={vibesData.isLoading}
					/>
				)}

				{activeSubTab === 'blame' && (
					<VibesBlameView
						theme={theme}
						projectPath={projectPath}
						initialFilePath={blameFilePath}
					/>
				)}

				{activeSubTab === 'coverage' && (
					<VibeCoverageView
						theme={theme}
						projectPath={projectPath}
					/>
				)}

				{activeSubTab === 'reports' && (
					<VibesReportView
						theme={theme}
						projectPath={projectPath}
					/>
				)}
			</div>
		</div>
	);
};

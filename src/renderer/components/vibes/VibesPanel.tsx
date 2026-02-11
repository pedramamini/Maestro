import React from 'react';
import type { Theme } from '../../types';

interface VibesPanelProps {
	theme: Theme;
	projectPath: string | undefined;
}

/**
 * Main VIBES panel container component.
 * Rendered in the Right Panel when the VIBES tab is active.
 * Sub-navigation and child components will be added in subsequent phases.
 */
export const VibesPanel: React.FC<VibesPanelProps> = ({ theme }) => {
	return (
		<div className="h-full flex flex-col items-center justify-center gap-3 text-center px-4">
			<span
				className="text-sm font-medium"
				style={{ color: theme.colors.textMain }}
			>
				VIBES Panel
			</span>
			<span
				className="text-xs"
				style={{ color: theme.colors.textDim }}
			>
				AI attribution and audit metadata for your project.
				Configure VIBES in Settings to get started.
			</span>
		</div>
	);
};

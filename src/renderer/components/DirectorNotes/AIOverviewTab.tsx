import React from 'react';
import type { Theme } from '../../types';

interface AIOverviewTabProps {
	theme: Theme;
	onSynopsisReady?: () => void;
}

export function AIOverviewTab({ theme }: AIOverviewTabProps) {
	return (
		<div className="h-full flex items-center justify-center">
			<p style={{ color: theme.colors.textDim }}>
				AI Overview - Implementation in Phase 07
			</p>
		</div>
	);
}

import React from 'react';
import type { Theme } from '../../types';

interface UnifiedHistoryTabProps {
	theme: Theme;
	fileTree?: any[];
	onFileClick?: (path: string) => void;
}

export function UnifiedHistoryTab({ theme }: UnifiedHistoryTabProps) {
	return (
		<div className="h-full flex items-center justify-center">
			<p style={{ color: theme.colors.textDim }}>
				Unified History - Implementation in Phase 06
			</p>
		</div>
	);
}

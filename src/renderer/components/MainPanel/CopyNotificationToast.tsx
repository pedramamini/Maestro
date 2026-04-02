import React from 'react';
import type { Theme } from '../../types';

interface CopyNotificationToastProps {
	message: string | null;
	theme: Theme;
}

export const CopyNotificationToast = React.memo(function CopyNotificationToast({
	message,
	theme,
}: CopyNotificationToastProps) {
	if (!message) return null;

	return (
		<div
			role="status"
			aria-live="polite"
			aria-atomic="true"
			className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 px-6 py-4 rounded-lg shadow-2xl text-base font-bold animate-in fade-in zoom-in-95 duration-200 z-50"
			style={{
				backgroundColor: theme.colors.accent,
				color: theme.colors.accentForeground,
				textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
			}}
		>
			{message}
		</div>
	);
});

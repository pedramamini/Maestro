import { memo } from 'react';
import type { ReactNode } from 'react';
import type { Theme } from '../../types';

export interface EmptyStateAction {
	label: string;
	onClick: () => void;
}

export interface EmptyStateProps {
	/** Current theme for styling */
	theme: Theme;
	/** Main message text */
	message: string;
	/** Icon displayed above the message */
	icon?: ReactNode;
	/** Optional description below the message */
	description?: string;
	/** Optional action button */
	action?: EmptyStateAction;
	/** Additional CSS classes for the outer container */
	className?: string;
	/** Test ID for the outer container */
	testId?: string;
}

export const EmptyState = memo(function EmptyState({
	theme,
	message,
	icon,
	description,
	action,
	className = '',
	testId = 'empty-state',
}: EmptyStateProps) {
	return (
		<div
			className={`flex flex-col items-center justify-center text-center ${className}`}
			style={{ color: theme.colors.textDim }}
			data-testid={testId}
		>
			{icon && (
				<div className="mb-3 opacity-30">
					{icon}
				</div>
			)}
			<p
				className="text-sm"
				style={{ color: theme.colors.textDim }}
			>
				{message}
			</p>
			{description && (
				<p
					className="text-xs mt-1"
					style={{ color: theme.colors.textDim, opacity: 0.7 }}
				>
					{description}
				</p>
			)}
			{action && (
				<button
					onClick={action.onClick}
					className="mt-3 text-xs px-3 py-1.5 rounded transition-colors hover:opacity-80"
					style={{
						color: theme.colors.accent,
						backgroundColor: 'transparent',
					}}
				>
					{action.label}
				</button>
			)}
		</div>
	);
});

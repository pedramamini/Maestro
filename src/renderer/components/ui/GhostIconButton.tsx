import React from 'react';

export interface GhostIconButtonProps
	extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
	/** Icon element to render inside the button (lucide-react icon, etc.) */
	icon?: React.ReactNode;
	/** Padding size: 'sm' = p-1, 'md' = p-1.5 */
	size?: 'sm' | 'md';
	/** When true, button is invisible until parent group is hovered */
	showOnHover?: boolean;
	/** Native title tooltip text */
	tooltip?: string;
	/** Additional CSS classes */
	className?: string;
	/** Children take precedence over icon prop */
	children?: React.ReactNode;
}

const SIZE_CLASSES: Record<'sm' | 'md', string> = {
	sm: 'p-1',
	md: 'p-1.5',
};

/**
 * Ghost icon button - a minimal, transparent button that shows a subtle
 * background on hover. Used throughout the app for icon-only actions
 * (close, refresh, copy, expand, etc.).
 *
 * Replaces the common pattern:
 *   `<button className="p-1 rounded hover:bg-white/10 transition-colors">...`
 */
export const GhostIconButton = React.forwardRef<HTMLButtonElement, GhostIconButtonProps>(
	function GhostIconButton(
		{
			icon,
			size = 'sm',
			showOnHover = false,
			tooltip,
			className = '',
			children,
			...buttonProps
		},
		ref,
	) {
		const sizeClass = SIZE_CLASSES[size];
		const hoverClass = showOnHover ? 'opacity-0 group-hover:opacity-100' : '';

		return (
			<button
				type="button"
				title={tooltip}
				{...buttonProps}
				ref={ref}
				className={`${sizeClass} rounded hover:bg-white/10 transition-colors ${hoverClass} ${className}`.trim()}
			>
				{children ?? icon}
			</button>
		);
	},
);

/**
 * QuickActionsMenu - Popup menu shown on long-press of send button
 *
 * Displays quick action for mode switching:
 * - Switch to terminal/AI mode
 *
 * Features:
 * - Appears above the send button on long-press
 * - Touch-friendly hit targets (minimum 44pt)
 * - Animated appearance with scale/opacity
 * - Haptic feedback on selection
 * - Dismisses on outside tap or action selection
 * - Accessible with proper ARIA roles
 */

import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../components/ThemeProvider';
import { useDirection, getLogicalSide } from '../utils/rtlCoordinates';
import { MIN_TOUCH_TARGET } from './constants';

export type QuickAction = 'switch_mode';

export interface QuickActionsMenuProps {
	/** Whether the menu is visible */
	isOpen: boolean;
	/** Callback when the menu should close */
	onClose: () => void;
	/** Callback when an action is selected */
	onSelectAction: (action: QuickAction) => void;
	/** Current input mode (to display correct switch text) */
	inputMode: 'ai' | 'terminal';
	/** Position coordinates for the menu (relative to viewport) */
	anchorPosition: { x: number; y: number } | null;
	/** Whether a session is selected (disable actions if not) */
	hasActiveSession: boolean;
}

/**
 * QuickActionsMenu component
 *
 * A floating menu that appears on long-press of the send button,
 * providing quick access to common session actions.
 */
export function QuickActionsMenu({
	isOpen,
	onClose,
	onSelectAction,
	inputMode,
	anchorPosition,
	hasActiveSession,
}: QuickActionsMenuProps) {
	const colors = useThemeColors();
	const { t } = useTranslation('common');
	const { t: tA } = useTranslation('accessibility');
	const dir = useDirection();
	const menuRef = useRef<HTMLDivElement>(null);

	// Close menu when clicking outside
	useEffect(() => {
		if (!isOpen) return;

		const handleClickOutside = (event: MouseEvent | TouchEvent) => {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				onClose();
			}
		};

		// Use both mouse and touch events for cross-device support
		document.addEventListener('mousedown', handleClickOutside);
		document.addEventListener('touchstart', handleClickOutside);

		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('touchstart', handleClickOutside);
		};
	}, [isOpen, onClose]);

	// Handle escape key to close menu
	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				onClose();
			}
		};

		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [isOpen, onClose]);

	if (!isOpen || !anchorPosition) return null;

	// Calculate menu position (above the anchor, centered)
	const menuWidth = 200;
	// Center horizontally on the anchor, clamped to stay within viewport bounds
	const startSide = getLogicalSide('start', dir);
	const leftValue = Math.max(
		16,
		Math.min(anchorPosition.x - menuWidth / 2, window.innerWidth - menuWidth - 16)
	);
	// In RTL, convert physical left offset to a right offset for inset-inline-start
	const startValue = dir === 'rtl' ? window.innerWidth - leftValue - menuWidth : leftValue;
	const menuStyle: React.CSSProperties = {
		position: 'fixed',
		// Position above the anchor point with some padding
		bottom: `calc(100vh - ${anchorPosition.y}px + 12px)`,
		[startSide]: startValue,
		width: `${menuWidth}px`,
		zIndex: 200,
		// Appearance
		backgroundColor: colors.bgSidebar,
		borderRadius: '12px',
		border: `1px solid ${colors.border}`,
		boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
		// Animation
		animation: 'quickActionsPopIn 150ms ease-out forwards',
		transformOrigin: 'bottom center',
		overflow: 'hidden',
	};

	const menuItems: Array<{
		action: QuickAction;
		label: string;
		icon: React.ReactNode;
		disabled: boolean;
	}> = [
		{
			action: 'switch_mode',
			label: inputMode === 'ai' ? t('mobile.switch_to_terminal') : t('mobile.switch_to_ai'),
			icon:
				inputMode === 'ai' ? (
					// Terminal icon
					<svg
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<polyline points="4 17 10 11 4 5" />
						<line x1="12" y1="19" x2="20" y2="19" />
					</svg>
				) : (
					// AI sparkle icon
					<svg
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M12 3v2M12 19v2M5.64 5.64l1.42 1.42M16.95 16.95l1.41 1.41M3 12h2M19 12h2M5.64 18.36l1.42-1.42M16.95 7.05l1.41-1.41" />
						<circle cx="12" cy="12" r="4" />
					</svg>
				),
			disabled: !hasActiveSession,
		},
	];

	const handleItemClick = (action: QuickAction, disabled: boolean) => {
		if (disabled) return;
		onSelectAction(action);
		onClose();
	};

	return (
		<>
			{/* Backdrop overlay for visual focus */}
			<div
				style={{
					position: 'fixed',
					top: 0,
					insetInlineStart: 0,
					insetInlineEnd: 0,
					bottom: 0,
					backgroundColor: 'rgba(0, 0, 0, 0.2)',
					zIndex: 199,
					animation: 'quickActionsFadeIn 150ms ease-out forwards',
				}}
				onClick={onClose}
				aria-hidden="true"
			/>

			{/* Menu container */}
			<div ref={menuRef} role="menu" aria-label={tA('mobile.quick_actions')} style={menuStyle}>
				{menuItems.map((item, index) => (
					<button
						key={item.action}
						role="menuitem"
						onClick={() => handleItemClick(item.action, item.disabled)}
						disabled={item.disabled}
						aria-disabled={item.disabled}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: '12px',
							width: '100%',
							padding: '14px 16px',
							minHeight: `${MIN_TOUCH_TARGET}px`,
							backgroundColor: 'transparent',
							border: 'none',
							borderBottom: index < menuItems.length - 1 ? `1px solid ${colors.border}` : 'none',
							color: item.disabled ? colors.textDim : colors.textMain,
							fontSize: '15px',
							fontWeight: 500,
							textAlign: 'start',
							cursor: item.disabled ? 'default' : 'pointer',
							opacity: item.disabled ? 0.5 : 1,
							transition: 'background-color 150ms ease',
							WebkitTapHighlightColor: 'transparent',
						}}
						onTouchStart={(e) => {
							if (!item.disabled) {
								e.currentTarget.style.backgroundColor = `${colors.accent}20`;
							}
						}}
						onTouchEnd={(e) => {
							e.currentTarget.style.backgroundColor = 'transparent';
						}}
						onMouseEnter={(e) => {
							if (!item.disabled) {
								e.currentTarget.style.backgroundColor = `${colors.accent}20`;
							}
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.backgroundColor = 'transparent';
						}}
					>
						<span style={{ color: item.disabled ? colors.textDim : colors.accent }}>
							{item.icon}
						</span>
						<span>{item.label}</span>
					</button>
				))}
			</div>

			{/* CSS animations */}
			<style>
				{`
          @keyframes quickActionsPopIn {
            from {
              opacity: 0;
              transform: scale(0.9) translateY(8px);
            }
            to {
              opacity: 1;
              transform: scale(1) translateY(0);
            }
          }
          @keyframes quickActionsFadeIn {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }
        `}
			</style>
		</>
	);
}

export default QuickActionsMenu;

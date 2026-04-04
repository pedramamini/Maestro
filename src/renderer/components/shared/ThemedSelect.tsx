/**
 * ThemedSelect — Themed custom dropdown replacement for native <select>.
 *
 * Renders a button that opens a positioned dropdown menu matching Maestro's
 * standard context menu aesthetic (bgSidebar, border, hover bgActivity).
 * Supports full keyboard navigation (Arrow keys, Home/End, Enter/Space, Escape).
 */

import { useState, useRef, useCallback, useEffect, useId } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Theme } from '../../types';
import { useClickOutside } from '../../hooks/ui';

export interface ThemedSelectOption {
	value: string;
	label: string;
}

interface ThemedSelectProps {
	value: string;
	options: ThemedSelectOption[];
	onChange: (value: string) => void;
	theme: Theme;
	style?: React.CSSProperties;
	/** Optional CSS class for the trigger button */
	className?: string;
	/** Accessible label for the trigger button */
	'aria-label'?: string;
	/** id forwarded to the trigger button (enables <label htmlFor>) */
	id?: string;
}

export function ThemedSelect({
	value,
	options,
	onChange,
	theme,
	style,
	className,
	'aria-label': ariaLabel,
	id,
}: ThemedSelectProps) {
	const instanceId = useId();
	const [open, setOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(-1);
	const containerRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const [dropUp, setDropUp] = useState(false);

	const closeAndRefocus = useCallback(() => {
		setOpen(false);
		triggerRef.current?.focus();
	}, []);

	useClickOutside(containerRef, closeAndRefocus, open);

	// Reset active index to selected option when opening
	useEffect(() => {
		if (open) {
			const idx = options.findIndex((o) => o.value === value);
			setActiveIndex(idx >= 0 ? idx : 0);
			// Focus the menu so keyboard events work
			requestAnimationFrame(() => menuRef.current?.focus({ preventScroll: true }));
		}
	}, [open, options, value]);

	const handleOpen = useCallback(() => {
		if (!containerRef.current) {
			setOpen((v) => !v);
			return;
		}
		const rect = containerRef.current.getBoundingClientRect();
		const spaceBelow = window.innerHeight - rect.bottom;
		setDropUp(spaceBelow < 120);
		setOpen((v) => !v);
	}, []);

	const handleSelect = useCallback(
		(optValue: string) => {
			onChange(optValue);
			closeAndRefocus();
		},
		[onChange, closeAndRefocus]
	);

	const handleMenuKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			switch (e.key) {
				case 'ArrowDown':
					e.preventDefault();
					setActiveIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
					break;
				case 'ArrowUp':
					e.preventDefault();
					setActiveIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
					break;
				case 'Home':
					e.preventDefault();
					setActiveIndex(0);
					break;
				case 'End':
					e.preventDefault();
					setActiveIndex(options.length - 1);
					break;
				case 'Enter':
				case ' ':
					e.preventDefault();
					if (activeIndex >= 0 && activeIndex < options.length) {
						handleSelect(options[activeIndex].value);
					}
					break;
				case 'Escape':
					closeAndRefocus();
					break;
			}
		},
		[options, activeIndex, handleSelect, closeAndRefocus]
	);

	const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

	return (
		<div ref={containerRef} style={{ position: 'relative', ...style }}>
			<button
				ref={triggerRef}
				type="button"
				id={id}
				aria-label={ariaLabel}
				aria-expanded={open}
				aria-haspopup="listbox"
				onClick={handleOpen}
				className={`focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1${className ? ` ${className}` : ''}`}
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					width: '100%',
					backgroundColor: theme.colors.bgActivity,
					border: `1px solid ${theme.colors.border}`,
					borderRadius: 4,
					color: theme.colors.textMain,
					padding: '4px 8px',
					fontSize: 12,
					outline: 'none',
					cursor: 'pointer',
					textAlign: 'left',
					gap: 4,
				}}
			>
				<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
					{selectedLabel}
				</span>
				<ChevronDown
					size={12}
					style={{
						flexShrink: 0,
						color: theme.colors.textDim,
						transform: open ? 'rotate(180deg)' : undefined,
						transition: 'transform 0.15s',
					}}
				/>
			</button>

			{open && (
				<div
					ref={menuRef}
					role="listbox"
					tabIndex={-1}
					aria-activedescendant={activeIndex >= 0 ? `${instanceId}-opt-${activeIndex}` : undefined}
					onKeyDown={handleMenuKeyDown}
					style={{
						position: 'absolute',
						left: 0,
						right: 0,
						...(dropUp ? { bottom: '100%', marginBottom: 4 } : { top: '100%', marginTop: 4 }),
						zIndex: 10000,
						backgroundColor: theme.colors.bgSidebar,
						border: `1px solid ${theme.colors.border}`,
						borderRadius: 6,
						boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
						overflow: 'hidden',
						maxHeight: 200,
						overflowY: 'auto',
						outline: 'none',
					}}
				>
					{options.map((opt, i) => (
						<button
							key={opt.value}
							id={`${instanceId}-opt-${i}`}
							type="button"
							role="option"
							aria-selected={opt.value === value}
							onClick={() => handleSelect(opt.value)}
							onMouseEnter={() => setActiveIndex(i)}
							style={{
								display: 'block',
								width: '100%',
								padding: '6px 10px',
								fontSize: 12,
								color: opt.value === value ? theme.colors.textMain : theme.colors.textDim,
								fontWeight: opt.value === value ? 500 : 400,
								backgroundColor: i === activeIndex ? theme.colors.bgActivity : 'transparent',
								border: 'none',
								cursor: 'pointer',
								textAlign: 'left',
								transition: 'background-color 0.1s',
							}}
						>
							{opt.label}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

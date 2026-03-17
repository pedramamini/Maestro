/**
 * QuitConfirmModal.tsx
 *
 * Confirmation modal displayed when user attempts to quit the app
 * while one or more AI agents are actively thinking (busy state).
 * Focus defaults to Cancel to prevent accidental data loss.
 */

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import type { Theme } from '../types';
import { useLayerStack } from '../contexts/LayerStackContext';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';

interface QuitConfirmModalProps {
	theme: Theme;
	/** Number of agents currently busy/thinking */
	busyAgentCount: number;
	/** Names of busy agents for display */
	busyAgentNames: string[];
	/** Callback when user confirms quit */
	onConfirmQuit: () => void;
	/** Callback when user cancels (stays in app) */
	onCancel: () => void;
}

/**
 * QuitConfirmModal - Confirmation dialog for quitting with active agents
 *
 * Warns the user that AI agents are actively thinking and quitting will
 * interrupt their work. Focus defaults to Cancel to prevent accidental quit.
 */
export function QuitConfirmModal({
	theme,
	busyAgentCount,
	busyAgentNames,
	onConfirmQuit,
	onCancel,
}: QuitConfirmModalProps): JSX.Element {
	const { t } = useTranslation('modals');
	const { registerLayer, unregisterLayer, updateLayerHandler } = useLayerStack();
	const layerIdRef = useRef<string>();
	const cancelButtonRef = useRef<HTMLButtonElement>(null);
	const onCancelRef = useRef(onCancel);
	onCancelRef.current = onCancel;

	// Focus Cancel button on mount (safer default action)
	useEffect(() => {
		cancelButtonRef.current?.focus();
	}, []);

	// Register with layer stack
	useEffect(() => {
		const id = registerLayer({
			type: 'modal',
			priority: MODAL_PRIORITIES.QUIT_CONFIRM,
			blocksLowerLayers: true,
			capturesFocus: true,
			focusTrap: 'strict',
			ariaLabel: t('quit_confirm.aria_label'),
			onEscape: () => onCancelRef.current(),
		});
		layerIdRef.current = id;
		return () => {
			if (layerIdRef.current) {
				unregisterLayer(layerIdRef.current);
			}
		};
	}, [registerLayer, unregisterLayer]);

	// Update escape handler when onCancel changes
	useEffect(() => {
		if (layerIdRef.current) {
			updateLayerHandler(layerIdRef.current, () => onCancelRef.current());
		}
	}, [onCancel, updateLayerHandler]);

	// Handle keyboard navigation
	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Tab') {
			// Let natural tab flow work
			return;
		}
		e.stopPropagation();
	};

	const agentText = busyAgentCount === 1 ? 'agent is' : 'agents are';
	const hasAutoRun = busyAgentNames.some((n) => n.includes('(Auto Run)'));
	const displayNames = busyAgentNames.slice(0, 3);
	const remainingCount = busyAgentNames.length - 3;

	return (
		<div
			className="fixed inset-0 modal-overlay flex items-center justify-center z-[10000] animate-in fade-in duration-200"
			role="dialog"
			aria-modal="true"
			aria-labelledby="quit-confirm-title"
			aria-describedby="quit-confirm-description"
			tabIndex={-1}
			onKeyDown={handleKeyDown}
		>
			<div
				className="w-[520px] border rounded-xl shadow-2xl overflow-hidden"
				style={{
					backgroundColor: theme.colors.bgSidebar,
					borderColor: theme.colors.border,
				}}
			>
				{/* Header */}
				<div
					className="p-4 border-b flex items-center gap-3"
					style={{ borderColor: theme.colors.border }}
				>
					<div className="p-2 rounded-lg" style={{ backgroundColor: `${theme.colors.warning}20` }}>
						<AlertTriangle className="w-5 h-5" style={{ color: theme.colors.warning }} />
					</div>
					<h2
						id="quit-confirm-title"
						className="text-base font-semibold"
						style={{ color: theme.colors.textMain }}
					>
						{t('quit_confirm.title')}
					</h2>
				</div>

				{/* Content */}
				<div className="p-6">
					<p
						id="quit-confirm-description"
						className="text-sm leading-relaxed"
						style={{ color: theme.colors.textMain }}
					>
						{t('quit_confirm.description', {
							count: busyAgentCount,
							agentText,
							status: hasAutoRun
								? t('quit_confirm.status_active')
								: t('quit_confirm.status_thinking'),
						})}
					</p>

					{/* List of busy agents */}
					<div
						className="mt-4 p-3 rounded-lg border"
						style={{
							backgroundColor: theme.colors.bgMain,
							borderColor: theme.colors.border,
						}}
					>
						<div className="text-xs font-medium mb-2" style={{ color: theme.colors.textDim }}>
							{t('quit_confirm.active_agents')}
						</div>
						<div className="flex flex-wrap gap-2">
							{displayNames.map((name, index) => (
								<span
									key={`${name}-${index}`}
									className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium"
									style={{
										backgroundColor: `${theme.colors.warning}15`,
										color: theme.colors.warning,
									}}
								>
									<span
										className="w-1.5 h-1.5 rounded-full animate-pulse"
										style={{ backgroundColor: theme.colors.warning }}
									/>
									{name}
								</span>
							))}
							{remainingCount > 0 && (
								<span
									className="inline-flex items-center px-2 py-1 rounded text-xs"
									style={{ color: theme.colors.textDim }}
								>
									{t('quit_confirm.more_agents', { count: remainingCount })}
								</span>
							)}
						</div>
					</div>

					{/* Actions */}
					<div className="mt-5 flex items-center justify-center gap-2 flex-nowrap">
						<button
							onClick={onConfirmQuit}
							className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-90 whitespace-nowrap"
							style={{
								backgroundColor: theme.colors.error,
								color: '#ffffff',
							}}
						>
							{t('quit_confirm.quit_button')}
						</button>
						<button
							ref={cancelButtonRef}
							onClick={onCancel}
							className="px-3 py-1.5 rounded-lg text-xs font-medium outline-none focus:ring-2 focus:ring-offset-1 transition-colors whitespace-nowrap"
							style={{
								backgroundColor: theme.colors.accent,
								color: theme.colors.accentForeground,
							}}
						>
							{t('quit_confirm.cancel_button')}
						</button>
					</div>

					{/* Keyboard hints */}
					<div className="mt-4 text-xs text-center" style={{ color: theme.colors.textDim }}>
						<kbd
							className="px-1.5 py-0.5 rounded border"
							style={{ borderColor: theme.colors.border }}
						>
							Tab
						</kbd>{' '}
						{t('quit_confirm.hint_switch')} •{' '}
						<kbd
							className="px-1.5 py-0.5 rounded border"
							style={{ borderColor: theme.colors.border }}
						>
							Enter
						</kbd>{' '}
						{t('quit_confirm.hint_confirm')} •{' '}
						<kbd
							className="px-1.5 py-0.5 rounded border"
							style={{ borderColor: theme.colors.border }}
						>
							Esc
						</kbd>{' '}
						{t('quit_confirm.hint_cancel')}
					</div>
				</div>
			</div>
		</div>
	);
}

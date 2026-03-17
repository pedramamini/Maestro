/**
 * DebugPackageModal - Preview and configure debug package generation
 *
 * This modal allows users to:
 * - Preview what will be included in the debug package
 * - Exclude specific categories via checkboxes
 * - See estimated sizes for each category
 * - Generate the package with a progress indicator
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Package, Check, Loader2, FolderOpen, AlertCircle, Copy } from 'lucide-react';
import type { Theme } from '../types';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';
import { Modal, ModalFooter } from './ui/Modal';
import { notifyToast } from '../stores/notificationStore';

interface DebugPackageModalProps {
	theme: Theme;
	isOpen: boolean;
	onClose: () => void;
}

interface PreviewCategory {
	id: string;
	name: string;
	included: boolean;
	sizeEstimate: string;
}

type GenerationState = 'idle' | 'generating' | 'success' | 'error';

export function DebugPackageModal({ theme, isOpen, onClose }: DebugPackageModalProps) {
	const { t } = useTranslation('modals');
	const generateButtonRef = useRef<HTMLButtonElement>(null);

	// Category selection state
	const [categories, setCategories] = useState<PreviewCategory[]>([]);
	const [loading, setLoading] = useState(true);

	// Generation state
	const [generationState, setGenerationState] = useState<GenerationState>('idle');
	const [resultPath, setResultPath] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	// Load preview data when modal opens
	useEffect(() => {
		if (isOpen) {
			setLoading(true);
			setGenerationState('idle');
			setResultPath(null);
			setErrorMessage(null);

			window.maestro.debug
				.previewPackage()
				.then((preview) => {
					setCategories(preview.categories);
					setLoading(false);
				})
				.catch((err) => {
					console.error('[DebugPackageModal] Failed to load preview:', err);
					// Use fallback categories if preview fails
					setCategories([
						{ id: 'system', name: 'System Information', included: true, sizeEstimate: '< 1 KB' },
						{ id: 'settings', name: 'Settings', included: true, sizeEstimate: '< 5 KB' },
						{ id: 'agents', name: 'Agent Configurations', included: true, sizeEstimate: '< 2 KB' },
						{ id: 'sessions', name: 'Session Metadata', included: true, sizeEstimate: '~10-50 KB' },
						{ id: 'logs', name: 'System Logs', included: true, sizeEstimate: '~50-200 KB' },
						{ id: 'errors', name: 'Error States', included: true, sizeEstimate: '< 10 KB' },
						{
							id: 'groupChats',
							name: 'Group Chat Metadata',
							included: true,
							sizeEstimate: '< 5 KB',
						},
						{ id: 'batchState', name: 'Auto Run State', included: true, sizeEstimate: '< 5 KB' },
					]);
					setLoading(false);
				});
		}
	}, [isOpen]);

	// Toggle category inclusion
	const toggleCategory = useCallback((categoryId: string) => {
		setCategories((prev) =>
			prev.map((cat) => (cat.id === categoryId ? { ...cat, included: !cat.included } : cat))
		);
	}, []);

	// Generate the debug package
	const handleGenerate = useCallback(async () => {
		setGenerationState('generating');
		setErrorMessage(null);

		try {
			// Map category toggles to options
			const options = {
				includeLogs: categories.find((c) => c.id === 'logs')?.included ?? true,
				includeErrors: categories.find((c) => c.id === 'errors')?.included ?? true,
				includeSessions: categories.find((c) => c.id === 'sessions')?.included ?? true,
				includeGroupChats: categories.find((c) => c.id === 'groupChats')?.included ?? true,
				includeBatchState: categories.find((c) => c.id === 'batchState')?.included ?? true,
			};

			const result = await window.maestro.debug.createPackage(options);

			if (result.cancelled) {
				setGenerationState('idle');
				return;
			}

			if (result.success && result.path) {
				setGenerationState('success');
				setResultPath(result.path);
				notifyToast({
					type: 'success',
					title: t('debug_package.toast_created_title'),
					message: t('debug_package.toast_created_message', { path: result.path }),
				});
			} else {
				setGenerationState('error');
				setErrorMessage(result.error || 'Unknown error occurred');
				notifyToast({
					type: 'error',
					title: t('debug_package.toast_failed_title'),
					message: result.error || t('debug_package.toast_failed_message'),
				});
			}
		} catch (err) {
			console.error('[DebugPackageModal] Generation failed:', err);
			setGenerationState('error');
			setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
			notifyToast({
				type: 'error',
				title: t('debug_package.toast_failed_title'),
				message: err instanceof Error ? err.message : t('debug_package.toast_failed_message'),
			});
		}
	}, [categories, t]);

	// Reveal the generated file in Finder
	const handleRevealInFinder = useCallback(() => {
		if (resultPath) {
			// Use shell to open the containing folder
			window.maestro.process
				.runCommand({
					sessionId: 'debug-package',
					command: `open -R "${resultPath}"`,
					cwd: '/',
					shell: '/bin/bash',
				})
				.catch(console.error);
		}
	}, [resultPath]);

	// Copy file path to clipboard
	const handleCopyPath = useCallback(() => {
		if (resultPath) {
			navigator.clipboard
				.writeText(resultPath)
				.then(() => {
					notifyToast({
						type: 'success',
						title: t('debug_package.toast_copied_title'),
						message: t('debug_package.toast_copied_message'),
					});
				})
				.catch(console.error);
		}
	}, [resultPath]);

	if (!isOpen) return null;

	// Calculate included count
	const includedCount = categories.filter((c) => c.included).length;
	const totalCount = categories.length;

	return (
		<Modal
			theme={theme}
			title={t('debug_package.title')}
			headerIcon={<Package className="w-4 h-4" style={{ color: theme.colors.accent }} />}
			priority={MODAL_PRIORITIES.DEBUG_PACKAGE}
			onClose={onClose}
			width={500}
			initialFocusRef={generateButtonRef}
			footer={
				generationState === 'success' ? (
					<>
						<button
							type="button"
							onClick={handleRevealInFinder}
							className="px-4 py-2 rounded border hover:bg-white/5 transition-colors flex items-center gap-2"
							style={{
								borderColor: theme.colors.border,
								color: theme.colors.textMain,
							}}
						>
							<FolderOpen className="w-4 h-4" />
							{t('debug_package.show_in_finder')}
						</button>
						<button
							type="button"
							onClick={onClose}
							className="px-4 py-2 rounded transition-colors"
							style={{
								backgroundColor: theme.colors.accent,
								color: theme.colors.accentForeground,
							}}
						>
							{t('debug_package.done_button')}
						</button>
					</>
				) : (
					<ModalFooter
						theme={theme}
						onCancel={onClose}
						onConfirm={handleGenerate}
						cancelLabel={t('debug_package.cancel_button')}
						confirmLabel={
							generationState === 'generating'
								? t('debug_package.generating_button')
								: t('debug_package.generate_button')
						}
						confirmDisabled={generationState === 'generating' || includedCount === 0}
						confirmButtonRef={generateButtonRef}
					/>
				)
			}
		>
			{/* Privacy notice */}
			<div
				className="mb-4 p-3 rounded-md text-xs"
				style={{
					backgroundColor: theme.colors.bgMain,
					borderLeft: `3px solid ${theme.colors.accent}`,
				}}
			>
				<p style={{ color: theme.colors.textMain }}>
					<strong>{t('debug_package.privacy_label')}</strong> {t('debug_package.privacy_notice')}
				</p>
			</div>

			{loading ? (
				<div className="flex items-center justify-center py-8">
					<Loader2 className="w-6 h-6 animate-spin" style={{ color: theme.colors.accent }} />
				</div>
			) : generationState === 'generating' ? (
				<div className="flex flex-col items-center justify-center py-8 gap-4">
					<Loader2 className="w-8 h-8 animate-spin" style={{ color: theme.colors.accent }} />
					<p className="text-sm" style={{ color: theme.colors.textDim }}>
						{t('debug_package.generating_message')}
					</p>
				</div>
			) : generationState === 'success' ? (
				<div className="flex flex-col items-center justify-center py-6 gap-4">
					<div
						className="w-12 h-12 rounded-full flex items-center justify-center"
						style={{ backgroundColor: `${theme.colors.success}20` }}
					>
						<Check className="w-6 h-6" style={{ color: theme.colors.success }} />
					</div>
					<div className="text-center">
						<p className="text-sm font-medium mb-2" style={{ color: theme.colors.textMain }}>
							{t('debug_package.success_message')}
						</p>
						<div className="flex items-center justify-center gap-2 px-4">
							<p className="text-xs break-all" style={{ color: theme.colors.textDim }}>
								{resultPath}
							</p>
							<button
								type="button"
								onClick={handleCopyPath}
								className="p-1 rounded hover:bg-white/10 transition-colors flex-shrink-0"
								style={{ color: theme.colors.textDim }}
								title={t('debug_package.copy_path_tooltip')}
							>
								<Copy className="w-3.5 h-3.5" />
							</button>
						</div>
					</div>
				</div>
			) : generationState === 'error' ? (
				<div className="flex flex-col items-center justify-center py-6 gap-4">
					<div
						className="w-12 h-12 rounded-full flex items-center justify-center"
						style={{ backgroundColor: `${theme.colors.error}20` }}
					>
						<AlertCircle className="w-6 h-6" style={{ color: theme.colors.error }} />
					</div>
					<div className="text-center">
						<p className="text-sm font-medium mb-2" style={{ color: theme.colors.textMain }}>
							{t('debug_package.failed_message')}
						</p>
						<p className="text-xs px-4" style={{ color: theme.colors.error }}>
							{errorMessage}
						</p>
					</div>
				</div>
			) : (
				<>
					{/* Category selection */}
					<div className="mb-4">
						<div className="flex items-center justify-between mb-2">
							<p className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
								{t('debug_package.select_what_to_include')}
							</p>
							<p className="text-xs" style={{ color: theme.colors.textDim }}>
								{t('debug_package.count_selected', { included: includedCount, total: totalCount })}
							</p>
						</div>

						<div
							className="border rounded-md overflow-hidden divide-y"
							style={{
								borderColor: theme.colors.border,
								// @ts-expect-error CSS custom property
								'--divide-color': theme.colors.border,
							}}
						>
							{categories.map((category) => (
								<label
									key={category.id}
									className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/5 transition-colors"
									style={{
										borderColor: theme.colors.border,
									}}
								>
									<div className="flex items-center gap-3">
										<div
											className="w-5 h-5 rounded border flex items-center justify-center transition-colors"
											style={{
												borderColor: category.included ? theme.colors.accent : theme.colors.border,
												backgroundColor: category.included ? theme.colors.accent : 'transparent',
											}}
										>
											{category.included && (
												<Check
													className="w-3 h-3"
													style={{ color: theme.colors.accentForeground }}
												/>
											)}
										</div>
										<span className="text-sm" style={{ color: theme.colors.textMain }}>
											{category.name}
										</span>
									</div>
									<span className="text-xs" style={{ color: theme.colors.textDim }}>
										{category.sizeEstimate}
									</span>
									<input
										type="checkbox"
										checked={category.included}
										onChange={() => toggleCategory(category.id)}
										className="sr-only"
									/>
								</label>
							))}
						</div>
					</div>

					{/* Submission instructions */}
					<div className="text-xs" style={{ color: theme.colors.textDim }}>
						<p className="mb-1">
							<strong style={{ color: theme.colors.textMain }}>
								{t('debug_package.submit_label')}
							</strong>
						</p>
						<ol className="list-decimal list-inside space-y-1">
							<li>{t('debug_package.submit_step1')}</li>
							<li>{t('debug_package.submit_step2')}</li>
							<li>{t('debug_package.submit_step3')}</li>
						</ol>
					</div>
				</>
			)}
		</Modal>
	);
}

export default DebugPackageModal;

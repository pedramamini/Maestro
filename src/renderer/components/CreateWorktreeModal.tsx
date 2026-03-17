import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, GitBranch, Loader2, AlertTriangle } from 'lucide-react';
import type { Theme, Session, GhCliStatus } from '../types';
import { useLayerStack } from '../contexts/LayerStackContext';
import { useI18n } from '../hooks/useI18n';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';

interface CreateWorktreeModalProps {
	isOpen: boolean;
	onClose: () => void;
	theme: Theme;
	session: Session;
	onCreateWorktree: (branchName: string) => Promise<void>;
}

/**
 * CreateWorktreeModal - Small modal for quickly creating a worktree from the session context menu
 *
 * This is a focused modal that just accepts a branch name input.
 * For full worktree configuration (base directory, watch settings), use WorktreeConfigModal.
 */
export function CreateWorktreeModal({
	isOpen,
	onClose,
	theme,
	session,
	onCreateWorktree,
}: CreateWorktreeModalProps) {
	const { t } = useTranslation('modals');
	const { t: tA } = useI18n('accessibility');
	const { registerLayer, unregisterLayer } = useLayerStack();
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;

	// Form state
	const [branchName, setBranchName] = useState('');
	const [isCreating, setIsCreating] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// gh CLI status
	const [ghCliStatus, setGhCliStatus] = useState<GhCliStatus | null>(null);

	// Input ref for auto-focus
	const inputRef = useRef<HTMLInputElement>(null);

	// Register with layer stack for Escape handling
	useEffect(() => {
		if (isOpen) {
			const id = registerLayer({
				type: 'modal',
				priority: MODAL_PRIORITIES.CREATE_WORKTREE,
				onEscape: () => onCloseRef.current(),
				blocksLowerLayers: true,
				capturesFocus: true,
				focusTrap: 'lenient',
			});
			return () => unregisterLayer(id);
		}
	}, [isOpen, registerLayer, unregisterLayer]);

	// Check gh CLI status and reset state on open
	useEffect(() => {
		if (isOpen) {
			checkGhCli();
			setBranchName('');
			setError(null);
			// Auto-focus the input
			setTimeout(() => inputRef.current?.focus(), 50);
		}
	}, [isOpen]);

	const checkGhCli = async () => {
		try {
			const status = await window.maestro.git.checkGhCli();
			setGhCliStatus(status);
		} catch {
			setGhCliStatus({ installed: false, authenticated: false });
		}
	};

	const handleCreate = async () => {
		const trimmedName = branchName.trim();
		if (!trimmedName) {
			setError(t('create_worktree.enter_branch_error'));
			return;
		}

		// Basic branch name validation
		if (!/^[\w\-./]+$/.test(trimmedName)) {
			setError(t('create_worktree.invalid_branch_error'));
			return;
		}

		setIsCreating(true);
		setError(null);

		try {
			await onCreateWorktree(trimmedName);
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : t('create_worktree.failed_to_create'));
		} finally {
			setIsCreating(false);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' && branchName.trim() && !isCreating) {
			handleCreate();
		}
	};

	if (!isOpen) return null;

	const hasWorktreeConfig = !!session.worktreeConfig?.basePath;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			{/* Backdrop */}
			<div className="absolute inset-0 bg-black/60" onClick={onClose} />

			{/* Modal */}
			<div
				className="relative w-full max-w-md rounded-lg shadow-2xl border"
				style={{
					backgroundColor: theme.colors.bgSidebar,
					borderColor: theme.colors.border,
				}}
			>
				{/* Header */}
				<div
					className="flex items-center justify-between px-4 py-3 border-b"
					style={{ borderColor: theme.colors.border }}
				>
					<div className="flex items-center gap-2">
						<GitBranch className="w-5 h-5" style={{ color: theme.colors.accent }} />
						<h2 className="font-bold" style={{ color: theme.colors.textMain }}>
							{t('create_worktree.title')}
						</h2>
					</div>
					<button
						onClick={onClose}
						className="p-1 rounded hover:bg-white/10 transition-colors"
						aria-label={tA('modal.close')}
					>
						<X className="w-4 h-4" style={{ color: theme.colors.textDim }} />
					</button>
				</div>

				{/* Content */}
				<div className="p-4 space-y-4">
					{/* gh CLI warning */}
					{ghCliStatus !== null && !ghCliStatus.installed && (
						<div
							className="flex items-start gap-2 p-3 rounded border"
							style={{
								backgroundColor: theme.colors.warning + '10',
								borderColor: theme.colors.warning,
							}}
						>
							<AlertTriangle
								className="w-4 h-4 mt-0.5 shrink-0"
								style={{ color: theme.colors.warning }}
							/>
							<div className="text-sm">
								<p style={{ color: theme.colors.warning }}>{t('create_worktree.gh_recommended')}</p>
								<p className="mt-1" style={{ color: theme.colors.textDim }}>
									{t('create_worktree.gh_install_prefix')}{' '}
									<button
										type="button"
										className="underline hover:opacity-80"
										style={{ color: theme.colors.accent }}
										onClick={() => window.maestro.shell.openExternal('https://cli.github.com')}
									>
										{t('create_worktree.gh_cli_link')}
									</button>{' '}
									{t('create_worktree.gh_recommended_description')}
								</p>
							</div>
						</div>
					)}

					{/* No base path configured warning */}
					{!hasWorktreeConfig && (
						<div
							className="flex items-start gap-2 p-3 rounded border"
							style={{
								backgroundColor: theme.colors.warning + '10',
								borderColor: theme.colors.warning,
							}}
						>
							<AlertTriangle
								className="w-4 h-4 mt-0.5 shrink-0"
								style={{ color: theme.colors.warning }}
							/>
							<div className="text-sm">
								<p style={{ color: theme.colors.warning }}>
									{t('create_worktree.no_config_title')}
								</p>
								<p className="mt-1" style={{ color: theme.colors.textDim }}>
									{t('create_worktree.no_config_description')}
								</p>
							</div>
						</div>
					)}

					{/* Branch Name Input */}
					<div>
						<label
							className="text-xs font-bold uppercase mb-1.5 block"
							style={{ color: theme.colors.textDim }}
						>
							{t('create_worktree.branch_name_label')}
						</label>
						<input
							ref={inputRef}
							type="text"
							value={branchName}
							onChange={(e) => setBranchName(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder={t('create_worktree.branch_placeholder')}
							className="w-full px-3 py-2 rounded border bg-transparent outline-none text-sm"
							style={{
								borderColor: theme.colors.border,
								color: theme.colors.textMain,
							}}
							disabled={isCreating}
							autoFocus
						/>
						{hasWorktreeConfig && (
							<p className="text-[10px] mt-1" style={{ color: theme.colors.textDim }}>
								{t('create_worktree.will_be_created_at', {
									path: session.worktreeConfig?.basePath,
									branch: branchName || '...',
								})}
							</p>
						)}
					</div>

					{/* Error message */}
					{error && (
						<div
							className="flex items-start gap-2 p-3 rounded border"
							style={{
								backgroundColor: theme.colors.error + '10',
								borderColor: theme.colors.error,
							}}
						>
							<AlertTriangle
								className="w-4 h-4 mt-0.5 shrink-0"
								style={{ color: theme.colors.error }}
							/>
							<p className="text-sm" style={{ color: theme.colors.error }}>
								{error}
							</p>
						</div>
					)}
				</div>

				{/* Footer */}
				<div
					className="flex items-center justify-end gap-2 px-4 py-3 border-t"
					style={{ borderColor: theme.colors.border }}
				>
					<button
						onClick={onClose}
						className="px-4 py-2 rounded text-sm hover:bg-white/10 transition-colors"
						style={{ color: theme.colors.textMain }}
						disabled={isCreating}
					>
						{t('create_worktree.cancel_button')}
					</button>
					<button
						onClick={handleCreate}
						disabled={!branchName.trim() || isCreating}
						className={`px-4 py-2 rounded text-sm font-medium flex items-center gap-2 transition-colors ${
							branchName.trim() && !isCreating
								? 'hover:opacity-90'
								: 'opacity-50 cursor-not-allowed'
						}`}
						style={{
							backgroundColor: theme.colors.accent,
							color: theme.colors.accentForeground,
						}}
					>
						{isCreating ? (
							<>
								<Loader2 className="w-4 h-4 animate-spin" />
								{t('create_worktree.creating_button')}
							</>
						) : (
							t('create_worktree.create_button')
						)}
					</button>
				</div>
			</div>
		</div>
	);
}

export default CreateWorktreeModal;

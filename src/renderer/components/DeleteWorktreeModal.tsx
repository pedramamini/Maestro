import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import type { Theme, Session } from '../types';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';
import { Modal } from './ui/Modal';

interface DeleteWorktreeModalProps {
	theme: Theme;
	session: Session;
	onClose: () => void;
	onConfirm: () => void;
	onConfirmAndDelete: () => Promise<void>;
}

/**
 * DeleteWorktreeModal - Confirmation modal for deleting a worktree session
 *
 * Provides three options:
 * - Cancel: Close without action
 * - Confirm: Remove the sub-agent but keep the worktree directory on disk
 * - Confirm and Delete on Disk: Remove the sub-agent AND delete the worktree directory
 */
export function DeleteWorktreeModal({
	theme,
	session,
	onClose,
	onConfirm,
	onConfirmAndDelete,
}: DeleteWorktreeModalProps) {
	const { t } = useTranslation('modals');
	const confirmButtonRef = useRef<HTMLButtonElement>(null);
	const [isDeleting, setIsDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleConfirm = () => {
		onConfirm();
		onClose();
	};

	const handleConfirmAndDelete = async () => {
		setIsDeleting(true);
		setError(null);
		try {
			await onConfirmAndDelete();
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : t('delete_worktree.failed_to_delete'));
			setIsDeleting(false);
		}
	};

	return (
		<Modal
			theme={theme}
			title={t('delete_worktree.title')}
			priority={MODAL_PRIORITIES.CONFIRM}
			onClose={onClose}
			headerIcon={<Trash2 className="w-4 h-4" style={{ color: theme.colors.error }} />}
			width={540}
			zIndex={10000}
			initialFocusRef={confirmButtonRef}
			footer={
				<div className="flex gap-2 w-full flex-nowrap">
					{isDeleting ? (
						<button
							type="button"
							disabled
							className="px-3 py-1.5 rounded transition-colors outline-none flex items-center justify-center gap-1.5 text-xs whitespace-nowrap ml-auto"
							style={{
								backgroundColor: theme.colors.error,
								color: '#ffffff',
								opacity: 0.7,
							}}
						>
							<Loader2 className="w-3 h-3 animate-spin" />
							{t('delete_worktree.deleting_button')}
						</button>
					) : (
						<>
							<button
								type="button"
								onClick={onClose}
								onKeyDown={(e) => {
									if (e.key === 'Enter') {
										e.stopPropagation();
										onClose();
									}
								}}
								className="px-3 py-1.5 rounded border hover:bg-white/5 transition-colors outline-none focus:ring-2 focus:ring-offset-1 text-xs whitespace-nowrap mr-auto"
								style={{
									borderColor: theme.colors.border,
									color: theme.colors.textMain,
								}}
							>
								{t('delete_worktree.cancel_button')}
							</button>
							<button
								ref={confirmButtonRef}
								type="button"
								onClick={handleConfirm}
								onKeyDown={(e) => {
									if (e.key === 'Enter') {
										e.stopPropagation();
										handleConfirm();
									}
								}}
								className="px-3 py-1.5 rounded transition-colors outline-none focus:ring-2 focus:ring-offset-1 text-xs whitespace-nowrap"
								style={{
									backgroundColor: `${theme.colors.error}99`,
									color: '#ffffff',
								}}
							>
								{t('delete_worktree.remove_button')}
							</button>
							<button
								type="button"
								onClick={handleConfirmAndDelete}
								onKeyDown={(e) => {
									if (e.key === 'Enter') {
										e.stopPropagation();
										handleConfirmAndDelete();
									}
								}}
								className="px-3 py-1.5 rounded transition-colors outline-none focus:ring-2 focus:ring-offset-1 text-xs whitespace-nowrap"
								style={{
									backgroundColor: theme.colors.error,
									color: '#ffffff',
								}}
							>
								{t('delete_worktree.remove_delete_button')}
							</button>
						</>
					)}
				</div>
			}
		>
			<div className="flex gap-4">
				<div
					className="flex-shrink-0 p-2 rounded-full h-fit"
					style={{ backgroundColor: `${theme.colors.error}20` }}
				>
					<AlertTriangle className="w-5 h-5" style={{ color: theme.colors.error }} />
				</div>
				<div className="space-y-3">
					<p className="leading-relaxed" style={{ color: theme.colors.textMain }}>
						{t('delete_worktree.confirm_message', { name: session.name })}
					</p>
					<div className="text-sm space-y-2" style={{ color: theme.colors.textDim }}>
						<p>
							<strong style={{ color: theme.colors.textMain }}>
								{t('delete_worktree.remove_label')}
							</strong>{' '}
							{t('delete_worktree.remove_keep_description')}
						</p>
						<p>
							<strong style={{ color: theme.colors.textMain }}>
								{t('delete_worktree.remove_delete_label')}
							</strong>{' '}
							{t('delete_worktree.remove_delete_description')}
						</p>
					</div>
					{session.cwd && (
						<p
							className="text-xs font-mono px-2 py-1.5 rounded truncate"
							style={{
								backgroundColor: theme.colors.bgActivity,
								color: theme.colors.textDim,
							}}
							title={session.cwd}
						>
							{session.cwd}
						</p>
					)}
					{error && (
						<p className="text-xs" style={{ color: theme.colors.error }}>
							{error}
						</p>
					)}
				</div>
			</div>
		</Modal>
	);
}

export default DeleteWorktreeModal;

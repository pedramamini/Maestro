import { useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import type { Theme } from '../types';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';
import { Modal, ModalFooter } from './ui/Modal';

interface ResetTasksConfirmModalProps {
	theme: Theme;
	documentName: string;
	completedTaskCount: number;
	onConfirm: () => void;
	onClose: () => void;
}

export function ResetTasksConfirmModal({
	theme,
	documentName,
	completedTaskCount,
	onConfirm,
	onClose,
}: ResetTasksConfirmModalProps) {
	const { t } = useTranslation('modals');
	const confirmButtonRef = useRef<HTMLButtonElement>(null);

	const handleConfirm = useCallback(() => {
		onConfirm();
		onClose();
	}, [onConfirm, onClose]);

	return (
		<Modal
			theme={theme}
			title={t('reset_tasks.title')}
			priority={MODAL_PRIORITIES.AUTORUN_RESET_TASKS}
			onClose={onClose}
			width={450}
			initialFocusRef={confirmButtonRef}
			footer={
				<ModalFooter
					theme={theme}
					onCancel={onClose}
					onConfirm={handleConfirm}
					confirmLabel={t('reset_tasks.reset_button')}
					confirmButtonRef={confirmButtonRef}
				/>
			}
		>
			<div className="flex items-start gap-3">
				<div
					className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
					style={{ backgroundColor: theme.colors.warning + '20' }}
				>
					<RotateCcw className="w-5 h-5" style={{ color: theme.colors.warning }} />
				</div>
				<div>
					<p className="text-sm leading-relaxed mb-2" style={{ color: theme.colors.textMain }}>
						{t('reset_tasks.confirm_message', { count: completedTaskCount, documentName })}
					</p>
					<p className="text-xs" style={{ color: theme.colors.textDim }}>
						{t('reset_tasks.warning_message')}
					</p>
				</div>
			</div>
		</Modal>
	);
}

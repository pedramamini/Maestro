import React, { memo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Theme } from '../types';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';
import { Modal, ModalFooter } from './ui/Modal';
import { FormInput } from './ui/FormInput';

interface RenameTabModalProps {
	theme: Theme;
	initialName: string;
	agentSessionId?: string | null;
	onClose: () => void;
	onRename: (newName: string) => void;
}

export const RenameTabModal = memo(function RenameTabModal(props: RenameTabModalProps) {
	const { theme, initialName, agentSessionId, onClose, onRename } = props;
	const { t } = useTranslation('modals');
	const inputRef = useRef<HTMLInputElement>(null);
	const [value, setValue] = useState(initialName);

	// Generate placeholder with UUID octet if available
	const placeholder = agentSessionId
		? t('rename_tab.placeholder_with_id', { id: agentSessionId.split('-')[0].toUpperCase() })
		: t('rename_tab.placeholder_default');

	const handleRename = () => {
		onRename(value.trim());
		onClose();
	};

	return (
		<Modal
			theme={theme}
			title={t('rename_tab.title')}
			priority={MODAL_PRIORITIES.RENAME_TAB}
			onClose={onClose}
			width={400}
			initialFocusRef={inputRef as React.RefObject<HTMLElement>}
			footer={
				<ModalFooter
					theme={theme}
					onCancel={onClose}
					onConfirm={handleRename}
					confirmLabel={t('rename_tab.rename_button')}
				/>
			}
		>
			<FormInput
				ref={inputRef}
				theme={theme}
				value={value}
				onChange={setValue}
				onSubmit={handleRename}
				placeholder={placeholder}
			/>
		</Modal>
	);
});

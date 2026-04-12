import type { Theme, Session } from '../types';
import { Modal } from './ui/Modal';
import { FeedbackView } from './FeedbackView';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';

interface FeedbackModalProps {
	theme: Theme;
	sessions: Session[];
	onClose: () => void;
	onSwitchToSession: (sessionId: string) => void;
}

export function FeedbackModal({ theme, sessions, onClose, onSwitchToSession }: FeedbackModalProps) {
	return (
		<Modal
			theme={theme}
			title="Send Feedback"
			priority={MODAL_PRIORITIES.FEEDBACK}
			onClose={onClose}
			width={450}
		>
			<FeedbackView
				theme={theme}
				sessions={sessions}
				onCancel={onClose}
				onSubmitSuccess={(sid) => {
					onSwitchToSession(sid);
					onClose();
				}}
			/>
		</Modal>
	);
}

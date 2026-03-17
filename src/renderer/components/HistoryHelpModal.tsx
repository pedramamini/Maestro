import { memo } from 'react';
import {
	History,
	Play,
	Clock,
	DollarSign,
	BarChart2,
	CheckCircle,
	Bot,
	User,
	Eye,
	Layers,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Theme } from '../types';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';
import { Modal } from './ui/Modal';

interface HistoryHelpModalProps {
	theme: Theme;
	onClose: () => void;
}

export const HistoryHelpModal = memo(function HistoryHelpModal({
	theme,
	onClose,
}: HistoryHelpModalProps) {
	const { t } = useTranslation('modals');
	return (
		<Modal
			theme={theme}
			title={t('history_help.title')}
			priority={MODAL_PRIORITIES.CONFIRM}
			onClose={onClose}
			width={672}
			maxHeight="80vh"
			closeOnBackdropClick
			zIndex={50}
			footer={
				<button
					onClick={onClose}
					className="px-4 py-2 rounded text-sm font-medium transition-colors hover:opacity-90"
					style={{
						backgroundColor: theme.colors.accent,
						color: 'white',
					}}
				>
					{t('history_help.got_it_button')}
				</button>
			}
		>
			<div className="space-y-6" style={{ color: theme.colors.textMain }}>
				{/* Introduction */}
				<section>
					<p className="text-sm leading-relaxed" style={{ color: theme.colors.textDim }}>
						{t('history_help.intro_description')}
					</p>
				</section>

				{/* Entry Types */}
				<section>
					<div className="flex items-center gap-2 mb-3">
						<History className="w-5 h-5" style={{ color: theme.colors.accent }} />
						<h3 className="font-bold">{t('history_help.entry_types.title')}</h3>
					</div>
					<div className="text-sm space-y-3 pl-7" style={{ color: theme.colors.textDim }}>
						<div className="flex items-start gap-3">
							<span
								className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase shrink-0"
								style={{
									backgroundColor: theme.colors.accent + '20',
									color: theme.colors.accent,
									border: `1px solid ${theme.colors.accent}40`,
								}}
							>
								<User className="w-2.5 h-2.5" />
								USER
							</span>
							<p>
								{t('history_help.entry_types.user_description_before_history')}{' '}
								<code className="px-1 rounded" style={{ backgroundColor: theme.colors.bgActivity }}>
									/history
								</code>{' '}
								{t('history_help.entry_types.user_description_since_last')}{' '}
								<code className="px-1 rounded" style={{ backgroundColor: theme.colors.bgActivity }}>
									/history
								</code>
								{t('history_help.entry_types.user_description_or_using')}{' '}
								<code className="px-1 rounded" style={{ backgroundColor: theme.colors.bgActivity }}>
									/clear
								</code>
								.
							</p>
						</div>
						<div className="flex items-start gap-3">
							<span
								className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase shrink-0"
								style={{
									backgroundColor: theme.colors.warning + '20',
									color: theme.colors.warning,
									border: `1px solid ${theme.colors.warning}40`,
								}}
							>
								<Bot className="w-2.5 h-2.5" />
								AUTO
							</span>
							<p>{t('history_help.entry_types.auto_description')}</p>
						</div>
					</div>
				</section>

				{/* Success Indicators */}
				<section>
					<div className="flex items-center gap-2 mb-3">
						<CheckCircle className="w-5 h-5" style={{ color: theme.colors.success }} />
						<h3 className="font-bold">{t('history_help.status.title')}</h3>
					</div>
					<div className="text-sm space-y-3 pl-7" style={{ color: theme.colors.textDim }}>
						<p>
							<span style={{ color: theme.colors.warning }}>AUTO</span>{' '}
							{t('history_help.status.auto_entries_description')}
						</p>
						<div className="flex items-center gap-4">
							<div className="flex items-center gap-2">
								<span
									className="flex items-center justify-center w-5 h-5 rounded-full"
									style={{
										backgroundColor: theme.colors.success + '20',
										border: `1px solid ${theme.colors.success}40`,
									}}
								>
									<CheckCircle className="w-3 h-3" style={{ color: theme.colors.success }} />
								</span>
								<span>{t('history_help.status.task_completed')}</span>
							</div>
						</div>
						<div className="flex items-center gap-4">
							<div className="flex items-center gap-2">
								<span
									className="flex items-center justify-center w-5 h-5 rounded-full"
									style={{
										backgroundColor: theme.colors.success + '40',
										border: `1px solid ${theme.colors.success}60`,
									}}
								>
									<svg
										className="w-3 h-3"
										style={{ color: theme.colors.success }}
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="3"
										strokeLinecap="round"
										strokeLinejoin="round"
									>
										<polyline points="15 6 6 17 1 12" />
										<polyline points="23 6 14 17 11 14" />
									</svg>
								</span>
								<span>
									{t('history_help.status.task_completed')}{' '}
									<strong style={{ color: theme.colors.textMain }}>
										{t('history_help.status.and_human_validated')}
									</strong>
								</span>
							</div>
						</div>
						<p className="mt-2">
							{t('history_help.status.validate_description_before')}{' '}
							<strong style={{ color: theme.colors.textMain }}>
								{t('history_help.status.validated_label')}
							</strong>{' '}
							{t('history_help.status.validate_description_after')}
						</p>
					</div>
				</section>

				{/* Detail View */}
				<section>
					<div className="flex items-center gap-2 mb-3">
						<Eye className="w-5 h-5" style={{ color: theme.colors.accent }} />
						<h3 className="font-bold">{t('history_help.details.title')}</h3>
					</div>
					<div className="text-sm space-y-2 pl-7" style={{ color: theme.colors.textDim }}>
						<p>{t('history_help.details.description')}</p>
						<ul className="list-disc list-inside space-y-1 ml-2">
							<li>{t('history_help.details.item_synopsis')}</li>
							<li>{t('history_help.details.item_token_usage')}</li>
							<li>{t('history_help.details.item_context_window')}</li>
							<li>{t('history_help.details.item_elapsed_time')}</li>
							<li>{t('history_help.details.item_cost')}</li>
						</ul>
					</div>
				</section>

				{/* Resume Session */}
				<section>
					<div className="flex items-center gap-2 mb-3">
						<Play className="w-5 h-5" style={{ color: theme.colors.success }} />
						<h3 className="font-bold">{t('history_help.resume.title')}</h3>
					</div>
					<div className="text-sm space-y-2 pl-7" style={{ color: theme.colors.textDim }}>
						<p>
							{t('history_help.resume.description_before')}{' '}
							<strong style={{ color: theme.colors.success }}>
								{t('history_help.resume.resume_button')}
							</strong>{' '}
							{t('history_help.resume.description_after')}
						</p>
						<p>{t('history_help.resume.pick_up_description')}</p>
					</div>
				</section>

				{/* Time and Cost */}
				<section>
					<div className="flex items-center gap-2 mb-3">
						<div className="flex items-center gap-1">
							<Clock className="w-5 h-5" style={{ color: theme.colors.accent }} />
							<DollarSign className="w-5 h-5" style={{ color: theme.colors.success }} />
						</div>
						<h3 className="font-bold">{t('history_help.time_cost.title')}</h3>
					</div>
					<div className="text-sm space-y-2 pl-7" style={{ color: theme.colors.textDim }}>
						<p>{t('history_help.time_cost.description')}</p>
					</div>
				</section>

				{/* Activity Graph */}
				<section>
					<div className="flex items-center gap-2 mb-3">
						<BarChart2 className="w-5 h-5" style={{ color: theme.colors.accent }} />
						<h3 className="font-bold">{t('history_help.activity_graph.title')}</h3>
					</div>
					<div className="text-sm space-y-2 pl-7" style={{ color: theme.colors.textDim }}>
						<p>{t('history_help.activity_graph.description')}</p>
						<p className="mt-2">
							<strong style={{ color: theme.colors.textMain }}>
								{t('history_help.activity_graph.right_click_label')}
							</strong>{' '}
							{t('history_help.activity_graph.right_click_description')}
						</p>
						<p>
							<strong style={{ color: theme.colors.textMain }}>
								{t('history_help.activity_graph.click_bar_label')}
							</strong>{' '}
							{t('history_help.activity_graph.click_bar_description')}
						</p>
						<p>{t('history_help.activity_graph.hover_description')}</p>
					</div>
				</section>

				{/* Per-Session Storage */}
				<section>
					<div className="flex items-center gap-2 mb-3">
						<Layers className="w-5 h-5" style={{ color: theme.colors.accent }} />
						<h3 className="font-bold">{t('history_help.per_session.title')}</h3>
					</div>
					<div className="text-sm space-y-2 pl-7" style={{ color: theme.colors.textDim }}>
						<p>
							{t('history_help.per_session.description_before')}{' '}
							<strong style={{ color: theme.colors.textMain }}>
								{t('history_help.per_session.entry_limit')}
							</strong>
							. {t('history_help.per_session.description_after')}
						</p>
						<p>
							{t('history_help.per_session.toggle_description_before')}{' '}
							<span
								className="inline-flex items-center justify-center w-5 h-5 rounded"
								style={{
									border: `1px solid ${theme.colors.border}`,
									verticalAlign: 'middle',
								}}
							>
								<Layers className="w-3 h-3" />
							</span>{' '}
							{t('history_help.per_session.toggle_description_after')}
						</p>
					</div>
				</section>

				{/* Cross-Session Memory */}
				<section>
					<div className="flex items-center gap-2 mb-3">
						<Bot className="w-5 h-5" style={{ color: theme.colors.accent }} />
						<h3 className="font-bold">{t('history_help.cross_session.title')}</h3>
					</div>
					<div className="text-sm space-y-2 pl-7" style={{ color: theme.colors.textDim }}>
						<p>
							{t('history_help.cross_session.description_before')}{' '}
							<strong style={{ color: theme.colors.textMain }}>
								{t('history_help.cross_session.cross_tab_memory')}
							</strong>
							. {t('history_help.cross_session.description_after')}
						</p>
						<p>{t('history_help.cross_session.json_description')}</p>
						<p>
							<strong style={{ color: theme.colors.warning }}>
								{t('history_help.cross_session.note_label')}
							</strong>{' '}
							{t('history_help.cross_session.ssh_note')}
						</p>
					</div>
				</section>
			</div>
		</Modal>
	);
});

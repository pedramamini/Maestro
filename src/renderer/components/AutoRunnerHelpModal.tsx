import {
	FolderOpen,
	FileText,
	CheckSquare,
	Play,
	Settings,
	History,
	Eye,
	Square,
	Keyboard,
	Repeat,
	RotateCcw,
	BookMarked,
	Image,
	Variable,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Theme } from '../types';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';
import { Modal } from './ui/Modal';
import { formatShortcutKeys } from '../utils/shortcutFormatter';

interface AutoRunnerHelpModalProps {
	theme: Theme;
	onClose: () => void;
}

export function AutoRunnerHelpModal({ theme, onClose }: AutoRunnerHelpModalProps) {
	const { t } = useTranslation('modals');
	return (
		<Modal
			theme={theme}
			title={t('autorun_help.title')}
			priority={MODAL_PRIORITIES.CONFIRM}
			onClose={onClose}
			width={672}
			maxHeight="85vh"
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
					{t('autorun_help.got_it_button')}
				</button>
			}
		>
			<div className="space-y-6" style={{ color: theme.colors.textMain }}>
				{/* Introduction */}
				<section>
					<p className="text-sm leading-relaxed" style={{ color: theme.colors.textDim }}>
						{t('autorun_help.intro.description_before')}{' '}
						<strong style={{ color: theme.colors.textMain }}>
							{t('autorun_help.intro.playbook_label')}
						</strong>
						.
					</p>
				</section>

				{/* Setting Up */}
				<section>
					<div className="flex items-center gap-2 mb-3">
						<FolderOpen className="w-5 h-5" style={{ color: theme.colors.accent }} />
						<h3 className="font-bold">{t('autorun_help.setup.title')}</h3>
					</div>
					<div className="text-sm space-y-2 pl-7" style={{ color: theme.colors.textDim }}>
						<p>{t('autorun_help.setup.description')}</p>
						<p>
							{t('autorun_help.setup.change_folder_before')}{' '}
							<strong style={{ color: theme.colors.textMain }}>
								{t('autorun_help.setup.change_folder_label')}
							</strong>{' '}
							{t('autorun_help.setup.change_folder_after')}
						</p>
					</div>
				</section>

				{/* Document Format */}
				<section>
					<div className="flex items-center gap-2 mb-3">
						<FileText className="w-5 h-5" style={{ color: theme.colors.accent }} />
						<h3 className="font-bold">{t('autorun_help.format.title')}</h3>
					</div>
					<div className="text-sm space-y-2 pl-7" style={{ color: theme.colors.textDim }}>
						<p>
							{t('autorun_help.format.description_before')} (<code>.md</code>){' '}
							{t('autorun_help.format.description_after')}
						</p>
						<div
							className="font-mono text-xs p-3 rounded border"
							style={{
								backgroundColor: theme.colors.bgActivity,
								borderColor: theme.colors.border,
							}}
						>
							# Feature Plan
							<br />
							<br />
							- [ ] Implement user authentication
							<br />
							- [ ] Add unit tests for the login flow
							<br />
							- [ ] Update API documentation
							<br />- [ ] Review and optimize database queries
						</div>
						<p>
							{t('autorun_help.format.processing_description_before')} (<code>- [x]</code>){' '}
							{t('autorun_help.format.processing_description_after')}
						</p>
					</div>
				</section>

				{/* Creating Tasks */}
				<section>
					<div className="flex items-center gap-2 mb-3">
						<CheckSquare className="w-5 h-5" style={{ color: theme.colors.accent }} />
						<h3 className="font-bold">{t('autorun_help.tasks.title')}</h3>
					</div>
					<div className="text-sm space-y-2 pl-7" style={{ color: theme.colors.textDim }}>
						<div
							className="flex items-center gap-2 px-3 py-2 rounded"
							style={{ backgroundColor: theme.colors.accent + '15' }}
						>
							<Keyboard className="w-4 h-4" style={{ color: theme.colors.accent }} />
							<span>
								<strong style={{ color: theme.colors.textMain }}>
									{t('autorun_help.tasks.quick_insert_label')}
								</strong>{' '}
								{t('autorun_help.tasks.quick_insert_press')}{' '}
								<kbd
									className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold"
									style={{
										backgroundColor: theme.colors.bgActivity,
										border: `1px solid ${theme.colors.border}`,
									}}
								>
									{formatShortcutKeys(['Meta', 'l'])}
								</kbd>{' '}
								{t('autorun_help.tasks.quick_insert_action')}
							</span>
						</div>
						<p>{t('autorun_help.tasks.description')}</p>
						<p>
							<strong style={{ color: theme.colors.textMain }}>
								{t('autorun_help.tasks.tip_label')}
							</strong>{' '}
							{t('autorun_help.tasks.tip_description_before')} (<code>FEAT-001:</code>){' '}
							{t('autorun_help.tasks.tip_description_after')}
						</p>
					</div>
				</section>

				{/* Image Attachments */}
				<section>
					<div className="flex items-center gap-2 mb-3">
						<Image className="w-5 h-5" style={{ color: theme.colors.accent }} />
						<h3 className="font-bold">{t('autorun_help.images.title')}</h3>
					</div>
					<div className="text-sm space-y-2 pl-7" style={{ color: theme.colors.textDim }}>
						<p>
							{t('autorun_help.images.description_before')} <code>images/</code>{' '}
							{t('autorun_help.images.description_after')}
						</p>
						<p>{t('autorun_help.images.context_description')}</p>
					</div>
				</section>

				{/* Running Single Document */}
				<section>
					<div className="flex items-center gap-2 mb-3">
						<Play className="w-5 h-5" style={{ color: theme.colors.accent }} />
						<h3 className="font-bold">{t('autorun_help.single_doc.title')}</h3>
					</div>
					<div className="text-sm space-y-2 pl-7" style={{ color: theme.colors.textDim }}>
						<p>
							{t('autorun_help.single_doc.click_run_before')}{' '}
							<strong style={{ color: theme.colors.textMain }}>
								{t('autorun_help.single_doc.run_label')}
							</strong>{' '}
							{t('autorun_help.single_doc.click_run_after')}
						</p>
						<p>{t('autorun_help.single_doc.spawn_description')}</p>
						<p>{t('autorun_help.single_doc.file_path_description')}</p>
					</div>
				</section>

				{/* Running Multiple Documents */}
				<section>
					<div className="flex items-center gap-2 mb-3">
						<Settings className="w-5 h-5" style={{ color: theme.colors.accent }} />
						<h3 className="font-bold">{t('autorun_help.multi_doc.title')}</h3>
					</div>
					<div className="text-sm space-y-2 pl-7" style={{ color: theme.colors.textDim }}>
						<p>
							{t('autorun_help.multi_doc.add_docs_before')}{' '}
							<strong style={{ color: theme.colors.textMain }}>
								{t('autorun_help.multi_doc.add_docs_label')}
							</strong>{' '}
							{t('autorun_help.multi_doc.add_docs_after')}
						</p>
						<p>
							<strong style={{ color: theme.colors.textMain }}>
								{t('autorun_help.multi_doc.drag_reorder_label')}
							</strong>{' '}
							{t('autorun_help.multi_doc.drag_reorder_description')}
						</p>
						<p>{t('autorun_help.multi_doc.skip_description')}</p>
					</div>
				</section>

				{/* Template Variables */}
				<section>
					<div className="flex items-center gap-2 mb-3">
						<Variable className="w-5 h-5" style={{ color: theme.colors.accent }} />
						<h3 className="font-bold">{t('autorun_help.variables.title')}</h3>
					</div>
					<div className="text-sm space-y-2 pl-7" style={{ color: theme.colors.textDim }}>
						<p>{t('autorun_help.variables.description')}</p>
						<div
							className="flex items-center gap-2 px-3 py-2 rounded"
							style={{ backgroundColor: theme.colors.accent + '15' }}
						>
							<Keyboard className="w-4 h-4" style={{ color: theme.colors.accent }} />
							<span>
								<strong style={{ color: theme.colors.textMain }}>
									{t('autorun_help.variables.quick_insert_label')}
								</strong>{' '}
								{t('autorun_help.variables.quick_insert_type')}{' '}
								<code
									className="px-1.5 py-0.5 rounded text-xs font-mono"
									style={{ backgroundColor: theme.colors.bgActivity }}
								>
									{'{{'}
								</code>{' '}
								{t('autorun_help.variables.quick_insert_action')}
							</span>
						</div>
						<p>
							<strong style={{ color: theme.colors.textMain }}>
								{t('autorun_help.variables.available_label')}
							</strong>
						</p>
						<div
							className="font-mono text-xs p-3 rounded border space-y-1"
							style={{
								backgroundColor: theme.colors.bgActivity,
								borderColor: theme.colors.border,
							}}
						>
							<div>
								<code style={{ color: theme.colors.accent }}>{'{{AGENT_NAME}}'}</code> —{' '}
								{t('autorun_help.variables.agent_name_description')}
							</div>
							<div>
								<code style={{ color: theme.colors.accent }}>{'{{AGENT_PATH}}'}</code> —{' '}
								{t('autorun_help.variables.agent_path_description')}
							</div>
							<div>
								<code style={{ color: theme.colors.accent }}>{'{{TAB_NAME}}'}</code> —{' '}
								{t('autorun_help.variables.tab_name_description')}
							</div>
							<div>
								<code style={{ color: theme.colors.accent }}>{'{{GIT_BRANCH}}'}</code> —{' '}
								{t('autorun_help.variables.git_branch_description')}
							</div>
							<div>
								<code style={{ color: theme.colors.accent }}>{'{{DATE}}'}</code> —{' '}
								{t('autorun_help.variables.date_description')}
							</div>
							<div>
								<code style={{ color: theme.colors.accent }}>{'{{LOOP_NUMBER}}'}</code> —{' '}
								{t('autorun_help.variables.loop_number_description')}
							</div>
							<div>
								<code style={{ color: theme.colors.accent }}>{'{{DOCUMENT_NAME}}'}</code> —{' '}
								{t('autorun_help.variables.document_name_description')}
							</div>
							<div style={{ color: theme.colors.textDim }}>
								...{t('autorun_help.variables.and_more')}
							</div>
						</div>
						<p>
							{t('autorun_help.variables.usage_before')}{' '}
							<strong style={{ color: theme.colors.textMain }}>
								{t('autorun_help.variables.agent_prompt_label')}
							</strong>{' '}
							{t('autorun_help.variables.usage_middle')}{' '}
							<strong style={{ color: theme.colors.textMain }}>
								{t('autorun_help.variables.document_content_label')}
							</strong>
							. {t('autorun_help.variables.usage_after')}
						</p>
					</div>
				</section>

				{/* Reset on Completion */}
				<section>
					<div className="flex items-center gap-2 mb-3">
						<RotateCcw className="w-5 h-5" style={{ color: theme.colors.accent }} />
						<h3 className="font-bold">{t('autorun_help.reset.title')}</h3>
					</div>
					<div className="text-sm space-y-2 pl-7" style={{ color: theme.colors.textDim }}>
						<p>
							{t('autorun_help.reset.description_before')} (<RotateCcw className="w-3 h-3 inline" />
							) {t('autorun_help.reset.description_middle')}{' '}
							<strong style={{ color: theme.colors.textMain }}>
								{t('autorun_help.reset.working_copy_label')}
							</strong>{' '}
							{t('autorun_help.reset.description_in')} <code>Runs/</code>{' '}
							{t('autorun_help.reset.description_after')}
							<em>{t('autorun_help.reset.original_never_modified')}</em>.
						</p>
						<p>
							{t('autorun_help.reset.timestamps_before')} <code>TASK-1735192800000-loop-1.md</code>){' '}
							{t('autorun_help.reset.timestamps_after')}
						</p>
						<p>{t('autorun_help.reset.duplicate_description')}</p>
					</div>
				</section>

				{/* Loop Mode */}
				<section>
					<div className="flex items-center gap-2 mb-3">
						<Repeat className="w-5 h-5" style={{ color: theme.colors.accent }} />
						<h3 className="font-bold">{t('autorun_help.loop.title')}</h3>
					</div>
					<div className="text-sm space-y-2 pl-7" style={{ color: theme.colors.textDim }}>
						<p>
							{t('autorun_help.loop.description_before')}{' '}
							<strong style={{ color: theme.colors.textMain }}>
								{t('autorun_help.loop.loop_label')}
							</strong>{' '}
							{t('autorun_help.loop.description_after')}
						</p>
						<p>{t('autorun_help.loop.perpetual_description')}</p>
					</div>
				</section>

				{/* Playbooks */}
				<section>
					<div className="flex items-center gap-2 mb-3">
						<BookMarked className="w-5 h-5" style={{ color: theme.colors.accent }} />
						<h3 className="font-bold">{t('autorun_help.playbooks.title')}</h3>
					</div>
					<div className="text-sm space-y-2 pl-7" style={{ color: theme.colors.textDim }}>
						<p>
							{t('autorun_help.playbooks.description_before')}{' '}
							<strong style={{ color: theme.colors.textMain }}>
								{t('autorun_help.playbooks.playbook_label')}
							</strong>{' '}
							{t('autorun_help.playbooks.description_after')}
						</p>
						<ul className="list-disc ml-4 space-y-1">
							<li>{t('autorun_help.playbooks.item_doc_selection')}</li>
							<li>{t('autorun_help.playbooks.item_reset_settings')}</li>
							<li>{t('autorun_help.playbooks.item_loop_mode')}</li>
							<li>{t('autorun_help.playbooks.item_agent_prompt')}</li>
						</ul>
						<p>{t('autorun_help.playbooks.load_description')}</p>
						<p>
							<strong style={{ color: theme.colors.textMain }}>
								{t('autorun_help.playbooks.sharing_label')}
							</strong>{' '}
							{t('autorun_help.playbooks.sharing_description_before')}{' '}
							<strong style={{ color: theme.colors.textMain }}>
								{t('autorun_help.playbooks.exchange_label')}
							</strong>{' '}
							{t('autorun_help.playbooks.sharing_description_after')}
						</p>
					</div>
				</section>

				{/* History & Tracking */}
				<section>
					<div className="flex items-center gap-2 mb-3">
						<History className="w-5 h-5" style={{ color: theme.colors.accent }} />
						<h3 className="font-bold">{t('autorun_help.history.title')}</h3>
					</div>
					<div className="text-sm space-y-2 pl-7" style={{ color: theme.colors.textDim }}>
						<p>
							{t('autorun_help.history.description_before')}{' '}
							<strong style={{ color: theme.colors.textMain }}>
								{t('autorun_help.history.history_label')}
							</strong>{' '}
							{t('autorun_help.history.description_middle')}{' '}
							<span style={{ color: theme.colors.warning }}>AUTO</span>{' '}
							{t('autorun_help.history.description_after')}
						</p>
						<p>
							{t('autorun_help.history.session_pill_before')} <code>/history</code>{' '}
							{t('autorun_help.history.session_pill_after')}
						</p>
					</div>
				</section>

				{/* Read-Only Mode */}
				<section>
					<div className="flex items-center gap-2 mb-3">
						<Eye className="w-5 h-5" style={{ color: theme.colors.warning }} />
						<h3 className="font-bold">{t('autorun_help.readonly.title')}</h3>
					</div>
					<div className="text-sm space-y-2 pl-7" style={{ color: theme.colors.textDim }}>
						<p>
							{t('autorun_help.readonly.description_before')}{' '}
							<strong style={{ color: theme.colors.warning }}>
								{t('autorun_help.readonly.readonly_label')}
							</strong>
							. {t('autorun_help.readonly.description_after')}
						</p>
						<p>
							{t('autorun_help.readonly.indicator_before')}{' '}
							<span style={{ color: theme.colors.warning }}>READ-ONLY</span>{' '}
							{t('autorun_help.readonly.indicator_after')}
						</p>
						<p>
							<strong style={{ color: theme.colors.textMain }}>
								{t('autorun_help.readonly.tip_label')}
							</strong>{' '}
							{t('autorun_help.readonly.tip_description')}
						</p>
					</div>
				</section>

				{/* Stopping */}
				<section>
					<div className="flex items-center gap-2 mb-3">
						<Square className="w-5 h-5" style={{ color: theme.colors.error }} />
						<h3 className="font-bold">{t('autorun_help.stopping.title')}</h3>
					</div>
					<div className="text-sm space-y-2 pl-7" style={{ color: theme.colors.textDim }}>
						<p>
							{t('autorun_help.stopping.description_before')}{' '}
							<strong style={{ color: theme.colors.error }}>
								{t('autorun_help.stopping.stop_label')}
							</strong>{' '}
							{t('autorun_help.stopping.description_after')}
						</p>
						<p>{t('autorun_help.stopping.resume_description')}</p>
					</div>
				</section>

				{/* Keyboard Shortcuts */}
				<section>
					<div className="flex items-center gap-2 mb-3">
						<Keyboard className="w-5 h-5" style={{ color: theme.colors.accent }} />
						<h3 className="font-bold">{t('autorun_help.shortcuts.title')}</h3>
					</div>
					<div className="text-sm pl-7" style={{ color: theme.colors.textDim }}>
						<div className="space-y-2">
							<div className="flex items-center gap-3">
								<kbd
									className="px-2 py-1 rounded text-xs font-mono font-bold min-w-[80px] text-center"
									style={{
										backgroundColor: theme.colors.bgActivity,
										border: `1px solid ${theme.colors.border}`,
									}}
								>
									{formatShortcutKeys(['Meta', 'Shift', '1'])}
								</kbd>
								<span>{t('autorun_help.shortcuts.open_autorun')}</span>
							</div>
							<div className="flex items-center gap-3">
								<kbd
									className="px-2 py-1 rounded text-xs font-mono font-bold min-w-[80px] text-center"
									style={{
										backgroundColor: theme.colors.bgActivity,
										border: `1px solid ${theme.colors.border}`,
									}}
								>
									{formatShortcutKeys(['Meta', 'e'])}
								</kbd>
								<span>{t('autorun_help.shortcuts.toggle_edit_preview')}</span>
							</div>
							<div className="flex items-center gap-3">
								<kbd
									className="px-2 py-1 rounded text-xs font-mono font-bold min-w-[80px] text-center"
									style={{
										backgroundColor: theme.colors.bgActivity,
										border: `1px solid ${theme.colors.border}`,
									}}
								>
									{formatShortcutKeys(['Meta', 'l'])}
								</kbd>
								<span>{t('autorun_help.shortcuts.insert_checkbox')}</span>
							</div>
							<div className="flex items-center gap-3">
								<kbd
									className="px-2 py-1 rounded text-xs font-mono font-bold min-w-[80px] text-center"
									style={{
										backgroundColor: theme.colors.bgActivity,
										border: `1px solid ${theme.colors.border}`,
									}}
								>
									{formatShortcutKeys(['Meta', 'z'])}
								</kbd>
								<span>{t('autorun_help.shortcuts.undo')}</span>
							</div>
							<div className="flex items-center gap-3">
								<kbd
									className="px-2 py-1 rounded text-xs font-mono font-bold min-w-[80px] text-center"
									style={{
										backgroundColor: theme.colors.bgActivity,
										border: `1px solid ${theme.colors.border}`,
									}}
								>
									{formatShortcutKeys(['Meta', 'Shift', 'z'])}
								</kbd>
								<span>{t('autorun_help.shortcuts.redo')}</span>
							</div>
						</div>
					</div>
				</section>
			</div>
		</Modal>
	);
}

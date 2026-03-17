import {
	Wand2,
	Plus,
	Settings,
	Keyboard,
	ScrollText,
	Cpu,
	ExternalLink,
	Info,
	Download,
	Compass,
	Globe,
	BookOpen,
	BarChart3,
	Music,
	Command,
	Languages,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Theme } from '../../types';
import { formatShortcutKeys } from '../../utils/shortcutFormatter';
import { useSettingsStore } from '../../stores/settingsStore';
import { getModalActions } from '../../stores/modalStore';
import { LANGUAGE_NATIVE_NAMES } from '../../../shared/i18n/config';
import type { SupportedLanguage } from '../../../shared/i18n/config';

interface HamburgerMenuContentProps {
	theme: Theme;
	onNewAgentSession?: () => void;
	openWizard?: () => void;
	startTour?: () => void;
	setMenuOpen: (open: boolean) => void;
}

export function HamburgerMenuContent({
	theme,
	onNewAgentSession,
	openWizard,
	startTour,
	setMenuOpen,
}: HamburgerMenuContentProps) {
	const { t } = useTranslation('menus');
	const shortcuts = useSettingsStore((s) => s.shortcuts);
	const directorNotesEnabled = useSettingsStore((s) => s.encoreFeatures.directorNotes);
	const language = useSettingsStore((s) => s.language) as SupportedLanguage;
	const {
		setShortcutsHelpOpen,
		setSettingsModalOpen,
		setSettingsTab,
		setLogViewerOpen,
		setProcessMonitorOpen,
		setUsageDashboardOpen,
		setSymphonyModalOpen,
		setDirectorNotesOpen,
		setUpdateCheckModalOpen,
		setAboutModalOpen,
		setQuickActionOpen,
	} = getModalActions();

	return (
		<div className="p-1">
			{onNewAgentSession && (
				<button
					onClick={() => {
						onNewAgentSession();
						setMenuOpen(false);
					}}
					className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
				>
					<Plus className="w-5 h-5" style={{ color: theme.colors.accent }} />
					<div className="flex-1">
						<div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
							{t('hamburger.new_agent')}
						</div>
						<div className="text-xs" style={{ color: theme.colors.textDim }}>
							{t('hamburger.new_agent_desc')}
						</div>
					</div>
					<span
						className="text-xs font-mono px-1.5 py-0.5 rounded"
						style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.textDim }}
					>
						{shortcuts.newInstance ? formatShortcutKeys(shortcuts.newInstance.keys) : '⌘N'}
					</span>
				</button>
			)}
			{openWizard && (
				<button
					onClick={() => {
						openWizard();
						setMenuOpen(false);
					}}
					className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
				>
					<Wand2 className="w-5 h-5" style={{ color: theme.colors.accent }} />
					<div className="flex-1">
						<div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
							{t('hamburger.wizard')}
						</div>
						<div className="text-xs" style={{ color: theme.colors.textDim }}>
							{t('hamburger.wizard_desc')}
						</div>
					</div>
					<span
						className="text-xs font-mono px-1.5 py-0.5 rounded"
						style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.textDim }}
					>
						{shortcuts.openWizard ? formatShortcutKeys(shortcuts.openWizard.keys) : '⇧⌘N'}
					</span>
				</button>
			)}
			<button
				onClick={() => {
					setQuickActionOpen(true);
					setMenuOpen(false);
				}}
				className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
			>
				<Command className="w-5 h-5" style={{ color: theme.colors.accent }} />
				<div className="flex-1">
					<div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
						{t('hamburger.command_palette')}
					</div>
					<div className="text-xs" style={{ color: theme.colors.textDim }}>
						{t('hamburger.command_palette_desc')}
					</div>
				</div>
				<span
					className="text-xs font-mono px-1.5 py-0.5 rounded"
					style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.textDim }}
				>
					{shortcuts.quickAction ? formatShortcutKeys(shortcuts.quickAction.keys) : '⌘K'}
				</span>
			</button>
			{startTour && (
				<button
					onClick={() => {
						startTour();
						setMenuOpen(false);
					}}
					className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
				>
					<Compass className="w-5 h-5" style={{ color: theme.colors.accent }} />
					<div className="flex-1">
						<div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
							{t('hamburger.tour')}
						</div>
						<div className="text-xs" style={{ color: theme.colors.textDim }}>
							{t('hamburger.tour_desc')}
						</div>
					</div>
				</button>
			)}
			<div className="my-1 border-t" style={{ borderColor: theme.colors.border }} />
			<button
				onClick={() => {
					setShortcutsHelpOpen(true);
					setMenuOpen(false);
				}}
				className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
			>
				<Keyboard className="w-5 h-5" style={{ color: theme.colors.accent }} />
				<div className="flex-1">
					<div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
						{t('hamburger.keyboard_shortcuts')}
					</div>
					<div className="text-xs" style={{ color: theme.colors.textDim }}>
						{t('hamburger.keyboard_shortcuts_desc')}
					</div>
				</div>
				<span
					className="text-xs font-mono px-1.5 py-0.5 rounded"
					style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.textDim }}
				>
					{formatShortcutKeys(shortcuts.help.keys)}
				</span>
			</button>
			<button
				onClick={() => {
					setSettingsModalOpen(true);
					setSettingsTab('general');
					setMenuOpen(false);
				}}
				className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
			>
				<Settings className="w-5 h-5" style={{ color: theme.colors.accent }} />
				<div className="flex-1">
					<div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
						{t('hamburger.settings')}
					</div>
					<div className="text-xs" style={{ color: theme.colors.textDim }}>
						{t('hamburger.settings_desc')}
					</div>
				</div>
				<span
					className="text-xs font-mono px-1.5 py-0.5 rounded"
					style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.textDim }}
				>
					{formatShortcutKeys(shortcuts.settings.keys)}
				</span>
			</button>
			<button
				onClick={() => {
					setLogViewerOpen(true);
					setMenuOpen(false);
				}}
				className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
			>
				<ScrollText className="w-5 h-5" style={{ color: theme.colors.accent }} />
				<div className="flex-1">
					<div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
						{t('hamburger.system_logs')}
					</div>
					<div className="text-xs" style={{ color: theme.colors.textDim }}>
						{t('hamburger.system_logs_desc')}
					</div>
				</div>
				<span
					className="text-xs font-mono px-1.5 py-0.5 rounded"
					style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.textDim }}
				>
					{formatShortcutKeys(shortcuts.systemLogs.keys)}
				</span>
			</button>
			<button
				onClick={() => {
					setProcessMonitorOpen(true);
					setMenuOpen(false);
				}}
				className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
			>
				<Cpu className="w-5 h-5" style={{ color: theme.colors.accent }} />
				<div className="flex-1">
					<div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
						{t('hamburger.process_monitor')}
					</div>
					<div className="text-xs" style={{ color: theme.colors.textDim }}>
						{t('hamburger.process_monitor_desc')}
					</div>
				</div>
				<span
					className="text-xs font-mono px-1.5 py-0.5 rounded"
					style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.textDim }}
				>
					{formatShortcutKeys(shortcuts.processMonitor.keys)}
				</span>
			</button>
			<button
				onClick={() => {
					setUsageDashboardOpen(true);
					setMenuOpen(false);
				}}
				className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
			>
				<BarChart3 className="w-5 h-5" style={{ color: theme.colors.accent }} />
				<div className="flex-1">
					<div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
						{t('hamburger.usage_dashboard')}
					</div>
					<div className="text-xs" style={{ color: theme.colors.textDim }}>
						{t('hamburger.usage_dashboard_desc')}
					</div>
				</div>
				<span
					className="text-xs font-mono px-1.5 py-0.5 rounded"
					style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.textDim }}
				>
					{formatShortcutKeys(shortcuts.usageDashboard.keys)}
				</span>
			</button>
			<button
				onClick={() => {
					setSymphonyModalOpen(true);
					setMenuOpen(false);
				}}
				className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
			>
				<Music className="w-5 h-5" style={{ color: theme.colors.accent }} />
				<div className="flex-1">
					<div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
						{t('hamburger.symphony')}
					</div>
					<div className="text-xs" style={{ color: theme.colors.textDim }}>
						{t('hamburger.symphony_desc')}
					</div>
				</div>
				<span
					className="text-xs font-mono px-1.5 py-0.5 rounded"
					style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.textDim }}
				>
					{shortcuts.openSymphony ? formatShortcutKeys(shortcuts.openSymphony.keys) : '⇧⌘Y'}
				</span>
			</button>
			{directorNotesEnabled && (
				<button
					onClick={() => {
						setDirectorNotesOpen(true);
						setMenuOpen(false);
					}}
					className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
				>
					<ScrollText className="w-5 h-5" style={{ color: theme.colors.accent }} />
					<div className="flex-1">
						<div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
							{t('hamburger.director_notes')}
						</div>
						<div className="text-xs" style={{ color: theme.colors.textDim }}>
							{t('hamburger.director_notes_desc')}
						</div>
					</div>
					{shortcuts.directorNotes && (
						<span
							className="text-xs font-mono px-1.5 py-0.5 rounded"
							style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.textDim }}
						>
							{formatShortcutKeys(shortcuts.directorNotes.keys)}
						</span>
					)}
				</button>
			)}
			<div className="my-1 border-t" style={{ borderColor: theme.colors.border }} />
			<button
				onClick={() => {
					setSettingsModalOpen(true);
					setSettingsTab('general');
					setMenuOpen(false);
				}}
				className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
			>
				<Languages className="w-5 h-5" style={{ color: theme.colors.accent }} />
				<div className="flex-1">
					<div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
						{t('hamburger.language')}
					</div>
					<div className="text-xs" style={{ color: theme.colors.textDim }}>
						{t('hamburger.language_desc')}
					</div>
				</div>
				<span
					className="text-xs font-medium px-1.5 py-0.5 rounded"
					style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.textDim }}
				>
					{LANGUAGE_NATIVE_NAMES[language] || LANGUAGE_NATIVE_NAMES.en}
				</span>
			</button>
			<div className="my-1 border-t" style={{ borderColor: theme.colors.border }} />
			<button
				onClick={() => {
					window.maestro.shell.openExternal('https://runmaestro.ai');
					setMenuOpen(false);
				}}
				className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
			>
				<Globe className="w-5 h-5" style={{ color: theme.colors.accent }} />
				<div className="flex-1">
					<div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
						{t('hamburger.website')}
					</div>
					<div className="text-xs" style={{ color: theme.colors.textDim }}>
						{t('hamburger.website_desc')}
					</div>
				</div>
				<ExternalLink className="w-4 h-4" style={{ color: theme.colors.textDim }} />
			</button>
			<button
				onClick={() => {
					window.maestro.shell.openExternal('https://docs.runmaestro.ai');
					setMenuOpen(false);
				}}
				className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
			>
				<BookOpen className="w-5 h-5" style={{ color: theme.colors.accent }} />
				<div className="flex-1">
					<div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
						{t('hamburger.documentation')}
					</div>
					<div className="text-xs" style={{ color: theme.colors.textDim }}>
						{t('hamburger.documentation_desc')}
					</div>
				</div>
				<ExternalLink className="w-4 h-4" style={{ color: theme.colors.textDim }} />
			</button>
			<button
				onClick={() => {
					setUpdateCheckModalOpen(true);
					setMenuOpen(false);
				}}
				className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
			>
				<Download className="w-5 h-5" style={{ color: theme.colors.accent }} />
				<div className="flex-1">
					<div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
						{t('hamburger.check_updates')}
					</div>
					<div className="text-xs" style={{ color: theme.colors.textDim }}>
						{t('hamburger.check_updates_desc')}
					</div>
				</div>
			</button>
			<button
				onClick={() => {
					setAboutModalOpen(true);
					setMenuOpen(false);
				}}
				className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
			>
				<Info className="w-5 h-5" style={{ color: theme.colors.accent }} />
				<div className="flex-1">
					<div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
						{t('hamburger.about')}
					</div>
					<div className="text-xs" style={{ color: theme.colors.textDim }}>
						{t('hamburger.about_desc')}
					</div>
				</div>
			</button>
		</div>
	);
}

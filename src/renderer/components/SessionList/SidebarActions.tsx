import { memo } from 'react';
import { PanelLeftClose, PanelLeftOpen, Bot, Wand2, MessageSquarePlus } from 'lucide-react';
import type { Theme, Shortcut } from '../../types';
import { formatShortcutKeys } from '../../utils/shortcutFormatter';

interface SidebarActionsProps {
	theme: Theme;
	leftSidebarOpen: boolean;
	hasNoSessions: boolean;
	shortcuts: Record<string, Shortcut>;
	showUnreadAgentsOnly: boolean;
	addNewSession: () => void;
	openWizard?: () => void;
	openFeedback?: () => void;
	setLeftSidebarOpen: (open: boolean) => void;
	toggleShowUnreadAgentsOnly: () => void;
}

export const SidebarActions = memo(function SidebarActions({
	theme,
	leftSidebarOpen,
	hasNoSessions,
	shortcuts,
	showUnreadAgentsOnly,
	addNewSession,
	openWizard,
	openFeedback,
	setLeftSidebarOpen,
	toggleShowUnreadAgentsOnly,
}: SidebarActionsProps) {
	return (
		<div
			className="p-2 border-t flex gap-2 items-center"
			style={{ borderColor: theme.colors.border }}
		>
			<button
				type="button"
				disabled={hasNoSessions && leftSidebarOpen}
				onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
				className={`flex items-center justify-center p-2 rounded transition-colors w-8 h-8 shrink-0 ${hasNoSessions && leftSidebarOpen ? 'opacity-20 cursor-not-allowed' : 'hover:bg-white/5'}`}
				title={
					hasNoSessions && leftSidebarOpen
						? 'Add an agent first to collapse sidebar'
						: `${leftSidebarOpen ? 'Collapse' : 'Expand'} Sidebar (${formatShortcutKeys(shortcuts.toggleSidebar.keys)})`
				}
			>
				{leftSidebarOpen ? (
					<PanelLeftClose className="w-4 h-4 opacity-50" />
				) : (
					<PanelLeftOpen className="w-4 h-4 opacity-50" />
				)}
			</button>

			{leftSidebarOpen && (
				<div
					className="flex-1 grid gap-2"
					style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}
				>
					<button
						type="button"
						onClick={addNewSession}
						className="flex items-center justify-center gap-2 py-2 rounded text-xs font-bold transition-colors hover:opacity-90"
						style={{ backgroundColor: theme.colors.accent, color: theme.colors.accentForeground }}
					>
						<Bot className="w-3 h-3" /> New Agent
					</button>

					<button
						type="button"
						onClick={openFeedback}
						disabled={!openFeedback}
						className="flex items-center justify-center gap-2 py-2 rounded text-xs font-bold transition-colors hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
						style={{ backgroundColor: theme.colors.accent, color: theme.colors.accentForeground }}
						title="Send product feedback"
					>
						<MessageSquarePlus className="w-3 h-3" /> Feedback
					</button>

					{openWizard ? (
						<button
							type="button"
							onClick={openWizard}
							className="flex items-center justify-center gap-2 py-2 rounded text-xs font-bold transition-colors hover:opacity-90"
							style={{ backgroundColor: theme.colors.accent, color: theme.colors.accentForeground }}
							title="Get started with AI wizard"
						>
							<Wand2 className="w-3 h-3" /> Wizard
						</button>
					) : (
						<div aria-hidden="true" />
					)}
				</div>
			)}

			{/* Unread agents filter toggle */}
			{leftSidebarOpen && (
				<button
					type="button"
					onClick={toggleShowUnreadAgentsOnly}
					className="relative flex items-center justify-center p-2 rounded transition-colors w-8 h-8 shrink-0 hover:bg-white/5"
					style={{
						color: showUnreadAgentsOnly ? theme.colors.accent : undefined,
						opacity: showUnreadAgentsOnly ? 1 : 0.5,
					}}
					title={
						showUnreadAgentsOnly
							? `Showing unread agents only (${formatShortcutKeys(shortcuts.filterUnreadAgents.keys)})`
							: `Filter unread agents (${formatShortcutKeys(shortcuts.filterUnreadAgents.keys)})`
					}
				>
					<Bot className="w-4 h-4" />
					{/* Notification dot - always visible to match tab filter icon pattern */}
					<div
						className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
						style={{ backgroundColor: theme.colors.accent }}
					/>
				</button>
			)}
		</div>
	);
});

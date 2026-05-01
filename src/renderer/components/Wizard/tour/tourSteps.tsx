/**
 * tourSteps.tsx
 *
 * Defines the tour step sequence and configuration for the onboarding tour.
 * Each step includes selector information for spotlighting elements,
 * title/description content, and UI state requirements.
 *
 * Steps have two description variants:
 * - description: Used when tour is launched from the wizard (Auto Run context)
 * - descriptionGeneric: Used when tour is launched from hamburger menu (general context)
 *
 * Descriptions can include shortcut placeholders like {{shortcutId}} which will be
 * replaced with the user's configured keyboard shortcut at runtime.
 *
 * Steps can also include descriptionContent/descriptionContentGeneric for JSX
 * content that renders inline icons matching the actual UI.
 */

import React from 'react';
import {
	PenLine,
	ImageIcon,
	History,
	Eye,
	Brain,
	Search,
	Sparkles,
	Gauge,
	BookOpen,
	CheckCircle,
	AlertTriangle,
	ArrowUpFromLine,
	Layers,
	CheckSquare,
	Github,
} from 'lucide-react';
import type { TourStepConfig } from './useTour';
import type { Shortcut } from '../../../types';
import { formatShortcutKeys } from '../../../utils/shortcutFormatter';

/**
 * Inline icon component for tour descriptions - matches the actual UI icons
 */
function TourIcon({
	icon: Icon,
	label,
}: {
	icon: React.ComponentType<{ className?: string }>;
	label?: string;
}) {
	return (
		<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/10 text-xs whitespace-nowrap">
			<Icon className="w-3 h-3" />
			{label && <span>{label}</span>}
		</span>
	);
}

/**
 * JSX content for the input area tour step showing actual icons
 */
const inputAreaIconsContent = (
	<div className="text-xs leading-relaxed space-y-1.5">
		<div>
			Look for these controls: <TourIcon icon={PenLine} /> opens an expanded prompt editor,{' '}
			<TourIcon icon={ImageIcon} /> lets you attach files (or just paste).
		</div>
	</div>
);

/**
 * JSX content for the model selector tour step
 */
const modelSelectorContent = (
	<div className="text-xs leading-relaxed space-y-1.5">
		<div>
			<TourIcon icon={Sparkles} label="Model" /> Click this pill to switch between available AI
			models (e.g., Sonnet, Opus, Haiku). Different models have different strengths — pick the right
			one for the task.
		</div>
		<div>
			<TourIcon icon={Gauge} label="Effort" /> When available, this pill lets you set the effort
			level (low, medium, high). Lower effort means faster, cheaper responses. Higher effort means
			more thorough work.
		</div>
	</div>
);

/**
 * JSX content for the toolbar toggles tour step
 */
const toolbarTogglesContent = (
	<div className="text-xs leading-relaxed space-y-1.5">
		<div>
			These are <strong>buttons</strong>, not just labels — click them to toggle:
		</div>
		<div>
			<TourIcon icon={History} label="History" /> Controls whether this tab's interactions are saved
			to your history. Toggle per-tab as needed.
		</div>
		<div>
			<TourIcon icon={Eye} label="Plan / Read-only" /> Prevents the agent from modifying files —
			great for asking questions, reviewing code, or planning without risk.
		</div>
		<div>
			<TourIcon icon={Brain} label="Thinking" /> Streams the agent's internal reasoning. Click once
			for temporary, again for sticky (persistent across messages), and once more to turn off.
		</div>
		<div className="opacity-70">
			Defaults for these toggles can be changed in Settings → General.
		</div>
	</div>
);

/**
 * JSX content for the Living Wiki enrollment / generation step
 */
const livingWikiEnrollContent = (
	<div className="text-xs leading-relaxed space-y-1.5">
		<div>
			Click <TourIcon icon={BookOpen} label="Enroll" /> to enroll a project for the first time. Once
			enrolled, the button becomes <strong>Sync</strong> — run it to regenerate docs after code
			changes. Maestro writes an <code>llms.txt</code> index alongside the wiki so AI agents can
			discover your docs without reading every file.
		</div>
	</div>
);

/**
 * JSX content for the Living Wiki validation step
 */
const livingWikiValidationContent = (
	<div className="text-xs leading-relaxed space-y-1.5">
		<div>
			<TourIcon icon={CheckCircle} label="Valid" /> means all docs pass schema checks.{' '}
			<TourIcon icon={AlertTriangle} label="Issues" /> surfaces broken links, missing metadata, or
			stale content. Fix issues in the editor and re-sync to clear them.
		</div>
	</div>
);

/**
 * JSX content for the Living Wiki doc-gap promote step
 */
const livingWikiDocGapContent = (
	<div className="text-xs leading-relaxed space-y-1.5">
		<div>
			When Maestro detects undocumented areas it records them as <strong>Doc Gaps</strong>. Click{' '}
			<TourIcon icon={ArrowUpFromLine} /> on a gap to promote it into a Delivery Planner task so the
			AI can fill it automatically.
		</div>
	</div>
);

/**
 * JSX content for the Delivery Planner overview step showing key concepts
 */
const deliveryPlannerOverviewContent = (
	<div className="text-xs leading-relaxed space-y-1.5">
		<div>
			The planning ladder: <TourIcon icon={BookOpen} label="PRD" /> defines the product,{' '}
			<TourIcon icon={Layers} label="Epics" /> group related work, and{' '}
			<TourIcon icon={CheckSquare} label="Tasks" /> are the agent-ready units of delivery.
		</div>
		<div className="opacity-70">
			Work Graph is the source of truth. Disk files (.claude/) are a read-friendly mirror.
		</div>
	</div>
);

/**
 * JSX content for the GitHub sync step showing the sync flow
 */
const deliveryPlannerGithubContent = (
	<div className="text-xs leading-relaxed space-y-1.5">
		<div>
			Use <TourIcon icon={Github} label="Sync" /> to push tasks as GitHub Issues. Progress
			comments and status changes flow back automatically via Work Graph.
		</div>
		<div className="opacity-70">
			GitHub sync validates the target repository before any network call to prevent accidental
			writes.
		</div>
	</div>
);

/**
 * JSX content for the AI Terminal & Tabs tour step showing magnifier icon
 */
const tabSearchIconContent = (
	<div className="text-xs leading-relaxed">
		The <TourIcon icon={Search} /> icon on the left of the tab bar opens a searchable tab overview.
	</div>
);

/**
 * All tour steps in order
 *
 * Tour sequence:
 * 1) Auto Run panel - explain what's running right now
 * 2) Auto Run document selector - show Auto Run documents
 * 3) Files tab - show file explorer
 * 4) History tab - explain auto vs manual entries
 * 5) Left panel hamburger menu - show menu options
 * 6) Remote control - LIVE/OFFLINE toggle, QR code, Cloudflare tunnel
 * 7) Left panel agent list - explain agents and groups
 * 8) Main terminal area + tabs - explain AI Terminal and tab usage
 * 9) Agent Sessions button - browse previous conversations
 * 10) Input area - explain messaging the AI
 * 11) Model & effort selector - choose model and effort level
 * 12) Toolbar toggles - History, Read-only/Plan, Thinking buttons
 * 13) Additional tabs - terminal (Cmd+J), browser (Cmd+B), jump to nearest terminal
 * 14) Agent Dispatch intro - open the Symphony panel via hamburger menu
 * 15) Projects tab - browse repos and open issues
 * 16) Active tab / kanban columns - in-progress contributions
 * 17) Pause / resume and claim / release a work item
 * 18) Fleet view (Stats tab) - contributor stats and achievements
 * 19) Agent Dispatch keyboard shortcut - wrap-up
 * 20) Living Wiki tab - open the wiki panel
 * 21) Living Wiki enrollment - enroll / sync, llms.txt generation
 * 22) Living Wiki doc tree & search - browse and find docs
 * 23) Living Wiki validation status - surfacing schema issues
 * 24) Living Wiki doc-gap promote - turn gaps into tasks
 * 25) Delivery Planner overview - introduce PRD → Epic → Task ladder
 * 26) PRD wizard - write a product requirements document
 * 27) Epic decomposition - break PRD into epics
 * 28) Task decomposition - break epics into agent-ready tasks
 * 29) GitHub sync - push tasks as issues, track progress
 * 30) Delivery dashboard - view overall project health
 * 31) Keyboard shortcuts - mention Cmd+/ for all shortcuts, end tour
 */
export const tourSteps: TourStepConfig[] = [
	{
		id: 'autorun-panel',
		title: 'Auto Run Panel',
		description:
			'This is the Auto Run panel where your Playbook is being executed right now. Each task from your Phase 1 document is being processed automatically by the AI agent. Watch as checkboxes get marked off! Press {{goToAutoRun}} to jump here anytime.',
		descriptionGeneric:
			'This is the Auto Run panel. Place markdown documents with task lists here to have the AI execute them automatically. Tasks are checked off as they complete. Press {{goToAutoRun}} to jump here anytime.',
		selector: '[data-tour="autorun-tab"]',
		position: 'left',
		uiActions: [{ type: 'setRightTab', value: 'autorun' }, { type: 'openRightPanel' }],
	},
	{
		id: 'autorun-documents',
		title: 'Document Selector',
		description:
			'The document selector shows all the Auto Run documents we created together. After the first document completes, you can select the next one and continue building your project.',
		descriptionGeneric:
			'The document selector shows all documents in your Auto Run folder. Select different documents to view or run them. You can organize work into phases or any structure you prefer.',
		selector: '[data-tour="autorun-document-selector"]',
		position: 'left',
		uiActions: [{ type: 'setRightTab', value: 'autorun' }, { type: 'openRightPanel' }],
	},
	{
		id: 'files-tab',
		title: 'File Explorer',
		description:
			"The Files tab shows your project's file structure. As the AI creates and modifies files, you'll see them appear here. The file tree can be searched. Double click a file to open it in a tab for preview and edit. Right click a file for other options such as opening Markdown documents in a graph view. Press {{goToFiles}} to jump to the file panel from anywhere.",
		descriptionGeneric:
			"The Files tab shows your project's file structure. As the AI creates and modifies files, you'll see them appear here. The file tree can be searched. Double click a file to open it in a tab for preview and edit. Right click a file for other options such as opening Markdown documents in a graph view. Press {{goToFiles}} to jump to the file panel from anywhere.",
		wide: true,
		selector: '[data-tour="files-tab"]',
		position: 'left',
		uiActions: [{ type: 'setRightTab', value: 'files' }, { type: 'openRightPanel' }],
	},
	{
		id: 'history-tab',
		title: 'History & Tracking',
		description:
			'The History tab tracks all AI interactions in your session. Auto Run entries are tracked automatically, and separate from manual interactions. You can toggle history per-message using the "History" bubble (with the clock icon) in the input area. Configure the default value under Settings → General.\n\nSwitch between the list view and the details view to drill into any entry. From the details view you can also resume the session where that entry took place.\n\nHistory also serves as memory for all Maestro agents—they know how to locate and parse the history file, giving them context about prior work. Press {{goToHistory}} to jump here.',
		descriptionGeneric:
			'The History tab tracks all AI interactions in your session. Auto Run entries are tracked automatically, and separate from manual interactions. You can toggle history per-message using the "History" bubble (with the clock icon) in the input area. Configure the default value under Settings → General.\n\nSwitch between the list view and the details view to drill into any entry. From the details view you can also resume the session where that entry took place.\n\nHistory also serves as memory for all Maestro agents—they know how to locate and parse the history file, giving them context about prior work. Press {{goToHistory}} to jump here.',
		wide: true,
		selector: '[data-tour="history-tab"]',
		position: 'left',
		uiActions: [{ type: 'setRightTab', value: 'history' }, { type: 'openRightPanel' }],
	},
	{
		id: 'hamburger-menu',
		title: 'Main Menu',
		description:
			'The hamburger menu gives you access to settings, themes, the project wizard, and more. You can also re-run this tour anytime from here under "Introductory Tour".',
		descriptionGeneric:
			'The hamburger menu gives you access to settings, themes, the New Agent Wizard, and more. You can re-run this tour anytime from here.',
		// Combine hamburger button and menu contents into one spotlight
		selector: '[data-tour="hamburger-menu"], [data-tour="hamburger-menu-contents"]',
		position: 'right',
		uiActions: [{ type: 'openHamburgerMenu' }],
	},
	{
		id: 'remote-control',
		title: 'Remote Control',
		description:
			'The LIVE/OFFLINE indicator controls a built-in web interface for remote control. Toggle it on to generate a local URL and QR code—scan it with your phone to control Maestro from the couch, the kitchen, or anywhere on your network.\n\nIf you have Cloudflare Tunnel (cloudflared) installed, one click opens a secure tunnel—no API keys, no login, no configuration. Access Maestro from anywhere, even outside your home network.',
		descriptionGeneric:
			'The LIVE/OFFLINE indicator controls a built-in web interface for remote control. Toggle it on to generate a local URL and QR code—scan it with your phone to control Maestro from anywhere on your network.\n\nIf you have Cloudflare Tunnel (cloudflared) installed, one click opens a secure tunnel—no API keys, no login, no configuration. Access Maestro from anywhere, even outside your home network.',
		wide: true,
		selector: '[data-tour="remote-control"]',
		position: 'right',
		uiActions: [{ type: 'closeHamburgerMenu' }],
	},
	{
		id: 'session-list',
		title: 'Agents & Groups',
		description:
			'The agent list shows all your AI coding agents. Each agent is backed by a provider like Claude Code, Codex, or OpenCode. You can run multiple agents simultaneously on different projects and quickly switch between them. A red indicator dot marks unread messages.\n\nOrganize agents into groups, and with two or more agents you can start a group chat—even across different providers. Press {{focusSidebar}} to focus the agent list.',
		descriptionGeneric:
			'The agent list shows all your AI coding agents. Each agent is backed by a provider like Claude Code, Codex, or OpenCode. You can run multiple agents simultaneously on different projects and quickly switch between them. A red indicator dot marks unread messages.\n\nOrganize agents into groups, and with two or more agents you can start a group chat—even across different providers. Press {{focusSidebar}} to focus the agent list.',
		wide: true,
		selector: '[data-tour="session-list"]',
		position: 'right',
		uiActions: [{ type: 'closeHamburgerMenu' }],
	},
	{
		id: 'main-terminal',
		title: 'AI Terminal & Tabs',
		description:
			'This is the AI Terminal where you communicate with your AI assistant. In "AI" mode (shown now), messages go to the AI. You can also switch to "Terminal" mode for direct shell commands.\n\nUse tabs liberally. Create one for every task, bug, question, or whatever. Each tab is a fresh context. Tabs can be closed and later recalled. There\'s tooling available on tabs too, such as export, send to another agent, and publish as Gist.\n\nYour favorite browser shortcuts work here: {{newTab}} for new, {{closeTab}} to close, {{reopenClosedTab}} to reopen the last closed tab.\n\nAny prior session you\'ve had with your provider can be recalled as a tab, even if that session occurred with the provider directly.',
		descriptionGeneric:
			'This is the AI Terminal where you communicate with your AI assistant. In "AI" mode, messages go to the AI. Switch to "Terminal" mode for direct shell commands.\n\nUse tabs liberally. Create one for every task, bug, question, or whatever. Each tab is a fresh context. Tabs can be closed and later recalled. There\'s tooling available on tabs too, such as export, send to another agent, and publish as Gist.\n\nYour favorite browser shortcuts work here: {{newTab}} for new, {{closeTab}} to close, {{reopenClosedTab}} to reopen the last closed tab.\n\nAny prior session you\'ve had with your provider can be recalled as a tab, even if that session occurred with the provider directly.',
		descriptionContent: tabSearchIconContent,
		descriptionContentGeneric: tabSearchIconContent,
		wide: true,
		selector: '[data-tour="tab-bar"], [data-tour="main-terminal"]',
		position: 'center-overlay',
		uiActions: [],
	},
	{
		id: 'agent-sessions',
		title: 'Agent Sessions',
		description:
			'The Agent Sessions button lets you browse previous conversations with your AI agent. Access it via Quick Actions ({{quickAction}}) or the {{agentSessions}} shortcut. Resume past sessions, search through history, and continue where you left off.',
		descriptionGeneric:
			'The Agent Sessions button lets you browse previous conversations with your AI agent. Access it via Quick Actions ({{quickAction}}) or the {{agentSessions}} shortcut. Resume past sessions, search through history, and continue where you left off.',
		selector: '[data-tour="agent-sessions-button"]',
		position: 'left',
		uiActions: [],
	},
	{
		id: 'input-area',
		title: 'Input Area',
		description:
			'Type your messages here to communicate with the AI. You can also use slash commands and @ mentions for files. Press {{focusInput}} to quickly jump here.',
		descriptionGeneric:
			'Type your messages here to communicate with the AI. You can also use slash commands and @ mentions for files. Press {{focusInput}} to quickly jump here.',
		descriptionContent: inputAreaIconsContent,
		descriptionContentGeneric: inputAreaIconsContent,
		selector: '[data-tour="input-area"]',
		position: 'top',
		uiActions: [],
	},
	{
		id: 'model-selector',
		title: 'Model & Effort',
		description:
			'These pills let you change your AI model and effort level on the fly — no need to dig through settings.',
		descriptionGeneric:
			'These pills let you change your AI model and effort level on the fly — no need to dig through settings.',
		descriptionContent: modelSelectorContent,
		descriptionContentGeneric: modelSelectorContent,
		wide: true,
		selector: '[data-tour="model-selector"], [data-tour="effort-selector"]',
		position: 'top',
		uiActions: [],
	},
	{
		id: 'toolbar-toggles',
		title: 'Session Controls',
		description:
			"These aren't just status indicators — they're clickable buttons that control your session behavior.",
		descriptionGeneric:
			"These aren't just status indicators — they're clickable buttons that control your session behavior.",
		descriptionContent: toolbarTogglesContent,
		descriptionContentGeneric: toolbarTogglesContent,
		wide: true,
		selector: '[data-tour="toolbar-toggles"]',
		position: 'top',
		uiActions: [],
	},
	{
		id: 'additional-tabs',
		title: 'Additional Tabs',
		description:
			'Beyond AI chat tabs, you can open other tab types right alongside your conversations.\n\nPress {{toggleMode}} to open a Terminal tab — a full shell for running commands yourself. Press {{newBrowserTab}} to open a Browser tab for web previews and research without leaving Maestro.\n\nWorking with multiple terminals? Press {{jumpToTerminal}} to instantly jump to the nearest terminal tab.',
		descriptionGeneric:
			'Beyond AI chat tabs, you can open other tab types right alongside your conversations.\n\nPress {{toggleMode}} to open a Terminal tab — a full shell for running commands yourself. Press {{newBrowserTab}} to open a Browser tab for web previews and research without leaving Maestro.\n\nWorking with multiple terminals? Press {{jumpToTerminal}} to instantly jump to the nearest terminal tab.',
		selector: '[data-tour="input-area"]',
		position: 'top',
		uiActions: [],
	},
	// ── Agent Dispatch chapter ────────────────────────────────────────────────
	{
		id: 'dispatch-intro',
		title: 'Agent Dispatch',
		description:
			'Maestro Symphony is the Agent Dispatch system. It lets your AI agents claim open-source GitHub issues, run the work automatically, and submit pull requests — all without you having to manage git by hand.\n\nOpen the dispatch panel via the hamburger menu → Maestro Symphony, or press {{openSymphony}} from anywhere.',
		descriptionGeneric:
			'Maestro Symphony is the Agent Dispatch system. It lets your AI agents claim open-source GitHub issues, run the work automatically, and submit pull requests — all without you having to manage git by hand.\n\nOpen the dispatch panel via the hamburger menu → Maestro Symphony, or press {{openSymphony}} from anywhere.',
		selector: '[data-tour="symphony-menu-button"]',
		position: 'right',
		uiActions: [{ type: 'openHamburgerMenu' }],
	},
	{
		id: 'dispatch-projects',
		title: 'Browse Open Issues',
		description:
			'The Projects tab lists open-source repositories that accept Symphony contributions. Each repository card shows its category and the number of open issues tagged for AI work.\n\nSelect a repository to see its issue list. Pick an issue and click Start to have an agent claim it, create a draft PR, and begin working.',
		descriptionGeneric:
			'The Projects tab lists open-source repositories that accept Symphony contributions. Each repository card shows its category and the number of open issues tagged for AI work.\n\nSelect a repository to see its issue list. Pick an issue and click Start to have an agent claim it, create a draft PR, and begin working.',
		wide: true,
		selector: '[data-tour="symphony-tabs"]',
		position: 'bottom',
		uiActions: [{ type: 'closeHamburgerMenu' }],
	},
	{
		id: 'dispatch-active',
		title: 'Active Contributions',
		description:
			'The Active tab is the kanban-style board for in-progress work. Each card represents a claimed issue and shows its status column: Cloning → Running → Ready for Review → Merged.\n\nCards display the repo, issue title, draft PR link, document and task progress, and token usage. Switch to the agent\'s session directly from a card to monitor or steer the work.',
		descriptionGeneric:
			'The Active tab is the kanban-style board for in-progress work. Each card represents a claimed issue and shows its status column: Cloning → Running → Ready for Review → Merged.\n\nCards display the repo, issue title, draft PR link, document and task progress, and token usage. Switch to the agent\'s session directly from a card to monitor or steer the work.',
		wide: true,
		selector: '[data-tour="symphony-tabs"]',
		position: 'bottom',
		uiActions: [],
	},
	{
		id: 'dispatch-pause-resume',
		title: 'Pause, Resume & Release',
		description:
			'Every active contribution card gives you control over the work item lifecycle:\n\n• The agent status badge (green = running, orange = paused) reflects the underlying Auto Run state.\n• Use Finalize when the agent marks work ready — this converts the draft PR to "ready for review".\n• Use Cancel to release the claim and close the PR. Optionally clean up the local clone.\n\nYou can run several contributions in parallel across different agents and repositories.',
		descriptionGeneric:
			'Every active contribution card gives you control over the work item lifecycle:\n\n• The agent status badge (green = running, orange = paused) reflects the underlying Auto Run state.\n• Use Finalize when the agent marks work ready — this converts the draft PR to "ready for review".\n• Use Cancel to release the claim and close the PR. Optionally clean up the local clone.\n\nYou can run several contributions in parallel across different agents and repositories.',
		wide: true,
		selector: '[data-tour="symphony-active-tab"]',
		position: 'center-overlay',
		uiActions: [],
	},
	{
		id: 'dispatch-fleet-view',
		title: 'Fleet View & Stats',
		description:
			'The Stats tab is the fleet view: your contributor dashboard. It tracks total PRs created, merges, tasks completed, tokens consumed, and estimated value delivered.\n\nAchievement badges unlock as your fleet grows — first contribution, first merge, ten merges, and more. History preserves every past contribution so you can revisit diffs and PR links.',
		descriptionGeneric:
			'The Stats tab is the fleet view: your contributor dashboard. It tracks total PRs created, merges, tasks completed, tokens consumed, and estimated value delivered.\n\nAchievement badges unlock as your fleet grows — first contribution, first merge, ten merges, and more. History preserves every past contribution so you can revisit diffs and PR links.',
		wide: true,
		selector: '[data-tour="symphony-stats-tab"]',
		position: 'center-overlay',
		uiActions: [],
	},
	{
		id: 'dispatch-shortcut',
		title: 'Jump to Agent Dispatch',
		description:
			'Press {{openSymphony}} from anywhere in Maestro to open the Agent Dispatch panel instantly. No need to open the hamburger menu.\n\nYour agents are ready to contribute. Find a project, claim an issue, and let them run.',
		descriptionGeneric:
			'Press {{openSymphony}} from anywhere in Maestro to open the Agent Dispatch panel instantly. No need to open the hamburger menu.\n\nYour agents are ready to contribute. Find a project, claim an issue, and let them run.',
		selector: null,
		position: 'center',
		uiActions: [],
	},
	// ── End of Agent Dispatch chapter ─────────────────────────────────────────

	// ── Living Wiki chapter ──────────────────────────────────────────────────
	{
		id: 'living-wiki-tab',
		title: 'Living Wiki',
		description:
			'The Wiki tab opens Living Wiki — a continuously-updated knowledge base generated from your codebase. Maestro keeps it in sync as the AI makes changes so documentation never goes stale.',
		descriptionGeneric:
			'The Wiki tab opens Living Wiki — a continuously-updated knowledge base generated from your codebase. Maestro keeps it in sync as the AI makes changes so documentation never goes stale.',
		selector: '[data-tour="wiki-tab"]',
		position: 'left',
		uiActions: [{ type: 'setRightTab', value: 'wiki' }, { type: 'openRightPanel' }],
	},
	{
		id: 'living-wiki-enroll',
		title: 'Enroll & Generate',
		description:
			'Enroll your project once to kick off the first doc generation run. After that, Sync keeps everything current. Maestro also writes an llms.txt index so AI agents can discover your docs at a glance.',
		descriptionGeneric:
			'Enroll your project once to kick off the first doc generation run. After that, Sync keeps everything current. Maestro also writes an llms.txt index so AI agents can discover your docs at a glance.',
		descriptionContent: livingWikiEnrollContent,
		descriptionContentGeneric: livingWikiEnrollContent,
		wide: true,
		selector: '[data-tour="wiki-panel"]',
		position: 'left',
		uiActions: [{ type: 'setRightTab', value: 'wiki' }, { type: 'openRightPanel' }],
	},
	{
		id: 'living-wiki-tree-search',
		title: 'Doc Tree & Search',
		description:
			'Browse docs by area in the tree on the left. Use the search bar to filter by title, tag, or content. Click a doc to open it in the viewer, or switch to Edit mode to make manual changes.',
		descriptionGeneric:
			'Browse docs by area in the tree on the left. Use the search bar to filter by title, tag, or content. Click a doc to open it in the viewer, or switch to Edit mode to make manual changes.',
		selector: '[data-tour="wiki-panel"]',
		position: 'left',
		uiActions: [{ type: 'setRightTab', value: 'wiki' }, { type: 'openRightPanel' }],
	},
	{
		id: 'living-wiki-validation',
		title: 'Validation Status',
		description:
			'The validation banner surfaces schema errors, broken links, and stale content across your entire wiki. Fix issues directly in the editor and re-sync to clear them.',
		descriptionGeneric:
			'The validation banner surfaces schema errors, broken links, and stale content across your entire wiki. Fix issues directly in the editor and re-sync to clear them.',
		descriptionContent: livingWikiValidationContent,
		descriptionContentGeneric: livingWikiValidationContent,
		wide: true,
		selector: '[data-tour="wiki-panel"]',
		position: 'left',
		uiActions: [{ type: 'setRightTab', value: 'wiki' }, { type: 'openRightPanel' }],
	},
	{
		id: 'living-wiki-doc-gap',
		title: 'Doc Gap Promote',
		description:
			'When Maestro spots undocumented code areas it records them as Doc Gaps at the bottom of the panel. Promote a gap into a Delivery Planner task with one click and let the AI fill it automatically.',
		descriptionGeneric:
			'When Maestro spots undocumented code areas it records them as Doc Gaps at the bottom of the panel. Promote a gap into a Delivery Planner task with one click and let the AI fill it automatically.',
		descriptionContent: livingWikiDocGapContent,
		descriptionContentGeneric: livingWikiDocGapContent,
		wide: true,
		selector: '[data-tour="wiki-panel"]',
		position: 'left',
		uiActions: [{ type: 'setRightTab', value: 'wiki' }, { type: 'openRightPanel' }],
	},
	// ── End of Living Wiki chapter ───────────────────────────────────────────
	// --- Delivery Planner chapter ---
	{
		id: 'delivery-planner-overview',
		title: 'Delivery Planner',
		description:
			'Delivery Planner turns ideas into agent-ready work. The planning ladder goes: PRD (product requirements) → Epics (feature groups) → Tasks (discrete units of work the AI can pick up and execute).\n\nWork Graph is the source of truth; everything you see in Delivery Planner is backed by structured, searchable data—not just text files.',
		descriptionGeneric:
			'Delivery Planner turns ideas into agent-ready work. The planning ladder goes: PRD (product requirements) → Epics (feature groups) → Tasks (discrete units of work the AI can pick up and execute).\n\nWork Graph is the source of truth; everything you see in Delivery Planner is backed by structured, searchable data—not just text files.',
		descriptionContent: deliveryPlannerOverviewContent,
		descriptionContentGeneric: deliveryPlannerOverviewContent,
		wide: true,
		selector: '[data-tour="delivery-planner"]',
		position: 'right',
		uiActions: [],
	},
	{
		id: 'delivery-planner-prd',
		title: 'PRD Wizard',
		description:
			'Start every project with a PRD. The PRD Wizard walks you through capturing the problem statement, goals, non-goals, and success criteria—then saves it as a structured document in Work Graph.\n\nYou can write it yourself or let the AI draft one from a short prompt.',
		descriptionGeneric:
			'Start every project with a PRD. The PRD Wizard walks you through capturing the problem statement, goals, non-goals, and success criteria—then saves it as a structured document in Work Graph.\n\nYou can write it yourself or let the AI draft one from a short prompt.',
		wide: true,
		selector: '[data-tour="delivery-planner-prd"]',
		position: 'right',
		uiActions: [],
	},
	{
		id: 'delivery-planner-epics',
		title: 'Decompose to Epics',
		description:
			'Once your PRD is ready, decompose it into Epics. Each Epic represents a cohesive feature area or milestone. Epics group related tasks so you can track progress at the right level of granularity.\n\nDecomposition is AI-assisted: the agent reads your PRD and proposes a draft set of Epics for you to review and edit.',
		descriptionGeneric:
			'Once your PRD is ready, decompose it into Epics. Each Epic represents a cohesive feature area or milestone. Epics group related tasks so you can track progress at the right level of granularity.\n\nDecomposition is AI-assisted: the agent reads your PRD and proposes a draft set of Epics for you to review and edit.',
		wide: true,
		selector: '[data-tour="delivery-planner-epics"]',
		position: 'right',
		uiActions: [],
	},
	{
		id: 'delivery-planner-tasks',
		title: 'Decompose to Tasks',
		description:
			'Each Epic is broken into Tasks—small, self-contained units of work. Tasks include a clear title, description, acceptance criteria, and effort estimate. When a task is fully specified it gets the agent-ready tag, signalling it is ready for Agent Dispatch to claim and execute.',
		descriptionGeneric:
			'Each Epic is broken into Tasks—small, self-contained units of work. Tasks include a clear title, description, acceptance criteria, and effort estimate. When a task is fully specified it gets the agent-ready tag, signalling it is ready for Agent Dispatch to claim and execute.',
		wide: true,
		selector: '[data-tour="delivery-planner-tasks"]',
		position: 'right',
		uiActions: [],
	},
	{
		id: 'delivery-planner-github-sync',
		title: 'GitHub Sync',
		description:
			'Push any task or epic to GitHub as an Issue with one click. Sync keeps both sides consistent: close an issue on GitHub and the task status updates in Work Graph, and vice versa. Progress comments flow back into Delivery Planner automatically.',
		descriptionGeneric:
			'Push any task or epic to GitHub as an Issue with one click. Sync keeps both sides consistent: close an issue on GitHub and the task status updates in Work Graph, and vice versa. Progress comments flow back into Delivery Planner automatically.',
		descriptionContent: deliveryPlannerGithubContent,
		descriptionContentGeneric: deliveryPlannerGithubContent,
		wide: true,
		selector: '[data-tour="delivery-planner-github-sync"]',
		position: 'right',
		uiActions: [],
	},
	{
		id: 'delivery-planner-dashboard',
		title: 'Delivery Dashboard',
		description:
			"The dashboard gives you a live snapshot of project health: how many tasks are blocked, in-progress, or done; which epics are ahead of or behind schedule; and the CCPM critical-chain buffer status.\n\nUse it as your daily stand-up anchor to know what's next and where the risks are.",
		descriptionGeneric:
			"The dashboard gives you a live snapshot of project health: how many tasks are blocked, in-progress, or done; which epics are ahead of or behind schedule; and the CCPM critical-chain buffer status.\n\nUse it as your daily stand-up anchor to know what's next and where the risks are.",
		wide: true,
		selector: '[data-tour="delivery-planner-dashboard"]',
		position: 'right',
		uiActions: [],
	},
	// --- End Delivery Planner chapter ---
	{
		id: 'keyboard-shortcuts',
		title: 'Keyboard Shortcuts',
		description:
			"Maestro is keyboard-first. Press {{help}} anytime to see all available shortcuts. You're now ready to build amazing things!",
		descriptionGeneric:
			"Maestro is keyboard-first. Press {{help}} anytime to see all available shortcuts. You're ready to go!",
		selector: null, // Center screen, no specific element
		position: 'center',
		uiActions: [],
	},
];

/**
 * Replace shortcut placeholders in a description string with formatted shortcuts.
 *
 * Placeholders are in the format {{shortcutId}} where shortcutId matches
 * a key in the shortcuts record.
 *
 * @param text - The description text with placeholders
 * @param shortcuts - Record of shortcut configurations
 * @returns The text with placeholders replaced by formatted shortcuts
 *
 * @example
 * replaceShortcutPlaceholders(
 *   'Press {{toggleMode}} to switch modes.',
 *   { toggleMode: { id: 'toggleMode', label: 'Switch Mode', keys: ['Meta', 'j'] } }
 * )
 * // Returns: 'Press ⌘ J to switch modes.' (on macOS)
 */
export function replaceShortcutPlaceholders(
	text: string,
	shortcuts: Record<string, Shortcut>
): string {
	return text.replace(/\{\{(\w+)\}\}/g, (match, shortcutId) => {
		const shortcut = shortcuts[shortcutId];
		if (shortcut?.keys) {
			return formatShortcutKeys(shortcut.keys);
		}
		// If shortcut not found, return the placeholder as-is
		return match;
	});
}

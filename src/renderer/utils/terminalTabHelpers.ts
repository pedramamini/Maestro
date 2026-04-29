// Terminal tab helper functions for shell command persistence.
// These helpers manage TerminalTab state within Maestro sessions.
//
// Mirrors the immutable `(session, ...) → Session` pattern from `tabHelpers.ts`:
// returns the same session reference when no change is needed (so React
// re-renders are skipped on no-op updates).

import { Session } from '../types';

/**
 * Update the shell-integration command state for a single terminal tab.
 *
 * Called when an OSC 133 B (command-start) or D (command-finished) sequence
 * arrives for the tab — see the OSC parser in `src/main/shell-integration/oscParser.ts`
 * and the IPC subscription in `src/renderer/hooks/agent/useAgentListeners.ts`.
 *
 * Reference equality is preserved when:
 *   - the session has no `terminalTabs`,
 *   - no tab matches `tabId`,
 *   - or the incoming `command`/`commandRunning` already match the tab's state.
 *
 * @param session - The Maestro session containing the tab
 * @param tabId - ID of the terminal tab to update
 * @param command - Command line that started running (or last finished); `undefined` clears it
 * @param commandRunning - Whether a command is currently executing in the tab's shell
 * @returns The session — same reference if no change, otherwise a new immutable copy
 */
export function updateTerminalTabCommand(
	session: Session,
	tabId: string,
	command: string | undefined,
	commandRunning: boolean
): Session {
	if (!session || !session.terminalTabs || session.terminalTabs.length === 0) {
		return session;
	}

	const targetTab = session.terminalTabs.find((t) => t.id === tabId);
	if (!targetTab) {
		return session;
	}

	if (targetTab.currentCommand === command && targetTab.commandRunning === commandRunning) {
		return session;
	}

	return {
		...session,
		terminalTabs: session.terminalTabs.map((tab) =>
			tab.id === tabId ? { ...tab, currentCommand: command, commandRunning } : tab
		),
	};
}

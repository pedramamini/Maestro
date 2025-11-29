// Tab helper functions for AI multi-tab support
// These helpers manage AITab state within Maestro sessions

import { Session, AITab, ClosedTab, LogEntry, UsageStats } from '../types';
import { generateId } from './ids';

// Maximum number of closed tabs to keep in history
const MAX_CLOSED_TAB_HISTORY = 25;

/**
 * Get the currently active AI tab for a session.
 * Returns the tab matching activeTabId, or the first tab if not found.
 * Returns undefined if the session has no tabs.
 *
 * @param session - The Maestro session
 * @returns The active AITab or undefined if no tabs exist
 */
export function getActiveTab(session: Session): AITab | undefined {
  if (!session.aiTabs || session.aiTabs.length === 0) {
    return undefined;
  }

  const activeTab = session.aiTabs.find(tab => tab.id === session.activeTabId);

  // Fallback to first tab if activeTabId doesn't match any tab
  // (can happen after tab deletion or data corruption)
  return activeTab ?? session.aiTabs[0];
}

/**
 * Options for creating a new AI tab.
 */
export interface CreateTabOptions {
  claudeSessionId?: string | null;  // Claude Code session UUID (null for new tabs)
  logs?: LogEntry[];                // Initial conversation history
  name?: string | null;             // User-defined name (null = show UUID octet)
  starred?: boolean;                // Whether session is starred
  usageStats?: UsageStats;          // Token usage stats
}

/**
 * Result of creating a new tab - contains both the new tab and updated session.
 */
export interface CreateTabResult {
  tab: AITab;                       // The newly created tab
  session: Session;                 // Updated session with the new tab added and set as active
}

/**
 * Create a new AI tab for a session.
 * The new tab is appended to the session's aiTabs array and set as the active tab.
 *
 * @param session - The Maestro session to add the tab to
 * @param options - Optional tab configuration (claudeSessionId, logs, name, starred)
 * @returns Object containing the new tab and updated session
 *
 * @example
 * // Create a new empty tab
 * const { tab, session: updatedSession } = createTab(session);
 *
 * @example
 * // Create a tab for an existing Claude session
 * const { tab, session: updatedSession } = createTab(session, {
 *   claudeSessionId: 'abc123',
 *   name: 'My Feature',
 *   starred: true,
 *   logs: existingLogs
 * });
 */
export function createTab(session: Session, options: CreateTabOptions = {}): CreateTabResult {
  const {
    claudeSessionId = null,
    logs = [],
    name = null,
    starred = false,
    usageStats
  } = options;

  // Create the new tab with default values
  const newTab: AITab = {
    id: generateId(),
    claudeSessionId,
    name,
    starred,
    logs,
    messageQueue: [],
    inputValue: '',
    stagedImages: [],
    usageStats,
    createdAt: Date.now(),
    state: 'idle'
  };

  // Update the session with the new tab added and set as active
  const updatedSession: Session = {
    ...session,
    aiTabs: [...(session.aiTabs || []), newTab],
    activeTabId: newTab.id
  };

  return {
    tab: newTab,
    session: updatedSession
  };
}

/**
 * Result of closing a tab - contains the closed tab info and updated session.
 */
export interface CloseTabResult {
  closedTab: ClosedTab;           // The closed tab data with original index
  session: Session;               // Updated session with tab removed
}

/**
 * Close an AI tab and add it to the closed tab history.
 * The closed tab is stored in closedTabHistory for potential restoration via Cmd+Shift+T.
 * If the closed tab was active, the next tab (or previous if at end) becomes active.
 *
 * @param session - The Maestro session containing the tab
 * @param tabId - The ID of the tab to close
 * @returns Object containing the closed tab info and updated session, or null if tab not found or is the only tab
 *
 * @example
 * const result = closeTab(session, 'tab-123');
 * if (result) {
 *   const { closedTab, session: updatedSession } = result;
 *   console.log(`Closed tab at index ${closedTab.index}`);
 * }
 */
export function closeTab(session: Session, tabId: string): CloseTabResult | null {
  // Don't allow closing the only tab
  if (!session.aiTabs || session.aiTabs.length <= 1) {
    return null;
  }

  // Find the tab to close
  const tabIndex = session.aiTabs.findIndex(tab => tab.id === tabId);
  if (tabIndex === -1) {
    return null;
  }

  const tabToClose = session.aiTabs[tabIndex];

  // Create closed tab entry with original index
  const closedTab: ClosedTab = {
    tab: { ...tabToClose },
    index: tabIndex,
    closedAt: Date.now()
  };

  // Remove tab from aiTabs
  const updatedTabs = session.aiTabs.filter(tab => tab.id !== tabId);

  // Determine new active tab if the closed tab was active
  let newActiveTabId = session.activeTabId;
  if (session.activeTabId === tabId) {
    // If we closed the active tab, select the next tab or the previous one if at end
    const newIndex = Math.min(tabIndex, updatedTabs.length - 1);
    newActiveTabId = updatedTabs[newIndex].id;
  }

  // Add to closed tab history, maintaining max size
  const updatedHistory = [closedTab, ...(session.closedTabHistory || [])].slice(0, MAX_CLOSED_TAB_HISTORY);

  // Create updated session
  const updatedSession: Session = {
    ...session,
    aiTabs: updatedTabs,
    activeTabId: newActiveTabId,
    closedTabHistory: updatedHistory
  };

  return {
    closedTab,
    session: updatedSession
  };
}

/**
 * Result of reopening a closed tab.
 */
export interface ReopenTabResult {
  tab: AITab;                       // The reopened tab (either restored or existing duplicate)
  session: Session;                 // Updated session with tab restored/selected
  wasDuplicate: boolean;            // True if we switched to an existing tab instead of restoring
}

/**
 * Reopen the most recently closed tab from the closed tab history.
 * Includes duplicate detection: if a tab with the same claudeSessionId already exists,
 * switch to that existing tab instead of creating a duplicate.
 *
 * The tab is restored at its original index position if possible, otherwise appended to the end.
 * The reopened tab becomes the active tab.
 *
 * @param session - The Maestro session
 * @returns Object containing the reopened tab and updated session, or null if no closed tabs exist
 *
 * @example
 * const result = reopenClosedTab(session);
 * if (result) {
 *   const { tab, session: updatedSession, wasDuplicate } = result;
 *   if (wasDuplicate) {
 *     console.log(`Switched to existing tab ${tab.id}`);
 *   } else {
 *     console.log(`Restored tab ${tab.id} from history`);
 *   }
 * }
 */
export function reopenClosedTab(session: Session): ReopenTabResult | null {
  // Check if there's anything in the history
  if (!session.closedTabHistory || session.closedTabHistory.length === 0) {
    return null;
  }

  // Pop the most recently closed tab from history
  const [closedTabEntry, ...remainingHistory] = session.closedTabHistory;
  const tabToRestore = closedTabEntry.tab;

  // Check for duplicate: does a tab with the same claudeSessionId already exist?
  // Note: null claudeSessionId (new/empty tabs) are never considered duplicates
  if (tabToRestore.claudeSessionId !== null) {
    const existingTab = session.aiTabs.find(
      tab => tab.claudeSessionId === tabToRestore.claudeSessionId
    );

    if (existingTab) {
      // Duplicate found - switch to existing tab instead of restoring
      // Still remove from history since user "used" their undo
      return {
        tab: existingTab,
        session: {
          ...session,
          activeTabId: existingTab.id,
          closedTabHistory: remainingHistory
        },
        wasDuplicate: true
      };
    }
  }

  // No duplicate - restore the tab
  // Generate a new ID to avoid any ID conflicts
  const restoredTab: AITab = {
    ...tabToRestore,
    id: generateId()
  };

  // Insert at original index if possible, otherwise append
  const insertIndex = Math.min(closedTabEntry.index, session.aiTabs.length);
  const updatedTabs = [
    ...session.aiTabs.slice(0, insertIndex),
    restoredTab,
    ...session.aiTabs.slice(insertIndex)
  ];

  return {
    tab: restoredTab,
    session: {
      ...session,
      aiTabs: updatedTabs,
      activeTabId: restoredTab.id,
      closedTabHistory: remainingHistory
    },
    wasDuplicate: false
  };
}

/**
 * Result of setting the active tab.
 */
export interface SetActiveTabResult {
  tab: AITab;                       // The newly active tab
  session: Session;                 // Updated session with activeTabId changed
}

/**
 * Set the active AI tab for a session.
 * Changes which tab is currently displayed and receives input.
 *
 * @param session - The Maestro session
 * @param tabId - The ID of the tab to make active
 * @returns Object containing the active tab and updated session, or null if tab not found
 *
 * @example
 * const result = setActiveTab(session, 'tab-456');
 * if (result) {
 *   const { tab, session: updatedSession } = result;
 *   console.log(`Now viewing tab: ${tab.name || tab.claudeSessionId}`);
 * }
 */
export function setActiveTab(session: Session, tabId: string): SetActiveTabResult | null {
  // Validate that the tab exists
  if (!session.aiTabs || session.aiTabs.length === 0) {
    return null;
  }

  const targetTab = session.aiTabs.find(tab => tab.id === tabId);
  if (!targetTab) {
    return null;
  }

  // If already active, return current state (no mutation needed)
  if (session.activeTabId === tabId) {
    return {
      tab: targetTab,
      session
    };
  }

  // Update the session with the new active tab
  const updatedSession: Session = {
    ...session,
    activeTabId: tabId
  };

  return {
    tab: targetTab,
    session: updatedSession
  };
}

/**
 * Get the tab that is currently in write mode (busy state) for a session.
 * In write-mode locking, only one tab can be busy at a time per Maestro session
 * to prevent file clobbering when multiple Claude sessions write to the same project.
 *
 * @param session - The Maestro session
 * @returns The busy AITab or undefined if no tab is in write mode
 *
 * @example
 * const busyTab = getWriteModeTab(session);
 * if (busyTab) {
 *   console.log(`Tab ${busyTab.name || busyTab.claudeSessionId} is currently writing`);
 *   // Disable input for other tabs
 * }
 */
export function getWriteModeTab(session: Session): AITab | undefined {
  if (!session.aiTabs || session.aiTabs.length === 0) {
    return undefined;
  }

  return session.aiTabs.find(tab => tab.state === 'busy');
}

/**
 * Get all tabs that are currently busy (in write mode) for a session.
 * While the system enforces single write-mode, multiple busy tabs can exist
 * temporarily when resuming already-running sessions.
 *
 * This is useful for the busy tab indicator which needs to show ALL busy tabs,
 * not just the first one found.
 *
 * @param session - The Maestro session
 * @returns Array of busy AITabs (empty if none are busy)
 *
 * @example
 * const busyTabs = getBusyTabs(session);
 * if (busyTabs.length > 0) {
 *   // Show busy indicator with pills for each busy tab
 *   busyTabs.forEach(tab => {
 *     console.log(`Tab ${tab.name || tab.claudeSessionId} is busy`);
 *   });
 * }
 */
export function getBusyTabs(session: Session): AITab[] {
  if (!session.aiTabs || session.aiTabs.length === 0) {
    return [];
  }

  return session.aiTabs.filter(tab => tab.state === 'busy');
}

/**
 * Navigate to the next tab in the session's tab list.
 * Wraps around to the first tab if currently on the last tab.
 *
 * @param session - The Maestro session
 * @returns Object containing the new active tab and updated session, or null if less than 2 tabs
 *
 * @example
 * const result = navigateToNextTab(session);
 * if (result) {
 *   setSessions(prev => prev.map(s => s.id === session.id ? result.session : s));
 * }
 */
export function navigateToNextTab(session: Session): SetActiveTabResult | null {
  if (!session.aiTabs || session.aiTabs.length < 2) {
    return null;
  }

  const currentIndex = session.aiTabs.findIndex(tab => tab.id === session.activeTabId);
  if (currentIndex === -1) {
    return null;
  }

  // Wrap around to first tab if at the end
  const nextIndex = (currentIndex + 1) % session.aiTabs.length;
  const nextTab = session.aiTabs[nextIndex];

  return {
    tab: nextTab,
    session: {
      ...session,
      activeTabId: nextTab.id
    }
  };
}

/**
 * Navigate to the previous tab in the session's tab list.
 * Wraps around to the last tab if currently on the first tab.
 *
 * @param session - The Maestro session
 * @returns Object containing the new active tab and updated session, or null if less than 2 tabs
 *
 * @example
 * const result = navigateToPrevTab(session);
 * if (result) {
 *   setSessions(prev => prev.map(s => s.id === session.id ? result.session : s));
 * }
 */
export function navigateToPrevTab(session: Session): SetActiveTabResult | null {
  if (!session.aiTabs || session.aiTabs.length < 2) {
    return null;
  }

  const currentIndex = session.aiTabs.findIndex(tab => tab.id === session.activeTabId);
  if (currentIndex === -1) {
    return null;
  }

  // Wrap around to last tab if at the beginning
  const prevIndex = (currentIndex - 1 + session.aiTabs.length) % session.aiTabs.length;
  const prevTab = session.aiTabs[prevIndex];

  return {
    tab: prevTab,
    session: {
      ...session,
      activeTabId: prevTab.id
    }
  };
}

/**
 * Navigate to a specific tab by its index (0-based).
 * Used for Cmd+1 through Cmd+8 shortcuts.
 *
 * @param session - The Maestro session
 * @param index - The 0-based index of the tab to navigate to
 * @returns Object containing the new active tab and updated session, or null if index out of bounds
 *
 * @example
 * // Navigate to the first tab (Cmd+1)
 * const result = navigateToTabByIndex(session, 0);
 * if (result) {
 *   setSessions(prev => prev.map(s => s.id === session.id ? result.session : s));
 * }
 */
export function navigateToTabByIndex(session: Session, index: number): SetActiveTabResult | null {
  if (!session.aiTabs || session.aiTabs.length === 0) {
    return null;
  }

  // Check if index is within bounds
  if (index < 0 || index >= session.aiTabs.length) {
    return null;
  }

  const targetTab = session.aiTabs[index];

  // If already on this tab, return current state (no change needed)
  if (session.activeTabId === targetTab.id) {
    return {
      tab: targetTab,
      session
    };
  }

  return {
    tab: targetTab,
    session: {
      ...session,
      activeTabId: targetTab.id
    }
  };
}

/**
 * Navigate to the last tab in the session's tab list.
 * Used for Cmd+9 shortcut.
 *
 * @param session - The Maestro session
 * @returns Object containing the new active tab and updated session, or null if no tabs
 *
 * @example
 * const result = navigateToLastTab(session);
 * if (result) {
 *   setSessions(prev => prev.map(s => s.id === session.id ? result.session : s));
 * }
 */
export function navigateToLastTab(session: Session): SetActiveTabResult | null {
  if (!session.aiTabs || session.aiTabs.length === 0) {
    return null;
  }

  const lastIndex = session.aiTabs.length - 1;
  return navigateToTabByIndex(session, lastIndex);
}

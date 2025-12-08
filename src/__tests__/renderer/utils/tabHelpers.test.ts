/**
 * Tests for tabHelpers.ts - AI multi-tab management utilities
 *
 * Functions tested:
 * - getActiveTab
 * - createTab
 * - closeTab
 * - reopenClosedTab
 * - setActiveTab
 * - getWriteModeTab
 * - getBusyTabs
 * - navigateToNextTab
 * - navigateToPrevTab
 * - navigateToTabByIndex
 * - navigateToLastTab
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getActiveTab,
  createTab,
  closeTab,
  reopenClosedTab,
  setActiveTab,
  getWriteModeTab,
  getBusyTabs,
  navigateToNextTab,
  navigateToPrevTab,
  navigateToTabByIndex,
  navigateToLastTab,
} from '../../../renderer/utils/tabHelpers';
import type { Session, AITab, ClosedTab } from '../../../renderer/types';

// Mock the generateId function to return predictable IDs
vi.mock('../../../renderer/utils/ids', () => ({
  generateId: vi.fn(() => 'mock-generated-id'),
}));

// Helper to create a minimal Session for testing
function createMockSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    name: 'Test Session',
    toolType: 'claude-code',
    state: 'idle',
    cwd: '/test',
    fullPath: '/test',
    projectRoot: '/test',
    aiLogs: [],
    shellLogs: [],
    workLog: [],
    contextUsage: 0,
    inputMode: 'ai',
    aiPid: 0,
    terminalPid: 0,
    port: 0,
    isLive: false,
    changedFiles: [],
    isGitRepo: false,
    fileTree: [],
    fileExplorerExpanded: [],
    fileExplorerScrollPos: 0,
    executionQueue: [],
    activeTimeMs: 0,
    aiTabs: [],
    activeTabId: '',
    closedTabHistory: [],
    ...overrides,
  };
}

// Helper to create a minimal AITab for testing
function createMockTab(overrides: Partial<AITab> = {}): AITab {
  return {
    id: 'tab-1',
    claudeSessionId: null,
    name: null,
    starred: false,
    logs: [],
    inputValue: '',
    stagedImages: [],
    createdAt: Date.now(),
    state: 'idle',
    ...overrides,
  };
}

describe('tabHelpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getActiveTab', () => {
    it('returns undefined for session with no tabs', () => {
      const session = createMockSession({ aiTabs: [], activeTabId: '' });
      expect(getActiveTab(session)).toBeUndefined();
    });

    it('returns undefined for session with undefined aiTabs', () => {
      const session = createMockSession();
      (session as any).aiTabs = undefined;
      expect(getActiveTab(session)).toBeUndefined();
    });

    it('returns the active tab when activeTabId matches', () => {
      const tab1 = createMockTab({ id: 'tab-1' });
      const tab2 = createMockTab({ id: 'tab-2' });
      const session = createMockSession({
        aiTabs: [tab1, tab2],
        activeTabId: 'tab-2',
      });

      const result = getActiveTab(session);
      expect(result).toBe(tab2);
    });

    it('returns first tab as fallback when activeTabId does not match', () => {
      const tab1 = createMockTab({ id: 'tab-1' });
      const tab2 = createMockTab({ id: 'tab-2' });
      const session = createMockSession({
        aiTabs: [tab1, tab2],
        activeTabId: 'non-existent-id',
      });

      const result = getActiveTab(session);
      expect(result).toBe(tab1);
    });
  });

  describe('createTab', () => {
    it('creates a new tab with default options', () => {
      const session = createMockSession({ aiTabs: [] });

      const result = createTab(session);

      expect(result.tab).toMatchObject({
        id: 'mock-generated-id',
        claudeSessionId: null,
        name: null,
        starred: false,
        logs: [],
        inputValue: '',
        stagedImages: [],
        state: 'idle',
        saveToHistory: false,
      });
      expect(result.tab.createdAt).toBeDefined();
      expect(result.session.aiTabs).toHaveLength(1);
      expect(result.session.activeTabId).toBe('mock-generated-id');
    });

    it('creates a tab with custom options', () => {
      const session = createMockSession({ aiTabs: [] });
      const options = {
        claudeSessionId: 'claude-123',
        name: 'My Tab',
        starred: true,
        logs: [{ id: 'log-1', timestamp: 123, source: 'user' as const, text: 'test' }],
        usageStats: {
          inputTokens: 100,
          outputTokens: 50,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
          totalCostUsd: 0.01,
          contextWindow: 200000,
        },
        saveToHistory: true,
      };

      const result = createTab(session, options);

      expect(result.tab.claudeSessionId).toBe('claude-123');
      expect(result.tab.name).toBe('My Tab');
      expect(result.tab.starred).toBe(true);
      expect(result.tab.logs).toHaveLength(1);
      expect(result.tab.usageStats).toEqual(options.usageStats);
      expect(result.tab.saveToHistory).toBe(true);
    });

    it('appends tab to existing tabs', () => {
      const existingTab = createMockTab({ id: 'existing-tab' });
      const session = createMockSession({
        aiTabs: [existingTab],
        activeTabId: 'existing-tab',
      });

      const result = createTab(session);

      expect(result.session.aiTabs).toHaveLength(2);
      expect(result.session.aiTabs[0]).toBe(existingTab);
      expect(result.session.aiTabs[1]).toBe(result.tab);
    });

    it('sets new tab as active', () => {
      const existingTab = createMockTab({ id: 'existing-tab' });
      const session = createMockSession({
        aiTabs: [existingTab],
        activeTabId: 'existing-tab',
      });

      const result = createTab(session);

      expect(result.session.activeTabId).toBe(result.tab.id);
    });
  });

  describe('closeTab', () => {
    it('returns null for session with no tabs', () => {
      const session = createMockSession({ aiTabs: [] });
      expect(closeTab(session, 'any-id')).toBeNull();
    });

    it('returns null for session with undefined aiTabs', () => {
      const session = createMockSession();
      (session as any).aiTabs = undefined;
      expect(closeTab(session, 'any-id')).toBeNull();
    });

    it('returns null if tab is not found', () => {
      const tab = createMockTab({ id: 'tab-1' });
      const session = createMockSession({ aiTabs: [tab] });

      expect(closeTab(session, 'non-existent')).toBeNull();
    });

    it('closes tab and adds to history', () => {
      const tab1 = createMockTab({ id: 'tab-1' });
      const tab2 = createMockTab({ id: 'tab-2' });
      const session = createMockSession({
        aiTabs: [tab1, tab2],
        activeTabId: 'tab-1',
        closedTabHistory: [],
      });

      const result = closeTab(session, 'tab-1');

      expect(result).not.toBeNull();
      expect(result!.closedTab.tab.id).toBe('tab-1');
      expect(result!.closedTab.index).toBe(0);
      expect(result!.closedTab.closedAt).toBeDefined();
      expect(result!.session.aiTabs).toHaveLength(1);
      expect(result!.session.aiTabs[0].id).toBe('tab-2');
    });

    it('selects next tab when active tab is closed', () => {
      const tab1 = createMockTab({ id: 'tab-1' });
      const tab2 = createMockTab({ id: 'tab-2' });
      const tab3 = createMockTab({ id: 'tab-3' });
      const session = createMockSession({
        aiTabs: [tab1, tab2, tab3],
        activeTabId: 'tab-2',
      });

      const result = closeTab(session, 'tab-2');

      expect(result!.session.activeTabId).toBe('tab-3');
    });

    it('selects previous tab when closing last tab in list', () => {
      const tab1 = createMockTab({ id: 'tab-1' });
      const tab2 = createMockTab({ id: 'tab-2' });
      const session = createMockSession({
        aiTabs: [tab1, tab2],
        activeTabId: 'tab-2',
      });

      const result = closeTab(session, 'tab-2');

      expect(result!.session.activeTabId).toBe('tab-1');
    });

    it('creates fresh tab when closing the only tab', () => {
      const tab = createMockTab({ id: 'tab-1' });
      const session = createMockSession({
        aiTabs: [tab],
        activeTabId: 'tab-1',
      });

      const result = closeTab(session, 'tab-1');

      expect(result!.session.aiTabs).toHaveLength(1);
      expect(result!.session.aiTabs[0].id).toBe('mock-generated-id');
      expect(result!.session.activeTabId).toBe('mock-generated-id');
    });

    it('maintains max 25 items in closed tab history', () => {
      const tab = createMockTab({ id: 'tab-1' });
      const existingHistory: ClosedTab[] = Array.from({ length: 25 }, (_, i) => ({
        tab: createMockTab({ id: `old-tab-${i}` }),
        index: 0,
        closedAt: Date.now() - i * 1000,
      }));
      const session = createMockSession({
        aiTabs: [tab, createMockTab({ id: 'tab-2' })],
        activeTabId: 'tab-1',
        closedTabHistory: existingHistory,
      });

      const result = closeTab(session, 'tab-1');

      expect(result!.session.closedTabHistory).toHaveLength(25);
      expect(result!.session.closedTabHistory[0].tab.id).toBe('tab-1');
    });

    it('preserves activeTabId when closing non-active tab', () => {
      const tab1 = createMockTab({ id: 'tab-1' });
      const tab2 = createMockTab({ id: 'tab-2' });
      const session = createMockSession({
        aiTabs: [tab1, tab2],
        activeTabId: 'tab-1',
      });

      const result = closeTab(session, 'tab-2');

      expect(result!.session.activeTabId).toBe('tab-1');
    });
  });

  describe('reopenClosedTab', () => {
    it('returns null when no closed tabs exist', () => {
      const session = createMockSession({ closedTabHistory: [] });
      expect(reopenClosedTab(session)).toBeNull();
    });

    it('returns null when closedTabHistory is undefined', () => {
      const session = createMockSession();
      (session as any).closedTabHistory = undefined;
      expect(reopenClosedTab(session)).toBeNull();
    });

    it('restores tab at original index', () => {
      const existingTab = createMockTab({ id: 'existing' });
      const closedTab = createMockTab({
        id: 'closed-tab',
        claudeSessionId: null,
        name: 'Restored Tab',
      });
      const session = createMockSession({
        aiTabs: [existingTab],
        activeTabId: 'existing',
        closedTabHistory: [{ tab: closedTab, index: 0, closedAt: Date.now() }],
      });

      const result = reopenClosedTab(session);

      expect(result).not.toBeNull();
      expect(result!.wasDuplicate).toBe(false);
      expect(result!.session.aiTabs).toHaveLength(2);
      expect(result!.session.aiTabs[0].name).toBe('Restored Tab');
      expect(result!.session.activeTabId).toBe('mock-generated-id');
    });

    it('generates new ID for restored tab', () => {
      const closedTab = createMockTab({ id: 'old-id' });
      const session = createMockSession({
        aiTabs: [],
        closedTabHistory: [{ tab: closedTab, index: 0, closedAt: Date.now() }],
      });

      const result = reopenClosedTab(session);

      expect(result!.tab.id).toBe('mock-generated-id');
    });

    it('detects duplicate by claudeSessionId and switches instead', () => {
      const existingTab = createMockTab({
        id: 'existing',
        claudeSessionId: 'session-123',
      });
      const closedTab = createMockTab({
        id: 'closed',
        claudeSessionId: 'session-123',
      });
      const session = createMockSession({
        aiTabs: [existingTab],
        activeTabId: 'some-other-tab',
        closedTabHistory: [{ tab: closedTab, index: 1, closedAt: Date.now() }],
      });

      const result = reopenClosedTab(session);

      expect(result).not.toBeNull();
      expect(result!.wasDuplicate).toBe(true);
      expect(result!.tab).toBe(existingTab);
      expect(result!.session.activeTabId).toBe('existing');
      expect(result!.session.aiTabs).toHaveLength(1);
    });

    it('does not consider null claudeSessionId as duplicate', () => {
      const existingTab = createMockTab({
        id: 'existing',
        claudeSessionId: null,
      });
      const closedTab = createMockTab({
        id: 'closed',
        claudeSessionId: null,
      });
      const session = createMockSession({
        aiTabs: [existingTab],
        activeTabId: 'existing',
        closedTabHistory: [{ tab: closedTab, index: 0, closedAt: Date.now() }],
      });

      const result = reopenClosedTab(session);

      expect(result!.wasDuplicate).toBe(false);
      expect(result!.session.aiTabs).toHaveLength(2);
    });

    it('appends at end if original index exceeds current length', () => {
      const existingTab = createMockTab({ id: 'existing' });
      const closedTab = createMockTab({ id: 'closed', claudeSessionId: null });
      const session = createMockSession({
        aiTabs: [existingTab],
        activeTabId: 'existing',
        closedTabHistory: [{ tab: closedTab, index: 10, closedAt: Date.now() }],
      });

      const result = reopenClosedTab(session);

      expect(result!.session.aiTabs).toHaveLength(2);
      expect(result!.session.aiTabs[1].id).toBe('mock-generated-id');
    });

    it('removes tab from history after restoration', () => {
      const closedTab1 = createMockTab({ id: 'closed-1', claudeSessionId: null });
      const closedTab2 = createMockTab({ id: 'closed-2', claudeSessionId: null });
      const session = createMockSession({
        aiTabs: [],
        closedTabHistory: [
          { tab: closedTab1, index: 0, closedAt: Date.now() },
          { tab: closedTab2, index: 0, closedAt: Date.now() - 1000 },
        ],
      });

      const result = reopenClosedTab(session);

      expect(result!.session.closedTabHistory).toHaveLength(1);
      expect(result!.session.closedTabHistory[0].tab.id).toBe('closed-2');
    });
  });

  describe('setActiveTab', () => {
    it('returns null for session with no tabs', () => {
      const session = createMockSession({ aiTabs: [] });
      expect(setActiveTab(session, 'any-id')).toBeNull();
    });

    it('returns null for session with undefined aiTabs', () => {
      const session = createMockSession();
      (session as any).aiTabs = undefined;
      expect(setActiveTab(session, 'any-id')).toBeNull();
    });

    it('returns null if tab not found', () => {
      const tab = createMockTab({ id: 'tab-1' });
      const session = createMockSession({ aiTabs: [tab] });

      expect(setActiveTab(session, 'non-existent')).toBeNull();
    });

    it('returns same session object when already active', () => {
      const tab = createMockTab({ id: 'tab-1' });
      const session = createMockSession({
        aiTabs: [tab],
        activeTabId: 'tab-1',
      });

      const result = setActiveTab(session, 'tab-1');

      expect(result!.session).toBe(session);
      expect(result!.tab).toBe(tab);
    });

    it('updates activeTabId when switching tabs', () => {
      const tab1 = createMockTab({ id: 'tab-1' });
      const tab2 = createMockTab({ id: 'tab-2' });
      const session = createMockSession({
        aiTabs: [tab1, tab2],
        activeTabId: 'tab-1',
      });

      const result = setActiveTab(session, 'tab-2');

      expect(result!.session.activeTabId).toBe('tab-2');
      expect(result!.tab).toBe(tab2);
    });
  });

  describe('getWriteModeTab', () => {
    it('returns undefined for session with no tabs', () => {
      const session = createMockSession({ aiTabs: [] });
      expect(getWriteModeTab(session)).toBeUndefined();
    });

    it('returns undefined for session with undefined aiTabs', () => {
      const session = createMockSession();
      (session as any).aiTabs = undefined;
      expect(getWriteModeTab(session)).toBeUndefined();
    });

    it('returns undefined when no tab is busy', () => {
      const tab1 = createMockTab({ id: 'tab-1', state: 'idle' });
      const tab2 = createMockTab({ id: 'tab-2', state: 'idle' });
      const session = createMockSession({ aiTabs: [tab1, tab2] });

      expect(getWriteModeTab(session)).toBeUndefined();
    });

    it('returns the busy tab', () => {
      const tab1 = createMockTab({ id: 'tab-1', state: 'idle' });
      const tab2 = createMockTab({ id: 'tab-2', state: 'busy' });
      const session = createMockSession({ aiTabs: [tab1, tab2] });

      expect(getWriteModeTab(session)).toBe(tab2);
    });

    it('returns first busy tab when multiple are busy', () => {
      const tab1 = createMockTab({ id: 'tab-1', state: 'busy' });
      const tab2 = createMockTab({ id: 'tab-2', state: 'busy' });
      const session = createMockSession({ aiTabs: [tab1, tab2] });

      expect(getWriteModeTab(session)).toBe(tab1);
    });
  });

  describe('getBusyTabs', () => {
    it('returns empty array for session with no tabs', () => {
      const session = createMockSession({ aiTabs: [] });
      expect(getBusyTabs(session)).toEqual([]);
    });

    it('returns empty array for session with undefined aiTabs', () => {
      const session = createMockSession();
      (session as any).aiTabs = undefined;
      expect(getBusyTabs(session)).toEqual([]);
    });

    it('returns empty array when no tabs are busy', () => {
      const tab1 = createMockTab({ id: 'tab-1', state: 'idle' });
      const tab2 = createMockTab({ id: 'tab-2', state: 'idle' });
      const session = createMockSession({ aiTabs: [tab1, tab2] });

      expect(getBusyTabs(session)).toEqual([]);
    });

    it('returns all busy tabs', () => {
      const tab1 = createMockTab({ id: 'tab-1', state: 'busy' });
      const tab2 = createMockTab({ id: 'tab-2', state: 'idle' });
      const tab3 = createMockTab({ id: 'tab-3', state: 'busy' });
      const session = createMockSession({ aiTabs: [tab1, tab2, tab3] });

      const result = getBusyTabs(session);

      expect(result).toHaveLength(2);
      expect(result).toContain(tab1);
      expect(result).toContain(tab3);
    });
  });

  describe('navigateToNextTab', () => {
    it('returns null for session with less than 2 tabs', () => {
      const tab = createMockTab({ id: 'tab-1' });
      const session = createMockSession({ aiTabs: [tab] });

      expect(navigateToNextTab(session)).toBeNull();
    });

    it('returns null for session with no tabs', () => {
      const session = createMockSession({ aiTabs: [] });
      expect(navigateToNextTab(session)).toBeNull();
    });

    it('returns null for session with undefined aiTabs', () => {
      const session = createMockSession();
      (session as any).aiTabs = undefined;
      expect(navigateToNextTab(session)).toBeNull();
    });

    it('navigates to next tab', () => {
      const tab1 = createMockTab({ id: 'tab-1' });
      const tab2 = createMockTab({ id: 'tab-2' });
      const tab3 = createMockTab({ id: 'tab-3' });
      const session = createMockSession({
        aiTabs: [tab1, tab2, tab3],
        activeTabId: 'tab-1',
      });

      const result = navigateToNextTab(session);

      expect(result!.tab).toBe(tab2);
      expect(result!.session.activeTabId).toBe('tab-2');
    });

    it('wraps around to first tab from last', () => {
      const tab1 = createMockTab({ id: 'tab-1' });
      const tab2 = createMockTab({ id: 'tab-2' });
      const session = createMockSession({
        aiTabs: [tab1, tab2],
        activeTabId: 'tab-2',
      });

      const result = navigateToNextTab(session);

      expect(result!.tab).toBe(tab1);
      expect(result!.session.activeTabId).toBe('tab-1');
    });

    it('filters to unread tabs when showUnreadOnly is true', () => {
      const tab1 = createMockTab({ id: 'tab-1', hasUnread: false });
      const tab2 = createMockTab({ id: 'tab-2', hasUnread: true });
      const tab3 = createMockTab({ id: 'tab-3', hasUnread: true });
      const session = createMockSession({
        aiTabs: [tab1, tab2, tab3],
        activeTabId: 'tab-2',
      });

      const result = navigateToNextTab(session, true);

      expect(result!.tab).toBe(tab3);
    });

    it('includes tabs with draft content when showUnreadOnly is true', () => {
      const tab1 = createMockTab({ id: 'tab-1', hasUnread: false, inputValue: '' });
      const tab2 = createMockTab({ id: 'tab-2', hasUnread: false, inputValue: 'draft text' });
      const tab3 = createMockTab({ id: 'tab-3', hasUnread: false, inputValue: '' });
      const session = createMockSession({
        aiTabs: [tab1, tab2, tab3],
        activeTabId: 'tab-1',
      });

      const result = navigateToNextTab(session, true);

      expect(result!.tab).toBe(tab2);
    });

    it('includes tabs with staged images when showUnreadOnly is true', () => {
      const tab1 = createMockTab({ id: 'tab-1', hasUnread: false, stagedImages: [] });
      const tab2 = createMockTab({ id: 'tab-2', hasUnread: false, stagedImages: ['image-data'] });
      const session = createMockSession({
        aiTabs: [tab1, tab2],
        activeTabId: 'tab-1',
      });

      const result = navigateToNextTab(session, true);

      expect(result!.tab).toBe(tab2);
    });

    it('returns null when no navigable tabs in filtered mode', () => {
      const tab1 = createMockTab({ id: 'tab-1', hasUnread: false });
      const tab2 = createMockTab({ id: 'tab-2', hasUnread: false });
      const session = createMockSession({
        aiTabs: [tab1, tab2],
        activeTabId: 'tab-1',
      });

      expect(navigateToNextTab(session, true)).toBeNull();
    });

    it('goes to first navigable tab when current is not navigable', () => {
      const tab1 = createMockTab({ id: 'tab-1', hasUnread: false });
      const tab2 = createMockTab({ id: 'tab-2', hasUnread: true });
      const tab3 = createMockTab({ id: 'tab-3', hasUnread: true });
      const session = createMockSession({
        aiTabs: [tab1, tab2, tab3],
        activeTabId: 'tab-1',
      });

      const result = navigateToNextTab(session, true);

      expect(result!.tab).toBe(tab2);
    });

    it('returns null when only one navigable tab and current is not in list', () => {
      const tab1 = createMockTab({ id: 'tab-1', hasUnread: false });
      const tab2 = createMockTab({ id: 'tab-2', hasUnread: true });
      const session = createMockSession({
        aiTabs: [tab1, tab2],
        activeTabId: 'tab-1',
      });

      // First call switches to tab-2
      const result1 = navigateToNextTab(session, true);
      expect(result1!.tab).toBe(tab2);

      // Now we're on tab-2, and it's the only navigable tab
      const result2 = navigateToNextTab(result1!.session, true);
      expect(result2).toBeNull();
    });
  });

  describe('navigateToPrevTab', () => {
    it('returns null for session with less than 2 tabs', () => {
      const tab = createMockTab({ id: 'tab-1' });
      const session = createMockSession({ aiTabs: [tab] });

      expect(navigateToPrevTab(session)).toBeNull();
    });

    it('returns null for session with no tabs', () => {
      const session = createMockSession({ aiTabs: [] });
      expect(navigateToPrevTab(session)).toBeNull();
    });

    it('navigates to previous tab', () => {
      const tab1 = createMockTab({ id: 'tab-1' });
      const tab2 = createMockTab({ id: 'tab-2' });
      const tab3 = createMockTab({ id: 'tab-3' });
      const session = createMockSession({
        aiTabs: [tab1, tab2, tab3],
        activeTabId: 'tab-3',
      });

      const result = navigateToPrevTab(session);

      expect(result!.tab).toBe(tab2);
      expect(result!.session.activeTabId).toBe('tab-2');
    });

    it('wraps around to last tab from first', () => {
      const tab1 = createMockTab({ id: 'tab-1' });
      const tab2 = createMockTab({ id: 'tab-2' });
      const session = createMockSession({
        aiTabs: [tab1, tab2],
        activeTabId: 'tab-1',
      });

      const result = navigateToPrevTab(session);

      expect(result!.tab).toBe(tab2);
      expect(result!.session.activeTabId).toBe('tab-2');
    });

    it('filters to unread tabs when showUnreadOnly is true', () => {
      const tab1 = createMockTab({ id: 'tab-1', hasUnread: true });
      const tab2 = createMockTab({ id: 'tab-2', hasUnread: false });
      const tab3 = createMockTab({ id: 'tab-3', hasUnread: true });
      const session = createMockSession({
        aiTabs: [tab1, tab2, tab3],
        activeTabId: 'tab-3',
      });

      const result = navigateToPrevTab(session, true);

      expect(result!.tab).toBe(tab1);
    });

    it('returns null when no navigable tabs in filtered mode', () => {
      const tab1 = createMockTab({ id: 'tab-1', hasUnread: false });
      const tab2 = createMockTab({ id: 'tab-2', hasUnread: false });
      const session = createMockSession({
        aiTabs: [tab1, tab2],
        activeTabId: 'tab-1',
      });

      expect(navigateToPrevTab(session, true)).toBeNull();
    });

    it('goes to last navigable tab when current is not navigable', () => {
      const tab1 = createMockTab({ id: 'tab-1', hasUnread: true });
      const tab2 = createMockTab({ id: 'tab-2', hasUnread: false });
      const tab3 = createMockTab({ id: 'tab-3', hasUnread: true });
      const session = createMockSession({
        aiTabs: [tab1, tab2, tab3],
        activeTabId: 'tab-2',
      });

      const result = navigateToPrevTab(session, true);

      expect(result!.tab).toBe(tab3);
    });

    it('returns null when current tab is only navigable tab', () => {
      const tab1 = createMockTab({ id: 'tab-1', hasUnread: false });
      const tab2 = createMockTab({ id: 'tab-2', hasUnread: true });
      const tab3 = createMockTab({ id: 'tab-3', hasUnread: false });
      const session = createMockSession({
        aiTabs: [tab1, tab2, tab3],
        activeTabId: 'tab-2',
      });

      // Current tab (tab-2) is the only unread tab
      const result = navigateToPrevTab(session, true);

      expect(result).toBeNull();
    });
  });

  describe('navigateToTabByIndex', () => {
    it('returns null for session with no tabs', () => {
      const session = createMockSession({ aiTabs: [] });
      expect(navigateToTabByIndex(session, 0)).toBeNull();
    });

    it('returns null for session with undefined aiTabs', () => {
      const session = createMockSession();
      (session as any).aiTabs = undefined;
      expect(navigateToTabByIndex(session, 0)).toBeNull();
    });

    it('returns null for negative index', () => {
      const tab = createMockTab({ id: 'tab-1' });
      const session = createMockSession({ aiTabs: [tab] });

      expect(navigateToTabByIndex(session, -1)).toBeNull();
    });

    it('returns null for out of bounds index', () => {
      const tab = createMockTab({ id: 'tab-1' });
      const session = createMockSession({ aiTabs: [tab] });

      expect(navigateToTabByIndex(session, 5)).toBeNull();
    });

    it('navigates to tab by index', () => {
      const tab1 = createMockTab({ id: 'tab-1' });
      const tab2 = createMockTab({ id: 'tab-2' });
      const tab3 = createMockTab({ id: 'tab-3' });
      const session = createMockSession({
        aiTabs: [tab1, tab2, tab3],
        activeTabId: 'tab-1',
      });

      const result = navigateToTabByIndex(session, 2);

      expect(result!.tab).toBe(tab3);
      expect(result!.session.activeTabId).toBe('tab-3');
    });

    it('returns same session when already on target tab', () => {
      const tab1 = createMockTab({ id: 'tab-1' });
      const tab2 = createMockTab({ id: 'tab-2' });
      const session = createMockSession({
        aiTabs: [tab1, tab2],
        activeTabId: 'tab-2',
      });

      const result = navigateToTabByIndex(session, 1);

      expect(result!.session).toBe(session);
    });

    it('navigates within filtered list when showUnreadOnly is true', () => {
      const tab1 = createMockTab({ id: 'tab-1', hasUnread: false });
      const tab2 = createMockTab({ id: 'tab-2', hasUnread: true });
      const tab3 = createMockTab({ id: 'tab-3', hasUnread: true });
      const session = createMockSession({
        aiTabs: [tab1, tab2, tab3],
        activeTabId: 'tab-1',
      });

      // Index 0 in filtered list (unread only) is tab-2
      const result = navigateToTabByIndex(session, 0, true);

      expect(result!.tab).toBe(tab2);
    });

    it('returns null for out of bounds in filtered list', () => {
      const tab1 = createMockTab({ id: 'tab-1', hasUnread: true });
      const tab2 = createMockTab({ id: 'tab-2', hasUnread: false });
      const session = createMockSession({
        aiTabs: [tab1, tab2],
        activeTabId: 'tab-1',
      });

      // Only 1 unread tab, index 1 is out of bounds
      expect(navigateToTabByIndex(session, 1, true)).toBeNull();
    });
  });

  describe('navigateToLastTab', () => {
    it('returns null for session with no tabs', () => {
      const session = createMockSession({ aiTabs: [] });
      expect(navigateToLastTab(session)).toBeNull();
    });

    it('returns null for session with undefined aiTabs', () => {
      const session = createMockSession();
      (session as any).aiTabs = undefined;
      expect(navigateToLastTab(session)).toBeNull();
    });

    it('navigates to last tab', () => {
      const tab1 = createMockTab({ id: 'tab-1' });
      const tab2 = createMockTab({ id: 'tab-2' });
      const tab3 = createMockTab({ id: 'tab-3' });
      const session = createMockSession({
        aiTabs: [tab1, tab2, tab3],
        activeTabId: 'tab-1',
      });

      const result = navigateToLastTab(session);

      expect(result!.tab).toBe(tab3);
      expect(result!.session.activeTabId).toBe('tab-3');
    });

    it('navigates to last unread tab when showUnreadOnly is true', () => {
      const tab1 = createMockTab({ id: 'tab-1', hasUnread: true });
      const tab2 = createMockTab({ id: 'tab-2', hasUnread: false });
      const tab3 = createMockTab({ id: 'tab-3', hasUnread: true });
      const session = createMockSession({
        aiTabs: [tab1, tab2, tab3],
        activeTabId: 'tab-1',
      });

      const result = navigateToLastTab(session, true);

      expect(result!.tab).toBe(tab3);
    });

    it('returns null when no navigable tabs in filtered mode', () => {
      const tab1 = createMockTab({ id: 'tab-1', hasUnread: false });
      const tab2 = createMockTab({ id: 'tab-2', hasUnread: false });
      const session = createMockSession({
        aiTabs: [tab1, tab2],
        activeTabId: 'tab-1',
      });

      expect(navigateToLastTab(session, true)).toBeNull();
    });
  });
});

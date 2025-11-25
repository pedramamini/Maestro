import React, { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import type { Session, Group, Theme, Shortcut } from '../types';
import { useLayerStack } from '../contexts/LayerStackContext';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';

interface QuickAction {
  id: string;
  label: string;
  action: () => void;
  subtext?: string;
  shortcut?: Shortcut;
}

interface QuickActionsModalProps {
  theme: Theme;
  sessions: Session[];
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  activeSessionId: string;
  groups: Group[];
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  shortcuts: Record<string, Shortcut>;
  initialMode?: 'main' | 'move-to-group';
  setQuickActionOpen: (open: boolean) => void;
  setActiveSessionId: (id: string) => void;
  setRenameInstanceModalOpen: (open: boolean) => void;
  setRenameInstanceValue: (value: string) => void;
  setRenameGroupModalOpen: (open: boolean) => void;
  setRenameGroupId: (id: string) => void;
  setRenameGroupValue: (value: string) => void;
  setRenameGroupEmoji: (emoji: string) => void;
  setCreateGroupModalOpen: (open: boolean) => void;
  setNewGroupName: (name: string) => void;
  setMoveSessionToNewGroup: (move: boolean) => void;
  setLeftSidebarOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setRightPanelOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setActiveRightTab: (tab: string) => void;
  toggleInputMode: () => void;
  deleteSession: (id: string) => void;
  addNewSession: () => void;
  setSettingsModalOpen: (open: boolean) => void;
  setSettingsTab: (tab: string) => void;
  setShortcutsHelpOpen: (open: boolean) => void;
  setAboutModalOpen: (open: boolean) => void;
  setLogViewerOpen: (open: boolean) => void;
  setProcessMonitorOpen: (open: boolean) => void;
}

export function QuickActionsModal(props: QuickActionsModalProps) {
  const {
    theme, sessions, setSessions, activeSessionId, groups, setGroups, shortcuts,
    initialMode = 'main',
    setQuickActionOpen, setActiveSessionId, setRenameInstanceModalOpen, setRenameInstanceValue,
    setRenameGroupModalOpen, setRenameGroupId, setRenameGroupValue, setRenameGroupEmoji,
    setCreateGroupModalOpen, setNewGroupName, setMoveSessionToNewGroup,
    setLeftSidebarOpen, setRightPanelOpen, setActiveRightTab, toggleInputMode,
    deleteSession, addNewSession, setSettingsModalOpen, setSettingsTab,
    setShortcutsHelpOpen, setAboutModalOpen, setLogViewerOpen, setProcessMonitorOpen
  } = props;

  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState<'main' | 'move-to-group'>(initialMode);
  const [renamingSession, setRenamingSession] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [firstVisibleIndex, setFirstVisibleIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedItemRef = useRef<HTMLButtonElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const layerIdRef = useRef<string>();
  const modalRef = useRef<HTMLDivElement>(null);

  const { registerLayer, unregisterLayer, updateLayerHandler } = useLayerStack();
  const activeSession = sessions.find(s => s.id === activeSessionId);

  // Register layer on mount (handler will be updated by separate effect)
  useEffect(() => {
    layerIdRef.current = registerLayer({
      type: 'modal',
      priority: MODAL_PRIORITIES.QUICK_ACTION,
      blocksLowerLayers: true,
      capturesFocus: true,
      focusTrap: 'strict',
      ariaLabel: 'Quick Actions',
      onEscape: () => setQuickActionOpen(false) // Initial handler, updated below
    });

    return () => {
      if (layerIdRef.current) {
        unregisterLayer(layerIdRef.current);
      }
    };
  }, [registerLayer, unregisterLayer, setQuickActionOpen]);

  // Update handler when mode changes
  useEffect(() => {
    if (layerIdRef.current) {
      updateLayerHandler(layerIdRef.current, () => {
        // Handle escape based on current mode
        if (mode === 'move-to-group') {
          setMode('main');
          setSelectedIndex(0);
        } else {
          setQuickActionOpen(false);
        }
      });
    }
  }, [mode, setQuickActionOpen, updateLayerHandler]);

  // Focus input on mount
  useEffect(() => {
    // Small delay to ensure DOM is ready and layer is registered
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    selectedItemRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedIndex]);

  // Track scroll position to determine which items are visible
  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const scrollTop = scrollContainerRef.current.scrollTop;
      const itemHeight = 52; // Approximate height of each item (py-3 = 12px top + 12px bottom + content)
      const visibleIndex = Math.floor(scrollTop / itemHeight);
      setFirstVisibleIndex(visibleIndex);
    }
  };

  const handleRenameSession = () => {
    if (renameValue.trim()) {
      const updatedSessions = sessions.map(s =>
        s.id === activeSessionId ? { ...s, name: renameValue.trim() } : s
      );
      setSessions(updatedSessions);
      setQuickActionOpen(false);
    }
  };

  const handleMoveToGroup = (groupId: string) => {
    const updatedSessions = sessions.map(s =>
      s.id === activeSessionId ? { ...s, groupId } : s
    );
    setSessions(updatedSessions);
    setQuickActionOpen(false);
  };

  const handleCreateGroup = () => {
    setNewGroupName('');
    setMoveSessionToNewGroup(true); // When creating from Command-K, move session to new group
    setCreateGroupModalOpen(true);
    setQuickActionOpen(false);
  };

  const sessionActions: QuickAction[] = sessions.map(s => ({
    id: `jump-${s.id}`,
    label: `Jump to: ${s.name}`,
    action: () => {
      setActiveSessionId(s.id);
      // Auto-expand group if it's collapsed
      if (s.groupId) {
        setGroups(prev => prev.map(g =>
          g.id === s.groupId && g.collapsed ? { ...g, collapsed: false } : g
        ));
      }
    },
    subtext: s.state.toUpperCase()
  }));

  const mainActions: QuickAction[] = [
    ...sessionActions,
    { id: 'new', label: 'New Agent', shortcut: shortcuts.newInstance, action: addNewSession },
    ...(activeSession ? [{ id: 'rename', label: 'Rename Current Agent', action: () => {
      setRenameInstanceValue(activeSession.name);
      setRenameInstanceModalOpen(true);
      setQuickActionOpen(false);
    } }] : []),
    ...(activeSession?.groupId ? [{
      id: 'renameGroup',
      label: 'Rename Group',
      action: () => {
        const group = groups.find(g => g.id === activeSession.groupId);
        if (group) {
          setRenameGroupId(group.id);
          setRenameGroupValue(group.name);
          setRenameGroupEmoji(group.emoji);
          setRenameGroupModalOpen(true);
          setQuickActionOpen(false);
        }
      }
    }] : []),
    ...(activeSession ? [{ id: 'moveToGroup', label: 'Move to Group...', action: () => { setMode('move-to-group'); setSelectedIndex(0); } }] : []),
    { id: 'createGroup', label: 'Create New Group', action: handleCreateGroup },
    { id: 'toggleSidebar', label: 'Toggle Sidebar', shortcut: shortcuts.toggleSidebar, action: () => setLeftSidebarOpen(p => !p) },
    { id: 'toggleRight', label: 'Toggle Right Panel', shortcut: shortcuts.toggleRightPanel, action: () => setRightPanelOpen(p => !p) },
    ...(activeSession ? [{ id: 'switchMode', label: 'Switch AI/Shell Mode', shortcut: shortcuts.toggleMode, action: toggleInputMode }] : []),
    ...(activeSession ? [{ id: 'kill', label: 'Kill Current Agent', shortcut: shortcuts.killInstance, action: () => deleteSession(activeSessionId) }] : []),
    { id: 'settings', label: 'Settings', shortcut: shortcuts.settings, action: () => { setSettingsModalOpen(true); setQuickActionOpen(false); } },
    { id: 'theme', label: 'Change Theme', action: () => { setSettingsModalOpen(true); setSettingsTab('theme'); setQuickActionOpen(false); } },
    { id: 'shortcuts', label: 'View Shortcuts', shortcut: shortcuts.help, action: () => { setShortcutsHelpOpen(true); setQuickActionOpen(false); } },
    { id: 'logs', label: 'View System Logs', action: () => { setLogViewerOpen(true); setQuickActionOpen(false); } },
    { id: 'processes', label: 'View System Processes', action: () => { setProcessMonitorOpen(true); setQuickActionOpen(false); } },
    { id: 'devtools', label: 'Toggle JavaScript Console', action: () => { window.maestro.devtools.toggle(); setQuickActionOpen(false); } },
    { id: 'about', label: 'About Maestro', action: () => { setAboutModalOpen(true); setQuickActionOpen(false); } },
    { id: 'goToFiles', label: 'Go to Files Tab', action: () => { setRightPanelOpen(true); setActiveRightTab('files'); setQuickActionOpen(false); } },
    { id: 'goToHistory', label: 'Go to History Tab', action: () => { setRightPanelOpen(true); setActiveRightTab('history'); setQuickActionOpen(false); } },
    { id: 'goToScratchpad', label: 'Go to Scratchpad Tab', action: () => { setRightPanelOpen(true); setActiveRightTab('scratchpad'); setQuickActionOpen(false); } },
  ];

  const groupActions: QuickAction[] = [
    { id: 'back', label: '← Back to main menu', action: () => { setMode('main'); setSelectedIndex(0); } },
    { id: 'no-group', label: '📁 No Group (Root)', action: () => handleMoveToGroup('') },
    ...groups.map(g => ({
      id: `group-${g.id}`,
      label: `${g.emoji} ${g.name}`,
      action: () => handleMoveToGroup(g.id)
    })),
    { id: 'create-new', label: '+ Create New Group', action: handleCreateGroup }
  ];

  const actions = mode === 'main' ? mainActions : groupActions;
  const filtered = actions.filter(a => a.label.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    setSelectedIndex(0);
    setFirstVisibleIndex(0);
  }, [search, mode]);

  // Clear search when switching to move-to-group mode
  useEffect(() => {
    if (mode === 'move-to-group') {
      setSearch('');
    }
  }, [mode]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (renamingSession) {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleRenameSession();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setRenamingSession(false);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (filtered[selectedIndex]) {
        const selectedAction = filtered[selectedIndex];
        // Don't close modal if action switches modes
        const switchesModes = selectedAction.id === 'moveToGroup' || selectedAction.id === 'back';
        selectedAction.action();
        if (!renamingSession && mode === 'main' && !switchesModes) {
          setQuickActionOpen(false);
        }
      }
    } else if (e.metaKey && ['1', '2', '3', '4', '5', '6', '7', '8'].includes(e.key)) {
      e.preventDefault();
      const number = parseInt(e.key);
      const targetIndex = firstVisibleIndex + number - 1;
      if (filtered[targetIndex]) {
        filtered[targetIndex].action();
        if (!renamingSession && mode === 'main') {
          setQuickActionOpen(false);
        }
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-32 z-[9999] animate-in fade-in duration-100">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Quick Actions"
        tabIndex={-1}
        className="w-[500px] rounded-xl shadow-2xl border overflow-hidden flex flex-col max-h-[550px] outline-none"
        style={{ backgroundColor: theme.colors.bgActivity, borderColor: theme.colors.border }}>
        <div className="p-4 border-b flex items-center gap-3" style={{ borderColor: theme.colors.border }}>
          <Search className="w-5 h-5" style={{ color: theme.colors.textDim }} />
          {renamingSession ? (
            <input
              ref={inputRef}
              className="flex-1 bg-transparent outline-none text-lg"
              placeholder="Enter new name..."
              style={{ color: theme.colors.textMain }}
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          ) : (
            <input
              ref={inputRef}
              className="flex-1 bg-transparent outline-none text-lg placeholder-opacity-50"
              placeholder={mode === 'move-to-group' ? `Move ${activeSession?.name || 'session'} to...` : 'Type a command or jump to agent...'}
              style={{ color: theme.colors.textMain }}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          )}
          <div className="px-2 py-0.5 rounded text-xs font-bold" style={{ backgroundColor: theme.colors.bgMain, color: theme.colors.textDim }}>ESC</div>
        </div>
        {!renamingSession && (
          <div className="overflow-y-auto py-2" ref={scrollContainerRef} onScroll={handleScroll}>
            {filtered.map((a, i) => {
              // Calculate dynamic number badge (1-8) based on first visible item
              const distanceFromFirstVisible = i - firstVisibleIndex;
              const showNumber = distanceFromFirstVisible >= 0 && distanceFromFirstVisible < 8;
              const numberBadge = distanceFromFirstVisible + 1;

              return (
                <button
                  key={a.id}
                  ref={i === selectedIndex ? selectedItemRef : null}
                  onClick={() => {
                    const switchesModes = a.id === 'moveToGroup' || a.id === 'back';
                    a.action();
                    if (mode === 'main' && !switchesModes) setQuickActionOpen(false);
                  }}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-opacity-10 ${i === selectedIndex ? 'bg-opacity-10' : ''}`}
                  style={{
                    backgroundColor: i === selectedIndex ? theme.colors.accent : 'transparent',
                    color: theme.colors.textMain
                  }}
                >
                  {showNumber ? (
                    <div
                      className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-xs font-bold"
                      style={{ backgroundColor: theme.colors.bgMain, color: theme.colors.textDim }}
                    >
                      {numberBadge}
                    </div>
                  ) : (
                    <div className="flex-shrink-0 w-5 h-5" />
                  )}
                  <div className="flex flex-col flex-1">
                    <span className="font-medium">{a.label}</span>
                    {a.subtext && <span className="text-[10px] opacity-50">{a.subtext}</span>}
                  </div>
                  {a.shortcut && (
                    <span className="text-xs font-mono opacity-60">
                      {a.shortcut.keys.join('+')}
                    </span>
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-4 py-4 text-center opacity-50 text-sm">No actions found</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

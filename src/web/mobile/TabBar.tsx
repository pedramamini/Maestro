/**
 * TabBar component for web interface
 *
 * Displays Claude Code session tabs within a Maestro session.
 * Syncs bidirectionally with the desktop app.
 */

import React from 'react';
import { useThemeColors } from '../components/ThemeProvider';
import type { AITabData } from '../hooks/useWebSocket';

interface TabBarProps {
  tabs: AITabData[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onNewTab: () => void;
  onCloseTab: (tabId: string) => void;
}

export function TabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onNewTab,
  onCloseTab,
}: TabBarProps) {
  const colors = useThemeColors();

  // Don't render if there's only one tab
  if (tabs.length <= 1) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '6px 8px',
        backgroundColor: colors.bgSidebar,
        borderBottom: `1px solid ${colors.border}`,
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const displayName = tab.name
          || (tab.claudeSessionId ? tab.claudeSessionId.split('-')[0].toUpperCase() : 'New');

        return (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: isActive ? colors.accent + '20' : 'transparent',
              color: isActive ? colors.accent : colors.textDim,
              fontSize: '12px',
              fontWeight: isActive ? 600 : 400,
              fontFamily: 'monospace',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              minWidth: 0,
              transition: 'all 0.15s ease',
            }}
          >
            {/* Pulsing dot for busy tabs */}
            {tab.state === 'busy' && (
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: colors.warning,
                  animation: 'pulse 1.5s infinite',
                  flexShrink: 0,
                }}
              />
            )}

            {/* Star indicator */}
            {tab.starred && (
              <span style={{ fontSize: '10px', flexShrink: 0 }}>★</span>
            )}

            {/* Tab name */}
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '80px',
              }}
            >
              {displayName}
            </span>

            {/* Close button (don't show for active tab or if only one tab) */}
            {tabs.length > 1 && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  fontSize: '10px',
                  color: colors.textDim,
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  opacity: 0.6,
                  transition: 'opacity 0.15s ease',
                  marginLeft: '2px',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.opacity = '1';
                  (e.target as HTMLElement).style.backgroundColor = colors.border;
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.opacity = '0.6';
                  (e.target as HTMLElement).style.backgroundColor = 'transparent';
                }}
              >
                ×
              </span>
            )}
          </button>
        );
      })}

      {/* New tab button */}
      <button
        onClick={onNewTab}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '24px',
          height: '24px',
          borderRadius: '4px',
          border: `1px dashed ${colors.border}`,
          backgroundColor: 'transparent',
          color: colors.textDim,
          fontSize: '14px',
          cursor: 'pointer',
          opacity: 0.7,
          transition: 'all 0.15s ease',
          flexShrink: 0,
        }}
        title="New Tab"
        onMouseEnter={(e) => {
          (e.target as HTMLElement).style.opacity = '1';
          (e.target as HTMLElement).style.borderColor = colors.accent;
          (e.target as HTMLElement).style.color = colors.accent;
        }}
        onMouseLeave={(e) => {
          (e.target as HTMLElement).style.opacity = '0.7';
          (e.target as HTMLElement).style.borderColor = colors.border;
          (e.target as HTMLElement).style.color = colors.textDim;
        }}
      >
        +
      </button>

      {/* CSS for pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

export default TabBar;

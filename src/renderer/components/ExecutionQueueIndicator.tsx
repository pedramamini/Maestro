import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ListOrdered, Command, MessageSquare } from 'lucide-react';
import type { Session, Theme, QueuedItem } from '../types';

interface ExecutionQueueIndicatorProps {
  session: Session;
  theme: Theme;
  onClick: () => void;  // Opens the ExecutionQueueBrowser modal
}

/**
 * Compact indicator showing the number of items queued for execution.
 * Appears above the input area when items are queued.
 * Clicking opens the ExecutionQueueBrowser modal for full queue management.
 */
export function ExecutionQueueIndicator({ session, theme, onClick }: ExecutionQueueIndicatorProps) {
  const queue = session.executionQueue || [];
  const containerRef = useRef<HTMLButtonElement>(null);
  const pillsContainerRef = useRef<HTMLDivElement>(null);
  const [maxVisiblePills, setMaxVisiblePills] = useState(2);

  // Count items by type
  const messageCount = queue.filter(item => item.type === 'message').length;
  const commandCount = queue.filter(item => item.type === 'command').length;

  // Group by tab to show tab-specific counts
  const tabCounts = queue.reduce((acc, item) => {
    const tabName = item.tabName || 'Unknown';
    acc[tabName] = (acc[tabName] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const tabNames = Object.keys(tabCounts);

  // Calculate how many pills we can show based on available space
  const calculateMaxPills = useCallback(() => {
    if (!containerRef.current || !pillsContainerRef.current) return;

    const container = containerRef.current;
    const pillsContainer = pillsContainerRef.current;

    // Get total container width
    const containerWidth = container.clientWidth;

    // Calculate space used by other elements (left side + type counts + "Click to view")
    // We need to measure everything except the pills container
    const containerStyle = getComputedStyle(container);
    const containerPadding = parseFloat(containerStyle.paddingLeft) + parseFloat(containerStyle.paddingRight);
    const containerGap = 8; // gap-2 = 0.5rem = 8px

    // Measure left side elements (icon + "X items queued" text)
    const leftElements = container.querySelectorAll(':scope > *:not([data-pills-container])');
    let usedWidth = containerPadding;

    leftElements.forEach((el) => {
      if (el !== pillsContainer) {
        const rect = el.getBoundingClientRect();
        usedWidth += rect.width + containerGap;
      }
    });

    // Available space for pills (leave some buffer for the +N indicator and spacing)
    const availableWidth = containerWidth - usedWidth - 80; // 80px buffer for +N and spacing

    // Estimate pill width (approximately 80-100px per pill depending on content)
    const avgPillWidth = 90;
    const pillGap = 4; // gap-1 = 0.25rem = 4px

    const maxPills = Math.min(5, Math.max(1, Math.floor(availableWidth / (avgPillWidth + pillGap))));
    setMaxVisiblePills(maxPills);
  }, []);

  // Use ResizeObserver to recalculate when container size changes
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver(() => {
      calculateMaxPills();
    });

    observer.observe(containerRef.current);

    // Initial calculation
    calculateMaxPills();

    return () => observer.disconnect();
  }, [calculateMaxPills, queue.length, tabNames.length]);

  if (queue.length === 0) {
    return null;
  }

  return (
    <button
      ref={containerRef}
      onClick={onClick}
      className="w-full mb-2 px-3 py-2 rounded-lg border flex items-center gap-2 text-sm transition-all hover:opacity-90"
      style={{
        backgroundColor: theme.colors.bgActivity,
        borderColor: theme.colors.border,
        color: theme.colors.textMain
      }}
    >
      <ListOrdered className="w-4 h-4 flex-shrink-0" style={{ color: theme.colors.warning }} />

      <span className="text-left whitespace-nowrap">
        <span className="font-semibold">{queue.length}</span>
        {' '}
        {queue.length === 1 ? 'item' : 'items'} queued
      </span>

      {/* Item type breakdown */}
      <div className="flex items-center gap-2 text-xs opacity-70 flex-shrink-0">
        {messageCount > 0 && (
          <span className="flex items-center gap-1">
            <MessageSquare className="w-3 h-3" />
            {messageCount}
          </span>
        )}
        {commandCount > 0 && (
          <span className="flex items-center gap-1">
            <Command className="w-3 h-3" />
            {commandCount}
          </span>
        )}
      </div>

      {/* Spacer to push pills to the right */}
      <div className="flex-1" />

      {/* Tab pills - dynamically show as many as fit, then +N more */}
      <div ref={pillsContainerRef} data-pills-container className="flex items-center gap-1 flex-shrink-0">
        {tabNames.slice(0, maxVisiblePills).map(tabName => (
          <span
            key={tabName}
            className="px-1.5 py-0.5 rounded text-xs font-mono whitespace-nowrap"
            style={{
              backgroundColor: theme.colors.accent + '30',
              color: theme.colors.textMain
            }}
          >
            {tabName.length > 8 ? tabName.slice(0, 8) + '...' : tabName}
            {tabCounts[tabName] > 1 && ` (${tabCounts[tabName]})`}
          </span>
        ))}
        {tabNames.length > maxVisiblePills && (
          <span
            className="px-1.5 py-0.5 rounded text-xs whitespace-nowrap"
            style={{ color: theme.colors.textDim }}
          >
            +{tabNames.length - maxVisiblePills}
          </span>
        )}
      </div>

      <span className="text-xs opacity-50 flex-shrink-0 whitespace-nowrap">Click to view</span>
    </button>
  );
}

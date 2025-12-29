/**
 * DocumentNode - Custom React Flow node for displaying markdown document information.
 *
 * Renders a card-like node showing document metadata:
 * - Title prominently at top
 * - Stats row: line count, word count, file size
 * - Optional description (truncated with ellipsis)
 *
 * Styled with theme colors and supports selection/hover states.
 */

import React, { memo, useMemo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { FileText, Hash, AlignLeft, HardDrive } from 'lucide-react';
import type { Theme } from '../../types';
import type { DocumentNodeData } from './graphDataBuilder';

/**
 * Extended node data including theme and search state for styling
 */
export interface DocumentNodeProps extends NodeProps<DocumentNodeData & {
  theme: Theme;
  searchActive?: boolean;
  searchMatch?: boolean;
}> {
  // Props come from React Flow - data, selected, etc.
}

/**
 * Maximum characters for title before truncation
 */
const MAX_TITLE_LENGTH = 40;

/**
 * Maximum characters for description before truncation
 */
const MAX_DESCRIPTION_LENGTH = 80;

/**
 * Truncate text with ellipsis if exceeding max length
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '...';
}

/**
 * Custom React Flow node for rendering markdown documents in the graph
 */
export const DocumentNode = memo(function DocumentNode({
  data,
  selected,
}: DocumentNodeProps) {
  const { title, lineCount, wordCount, size, description, filePath, theme, searchActive, searchMatch } = data;

  // Determine if this node should be dimmed (search active but not matching)
  const isDimmed = searchActive && !searchMatch;
  // Determine if this node should be highlighted (search active and matching)
  const isHighlighted = searchActive && searchMatch;

  // Memoize styles to prevent unnecessary recalculations
  const containerStyle = useMemo(() => ({
    backgroundColor: theme.colors.bgActivity,
    borderColor: isHighlighted
      ? theme.colors.accent
      : selected
      ? theme.colors.accent
      : theme.colors.border,
    borderWidth: isHighlighted ? 2 : selected ? 2 : 1,
    borderStyle: 'solid' as const,
    borderRadius: 8,
    padding: 12,
    minWidth: 200,
    maxWidth: 280,
    boxShadow: isHighlighted
      ? `0 0 0 3px ${theme.colors.accent}40, 0 4px 12px ${theme.colors.accentDim}`
      : selected
      ? `0 4px 12px ${theme.colors.accentDim}`
      : '0 2px 8px rgba(0, 0, 0, 0.15)',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    opacity: isDimmed ? 0.35 : 1,
    filter: isDimmed ? 'grayscale(50%)' : 'none',
  }), [theme.colors, selected, isDimmed, isHighlighted]);

  const titleStyle = useMemo(() => ({
    color: theme.colors.textMain,
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 8,
    lineHeight: 1.3,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  }), [theme.colors.textMain]);

  const statsRowStyle = useMemo(() => ({
    display: 'flex',
    gap: 12,
    marginBottom: description ? 8 : 0,
  }), [description]);

  const statItemStyle = useMemo(() => ({
    display: 'flex',
    alignItems: 'center' as const,
    gap: 4,
    color: theme.colors.textDim,
    fontSize: 11,
  }), [theme.colors.textDim]);

  const descriptionStyle = useMemo(() => ({
    color: theme.colors.textDim,
    fontSize: 12,
    lineHeight: 1.4,
    opacity: 0.85,
  }), [theme.colors.textDim]);

  const handleStyle = useMemo(() => ({
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.bgActivity,
    width: 8,
    height: 8,
  }), [theme.colors]);

  // Truncate title if too long
  const displayTitle = truncateText(title, MAX_TITLE_LENGTH);
  const isTitleTruncated = title.length > MAX_TITLE_LENGTH;

  // Truncate description if too long
  const displayDescription = description
    ? truncateText(description, MAX_DESCRIPTION_LENGTH)
    : null;

  // Build tooltip: show full title if truncated, always show file path
  const tooltipText = isTitleTruncated
    ? `${title}\n\n${filePath}`
    : filePath;

  return (
    <div
      className={`document-node${isHighlighted ? ' search-highlight' : ''}`}
      style={containerStyle}
      title={tooltipText}
    >
      {/* Input handle (for incoming edges) */}
      <Handle
        type="target"
        position={Position.Top}
        style={handleStyle}
      />

      {/* Title with document icon */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <FileText
          size={14}
          style={{ color: theme.colors.accent, flexShrink: 0 }}
        />
        <div style={titleStyle}>{displayTitle}</div>
      </div>

      {/* Stats row: lines, words, size */}
      <div style={statsRowStyle}>
        <div style={statItemStyle} title={`${lineCount} lines`}>
          <Hash size={10} />
          <span>{lineCount}</span>
        </div>
        <div style={statItemStyle} title={`${wordCount} words`}>
          <AlignLeft size={10} />
          <span>{wordCount}</span>
        </div>
        <div style={statItemStyle} title={size}>
          <HardDrive size={10} />
          <span>{size}</span>
        </div>
      </div>

      {/* Optional description */}
      {displayDescription && (
        <div style={descriptionStyle}>
          {displayDescription}
        </div>
      )}

      {/* Output handle (for outgoing edges) */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={handleStyle}
      />
    </div>
  );
});

export default DocumentNode;

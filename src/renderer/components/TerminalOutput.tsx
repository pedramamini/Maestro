import React, { useRef, useEffect, useMemo, forwardRef, useState, useCallback, memo } from 'react';
import { Activity, X, ChevronDown, ChevronUp, Filter, PlusCircle, MinusCircle, Trash2, Copy, Volume2, Square, Check, ArrowDown, Eye, FileText, Clipboard } from 'lucide-react';
import type { Session, Theme, LogEntry } from '../types';
import Convert from 'ansi-to-html';
import DOMPurify from 'dompurify';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useLayerStack } from '../contexts/LayerStackContext';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';
import { getActiveTab } from '../utils/tabHelpers';

// ============================================================================
// CodeBlockWithCopy - Code block with copy button overlay
// ============================================================================

interface CodeBlockWithCopyProps {
  language: string;
  codeContent: string;
  theme: Theme;
  onCopy: (text: string) => void;
}

const CodeBlockWithCopy = memo(({ language, codeContent, theme, onCopy }: CodeBlockWithCopyProps) => {
  return (
    <div className="relative group/codeblock">
      <button
        onClick={() => onCopy(codeContent)}
        className="absolute bottom-2 right-2 p-1.5 rounded opacity-0 group-hover/codeblock:opacity-70 hover:!opacity-100 transition-opacity z-10"
        style={{
          backgroundColor: theme.colors.bgActivity,
          color: theme.colors.textDim,
          border: `1px solid ${theme.colors.border}`
        }}
        title="Copy code"
      >
        <Clipboard className="w-3.5 h-3.5" />
      </button>
      <SyntaxHighlighter
        language={language}
        style={vscDarkPlus}
        customStyle={{
          margin: '0.5em 0',
          padding: '1em',
          background: theme.colors.bgSidebar,
          fontSize: '0.9em',
          borderRadius: '6px',
        }}
        PreTag="div"
      >
        {codeContent}
      </SyntaxHighlighter>
    </div>
  );
});

CodeBlockWithCopy.displayName = 'CodeBlockWithCopy';

// ============================================================================
// Pure helper functions (moved outside component to prevent recreation)
// ============================================================================

// Process carriage returns to simulate terminal line overwrites
const processCarriageReturns = (text: string): string => {
  const lines = text.split('\n');
  const processedLines = lines.map(line => {
    if (line.includes('\r')) {
      const segments = line.split('\r');
      for (let i = segments.length - 1; i >= 0; i--) {
        if (segments[i].trim()) {
          return segments[i];
        }
      }
      return '';
    }
    return line;
  });
  return processedLines.join('\n');
};

// Filter out bash prompt lines and apply processing
const processLogTextHelper = (text: string, isTerminal: boolean): string => {
  let processed = processCarriageReturns(text);
  if (!isTerminal) return processed;

  const lines = processed.split('\n');
  const filteredLines = lines.filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (/^(bash-\d+\.\d+\$|zsh[%#]|\$|#)\s*$/.test(trimmed)) return false;
    return true;
  });

  return filteredLines.join('\n');
};

// Filter text by lines containing the query (local filter)
const filterTextByLinesHelper = (text: string, query: string, mode: 'include' | 'exclude', useRegex: boolean): string => {
  if (!query) return text;

  const lines = text.split('\n');

  try {
    if (useRegex) {
      const regex = new RegExp(query, 'i');
      const filteredLines = lines.filter(line => {
        const matches = regex.test(line);
        return mode === 'include' ? matches : !matches;
      });
      return filteredLines.join('\n');
    } else {
      const lowerQuery = query.toLowerCase();
      const filteredLines = lines.filter(line => {
        const matches = line.toLowerCase().includes(lowerQuery);
        return mode === 'include' ? matches : !matches;
      });
      return filteredLines.join('\n');
    }
  } catch (error) {
    const lowerQuery = query.toLowerCase();
    const filteredLines = lines.filter(line => {
      const matches = line.toLowerCase().includes(lowerQuery);
      return mode === 'include' ? matches : !matches;
    });
    return filteredLines.join('\n');
  }
};

// Strip markdown formatting to show plain text
const stripMarkdown = (text: string): string => {
  return text
    // Remove code blocks (```...```)
    .replace(/```[\s\S]*?```/g, (match) => {
      // Extract just the code content without the fence
      const lines = match.split('\n');
      // Remove first line (```lang) and last line (```)
      return lines.slice(1, -1).join('\n');
    })
    // Remove inline code backticks
    .replace(/`([^`]+)`/g, '$1')
    // Remove bold/italic (***text***, **text**, *text*, ___text___, __text__, _text_)
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/___(.+?)___/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    // Remove headers (# text)
    .replace(/^#{1,6}\s+/gm, '')
    // Remove blockquotes (> text)
    .replace(/^>\s*/gm, '')
    // Remove horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, '---')
    // Remove link formatting [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove image formatting ![alt](url) -> alt
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    // Remove strikethrough
    .replace(/~~(.+?)~~/g, '$1')
    // Clean up bullet points - convert to simple dashes
    .replace(/^[\s]*[-*+]\s+/gm, '- ')
    // Clean up numbered lists - keep the numbers
    .replace(/^[\s]*(\d+)\.\s+/gm, '$1. ');
};

// ============================================================================
// LogItem - Memoized component for individual log entries
// ============================================================================

interface LogItemProps {
  log: LogEntry;
  index: number;
  isTerminal: boolean;
  isAIMode: boolean;
  theme: Theme;
  fontFamily: string;
  maxOutputLines: number;
  outputSearchQuery: string;
  lastUserCommand?: string;
  // Expansion state
  isExpanded: boolean;
  onToggleExpanded: (logId: string) => void;
  // Local filter state
  localFilterQuery: string;
  filterMode: { mode: 'include' | 'exclude'; regex: boolean };
  activeLocalFilter: string | null;
  onToggleLocalFilter: (logId: string) => void;
  onSetLocalFilterQuery: (logId: string, query: string) => void;
  onSetFilterMode: (logId: string, update: (current: { mode: 'include' | 'exclude'; regex: boolean }) => { mode: 'include' | 'exclude'; regex: boolean }) => void;
  onClearLocalFilter: (logId: string) => void;
  // Delete state
  deleteConfirmLogId: string | null;
  onDeleteLog?: (logId: string) => number | null;
  onSetDeleteConfirmLogId: (logId: string | null) => void;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  // Other callbacks
  setLightboxImage: (image: string | null, contextImages?: string[]) => void;
  copyToClipboard: (text: string) => void;
  speakText?: (text: string, logId: string) => void;
  stopSpeaking?: () => void;
  speakingLogId: string | null;
  audioFeedbackCommand?: string;
  // ANSI converter
  ansiConverter: Convert;
  // Markdown rendering mode for AI responses
  markdownRawMode: boolean;
  onToggleMarkdownRawMode: () => void;
}

const LogItemComponent = memo(({
  log,
  index,
  isTerminal,
  isAIMode,
  theme,
  fontFamily,
  maxOutputLines,
  outputSearchQuery,
  lastUserCommand,
  isExpanded,
  onToggleExpanded,
  localFilterQuery,
  filterMode,
  activeLocalFilter,
  onToggleLocalFilter,
  onSetLocalFilterQuery,
  onSetFilterMode,
  onClearLocalFilter,
  deleteConfirmLogId,
  onDeleteLog,
  onSetDeleteConfirmLogId,
  scrollContainerRef,
  setLightboxImage,
  copyToClipboard,
  speakText,
  stopSpeaking,
  speakingLogId,
  audioFeedbackCommand,
  ansiConverter,
  markdownRawMode,
  onToggleMarkdownRawMode,
}: LogItemProps) => {
  // Ref for the log item container - used for scroll-into-view on expand
  const logItemRef = useRef<HTMLDivElement>(null);

  // Handle expand toggle with scroll adjustment
  const handleExpandToggle = useCallback(() => {
    const wasExpanded = isExpanded;
    onToggleExpanded(log.id);

    // After expanding, scroll to ensure the bottom of the item is visible
    if (!wasExpanded) {
      // Use setTimeout to wait for the DOM to update after expansion
      setTimeout(() => {
        const logItem = logItemRef.current;
        const container = scrollContainerRef.current;
        if (logItem && container) {
          const itemRect = logItem.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();

          // Check if the bottom of the item is below the visible area
          const itemBottom = itemRect.bottom;
          const containerBottom = containerRect.bottom;

          if (itemBottom > containerBottom) {
            // Scroll to show the bottom of the item with some padding
            const scrollAmount = itemBottom - containerBottom + 20; // 20px padding
            container.scrollBy({ top: scrollAmount, behavior: 'smooth' });
          }
        }
      }, 50); // Small delay to allow React to re-render
    }
  }, [isExpanded, log.id, onToggleExpanded, scrollContainerRef]);

  // Helper function to highlight search matches in text
  const highlightMatches = (text: string, query: string): React.ReactNode => {
    if (!query) return text;

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let searchIndex = 0;

    while (searchIndex < lowerText.length) {
      const idx = lowerText.indexOf(lowerQuery, searchIndex);
      if (idx === -1) break;

      if (idx > lastIndex) {
        parts.push(text.substring(lastIndex, idx));
      }

      parts.push(
        <span
          key={`match-${idx}`}
          style={{
            backgroundColor: theme.colors.warning,
            color: theme.mode === 'light' ? '#fff' : '#000',
            padding: '1px 2px',
            borderRadius: '2px'
          }}
        >
          {text.substring(idx, idx + query.length)}
        </span>
      );

      lastIndex = idx + query.length;
      searchIndex = lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  // Helper function to add search highlighting markers to text (before ANSI conversion)
  const addHighlightMarkers = (text: string, query: string): string => {
    if (!query) return text;

    let result = '';
    let lastIndex = 0;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let searchIndex = 0;

    while (searchIndex < lowerText.length) {
      const idx = lowerText.indexOf(lowerQuery, searchIndex);
      if (idx === -1) break;

      result += text.substring(lastIndex, idx);
      result += `<mark style="background-color: ${theme.colors.warning}; color: ${theme.mode === 'light' ? '#fff' : '#000'}; padding: 1px 2px; border-radius: 2px;">`;
      result += text.substring(idx, idx + query.length);
      result += '</mark>';

      lastIndex = idx + query.length;
      searchIndex = lastIndex;
    }

    result += text.substring(lastIndex);
    return result;
  };

  // Strip command echo from terminal output
  let textToProcess = log.text;
  if (isTerminal && log.source !== 'user' && lastUserCommand) {
    if (textToProcess.startsWith(lastUserCommand)) {
      textToProcess = textToProcess.slice(lastUserCommand.length);
      if (textToProcess.startsWith('\r\n')) {
        textToProcess = textToProcess.slice(2);
      } else if (textToProcess.startsWith('\n') || textToProcess.startsWith('\r')) {
        textToProcess = textToProcess.slice(1);
      }
    }
  }

  const processedText = processLogTextHelper(textToProcess, isTerminal && log.source !== 'user');

  // Skip rendering stderr entries that have no actual content
  if (log.source === 'stderr' && !processedText.trim()) {
    return null;
  }

  // Separate stdout and stderr for terminal output
  const separated = log.source === 'stderr'
    ? { stdout: '', stderr: processedText }
    : { stdout: processedText, stderr: '' };

  // Apply local filter if active for this log entry
  const filteredStdout = localFilterQuery && log.source !== 'user'
    ? filterTextByLinesHelper(separated.stdout, localFilterQuery, filterMode.mode, filterMode.regex)
    : separated.stdout;
  const filteredStderr = localFilterQuery && log.source !== 'user'
    ? filterTextByLinesHelper(separated.stderr, localFilterQuery, filterMode.mode, filterMode.regex)
    : separated.stderr;

  // Check if filter returned no results
  const hasNoMatches = localFilterQuery && !filteredStdout.trim() && !filteredStderr.trim() && log.source !== 'user';

  // For stderr entries, use stderr content; for all others, use stdout content
  const contentToDisplay = log.source === 'stderr' ? filteredStderr : filteredStdout;

  // Apply search highlighting before ANSI conversion for terminal output
  const contentWithHighlights = isTerminal && log.source !== 'user' && outputSearchQuery
    ? addHighlightMarkers(contentToDisplay, outputSearchQuery)
    : contentToDisplay;

  // Convert ANSI codes to HTML for terminal output and sanitize with DOMPurify
  const htmlContent = isTerminal && log.source !== 'user'
    ? DOMPurify.sanitize(ansiConverter.toHtml(contentWithHighlights))
    : contentToDisplay;

  const filteredText = contentToDisplay;

  // Count lines in the filtered text
  const lineCount = filteredText.split('\n').length;
  const shouldCollapse = lineCount > maxOutputLines && maxOutputLines !== Infinity;

  // Truncate text if collapsed
  const displayText = shouldCollapse && !isExpanded
    ? filteredText.split('\n').slice(0, maxOutputLines).join('\n')
    : filteredText;

  // Apply highlighting to truncated text as well
  const displayTextWithHighlights = shouldCollapse && !isExpanded && isTerminal && log.source !== 'user' && outputSearchQuery
    ? addHighlightMarkers(displayText, outputSearchQuery)
    : displayText;

  // Sanitize with DOMPurify before rendering
  const displayHtmlContent = shouldCollapse && !isExpanded && isTerminal && log.source !== 'user'
    ? DOMPurify.sanitize(ansiConverter.toHtml(displayTextWithHighlights))
    : htmlContent;

  const isUserMessage = log.source === 'user';

  return (
    <div ref={logItemRef} className={`flex gap-4 group ${isUserMessage ? 'flex-row-reverse' : ''} px-6 py-2`} data-log-index={index}>
      <div className={`w-12 shrink-0 text-[10px] pt-2 ${isUserMessage ? 'text-right' : 'text-left'}`}
           style={{ fontFamily, color: theme.colors.textDim, opacity: 0.6 }}>
        {new Date(log.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
      </div>
      <div className={`flex-1 min-w-0 p-4 pb-10 ${isUserMessage && log.readOnly ? 'pt-8' : ''} rounded-xl border ${isUserMessage ? 'rounded-tr-none' : 'rounded-tl-none'} relative overflow-hidden`}
           style={{
             backgroundColor: isUserMessage
               ? isAIMode
                 ? `color-mix(in srgb, ${theme.colors.accent} 20%, ${theme.colors.bgSidebar})`
                 : `color-mix(in srgb, ${theme.colors.accent} 15%, ${theme.colors.bgActivity})`
               : log.source === 'stderr'
                 ? `color-mix(in srgb, ${theme.colors.error} 8%, ${theme.colors.bgActivity})`
                 : isAIMode ? theme.colors.bgActivity : 'transparent',
             borderColor: isUserMessage && isAIMode
               ? theme.colors.accent + '40'
               : log.source === 'stderr' ? theme.colors.error : theme.colors.border
           }}>
        {/* Read-only badge - top right of message for user messages sent in read-only mode */}
        {isUserMessage && log.readOnly && (
          <div className="absolute top-2 right-2">
            <span
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: `${theme.colors.warning}25`,
                color: theme.colors.warning,
                border: `1px solid ${theme.colors.warning}50`
              }}
              title="Sent in read-only mode (Claude won't modify files)"
            >
              <Eye className="w-3 h-3" />
              <span>Read-only</span>
            </span>
          </div>
        )}
        {/* Local filter icon for system output only */}
        {log.source !== 'user' && isTerminal && (
          <div className="absolute top-2 right-2 flex items-center gap-2">
            {activeLocalFilter === log.id || localFilterQuery ? (
              <div className="flex items-center gap-2 p-2 rounded border" style={{ backgroundColor: theme.colors.bgSidebar, borderColor: theme.colors.border }}>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSetFilterMode(log.id, (current) => ({ ...current, mode: current.mode === 'include' ? 'exclude' : 'include' }));
                  }}
                  className="p-1 rounded hover:opacity-70 transition-opacity"
                  style={{ color: filterMode.mode === 'include' ? theme.colors.success : theme.colors.error }}
                  title={filterMode.mode === 'include' ? 'Include matching lines' : 'Exclude matching lines'}
                >
                  {filterMode.mode === 'include' ? <PlusCircle className="w-3.5 h-3.5" /> : <MinusCircle className="w-3.5 h-3.5" />}
                </button>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSetFilterMode(log.id, (current) => ({ ...current, regex: !current.regex }));
                  }}
                  className="px-2 py-1 rounded hover:opacity-70 transition-opacity text-xs font-bold"
                  style={{ fontFamily, color: filterMode.regex ? theme.colors.accent : theme.colors.textDim }}
                  title={filterMode.regex ? 'Using regex' : 'Using plain text'}
                >
                  {filterMode.regex ? '.*' : 'Aa'}
                </button>
                <input
                  type="text"
                  value={localFilterQuery}
                  onChange={(e) => onSetLocalFilterQuery(log.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      onClearLocalFilter(log.id);
                    }
                  }}
                  onBlur={() => {
                    if (!localFilterQuery) {
                      onToggleLocalFilter(log.id);
                    }
                  }}
                  placeholder={
                    filterMode.mode === 'include'
                      ? (filterMode.regex ? "Include by RegEx" : "Include by keyword")
                      : (filterMode.regex ? "Exclude by RegEx" : "Exclude by keyword")
                  }
                  className="w-40 px-2 py-1 text-xs rounded border bg-transparent outline-none"
                  style={{
                    borderColor: theme.colors.accent,
                    color: theme.colors.textMain,
                    backgroundColor: theme.colors.bgMain
                  }}
                  autoFocus={activeLocalFilter === log.id}
                />
                <button
                  onClick={() => onClearLocalFilter(log.id)}
                  className="p-1 rounded hover:opacity-70 transition-opacity"
                  style={{ color: theme.colors.textDim }}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => onToggleLocalFilter(log.id)}
                className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-opacity-10 transition-opacity"
                style={{
                  color: localFilterQuery ? theme.colors.accent : theme.colors.textDim,
                  backgroundColor: localFilterQuery ? theme.colors.bgActivity : 'transparent'
                }}
                title="Filter this output"
              >
                <Filter className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
        {log.images && log.images.length > 0 && (
          <div className="flex gap-2 mb-2 overflow-x-auto scrollbar-thin" style={{ overscrollBehavior: 'contain' }}>
            {log.images.map((img, imgIdx) => (
              <img
                key={imgIdx}
                src={img}
                className="h-20 rounded border cursor-zoom-in shrink-0"
                style={{ objectFit: 'contain', maxWidth: '200px' }}
                onClick={() => setLightboxImage(img, log.images)}
              />
            ))}
          </div>
        )}
        {log.source === 'stderr' && (
          <div className="mb-2">
            <span
              className="px-2 py-1 rounded text-xs font-bold uppercase tracking-wide"
              style={{
                backgroundColor: theme.colors.error,
                color: '#fff'
              }}
            >
              STDERR
            </span>
          </div>
        )}
        {hasNoMatches ? (
          <div className="flex items-center justify-center py-8 text-sm" style={{ color: theme.colors.textDim }}>
            <span>No matches found for filter</span>
          </div>
        ) : shouldCollapse && !isExpanded ? (
          <div>
            <div
              className={`${isTerminal && log.source !== 'user' ? 'whitespace-pre text-sm' : 'whitespace-pre-wrap text-sm break-all'}`}
              style={{
                maxHeight: `${maxOutputLines * 1.5}em`,
                overflow: isTerminal && log.source !== 'user' ? 'hidden' : 'hidden',
                color: theme.colors.textMain,
                fontFamily,
                wordBreak: isTerminal && log.source !== 'user' ? undefined : 'break-all'
              }}
            >
              {isTerminal && log.source !== 'user' ? (
                // Content sanitized with DOMPurify above
                // Horizontal scroll for terminal output to preserve column alignment
                <div className="overflow-x-auto scrollbar-thin" dangerouslySetInnerHTML={{ __html: displayHtmlContent }} />
              ) : isAIMode && !markdownRawMode ? (
                // Collapsed markdown preview with rendered markdown
                // Note: prose styles are injected once at TerminalOutput container level for performance
                <div className="prose prose-sm max-w-none" style={{ color: theme.colors.textMain, lineHeight: 1.4, paddingLeft: '0.5em' }}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ node, href, children, ...props }) => (
                        <a
                          href={href}
                          {...props}
                          onClick={(e) => {
                            e.preventDefault();
                            if (href) {
                              window.maestro.shell.openExternal(href);
                            }
                          }}
                          style={{ color: theme.colors.accent, textDecoration: 'underline', cursor: 'pointer' }}
                        >
                          {children}
                        </a>
                      ),
                      // Custom li to handle loose lists - render p children inline
                      li: ({ node, children, ...props }: any) => {
                        // Process children to convert p tags to spans for inline rendering
                        const processedChildren = React.Children.map(children, (child: any) => {
                          if (child?.type === 'p') {
                            return <span>{child.props.children}</span>;
                          }
                          return child;
                        });
                        return <li {...props}>{processedChildren}</li>;
                      },
                      code: ({ node, inline, className, children, ...props }: any) => {
                        const match = (className || '').match(/language-(\w+)/);
                        const language = match ? match[1] : 'text';
                        const codeContent = String(children).replace(/\n$/, '');

                        return !inline && match ? (
                          <CodeBlockWithCopy
                            language={language}
                            codeContent={codeContent}
                            theme={theme}
                            onCopy={copyToClipboard}
                          />
                        ) : (
                          <code className={className} {...props}>
                            {children}
                          </code>
                        );
                      }
                    }}
                  >
                    {displayText}
                  </ReactMarkdown>
                </div>
              ) : (
                displayText
              )}
            </div>
            <button
              onClick={handleExpandToggle}
              className="flex items-center gap-2 mt-2 text-xs px-3 py-1.5 rounded border hover:opacity-70 transition-opacity"
              style={{
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.bgActivity,
                color: theme.colors.accent
              }}
            >
              <ChevronDown className="w-3 h-3" />
              Show all {lineCount} lines
            </button>
          </div>
        ) : shouldCollapse && isExpanded ? (
          <div>
            <div
              className={`${isTerminal && log.source !== 'user' ? 'whitespace-pre text-sm scrollbar-thin' : 'whitespace-pre-wrap text-sm break-all'}`}
              style={{
                maxHeight: '600px',
                overflow: 'auto',
                overscrollBehavior: 'contain',
                color: theme.colors.textMain,
                fontFamily,
                wordBreak: isTerminal && log.source !== 'user' ? undefined : 'break-all'
              }}
              onWheel={(e) => {
                // Prevent scroll from propagating to parent when this container can scroll
                const el = e.currentTarget;
                const { scrollTop, scrollHeight, clientHeight } = el;
                const atTop = scrollTop <= 0;
                const atBottom = scrollTop + clientHeight >= scrollHeight - 1;

                // Only stop propagation if we're not at the boundary we're scrolling towards
                if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBottom)) {
                  e.stopPropagation();
                }
              }}
            >
              {isTerminal && log.source !== 'user' ? (
                // Content sanitized with DOMPurify above
                // Horizontal scroll for terminal output to preserve column alignment
                <div dangerouslySetInnerHTML={{ __html: displayHtmlContent }} />
              ) : log.source === 'user' && isTerminal ? (
                <div style={{ fontFamily }}>
                  <span style={{ color: theme.colors.accent }}>$ </span>
                  {highlightMatches(filteredText, outputSearchQuery)}
                </div>
              ) : log.aiCommand ? (
                <div className="space-y-3">
                  <div
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border"
                    style={{
                      backgroundColor: theme.colors.accent + '15',
                      borderColor: theme.colors.accent + '30'
                    }}
                  >
                    <span className="font-mono font-bold text-sm" style={{ color: theme.colors.accent }}>
                      {log.aiCommand.command}:
                    </span>
                    <span className="text-sm" style={{ color: theme.colors.textMain }}>
                      {log.aiCommand.description}
                    </span>
                  </div>
                  <div>{highlightMatches(filteredText, outputSearchQuery)}</div>
                </div>
              ) : isAIMode && !markdownRawMode ? (
                // Expanded markdown rendering
                // Note: prose styles are injected once at TerminalOutput container level for performance
                <div className="prose prose-sm max-w-none text-sm" style={{ color: theme.colors.textMain, lineHeight: 1.4, paddingLeft: '0.5em' }}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ node, href, children, ...props }) => (
                        <a
                          href={href}
                          {...props}
                          onClick={(e) => {
                            e.preventDefault();
                            if (href) {
                              window.maestro.shell.openExternal(href);
                            }
                          }}
                          style={{ color: theme.colors.accent, textDecoration: 'underline', cursor: 'pointer' }}
                        >
                          {children}
                        </a>
                      ),
                      // Custom li to handle loose lists - render p children inline
                      li: ({ node, children, ...props }: any) => {
                        // Process children to convert p tags to spans for inline rendering
                        const processedChildren = React.Children.map(children, (child: any) => {
                          if (child?.type === 'p') {
                            return <span>{child.props.children}</span>;
                          }
                          return child;
                        });
                        return <li {...props}>{processedChildren}</li>;
                      },
                      code: ({ node, inline, className, children, ...props }: any) => {
                        const match = (className || '').match(/language-(\w+)/);
                        const language = match ? match[1] : 'text';
                        const codeContent = String(children).replace(/\n$/, '');

                        return !inline && match ? (
                          <CodeBlockWithCopy
                            language={language}
                            codeContent={codeContent}
                            theme={theme}
                            onCopy={copyToClipboard}
                          />
                        ) : (
                          <code className={className} {...props}>
                            {children}
                          </code>
                        );
                      }
                    }}
                  >
                    {filteredText}
                  </ReactMarkdown>
                </div>
              ) : (
                <div>{highlightMatches(filteredText, outputSearchQuery)}</div>
              )}
            </div>
            <button
              onClick={handleExpandToggle}
              className="flex items-center gap-2 mt-2 text-xs px-3 py-1.5 rounded border hover:opacity-70 transition-opacity"
              style={{
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.bgActivity,
                color: theme.colors.accent
              }}
            >
              <ChevronUp className="w-3 h-3" />
              Show less
            </button>
          </div>
        ) : (
          <>
            {isTerminal && log.source !== 'user' ? (
              // Content sanitized with DOMPurify above
              <div
                className="whitespace-pre text-sm overflow-x-auto scrollbar-thin"
                style={{ color: theme.colors.textMain, fontFamily, overscrollBehavior: 'contain' }}
                dangerouslySetInnerHTML={{ __html: displayHtmlContent }}
              />
            ) : log.source === 'user' && isTerminal ? (
              <div className="whitespace-pre-wrap text-sm break-all" style={{ color: theme.colors.textMain, fontFamily }}>
                <span style={{ color: theme.colors.accent }}>$ </span>
                {highlightMatches(filteredText, outputSearchQuery)}
              </div>
            ) : log.aiCommand ? (
              <div className="space-y-3">
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border"
                  style={{
                    backgroundColor: theme.colors.accent + '15',
                    borderColor: theme.colors.accent + '30'
                  }}
                >
                  <span className="font-mono font-bold text-sm" style={{ color: theme.colors.accent }}>
                    {log.aiCommand.command}:
                  </span>
                  <span className="text-sm" style={{ color: theme.colors.textMain }}>
                    {log.aiCommand.description}
                  </span>
                </div>
                <div className="whitespace-pre-wrap text-sm break-all" style={{ color: theme.colors.textMain }}>
                  {highlightMatches(filteredText, outputSearchQuery)}
                </div>
              </div>
            ) : isAIMode && !markdownRawMode ? (
              // Rendered markdown for AI responses
              // Note: prose styles are injected once at TerminalOutput container level for performance
              <div className="prose prose-sm max-w-none text-sm" style={{ color: theme.colors.textMain, lineHeight: 1.4, paddingLeft: '0.5em' }}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ node, href, children, ...props }) => (
                      <a
                        href={href}
                        {...props}
                        onClick={(e) => {
                          e.preventDefault();
                          if (href) {
                            window.maestro.shell.openExternal(href);
                          }
                        }}
                        style={{ color: theme.colors.accent, textDecoration: 'underline', cursor: 'pointer' }}
                      >
                        {children}
                      </a>
                    ),
                    li: ({ node, children, ...props }: any) => {
                      // Convert <p> children to <span> to prevent block display in list items
                      const processedChildren = React.Children.map(children, (child: any) => {
                        if (child?.type === 'p') {
                          return <span>{child.props.children}</span>;
                        }
                        return child;
                      });
                      return <li {...props}>{processedChildren}</li>;
                    },
                    code: ({ node, inline, className, children, ...props }: any) => {
                      const match = (className || '').match(/language-(\w+)/);
                      const language = match ? match[1] : 'text';
                      const codeContent = String(children).replace(/\n$/, '');

                      return !inline && match ? (
                        <CodeBlockWithCopy
                          language={language}
                          codeContent={codeContent}
                          theme={theme}
                          onCopy={copyToClipboard}
                        />
                      ) : (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    }
                  }}
                >
                  {filteredText}
                </ReactMarkdown>
              </div>
            ) : (
              // Plain text mode (strip markdown formatting for readability)
              <div className="whitespace-pre-wrap text-sm break-all" style={{ color: theme.colors.textMain }}>
                {highlightMatches(isAIMode ? stripMarkdown(filteredText) : filteredText, outputSearchQuery)}
              </div>
            )}
          </>
        )}
        {/* Action buttons - bottom right corner */}
        <div
          className="absolute bottom-2 right-2 flex items-center gap-1"
          style={{ transition: 'opacity 0.15s ease-in-out' }}
        >
          {/* Markdown toggle button for AI responses */}
          {log.source !== 'user' && isAIMode && (
            <button
              onClick={onToggleMarkdownRawMode}
              className="p-1.5 rounded opacity-0 group-hover:opacity-50 hover:!opacity-100"
              style={{ color: markdownRawMode ? theme.colors.accent : theme.colors.textDim }}
              title={markdownRawMode ? "Show formatted (⌘E)" : "Show plain text (⌘E)"}
            >
              {markdownRawMode ? <Eye className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
            </button>
          )}
          {/* Speak/Stop Button - only show for non-user messages when TTS is configured */}
          {audioFeedbackCommand && log.source !== 'user' && (
            speakingLogId === log.id ? (
              <button
                onClick={stopSpeaking}
                className="p-1.5 rounded opacity-100"
                style={{ color: theme.colors.error }}
                title="Stop speaking"
              >
                <Square className="w-3.5 h-3.5" fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={() => speakText?.(log.text, log.id)}
                className="p-1.5 rounded opacity-0 group-hover:opacity-50 hover:!opacity-100"
                style={{ color: theme.colors.textDim }}
                title="Speak text"
              >
                <Volume2 className="w-3.5 h-3.5" />
              </button>
            )
          )}
          {/* Copy to Clipboard Button */}
          <button
            onClick={() => copyToClipboard(log.text)}
            className="p-1.5 rounded opacity-0 group-hover:opacity-50 hover:!opacity-100"
            style={{ color: theme.colors.textDim }}
            title="Copy to clipboard"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          {/* Delete button for user messages (both AI and terminal modes) */}
          {log.source === 'user' && onDeleteLog && (
            deleteConfirmLogId === log.id ? (
              <div className="flex items-center gap-1 p-1 rounded border" style={{ backgroundColor: theme.colors.bgSidebar, borderColor: theme.colors.error }}>
                <span className="text-xs px-1" style={{ color: theme.colors.error }}>Delete?</span>
                <button
                  onClick={() => {
                    const nextIndex = onDeleteLog(log.id);
                    onSetDeleteConfirmLogId(null);
                    if (nextIndex !== null && nextIndex >= 0) {
                      setTimeout(() => {
                        const container = scrollContainerRef.current;
                        const items = container?.querySelectorAll('[data-log-index]');
                        const targetItem = items?.[nextIndex] as HTMLElement;
                        if (targetItem && container) {
                          container.scrollTop = targetItem.offsetTop;
                        }
                      }, 50);
                    }
                  }}
                  className="px-2 py-0.5 rounded text-xs font-medium hover:opacity-80"
                  style={{ backgroundColor: theme.colors.error, color: '#fff' }}
                >
                  Yes
                </button>
                <button
                  onClick={() => onSetDeleteConfirmLogId(null)}
                  className="px-2 py-0.5 rounded text-xs hover:opacity-80"
                  style={{ color: theme.colors.textDim }}
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => onSetDeleteConfirmLogId(log.id)}
                className="p-1.5 rounded opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity"
                style={{ color: theme.colors.textDim }}
                title={isAIMode ? "Delete message and response" : "Delete command and output"}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )
          )}
          {/* Delivery checkmark for user messages in AI mode - positioned at the end */}
          {isUserMessage && isAIMode && log.delivered && (
            <span title="Message delivered" className="flex items-center">
              <Check
                className="w-3.5 h-3.5"
                style={{ color: theme.colors.success, opacity: 0.6 }}
              />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render if these specific props change
  return (
    prevProps.log.id === nextProps.log.id &&
    prevProps.log.text === nextProps.log.text &&
    prevProps.log.delivered === nextProps.log.delivered &&
    prevProps.log.readOnly === nextProps.log.readOnly &&
    prevProps.isExpanded === nextProps.isExpanded &&
    prevProps.localFilterQuery === nextProps.localFilterQuery &&
    prevProps.filterMode.mode === nextProps.filterMode.mode &&
    prevProps.filterMode.regex === nextProps.filterMode.regex &&
    prevProps.activeLocalFilter === nextProps.activeLocalFilter &&
    prevProps.deleteConfirmLogId === nextProps.deleteConfirmLogId &&
    prevProps.speakingLogId === nextProps.speakingLogId &&
    prevProps.outputSearchQuery === nextProps.outputSearchQuery &&
    prevProps.theme === nextProps.theme &&
    prevProps.maxOutputLines === nextProps.maxOutputLines &&
    prevProps.markdownRawMode === nextProps.markdownRawMode
  );
});

LogItemComponent.displayName = 'LogItemComponent';

// ============================================================================
// ElapsedTimeDisplay - Separate component for elapsed time
// ============================================================================

// Separate component for elapsed time to prevent re-renders of the entire list
const ElapsedTimeDisplay = memo(({ thinkingStartTime, textColor }: { thinkingStartTime: number; textColor: string }) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(
    Math.floor((Date.now() - thinkingStartTime) / 1000)
  );

  useEffect(() => {
    // Update every second
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - thinkingStartTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [thinkingStartTime]);

  // Format elapsed time as mm:ss or hh:mm:ss
  const formatElapsedTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <span className="text-sm font-mono" style={{ color: textColor }}>
      {formatElapsedTime(elapsedSeconds)}
    </span>
  );
});

interface TerminalOutputProps {
  session: Session;
  theme: Theme;
  fontFamily: string;
  activeFocus: string;
  outputSearchOpen: boolean;
  outputSearchQuery: string;
  setOutputSearchOpen: (open: boolean) => void;
  setOutputSearchQuery: (query: string) => void;
  setActiveFocus: (focus: string) => void;
  setLightboxImage: (image: string | null, contextImages?: string[]) => void;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  logsEndRef: React.RefObject<HTMLDivElement>;
  maxOutputLines: number;
  onDeleteLog?: (logId: string) => number | null; // Returns the index to scroll to after deletion
  onRemoveQueuedItem?: (itemId: string) => void; // Callback to remove a queued item from execution queue
  onInterrupt?: () => void; // Callback to interrupt the current process
  audioFeedbackCommand?: string; // TTS command for speech synthesis
  onScrollPositionChange?: (scrollTop: number) => void; // Callback to save scroll position
  initialScrollTop?: number; // Initial scroll position to restore
  markdownRawMode: boolean; // Whether to show raw markdown or rendered markdown for AI responses
  setMarkdownRawMode: (value: boolean) => void; // Toggle markdown raw mode
}

export const TerminalOutput = forwardRef<HTMLDivElement, TerminalOutputProps>((props, ref) => {
  const {
    session, theme, fontFamily, activeFocus, outputSearchOpen, outputSearchQuery,
    setOutputSearchOpen, setOutputSearchQuery, setActiveFocus, setLightboxImage,
    inputRef, logsEndRef, maxOutputLines, onDeleteLog, onRemoveQueuedItem, onInterrupt,
    audioFeedbackCommand, onScrollPositionChange, initialScrollTop,
    markdownRawMode, setMarkdownRawMode
  } = props;

  // Use the forwarded ref if provided, otherwise create a local one
  const terminalOutputRef = (ref as React.RefObject<HTMLDivElement>) || useRef<HTMLDivElement>(null);

  // Scroll container ref for native scrolling
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Track which log entries are expanded (by log ID)
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  // Use a ref to access current value without recreating LogItem callback
  const expandedLogsRef = useRef(expandedLogs);
  expandedLogsRef.current = expandedLogs;
  // Counter to force re-render of LogItem when expanded state changes
  const [expandedTrigger, setExpandedTrigger] = useState(0);

  // Track local filters per log entry (log ID -> filter query)
  const [localFilters, setLocalFilters] = useState<Map<string, string>>(new Map());
  // Use refs to access current values without recreating LogItem callback
  const localFiltersRef = useRef(localFilters);
  localFiltersRef.current = localFilters;
  const [activeLocalFilter, setActiveLocalFilter] = useState<string | null>(null);
  const activeLocalFilterRef = useRef(activeLocalFilter);
  activeLocalFilterRef.current = activeLocalFilter;
  // Counter to force re-render when local filter state changes
  const [filterTrigger, setFilterTrigger] = useState(0);

  // Track filter modes per log entry (log ID -> {mode: 'include'|'exclude', regex: boolean})
  const [filterModes, setFilterModes] = useState<Map<string, { mode: 'include' | 'exclude'; regex: boolean }>>(new Map());
  const filterModesRef = useRef(filterModes);
  filterModesRef.current = filterModes;

  // Delete confirmation state
  const [deleteConfirmLogId, setDeleteConfirmLogId] = useState<string | null>(null);
  const deleteConfirmLogIdRef = useRef(deleteConfirmLogId);
  deleteConfirmLogIdRef.current = deleteConfirmLogId;
  // Counter to force re-render when delete confirmation changes
  const [deleteConfirmTrigger, setDeleteConfirmTrigger] = useState(0);

  // Queue removal confirmation state
  const [queueRemoveConfirmId, setQueueRemoveConfirmId] = useState<string | null>(null);

  // Track which queued messages are expanded (for viewing full content)
  const [expandedQueuedMessages, setExpandedQueuedMessages] = useState<Set<string>>(new Set());

  // Copy to clipboard notification state
  const [showCopiedNotification, setShowCopiedNotification] = useState(false);

  // TTS state - track which log is currently speaking and its TTS ID
  const [speakingLogId, setSpeakingLogId] = useState<string | null>(null);
  const [activeTtsId, setActiveTtsId] = useState<number | null>(null);

  // New message indicator state
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const lastLogCountRef = useRef(0);

  // Track read state per tab - stores the log count when user scrolled to bottom
  const tabReadStateRef = useRef<Map<string, number>>(new Map());

  // Throttle timer ref for scroll position saves
  const scrollSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track if initial scroll restore has been done
  const hasRestoredScrollRef = useRef(false);

  // Get active tab ID for resetting state on tab switch
  const activeTabId = session.inputMode === 'ai' ? session.activeTabId : null;

  // Copy text to clipboard with notification
  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setShowCopiedNotification(true);
      setTimeout(() => setShowCopiedNotification(false), 1500);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  }, []);

  // Speak text using TTS command
  const speakText = useCallback(async (text: string, logId: string) => {
    console.log('[TTS] speakText called, text length:', text.length, 'command:', audioFeedbackCommand, 'logId:', logId);
    if (!audioFeedbackCommand) {
      console.log('[TTS] No audioFeedbackCommand configured, skipping');
      return;
    }
    try {
      // Set the speaking state before starting
      setSpeakingLogId(logId);
      const result = await window.maestro.notification.speak(text, audioFeedbackCommand);
      console.log('[TTS] Speak result:', result);
      if (result.success && result.ttsId) {
        setActiveTtsId(result.ttsId);
      } else {
        // If speak failed, clear the speaking state
        setSpeakingLogId(null);
      }
    } catch (err) {
      console.error('[TTS] Failed to speak text:', err);
      setSpeakingLogId(null);
    }
  }, [audioFeedbackCommand]);

  // Stop the currently speaking TTS
  const stopSpeaking = useCallback(async () => {
    console.log('[TTS] stopSpeaking called, activeTtsId:', activeTtsId);
    if (activeTtsId === null) {
      console.log('[TTS] No active TTS to stop');
      setSpeakingLogId(null);
      return;
    }
    try {
      const result = await window.maestro.notification.stopSpeak(activeTtsId);
      console.log('[TTS] Stop result:', result);
    } catch (err) {
      console.error('[TTS] Failed to stop speaking:', err);
    }
    // Always clear state after stopping
    setSpeakingLogId(null);
    setActiveTtsId(null);
  }, [activeTtsId]);

  // Listen for TTS completion events from main process
  useEffect(() => {
    const cleanup = window.maestro.notification.onTtsCompleted((completedTtsId: number) => {
      console.log('[TTS] TTS completed event received for ID:', completedTtsId);
      // Only clear if this is the currently active TTS
      if (completedTtsId === activeTtsId) {
        setSpeakingLogId(null);
        setActiveTtsId(null);
      }
    });
    return cleanup;
  }, [activeTtsId]);

  // Layer stack integration for search overlay
  const { registerLayer, unregisterLayer, updateLayerHandler } = useLayerStack();
  const layerIdRef = useRef<string>();

  // Register layer when search is open
  useEffect(() => {
    if (outputSearchOpen) {
      layerIdRef.current = registerLayer({
        type: 'overlay',
        priority: MODAL_PRIORITIES.SLASH_AUTOCOMPLETE, // Use same priority as slash autocomplete (low priority)
        blocksLowerLayers: false,
        capturesFocus: true,
        focusTrap: 'none',
        onEscape: () => {
          setOutputSearchOpen(false);
          setOutputSearchQuery('');
          terminalOutputRef.current?.focus();
        },
        allowClickOutside: true,
        ariaLabel: 'Output Search'
      });

      return () => {
        if (layerIdRef.current) {
          unregisterLayer(layerIdRef.current);
        }
      };
    }
  }, [outputSearchOpen, registerLayer, unregisterLayer]);

  // Update the handler when dependencies change
  useEffect(() => {
    if (outputSearchOpen && layerIdRef.current) {
      updateLayerHandler(layerIdRef.current, () => {
        setOutputSearchOpen(false);
        setOutputSearchQuery('');
        terminalOutputRef.current?.focus();
      });
    }
  }, [outputSearchOpen, updateLayerHandler]);

  const toggleExpanded = useCallback((logId: string) => {
    setExpandedLogs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(logId)) {
        newSet.delete(logId);
      } else {
        newSet.add(logId);
      }
      return newSet;
    });
    // Trigger re-render after state update
    setExpandedTrigger(t => t + 1);
  }, []);

  const toggleLocalFilter = useCallback((logId: string) => {
    setActiveLocalFilter(prev => prev === logId ? null : logId);
    setFilterTrigger(t => t + 1);
  }, []);

  const setLocalFilterQuery = useCallback((logId: string, query: string) => {
    setLocalFilters(prev => {
      const newMap = new Map(prev);
      if (query) {
        newMap.set(logId, query);
      } else {
        newMap.delete(logId);
      }
      return newMap;
    });
  }, []);

  // Callback to update filter mode for a log entry
  const setFilterModeForLog = useCallback((logId: string, update: (current: { mode: 'include' | 'exclude'; regex: boolean }) => { mode: 'include' | 'exclude'; regex: boolean }) => {
    setFilterModes(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(logId) || { mode: 'include' as const, regex: false };
      newMap.set(logId, update(current));
      return newMap;
    });
  }, []);

  // Callback to clear local filter for a log entry
  const clearLocalFilter = useCallback((logId: string) => {
    setActiveLocalFilter(null);
    setLocalFilterQuery(logId, '');
    setFilterModes(prev => {
      const newMap = new Map(prev);
      newMap.delete(logId);
      return newMap;
    });
  }, [setLocalFilterQuery]);

  // Callback to toggle markdown raw mode
  const toggleMarkdownRawMode = useCallback(() => {
    setMarkdownRawMode(!markdownRawMode);
  }, [markdownRawMode, setMarkdownRawMode]);

  // Auto-focus on search input when opened
  useEffect(() => {
    if (outputSearchOpen) {
      terminalOutputRef.current?.querySelector('input')?.focus();
    }
  }, [outputSearchOpen]);

  // Create ANSI converter with theme-aware colors
  const ansiConverter = useMemo(() => {
    return new Convert({
      fg: theme.colors.textMain,
      bg: theme.colors.bgMain,
      newline: false,
      escapeXML: true,
      stream: false,
      colors: {
        0: theme.colors.textMain,   // black -> textMain
        1: theme.colors.error,       // red -> error
        2: theme.colors.success,     // green -> success
        3: theme.colors.warning,     // yellow -> warning
        4: theme.colors.accent,      // blue -> accent
        5: theme.colors.accentDim,   // magenta -> accentDim
        6: theme.colors.accent,      // cyan -> accent
        7: theme.colors.textDim,     // white -> textDim
      }
    });
  }, [theme]);

  // In AI mode, use the active tab's logs
  const activeTab = session.inputMode === 'ai' ? getActiveTab(session) : undefined;
  const activeLogs: LogEntry[] = session.inputMode === 'ai'
    ? (activeTab?.logs ?? [])
    : session.shellLogs;

  // In AI mode, collapse consecutive non-user entries into single response blocks
  // This provides a cleaner view where each user message gets one response
  const collapsedLogs = useMemo(() => {
    // Only collapse in AI mode
    if (session.inputMode !== 'ai') return activeLogs;

    const result: LogEntry[] = [];
    let currentResponseGroup: LogEntry[] = [];

    for (const log of activeLogs) {
      if (log.source === 'user') {
        // Flush any accumulated response group
        if (currentResponseGroup.length > 0) {
          // Combine all response entries into one
          const combinedText = currentResponseGroup.map(l => l.text).join('');
          result.push({
            ...currentResponseGroup[0],
            text: combinedText,
            // Keep the first entry's timestamp and id
          });
          currentResponseGroup = [];
        }
        result.push(log);
      } else {
        // Accumulate non-user entries (AI responses)
        currentResponseGroup.push(log);
      }
    }

    // Flush final response group
    if (currentResponseGroup.length > 0) {
      const combinedText = currentResponseGroup.map(l => l.text).join('');
      result.push({
        ...currentResponseGroup[0],
        text: combinedText,
      });
    }

    return result;
  }, [activeLogs, session.inputMode]);

  // Filter logs based on search query - memoized for performance
  const filteredLogs = useMemo(() => {
    if (!outputSearchQuery) return collapsedLogs;
    return collapsedLogs.filter(log =>
      log.text.toLowerCase().includes(outputSearchQuery.toLowerCase())
    );
  }, [collapsedLogs, outputSearchQuery]);

  // Handle scroll to detect if user is at bottom and save scroll position (throttled)
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    // Consider "at bottom" if within 50px of the bottom
    const atBottom = scrollHeight - scrollTop - clientHeight < 50;
    setIsAtBottom(atBottom);
    // Clear new message indicator when user scrolls to bottom
    if (atBottom) {
      setHasNewMessages(false);
      setNewMessageCount(0);
      // Save read state for current tab
      if (activeTabId) {
        tabReadStateRef.current.set(activeTabId, filteredLogs.length);
      }
    }

    // Throttled scroll position save (200ms)
    if (onScrollPositionChange) {
      if (scrollSaveTimerRef.current) {
        clearTimeout(scrollSaveTimerRef.current);
      }
      scrollSaveTimerRef.current = setTimeout(() => {
        onScrollPositionChange(scrollTop);
        scrollSaveTimerRef.current = null;
      }, 200);
    }
  }, [activeTabId, filteredLogs.length, onScrollPositionChange]);

  // Restore read state when switching tabs
  useEffect(() => {
    if (!activeTabId) {
      // Terminal mode - just reset
      setHasNewMessages(false);
      setNewMessageCount(0);
      setIsAtBottom(true);
      lastLogCountRef.current = filteredLogs.length;
      return;
    }

    // Restore saved read state for this tab
    const savedReadCount = tabReadStateRef.current.get(activeTabId);
    const currentCount = filteredLogs.length;

    if (savedReadCount !== undefined) {
      // Tab was visited before - check for new messages since last read
      const unreadCount = currentCount - savedReadCount;
      if (unreadCount > 0) {
        setHasNewMessages(true);
        setNewMessageCount(unreadCount);
        setIsAtBottom(false);
      } else {
        setHasNewMessages(false);
        setNewMessageCount(0);
        setIsAtBottom(true);
      }
    } else {
      // First visit to this tab - mark all as read
      tabReadStateRef.current.set(activeTabId, currentCount);
      setHasNewMessages(false);
      setNewMessageCount(0);
      setIsAtBottom(true);
    }

    lastLogCountRef.current = currentCount;
  }, [activeTabId]); // Only run when tab changes, not when filteredLogs changes

  // Detect new messages when user is not at bottom (while staying on same tab)
  useEffect(() => {
    const currentCount = filteredLogs.length;
    if (currentCount > lastLogCountRef.current) {
      // Check actual scroll position, not just state (state may be stale)
      const container = scrollContainerRef.current;
      let actuallyAtBottom = isAtBottom;
      if (container) {
        const { scrollTop, scrollHeight, clientHeight } = container;
        actuallyAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      }

      if (!actuallyAtBottom) {
        const newCount = currentCount - lastLogCountRef.current;
        setHasNewMessages(true);
        setNewMessageCount(prev => prev + newCount);
        // Also update isAtBottom state to match reality
        setIsAtBottom(false);
      } else {
        // At bottom, update read state
        if (activeTabId) {
          tabReadStateRef.current.set(activeTabId, currentCount);
        }
      }
    }
    lastLogCountRef.current = currentCount;
  }, [filteredLogs.length, isAtBottom, activeTabId]);

  // Auto-scroll to bottom in terminal mode when new output arrives
  // Terminal mode should always auto-scroll since users expect to see command output immediately
  useEffect(() => {
    if (session.inputMode === 'terminal' && scrollContainerRef.current) {
      // Use requestAnimationFrame to ensure DOM has updated with new content
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({
            top: scrollContainerRef.current.scrollHeight,
            behavior: 'smooth'
          });
        }
      });
    }
  }, [session.inputMode, session.shellLogs.length]);

  // Restore scroll position when component mounts or initialScrollTop changes
  // Uses requestAnimationFrame to ensure DOM is ready
  useEffect(() => {
    // Only restore if we have a saved position and haven't restored yet for this mount
    if (initialScrollTop !== undefined && initialScrollTop > 0 && !hasRestoredScrollRef.current) {
      hasRestoredScrollRef.current = true;
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          const { scrollHeight, clientHeight } = scrollContainerRef.current;
          // Clamp to max scrollable area
          const maxScroll = Math.max(0, scrollHeight - clientHeight);
          const targetScroll = Math.min(initialScrollTop, maxScroll);
          scrollContainerRef.current.scrollTop = targetScroll;
        }
      });
    }
  }, [initialScrollTop]);

  // Reset restore flag when session/tab changes (handled by key prop on TerminalOutput)
  useEffect(() => {
    hasRestoredScrollRef.current = false;
  }, [session.id, activeTabId]);

  // Cleanup throttle timer on unmount
  useEffect(() => {
    return () => {
      if (scrollSaveTimerRef.current) {
        clearTimeout(scrollSaveTimerRef.current);
      }
    };
  }, []);

  // Scroll to bottom function
  const scrollToBottom = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
      setHasNewMessages(false);
      setNewMessageCount(0);
    }
  }, []);

  // Helper to find last user command for echo stripping in terminal mode
  const getLastUserCommand = useCallback((index: number): string | undefined => {
    for (let i = index - 1; i >= 0; i--) {
      if (filteredLogs[i]?.source === 'user') {
        return filteredLogs[i].text;
      }
    }
    return undefined;
  }, [filteredLogs]);

  // Computed values for rendering
  const isTerminal = session.inputMode === 'terminal';
  const isAIMode = session.inputMode === 'ai';

  // Memoized prose styles - applied once at container level instead of per-log-item
  const proseStyles = useMemo(() => `
    .prose { line-height: 1.4; overflow: visible; }
    .prose > *:first-child { margin-top: 0 !important; }
    .prose > *:last-child { margin-bottom: 0 !important; }
    .prose * { margin-top: 0; margin-bottom: 0; }
    .prose h1 { color: ${theme.colors.accent}; font-size: 2em; font-weight: bold; margin: 0.25em 0 !important; line-height: 1.4; }
    .prose h2 { color: ${theme.colors.success}; font-size: 1.75em; font-weight: bold; margin: 0.25em 0 !important; line-height: 1.4; }
    .prose h3 { color: ${theme.colors.warning}; font-size: 1.5em; font-weight: bold; margin: 0.25em 0 !important; line-height: 1.4; }
    .prose h4 { color: ${theme.colors.textMain}; font-size: 1.35em; font-weight: bold; margin: 0.2em 0 !important; line-height: 1.4; }
    .prose h5 { color: ${theme.colors.textMain}; font-size: 1.2em; font-weight: bold; margin: 0.2em 0 !important; line-height: 1.4; }
    .prose h6 { color: ${theme.colors.textDim}; font-size: 1.1em; font-weight: bold; margin: 0.2em 0 !important; line-height: 1.4; }
    .prose p { color: ${theme.colors.textMain}; margin: 0 !important; line-height: 1.4; }
    .prose p + p { margin-top: 0.5em !important; }
    .prose p:empty { display: none; }
    .prose > ul, .prose > ol { color: ${theme.colors.textMain}; margin: 0.25em 0 !important; padding-left: 2em; list-style-position: outside; }
    .prose li ul, .prose li ol { margin: 0 !important; padding-left: 1.5em; list-style-position: outside; }
    .prose li { margin: 0 !important; padding: 0; line-height: 1.4; display: list-item; }
    .prose li > p { margin: 0 !important; display: contents !important; }
    .prose li > p + ul, .prose li > p + ol { margin-top: 0 !important; }
    .prose li:has(> input[type="checkbox"]) { list-style: none; margin-left: -1.5em; }
    .prose code { background-color: ${theme.colors.bgSidebar}; color: ${theme.colors.textMain}; padding: 0.15em 0.3em; border-radius: 3px; font-size: 0.9em; }
    .prose pre { background-color: ${theme.colors.bgSidebar}; color: ${theme.colors.textMain}; padding: 0.5em; border-radius: 6px; overflow-x: auto; margin: 0.35em 0 !important; }
    .prose pre code { background: none; padding: 0; }
    .prose blockquote { border-left: 3px solid ${theme.colors.border}; padding-left: 0.75em; margin: 0.25em 0 !important; color: ${theme.colors.textDim}; }
    .prose a { color: ${theme.colors.accent}; text-decoration: underline; }
    .prose hr { border: none; border-top: 1px solid ${theme.colors.border}; margin: 0.5em 0 !important; }
    .prose table { border-collapse: collapse; width: 100%; margin: 0.35em 0 !important; }
    .prose th, .prose td { border: 1px solid ${theme.colors.border}; padding: 0.25em 0.5em; text-align: left; }
    .prose th { background-color: ${theme.colors.bgSidebar}; font-weight: bold; }
    .prose strong { font-weight: bold; }
    .prose em { font-style: italic; }
  `, [theme.colors]);

  return (
    <div
      ref={terminalOutputRef}
      tabIndex={0}
      className="flex-1 flex flex-col overflow-hidden transition-colors outline-none relative"
      style={{ backgroundColor: session.inputMode === 'ai' ? theme.colors.bgMain : theme.colors.bgActivity }}
      onKeyDown={(e) => {
        // / to open search
        if (e.key === '/' && !outputSearchOpen) {
          e.preventDefault();
          setOutputSearchOpen(true);
          return;
        }
        // Escape handling removed - delegated to layer stack for search
        // When search is not open, Escape should still focus back to input
        if (e.key === 'Escape' && !outputSearchOpen) {
          e.preventDefault();
          e.stopPropagation();
          // Focus back to text input
          inputRef.current?.focus();
          setActiveFocus('main');
          return;
        }
        // Arrow key scrolling (instant, no smooth behavior)
        // Plain arrow keys: scroll by ~100px
        if (e.key === 'ArrowUp' && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          scrollContainerRef.current?.scrollBy({ top: -100 });
          return;
        }
        if (e.key === 'ArrowDown' && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          scrollContainerRef.current?.scrollBy({ top: 100 });
          return;
        }
        // Option/Alt+Up: page up
        if (e.key === 'ArrowUp' && e.altKey && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          const height = terminalOutputRef.current?.clientHeight || 400;
          scrollContainerRef.current?.scrollBy({ top: -height });
          return;
        }
        // Option/Alt+Down: page down
        if (e.key === 'ArrowDown' && e.altKey && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          const height = terminalOutputRef.current?.clientHeight || 400;
          scrollContainerRef.current?.scrollBy({ top: height });
          return;
        }
        // Cmd+Up to jump to top
        if (e.key === 'ArrowUp' && (e.metaKey || e.ctrlKey) && !e.altKey) {
          e.preventDefault();
          scrollContainerRef.current?.scrollTo({ top: 0 });
          return;
        }
        // Cmd+Down to jump to bottom
        if (e.key === 'ArrowDown' && (e.metaKey || e.ctrlKey) && !e.altKey) {
          e.preventDefault();
          const container = scrollContainerRef.current;
          if (container) {
            container.scrollTo({ top: container.scrollHeight });
          }
          return;
        }
      }}
    >
      {/* Output Search */}
      {outputSearchOpen && (
        <div className="sticky top-0 z-10 pb-4">
          <input
            type="text"
            value={outputSearchQuery}
            onChange={(e) => setOutputSearchQuery(e.target.value)}
            placeholder="Filter output... (Esc to close)"
            className="w-full px-3 py-2 rounded border bg-transparent outline-none text-sm"
            style={{ borderColor: theme.colors.accent, color: theme.colors.textMain, backgroundColor: theme.colors.bgSidebar }}
            autoFocus
          />
        </div>
      )}
      {/* Prose styles for markdown rendering - injected once at container level for performance */}
      <style>{proseStyles}</style>
      {/* Native scroll log list */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto scrollbar-thin"
        onScroll={handleScroll}
      >
        {/* Log entries */}
        {filteredLogs.map((log, index) => (
          <LogItemComponent
            key={log.id}
            log={log}
            index={index}
            isTerminal={isTerminal}
            isAIMode={isAIMode}
            theme={theme}
            fontFamily={fontFamily}
            maxOutputLines={maxOutputLines}
            outputSearchQuery={outputSearchQuery}
            lastUserCommand={isTerminal && log.source !== 'user' ? getLastUserCommand(index) : undefined}
            isExpanded={expandedLogs.has(log.id)}
            onToggleExpanded={toggleExpanded}
            localFilterQuery={localFilters.get(log.id) || ''}
            filterMode={filterModes.get(log.id) || { mode: 'include', regex: false }}
            activeLocalFilter={activeLocalFilter}
            onToggleLocalFilter={toggleLocalFilter}
            onSetLocalFilterQuery={setLocalFilterQuery}
            onSetFilterMode={setFilterModeForLog}
            onClearLocalFilter={clearLocalFilter}
            deleteConfirmLogId={deleteConfirmLogId}
            onDeleteLog={onDeleteLog}
            onSetDeleteConfirmLogId={setDeleteConfirmLogId}
            scrollContainerRef={scrollContainerRef}
            setLightboxImage={setLightboxImage}
            copyToClipboard={copyToClipboard}
            speakText={speakText}
            stopSpeaking={stopSpeaking}
            speakingLogId={speakingLogId}
            audioFeedbackCommand={audioFeedbackCommand}
            ansiConverter={ansiConverter}
            markdownRawMode={markdownRawMode}
            onToggleMarkdownRawMode={toggleMarkdownRawMode}
          />
        ))}

        {/* Terminal busy indicator - only show for terminal commands (AI thinking moved to ThinkingStatusPill) */}
        {session.state === 'busy' && session.inputMode === 'terminal' && session.busySource === 'terminal' && (
          <div
            className="flex flex-col items-center justify-center gap-2 py-6 mx-6 my-4 rounded-xl border"
            style={{
              backgroundColor: theme.colors.bgActivity,
              borderColor: theme.colors.border
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: theme.colors.warning }}
              />
              <span className="text-sm" style={{ color: theme.colors.textMain }}>
                {session.statusMessage || 'Executing command...'}
              </span>
              {session.thinkingStartTime && (
                <ElapsedTimeDisplay
                  thinkingStartTime={session.thinkingStartTime}
                  textColor={theme.colors.textDim}
                />
              )}
            </div>
          </div>
        )}

        {/* Queued items section - only show in AI mode */}
        {session.inputMode === 'ai' && session.executionQueue && session.executionQueue.length > 0 && (
          <>
            {/* QUEUED separator */}
            <div className="mx-6 my-3 flex items-center gap-3">
              <div className="flex-1 h-px" style={{ backgroundColor: theme.colors.border }} />
              <span
                className="text-xs font-bold tracking-wider"
                style={{ color: theme.colors.warning }}
              >
                QUEUED ({session.executionQueue.length})
              </span>
              <div className="flex-1 h-px" style={{ backgroundColor: theme.colors.border }} />
            </div>

            {/* Queued items */}
            {session.executionQueue.map((item) => {
              const displayText = item.type === 'command' ? item.command : item.text || '';
              const isLongMessage = displayText.length > 200;
              const isQueuedExpanded = expandedQueuedMessages.has(item.id);

              return (
                <div
                  key={item.id}
                  className="mx-6 mb-2 p-3 rounded-lg opacity-60 relative group"
                  style={{
                    backgroundColor: item.type === 'command'
                      ? theme.colors.success + '20'
                      : theme.colors.accent + '20',
                    borderLeft: `3px solid ${item.type === 'command' ? theme.colors.success : theme.colors.accent}`
                  }}
                >
                  {/* Remove button */}
                  <button
                    onClick={() => setQueueRemoveConfirmId(item.id)}
                    className="absolute top-2 right-2 p-1 rounded hover:bg-black/20 transition-colors"
                    style={{ color: theme.colors.textDim }}
                    title="Remove from queue"
                  >
                    <X className="w-4 h-4" />
                  </button>

                  {/* Tab indicator */}
                  {item.tabName && (
                    <div
                      className="text-xs mb-1 font-mono"
                      style={{ color: theme.colors.textDim }}
                    >
                      → {item.tabName}
                    </div>
                  )}

                  {/* Item content */}
                  <div
                    className="text-sm pr-8 whitespace-pre-wrap break-words"
                    style={{ color: theme.colors.textMain }}
                  >
                    {item.type === 'command' && (
                      <span style={{ color: theme.colors.success, fontWeight: 600 }}>
                        {item.command}
                      </span>
                    )}
                    {item.type === 'message' && (
                      isLongMessage && !isQueuedExpanded
                        ? displayText.substring(0, 200) + '...'
                        : displayText
                    )}
                  </div>

                  {/* Show more/less toggle for long messages */}
                  {item.type === 'message' && isLongMessage && (
                    <button
                      onClick={() => {
                        setExpandedQueuedMessages(prev => {
                          const newSet = new Set(prev);
                          if (newSet.has(item.id)) {
                            newSet.delete(item.id);
                          } else {
                            newSet.add(item.id);
                          }
                          return newSet;
                        });
                      }}
                      className="flex items-center gap-1 mt-2 text-xs px-2 py-1 rounded hover:opacity-70 transition-opacity"
                      style={{
                        color: theme.colors.accent,
                        backgroundColor: theme.colors.bgActivity
                      }}
                    >
                      {isQueuedExpanded ? (
                        <>
                          <ChevronUp className="w-3 h-3" />
                          Show less
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3 h-3" />
                          Show all ({displayText.split('\n').length} lines)
                        </>
                      )}
                    </button>
                  )}

                  {/* Images indicator */}
                  {item.images && item.images.length > 0 && (
                    <div
                      className="mt-1 text-xs"
                      style={{ color: theme.colors.textDim }}
                    >
                      {item.images.length} image{item.images.length > 1 ? 's' : ''} attached
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* End ref for scrolling */}
        {session.state !== 'busy' && <div ref={logsEndRef} />}
      </div>

      {/* Queue removal confirmation modal - moved outside scroll container */}
      {queueRemoveConfirmId && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setQueueRemoveConfirmId(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (onRemoveQueuedItem) {
                onRemoveQueuedItem(queueRemoveConfirmId);
              }
              setQueueRemoveConfirmId(null);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setQueueRemoveConfirmId(null);
            }
          }}
        >
          <div
            className="p-4 rounded-lg shadow-xl max-w-md mx-4"
            style={{ backgroundColor: theme.colors.bgMain }}
            onClick={(e) => e.stopPropagation()}
            tabIndex={-1}
            ref={(el) => el?.focus()}
          >
            <h3 className="text-lg font-semibold mb-2" style={{ color: theme.colors.textMain }}>
              Remove Queued Message?
            </h3>
            <p className="text-sm mb-4" style={{ color: theme.colors.textDim }}>
              This message will be removed from the queue and will not be sent.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setQueueRemoveConfirmId(null)}
                className="px-3 py-1.5 rounded text-sm"
                style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.textMain }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (onRemoveQueuedItem) {
                    onRemoveQueuedItem(queueRemoveConfirmId);
                  }
                  setQueueRemoveConfirmId(null);
                }}
                className="px-3 py-1.5 rounded text-sm"
                style={{ backgroundColor: theme.colors.error, color: 'white' }}
                autoFocus
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Message Indicator - floating arrow button (AI mode only, terminal auto-scrolls) */}
      {hasNewMessages && !isAtBottom && session.inputMode === 'ai' && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-6 flex items-center gap-2 px-3 py-2 rounded-full shadow-lg transition-all hover:scale-105 z-20"
          style={{
            backgroundColor: theme.colors.accent,
            color: theme.colors.accentForeground,
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
          }}
          title="Scroll to new messages"
        >
          <ArrowDown className="w-4 h-4" />
          {newMessageCount > 0 && (
            <span className="text-xs font-bold">
              {newMessageCount > 99 ? '99+' : newMessageCount}
            </span>
          )}
        </button>
      )}

      {/* Copied to Clipboard Notification */}
      {showCopiedNotification && (
        <div
          className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 px-6 py-4 rounded-lg shadow-2xl text-base font-bold animate-in fade-in zoom-in-95 duration-200 z-50"
          style={{
            backgroundColor: theme.colors.accent,
            color: theme.colors.accentForeground,
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)'
          }}
        >
          Copied to Clipboard
        </div>
      )}
    </div>
  );
});

TerminalOutput.displayName = 'TerminalOutput';

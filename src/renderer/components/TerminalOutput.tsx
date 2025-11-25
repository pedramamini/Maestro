import React, { useRef, useEffect, useMemo, forwardRef, useState } from 'react';
import { Activity, X, ChevronDown, ChevronUp, Filter, PlusCircle, MinusCircle, Code } from 'lucide-react';
import type { Session, Theme, LogEntry } from '../types';
import Convert from 'ansi-to-html';
import DOMPurify from 'dompurify';
import { useLayerStack } from '../contexts/LayerStackContext';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';

interface TerminalOutputProps {
  session: Session;
  theme: Theme;
  activeFocus: string;
  outputSearchOpen: boolean;
  outputSearchQuery: string;
  setOutputSearchOpen: (open: boolean) => void;
  setOutputSearchQuery: (query: string) => void;
  setActiveFocus: (focus: string) => void;
  setLightboxImage: (image: string | null) => void;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  logsEndRef: React.RefObject<HTMLDivElement>;
  maxOutputLines: number;
}

export const TerminalOutput = forwardRef<HTMLDivElement, TerminalOutputProps>((props, ref) => {
  const {
    session, theme, activeFocus, outputSearchOpen, outputSearchQuery,
    setOutputSearchOpen, setOutputSearchQuery, setActiveFocus, setLightboxImage,
    inputRef, logsEndRef, maxOutputLines
  } = props;

  // Use the forwarded ref if provided, otherwise create a local one
  const terminalOutputRef = (ref as React.RefObject<HTMLDivElement>) || useRef<HTMLDivElement>(null);

  // Track which log entries are expanded (by log ID)
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  // Track local filters per log entry (log ID -> filter query)
  const [localFilters, setLocalFilters] = useState<Map<string, string>>(new Map());
  const [activeLocalFilter, setActiveLocalFilter] = useState<string | null>(null);

  // Track filter modes per log entry (log ID -> {mode: 'include'|'exclude', regex: boolean})
  const [filterModes, setFilterModes] = useState<Map<string, { mode: 'include' | 'exclude'; regex: boolean }>>(new Map());

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

  const toggleExpanded = (logId: string) => {
    setExpandedLogs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(logId)) {
        newSet.delete(logId);
      } else {
        newSet.add(logId);
      }
      return newSet;
    });
  };

  const toggleLocalFilter = (logId: string) => {
    if (activeLocalFilter === logId) {
      setActiveLocalFilter(null);
    } else {
      setActiveLocalFilter(logId);
    }
  };

  const setLocalFilterQuery = (logId: string, query: string) => {
    setLocalFilters(prev => {
      const newMap = new Map(prev);
      if (query) {
        newMap.set(logId, query);
      } else {
        newMap.delete(logId);
      }
      return newMap;
    });
  };

  // Helper function to highlight search matches in text
  const highlightMatches = (text: string, query: string): React.ReactNode => {
    if (!query) return text;

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let searchIndex = 0;

    while (searchIndex < lowerText.length) {
      const index = lowerText.indexOf(lowerQuery, searchIndex);
      if (index === -1) break;

      // Add text before match
      if (index > lastIndex) {
        parts.push(text.substring(lastIndex, index));
      }

      // Add highlighted match
      parts.push(
        <span
          key={`match-${index}`}
          style={{
            backgroundColor: theme.colors.warning,
            color: theme.mode === 'dark' ? '#000' : '#fff',
            padding: '1px 2px',
            borderRadius: '2px'
          }}
        >
          {text.substring(index, index + query.length)}
        </span>
      );

      lastIndex = index + query.length;
      searchIndex = lastIndex;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  // Helper function to add search highlighting markers to text (before ANSI conversion)
  // Uses special markers that survive ANSI-to-HTML conversion
  const addHighlightMarkers = (text: string, query: string): string => {
    if (!query) return text;

    let result = '';
    let lastIndex = 0;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let searchIndex = 0;

    while (searchIndex < lowerText.length) {
      const index = lowerText.indexOf(lowerQuery, searchIndex);
      if (index === -1) break;

      // Add text before match
      result += text.substring(lastIndex, index);

      // Add marked match with special tags
      result += `<mark style="background-color: ${theme.colors.warning}; color: ${theme.mode === 'dark' ? '#000' : '#fff'}; padding: 1px 2px; border-radius: 2px;">`;
      result += text.substring(index, index + query.length);
      result += '</mark>';

      lastIndex = index + query.length;
      searchIndex = lastIndex;
    }

    // Add remaining text
    result += text.substring(lastIndex);

    return result;
  };

  // Helper function to filter text by lines containing the query (local filter)
  const filterTextByLines = (text: string, query: string, mode: 'include' | 'exclude', useRegex: boolean): string => {
    if (!query) return text;

    const lines = text.split('\n');

    try {
      if (useRegex) {
        // Use regex matching
        const regex = new RegExp(query, 'i');
        const filteredLines = lines.filter(line => {
          const matches = regex.test(line);
          return mode === 'include' ? matches : !matches;
        });
        return filteredLines.join('\n');
      } else {
        // Use plain text matching
        const lowerQuery = query.toLowerCase();
        const filteredLines = lines.filter(line => {
          const matches = line.toLowerCase().includes(lowerQuery);
          return mode === 'include' ? matches : !matches;
        });
        return filteredLines.join('\n');
      }
    } catch (error) {
      // If regex is invalid, fall back to plain text matching
      const lowerQuery = query.toLowerCase();
      const filteredLines = lines.filter(line => {
        const matches = line.toLowerCase().includes(lowerQuery);
        return mode === 'include' ? matches : !matches;
      });
      return filteredLines.join('\n');
    }
  };

  // Helper function to separate stdout and stderr based on error indicators
  const separateStdoutStderr = (text: string): { stdout: string; stderr: string } => {
    const lines = text.split('\n');
    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];

    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      // Detect error lines by common patterns
      if (
        lowerLine.includes('error:') ||
        lowerLine.includes('error ') ||
        /\berror\b/i.test(line) && (lowerLine.includes('failed') || lowerLine.includes('exception') || lowerLine.includes('fatal')) ||
        lowerLine.includes('failed:') ||
        lowerLine.includes('failed ') ||
        lowerLine.includes('exception:') ||
        lowerLine.includes('fatal:') ||
        lowerLine.includes('panic:') ||
        lowerLine.startsWith('error') ||
        lowerLine.startsWith('fatal') ||
        /^\s*(error|fatal|exception|panic)/i.test(line)
      ) {
        stderrLines.push(line);
      } else if (line.trim()) {
        stdoutLines.push(line);
      }
    }

    return {
      stdout: stdoutLines.join('\n'),
      stderr: stderrLines.join('\n')
    };
  };

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

  // Filter out bash prompt lines and apply processing
  const processLogText = (text: string, isTerminal: boolean): string => {
    if (!isTerminal) return text;

    // Remove bash prompt lines (e.g., "bash-3.2$", "zsh%", "$", "#")
    const lines = text.split('\n');
    const filteredLines = lines.filter(line => {
      const trimmed = line.trim();
      // Skip empty lines and common prompt patterns
      if (!trimmed) return false;
      if (/^(bash-\d+\.\d+\$|zsh[%#]|\$|#)\s*$/.test(trimmed)) return false;
      return true;
    });

    return filteredLines.join('\n');
  };

  const activeLogs: LogEntry[] = session.inputMode === 'ai' ? session.aiLogs : session.shellLogs;

  return (
    <div
      ref={terminalOutputRef}
      tabIndex={0}
      className="flex-1 overflow-y-auto p-6 space-y-4 transition-colors outline-none relative"
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
        // Arrow key scrolling
        if (e.key === 'ArrowUp' && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          terminalOutputRef.current?.scrollBy({ top: -40, behavior: 'smooth' });
          return;
        }
        if (e.key === 'ArrowDown' && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          terminalOutputRef.current?.scrollBy({ top: 40, behavior: 'smooth' });
          return;
        }
        // Cmd+Up to jump to top
        if (e.key === 'ArrowUp' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          terminalOutputRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        // Cmd+Down to jump to bottom
        if (e.key === 'ArrowDown' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          terminalOutputRef.current?.scrollTo({ top: terminalOutputRef.current.scrollHeight, behavior: 'smooth' });
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
      {activeLogs.filter(log => {
        if (!outputSearchQuery) return true;
        return log.text.toLowerCase().includes(outputSearchQuery.toLowerCase());
      }).map((log, idx, filteredLogs) => {
        const isTerminal = session.inputMode === 'terminal';

        // Find the most recent user command before this log entry (for echo stripping)
        let lastUserCommand: string | undefined;
        if (isTerminal && log.source !== 'user') {
          for (let i = idx - 1; i >= 0; i--) {
            if (filteredLogs[i].source === 'user') {
              lastUserCommand = filteredLogs[i].text;
              break;
            }
          }
        }

        // Strip command echo from terminal output
        let textToProcess = log.text;
        if (isTerminal && log.source !== 'user' && lastUserCommand) {
          // Remove command echo from beginning of output
          if (textToProcess.startsWith(lastUserCommand)) {
            textToProcess = textToProcess.slice(lastUserCommand.length);
            // Remove newline after command
            if (textToProcess.startsWith('\r\n')) {
              textToProcess = textToProcess.slice(2);
            } else if (textToProcess.startsWith('\n') || textToProcess.startsWith('\r')) {
              textToProcess = textToProcess.slice(1);
            }
          }
        }

        const processedText = processLogText(textToProcess, isTerminal && log.source !== 'user');

        // Separate stdout and stderr for terminal output
        // If log.source is 'stderr', treat entire text as stderr
        // If log.source is 'stdout', use heuristic separation for legacy compatibility
        const separated = log.source === 'stderr'
          ? { stdout: '', stderr: processedText }
          : (isTerminal && log.source !== 'user')
            ? separateStdoutStderr(processedText)
            : { stdout: processedText, stderr: '' };

        // Apply local filter if active for this log entry
        const localFilterQuery = localFilters.get(log.id) || '';
        const filterMode = filterModes.get(log.id) || { mode: 'include', regex: false };
        const filteredStdout = localFilterQuery && log.source !== 'user'
          ? filterTextByLines(separated.stdout, localFilterQuery, filterMode.mode, filterMode.regex)
          : separated.stdout;
        const filteredStderr = localFilterQuery && log.source !== 'user'
          ? filterTextByLines(separated.stderr, localFilterQuery, filterMode.mode, filterMode.regex)
          : separated.stderr;

        // Check if filter returned no results
        const hasNoMatches = localFilterQuery && !filteredStdout.trim() && !filteredStderr.trim() && log.source !== 'user';

        // Apply search highlighting before ANSI conversion for terminal output
        const stdoutWithHighlights = isTerminal && log.source !== 'user' && outputSearchQuery
          ? addHighlightMarkers(filteredStdout, outputSearchQuery)
          : filteredStdout;
        const stderrWithHighlights = isTerminal && log.source !== 'user' && outputSearchQuery
          ? addHighlightMarkers(filteredStderr, outputSearchQuery)
          : filteredStderr;

        // Convert ANSI codes to HTML for terminal output and sanitize
        const stdoutHtmlContent = isTerminal && log.source !== 'user'
          ? DOMPurify.sanitize(ansiConverter.toHtml(stdoutWithHighlights))
          : filteredStdout;
        const stderrHtmlContent = isTerminal && log.source !== 'user' && filteredStderr
          ? DOMPurify.sanitize(ansiConverter.toHtml(stderrWithHighlights))
          : filteredStderr;

        // For non-terminal output, use the original logic
        const htmlContent = stdoutHtmlContent;
        const filteredText = filteredStdout;

        // Count lines in the filtered text
        const lineCount = filteredText.split('\n').length;
        const shouldCollapse = lineCount > maxOutputLines && maxOutputLines !== Infinity;
        const isExpanded = expandedLogs.has(log.id);

        // Truncate text if collapsed
        const displayText = shouldCollapse && !isExpanded
          ? filteredText.split('\n').slice(0, maxOutputLines).join('\n')
          : filteredText;

        // Apply highlighting to truncated text as well
        const displayTextWithHighlights = shouldCollapse && !isExpanded && isTerminal && log.source !== 'user' && outputSearchQuery
          ? addHighlightMarkers(displayText, outputSearchQuery)
          : displayText;

        const displayHtmlContent = shouldCollapse && !isExpanded && isTerminal && log.source !== 'user'
          ? DOMPurify.sanitize(ansiConverter.toHtml(displayTextWithHighlights))
          : htmlContent;

        return (
          <div key={log.id} className={`flex gap-4 group ${log.source === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className="w-12 shrink-0 text-[10px] opacity-40 pt-2 font-mono text-center">
              {new Date(log.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
            </div>
            <div className={`flex-1 p-4 rounded-xl border ${log.source === 'user' ? 'rounded-tr-none' : 'rounded-tl-none'} relative`}
                 style={{
                   backgroundColor: log.source === 'user'
                     ? `color-mix(in srgb, ${theme.colors.accent} 15%, ${theme.colors.bgActivity})`
                     : log.source === 'stderr'
                       ? `color-mix(in srgb, ${theme.colors.error} 8%, ${theme.colors.bgActivity})`
                       : 'transparent',
                   borderColor: log.source === 'stderr' ? theme.colors.error : theme.colors.border
                 }}>
              {/* Local filter icon for system output only */}
              {log.source !== 'user' && isTerminal && (
                <div className="absolute top-2 right-2 flex items-center gap-2">
                  {activeLocalFilter === log.id || localFilterQuery ? (
                    <div className="flex items-center gap-2 p-2 rounded border" style={{ backgroundColor: theme.colors.bgSidebar, borderColor: theme.colors.border }}>
                      {/* Include/Exclude Toggle */}
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setFilterModes(prev => {
                            const newMap = new Map(prev);
                            const current = newMap.get(log.id) || { mode: 'include', regex: false };
                            newMap.set(log.id, { ...current, mode: current.mode === 'include' ? 'exclude' : 'include' });
                            return newMap;
                          });
                        }}
                        className="p-1 rounded hover:opacity-70 transition-opacity"
                        style={{ color: filterMode.mode === 'include' ? theme.colors.success : theme.colors.error }}
                        title={filterMode.mode === 'include' ? 'Include matching lines' : 'Exclude matching lines'}
                      >
                        {filterMode.mode === 'include' ? <PlusCircle className="w-3.5 h-3.5" /> : <MinusCircle className="w-3.5 h-3.5" />}
                      </button>

                      {/* Regex Toggle */}
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setFilterModes(prev => {
                            const newMap = new Map(prev);
                            const current = newMap.get(log.id) || { mode: 'include', regex: false };
                            newMap.set(log.id, { ...current, regex: !current.regex });
                            return newMap;
                          });
                        }}
                        className="px-2 py-1 rounded hover:opacity-70 transition-opacity font-mono text-xs font-bold"
                        style={{ color: filterMode.regex ? theme.colors.accent : theme.colors.textDim }}
                        title={filterMode.regex ? 'Using regex' : 'Using plain text'}
                      >
                        {filterMode.regex ? '.*' : 'Aa'}
                      </button>

                      {/* Search Input */}
                      <input
                        type="text"
                        value={localFilterQuery}
                        onChange={(e) => setLocalFilterQuery(log.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.stopPropagation();
                            setActiveLocalFilter(null);
                            setLocalFilterQuery(log.id, '');
                            // Clear filter mode when clearing filter
                            setFilterModes(prev => {
                              const newMap = new Map(prev);
                              newMap.delete(log.id);
                              return newMap;
                            });
                          }
                        }}
                        onBlur={() => {
                          // Close filter input when clicking away, but only if empty
                          if (!localFilterQuery) {
                            setActiveLocalFilter(null);
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

                      {/* Close Button */}
                      <button
                        onClick={() => {
                          setActiveLocalFilter(null);
                          setLocalFilterQuery(log.id, '');
                          // Clear filter mode when closing
                          setFilterModes(prev => {
                            const newMap = new Map(prev);
                            newMap.delete(log.id);
                            return newMap;
                          });
                        }}
                        className="p-1 rounded hover:opacity-70 transition-opacity"
                        style={{ color: theme.colors.textDim }}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => toggleLocalFilter(log.id)}
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
                <div className="flex gap-2 mb-2 overflow-x-auto">
                  {log.images.map((img, idx) => (
                    <img key={idx} src={img} className="h-20 rounded border cursor-zoom-in" onClick={() => setLightboxImage(img)} />
                  ))}
                </div>
              )}
              {hasNoMatches ? (
                <div className="flex items-center justify-center py-8 text-sm" style={{ color: theme.colors.textDim }}>
                  <span>No matches found for filter</span>
                </div>
              ) : shouldCollapse && !isExpanded ? (
                <div>
                  <div
                    className={`${isTerminal && log.source !== 'user' ? 'whitespace-pre-wrap text-sm font-mono overflow-x-auto' : 'whitespace-pre-wrap text-sm'}`}
                    style={{
                      maxHeight: `${maxOutputLines * 1.5}em`,
                      overflow: 'hidden',
                      color: theme.colors.textMain
                    }}
                  >
                    {isTerminal && log.source !== 'user' ? (
                      <>
                        <div dangerouslySetInnerHTML={{ __html: displayHtmlContent }} />
                        {filteredStderr && (
                          <div className="mt-2 flex items-center gap-2 opacity-75">
                            <span
                              className="px-2 py-0.5 rounded text-xs font-semibold"
                              style={{
                                backgroundColor: `color-mix(in srgb, ${theme.colors.error} 20%, ${theme.colors.bgActivity})`,
                                color: theme.colors.error
                              }}
                            >
                              + stderr output
                            </span>
                          </div>
                        )}
                      </>
                    ) : (
                      displayText
                    )}
                  </div>
                  <button
                    onClick={() => toggleExpanded(log.id)}
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
                    className={`${isTerminal && log.source !== 'user' ? 'whitespace-pre-wrap text-sm font-mono overflow-x-auto' : 'whitespace-pre-wrap text-sm'}`}
                    style={{
                      maxHeight: '600px',
                      overflow: 'auto',
                      color: theme.colors.textMain
                    }}
                  >
                    {isTerminal && log.source !== 'user' ? (
                      <>
                        {/* Stdout section */}
                        {stdoutHtmlContent && (
                          <div dangerouslySetInnerHTML={{ __html: stdoutHtmlContent }} />
                        )}
                        {/* Stderr section with red label */}
                        {stderrHtmlContent && filteredStderr && (
                          <div className="mt-3 pt-3 border-t" style={{ borderColor: theme.colors.border }}>
                            <div className="flex items-center gap-2 mb-2">
                              <span
                                className="px-2 py-0.5 rounded text-xs font-semibold"
                                style={{
                                  backgroundColor: `color-mix(in srgb, ${theme.colors.error} 20%, ${theme.colors.bgActivity})`,
                                  color: theme.colors.error
                                }}
                              >
                                stderr
                              </span>
                            </div>
                            <div dangerouslySetInnerHTML={{ __html: stderrHtmlContent }} />
                          </div>
                        )}
                      </>
                    ) : log.source === 'user' && isTerminal ? (
                      <div className="font-mono">
                        <span style={{ color: theme.colors.accent }}>$ </span>
                        {highlightMatches(filteredText, outputSearchQuery)}
                      </div>
                    ) : (
                      <div>{highlightMatches(filteredText, outputSearchQuery)}</div>
                    )}
                  </div>
                  <button
                    onClick={() => toggleExpanded(log.id)}
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
                    <>
                      {/* Stdout section */}
                      {stdoutHtmlContent && (
                        <div
                          className="whitespace-pre-wrap text-sm font-mono overflow-x-auto"
                          dangerouslySetInnerHTML={{ __html: stdoutHtmlContent }}
                          style={{ color: theme.colors.textMain }}
                        />
                      )}
                      {/* Stderr section with red label */}
                      {stderrHtmlContent && filteredStderr && (
                        <div className="mt-3 pt-3 border-t" style={{ borderColor: theme.colors.border }}>
                          <div className="flex items-center gap-2 mb-2">
                            <span
                              className="px-2 py-0.5 rounded text-xs font-semibold"
                              style={{
                                backgroundColor: `color-mix(in srgb, ${theme.colors.error} 20%, ${theme.colors.bgActivity})`,
                                color: theme.colors.error
                              }}
                            >
                              stderr
                            </span>
                          </div>
                          <div
                            className="whitespace-pre-wrap text-sm font-mono overflow-x-auto"
                            dangerouslySetInnerHTML={{ __html: stderrHtmlContent }}
                            style={{ color: theme.colors.textMain }}
                          />
                        </div>
                      )}
                    </>
                  ) : log.source === 'user' && isTerminal ? (
                    <div className="whitespace-pre-wrap text-sm font-mono" style={{ color: theme.colors.textMain }}>
                      <span style={{ color: theme.colors.accent }}>$ </span>
                      {highlightMatches(filteredText, outputSearchQuery)}
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap text-sm" style={{ color: theme.colors.textMain }}>
                      {highlightMatches(filteredText, outputSearchQuery)}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
      {session.state === 'busy' && (
        <div className="flex items-center justify-center gap-2 text-xs opacity-50 animate-pulse py-4">
          <Activity className="w-4 h-4" />
          {session.inputMode === 'ai' ? 'Claude is thinking...' : 'Executing shell command...'}
        </div>
      )}
      <div ref={logsEndRef} />
    </div>
  );
});

TerminalOutput.displayName = 'TerminalOutput';

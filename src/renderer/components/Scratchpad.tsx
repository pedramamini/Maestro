import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Eye, Edit, Play, Square, HelpCircle, Loader2, Image, X, Search, ChevronUp, ChevronDown, ChevronRight } from 'lucide-react';
import type { BatchRunState, SessionState } from '../types';
import { AutoRunnerHelpModal } from './AutoRunnerHelpModal';
import { MermaidRenderer } from './MermaidRenderer';

interface ScratchpadProps {
  content: string;
  onChange: (content: string) => void;
  theme: any;
  sessionId: string; // Maestro session ID for per-session attachment storage
  initialMode?: 'edit' | 'preview';
  initialCursorPosition?: number;
  initialEditScrollPos?: number;
  initialPreviewScrollPos?: number;
  onStateChange?: (state: {
    mode: 'edit' | 'preview';
    cursorPosition: number;
    editScrollPos: number;
    previewScrollPos: number;
  }) => void;
  // Batch processing props
  batchRunState?: BatchRunState;
  onOpenBatchRunner?: () => void;
  onStopBatchRun?: () => void;
  // Session state for disabling Run when agent is busy
  sessionState?: SessionState;
}

// Cache for loaded images to avoid repeated IPC calls
const imageCache = new Map<string, string>();

// Custom image component that loads attachments from the session storage
function AttachmentImage({
  src,
  alt,
  sessionId,
  theme,
  onImageClick
}: {
  src?: string;
  alt?: string;
  sessionId: string;
  theme: any;
  onImageClick?: (dataUrl: string) => void;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!src) {
      setLoading(false);
      return;
    }

    // Check if this is an attachment reference (maestro-attachment://filename)
    if (src.startsWith('maestro-attachment://')) {
      const filename = src.replace('maestro-attachment://', '');
      const cacheKey = `${sessionId}:${filename}`;

      // Check cache first
      if (imageCache.has(cacheKey)) {
        setDataUrl(imageCache.get(cacheKey)!);
        setLoading(false);
        return;
      }

      // Load from attachment storage
      window.maestro.attachments.load(sessionId, filename).then(result => {
        if (result.success && result.dataUrl) {
          imageCache.set(cacheKey, result.dataUrl);
          setDataUrl(result.dataUrl);
        } else {
          setError(result.error || 'Failed to load image');
        }
        setLoading(false);
      });
    } else if (src.startsWith('data:')) {
      // Already a data URL
      setDataUrl(src);
      setLoading(false);
    } else {
      // External URL - just use it directly
      setDataUrl(src);
      setLoading(false);
    }
  }, [src, sessionId]);

  if (loading) {
    return (
      <div
        className="inline-flex items-center gap-2 px-3 py-2 rounded"
        style={{ backgroundColor: theme.colors.bgActivity }}
      >
        <Loader2 className="w-4 h-4 animate-spin" style={{ color: theme.colors.textDim }} />
        <span className="text-xs" style={{ color: theme.colors.textDim }}>Loading image...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="inline-flex items-center gap-2 px-3 py-2 rounded"
        style={{ backgroundColor: theme.colors.bgActivity, borderColor: theme.colors.error, border: '1px solid' }}
      >
        <Image className="w-4 h-4" style={{ color: theme.colors.error }} />
        <span className="text-xs" style={{ color: theme.colors.error }}>{error}</span>
      </div>
    );
  }

  if (!dataUrl) {
    return null;
  }

  return (
    <img
      src={dataUrl}
      alt={alt || ''}
      className="max-w-full h-auto rounded my-2 cursor-pointer hover:opacity-90 transition-opacity"
      style={{ maxHeight: '400px', objectFit: 'contain' }}
      onClick={() => onImageClick?.(dataUrl)}
    />
  );
}

// Component for displaying search-highlighted content using safe DOM methods
function SearchHighlightedContent({
  content,
  searchQuery,
  currentMatchIndex,
  theme
}: {
  content: string;
  searchQuery: string;
  currentMatchIndex: number;
  theme: any;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    // Clear existing content
    ref.current.textContent = '';

    if (!searchQuery.trim()) {
      ref.current.textContent = content;
      return;
    }

    const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    const parts = content.split(regex);
    let matchIndex = 0;

    parts.forEach((part) => {
      if (part.toLowerCase() === searchQuery.toLowerCase()) {
        // This is a match - create a highlighted mark element
        const mark = document.createElement('mark');
        mark.className = 'search-match';
        mark.textContent = part;
        mark.style.padding = '0 2px';
        mark.style.borderRadius = '2px';
        if (matchIndex === currentMatchIndex) {
          mark.style.backgroundColor = theme.colors.accent;
          mark.style.color = '#fff';
        } else {
          mark.style.backgroundColor = '#ffd700';
          mark.style.color = '#000';
        }
        ref.current!.appendChild(mark);
        matchIndex++;
      } else {
        // Regular text - create a text node
        ref.current!.appendChild(document.createTextNode(part));
      }
    });
  }, [content, searchQuery, currentMatchIndex, theme.colors.accent]);

  return (
    <div
      ref={ref}
      className="font-mono text-sm whitespace-pre-wrap"
      style={{ color: theme.colors.textMain }}
    />
  );
}

// Image preview thumbnail for staged images in edit mode
function ImagePreview({
  src,
  filename,
  theme,
  onRemove,
  onImageClick
}: {
  src: string;
  filename: string;
  theme: any;
  onRemove: () => void;
  onImageClick: (dataUrl: string) => void;
}) {
  return (
    <div
      className="relative inline-block group"
      style={{ margin: '4px' }}
    >
      <img
        src={src}
        alt={filename}
        className="w-20 h-20 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
        style={{ border: `1px solid ${theme.colors.border}` }}
        onClick={() => onImageClick(src)}
      />
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        style={{
          backgroundColor: theme.colors.error,
          color: 'white'
        }}
        title="Remove image"
      >
        <X className="w-3 h-3" />
      </button>
      <div
        className="absolute bottom-0 left-0 right-0 px-1 py-0.5 text-[9px] truncate rounded-b"
        style={{
          backgroundColor: 'rgba(0,0,0,0.6)',
          color: 'white'
        }}
      >
        {filename}
      </div>
    </div>
  );
}

export function Scratchpad({
  content,
  onChange,
  theme,
  sessionId,
  initialMode = 'edit',
  initialCursorPosition = 0,
  initialEditScrollPos = 0,
  initialPreviewScrollPos = 0,
  onStateChange,
  batchRunState,
  onOpenBatchRunner,
  onStopBatchRun,
  sessionState
}: ScratchpadProps) {
  const isLocked = batchRunState?.isRunning || false;
  const isAgentBusy = sessionState === 'busy' || sessionState === 'connecting';
  const isStopping = batchRunState?.isStopping || false;
  const [mode, setMode] = useState<'edit' | 'preview'>(initialMode);
  // Track mode before auto-run to restore when it ends
  const modeBeforeAutoRunRef = useRef<'edit' | 'preview' | null>(null);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [attachmentsList, setAttachmentsList] = useState<string[]>([]);
  const [attachmentPreviews, setAttachmentPreviews] = useState<Map<string, string>>(new Map());
  const [attachmentsExpanded, setAttachmentsExpanded] = useState(true);
  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const matchElementsRef = useRef<HTMLElement[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing attachments for this session
  useEffect(() => {
    if (sessionId) {
      window.maestro.attachments.list(sessionId).then(result => {
        if (result.success) {
          setAttachmentsList(result.files);
          // Load previews for existing attachments
          result.files.forEach(filename => {
            window.maestro.attachments.load(sessionId, filename).then(loadResult => {
              if (loadResult.success && loadResult.dataUrl) {
                setAttachmentPreviews(prev => new Map(prev).set(filename, loadResult.dataUrl!));
              }
            });
          });
        }
      });
    }
  }, [sessionId]);

  // Auto-switch to preview mode when auto-run starts, restore when it ends
  useEffect(() => {
    if (isLocked) {
      // Auto-run started: save current mode and switch to preview
      modeBeforeAutoRunRef.current = mode;
      if (mode !== 'preview') {
        setMode('preview');
      }
    } else if (modeBeforeAutoRunRef.current !== null) {
      // Auto-run ended: restore previous mode
      setMode(modeBeforeAutoRunRef.current);
      modeBeforeAutoRunRef.current = null;
    }
  }, [isLocked]);

  // Restore cursor and scroll positions when component mounts
  useEffect(() => {
    if (textareaRef.current && initialCursorPosition > 0) {
      textareaRef.current.setSelectionRange(initialCursorPosition, initialCursorPosition);
      textareaRef.current.scrollTop = initialEditScrollPos;
    }
    if (previewRef.current && initialPreviewScrollPos > 0) {
      previewRef.current.scrollTop = initialPreviewScrollPos;
    }
  }, []);

  // Notify parent when mode changes
  const toggleMode = () => {
    const newMode = mode === 'edit' ? 'preview' : 'edit';
    setMode(newMode);

    if (onStateChange) {
      onStateChange({
        mode: newMode,
        cursorPosition: textareaRef.current?.selectionStart || 0,
        editScrollPos: textareaRef.current?.scrollTop || 0,
        previewScrollPos: previewRef.current?.scrollTop || 0
      });
    }
  };

  // Auto-focus the active element after mode change
  useEffect(() => {
    if (mode === 'edit' && textareaRef.current) {
      textareaRef.current.focus();
    } else if (mode === 'preview' && previewRef.current) {
      previewRef.current.focus();
    }
  }, [mode]);

  // Save cursor position and scroll position when they change
  const handleCursorOrScrollChange = () => {
    if (onStateChange && textareaRef.current) {
      onStateChange({
        mode,
        cursorPosition: textareaRef.current.selectionStart,
        editScrollPos: textareaRef.current.scrollTop,
        previewScrollPos: previewRef.current?.scrollTop || 0
      });
    }
  };

  const handlePreviewScroll = () => {
    if (onStateChange && previewRef.current) {
      onStateChange({
        mode,
        cursorPosition: textareaRef.current?.selectionStart || 0,
        editScrollPos: textareaRef.current?.scrollTop || 0,
        previewScrollPos: previewRef.current.scrollTop
      });
    }
  };

  // Open search function
  const openSearch = useCallback(() => {
    setSearchOpen(true);
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }, []);

  // Close search function
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
    setCurrentMatchIndex(0);
    setTotalMatches(0);
    matchElementsRef.current = [];
    // Refocus appropriate element
    if (mode === 'edit' && textareaRef.current) {
      textareaRef.current.focus();
    } else if (mode === 'preview' && previewRef.current) {
      previewRef.current.focus();
    }
  }, [mode]);

  // Update match count when search query changes
  useEffect(() => {
    if (searchQuery.trim()) {
      const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapedQuery, 'gi');
      const matches = content.match(regex);
      const count = matches ? matches.length : 0;
      setTotalMatches(count);
      if (count > 0 && currentMatchIndex >= count) {
        setCurrentMatchIndex(0);
      }
    } else {
      setTotalMatches(0);
      setCurrentMatchIndex(0);
    }
  }, [searchQuery, content]);

  // Navigate to next search match
  const goToNextMatch = useCallback(() => {
    if (totalMatches === 0) return;
    const nextIndex = (currentMatchIndex + 1) % totalMatches;
    setCurrentMatchIndex(nextIndex);
  }, [currentMatchIndex, totalMatches]);

  // Navigate to previous search match
  const goToPrevMatch = useCallback(() => {
    if (totalMatches === 0) return;
    const prevIndex = (currentMatchIndex - 1 + totalMatches) % totalMatches;
    setCurrentMatchIndex(prevIndex);
  }, [currentMatchIndex, totalMatches]);

  // Scroll to current match
  useEffect(() => {
    if (!searchOpen || !searchQuery.trim() || totalMatches === 0) return;

    // Find the current match element and scroll to it
    const container = mode === 'edit' ? textareaRef.current : previewRef.current;
    if (!container) return;

    // For preview mode, find and scroll to the highlighted match
    if (mode === 'preview') {
      const marks = previewRef.current?.querySelectorAll('mark.search-match');
      if (marks && marks.length > 0 && currentMatchIndex >= 0 && currentMatchIndex < marks.length) {
        marks.forEach((mark, i) => {
          const el = mark as HTMLElement;
          if (i === currentMatchIndex) {
            el.style.backgroundColor = theme.colors.accent;
            el.style.color = '#fff';
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            el.style.backgroundColor = '#ffd700';
            el.style.color = '#000';
          }
        });
      }
    } else if (mode === 'edit') {
      // For edit mode, find the match position in the text and scroll
      const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapedQuery, 'gi');
      let matchCount = 0;
      let match;
      let matchPosition = -1;

      while ((match = regex.exec(content)) !== null) {
        if (matchCount === currentMatchIndex) {
          matchPosition = match.index;
          break;
        }
        matchCount++;
      }

      if (matchPosition >= 0 && textareaRef.current) {
        // Calculate approximate scroll position based on character position
        const textarea = textareaRef.current;
        const textBeforeMatch = content.substring(0, matchPosition);
        const lineCount = (textBeforeMatch.match(/\n/g) || []).length;
        const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 20;
        const scrollTarget = Math.max(0, lineCount * lineHeight - textarea.clientHeight / 2);
        textarea.scrollTop = scrollTarget;

        // Also select the match text
        textarea.setSelectionRange(matchPosition, matchPosition + searchQuery.length);
      }
    }
  }, [currentMatchIndex, searchOpen, searchQuery, totalMatches, mode, content, theme.colors.accent]);

  // Handle image paste
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    if (isLocked || !sessionId) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();

        const file = item.getAsFile();
        if (!file) continue;

        // Read as base64
        const reader = new FileReader();
        reader.onload = async (event) => {
          const base64Data = event.target?.result as string;
          if (!base64Data) return;

          // Generate unique filename
          const timestamp = Date.now();
          const extension = item.type.split('/')[1] || 'png';
          const filename = `image_${timestamp}.${extension}`;

          // Save to attachments
          const result = await window.maestro.attachments.save(sessionId, base64Data, filename);
          if (result.success && result.filename) {
            // Update attachments list
            setAttachmentsList(prev => [...prev, result.filename!]);
            setAttachmentPreviews(prev => new Map(prev).set(result.filename!, base64Data));

            // Insert markdown reference at cursor position
            const textarea = textareaRef.current;
            if (textarea) {
              const cursorPos = textarea.selectionStart;
              const textBefore = content.substring(0, cursorPos);
              const textAfter = content.substring(cursorPos);
              const imageMarkdown = `![${result.filename}](maestro-attachment://${result.filename})`;

              // Add newlines if not at start of line
              let prefix = '';
              let suffix = '';
              if (textBefore.length > 0 && !textBefore.endsWith('\n')) {
                prefix = '\n';
              }
              if (textAfter.length > 0 && !textAfter.startsWith('\n')) {
                suffix = '\n';
              }

              const newContent = textBefore + prefix + imageMarkdown + suffix + textAfter;
              onChange(newContent);

              // Move cursor after the inserted markdown
              const newCursorPos = cursorPos + prefix.length + imageMarkdown.length + suffix.length;
              setTimeout(() => {
                textarea.setSelectionRange(newCursorPos, newCursorPos);
                textarea.focus();
              }, 0);
            }
          }
        };
        reader.readAsDataURL(file);
        break; // Only handle first image
      }
    }
  }, [content, isLocked, onChange, sessionId]);

  // Handle file input for manual image upload
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !sessionId) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Data = event.target?.result as string;
      if (!base64Data) return;

      const timestamp = Date.now();
      const extension = file.name.split('.').pop() || 'png';
      const filename = `image_${timestamp}.${extension}`;

      const result = await window.maestro.attachments.save(sessionId, base64Data, filename);
      if (result.success && result.filename) {
        setAttachmentsList(prev => [...prev, result.filename!]);
        setAttachmentPreviews(prev => new Map(prev).set(result.filename!, base64Data));

        // Insert at end of content
        const imageMarkdown = `\n![${result.filename}](maestro-attachment://${result.filename})\n`;
        onChange(content + imageMarkdown);
      }
    };
    reader.readAsDataURL(file);

    // Reset input so same file can be selected again
    e.target.value = '';
  }, [content, onChange, sessionId]);

  // Handle removing an attachment
  const handleRemoveAttachment = useCallback(async (filename: string) => {
    if (!sessionId) return;

    await window.maestro.attachments.delete(sessionId, filename);
    setAttachmentsList(prev => prev.filter(f => f !== filename));
    setAttachmentPreviews(prev => {
      const newMap = new Map(prev);
      newMap.delete(filename);
      return newMap;
    });

    // Remove the markdown reference from content
    const regex = new RegExp(`!\\[${filename}\\]\\(maestro-attachment://${filename}\\)\\n?`, 'g');
    onChange(content.replace(regex, ''));

    // Clear from cache
    imageCache.delete(`${sessionId}:${filename}`);
  }, [content, onChange, sessionId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Command-E to toggle between edit and preview
    if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
      e.preventDefault();
      e.stopPropagation();
      toggleMode();
      return;
    }

    // Command-F to open search in edit mode
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      e.stopPropagation();
      openSearch();
      return;
    }

    // Command-L to insert a markdown checkbox
    if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
      e.preventDefault();
      e.stopPropagation();
      const textarea = e.currentTarget;
      const cursorPos = textarea.selectionStart;
      const textBeforeCursor = content.substring(0, cursorPos);
      const textAfterCursor = content.substring(cursorPos);

      // Check if we're at the start of a line or have text before
      const lastNewline = textBeforeCursor.lastIndexOf('\n');
      const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;
      const textOnCurrentLine = textBeforeCursor.substring(lineStart);

      let newContent: string;
      let newCursorPos: number;

      if (textOnCurrentLine.length === 0) {
        // At start of line, just insert checkbox
        newContent = textBeforeCursor + '- [ ] ' + textAfterCursor;
        newCursorPos = cursorPos + 6; // "- [ ] " is 6 chars
      } else {
        // In middle of line, insert newline then checkbox
        newContent = textBeforeCursor + '\n- [ ] ' + textAfterCursor;
        newCursorPos = cursorPos + 7; // "\n- [ ] " is 7 chars
      }

      onChange(newContent);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      const textarea = e.currentTarget;
      const cursorPos = textarea.selectionStart;
      const textBeforeCursor = content.substring(0, cursorPos);
      const textAfterCursor = content.substring(cursorPos);
      const currentLineStart = textBeforeCursor.lastIndexOf('\n') + 1;
      const currentLine = textBeforeCursor.substring(currentLineStart);

      // Check for list patterns
      const unorderedListMatch = currentLine.match(/^(\s*)([-*])\s+/);
      const orderedListMatch = currentLine.match(/^(\s*)(\d+)\.\s+/);
      const taskListMatch = currentLine.match(/^(\s*)- \[([ x])\]\s+/);

      if (taskListMatch) {
        // Task list: continue with unchecked checkbox
        const indent = taskListMatch[1];
        e.preventDefault();
        const newContent = textBeforeCursor + '\n' + indent + '- [ ] ' + textAfterCursor;
        onChange(newContent);
        setTimeout(() => {
          if (textareaRef.current) {
            const newPos = cursorPos + indent.length + 7; // "\n" + indent + "- [ ] "
            textareaRef.current.setSelectionRange(newPos, newPos);
          }
        }, 0);
      } else if (unorderedListMatch) {
        // Unordered list: continue with same marker
        const indent = unorderedListMatch[1];
        const marker = unorderedListMatch[2];
        e.preventDefault();
        const newContent = textBeforeCursor + '\n' + indent + marker + ' ' + textAfterCursor;
        onChange(newContent);
        setTimeout(() => {
          if (textareaRef.current) {
            const newPos = cursorPos + indent.length + 3; // "\n" + indent + marker + " "
            textareaRef.current.setSelectionRange(newPos, newPos);
          }
        }, 0);
      } else if (orderedListMatch) {
        // Ordered list: increment number
        const indent = orderedListMatch[1];
        const num = parseInt(orderedListMatch[2]);
        e.preventDefault();
        const newContent = textBeforeCursor + '\n' + indent + (num + 1) + '. ' + textAfterCursor;
        onChange(newContent);
        setTimeout(() => {
          if (textareaRef.current) {
            const newPos = cursorPos + indent.length + (num + 1).toString().length + 3; // "\n" + indent + num + ". "
            textareaRef.current.setSelectionRange(newPos, newPos);
          }
        }, 0);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className="h-full flex flex-col outline-none"
      tabIndex={-1}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
          e.preventDefault();
          toggleMode();
        }
        // CMD+F to open search (works in both modes from container)
        if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
          e.preventDefault();
          openSearch();
        }
      }}
    >
      {/* Mode Toggle */}
      <div className="flex gap-2 mb-3 justify-center pt-2">
        <button
          onClick={() => !isLocked && setMode('edit')}
          disabled={isLocked}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-colors ${
            mode === 'edit' ? 'font-semibold' : ''
          } ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
          style={{
            backgroundColor: mode === 'edit' ? theme.colors.bgActivity : 'transparent',
            color: mode === 'edit' ? theme.colors.textMain : theme.colors.textDim,
            border: `1px solid ${mode === 'edit' ? theme.colors.accent : theme.colors.border}`
          }}
        >
          <Edit className="w-3.5 h-3.5" />
          Edit
        </button>
        <button
          onClick={() => !isLocked && setMode('preview')}
          disabled={isLocked}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-colors ${
            mode === 'preview' ? 'font-semibold' : ''
          } ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
          style={{
            backgroundColor: mode === 'preview' ? theme.colors.bgActivity : 'transparent',
            color: mode === 'preview' ? theme.colors.textMain : theme.colors.textDim,
            border: `1px solid ${mode === 'preview' ? theme.colors.accent : theme.colors.border}`
          }}
        >
          <Eye className="w-3.5 h-3.5" />
          Preview
        </button>
        {/* Image upload button (edit mode only) */}
        {mode === 'edit' && !isLocked && (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-colors hover:opacity-80"
            style={{
              backgroundColor: 'transparent',
              color: theme.colors.textDim,
              border: `1px solid ${theme.colors.border}`
            }}
            title="Add image (or paste from clipboard)"
          >
            <Image className="w-3.5 h-3.5" />
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
        {/* Run / Stop button */}
        {isLocked ? (
          <button
            onClick={onStopBatchRun}
            disabled={isStopping}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-colors font-semibold ${isStopping ? 'opacity-50 cursor-not-allowed' : ''}`}
            style={{
              backgroundColor: theme.colors.error,
              color: 'white',
              border: `1px solid ${theme.colors.error}`
            }}
            title={isStopping ? 'Stopping after current task...' : 'Stop batch run'}
          >
            {isStopping ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Square className="w-3.5 h-3.5" />
            )}
            {isStopping ? 'Stopping...' : 'Stop'}
          </button>
        ) : (
          <button
            onClick={onOpenBatchRunner}
            disabled={isAgentBusy}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-colors ${isAgentBusy ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'}`}
            style={{
              backgroundColor: theme.colors.accent,
              color: 'white',
              border: `1px solid ${theme.colors.accent}`
            }}
            title={isAgentBusy ? "Cannot run while agent is thinking" : "Run batch processing on scratchpad tasks"}
          >
            <Play className="w-3.5 h-3.5" />
            Run
          </button>
        )}
        {/* Help button */}
        <button
          onClick={() => setHelpModalOpen(true)}
          className="flex items-center justify-center w-8 h-8 rounded-full transition-colors hover:bg-white/10"
          style={{ color: theme.colors.textDim }}
          title="Learn about Auto Runner"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>

      {/* Attached Images Preview (edit mode) */}
      {mode === 'edit' && attachmentsList.length > 0 && (
        <div
          className="px-2 py-2 mx-2 mb-2 rounded"
          style={{ backgroundColor: theme.colors.bgActivity }}
        >
          <button
            onClick={() => setAttachmentsExpanded(!attachmentsExpanded)}
            className="w-full flex items-center gap-1 text-[10px] uppercase font-semibold hover:opacity-80 transition-opacity"
            style={{ color: theme.colors.textDim }}
          >
            {attachmentsExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            Attached Images ({attachmentsList.length})
          </button>
          {attachmentsExpanded && (
            <div className="flex flex-wrap gap-1 mt-2">
              {attachmentsList.map(filename => (
                <ImagePreview
                  key={filename}
                  src={attachmentPreviews.get(filename) || ''}
                  filename={filename}
                  theme={theme}
                  onRemove={() => handleRemoveAttachment(filename)}
                  onImageClick={setLightboxImage}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search Bar */}
      {searchOpen && (
        <div
          className="mx-2 mb-2 flex items-center gap-2 px-3 py-2 rounded"
          style={{ backgroundColor: theme.colors.bgActivity, border: `1px solid ${theme.colors.accent}` }}
        >
          <Search className="w-4 h-4 shrink-0" style={{ color: theme.colors.accent }} />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closeSearch();
              } else if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                goToNextMatch();
              } else if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault();
                goToPrevMatch();
              }
            }}
            placeholder={mode === 'edit' ? "Search... (Enter: next, Shift+Enter: prev)" : "Search... (press '/' to open, Enter: next)"}
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: theme.colors.textMain }}
            autoFocus
          />
          {searchQuery.trim() && (
            <>
              <span className="text-xs whitespace-nowrap" style={{ color: theme.colors.textDim }}>
                {totalMatches > 0 ? `${currentMatchIndex + 1}/${totalMatches}` : 'No matches'}
              </span>
              <button
                onClick={goToPrevMatch}
                disabled={totalMatches === 0}
                className="p-1 rounded hover:bg-white/10 transition-colors disabled:opacity-30"
                style={{ color: theme.colors.textDim }}
                title="Previous match (Shift+Enter)"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                onClick={goToNextMatch}
                disabled={totalMatches === 0}
                className="p-1 rounded hover:bg-white/10 transition-colors disabled:opacity-30"
                style={{ color: theme.colors.textDim }}
                title="Next match (Enter)"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            onClick={closeSearch}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            style={{ color: theme.colors.textDim }}
            title="Close search (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {mode === 'edit' ? (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => !isLocked && onChange(e.target.value)}
            onKeyDown={!isLocked ? handleKeyDown : undefined}
            onKeyUp={handleCursorOrScrollChange}
            onClick={handleCursorOrScrollChange}
            onScroll={handleCursorOrScrollChange}
            onPaste={handlePaste}
            placeholder="Write your notes in markdown... (paste images from clipboard)"
            readOnly={isLocked}
            className={`w-full h-full border rounded p-4 bg-transparent outline-none resize-none font-mono text-sm ${isLocked ? 'cursor-not-allowed opacity-70' : ''}`}
            style={{
              borderColor: isLocked ? theme.colors.warning : theme.colors.border,
              color: theme.colors.textMain,
              backgroundColor: isLocked ? theme.colors.bgActivity + '30' : 'transparent'
            }}
          />
        ) : (
          <div
            ref={previewRef}
            className="h-full border rounded p-4 overflow-y-auto prose prose-sm max-w-none outline-none scrollbar-thin"
            tabIndex={0}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
                e.preventDefault();
                e.stopPropagation();
                toggleMode();
              }
              // '/' to open search in preview mode
              if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
                e.preventDefault();
                e.stopPropagation();
                openSearch();
              }
              // CMD+F to open search
              if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
                e.preventDefault();
                e.stopPropagation();
                openSearch();
              }
            }}
            onScroll={handlePreviewScroll}
            style={{
              borderColor: theme.colors.border,
              color: theme.colors.textMain,
              fontSize: '13px'
            }}
          >
            <style>{`
              .prose h1 { color: ${theme.colors.textMain}; font-size: 2em; font-weight: bold; margin: 0.67em 0; }
              .prose h2 { color: ${theme.colors.textMain}; font-size: 1.5em; font-weight: bold; margin: 0.75em 0; }
              .prose h3 { color: ${theme.colors.textMain}; font-size: 1.17em; font-weight: bold; margin: 0.83em 0; }
              .prose h4 { color: ${theme.colors.textMain}; font-size: 1em; font-weight: bold; margin: 1em 0; }
              .prose h5 { color: ${theme.colors.textMain}; font-size: 0.83em; font-weight: bold; margin: 1.17em 0; }
              .prose h6 { color: ${theme.colors.textMain}; font-size: 0.67em; font-weight: bold; margin: 1.33em 0; }
              .prose p { color: ${theme.colors.textMain}; margin: 0.5em 0; }
              .prose ul, .prose ol { color: ${theme.colors.textMain}; margin: 0.5em 0; padding-left: 1.5em; }
              .prose ul { list-style-type: disc; }
              .prose ol { list-style-type: decimal; }
              .prose li { margin: 0.25em 0; display: list-item; }
              .prose li::marker { color: ${theme.colors.textMain}; }
              .prose code { background-color: ${theme.colors.bgActivity}; color: ${theme.colors.textMain}; padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em; }
              .prose pre { background-color: ${theme.colors.bgActivity}; color: ${theme.colors.textMain}; padding: 1em; border-radius: 6px; overflow-x: auto; }
              .prose pre code { background: none; padding: 0; }
              .prose blockquote { border-left: 4px solid ${theme.colors.border}; padding-left: 1em; margin: 0.5em 0; color: ${theme.colors.textDim}; }
              .prose a { color: ${theme.colors.accent}; text-decoration: underline; }
              .prose hr { border: none; border-top: 2px solid ${theme.colors.border}; margin: 1em 0; }
              .prose table { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
              .prose th, .prose td { border: 1px solid ${theme.colors.border}; padding: 0.5em; text-align: left; }
              .prose th { background-color: ${theme.colors.bgActivity}; font-weight: bold; }
              .prose strong { font-weight: bold; }
              .prose em { font-style: italic; }
              .prose input[type="checkbox"] {
                appearance: none;
                -webkit-appearance: none;
                width: 16px;
                height: 16px;
                border: 2px solid ${theme.colors.accent};
                border-radius: 3px;
                background-color: transparent;
                cursor: pointer;
                vertical-align: middle;
                margin-right: 8px;
                position: relative;
              }
              .prose input[type="checkbox"]:checked {
                background-color: ${theme.colors.accent};
                border-color: ${theme.colors.accent};
              }
              .prose input[type="checkbox"]:checked::after {
                content: '';
                position: absolute;
                left: 4px;
                top: 1px;
                width: 5px;
                height: 9px;
                border: solid ${theme.colors.bgMain};
                border-width: 0 2px 2px 0;
                transform: rotate(45deg);
              }
              .prose input[type="checkbox"]:hover {
                border-color: ${theme.colors.highlight};
                box-shadow: 0 0 4px ${theme.colors.accent}40;
              }
              .prose li:has(> input[type="checkbox"]) {
                list-style-type: none;
                margin-left: -1.5em;
              }
            `}</style>
            {searchOpen && searchQuery.trim() ? (
              // When searching, show raw text with highlights for easy search navigation
              <SearchHighlightedContent
                content={content || '*No content yet.*'}
                searchQuery={searchQuery}
                currentMatchIndex={currentMatchIndex}
                theme={theme}
              />
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code: ({ node, inline, className, children, ...props }: any) => {
                    const match = (className || '').match(/language-(\w+)/);
                    const language = match ? match[1] : 'text';
                    const codeContent = String(children).replace(/\n$/, '');

                    // Handle mermaid code blocks
                    if (!inline && language === 'mermaid') {
                      return <MermaidRenderer chart={codeContent} theme={theme} />;
                    }

                    return !inline && match ? (
                      <SyntaxHighlighter
                        language={language}
                        style={vscDarkPlus}
                        customStyle={{
                          margin: '0.5em 0',
                          padding: '1em',
                          background: theme.colors.bgActivity,
                          fontSize: '0.9em',
                          borderRadius: '6px',
                        }}
                        PreTag="div"
                      >
                        {codeContent}
                      </SyntaxHighlighter>
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  },
                  img: ({ src, alt, ...props }: any) => (
                    <AttachmentImage
                      src={src}
                      alt={alt}
                      sessionId={sessionId}
                      theme={theme}
                      onImageClick={setLightboxImage}
                      {...props}
                    />
                  )
                }}
              >
                {content || '*No content yet. Switch to Edit mode to start writing.*'}
              </ReactMarkdown>
            )}
          </div>
        )}
      </div>

      {/* Help Modal */}
      {helpModalOpen && (
        <AutoRunnerHelpModal
          theme={theme}
          onClose={() => setHelpModalOpen(false)}
        />
      )}

      {/* Lightbox for viewing images */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <img
              src={lightboxImage}
              alt="Preview"
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
            />
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center bg-black/50 hover:bg-black/70 transition-colors"
              style={{ color: 'white' }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

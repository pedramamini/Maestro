import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Eye, Edit, Play, Square, HelpCircle, Loader2, Image, X, Search, ChevronUp, ChevronDown, ChevronRight, ChevronLeft, Copy, Check, Trash2, FolderOpen, FileText, RefreshCw } from 'lucide-react';
import type { BatchRunState, SessionState, Theme } from '../types';
import { AutoRunnerHelpModal } from './AutoRunnerHelpModal';
import { MermaidRenderer } from './MermaidRenderer';
import { AutoRunDocumentSelector } from './AutoRunDocumentSelector';

// Memoize remarkPlugins array - it never changes
const REMARK_PLUGINS = [remarkGfm];

interface AutoRunProps {
  theme: Theme;
  sessionId: string; // Maestro session ID for per-session attachment storage

  // Folder & document state
  folderPath: string | null;
  selectedFile: string | null;
  documentList: string[];  // Filenames without .md
  documentTree?: Array<{ name: string; type: 'file' | 'folder'; path: string; children?: unknown[] }>;  // Tree structure for subfolders

  // Content state
  content: string;
  onContentChange: (content: string) => void;

  // Mode state
  mode: 'edit' | 'preview';
  onModeChange: (mode: 'edit' | 'preview') => void;

  // Scroll/cursor state
  initialCursorPosition?: number;
  initialEditScrollPos?: number;
  initialPreviewScrollPos?: number;
  onStateChange?: (state: {
    mode: 'edit' | 'preview';
    cursorPosition: number;
    editScrollPos: number;
    previewScrollPos: number;
  }) => void;

  // Actions
  onOpenSetup: () => void;
  onRefresh: () => void;
  onSelectDocument: (filename: string) => void;
  onCreateDocument: (filename: string) => Promise<boolean>;
  isLoadingDocuments?: boolean;

  // Batch processing props
  batchRunState?: BatchRunState;
  onOpenBatchRunner?: () => void;
  onStopBatchRun?: () => void;

  // Session state for disabling Run when agent is busy
  sessionState?: SessionState;

  // Legacy prop for backwards compatibility
  onChange?: (content: string) => void;
}

// Cache for loaded images to avoid repeated IPC calls
const imageCache = new Map<string, string>();

// Undo/Redo state interface
interface UndoState {
  content: string;
  cursorPosition: number;
}

// Maximum undo history entries per document
const MAX_UNDO_HISTORY = 50;

// Custom image component that loads images from the Auto Run folder or external URLs
function AttachmentImage({
  src,
  alt,
  folderPath,
  theme,
  onImageClick
}: {
  src?: string;
  alt?: string;
  folderPath: string | null;
  theme: any;
  onImageClick?: (filename: string) => void;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filename, setFilename] = useState<string | null>(null);

  useEffect(() => {
    if (!src) {
      setLoading(false);
      return;
    }

    // Check if this is a relative path (e.g., images/{docName}-{timestamp}.{ext})
    if (src.startsWith('images/') && folderPath) {
      const fname = src.split('/').pop() || src;
      setFilename(fname);
      const cacheKey = `${folderPath}:${src}`;

      // Check cache first
      if (imageCache.has(cacheKey)) {
        setDataUrl(imageCache.get(cacheKey)!);
        setLoading(false);
        return;
      }

      // Load from folder using absolute path
      const absolutePath = `${folderPath}/${src}`;
      window.maestro.fs.readFile(absolutePath)
        .then((result) => {
          if (result.startsWith('data:')) {
            imageCache.set(cacheKey, result);
            setDataUrl(result);
          } else {
            setError('Invalid image data');
          }
          setLoading(false);
        })
        .catch((err) => {
          setError(`Failed to load image: ${err.message || 'Unknown error'}`);
          setLoading(false);
        });
    } else if (src.startsWith('data:')) {
      // Already a data URL
      setDataUrl(src);
      setFilename(null);
      setLoading(false);
    } else if (src.startsWith('http://') || src.startsWith('https://')) {
      // External URL - just use it directly
      setDataUrl(src);
      setFilename(null);
      setLoading(false);
    } else if (src.startsWith('/')) {
      // Absolute file path - load via IPC
      setFilename(src.split('/').pop() || null);
      window.maestro.fs.readFile(src)
        .then((result) => {
          if (result.startsWith('data:')) {
            setDataUrl(result);
          } else {
            setError('Invalid image data');
          }
          setLoading(false);
        })
        .catch((err) => {
          setError(`Failed to load image: ${err.message || 'Unknown error'}`);
          setLoading(false);
        });
    } else {
      // Other relative path - try to load as file from folderPath if available
      setFilename(src.split('/').pop() || null);
      const pathToLoad = folderPath ? `${folderPath}/${src}` : src;
      window.maestro.fs.readFile(pathToLoad)
        .then((result) => {
          if (result.startsWith('data:')) {
            setDataUrl(result);
          } else {
            setError('Invalid image data');
          }
          setLoading(false);
        })
        .catch((err) => {
          setError(`Failed to load image: ${err.message || 'Unknown error'}`);
          setLoading(false);
        });
    }
  }, [src, folderPath]);

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
    <span
      className="inline-block align-middle mx-1 my-1 cursor-pointer group relative"
      onClick={() => onImageClick?.(filename || src || '')}
      title={filename ? `Click to enlarge: ${filename}` : 'Click to enlarge'}
    >
      <img
        src={dataUrl}
        alt={alt || ''}
        className="rounded border hover:opacity-90 transition-all hover:shadow-lg"
        style={{
          maxHeight: '120px',
          maxWidth: '200px',
          objectFit: 'contain',
          borderColor: theme.colors.border,
        }}
      />
      {/* Zoom hint overlay */}
      <span
        className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded"
        style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      >
        <Search className="w-5 h-5 text-white" />
      </span>
    </span>
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
  onImageClick: (filename: string) => void;
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
        onClick={() => onImageClick(filename)}
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

// Inner implementation component
function AutoRunInner({
  theme,
  sessionId,
  folderPath,
  selectedFile,
  documentList,
  documentTree,
  content,
  onContentChange,
  mode: externalMode,
  onModeChange,
  initialCursorPosition = 0,
  initialEditScrollPos = 0,
  initialPreviewScrollPos = 0,
  onStateChange,
  onOpenSetup,
  onRefresh,
  onSelectDocument,
  onCreateDocument,
  isLoadingDocuments = false,
  batchRunState,
  onOpenBatchRunner,
  onStopBatchRun,
  sessionState,
  onChange,  // Legacy prop for backwards compatibility
}: AutoRunProps) {
  const isLocked = batchRunState?.isRunning || false;
  const isAgentBusy = sessionState === 'busy' || sessionState === 'connecting';
  const isStopping = batchRunState?.isStopping || false;

  // Use external mode if provided, otherwise use local state
  const [localMode, setLocalMode] = useState<'edit' | 'preview'>(externalMode || 'edit');
  const mode = externalMode || localMode;
  const setMode = useCallback((newMode: 'edit' | 'preview') => {
    if (onModeChange) {
      onModeChange(newMode);
    } else {
      setLocalMode(newMode);
    }
  }, [onModeChange]);

  // Use onContentChange if provided, otherwise fall back to legacy onChange
  const handleContentChange = onContentChange || onChange || (() => {});

  // Local content state for responsive typing - syncs to parent on blur
  const [localContent, setLocalContent] = useState(content);
  const prevSessionIdRef = useRef(sessionId);
  // Track if user is actively editing (to avoid overwriting their changes)
  const isEditingRef = useRef(false);

  // Auto-save timer ref for 5-second debounce
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track the last saved content to avoid unnecessary saves
  const lastSavedContentRef = useRef<string>(content);

  // Undo/Redo history maps - keyed by document filename (selectedFile)
  // Using refs so history persists across re-renders without triggering re-renders
  const undoHistoryRef = useRef<Map<string, UndoState[]>>(new Map());
  const redoHistoryRef = useRef<Map<string, UndoState[]>>(new Map());
  // Track last content that was snapshotted for undo
  const lastUndoSnapshotRef = useRef<string>(content);
  // Timer ref for debounced undo snapshots
  const undoSnapshotTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Push current state to undo history (call BEFORE making changes)
  const pushUndoState = useCallback((contentToSnapshot?: string, cursorPos?: number) => {
    if (!selectedFile) return;

    const snapshotContent = contentToSnapshot ?? localContent;
    const snapshotCursor = cursorPos ?? textareaRef.current?.selectionStart ?? 0;

    // Only push if content actually differs from last snapshot
    if (snapshotContent === lastUndoSnapshotRef.current) return;

    const currentState: UndoState = {
      content: snapshotContent,
      cursorPosition: snapshotCursor,
    };

    // Get or create history array for this document
    const history = undoHistoryRef.current.get(selectedFile) || [];
    history.push(currentState);

    // Limit to MAX_UNDO_HISTORY entries
    if (history.length > MAX_UNDO_HISTORY) {
      history.shift();
    }

    undoHistoryRef.current.set(selectedFile, history);

    // Update last snapshot reference
    lastUndoSnapshotRef.current = snapshotContent;

    // Clear redo stack on new edit action
    redoHistoryRef.current.set(selectedFile, []);
  }, [selectedFile, localContent]);

  // Schedule a debounced undo snapshot (called on each content change)
  const scheduleUndoSnapshot = useCallback((previousContent: string, previousCursor: number) => {
    // Clear any pending snapshot
    if (undoSnapshotTimeoutRef.current) {
      clearTimeout(undoSnapshotTimeoutRef.current);
    }

    // Schedule snapshot after 1 second of inactivity
    undoSnapshotTimeoutRef.current = setTimeout(() => {
      pushUndoState(previousContent, previousCursor);
    }, 1000);
  }, [pushUndoState]);

  // Handle undo (Cmd+Z)
  const handleUndo = useCallback(() => {
    if (!selectedFile) return;

    const undoStack = undoHistoryRef.current.get(selectedFile) || [];
    if (undoStack.length === 0) return;

    // Save current state to redo stack before undoing
    const redoStack = redoHistoryRef.current.get(selectedFile) || [];
    redoStack.push({
      content: localContent,
      cursorPosition: textareaRef.current?.selectionStart || 0,
    });
    redoHistoryRef.current.set(selectedFile, redoStack);

    // Pop and apply the undo state
    const prevState = undoStack.pop()!;
    undoHistoryRef.current.set(selectedFile, undoStack);

    // Update content without pushing to undo stack
    setLocalContent(prevState.content);
    lastUndoSnapshotRef.current = prevState.content;

    // Restore cursor position after React re-renders
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.setSelectionRange(prevState.cursorPosition, prevState.cursorPosition);
        textareaRef.current.focus();
      }
    });
  }, [selectedFile, localContent]);

  // Handle redo (Cmd+Shift+Z)
  const handleRedo = useCallback(() => {
    if (!selectedFile) return;

    const redoStack = redoHistoryRef.current.get(selectedFile) || [];
    if (redoStack.length === 0) return;

    // Save current state to undo stack before redoing
    const undoStack = undoHistoryRef.current.get(selectedFile) || [];
    undoStack.push({
      content: localContent,
      cursorPosition: textareaRef.current?.selectionStart || 0,
    });
    undoHistoryRef.current.set(selectedFile, undoStack);

    // Pop and apply the redo state
    const nextState = redoStack.pop()!;
    redoHistoryRef.current.set(selectedFile, redoStack);

    // Update content without pushing to undo stack
    setLocalContent(nextState.content);
    lastUndoSnapshotRef.current = nextState.content;

    // Restore cursor position after React re-renders
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.setSelectionRange(nextState.cursorPosition, nextState.cursorPosition);
        textareaRef.current.focus();
      }
    });
  }, [selectedFile, localContent]);

  // Sync local content from prop when session changes (switching sessions)
  useEffect(() => {
    if (sessionId !== prevSessionIdRef.current) {
      // Reset editing flag so content can sync properly when returning to this session
      isEditingRef.current = false;
      setLocalContent(content);
      prevSessionIdRef.current = sessionId;
    }
  }, [sessionId, content]);

  // Also sync if content changes externally (e.g., batch run modifying tasks)
  // But only when we're not actively editing (avoid fighting with user input)
  useEffect(() => {
    if (!isEditingRef.current && content !== localContent) {
      setLocalContent(content);
    }
  }, [content]);

  // Sync local content to parent on blur
  const syncContentToParent = useCallback(() => {
    isEditingRef.current = false;
    if (localContent !== content) {
      handleContentChange(localContent);
    }
  }, [localContent, content, handleContentChange]);

  // Auto-save to disk with 5-second debounce
  useEffect(() => {
    // Only save if we have a folder and selected file
    if (!folderPath || !selectedFile) return;

    // Never auto-save empty content - this prevents wiping files during load
    if (!localContent) return;

    // Only save if content has actually changed from last saved
    if (localContent === lastSavedContentRef.current) return;

    // Clear any existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Schedule save after 5 seconds of inactivity
    autoSaveTimeoutRef.current = setTimeout(async () => {
      // Double-check content hasn't been externally synced
      if (localContent !== lastSavedContentRef.current) {
        try {
          await window.maestro.autorun.writeDoc(folderPath, selectedFile + '.md', localContent);
          lastSavedContentRef.current = localContent;
          // Also sync to parent state so UI stays consistent
          handleContentChange(localContent);
        } catch (err) {
          console.error('Auto-save failed:', err);
        }
      }
    }, 5000);

    // Cleanup on unmount or when dependencies change
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [localContent, folderPath, selectedFile, handleContentChange]);

  // Clear auto-save timer and update lastSavedContent when document changes (session or file change)
  useEffect(() => {
    // Clear pending auto-save when document changes
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
    // Clear pending undo snapshot when document changes
    if (undoSnapshotTimeoutRef.current) {
      clearTimeout(undoSnapshotTimeoutRef.current);
      undoSnapshotTimeoutRef.current = null;
    }
    // Reset lastSavedContent to the new content
    lastSavedContentRef.current = content;
    // Reset lastUndoSnapshot to the new content (so first edit creates a proper undo point)
    lastUndoSnapshotRef.current = content;
  }, [selectedFile, sessionId, content]);

  // Track mode before auto-run to restore when it ends
  const modeBeforeAutoRunRef = useRef<'edit' | 'preview' | null>(null);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  // Lightbox state: stores the filename/URL of the currently viewed image (null = closed)
  const [lightboxFilename, setLightboxFilename] = useState<string | null>(null);
  // For external URLs, store the direct URL separately (attachments use attachmentPreviews)
  const [lightboxExternalUrl, setLightboxExternalUrl] = useState<string | null>(null);
  const [lightboxCopied, setLightboxCopied] = useState(false);
  const [attachmentsList, setAttachmentsList] = useState<string[]>([]);
  const [attachmentPreviews, setAttachmentPreviews] = useState<Map<string, string>>(new Map());
  const [attachmentsExpanded, setAttachmentsExpanded] = useState(true);
  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const matchElementsRef = useRef<HTMLElement[]>([]);
  // Refresh animation state for empty state button
  const [isRefreshingEmpty, setIsRefreshingEmpty] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Track scroll positions in refs to preserve across re-renders
  const previewScrollPosRef = useRef(initialPreviewScrollPos);
  const editScrollPosRef = useRef(initialEditScrollPos);

  // Load existing images for the current document from the Auto Run folder
  useEffect(() => {
    if (folderPath && selectedFile) {
      window.maestro.autorun.listImages(folderPath, selectedFile).then((result: { success: boolean; images?: { filename: string; relativePath: string }[]; error?: string }) => {
        if (result.success && result.images) {
          // Store relative paths (e.g., "images/{docName}-{timestamp}.{ext}")
          const relativePaths = result.images.map((img: { filename: string; relativePath: string }) => img.relativePath);
          setAttachmentsList(relativePaths);
          // Load previews for existing images
          result.images.forEach((img: { filename: string; relativePath: string }) => {
            const absolutePath = `${folderPath}/${img.relativePath}`;
            window.maestro.fs.readFile(absolutePath).then(dataUrl => {
              if (dataUrl.startsWith('data:')) {
                setAttachmentPreviews(prev => new Map(prev).set(img.relativePath, dataUrl));
              }
            }).catch(() => {
              // Image file might be missing, ignore
            });
          });
        }
      });
    } else {
      // Clear attachments when no document is selected
      setAttachmentsList([]);
      setAttachmentPreviews(new Map());
    }
  }, [folderPath, selectedFile]);

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

  // Restore scroll position after content changes cause ReactMarkdown to rebuild DOM
  // useLayoutEffect runs synchronously after DOM mutations but before paint
  useLayoutEffect(() => {
    if (mode === 'preview' && previewRef.current && previewScrollPosRef.current > 0) {
      // Use requestAnimationFrame to ensure DOM is fully updated
      requestAnimationFrame(() => {
        if (previewRef.current) {
          previewRef.current.scrollTop = previewScrollPosRef.current;
        }
      });
    }
  }, [localContent, mode, searchOpen, searchQuery]);

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

  // Track previous selectedFile to detect document changes
  const prevSelectedFileRef = useRef(selectedFile);
  // Track previous content to detect when content prop actually changes
  const prevContentRef = useRef(content);

  // Handle document selection change - focus and reset editing state
  useEffect(() => {
    if (!selectedFile) return;

    const isNewDocument = selectedFile !== prevSelectedFileRef.current;
    prevSelectedFileRef.current = selectedFile;

    if (isNewDocument) {
      // Reset editing flag so content syncs properly for new document
      isEditingRef.current = false;
      // Reset lastSavedContent to prevent auto-save from firing with stale comparison
      lastSavedContentRef.current = content;
      // Focus on document change
      requestAnimationFrame(() => {
        if (mode === 'edit' && textareaRef.current) {
          textareaRef.current.focus();
        } else if (mode === 'preview' && previewRef.current) {
          previewRef.current.focus();
        }
      });
    }
  }, [selectedFile, content, mode]);

  // Sync content from prop - only when content prop actually changes
  useEffect(() => {
    // Skip if no document selected
    if (!selectedFile) return;

    // Only sync when the content PROP actually changed (not just a re-render)
    const contentPropChanged = content !== prevContentRef.current;
    prevContentRef.current = content;

    if (!contentPropChanged) return;

    // Skip if user is actively editing - don't overwrite their changes
    if (isEditingRef.current) return;

    // Content prop changed - sync to local state
    setLocalContent(content);
    // Update lastSavedContent so auto-save knows this is the baseline
    lastSavedContentRef.current = content;
  }, [selectedFile, content]);

  // Save cursor position and scroll position when they change
  const handleCursorOrScrollChange = () => {
    if (textareaRef.current) {
      // Save to ref for persistence across re-renders
      editScrollPosRef.current = textareaRef.current.scrollTop;
      if (onStateChange) {
        onStateChange({
          mode,
          cursorPosition: textareaRef.current.selectionStart,
          editScrollPos: textareaRef.current.scrollTop,
          previewScrollPos: previewRef.current?.scrollTop || 0
        });
      }
    }
  };

  const handlePreviewScroll = () => {
    if (previewRef.current) {
      // Save to ref for persistence across re-renders
      previewScrollPosRef.current = previewRef.current.scrollTop;
      if (onStateChange) {
        onStateChange({
          mode,
          cursorPosition: textareaRef.current?.selectionStart || 0,
          editScrollPos: textareaRef.current?.scrollTop || 0,
          previewScrollPos: previewRef.current.scrollTop
        });
      }
    }
  };

  // Handle refresh for empty state with animation
  const handleEmptyStateRefresh = useCallback(async () => {
    setIsRefreshingEmpty(true);
    try {
      await onRefresh();
    } finally {
      // Keep spinner visible for at least 500ms for visual feedback
      setTimeout(() => setIsRefreshingEmpty(false), 500);
    }
  }, [onRefresh]);

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
      const matches = localContent.match(regex);
      const count = matches ? matches.length : 0;
      setTotalMatches(count);
      if (count > 0 && currentMatchIndex >= count) {
        setCurrentMatchIndex(0);
      }
    } else {
      setTotalMatches(0);
      setCurrentMatchIndex(0);
    }
  }, [searchQuery, localContent]);

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

      while ((match = regex.exec(localContent)) !== null) {
        if (matchCount === currentMatchIndex) {
          matchPosition = match.index;
          break;
        }
        matchCount++;
      }

      if (matchPosition >= 0 && textareaRef.current) {
        // Calculate approximate scroll position based on character position
        const textarea = textareaRef.current;
        const textBeforeMatch = localContent.substring(0, matchPosition);
        const lineCount = (textBeforeMatch.match(/\n/g) || []).length;
        const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 20;
        const scrollTarget = Math.max(0, lineCount * lineHeight - textarea.clientHeight / 2);
        textarea.scrollTop = scrollTarget;

        // Also select the match text
        textarea.setSelectionRange(matchPosition, matchPosition + searchQuery.length);
      }
    }
  }, [currentMatchIndex, searchOpen, searchQuery, totalMatches, mode, localContent, theme.colors.accent]);

  // Handle image paste
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    if (isLocked || !folderPath || !selectedFile) {
      console.log('[AutoRun] Paste blocked:', { isLocked, folderPath, selectedFile });
      return;
    }

    const items = e.clipboardData?.items;
    if (!items) {
      console.log('[AutoRun] No clipboard items');
      return;
    }

    console.log('[AutoRun] Clipboard items:', items.length);
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      console.log('[AutoRun] Item', i, ':', item.type);
      if (item.type.startsWith('image/')) {
        e.preventDefault();

        const file = item.getAsFile();
        if (!file) {
          console.log('[AutoRun] Could not get file from item');
          continue;
        }

        console.log('[AutoRun] Processing image:', file.name, file.type, file.size);

        // Read as base64
        const reader = new FileReader();
        reader.onload = async (event) => {
          const base64Data = event.target?.result as string;
          if (!base64Data) {
            console.log('[AutoRun] No base64 data');
            return;
          }

          // Extract the base64 content without the data URL prefix
          const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, '');
          const extension = item.type.split('/')[1] || 'png';

          console.log('[AutoRun] Saving image to:', folderPath, 'doc:', selectedFile, 'ext:', extension);

          // Save to Auto Run folder using the new API
          const result = await window.maestro.autorun.saveImage(folderPath, selectedFile, base64Content, extension);
          console.log('[AutoRun] Save result:', result);
          if (result.success && result.relativePath) {
            // Update attachments list with the relative path
            const filename = result.relativePath.split('/').pop() || result.relativePath;
            setAttachmentsList(prev => [...prev, result.relativePath!]);
            setAttachmentPreviews(prev => new Map(prev).set(result.relativePath!, base64Data));

            // Insert markdown reference at cursor position using relative path
            const textarea = textareaRef.current;
            if (textarea) {
              const cursorPos = textarea.selectionStart;
              const textBefore = localContent.substring(0, cursorPos);
              const textAfter = localContent.substring(cursorPos);
              const imageMarkdown = `![${filename}](${result.relativePath})`;

              // Push undo state before modifying content
              pushUndoState();

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
              // Update local state and sync to parent immediately for explicit user action
              setLocalContent(newContent);
              handleContentChange(newContent);
              lastUndoSnapshotRef.current = newContent;

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
  }, [localContent, isLocked, handleContentChange, folderPath, selectedFile, pushUndoState]);

  // Handle file input for manual image upload
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !folderPath || !selectedFile) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Data = event.target?.result as string;
      if (!base64Data) return;

      // Extract the base64 content without the data URL prefix
      const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, '');
      const extension = file.name.split('.').pop() || 'png';

      // Save to Auto Run folder using the new API
      const result = await window.maestro.autorun.saveImage(folderPath, selectedFile, base64Content, extension);
      if (result.success && result.relativePath) {
        const filename = result.relativePath.split('/').pop() || result.relativePath;
        setAttachmentsList(prev => [...prev, result.relativePath!]);
        setAttachmentPreviews(prev => new Map(prev).set(result.relativePath!, base64Data));

        // Push undo state before modifying content
        pushUndoState();

        // Insert at end of content - update local and sync to parent immediately
        const imageMarkdown = `\n![${filename}](${result.relativePath})\n`;
        const newContent = localContent + imageMarkdown;
        setLocalContent(newContent);
        handleContentChange(newContent);
        lastUndoSnapshotRef.current = newContent;
      }
    };
    reader.readAsDataURL(file);

    // Reset input so same file can be selected again
    e.target.value = '';
  }, [localContent, handleContentChange, folderPath, selectedFile, pushUndoState]);

  // Handle removing an attachment (relativePath is like "images/{docName}-{timestamp}.{ext}")
  const handleRemoveAttachment = useCallback(async (relativePath: string) => {
    if (!folderPath) return;

    // Delete the image file
    await window.maestro.autorun.deleteImage(folderPath, relativePath);
    setAttachmentsList(prev => prev.filter(f => f !== relativePath));
    setAttachmentPreviews(prev => {
      const newMap = new Map(prev);
      newMap.delete(relativePath);
      return newMap;
    });

    // Push undo state before modifying content
    pushUndoState();

    // Extract just the filename for the alt text pattern
    const filename = relativePath.split('/').pop() || relativePath;
    // Remove the markdown reference from content - update local and sync to parent immediately
    // Match both the full relative path and just filename in the alt text
    const escapedPath = relativePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedFilename = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`!\\[${escapedFilename}\\]\\(${escapedPath}\\)\\n?`, 'g');
    const newContent = localContent.replace(regex, '');
    setLocalContent(newContent);
    handleContentChange(newContent);
    lastUndoSnapshotRef.current = newContent;

    // Clear from cache
    imageCache.delete(`${folderPath}:${relativePath}`);
  }, [localContent, handleContentChange, folderPath, pushUndoState]);

  // Lightbox helpers - handles both attachment filenames and external URLs
  const openLightboxByFilename = useCallback((filenameOrUrl: string) => {
    // Check if it's an external URL (http/https/data:)
    if (filenameOrUrl.startsWith('http://') || filenameOrUrl.startsWith('https://') || filenameOrUrl.startsWith('data:')) {
      setLightboxExternalUrl(filenameOrUrl);
      setLightboxFilename(filenameOrUrl); // Use URL as display name
    } else {
      // It's an attachment filename
      setLightboxExternalUrl(null);
      setLightboxFilename(filenameOrUrl);
    }
    setLightboxCopied(false);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxFilename(null);
    setLightboxExternalUrl(null);
    setLightboxCopied(false);
  }, []);

  const lightboxCurrentIndex = lightboxFilename ? attachmentsList.indexOf(lightboxFilename) : -1;
  const canNavigateLightbox = attachmentsList.length > 1;

  const goToPrevImage = useCallback(() => {
    if (canNavigateLightbox && lightboxCurrentIndex > 0) {
      setLightboxFilename(attachmentsList[lightboxCurrentIndex - 1]);
      setLightboxCopied(false);
    }
  }, [canNavigateLightbox, lightboxCurrentIndex, attachmentsList]);

  const goToNextImage = useCallback(() => {
    if (canNavigateLightbox && lightboxCurrentIndex < attachmentsList.length - 1) {
      setLightboxFilename(attachmentsList[lightboxCurrentIndex + 1]);
      setLightboxCopied(false);
    }
  }, [canNavigateLightbox, lightboxCurrentIndex, attachmentsList]);

  const copyLightboxImageToClipboard = useCallback(async () => {
    if (!lightboxFilename) return;

    // Get image URL from external URL or attachment previews
    const imageUrl = lightboxExternalUrl || attachmentPreviews.get(lightboxFilename);
    if (!imageUrl) return;

    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ]);
      setLightboxCopied(true);
      setTimeout(() => setLightboxCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy image to clipboard:', err);
    }
  }, [lightboxFilename, lightboxExternalUrl, attachmentPreviews]);

  const deleteLightboxImage = useCallback(async () => {
    if (!lightboxFilename || !folderPath) return;

    // Store the current index before deletion
    const currentIndex = lightboxCurrentIndex;
    const totalImages = attachmentsList.length;

    // Delete the image file using autorun API
    await window.maestro.autorun.deleteImage(folderPath, lightboxFilename);
    setAttachmentsList(prev => prev.filter(f => f !== lightboxFilename));
    setAttachmentPreviews(prev => {
      const newMap = new Map(prev);
      newMap.delete(lightboxFilename);
      return newMap;
    });

    // Push undo state before modifying content
    pushUndoState();

    // Extract just the filename for the alt text pattern
    const filename = lightboxFilename.split('/').pop() || lightboxFilename;
    // Remove the markdown reference from content - update local and sync to parent immediately
    const escapedPath = lightboxFilename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedFilename = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`!\\[${escapedFilename}\\]\\(${escapedPath}\\)\\n?`, 'g');
    const newContent = localContent.replace(regex, '');
    setLocalContent(newContent);
    handleContentChange(newContent);
    lastUndoSnapshotRef.current = newContent;

    // Clear from cache
    imageCache.delete(`${folderPath}:${lightboxFilename}`);

    // Navigate to next/prev image or close lightbox
    if (totalImages <= 1) {
      // No more images, close lightbox
      closeLightbox();
    } else if (currentIndex >= totalImages - 1) {
      // Was last image, go to previous
      const newList = attachmentsList.filter(f => f !== lightboxFilename);
      setLightboxFilename(newList[newList.length - 1] || null);
    } else {
      // Go to next image (same index in new list)
      const newList = attachmentsList.filter(f => f !== lightboxFilename);
      setLightboxFilename(newList[currentIndex] || null);
    }
  }, [lightboxFilename, lightboxCurrentIndex, attachmentsList, folderPath, localContent, handleContentChange, closeLightbox, pushUndoState]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd+Z to undo, Cmd+Shift+Z to redo
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) {
        handleRedo();
      } else {
        handleUndo();
      }
      return;
    }

    // Command-E to toggle between edit and preview
    if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
      e.preventDefault();
      e.stopPropagation();
      toggleMode();
      return;
    }

    // Command-F to open search in edit mode (without Shift)
    // Cmd+Shift+F is allowed to propagate to the global handler for "Go to Files"
    if ((e.metaKey || e.ctrlKey) && e.key === 'f' && !e.shiftKey) {
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
      const textBeforeCursor = localContent.substring(0, cursorPos);
      const textAfterCursor = localContent.substring(cursorPos);

      // Push undo state before modifying content
      pushUndoState();

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

      setLocalContent(newContent);
      // Update lastUndoSnapshot since we pushed state explicitly
      lastUndoSnapshotRef.current = newContent;
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
      const textBeforeCursor = localContent.substring(0, cursorPos);
      const textAfterCursor = localContent.substring(cursorPos);
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
        // Push undo state before modifying content
        pushUndoState();
        const newContent = textBeforeCursor + '\n' + indent + '- [ ] ' + textAfterCursor;
        setLocalContent(newContent);
        lastUndoSnapshotRef.current = newContent;
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
        // Push undo state before modifying content
        pushUndoState();
        const newContent = textBeforeCursor + '\n' + indent + marker + ' ' + textAfterCursor;
        setLocalContent(newContent);
        lastUndoSnapshotRef.current = newContent;
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
        // Push undo state before modifying content
        pushUndoState();
        const newContent = textBeforeCursor + '\n' + indent + (num + 1) + '. ' + textAfterCursor;
        setLocalContent(newContent);
        lastUndoSnapshotRef.current = newContent;
        setTimeout(() => {
          if (textareaRef.current) {
            const newPos = cursorPos + indent.length + (num + 1).toString().length + 3; // "\n" + indent + num + ". "
            textareaRef.current.setSelectionRange(newPos, newPos);
          }
        }, 0);
      }
    }
  };

  // Memoize prose CSS styles - only regenerate when theme changes
  const proseStyles = useMemo(() => `
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
    .prose li:has(> input[type="checkbox"]) { list-style: none; margin-left: -1.5em; }
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
  `, [theme]);

  // Memoize ReactMarkdown components - only regenerate when dependencies change
  const markdownComponents = useMemo(() => ({
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
        folderPath={folderPath}
        theme={theme}
        onImageClick={openLightboxByFilename}
        {...props}
      />
    )
  }), [theme, folderPath, openLightboxByFilename]);

  return (
    <div
      ref={containerRef}
      className="h-full flex flex-col outline-none relative"
      tabIndex={-1}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
          e.preventDefault();
          e.stopPropagation();
          toggleMode();
        }
        // CMD+F to open search (works in both modes from container)
        // Only intercept Cmd+F (without Shift) - let Cmd+Shift+F propagate to global "Go to Files" handler
        if ((e.metaKey || e.ctrlKey) && e.key === 'f' && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          openSearch();
        }
      }}
    >
      {/* Select Folder Button - shown when no folder is configured */}
      {!folderPath && (
        <div className="pt-2 flex justify-center">
          <button
            onClick={onOpenSetup}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors hover:opacity-90"
            style={{
              backgroundColor: theme.colors.accent,
              color: theme.colors.accentForeground,
            }}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Select Auto Run Folder
          </button>
        </div>
      )}

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
            onClick={() => {
              // Sync local content to parent before opening batch runner
              // This ensures Run uses the latest edits, not stale content
              syncContentToParent();
              onOpenBatchRunner?.();
            }}
            disabled={isAgentBusy}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-colors ${isAgentBusy ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'}`}
            style={{
              backgroundColor: theme.colors.accent,
              color: theme.colors.accentForeground,
              border: `1px solid ${theme.colors.accent}`
            }}
            title={isAgentBusy ? "Cannot run while agent is thinking" : "Run batch processing on Auto Run tasks"}
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

      {/* Document Selector */}
      {folderPath && (
        <div className="px-2 mb-2">
          <AutoRunDocumentSelector
            theme={theme}
            documents={documentList}
            documentTree={documentTree as import('./AutoRunDocumentSelector').DocTreeNode[] | undefined}
            selectedDocument={selectedFile}
            onSelectDocument={onSelectDocument}
            onRefresh={onRefresh}
            onChangeFolder={onOpenSetup}
            onCreateDocument={onCreateDocument}
            isLoading={isLoadingDocuments}
          />
        </div>
      )}

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
                  onImageClick={openLightboxByFilename}
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
            placeholder={mode === 'edit' ? "Search... (⌘F to open, Enter: next, Shift+Enter: prev)" : "Search... (/ to open, Enter: next, Shift+Enter: prev)"}
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
      <div className="flex-1 min-h-0">
        {/* Empty folder state - show when folder is configured but has no documents */}
        {folderPath && documentList.length === 0 && !isLoadingDocuments ? (
          <div
            className="h-full flex flex-col items-center justify-center text-center px-6"
            style={{ color: theme.colors.textDim }}
          >
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: theme.colors.bgActivity }}
            >
              <FileText className="w-8 h-8" style={{ color: theme.colors.textDim }} />
            </div>
            <h3
              className="text-lg font-semibold mb-2"
              style={{ color: theme.colors.textMain }}
            >
              No Documents Found
            </h3>
            <p className="mb-4 max-w-xs text-sm">
              The selected folder doesn't contain any markdown (.md) files.
            </p>
            <p className="mb-6 max-w-xs text-xs" style={{ color: theme.colors.textDim }}>
              Create a markdown file in the folder to get started, or select a different folder.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleEmptyStateRefresh}
                className="flex items-center gap-2 px-4 py-2 rounded text-sm transition-colors hover:opacity-90"
                style={{
                  backgroundColor: 'transparent',
                  color: theme.colors.textMain,
                  border: `1px solid ${theme.colors.border}`,
                }}
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshingEmpty ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={onOpenSetup}
                className="flex items-center gap-2 px-4 py-2 rounded text-sm transition-colors hover:opacity-90"
                style={{
                  backgroundColor: theme.colors.accent,
                  color: theme.colors.accentForeground,
                }}
              >
                <FolderOpen className="w-4 h-4" />
                Change Folder
              </button>
            </div>
          </div>
        ) : mode === 'edit' ? (
          <textarea
            ref={textareaRef}
            value={localContent}
            onChange={(e) => {
              if (!isLocked) {
                isEditingRef.current = true;
                // Schedule undo snapshot with current content before the change
                const previousContent = localContent;
                const previousCursor = textareaRef.current?.selectionStart || 0;
                setLocalContent(e.target.value);
                scheduleUndoSnapshot(previousContent, previousCursor);
              }
            }}
            onFocus={() => { isEditingRef.current = true; }}
            onBlur={syncContentToParent}
            onKeyDown={!isLocked ? handleKeyDown : undefined}
            onPaste={handlePaste}
            placeholder="Capture notes, images, and tasks in Markdown."
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
              // '/' to open search in preview mode (mutually exclusive with Cmd+F in edit mode)
              if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
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
            <style>{proseStyles}</style>
            {searchOpen && searchQuery.trim() ? (
              // When searching, show raw text with highlights for easy search navigation
              <SearchHighlightedContent
                content={localContent || '*No content yet.*'}
                searchQuery={searchQuery}
                currentMatchIndex={currentMatchIndex}
                theme={theme}
              />
            ) : (
              <ReactMarkdown
                remarkPlugins={REMARK_PLUGINS}
                components={markdownComponents}
              >
                {localContent || '*No content yet. Switch to Edit mode to start writing.*'}
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

      {/* Lightbox for viewing images with navigation, copy, and delete */}
      {lightboxFilename && (lightboxExternalUrl || attachmentPreviews.get(lightboxFilename)) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={closeLightbox}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') { e.preventDefault(); closeLightbox(); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); goToPrevImage(); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); goToNextImage(); }
            else if (e.key === 'Delete' || e.key === 'Backspace') {
              e.preventDefault();
              // Only allow delete for attachments, not external URLs
              if (!lightboxExternalUrl) deleteLightboxImage();
            }
          }}
          tabIndex={-1}
          ref={(el) => el?.focus()}
        >
          {/* Previous button - only for attachments carousel */}
          {!lightboxExternalUrl && canNavigateLightbox && lightboxCurrentIndex > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); goToPrevImage(); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white rounded-full p-3 backdrop-blur-sm transition-colors"
              title="Previous image (←)"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

          {/* Image */}
          <img
            src={lightboxExternalUrl || attachmentPreviews.get(lightboxFilename)}
            alt={lightboxFilename}
            className="max-w-[90%] max-h-[90%] rounded shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Top right buttons: Copy and Delete */}
          <div className="absolute top-4 right-4 flex gap-2">
            {/* Copy to clipboard */}
            <button
              onClick={(e) => { e.stopPropagation(); copyLightboxImageToClipboard(); }}
              className="bg-white/10 hover:bg-white/20 text-white rounded-full p-3 backdrop-blur-sm transition-colors flex items-center gap-2"
              title="Copy image to clipboard"
            >
              {lightboxCopied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
              {lightboxCopied && <span className="text-sm">Copied!</span>}
            </button>

            {/* Delete image - only for attachments, not external URLs */}
            {!lightboxExternalUrl && (
              <button
                onClick={(e) => { e.stopPropagation(); deleteLightboxImage(); }}
                className="bg-red-500/80 hover:bg-red-500 text-white rounded-full p-3 backdrop-blur-sm transition-colors"
                title="Delete image (Delete key)"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}

            {/* Close button */}
            <button
              onClick={(e) => { e.stopPropagation(); closeLightbox(); }}
              className="bg-white/10 hover:bg-white/20 text-white rounded-full p-3 backdrop-blur-sm transition-colors"
              title="Close (ESC)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Next button - only for attachments carousel */}
          {!lightboxExternalUrl && canNavigateLightbox && lightboxCurrentIndex < attachmentsList.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); goToNextImage(); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white rounded-full p-3 backdrop-blur-sm transition-colors"
              title="Next image (→)"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}

          {/* Bottom info */}
          <div className="absolute bottom-10 text-white text-sm opacity-70 text-center max-w-[80%]">
            <div className="truncate">{lightboxFilename}</div>
            <div className="mt-1">
              {!lightboxExternalUrl && canNavigateLightbox ? `Image ${lightboxCurrentIndex + 1} of ${attachmentsList.length} • ← → to navigate • ` : ''}
              {!lightboxExternalUrl ? 'Delete to remove • ' : ''}ESC to close
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Memoized AutoRun component with custom comparison to prevent unnecessary re-renders
export const AutoRun = memo(AutoRunInner, (prevProps, nextProps) => {
  // Only re-render when these specific props actually change
  return (
    prevProps.content === nextProps.content &&
    prevProps.sessionId === nextProps.sessionId &&
    prevProps.mode === nextProps.mode &&
    prevProps.theme === nextProps.theme &&
    // Document state
    prevProps.folderPath === nextProps.folderPath &&
    prevProps.selectedFile === nextProps.selectedFile &&
    prevProps.documentList === nextProps.documentList &&
    prevProps.isLoadingDocuments === nextProps.isLoadingDocuments &&
    // Compare batch run state values, not object reference
    prevProps.batchRunState?.isRunning === nextProps.batchRunState?.isRunning &&
    prevProps.batchRunState?.isStopping === nextProps.batchRunState?.isStopping &&
    prevProps.batchRunState?.currentTaskIndex === nextProps.batchRunState?.currentTaskIndex &&
    prevProps.batchRunState?.totalTasks === nextProps.batchRunState?.totalTasks &&
    // Session state affects UI (busy disables Run button)
    prevProps.sessionState === nextProps.sessionState &&
    // Callbacks are typically stable, but check identity
    prevProps.onContentChange === nextProps.onContentChange &&
    prevProps.onModeChange === nextProps.onModeChange &&
    prevProps.onStateChange === nextProps.onStateChange &&
    prevProps.onOpenBatchRunner === nextProps.onOpenBatchRunner &&
    prevProps.onStopBatchRun === nextProps.onStopBatchRun &&
    prevProps.onOpenSetup === nextProps.onOpenSetup &&
    prevProps.onRefresh === nextProps.onRefresh &&
    prevProps.onSelectDocument === nextProps.onSelectDocument
    // Note: initialCursorPosition, initialEditScrollPos, initialPreviewScrollPos
    // are intentionally NOT compared - they're only used on mount
  );
});

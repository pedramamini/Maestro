import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { FileCode, X, Copy, FileText, Eye, ChevronUp, ChevronDown, Clipboard, Loader2, Image } from 'lucide-react';
import { visit } from 'unist-util-visit';
import { useLayerStack } from '../contexts/LayerStackContext';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';
import { MermaidRenderer } from './MermaidRenderer';

interface FileStats {
  size: number;
  createdAt: string;
  modifiedAt: string;
}

interface FilePreviewProps {
  file: { name: string; content: string; path: string } | null;
  onClose: () => void;
  theme: any;
  markdownRawMode: boolean;
  setMarkdownRawMode: (value: boolean) => void;
  shortcuts: Record<string, any>;
}

// Get language from filename extension
const getLanguageFromFilename = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    'ts': 'typescript',
    'tsx': 'tsx',
    'js': 'javascript',
    'jsx': 'jsx',
    'json': 'json',
    'md': 'markdown',
    'py': 'python',
    'rb': 'ruby',
    'go': 'go',
    'rs': 'rust',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'cs': 'csharp',
    'php': 'php',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'sql': 'sql',
    'sh': 'bash',
    'yaml': 'yaml',
    'yml': 'yaml',
    'toml': 'toml',
    'xml': 'xml',
  };
  return languageMap[ext || ''] || 'text';
};

// Check if file is an image
const isImageFile = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase();
  const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico'];
  return imageExtensions.includes(ext || '');
};

// Format file size in human-readable format
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

// Format date/time for display
const formatDateTime = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Helper to resolve image path relative to markdown file directory
const resolveImagePath = (src: string, markdownFilePath: string): string => {
  // If it's already a data URL or http(s) URL, return as-is
  if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://')) {
    return src;
  }

  // Get the directory containing the markdown file
  const markdownDir = markdownFilePath.substring(0, markdownFilePath.lastIndexOf('/'));

  // If the path is absolute, return as-is
  if (src.startsWith('/')) {
    return src;
  }

  // Resolve relative path
  // Handle ./ prefix
  let relativePath = src;
  if (relativePath.startsWith('./')) {
    relativePath = relativePath.substring(2);
  }

  // Simple path resolution (handles ../ by just concatenating - the file system will resolve it)
  return `${markdownDir}/${relativePath}`;
};

// Custom image component for markdown that loads images from file paths
function MarkdownImage({
  src,
  alt,
  markdownFilePath,
  theme
}: {
  src?: string;
  alt?: string;
  markdownFilePath: string;
  theme: any;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!src) {
      setLoading(false);
      return;
    }

    // If it's already a data URL, use it directly
    if (src.startsWith('data:')) {
      setDataUrl(src);
      setLoading(false);
      return;
    }

    // If it's an HTTP(S) URL, use it directly
    if (src.startsWith('http://') || src.startsWith('https://')) {
      setDataUrl(src);
      setLoading(false);
      return;
    }

    // Resolve the path relative to the markdown file
    const resolvedPath = resolveImagePath(src, markdownFilePath);

    // Load the image via IPC
    window.maestro.fs.readFile(resolvedPath)
      .then((result) => {
        // readFile returns a data URL for images
        if (result.startsWith('data:')) {
          setDataUrl(result);
        } else {
          // If it's not a data URL, something went wrong
          setError('Invalid image data');
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(`Failed to load image: ${err.message || 'Unknown error'}`);
        setLoading(false);
      });
  }, [src, markdownFilePath]);

  if (loading) {
    return (
      <span
        className="inline-flex items-center gap-2 px-3 py-2 rounded"
        style={{ backgroundColor: theme.colors.bgActivity }}
      >
        <Loader2 className="w-4 h-4 animate-spin" style={{ color: theme.colors.textDim }} />
        <span className="text-xs" style={{ color: theme.colors.textDim }}>Loading image...</span>
      </span>
    );
  }

  if (error) {
    return (
      <span
        className="inline-flex items-center gap-2 px-3 py-2 rounded"
        style={{ backgroundColor: theme.colors.bgActivity, border: `1px solid ${theme.colors.error}` }}
      >
        <Image className="w-4 h-4" style={{ color: theme.colors.error }} />
        <span className="text-xs" style={{ color: theme.colors.error }}>{error}</span>
      </span>
    );
  }

  if (!dataUrl) {
    return null;
  }

  return (
    <img
      src={dataUrl}
      alt={alt || ''}
      className="max-w-full rounded my-2"
      style={{ border: `1px solid ${theme.colors.border}` }}
    />
  );
}

// Remark plugin to support ==highlighted text== syntax
function remarkHighlight() {
  return (tree: any) => {
    visit(tree, 'text', (node: any, index: number, parent: any) => {
      const text = node.value;
      const regex = /==([^=]+)==/g;

      if (!regex.test(text)) return;

      const parts: any[] = [];
      let lastIndex = 0;
      const matches = text.matchAll(/==([^=]+)==/g);

      for (const match of matches) {
        const matchIndex = match.index!;

        // Add text before match
        if (matchIndex > lastIndex) {
          parts.push({
            type: 'text',
            value: text.slice(lastIndex, matchIndex)
          });
        }

        // Add highlighted text
        parts.push({
          type: 'html',
          value: `<mark style="background-color: #ffd700; color: #000; padding: 0 4px; border-radius: 2px;">${match[1]}</mark>`
        });

        lastIndex = matchIndex + match[0].length;
      }

      // Add remaining text
      if (lastIndex < text.length) {
        parts.push({
          type: 'text',
          value: text.slice(lastIndex)
        });
      }

      // Replace the text node with the parts
      if (parts.length > 0) {
        parent.children.splice(index, 1, ...parts);
      }
    });
  };
}

export function FilePreview({ file, onClose, theme, markdownRawMode, setMarkdownRawMode, shortcuts }: FilePreviewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [showCopyNotification, setShowCopyNotification] = useState(false);
  const [hoveredLink, setHoveredLink] = useState<{ url: string; x: number; y: number } | null>(null);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const [fileStats, setFileStats] = useState<FileStats | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const codeContainerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layerIdRef = useRef<string>();
  const matchElementsRef = useRef<HTMLElement[]>([]);

  const { registerLayer, unregisterLayer, updateLayerHandler } = useLayerStack();

  if (!file) return null;

  const language = getLanguageFromFilename(file.name);
  const isMarkdown = language === 'markdown';
  const isImage = isImageFile(file.name);

  // Extract directory path without filename
  const directoryPath = file.path.substring(0, file.path.lastIndexOf('/'));

  // Fetch file stats when file changes
  useEffect(() => {
    if (file?.path) {
      window.maestro.fs.stat(file.path)
        .then(stats => setFileStats({
          size: stats.size,
          createdAt: stats.createdAt,
          modifiedAt: stats.modifiedAt
        }))
        .catch(err => {
          console.error('Failed to get file stats:', err);
          setFileStats(null);
        });
    }
  }, [file?.path]);

  // Auto-focus on mount so keyboard shortcuts work immediately
  useEffect(() => {
    containerRef.current?.focus();
  }, []); // Empty dependency array = only run on mount

  // Register layer on mount
  useEffect(() => {
    layerIdRef.current = registerLayer({
      type: 'overlay',
      priority: MODAL_PRIORITIES.FILE_PREVIEW,
      blocksLowerLayers: true,
      capturesFocus: true,
      focusTrap: 'lenient',
      ariaLabel: 'File Preview',
      onEscape: () => {
        if (searchOpen) {
          setSearchOpen(false);
          setSearchQuery('');
          // Refocus container so keyboard navigation (arrow keys) still works
          containerRef.current?.focus();
        } else {
          onClose();
        }
      },
      allowClickOutside: false
    });

    return () => {
      if (layerIdRef.current) {
        unregisterLayer(layerIdRef.current);
      }
    };
  }, [registerLayer, unregisterLayer]);

  // Update handler when dependencies change
  useEffect(() => {
    if (layerIdRef.current) {
      updateLayerHandler(layerIdRef.current, () => {
        if (searchOpen) {
          setSearchOpen(false);
          setSearchQuery('');
          // Refocus container so keyboard navigation (arrow keys) still works
          containerRef.current?.focus();
        } else {
          onClose();
        }
      });
    }
  }, [searchOpen, onClose, updateLayerHandler]);

  // Keep search input focused when search is open
  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen, searchQuery]);

  // Highlight search matches in syntax-highlighted code
  useEffect(() => {
    if (!searchQuery.trim() || !codeContainerRef.current || isMarkdown || isImage) {
      setTotalMatches(0);
      setCurrentMatchIndex(0);
      matchElementsRef.current = [];
      return;
    }

    const container = codeContainerRef.current;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];

    // Collect all text nodes
    let node;
    while ((node = walker.nextNode())) {
      textNodes.push(node as Text);
    }

    // Escape regex special characters
    const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedQuery, 'gi');
    const matchElements: HTMLElement[] = [];

    // Highlight matches using safe DOM methods
    textNodes.forEach(textNode => {
      const text = textNode.textContent || '';
      const matches = text.match(regex);

      if (matches) {
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;

        text.replace(regex, (match, offset) => {
          // Add text before match
          if (offset > lastIndex) {
            fragment.appendChild(document.createTextNode(text.substring(lastIndex, offset)));
          }

          // Add highlighted match
          const mark = document.createElement('mark');
          mark.style.backgroundColor = '#ffd700';
          mark.style.color = '#000';
          mark.style.padding = '0 2px';
          mark.style.borderRadius = '2px';
          mark.className = 'search-match';
          mark.textContent = match;
          fragment.appendChild(mark);
          matchElements.push(mark);

          lastIndex = offset + match.length;
          return match;
        });

        // Add remaining text
        if (lastIndex < text.length) {
          fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
        }

        textNode.parentNode?.replaceChild(fragment, textNode);
      }
    });

    // Store match elements and update count
    matchElementsRef.current = matchElements;
    setTotalMatches(matchElements.length);
    setCurrentMatchIndex(matchElements.length > 0 ? 0 : -1);

    // Highlight first match with different color and scroll to it
    if (matchElements.length > 0) {
      matchElements[0].style.backgroundColor = theme.colors.accent;
      matchElements[0].style.color = '#fff';
      matchElements[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Cleanup function to remove highlights
    return () => {
      container.querySelectorAll('mark.search-match').forEach(mark => {
        const parent = mark.parentNode;
        if (parent) {
          parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
          parent.normalize();
        }
      });
      matchElementsRef.current = [];
    };
  }, [searchQuery, file.content, isMarkdown, isImage, theme.colors.accent]);

  const [copyNotificationMessage, setCopyNotificationMessage] = useState('');

  const copyPathToClipboard = () => {
    navigator.clipboard.writeText(file.path);
    setCopyNotificationMessage('File Path Copied to Clipboard');
    setShowCopyNotification(true);
    setTimeout(() => setShowCopyNotification(false), 2000);
  };

  const copyContentToClipboard = async () => {
    if (isImage) {
      // For images, copy the image to clipboard
      try {
        const response = await fetch(file.content);
        const blob = await response.blob();
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob })
        ]);
        setCopyNotificationMessage('Image Copied to Clipboard');
      } catch (err) {
        // Fallback: copy the data URL if image copy fails
        navigator.clipboard.writeText(file.content);
        setCopyNotificationMessage('Image URL Copied to Clipboard');
      }
    } else {
      // For text files, copy the content
      navigator.clipboard.writeText(file.content);
      setCopyNotificationMessage('Content Copied to Clipboard');
    }
    setShowCopyNotification(true);
    setTimeout(() => setShowCopyNotification(false), 2000);
  };

  // Navigate to next search match
  const goToNextMatch = () => {
    if (totalMatches === 0) return;
    const matches = matchElementsRef.current;

    // Reset current match highlight
    if (matches[currentMatchIndex]) {
      matches[currentMatchIndex].style.backgroundColor = '#ffd700';
      matches[currentMatchIndex].style.color = '#000';
    }

    // Move to next match (wrap around)
    const nextIndex = (currentMatchIndex + 1) % totalMatches;
    setCurrentMatchIndex(nextIndex);

    // Highlight new current match and scroll to it
    if (matches[nextIndex]) {
      matches[nextIndex].style.backgroundColor = theme.colors.accent;
      matches[nextIndex].style.color = '#fff';
      matches[nextIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Navigate to previous search match
  const goToPrevMatch = () => {
    if (totalMatches === 0) return;
    const matches = matchElementsRef.current;

    // Reset current match highlight
    if (matches[currentMatchIndex]) {
      matches[currentMatchIndex].style.backgroundColor = '#ffd700';
      matches[currentMatchIndex].style.color = '#000';
    }

    // Move to previous match (wrap around)
    const prevIndex = (currentMatchIndex - 1 + totalMatches) % totalMatches;
    setCurrentMatchIndex(prevIndex);

    // Highlight new current match and scroll to it
    if (matches[prevIndex]) {
      matches[prevIndex].style.backgroundColor = theme.colors.accent;
      matches[prevIndex].style.color = '#fff';
      matches[prevIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Format shortcut keys for display
  const formatShortcut = (shortcutId: string): string => {
    const shortcut = shortcuts[shortcutId];
    if (!shortcut) return '';

    const keys = shortcut.keys.map(key => {
      if (key === 'Meta') return '⌘';
      if (key === 'Ctrl') return 'Ctrl';
      if (key === 'Alt') return '⌥';
      if (key === 'Shift') return '⇧';
      return key.toUpperCase();
    });

    return keys.join('');
  };

  // Highlight search matches in content (for markdown/text)
  const highlightMatches = (content: string): string => {
    if (!searchQuery.trim()) return content;

    const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');

    // Count matches and highlight with special class for navigation
    let matchIndex = 0;
    return content.replace(regex, (match) => {
      const isCurrentMatch = matchIndex === currentMatchIndex;
      const style = isCurrentMatch
        ? `background-color: ${theme.colors.accent}; color: #fff;`
        : 'background-color: #ffd700; color: #000;';
      matchIndex++;
      return `<mark class="search-match-md" data-match-index="${matchIndex - 1}" style="${style}">${match}</mark>`;
    });
  };

  // Update match count for markdown/text content
  useEffect(() => {
    if ((isMarkdown || isImage) && searchQuery.trim()) {
      const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapedQuery, 'gi');
      const matches = file.content.match(regex);
      const count = matches ? matches.length : 0;
      setTotalMatches(count);
      if (count > 0 && currentMatchIndex >= count) {
        setCurrentMatchIndex(0);
      }
    } else if (isMarkdown || isImage) {
      setTotalMatches(0);
      setCurrentMatchIndex(0);
    }
  }, [searchQuery, file.content, isMarkdown, isImage]);

  // Scroll to current match for markdown content
  useEffect(() => {
    if ((isMarkdown && markdownRawMode) || (isMarkdown && searchQuery.trim())) {
      const marks = contentRef.current?.querySelectorAll('mark.search-match-md');
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
    }
  }, [currentMatchIndex, isMarkdown, markdownRawMode, searchQuery, theme.colors.accent]);

  // Helper to check if a shortcut matches
  const isShortcut = (e: React.KeyboardEvent, shortcutId: string) => {
    const shortcut = shortcuts[shortcutId];
    if (!shortcut) return false;

    const hasModifier = (key: string) => {
      if (key === 'Meta') return e.metaKey;
      if (key === 'Ctrl') return e.ctrlKey;
      if (key === 'Alt') return e.altKey;
      if (key === 'Shift') return e.shiftKey;
      return false;
    };

    const modifiers = shortcut.keys.filter((k: string) => ['Meta', 'Ctrl', 'Alt', 'Shift'].includes(k));
    const mainKey = shortcut.keys.find((k: string) => !['Meta', 'Ctrl', 'Alt', 'Shift'].includes(k));

    const modifiersMatch = modifiers.every((m: string) => hasModifier(m));
    const keyMatches = mainKey?.toLowerCase() === e.key.toLowerCase();

    return modifiersMatch && keyMatches;
  };

  // Handle keyboard events
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      e.stopPropagation();
      setSearchOpen(true);
      setTimeout(() => searchInputRef.current?.focus(), 0);
    } else if (isShortcut(e, 'copyFilePath')) {
      e.preventDefault();
      e.stopPropagation();
      copyPathToClipboard();
    } else if (isMarkdown && isShortcut(e, 'toggleMarkdownMode')) {
      e.preventDefault();
      e.stopPropagation();
      setMarkdownRawMode(!markdownRawMode);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const container = contentRef.current;
      if (!container) return;

      if (e.metaKey || e.ctrlKey) {
        // Cmd/Ctrl + Up: Jump to top
        container.scrollTop = 0;
      } else if (e.altKey) {
        // Alt + Up: Page up
        container.scrollTop -= container.clientHeight;
      } else {
        // Arrow Up: Scroll up
        container.scrollTop -= 40;
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const container = contentRef.current;
      if (!container) return;

      if (e.metaKey || e.ctrlKey) {
        // Cmd/Ctrl + Down: Jump to bottom
        container.scrollTop = container.scrollHeight;
      } else if (e.altKey) {
        // Alt + Down: Page down
        container.scrollTop += container.clientHeight;
      } else {
        // Arrow Down: Scroll down
        container.scrollTop += 40;
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full outline-none"
      style={{ backgroundColor: theme.colors.bgMain }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="border-b flex items-center justify-between px-6 py-3 shrink-0" style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgSidebar }}>
        <div className="flex items-center gap-3">
          <FileCode className="w-5 h-5 shrink-0" style={{ color: theme.colors.accent }} />
          <div className="min-w-0">
            <div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>{file.name}</div>
            <div className="text-xs opacity-50 truncate" style={{ color: theme.colors.textDim }}>{directoryPath}</div>
          </div>
          {/* File Stats */}
          {fileStats && (
            <div className="flex items-center gap-4 ml-4 pl-4 border-l" style={{ borderColor: theme.colors.border }}>
              <div className="text-xs" style={{ color: theme.colors.textDim }}>
                <span className="opacity-60">Size:</span>{' '}
                <span style={{ color: theme.colors.textMain }}>{formatFileSize(fileStats.size)}</span>
              </div>
              <div className="text-xs" style={{ color: theme.colors.textDim }}>
                <span className="opacity-60">Modified:</span>{' '}
                <span style={{ color: theme.colors.textMain }}>{formatDateTime(fileStats.modifiedAt)}</span>
              </div>
              <div className="text-xs" style={{ color: theme.colors.textDim }}>
                <span className="opacity-60">Created:</span>{' '}
                <span style={{ color: theme.colors.textMain }}>{formatDateTime(fileStats.createdAt)}</span>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isMarkdown && (
            <button
              onClick={() => setMarkdownRawMode(!markdownRawMode)}
              className="p-2 rounded hover:bg-white/10 transition-colors"
              style={{ color: markdownRawMode ? theme.colors.accent : theme.colors.textDim }}
              title={`${markdownRawMode ? "Show rendered markdown" : "Show raw markdown"} (${formatShortcut('toggleMarkdownMode')})`}
            >
              {markdownRawMode ? <Eye className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={copyContentToClipboard}
            className="p-2 rounded hover:bg-white/10 transition-colors"
            style={{ color: theme.colors.textDim }}
            title={isImage ? "Copy image to clipboard" : "Copy content to clipboard"}
          >
            <Clipboard className="w-4 h-4" />
          </button>
          <button
            onClick={copyPathToClipboard}
            className="p-2 rounded hover:bg-white/10 transition-colors"
            style={{ color: theme.colors.textDim }}
            title="Copy full path to clipboard"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded hover:bg-white/10 transition-colors"
            style={{ color: theme.colors.textDim }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto px-6 pt-3 pb-6 scrollbar-thin">
        {/* Floating Search */}
        {searchOpen && (
          <div className="sticky top-0 z-10 pb-4">
            <div className="flex items-center gap-2">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    setSearchOpen(false);
                    setSearchQuery('');
                    // Refocus container so keyboard navigation still works
                    containerRef.current?.focus();
                  } else if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    goToNextMatch();
                  } else if (e.key === 'Enter' && e.shiftKey) {
                    e.preventDefault();
                    goToPrevMatch();
                  }
                }}
                placeholder="Search in file... (Enter: next, Shift+Enter: prev)"
                className="flex-1 px-3 py-2 rounded border bg-transparent outline-none text-sm"
                style={{ borderColor: theme.colors.accent, color: theme.colors.textMain, backgroundColor: theme.colors.bgSidebar }}
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
                    className="p-1.5 rounded hover:bg-white/10 transition-colors disabled:opacity-30"
                    style={{ color: theme.colors.textDim }}
                    title="Previous match (Shift+Enter)"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={goToNextMatch}
                    disabled={totalMatches === 0}
                    className="p-1.5 rounded hover:bg-white/10 transition-colors disabled:opacity-30"
                    style={{ color: theme.colors.textDim }}
                    title="Next match (Enter)"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        )}
        {isImage ? (
          <div className="flex items-center justify-center h-full">
            <img
              src={file.content}
              alt={file.name}
              className="max-w-full max-h-full object-contain"
              style={{ imageRendering: 'crisp-edges' }}
            />
          </div>
        ) : (isMarkdown && markdownRawMode) || (isMarkdown && searchQuery.trim()) ? (
          // When in raw markdown mode OR searching in markdown, show plain text with highlights
          <div
            className="font-mono text-sm whitespace-pre-wrap"
            style={{ color: theme.colors.textMain }}
            dangerouslySetInnerHTML={{ __html: searchQuery.trim() ? highlightMatches(file.content) : file.content }}
          />
        ) : isMarkdown ? (
          <div className="prose prose-sm max-w-none" style={{ color: theme.colors.textMain }}>
            <style>{`
              .prose h1 { color: ${theme.colors.accent}; font-size: 2em; font-weight: bold; margin: 0.67em 0; }
              .prose h2 { color: ${theme.colors.success}; font-size: 1.5em; font-weight: bold; margin: 0.75em 0; }
              .prose h3 { color: ${theme.colors.warning}; font-size: 1.17em; font-weight: bold; margin: 0.83em 0; }
              .prose h4 { color: ${theme.colors.textMain}; font-size: 1em; font-weight: bold; margin: 1em 0; opacity: 0.9; }
              .prose h5 { color: ${theme.colors.textMain}; font-size: 0.83em; font-weight: bold; margin: 1.17em 0; opacity: 0.8; }
              .prose h6 { color: ${theme.colors.textDim}; font-size: 0.67em; font-weight: bold; margin: 1.33em 0; }
              .prose p { color: ${theme.colors.textMain}; margin: 0.5em 0; }
              .prose ul, .prose ol { color: ${theme.colors.textMain}; margin: 0.5em 0; padding-left: 1.5em; }
              .prose li { margin: 0.25em 0; }
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
            `}</style>
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkHighlight]}
              rehypePlugins={[]}
              skipHtml={false}
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
                    onMouseEnter={(e) => {
                      if (href) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHoveredLink({ url: href, x: rect.left, y: rect.bottom });
                      }
                    }}
                    onMouseLeave={() => setHoveredLink(null)}
                    style={{ color: theme.colors.accent, textDecoration: 'underline', cursor: 'pointer' }}
                  >
                    {children}
                  </a>
                ),
                code: ({ node, inline, className, children, ...props }) => {
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
                img: ({ node, src, alt, ...props }) => (
                  <MarkdownImage
                    src={src}
                    alt={alt}
                    markdownFilePath={file.path}
                    theme={theme}
                  />
                )
              }}
            >
              {file.content}
            </ReactMarkdown>
          </div>
        ) : (
          <div ref={codeContainerRef}>
            <SyntaxHighlighter
              language={language}
              style={vscDarkPlus}
              customStyle={{
                margin: 0,
                padding: '24px',
                background: 'transparent',
                fontSize: '13px',
              }}
              showLineNumbers
              PreTag="div"
            >
              {file.content}
            </SyntaxHighlighter>
          </div>
        )}
      </div>

      {/* Copy Notification Toast */}
      {showCopyNotification && (
        <div
          className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 px-6 py-4 rounded-lg shadow-2xl text-base font-bold animate-in fade-in zoom-in-95 duration-200 z-50"
          style={{
            backgroundColor: theme.colors.accent,
            color: theme.colors.accentForeground,
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)'
          }}
        >
          {copyNotificationMessage}
        </div>
      )}

      {/* Link Hover Tooltip */}
      {hoveredLink && (
        <div
          className="fixed px-3 py-2 rounded shadow-lg text-xs font-mono max-w-md break-all z-50"
          style={{
            left: `${hoveredLink.x}px`,
            top: `${hoveredLink.y + 5}px`,
            backgroundColor: theme.colors.bgActivity,
            color: theme.colors.textDim,
            border: `1px solid ${theme.colors.border}`
          }}
        >
          {hoveredLink.url}
        </div>
      )}
    </div>
  );
}

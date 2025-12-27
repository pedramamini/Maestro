/**
 * MarketplaceModal
 *
 * Modal component for browsing and importing playbooks from the Playbook Marketplace.
 * Features category tabs, search filtering, keyboard navigation, and playbook tiles grid.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  LayoutGrid,
  RefreshCw,
  X,
  Search,
  Loader2,
  Package,
  ArrowLeft,
  ChevronDown,
  Download,
  ExternalLink,
} from 'lucide-react';
import type { Theme } from '../types';
import type { MarketplacePlaybook } from '../../shared/marketplace-types';
import { useLayerStack } from '../contexts/LayerStackContext';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';
import { useMarketplace } from '../hooks/batch/useMarketplace';

// ============================================================================
// Types
// ============================================================================

export interface MarketplaceModalProps {
  theme: Theme;
  isOpen: boolean;
  onClose: () => void;
  autoRunFolderPath: string;
  sessionId: string;
  onImportComplete: (folderName: string) => void;
}

interface PlaybookTileProps {
  playbook: MarketplacePlaybook;
  theme: Theme;
  isSelected: boolean;
  onSelect: () => void;
}

interface PlaybookDetailViewProps {
  theme: Theme;
  playbook: MarketplacePlaybook;
  readmeContent: string | null;
  selectedDocFilename: string | null;
  documentContent: string | null;
  isLoadingDocument: boolean;
  targetFolderName: string;
  isImporting: boolean;
  onBack: () => void;
  onSelectDocument: (filename: string) => void;
  onTargetFolderChange: (name: string) => void;
  onImport: () => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format cache age into human-readable string
 */
function formatCacheAge(cacheAgeMs: number | null): string {
  if (cacheAgeMs === null || cacheAgeMs === 0) return '';

  const seconds = Math.floor(cacheAgeMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ago`;
  } else if (minutes > 0) {
    return `${minutes}m ago`;
  } else {
    return 'just now';
  }
}

// ============================================================================
// PlaybookTile Sub-component
// ============================================================================

function PlaybookTile({ playbook, theme, isSelected, onSelect }: PlaybookTileProps) {
  const tileRef = useRef<HTMLButtonElement>(null);

  // Scroll into view when selected
  useEffect(() => {
    if (isSelected && tileRef.current) {
      tileRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isSelected]);

  return (
    <button
      ref={tileRef}
      onClick={onSelect}
      className={`p-4 rounded-lg border text-left transition-all hover:scale-[1.02] ${
        isSelected ? 'ring-2' : ''
      }`}
      style={{
        backgroundColor: theme.colors.bgActivity,
        borderColor: isSelected ? theme.colors.accent : theme.colors.border,
        outlineColor: 'transparent',
        // Ring color for focus state
        ...(isSelected && {
          boxShadow: `0 0 0 2px ${theme.colors.accent}`,
        }),
      }}
    >
      {/* Category badge */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className="px-2 py-0.5 rounded text-xs"
          style={{
            backgroundColor: `${theme.colors.accent}20`,
            color: theme.colors.accent,
          }}
        >
          {playbook.category}
        </span>
        {playbook.subcategory && (
          <span className="text-xs" style={{ color: theme.colors.textDim }}>
            / {playbook.subcategory}
          </span>
        )}
      </div>

      {/* Title */}
      <h3
        className="font-semibold mb-1 line-clamp-1"
        style={{ color: theme.colors.textMain }}
      >
        {playbook.title}
      </h3>

      {/* Description */}
      <p
        className="text-sm line-clamp-2 mb-3"
        style={{ color: theme.colors.textDim }}
      >
        {playbook.description}
      </p>

      {/* Footer: author + doc count */}
      <div
        className="flex items-center justify-between text-xs"
        style={{ color: theme.colors.textDim }}
      >
        <span>{playbook.author}</span>
        <span>{playbook.documents.length} docs</span>
      </div>
    </button>
  );
}

// ============================================================================
// PlaybookDetailView Sub-component
// ============================================================================

function PlaybookDetailView({
  theme,
  playbook,
  readmeContent,
  selectedDocFilename,
  documentContent,
  isLoadingDocument,
  targetFolderName,
  isImporting,
  onBack,
  onSelectDocument,
  onTargetFolderChange,
  onImport,
}: PlaybookDetailViewProps) {
  const [showDocDropdown, setShowDocDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDocDropdown(false);
      }
    };
    if (showDocDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDocDropdown]);

  const handleDocumentSelect = (filename: string | null) => {
    if (filename === null) {
      // Switch to README (null means show README)
      onSelectDocument('');
    } else {
      onSelectDocument(filename);
    }
    setShowDocDropdown(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with back button and playbook info */}
      <div
        className="flex items-center gap-4 px-4 py-3 border-b shrink-0"
        style={{ borderColor: theme.colors.border }}
      >
        {/* Back button */}
        <button
          onClick={onBack}
          className="p-1.5 rounded hover:bg-white/10 transition-colors"
          title="Back to list (Esc)"
        >
          <ArrowLeft className="w-5 h-5" style={{ color: theme.colors.textDim }} />
        </button>

        {/* Playbook title and category */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className="px-2 py-0.5 rounded text-xs"
              style={{ backgroundColor: `${theme.colors.accent}20`, color: theme.colors.accent }}
            >
              {playbook.category}
            </span>
            {playbook.subcategory && (
              <span className="text-xs" style={{ color: theme.colors.textDim }}>
                / {playbook.subcategory}
              </span>
            )}
          </div>
          <h2 className="text-lg font-semibold truncate" style={{ color: theme.colors.textMain }}>
            {playbook.title}
          </h2>
        </div>
      </div>

      {/* Main content area with sidebar and document preview */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left sidebar with playbook metadata */}
        <div
          className="w-64 shrink-0 p-4 border-r overflow-y-auto"
          style={{ borderColor: theme.colors.border }}
        >
          {/* Description */}
          <div className="mb-4">
            <h4
              className="text-xs font-semibold mb-1 uppercase tracking-wide"
              style={{ color: theme.colors.textDim }}
            >
              Description
            </h4>
            <p className="text-sm" style={{ color: theme.colors.textMain }}>
              {playbook.description}
            </p>
          </div>

          {/* Author */}
          <div className="mb-4">
            <h4
              className="text-xs font-semibold mb-1 uppercase tracking-wide"
              style={{ color: theme.colors.textDim }}
            >
              Author
            </h4>
            {playbook.authorLink ? (
              <a
                href={playbook.authorLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm hover:underline inline-flex items-center gap-1"
                style={{ color: theme.colors.accent }}
                onClick={(e) => {
                  e.preventDefault();
                  window.maestro.shell.openExternal(playbook.authorLink!);
                }}
              >
                {playbook.author}
                <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <p className="text-sm" style={{ color: theme.colors.textMain }}>
                {playbook.author}
              </p>
            )}
          </div>

          {/* Tags */}
          {playbook.tags && playbook.tags.length > 0 && (
            <div className="mb-4">
              <h4
                className="text-xs font-semibold mb-1 uppercase tracking-wide"
                style={{ color: theme.colors.textDim }}
              >
                Tags
              </h4>
              <div className="flex flex-wrap gap-1">
                {playbook.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded text-xs"
                    style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.textDim }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Documents list */}
          <div className="mb-4">
            <h4
              className="text-xs font-semibold mb-1 uppercase tracking-wide"
              style={{ color: theme.colors.textDim }}
            >
              Documents ({playbook.documents.length})
            </h4>
            <ul className="space-y-1">
              {playbook.documents.map((doc, i) => (
                <li key={doc.filename} className="text-sm" style={{ color: theme.colors.textMain }}>
                  {i + 1}. {doc.filename}.md
                </li>
              ))}
            </ul>
          </div>

          {/* Loop settings */}
          <div className="mb-4">
            <h4
              className="text-xs font-semibold mb-1 uppercase tracking-wide"
              style={{ color: theme.colors.textDim }}
            >
              Settings
            </h4>
            <p className="text-sm" style={{ color: theme.colors.textMain }}>
              Loop:{' '}
              {playbook.loopEnabled
                ? playbook.maxLoops
                  ? `Yes (max ${playbook.maxLoops})`
                  : 'Yes (unlimited)'
                : 'No'}
            </p>
          </div>

          {/* Last updated */}
          <div className="mb-6">
            <h4
              className="text-xs font-semibold mb-1 uppercase tracking-wide"
              style={{ color: theme.colors.textDim }}
            >
              Last Updated
            </h4>
            <p className="text-sm" style={{ color: theme.colors.textMain }}>
              {playbook.lastUpdated}
            </p>
          </div>
        </div>

        {/* Main content area with document dropdown and markdown preview */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Document selector dropdown */}
          <div className="px-4 py-3 border-b shrink-0" style={{ borderColor: theme.colors.border }}>
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowDocDropdown(!showDocDropdown)}
                className="w-full flex items-center justify-between px-3 py-2 rounded text-sm"
                style={{
                  backgroundColor: theme.colors.bgActivity,
                  color: theme.colors.textMain,
                  border: `1px solid ${theme.colors.border}`,
                }}
              >
                <span>{selectedDocFilename ? `${selectedDocFilename}.md` : 'README.md'}</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${showDocDropdown ? 'rotate-180' : ''}`}
                />
              </button>

              {showDocDropdown && (
                <div
                  className="absolute top-full left-0 right-0 mt-1 rounded shadow-lg z-10 overflow-hidden max-h-64 overflow-y-auto"
                  style={{
                    backgroundColor: theme.colors.bgSidebar,
                    border: `1px solid ${theme.colors.border}`,
                  }}
                >
                  {/* README option */}
                  <button
                    onClick={() => handleDocumentSelect(null)}
                    className="w-full px-3 py-2 text-sm text-left hover:bg-white/5 transition-colors"
                    style={{
                      color: !selectedDocFilename ? theme.colors.accent : theme.colors.textMain,
                      backgroundColor: !selectedDocFilename ? theme.colors.bgActivity : 'transparent',
                    }}
                  >
                    README.md
                  </button>

                  <div className="border-t" style={{ borderColor: theme.colors.border }} />

                  {/* Document options */}
                  {playbook.documents.map((doc) => (
                    <button
                      key={doc.filename}
                      onClick={() => handleDocumentSelect(doc.filename)}
                      className="w-full px-3 py-2 text-sm text-left hover:bg-white/5 transition-colors"
                      style={{
                        color:
                          selectedDocFilename === doc.filename
                            ? theme.colors.accent
                            : theme.colors.textMain,
                        backgroundColor:
                          selectedDocFilename === doc.filename
                            ? theme.colors.bgActivity
                            : 'transparent',
                      }}
                    >
                      {doc.filename}.md
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Markdown preview */}
          <div className="flex-1 overflow-y-auto p-4">
            {isLoadingDocument ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: theme.colors.accent }} />
              </div>
            ) : (
              <div
                className="prose prose-sm max-w-none"
                style={{
                  color: theme.colors.textMain,
                  // Prose overrides for dark theme
                  '--tw-prose-body': theme.colors.textMain,
                  '--tw-prose-headings': theme.colors.textMain,
                  '--tw-prose-links': theme.colors.accent,
                  '--tw-prose-bold': theme.colors.textMain,
                  '--tw-prose-code': theme.colors.textMain,
                  '--tw-prose-quotes': theme.colors.textDim,
                } as React.CSSProperties}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {selectedDocFilename
                    ? documentContent || '*Document not found*'
                    : readmeContent || '*No README available*'}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fixed footer with folder name input and import button */}
      <div
        className="shrink-0 px-4 py-3 border-t"
        style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgActivity }}
      >
        <div className="flex items-center gap-3">
          {/* Target folder input */}
          <div className="flex-1">
            <label className="block text-xs mb-1" style={{ color: theme.colors.textDim }}>
              Import to folder
            </label>
            <input
              type="text"
              value={targetFolderName}
              onChange={(e) => onTargetFolderChange(e.target.value)}
              className="w-full px-3 py-2 rounded border bg-transparent outline-none text-sm focus:ring-1"
              style={{
                borderColor: theme.colors.border,
                color: theme.colors.textMain,
              }}
              placeholder="folder-name"
            />
          </div>

          {/* Import button */}
          <button
            onClick={onImport}
            disabled={isImporting || !targetFolderName.trim()}
            className="px-4 py-2 rounded font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-5"
            style={{
              backgroundColor: theme.colors.accent,
              color: theme.colors.accentForeground,
            }}
          >
            {isImporting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Importing...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                Import Playbook
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MarketplaceModal Component
// ============================================================================

export function MarketplaceModal({
  theme,
  isOpen,
  onClose,
  autoRunFolderPath,
  sessionId,
  onImportComplete,
}: MarketplaceModalProps) {
  // Layer stack for escape handling
  const { registerLayer, unregisterLayer } = useLayerStack();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Marketplace hook for data and operations
  const {
    manifest,
    categories,
    isLoading,
    isRefreshing,
    isImporting,
    fromCache,
    cacheAge,
    error,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    filteredPlaybooks,
    refresh,
    importPlaybook,
    fetchReadme,
    fetchDocument,
  } = useMarketplace();

  // Tile selection state
  const [selectedTileIndex, setSelectedTileIndex] = useState(0);

  // Search input ref for focus
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Detail view state
  const [selectedPlaybook, setSelectedPlaybook] = useState<MarketplacePlaybook | null>(null);
  const [showDetailView, setShowDetailView] = useState(false);
  const [readmeContent, setReadmeContent] = useState<string | null>(null);
  const [selectedDocFilename, setSelectedDocFilename] = useState<string | null>(null);
  const [documentContent, setDocumentContent] = useState<string | null>(null);
  const [isLoadingDocument, setIsLoadingDocument] = useState(false);
  const [targetFolderName, setTargetFolderName] = useState('');

  // Reset selection when filtered playbooks change
  useEffect(() => {
    setSelectedTileIndex(0);
  }, [filteredPlaybooks.length, selectedCategory, searchQuery]);

  // Calculate grid columns based on container width (default to 3)
  const gridColumns = 3;

  // Reference for escape handling to include showDetailView state
  const showDetailViewRef = useRef(showDetailView);
  showDetailViewRef.current = showDetailView;

  // Back navigation handler
  const handleBackToList = useCallback(() => {
    setShowDetailView(false);
    setSelectedPlaybook(null);
    setReadmeContent(null);
    setSelectedDocFilename(null);
    setDocumentContent(null);
    setTargetFolderName('');
  }, []);

  const handleBackToListRef = useRef(handleBackToList);
  handleBackToListRef.current = handleBackToList;

  // Register with layer stack for escape handling
  useEffect(() => {
    if (isOpen) {
      const id = registerLayer({
        type: 'modal',
        priority: MODAL_PRIORITIES.MARKETPLACE,
        blocksLowerLayers: true,
        capturesFocus: true,
        focusTrap: 'strict',
        ariaLabel: 'Playbook Marketplace',
        onEscape: () => {
          if (showDetailViewRef.current) {
            handleBackToListRef.current();
          } else {
            onCloseRef.current();
          }
        },
      });
      return () => unregisterLayer(id);
    }
  }, [isOpen, registerLayer, unregisterLayer]);

  // Focus search input when modal opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => searchInputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle selecting a playbook (opens detail view)
  const handleSelectPlaybook = useCallback(
    async (playbook: MarketplacePlaybook) => {
      setSelectedPlaybook(playbook);
      setShowDetailView(true);
      setSelectedDocFilename(null);
      setDocumentContent(null);

      // Generate default folder name: category/title slug
      const slug = `${playbook.category}/${playbook.title}`
        .toLowerCase()
        .replace(/[^a-z0-9/]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      setTargetFolderName(slug);

      // Fetch README
      setIsLoadingDocument(true);
      const readme = await fetchReadme(playbook.path);
      setReadmeContent(readme);
      setIsLoadingDocument(false);
    },
    [fetchReadme]
  );

  // Handle selecting a document in detail view
  const handleSelectDocument = useCallback(
    async (filename: string) => {
      if (!selectedPlaybook) return;

      if (filename === '') {
        // Switch back to README
        setSelectedDocFilename(null);
        setDocumentContent(null);
        return;
      }

      setSelectedDocFilename(filename);
      setIsLoadingDocument(true);
      const content = await fetchDocument(selectedPlaybook.path, filename);
      setDocumentContent(content);
      setIsLoadingDocument(false);
    },
    [selectedPlaybook, fetchDocument]
  );

  // Handle import action
  const handleImport = useCallback(async () => {
    if (!selectedPlaybook || !targetFolderName.trim()) return;

    const result = await importPlaybook(
      selectedPlaybook,
      targetFolderName,
      autoRunFolderPath,
      sessionId
    );

    if (result.success) {
      onImportComplete(targetFolderName);
      onClose();
    } else {
      // Could show an error toast here in future enhancement
      console.error('Import failed:', result.error);
    }
  }, [
    selectedPlaybook,
    targetFolderName,
    importPlaybook,
    autoRunFolderPath,
    sessionId,
    onImportComplete,
    onClose,
  ]);

  // Keyboard shortcuts for category tabs: Cmd+Shift+[ and Cmd+Shift+]
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
        if (e.key === '[') {
          e.preventDefault();
          const currentIndex = categories.indexOf(selectedCategory);
          const newIndex = Math.max(0, currentIndex - 1);
          setSelectedCategory(categories[newIndex]);
        } else if (e.key === ']') {
          e.preventDefault();
          const currentIndex = categories.indexOf(selectedCategory);
          const newIndex = Math.min(categories.length - 1, currentIndex + 1);
          setSelectedCategory(categories[newIndex]);
        }
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, categories, selectedCategory, setSelectedCategory]);

  // Arrow key navigation for tiles
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const total = filteredPlaybooks.length;
      if (total === 0) return;

      // Don't interfere with input typing
      if (e.target instanceof HTMLInputElement) {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') {
          return;
        }
      }

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          setSelectedTileIndex((i) => Math.min(total - 1, i + 1));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setSelectedTileIndex((i) => Math.max(0, i - 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedTileIndex((i) => Math.min(total - 1, i + gridColumns));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedTileIndex((i) => Math.max(0, i - gridColumns));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredPlaybooks[selectedTileIndex]) {
            handleSelectPlaybook(filteredPlaybooks[selectedTileIndex]);
          }
          break;
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, filteredPlaybooks, selectedTileIndex, gridColumns, handleSelectPlaybook]);

  // Don't render if not open
  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 modal-overlay flex items-start justify-center pt-16 z-[9999] animate-in fade-in duration-100"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Playbook Marketplace"
        tabIndex={-1}
        className="w-[900px] max-w-[90vw] rounded-xl shadow-2xl border overflow-hidden flex flex-col max-h-[80vh] outline-none"
        style={{
          backgroundColor: theme.colors.bgActivity,
          borderColor: theme.colors.border,
        }}
      >
        {showDetailView && selectedPlaybook ? (
          // Detail View
          <PlaybookDetailView
            theme={theme}
            playbook={selectedPlaybook}
            readmeContent={readmeContent}
            selectedDocFilename={selectedDocFilename}
            documentContent={documentContent}
            isLoadingDocument={isLoadingDocument}
            targetFolderName={targetFolderName}
            isImporting={isImporting}
            onBack={handleBackToList}
            onSelectDocument={handleSelectDocument}
            onTargetFolderChange={setTargetFolderName}
            onImport={handleImport}
          />
        ) : (
          // List View
          <>
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: theme.colors.border }}
            >
              <div className="flex items-center gap-2">
                <LayoutGrid
                  className="w-5 h-5"
                  style={{ color: theme.colors.accent }}
                />
                <h2
                  className="text-lg font-semibold"
                  style={{ color: theme.colors.textMain }}
                >
                  Playbook Marketplace
                </h2>
              </div>
              <div className="flex items-center gap-3">
                {/* Cache status */}
                <span className="text-xs" style={{ color: theme.colors.textDim }}>
                  {fromCache ? `Cached ${formatCacheAge(cacheAge)}` : 'Live'}
                </span>
                {/* Refresh button */}
                <button
                  onClick={() => refresh()}
                  disabled={isRefreshing}
                  className="p-1.5 rounded hover:bg-white/10 transition-colors disabled:opacity-50"
                  title="Refresh marketplace data"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
                    style={{ color: theme.colors.textDim }}
                  />
                </button>
                {/* Close button */}
                <button
                  onClick={onClose}
                  className="p-1.5 rounded hover:bg-white/10 transition-colors"
                  title="Close"
                >
                  <X className="w-5 h-5" style={{ color: theme.colors.textDim }} />
                </button>
              </div>
            </div>

            {/* Category Tabs */}
            <div
              className="flex items-center gap-1 px-4 py-2 border-b overflow-x-auto"
              style={{ borderColor: theme.colors.border }}
            >
              {categories.map((category) => {
                const count =
                  category === 'All'
                    ? manifest?.playbooks.length ?? 0
                    : manifest?.playbooks.filter((p) => p.category === category)
                        .length ?? 0;
                return (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={`px-3 py-1.5 rounded text-sm whitespace-nowrap transition-colors ${
                      selectedCategory === category ? 'font-semibold' : ''
                    }`}
                    style={{
                      backgroundColor:
                        selectedCategory === category
                          ? theme.colors.accent
                          : 'transparent',
                      color:
                        selectedCategory === category
                          ? theme.colors.accentForeground
                          : theme.colors.textMain,
                    }}
                  >
                    {category}
                    <span className="ml-1.5 text-xs opacity-60">({count})</span>
                  </button>
                );
              })}
            </div>

            {/* Search Bar */}
            <div
              className="px-4 py-3 border-b"
              style={{ borderColor: theme.colors.border }}
            >
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: theme.colors.textDim }}
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search playbooks..."
                  className="w-full pl-10 pr-4 py-2 rounded border bg-transparent outline-none"
                  style={{
                    borderColor: theme.colors.border,
                    color: theme.colors.textMain,
                  }}
                />
              </div>
            </div>

            {/* Playbook Grid */}
            <div className="flex-1 overflow-y-auto p-4">
              {isLoading ? (
                <div className="flex items-center justify-center h-full min-h-[200px]">
                  <Loader2
                    className="w-8 h-8 animate-spin"
                    style={{ color: theme.colors.accent }}
                  />
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center">
                  <Package
                    className="w-12 h-12 mb-3"
                    style={{ color: theme.colors.error }}
                  />
                  <p style={{ color: theme.colors.error }}>{error}</p>
                  <button
                    onClick={() => refresh()}
                    className="mt-4 px-4 py-2 rounded text-sm"
                    style={{
                      backgroundColor: theme.colors.accent,
                      color: theme.colors.accentForeground,
                    }}
                  >
                    Try Again
                  </button>
                </div>
              ) : filteredPlaybooks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center">
                  <Package
                    className="w-12 h-12 mb-3"
                    style={{ color: theme.colors.textDim }}
                  />
                  <p style={{ color: theme.colors.textDim }}>
                    {searchQuery
                      ? 'No playbooks match your search'
                      : 'No playbooks available'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredPlaybooks.map((playbook, index) => (
                    <PlaybookTile
                      key={playbook.id}
                      playbook={playbook}
                      theme={theme}
                      isSelected={selectedTileIndex === index}
                      onSelect={() => handleSelectPlaybook(playbook)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Footer with keyboard shortcuts hint */}
            <div
              className="px-4 py-2 border-t text-xs flex items-center justify-between"
              style={{
                borderColor: theme.colors.border,
                color: theme.colors.textDim,
              }}
            >
              <span>
                Use arrow keys to navigate, Enter to select
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px]">
                  {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Shift+[/]
                </kbd>{' '}
                to switch tabs
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

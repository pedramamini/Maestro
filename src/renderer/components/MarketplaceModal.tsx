/**
 * MarketplaceModal
 *
 * Modal component for browsing and importing playbooks from the Playbook Marketplace.
 * Features category tabs, search filtering, keyboard navigation, and playbook tiles grid.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  LayoutGrid,
  RefreshCw,
  X,
  Search,
  Loader2,
  Package,
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
  } = useMarketplace();

  // Tile selection state
  const [selectedTileIndex, setSelectedTileIndex] = useState(0);

  // Search input ref for focus
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Reset selection when filtered playbooks change
  useEffect(() => {
    setSelectedTileIndex(0);
  }, [filteredPlaybooks.length, selectedCategory, searchQuery]);

  // Calculate grid columns based on container width (default to 3)
  const gridColumns = 3;

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
        onEscape: () => onCloseRef.current(),
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

  // Handle selecting a playbook (opens detail view in future phase)
  const handleSelectPlaybook = useCallback((playbook: MarketplacePlaybook) => {
    // For now, log selection - detail view will be implemented in Phase 4
    console.log('Selected playbook:', playbook.id);
    // TODO: Open detail view modal (Phase 4)
  }, []);

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
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

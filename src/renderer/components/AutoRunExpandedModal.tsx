import React, { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Minimize2, Eye, Edit, Play, Square, Loader2, Image } from 'lucide-react';
import type { Theme, BatchRunState, SessionState, Shortcut } from '../types';
import { useLayerStack } from '../contexts/LayerStackContext';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';
import { AutoRun, AutoRunHandle } from './AutoRun';
import type { DocumentTaskCount } from './AutoRunDocumentSelector';
import { formatShortcutKeys } from '../utils/shortcutFormatter';

interface AutoRunExpandedModalProps {
  theme: Theme;
  onClose: () => void;
  // Pass through all AutoRun props
  sessionId: string;
  folderPath: string | null;
  selectedFile: string | null;
  documentList: string[];
  documentTree?: Array<{ name: string; type: 'file' | 'folder'; path: string; children?: unknown[] }>;
  content: string;
  onContentChange: (content: string) => void;
  contentVersion?: number;
  mode: 'edit' | 'preview';
  onModeChange: (mode: 'edit' | 'preview') => void;
  initialCursorPosition?: number;
  initialEditScrollPos?: number;
  initialPreviewScrollPos?: number;
  onStateChange?: (state: {
    mode: 'edit' | 'preview';
    cursorPosition: number;
    editScrollPos: number;
    previewScrollPos: number;
  }) => void;
  onOpenSetup: () => void;
  onRefresh: () => void;
  onSelectDocument: (filename: string) => void;
  onCreateDocument: (filename: string) => Promise<boolean>;
  isLoadingDocuments?: boolean;
  documentTaskCounts?: Map<string, DocumentTaskCount>;  // Task counts per document
  batchRunState?: BatchRunState;
  onOpenBatchRunner?: () => void;
  onStopBatchRun?: () => void;
  sessionState?: SessionState;
  shortcuts?: Record<string, Shortcut>;
}

export function AutoRunExpandedModal({
  theme,
  onClose,
  mode,
  onModeChange,
  batchRunState,
  onOpenBatchRunner,
  onStopBatchRun,
  sessionState,
  shortcuts,
  ...autoRunProps
}: AutoRunExpandedModalProps) {
  const { registerLayer, unregisterLayer, updateLayerHandler } = useLayerStack();
  const layerIdRef = useRef<string>();
  const onCloseRef = useRef(onClose);
  const autoRunRef = useRef<AutoRunHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  onCloseRef.current = onClose;

  const isLocked = batchRunState?.isRunning || false;
  const isAgentBusy = sessionState === 'busy' || sessionState === 'connecting';
  const isStopping = batchRunState?.isStopping || false;

  // Register layer on mount
  useEffect(() => {
    const id = registerLayer({
      type: 'modal',
      priority: MODAL_PRIORITIES.AUTORUN_EXPANDED,
      onEscape: () => {
        onCloseRef.current();
      }
    });
    layerIdRef.current = id;

    return () => {
      if (layerIdRef.current) {
        unregisterLayer(layerIdRef.current);
      }
    };
  }, [registerLayer, unregisterLayer]);

  // Keep escape handler up to date
  useEffect(() => {
    if (layerIdRef.current) {
      updateLayerHandler(layerIdRef.current, () => {
        onCloseRef.current();
      });
    }
  }, [onClose, updateLayerHandler]);

  // Focus the AutoRun component on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      autoRunRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  // Use the AutoRun's switchMode for scroll sync, falling back to direct mode change
  const setMode = useCallback((newMode: 'edit' | 'preview') => {
    if (autoRunRef.current?.switchMode) {
      autoRunRef.current.switchMode(newMode);
    } else {
      onModeChange(newMode);
    }
  }, [onModeChange]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* Modal - same size as PromptComposer for consistency */}
      <div
        className="relative w-[90vw] h-[80vh] max-w-5xl overflow-hidden rounded-xl border shadow-2xl flex flex-col"
        style={{
          backgroundColor: theme.colors.bgSidebar,
          borderColor: theme.colors.border
        }}
      >
        {/* Header with controls */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b shrink-0"
          style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgActivity }}
        >
          {/* Left side - Title */}
          <h2 className="text-sm font-semibold" style={{ color: theme.colors.textMain }}>
            Auto Run
          </h2>

          {/* Center - Mode controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => !isLocked && setMode('edit')}
              disabled={isLocked}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-colors ${
                mode === 'edit' && !isLocked ? 'font-semibold' : ''
              } ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
              style={{
                backgroundColor: mode === 'edit' && !isLocked ? theme.colors.bgMain : 'transparent',
                color: isLocked ? theme.colors.textDim : (mode === 'edit' ? theme.colors.textMain : theme.colors.textDim),
                border: `1px solid ${mode === 'edit' && !isLocked ? theme.colors.accent : theme.colors.border}`
              }}
              title={isLocked ? 'Editing disabled while Auto Run active' : 'Edit document'}
            >
              <Edit className="w-3.5 h-3.5" />
              Edit
            </button>
            <button
              onClick={() => setMode('preview')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-colors ${
                mode === 'preview' || isLocked ? 'font-semibold' : ''
              }`}
              style={{
                backgroundColor: mode === 'preview' || isLocked ? theme.colors.bgMain : 'transparent',
                color: mode === 'preview' || isLocked ? theme.colors.textMain : theme.colors.textDim,
                border: `1px solid ${mode === 'preview' || isLocked ? theme.colors.accent : theme.colors.border}`
              }}
              title="Preview document"
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
                  color: theme.colors.accentForeground,
                  border: `1px solid ${theme.colors.accent}`
                }}
                title={isAgentBusy ? "Cannot run while agent is thinking" : "Run batch processing on Auto Run tasks"}
              >
                <Play className="w-3.5 h-3.5" />
                Run
              </button>
            )}
          </div>

          {/* Right side - Collapse/Close */}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors hover:bg-white/10"
              style={{ color: theme.colors.textDim }}
              title={`Collapse${shortcuts?.toggleAutoRunExpanded ? ` (${formatShortcutKeys(shortcuts.toggleAutoRunExpanded.keys)})` : ' (Esc)'}`}
            >
              <Minimize2 className="w-4 h-4" />
              Collapse
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-white/10 transition-colors"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" style={{ color: theme.colors.textDim }} />
            </button>
          </div>
        </div>

        {/* AutoRun Content - hide top controls since they're in header */}
        <div className="flex-1 min-h-0 overflow-hidden p-4">
          <AutoRun
            ref={autoRunRef}
            theme={theme}
            mode={mode}
            onModeChange={onModeChange}
            batchRunState={batchRunState}
            onOpenBatchRunner={onOpenBatchRunner}
            onStopBatchRun={onStopBatchRun}
            sessionState={sessionState}
            hideTopControls
            {...autoRunProps}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

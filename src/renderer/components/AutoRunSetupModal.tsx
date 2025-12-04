import React, { useState, useRef, useEffect } from 'react';
import { X, Folder, FileText, Play, CheckSquare } from 'lucide-react';
import type { Theme } from '../types';
import { useLayerStack } from '../contexts/LayerStackContext';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';

interface AutoRunSetupModalProps {
  theme: Theme;
  onClose: () => void;
  onFolderSelected: (folderPath: string) => void;
  currentFolder?: string; // If changing existing folder
  sessionName?: string; // Name of the agent session
}

export function AutoRunSetupModal({ theme, onClose, onFolderSelected, currentFolder, sessionName }: AutoRunSetupModalProps) {
  const [selectedFolder, setSelectedFolder] = useState(currentFolder || '');
  const [homeDir, setHomeDir] = useState<string>('');
  const [folderValidation, setFolderValidation] = useState<{
    checking: boolean;
    valid: boolean;
    docCount: number;
    error?: string;
  }>({ checking: false, valid: false, docCount: 0 });
  const { registerLayer, unregisterLayer, updateLayerHandler } = useLayerStack();
  const layerIdRef = useRef<string>();
  const modalRef = useRef<HTMLDivElement>(null);
  const continueButtonRef = useRef<HTMLButtonElement>(null);

  // Fetch home directory on mount for tilde expansion
  useEffect(() => {
    window.maestro.fs.homeDir().then(setHomeDir);
  }, []);

  // Expand tilde in path
  const expandTilde = (path: string): string => {
    if (!homeDir) return path;
    if (path === '~') return homeDir;
    if (path.startsWith('~/')) return homeDir + path.slice(1);
    return path;
  };

  // Validate folder and count markdown documents (debounced)
  useEffect(() => {
    if (!selectedFolder.trim()) {
      setFolderValidation({ checking: false, valid: false, docCount: 0 });
      return;
    }

    // If path starts with ~ but homeDir isn't loaded yet, wait
    if (selectedFolder.startsWith('~') && !homeDir) {
      setFolderValidation({ checking: true, valid: false, docCount: 0 });
      return;
    }

    // Debounce the validation
    const timeoutId = setTimeout(async () => {
      setFolderValidation(prev => ({ ...prev, checking: true }));

      try {
        // Expand tilde inline to avoid closure issues
        let expandedPath = selectedFolder.trim();
        if (homeDir) {
          if (expandedPath === '~') {
            expandedPath = homeDir;
          } else if (expandedPath.startsWith('~/')) {
            expandedPath = homeDir + expandedPath.slice(1);
          }
        }

        const result = await window.maestro.autorun.listDocs(expandedPath);

        if (result.success) {
          setFolderValidation({
            checking: false,
            valid: true,
            docCount: result.files?.length || 0
          });
        } else {
          setFolderValidation({
            checking: false,
            valid: false,
            docCount: 0,
            error: 'Folder not found or not accessible'
          });
        }
      } catch {
        setFolderValidation({
          checking: false,
          valid: false,
          docCount: 0,
          error: 'Failed to access folder'
        });
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [selectedFolder, homeDir]);

  // Register layer on mount
  useEffect(() => {
    const id = registerLayer({
      type: 'modal',
      priority: MODAL_PRIORITIES.AUTORUN_SETUP,
      blocksLowerLayers: true,
      capturesFocus: true,
      focusTrap: 'strict',
      ariaLabel: 'Set Up Auto Run',
      onEscape: onClose,
    });
    layerIdRef.current = id;

    return () => {
      if (layerIdRef.current) {
        unregisterLayer(layerIdRef.current);
      }
    };
  }, [registerLayer, unregisterLayer]);

  // Update handler when dependencies change
  useEffect(() => {
    if (layerIdRef.current) {
      updateLayerHandler(layerIdRef.current, onClose);
    }
  }, [onClose, updateLayerHandler]);

  const handleSelectFolder = async () => {
    const folder = await window.maestro.dialog.selectFolder();
    if (folder) {
      setSelectedFolder(folder);
      // Focus continue button after folder picker selection (not on typing)
      requestAnimationFrame(() => {
        continueButtonRef.current?.focus();
      });
    }
  };

  const handleContinue = () => {
    if (selectedFolder) {
      // Expand tilde before passing to callback
      const expandedPath = expandTilde(selectedFolder.trim());
      onFolderSelected(expandedPath);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Set Up Auto Run"
      tabIndex={-1}
      ref={modalRef}
      onKeyDown={(e) => {
        // Handle Cmd+O for folder picker
        if ((e.key === 'o' || e.key === 'O') && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          e.stopPropagation();
          handleSelectFolder();
          return;
        }
        // Handle Enter for continue when folder is selected
        if (e.key === 'Enter' && selectedFolder) {
          e.preventDefault();
          e.stopPropagation();
          handleContinue();
          return;
        }
        // Stop propagation of all other keyboard events
        if (e.key !== 'Escape') {
          e.stopPropagation();
        }
      }}
    >
      <div
        className="w-[520px] rounded-xl border shadow-2xl overflow-hidden"
        style={{ backgroundColor: theme.colors.bgSidebar, borderColor: theme.colors.border }}
      >
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: theme.colors.border }}>
          <h2 className="text-lg font-bold" style={{ color: theme.colors.textMain }}>
            {currentFolder ? 'Change Auto Run Folder' : 'Set Up Auto Run'}
          </h2>
          <button onClick={onClose} style={{ color: theme.colors.textDim }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Explanation */}
          <div className="space-y-4">
            <p className="text-sm leading-relaxed" style={{ color: theme.colors.textMain }}>
              Auto Run lets you manage and execute Markdown documents containing open tasks.
              Select a folder that contains your task documents. Each Maestro agent is assigned its own working folder.
            </p>

            {/* Feature list */}
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: theme.colors.accent }} />
                <div>
                  <div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
                    Markdown Documents
                  </div>
                  <div className="text-xs" style={{ color: theme.colors.textDim }}>
                    Each .md file in your folder becomes a runnable document
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckSquare className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: theme.colors.accent }} />
                <div>
                  <div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
                    Checkbox Tasks
                  </div>
                  <div className="text-xs" style={{ color: theme.colors.textDim }}>
                    Use markdown checkboxes (- [ ]) to define tasks that can be automated
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Play className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: theme.colors.accent }} />
                <div>
                  <div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
                    Batch Execution
                  </div>
                  <div className="text-xs" style={{ color: theme.colors.textDim }}>
                    Run multiple documents in sequence with loop and reset options
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Folder Selection */}
          <div
            className="p-4 rounded-lg border"
            style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgMain + '50' }}
          >
            <label className="block text-xs font-bold opacity-70 uppercase mb-2" style={{ color: theme.colors.textMain }}>
              Auto Run Folder
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={selectedFolder}
                onChange={(e) => setSelectedFolder(e.target.value)}
                placeholder={sessionName ? `Select Auto Run folder for ${sessionName}` : 'Select Auto Run folder'}
                className="flex-1 p-2 rounded border bg-transparent outline-none font-mono text-sm"
                style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
              />
              <button
                onClick={handleSelectFolder}
                className="p-2 rounded border hover:bg-white/5 transition-colors"
                style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
                title="Browse folders (Cmd+O)"
              >
                <Folder className="w-5 h-5" />
              </button>
            </div>
            {selectedFolder && (
              <div className="mt-2 text-xs">
                {folderValidation.checking ? (
                  <span style={{ color: theme.colors.textDim }}>Checking folder...</span>
                ) : folderValidation.valid ? (
                  <span style={{ color: theme.colors.success }}>
                    {folderValidation.docCount === 0
                      ? 'Folder found (no markdown documents yet)'
                      : `Found ${folderValidation.docCount} markdown document${folderValidation.docCount === 1 ? '' : 's'}`}
                  </span>
                ) : folderValidation.error ? (
                  <span style={{ color: theme.colors.error }}>{folderValidation.error}</span>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex justify-end gap-2" style={{ borderColor: theme.colors.border }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded border hover:bg-white/5 transition-colors"
            style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
          >
            Cancel
          </button>
          <button
            ref={continueButtonRef}
            onClick={handleContinue}
            disabled={!selectedFolder}
            className="px-4 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed outline-none focus:ring-2 focus:ring-offset-1"
            style={{
              backgroundColor: theme.colors.accent,
              color: theme.colors.accentForeground,
              '--tw-ring-color': theme.colors.accent,
            } as React.CSSProperties}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

import React, { useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Theme, Session } from '../types';
import { useLayerStack } from '../contexts/LayerStackContext';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';

interface RenameSessionModalProps {
  theme: Theme;
  value: string;
  setValue: (value: string) => void;
  onClose: () => void;
  sessions: Session[];
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  activeSessionId: string;
  /** Optional: specific session ID to rename (overrides activeSessionId) */
  targetSessionId?: string;
}

export function RenameSessionModal(props: RenameSessionModalProps) {
  const { theme, value, setValue, onClose, sessions, setSessions, activeSessionId, targetSessionId } = props;
  // Use targetSessionId if provided, otherwise fall back to activeSessionId
  const sessionIdToRename = targetSessionId || activeSessionId;
  const { registerLayer, unregisterLayer, updateLayerHandler } = useLayerStack();
  const layerIdRef = useRef<string>();
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleRename = () => {
    if (value.trim()) {
      const trimmedName = value.trim();

      // Find the target session to check for Claude session association
      const targetSession = sessions.find(s => s.id === sessionIdToRename);

      // Update local state
      setSessions(prev => prev.map(s =>
        s.id === sessionIdToRename ? { ...s, name: trimmedName } : s
      ));

      // Also update the Claude session name if this session has an associated Claude session
      if (targetSession?.claudeSessionId && targetSession?.cwd) {
        window.maestro.claude.updateSessionName(
          targetSession.cwd,
          targetSession.claudeSessionId,
          trimmedName
        ).catch(err => console.error('Failed to update Claude session name:', err));
      }

      onClose();
    }
  };

  // Register layer on mount
  useEffect(() => {
    const id = registerLayer({
      id: 'rename-session-modal',
      type: 'modal',
      priority: MODAL_PRIORITIES.RENAME_INSTANCE,
      blocksLowerLayers: true,
      capturesFocus: true,
      focusTrap: 'strict',
      ariaLabel: 'Rename Agent',
      onEscape: onClose
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

  // Auto-focus the input on mount
  useEffect(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] animate-in fade-in duration-200 outline-none"
      role="dialog"
      aria-modal="true"
      aria-label="Rename Agent"
      tabIndex={-1}
    >
      <div className="w-[400px] border rounded-lg shadow-2xl overflow-hidden" style={{ backgroundColor: theme.colors.bgSidebar, borderColor: theme.colors.border }}>
        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: theme.colors.border }}>
          <h2 className="text-sm font-bold" style={{ color: theme.colors.textMain }}>Rename Agent</h2>
          <button onClick={onClose} style={{ color: theme.colors.textDim }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleRename();
              }
            }}
            placeholder="Enter agent name..."
            className="w-full p-3 rounded border bg-transparent outline-none"
            style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded border hover:bg-white/5 transition-colors"
              style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
            >
              Cancel
            </button>
            <button
              onClick={handleRename}
              disabled={!value.trim()}
              className="px-4 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: theme.colors.accent, color: theme.colors.accentForeground }}
            >
              Rename
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

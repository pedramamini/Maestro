import React, { useEffect, useRef } from 'react';
import { X, Trash2 } from 'lucide-react';
import type { Theme } from '../types';
import { useLayerStack } from '../contexts/LayerStackContext';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';

interface PlaybookDeleteConfirmModalProps {
  theme: Theme;
  playbookName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PlaybookDeleteConfirmModal({
  theme,
  playbookName,
  onConfirm,
  onCancel
}: PlaybookDeleteConfirmModalProps) {
  const { registerLayer, unregisterLayer, updateLayerHandler } = useLayerStack();
  const layerIdRef = useRef<string>();
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // Auto-focus the confirm button so Enter will trigger it
  useEffect(() => {
    confirmButtonRef.current?.focus();
  }, []);

  // Register layer on mount
  useEffect(() => {
    const id = registerLayer({
      id: '',
      type: 'modal',
      priority: MODAL_PRIORITIES.PLAYBOOK_DELETE_CONFIRM,
      blocksLowerLayers: true,
      capturesFocus: true,
      focusTrap: 'strict',
      ariaLabel: 'Delete Playbook Confirmation',
      onEscape: onCancel
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
      updateLayerHandler(layerIdRef.current, onCancel);
    }
  }, [onCancel, updateLayerHandler]);

  const handleConfirmClick = () => {
    onConfirm();
    onCancel(); // Close the modal after confirming
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[10000] animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Delete Playbook Confirmation"
      tabIndex={-1}
      onKeyDown={(e) => {
        e.stopPropagation();
      }}
    >
      <div
        className="w-[400px] border rounded-lg shadow-2xl overflow-hidden"
        style={{ backgroundColor: theme.colors.bgSidebar, borderColor: theme.colors.border }}
      >
        {/* Header */}
        <div
          className="p-4 border-b flex items-center justify-between"
          style={{ borderColor: theme.colors.border }}
        >
          <div className="flex items-center gap-2">
            <Trash2 className="w-4 h-4" style={{ color: theme.colors.error }} />
            <h3 className="text-sm font-bold" style={{ color: theme.colors.textMain }}>
              Delete Playbook
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            style={{ color: theme.colors.textDim }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-sm leading-relaxed" style={{ color: theme.colors.textMain }}>
            Are you sure you want to delete "<strong>{playbookName}</strong>"?
          </p>
          <p className="text-xs mt-2" style={{ color: theme.colors.textDim }}>
            This cannot be undone.
          </p>
        </div>

        {/* Footer */}
        <div
          className="p-4 border-t flex justify-end gap-3"
          style={{ borderColor: theme.colors.border }}
        >
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded border hover:bg-white/5 transition-colors"
            style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
          >
            Cancel
          </button>
          <button
            ref={confirmButtonRef}
            onClick={handleConfirmClick}
            className="px-4 py-2 rounded font-bold text-white outline-none focus:ring-2 focus:ring-offset-1 transition-colors"
            style={{ backgroundColor: theme.colors.error }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

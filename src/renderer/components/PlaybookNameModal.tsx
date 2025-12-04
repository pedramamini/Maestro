import { useState, useRef, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import type { Theme } from '../types';
import { useLayerStack } from '../contexts/LayerStackContext';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';

interface PlaybookNameModalProps {
  theme: Theme;
  onSave: (name: string) => void;
  onCancel: () => void;
  /** Optional initial name for editing existing playbook */
  initialName?: string;
  /** Title shown in the modal header */
  title?: string;
  /** Button text for the save action */
  saveButtonText?: string;
}

export function PlaybookNameModal({
  theme,
  onSave,
  onCancel,
  initialName = '',
  title = 'Save Playbook',
  saveButtonText = 'Save'
}: PlaybookNameModalProps) {
  const [name, setName] = useState(initialName);
  const { registerLayer, unregisterLayer, updateLayerHandler } = useLayerStack();
  const layerIdRef = useRef<string>();
  const inputRef = useRef<HTMLInputElement>(null);

  // Register layer on mount
  useEffect(() => {
    const layerId = registerLayer({
      type: 'modal',
      priority: MODAL_PRIORITIES.PLAYBOOK_NAME,
      blocksLowerLayers: true,
      capturesFocus: true,
      focusTrap: 'strict',
      ariaLabel: title,
      onEscape: onCancel
    });
    layerIdRef.current = layerId;

    return () => {
      if (layerIdRef.current) {
        unregisterLayer(layerIdRef.current);
      }
    };
  }, [registerLayer, unregisterLayer, title]);

  // Update handler when dependencies change
  useEffect(() => {
    if (layerIdRef.current) {
      updateLayerHandler(layerIdRef.current, onCancel);
    }
  }, [onCancel, updateLayerHandler]);

  // Auto-focus the input on mount
  useEffect(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      // Select all text if there's an initial name
      if (initialName) {
        inputRef.current?.select();
      }
    });
  }, [initialName]);

  const handleSave = () => {
    const trimmedName = name.trim();
    if (trimmedName) {
      onSave(trimmedName);
    }
  };

  const isValid = name.trim().length > 0;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[10002] animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label={title}
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
            <Save className="w-4 h-4" style={{ color: theme.colors.accent }} />
            <h3 className="text-sm font-bold" style={{ color: theme.colors.textMain }}>
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            style={{ color: theme.colors.textDim }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <label
            className="block text-xs mb-2 font-medium"
            style={{ color: theme.colors.textDim }}
          >
            Playbook Name
          </label>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isValid) {
                e.preventDefault();
                handleSave();
              }
            }}
            placeholder="Enter playbook name..."
            className="w-full p-3 rounded border bg-transparent outline-none focus:ring-1"
            style={{
              borderColor: theme.colors.border,
              color: theme.colors.textMain
            }}
          />
          <p className="text-xs mt-2" style={{ color: theme.colors.textDim }}>
            Give your playbook a descriptive name to easily identify it later.
          </p>
        </div>

        {/* Footer */}
        <div
          className="p-4 border-t flex justify-end gap-3"
          style={{ borderColor: theme.colors.border }}
        >
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded border hover:bg-white/5 transition-colors"
            style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isValid}
            className="px-4 py-2 rounded font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: theme.colors.accent,
              color: theme.colors.accentForeground
            }}
          >
            {saveButtonText}
          </button>
        </div>
      </div>
    </div>
  );
}

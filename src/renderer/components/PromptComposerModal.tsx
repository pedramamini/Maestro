import React, { useEffect, useRef, useState } from 'react';
import { X, PenLine, Send } from 'lucide-react';
import type { Theme } from '../types';
import { useLayerStack } from '../contexts/LayerStackContext';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';

interface PromptComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: Theme;
  initialValue: string;
  onSubmit: (value: string) => void;
  onSend: (value: string) => void;
  sessionName?: string;
}

// Simple token estimation (roughly 4 chars per token for English text)
function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function PromptComposerModal({
  isOpen,
  onClose,
  theme,
  initialValue,
  onSubmit,
  onSend,
  sessionName = 'Claude'
}: PromptComposerModalProps) {
  const [value, setValue] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { registerLayer, unregisterLayer } = useLayerStack();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;
  const valueRef = useRef(value);
  valueRef.current = value;

  // Sync value when modal opens with new initialValue
  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
    }
  }, [isOpen, initialValue]);

  // Focus textarea when modal opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
      // Move cursor to end
      textareaRef.current.selectionStart = textareaRef.current.value.length;
      textareaRef.current.selectionEnd = textareaRef.current.value.length;
    }
  }, [isOpen]);

  // Register with layer stack for Escape handling
  useEffect(() => {
    if (isOpen) {
      const id = registerLayer({
        type: 'modal',
        priority: MODAL_PRIORITIES.PROMPT_COMPOSER,
        onEscape: () => {
          // Save the current value back before closing
          onSubmitRef.current(valueRef.current);
          onCloseRef.current();
        },
      });
      return () => unregisterLayer(id);
    }
  }, [isOpen, registerLayer, unregisterLayer]);

  if (!isOpen) return null;

  const handleSend = () => {
    if (!value.trim()) return;
    onSend(value);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl + Enter to send the message
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const tokenCount = estimateTokenCount(value);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onSubmit(value);
          onClose();
        }
      }}
    >
      <div
        className="w-[90vw] h-[80vh] max-w-5xl rounded-xl border shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: theme.colors.bgMain,
          borderColor: theme.colors.border,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgSidebar }}
        >
          <div className="flex items-center gap-2">
            <PenLine className="w-5 h-5" style={{ color: theme.colors.accent }} />
            <span className="font-medium" style={{ color: theme.colors.textMain }}>
              Prompt Composer
            </span>
            <span className="text-sm opacity-60" style={{ color: theme.colors.textDim }}>
              — {sessionName}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs opacity-50" style={{ color: theme.colors.textDim }}>
              <span style={{ fontFamily: 'system-ui' }}>⌘</span> + Enter to send
            </span>
            <button
              onClick={() => {
                onSubmit(value);
                onClose();
              }}
              className="p-1.5 rounded hover:bg-white/10 transition-colors"
              title="Close (Escape)"
            >
              <X className="w-5 h-5" style={{ color: theme.colors.textDim }} />
            </button>
          </div>
        </div>

        {/* Textarea */}
        <div className="flex-1 p-4 overflow-hidden">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full h-full bg-transparent resize-none outline-none text-base leading-relaxed scrollbar-thin"
            style={{ color: theme.colors.textMain }}
            placeholder="Write your prompt here..."
          />
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-4 py-3 border-t"
          style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgSidebar }}
        >
          <div className="text-xs flex items-center gap-3" style={{ color: theme.colors.textDim }}>
            <span>{value.length} characters</span>
            <span>~{tokenCount.toLocaleString()} tokens</span>
          </div>
          <button
            onClick={handleSend}
            disabled={!value.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: theme.colors.accent,
              color: theme.colors.accentForeground,
            }}
          >
            <Send className="w-4 h-4" />
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

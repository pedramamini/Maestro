import React from 'react';
import { Terminal, Cpu, Keyboard, ImageIcon, X, ArrowUp } from 'lucide-react';
import type { Session, Theme } from '../types';

interface InputAreaProps {
  session: Session;
  theme: Theme;
  inputValue: string;
  setInputValue: (value: string) => void;
  enterToSend: boolean;
  setEnterToSend: (value: boolean) => void;
  stagedImages: string[];
  setStagedImages: React.Dispatch<React.SetStateAction<string[]>>;
  setLightboxImage: (image: string | null) => void;
  commandHistoryOpen: boolean;
  setCommandHistoryOpen: (open: boolean) => void;
  commandHistoryFilter: string;
  setCommandHistoryFilter: (filter: string) => void;
  commandHistorySelectedIndex: number;
  setCommandHistorySelectedIndex: (index: number) => void;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  handleInputKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handlePaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  handleDrop: (e: React.DragEvent<HTMLTextAreaElement>) => void;
  toggleInputMode: () => void;
  processInput: () => void;
}

export function InputArea(props: InputAreaProps) {
  const {
    session, theme, inputValue, setInputValue, enterToSend, setEnterToSend,
    stagedImages, setStagedImages, setLightboxImage, commandHistoryOpen,
    setCommandHistoryOpen, commandHistoryFilter, setCommandHistoryFilter,
    commandHistorySelectedIndex, setCommandHistorySelectedIndex,
    inputRef, handleInputKeyDown, handlePaste, handleDrop,
    toggleInputMode, processInput
  } = props;

  return (
    <div className="relative p-4 border-t" style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgSidebar }}>
      {stagedImages.length > 0 && (
        <div className="flex gap-2 mb-3 pb-2 overflow-x-auto overflow-y-visible">
          {stagedImages.map((img, idx) => (
            <div key={idx} className="relative group">
              <img
                src={img}
                className="h-16 rounded border cursor-pointer hover:opacity-80 transition-opacity"
                style={{ borderColor: theme.colors.border }}
                onClick={() => setLightboxImage(img)}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setStagedImages(p => p.filter((_, i) => i !== idx));
                }}
                className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors opacity-90 hover:opacity-100"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Command History Modal */}
      {commandHistoryOpen && (
        <div
          className="absolute bottom-full left-0 right-0 mb-2 border rounded-lg shadow-2xl max-h-64 overflow-hidden"
          style={{ backgroundColor: theme.colors.bgSidebar, borderColor: theme.colors.border }}
          onKeyDown={(e) => {
            const history = session.commandHistory || [];
            const filtered = history.filter(cmd =>
              cmd.toLowerCase().includes(commandHistoryFilter.toLowerCase())
            ).reverse().slice(0, 5);

            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setCommandHistorySelectedIndex(Math.min(commandHistorySelectedIndex + 1, filtered.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setCommandHistorySelectedIndex(Math.max(commandHistorySelectedIndex - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (filtered[commandHistorySelectedIndex]) {
                setInputValue(filtered[commandHistorySelectedIndex]);
                setCommandHistoryOpen(false);
                setCommandHistoryFilter('');
                inputRef.current?.focus();
              }
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setCommandHistoryOpen(false);
              setCommandHistoryFilter('');
              inputRef.current?.focus();
            }
          }}
        >
          <div className="p-2">
            <input
              autoFocus
              type="text"
              className="w-full bg-transparent outline-none text-sm p-2 border-b"
              style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
              placeholder="Filter commands..."
              value={commandHistoryFilter}
              onChange={(e) => {
                setCommandHistoryFilter(e.target.value);
                setCommandHistorySelectedIndex(0);
              }}
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {(session.commandHistory || [])
              .filter(cmd => cmd.toLowerCase().includes(commandHistoryFilter.toLowerCase()))
              .reverse()
              .slice(0, 5)
              .map((cmd, idx) => (
                <div
                  key={idx}
                  className={`px-3 py-2 cursor-pointer text-sm font-mono ${idx === commandHistorySelectedIndex ? 'ring-1 ring-inset' : ''}`}
                  style={{
                    backgroundColor: idx === commandHistorySelectedIndex ? theme.colors.bgActivity : 'transparent',
                    ringColor: theme.colors.accent,
                    color: theme.colors.textMain
                  }}
                  onClick={() => {
                    setInputValue(cmd);
                    setCommandHistoryOpen(false);
                    setCommandHistoryFilter('');
                    inputRef.current?.focus();
                  }}
                  onMouseEnter={() => setCommandHistorySelectedIndex(idx)}
                >
                  {cmd}
                </div>
              ))}
            {(session.commandHistory || []).filter(cmd =>
              cmd.toLowerCase().includes(commandHistoryFilter.toLowerCase())
            ).length === 0 && (
              <div className="px-3 py-4 text-center text-sm opacity-50">No matching commands</div>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <div className="flex-1 relative border rounded-lg bg-opacity-50 flex flex-col" style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgMain }}>
          <textarea
            ref={inputRef}
            className="w-full bg-transparent text-sm outline-none p-3 resize-none min-h-[2.5rem] max-h-[8rem] scrollbar-thin"
            style={{ color: theme.colors.textMain }}
            placeholder={session.inputMode === 'terminal' ? "Run shell command..." : "Ask Claude..."}
            value={inputValue}
            onChange={e => {
              setInputValue(e.target.value);
              // Auto-grow logic
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
            }}
            onKeyDown={handleInputKeyDown}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            rows={1}
          />

          <div className="flex justify-between items-center px-2 pb-2">
            <div className="flex gap-1 items-center">
              {session.inputMode === 'terminal' && (
                <div className="text-[10px] font-mono opacity-50 px-2" style={{ color: theme.colors.textDim }}>
                  {session.cwd?.replace(/^\/Users\/[^\/]+/, '~') || '~'}
                </div>
              )}
              {session.inputMode === 'ai' && (
                <button
                  onClick={() => document.getElementById('image-file-input')?.click()}
                  className="p-1 hover:bg-white/10 rounded opacity-50 hover:opacity-100"
                  title="Attach Image"
                >
                  <ImageIcon className="w-4 h-4"/>
                </button>
              )}
              <input
                id="image-file-input"
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  files.forEach(file => {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      if (event.target?.result) {
                        setStagedImages(prev => [...prev, event.target!.result as string]);
                      }
                    };
                    reader.readAsDataURL(file);
                  });
                  e.target.value = '';
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEnterToSend(!enterToSend)}
                className="flex items-center gap-1 text-[10px] opacity-50 hover:opacity-100 px-2 py-1 rounded hover:bg-white/5"
                title={enterToSend ? "Switch to Meta+Enter to send" : "Switch to Enter to send"}
              >
                <Keyboard className="w-3 h-3" />
                {enterToSend ? 'Enter' : '⌘ + Enter'}
              </button>
            </div>
          </div>
        </div>

        {/* Mode Toggle & Send Button - Right Side */}
        <div className="flex flex-col gap-2">
          <button
            onClick={toggleInputMode}
            className="p-2 rounded border transition-all"
            style={{
              backgroundColor: session.inputMode === 'terminal' ? theme.colors.bgActivity : theme.colors.accentDim,
              borderColor: theme.colors.border,
              color: session.inputMode === 'terminal' ? theme.colors.textDim : theme.colors.accentText
            }}
            title="Toggle Mode (Cmd+J)"
          >
            {session.inputMode === 'terminal' ? <Terminal className="w-4 h-4" /> : <Cpu className="w-4 h-4" />}
          </button>
          <button
            onClick={processInput}
            className="p-2 rounded-md text-white hover:opacity-90 shadow-sm transition-all"
            style={{ backgroundColor: theme.colors.accent }}
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Mobile Scratchpad Component
 *
 * A simplified scratchpad for viewing and editing task lists from mobile.
 * Supports viewing markdown, editing tasks, and toggling checkboxes.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useThemeColors } from '../components/ThemeProvider';
import {
  X,
  Edit,
  Eye,
  Play,
  Square,
  Loader2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import type { AutoRunState } from '../hooks/useWebSocket';

interface MobileScratchpadProps {
  isOpen: boolean;
  onClose: () => void;
  content: string;
  onContentChange: (content: string) => void;
  sessionId: string;
  sessionName?: string;
  autoRunState?: AutoRunState | null;
  onStartAutoRun?: () => void;
  onStopAutoRun?: () => void;
  isSessionBusy?: boolean;
}

/**
 * Count unchecked tasks in markdown content
 */
function countUncheckedTasks(content: string): number {
  if (!content) return 0;
  const matches = content.match(/^[\s]*-\s*\[\s*\]\s*.+$/gm);
  return matches ? matches.length : 0;
}

/**
 * Count checked tasks in markdown content
 */
function countCheckedTasks(content: string): number {
  if (!content) return 0;
  const matches = content.match(/^[\s]*-\s*\[x\]\s*.+$/gim);
  return matches ? matches.length : 0;
}

/**
 * Simple markdown renderer for task lists
 * Renders checkboxes as interactive elements
 */
function TaskListRenderer({
  content,
  onToggleTask,
  colors
}: {
  content: string;
  onToggleTask: (lineIndex: number) => void;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const lines = content.split('\n');

  return (
    <div style={{ color: colors.textMain }}>
      {lines.map((line, index) => {
        // Check for unchecked task: - [ ] task
        const uncheckedMatch = line.match(/^(\s*)-\s*\[\s*\]\s*(.+)$/);
        if (uncheckedMatch) {
          const [, indent, text] = uncheckedMatch;
          return (
            <div
              key={index}
              className="flex items-start gap-2 py-1"
              style={{ paddingLeft: `${(indent?.length || 0) * 8}px` }}
            >
              <button
                onClick={() => onToggleTask(index)}
                className="w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 hover:bg-white/10 transition-colors"
                style={{ borderColor: colors.accent }}
              />
              <span className="text-sm leading-relaxed">{text}</span>
            </div>
          );
        }

        // Check for checked task: - [x] task
        const checkedMatch = line.match(/^(\s*)-\s*\[x\]\s*(.+)$/i);
        if (checkedMatch) {
          const [, indent, text] = checkedMatch;
          return (
            <div
              key={index}
              className="flex items-start gap-2 py-1"
              style={{ paddingLeft: `${(indent?.length || 0) * 8}px` }}
            >
              <button
                onClick={() => onToggleTask(index)}
                className="w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center hover:opacity-80 transition-opacity"
                style={{
                  borderColor: colors.accent,
                  backgroundColor: colors.accent
                }}
              >
                <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 6l3 3 5-5" />
                </svg>
              </button>
              <span
                className="text-sm leading-relaxed line-through"
                style={{ color: colors.textDim }}
              >
                {text}
              </span>
            </div>
          );
        }

        // Check for header
        const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headerMatch) {
          const [, hashes, text] = headerMatch;
          const level = hashes.length;
          const fontSize = {
            1: '1.5em',
            2: '1.25em',
            3: '1.1em',
            4: '1em',
            5: '0.9em',
            6: '0.85em',
          }[level] || '1em';

          return (
            <div
              key={index}
              className="font-bold py-2"
              style={{ fontSize }}
            >
              {text}
            </div>
          );
        }

        // Regular text or empty line
        if (line.trim() === '') {
          return <div key={index} className="h-2" />;
        }

        return (
          <div key={index} className="text-sm py-0.5 leading-relaxed">
            {line}
          </div>
        );
      })}
    </div>
  );
}

export function MobileScratchpad({
  isOpen,
  onClose,
  content,
  onContentChange,
  sessionName,
  autoRunState,
  onStartAutoRun,
  onStopAutoRun,
  isSessionBusy,
}: MobileScratchpadProps) {
  const colors = useThemeColors();
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [localContent, setLocalContent] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showStats, setShowStats] = useState(true);

  // Sync local content when prop changes
  useEffect(() => {
    setLocalContent(content);
  }, [content]);

  // Focus textarea when switching to edit mode
  useEffect(() => {
    if (mode === 'edit' && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [mode]);

  // Calculate task stats
  const uncheckedCount = countUncheckedTasks(localContent);
  const checkedCount = countCheckedTasks(localContent);
  const totalTasks = uncheckedCount + checkedCount;

  // Handle toggling a task checkbox
  const handleToggleTask = useCallback((lineIndex: number) => {
    const lines = localContent.split('\n');
    const line = lines[lineIndex];

    // Toggle unchecked -> checked
    if (/^(\s*)-\s*\[\s*\]\s*/.test(line)) {
      lines[lineIndex] = line.replace(/^(\s*)-\s*\[\s*\]\s*/, '$1- [x] ');
    }
    // Toggle checked -> unchecked
    else if (/^(\s*)-\s*\[x\]\s*/i.test(line)) {
      lines[lineIndex] = line.replace(/^(\s*)-\s*\[x\]\s*/i, '$1- [ ] ');
    }

    const newContent = lines.join('\n');
    setLocalContent(newContent);
    onContentChange(newContent);
  }, [localContent, onContentChange]);

  // Handle saving edits
  const handleSave = useCallback(() => {
    onContentChange(localContent);
    setMode('view');
  }, [localContent, onContentChange]);

  // Handle cancel edits
  const handleCancel = useCallback(() => {
    setLocalContent(content);
    setMode('view');
  }, [content]);

  // AutoRun state
  const isAutoRunning = autoRunState?.isRunning || false;
  const isStopping = autoRunState?.isStopping || false;
  const canStartAutoRun = !isAutoRunning && !isSessionBusy && uncheckedCount > 0;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: colors.bgMain }}
    >
      {/* Header */}
      <header
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{
          borderColor: colors.border,
          backgroundColor: colors.bgSidebar,
          paddingTop: 'max(12px, env(safe-area-inset-top))',
        }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            style={{ color: colors.textDim }}
          >
            <X className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-semibold" style={{ color: colors.textMain }}>
              Scratchpad
            </h1>
            {sessionName && (
              <p className="text-xs" style={{ color: colors.textDim }}>
                {sessionName}
              </p>
            )}
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode('view')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors ${
              mode === 'view' ? 'font-semibold' : ''
            }`}
            style={{
              backgroundColor: mode === 'view' ? colors.bgActivity : 'transparent',
              color: mode === 'view' ? colors.textMain : colors.textDim,
              border: `1px solid ${mode === 'view' ? colors.accent : colors.border}`,
            }}
          >
            <Eye className="w-3.5 h-3.5" />
            View
          </button>
          <button
            onClick={() => setMode('edit')}
            disabled={isAutoRunning}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors ${
              mode === 'edit' ? 'font-semibold' : ''
            } ${isAutoRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
            style={{
              backgroundColor: mode === 'edit' ? colors.bgActivity : 'transparent',
              color: mode === 'edit' ? colors.textMain : colors.textDim,
              border: `1px solid ${mode === 'edit' ? colors.accent : colors.border}`,
            }}
          >
            <Edit className="w-3.5 h-3.5" />
            Edit
          </button>
        </div>
      </header>

      {/* Stats bar */}
      <div
        className="px-4 py-2 border-b"
        style={{ borderColor: colors.border, backgroundColor: colors.bgSidebar }}
      >
        <button
          onClick={() => setShowStats(!showStats)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span
                className="text-lg font-bold"
                style={{ color: uncheckedCount > 0 ? colors.warning : colors.success }}
              >
                {uncheckedCount}
              </span>
              <span className="text-xs" style={{ color: colors.textDim }}>
                remaining
              </span>
            </div>
            {totalTasks > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm" style={{ color: colors.success }}>
                  {checkedCount}/{totalTasks}
                </span>
                <span className="text-xs" style={{ color: colors.textDim }}>
                  completed
                </span>
              </div>
            )}
          </div>
          {showStats ? (
            <ChevronUp className="w-4 h-4" style={{ color: colors.textDim }} />
          ) : (
            <ChevronDown className="w-4 h-4" style={{ color: colors.textDim }} />
          )}
        </button>

        {/* AutoRun status (when running) */}
        {isAutoRunning && showStats && (
          <div
            className="mt-2 p-2 rounded flex items-center justify-between"
            style={{ backgroundColor: colors.bgActivity }}
          >
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: colors.accent }} />
              <span className="text-xs" style={{ color: colors.textMain }}>
                AutoRun: {autoRunState?.completedTasks || 0}/{autoRunState?.totalTasks || 0} tasks
              </span>
            </div>
            {isStopping && (
              <span className="text-xs" style={{ color: colors.warning }}>
                Stopping...
              </span>
            )}
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-4">
        {mode === 'view' ? (
          <TaskListRenderer
            content={localContent}
            onToggleTask={handleToggleTask}
            colors={colors}
          />
        ) : (
          <textarea
            ref={textareaRef}
            value={localContent}
            onChange={(e) => setLocalContent(e.target.value)}
            className="w-full h-full min-h-[300px] p-3 rounded border bg-transparent outline-none resize-none font-mono text-sm"
            style={{
              borderColor: colors.border,
              color: colors.textMain,
            }}
            placeholder="Write your tasks in markdown format:

# Project Tasks

- [ ] First task
- [ ] Second task
- [x] Completed task"
          />
        )}
      </div>

      {/* Footer with actions */}
      <footer
        className="px-4 py-3 border-t flex items-center justify-between gap-2"
        style={{
          borderColor: colors.border,
          backgroundColor: colors.bgSidebar,
          paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        }}
      >
        {mode === 'edit' ? (
          <>
            <button
              onClick={handleCancel}
              className="px-4 py-2 rounded border text-sm hover:bg-white/5 transition-colors"
              style={{ borderColor: colors.border, color: colors.textMain }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 rounded text-sm font-semibold text-white"
              style={{ backgroundColor: colors.accent }}
            >
              Save
            </button>
          </>
        ) : (
          <>
            <div className="text-xs" style={{ color: colors.textDim }}>
              Tap checkboxes to toggle
            </div>
            {isAutoRunning ? (
              <button
                onClick={onStopAutoRun}
                disabled={isStopping}
                className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-semibold text-white ${
                  isStopping ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                style={{ backgroundColor: colors.error }}
              >
                {isStopping ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                {isStopping ? 'Stopping...' : 'Stop'}
              </button>
            ) : (
              <button
                onClick={onStartAutoRun}
                disabled={!canStartAutoRun}
                className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-semibold text-white ${
                  !canStartAutoRun ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                style={{ backgroundColor: canStartAutoRun ? colors.accent : colors.textDim }}
                title={
                  isSessionBusy
                    ? 'Session is busy'
                    : uncheckedCount === 0
                      ? 'No tasks to run'
                      : 'Start AutoRun'
                }
              >
                <Play className="w-4 h-4" />
                Run ({uncheckedCount})
              </button>
            )}
          </>
        )}
      </footer>
    </div>
  );
}

export default MobileScratchpad;

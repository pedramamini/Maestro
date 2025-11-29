import React, { useState, useEffect, useRef } from 'react';
import { X, RotateCcw, Play, Variable, ChevronDown, ChevronRight, Save } from 'lucide-react';
import type { Theme } from '../types';
import { useLayerStack } from '../contexts/LayerStackContext';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';
import { TEMPLATE_VARIABLES } from '../utils/templateVariables';

// Default batch processing prompt
export const DEFAULT_BATCH_PROMPT = `CRITICAL: You must complete EXACTLY ONE task and then exit. Do not attempt multiple tasks.

Your responsibilities are as follows:

1. Project Orientation
    Begin by reviewing claude.md in this folder to understand the project's structure, conventions, and workflow expectations.

2. Task Selection
    Navigate to $$SCRATCHPAD$$ and select the FIRST unchecked task (- [ ]) from top to bottom. Note that there may be relevant images associated with the task, analyze them, and include in your final synopsis back how many images you analyzed in preparation for solving the task.

    IMPORTANT: You will only work on this single task. If it appears to have logical subtasks, treat them as one cohesive unit—but do not move on to the next top-level task.

3. Task Evaluation
    - Fully understand the task and inspect the relevant code.
    - If you determine the task should not be executed, mark it as completed anyway and record a concise explanation of why it was skipped.

4. Task Implementation
    Implement the task according to the project's established style, architecture, and coding norms.

5. Completion + Reporting
    - Mark the task as completed in the scratchpad by changing - [ ] to - [x].
    - CRITICAL: Your FIRST sentence MUST be a specific synopsis of what you accomplished (e.g., "Added pagination to the user list component" or "Refactored auth middleware to use JWT tokens"). Never start with generic phrases like "Task completed successfully" - always lead with the specific work done.
    - Follow with any relevant details about:
      - Implementation approach or key decisions made
      - Why the task was intentionally skipped (if applicable)
      - If implementation failed, explain the failure and do NOT check off the item.

6. Version Control
    For any code or documentation changes:
    - Commit using a descriptive message prefixed with MAESTRO:.
    - Push to GitHub.
    - Update claude.md, README.md, or any other top-level documentation if appropriate.

7. Exit Immediately
    After completing (or skipping) the single task, EXIT. Do not proceed to additional tasks—another agent instance will handle them.

NOTE: If you see a clear issue tag like a little moniker or some short form in front of the task, then your synopsis message should start with that exact token because we're clearly using it as a unique identifier.

If there are no remaining open tasks, exit immediately and state that there is nothing left to do.`;

interface BatchRunnerModalProps {
  theme: Theme;
  onClose: () => void;
  onGo: (prompt: string) => void;
  onSave: (prompt: string) => void;
  initialPrompt?: string;
  lastModifiedAt?: number;
  showConfirmation: (message: string, onConfirm: () => void) => void;
}

// Helper function to format the last modified date
function formatLastModified(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } else if (diffDays === 1) {
    return `yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }
}

export function BatchRunnerModal(props: BatchRunnerModalProps) {
  const { theme, onClose, onGo, onSave, initialPrompt, lastModifiedAt, showConfirmation } = props;

  const [prompt, setPrompt] = useState(initialPrompt || DEFAULT_BATCH_PROMPT);
  const [variablesExpanded, setVariablesExpanded] = useState(false);
  const [savedPrompt, setSavedPrompt] = useState(initialPrompt || '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { registerLayer, unregisterLayer, updateLayerHandler } = useLayerStack();
  const layerIdRef = useRef<string>();

  // Register layer on mount
  useEffect(() => {
    const id = registerLayer({
      type: 'modal',
      priority: MODAL_PRIORITIES.BATCH_RUNNER,
      onEscape: () => {
        onClose();
      }
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
      updateLayerHandler(layerIdRef.current, () => {
        onClose();
      });
    }
  }, [onClose, updateLayerHandler]);

  // Focus textarea on mount
  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 100);
  }, []);

  const handleReset = () => {
    showConfirmation(
      'Reset the prompt to the default? Your customizations will be lost.',
      () => {
        setPrompt(DEFAULT_BATCH_PROMPT);
      }
    );
  };

  const handleSave = () => {
    onSave(prompt);
    setSavedPrompt(prompt);
  };

  const handleGo = () => {
    // Also save when running
    onSave(prompt);
    onGo(prompt);
    onClose();
  };

  const isModified = prompt !== DEFAULT_BATCH_PROMPT;
  const hasUnsavedChanges = prompt !== savedPrompt && prompt !== DEFAULT_BATCH_PROMPT;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Batch Runner"
      tabIndex={-1}
    >
      <div
        className="w-[700px] max-h-[80vh] border rounded-lg shadow-2xl overflow-hidden flex flex-col"
        style={{ backgroundColor: theme.colors.bgSidebar, borderColor: theme.colors.border }}
      >
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: theme.colors.border }}>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-bold" style={{ color: theme.colors.textMain }}>
                Batch Run Configuration
              </h2>
              {isModified && (
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: theme.colors.accent + '20', color: theme.colors.accent }}
                >
                  CUSTOMIZED
                </span>
              )}
            </div>
            {isModified && lastModifiedAt && (
              <span className="text-[10px]" style={{ color: theme.colors.textDim }}>
                Last modified {formatLastModified(lastModifiedAt)}
              </span>
            )}
          </div>
          <button onClick={onClose} style={{ color: theme.colors.textDim }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col p-6 gap-4">
          <div className="flex flex-col gap-2 flex-1 min-h-0">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase" style={{ color: theme.colors.textDim }}>
                Agent Prompt
              </label>
              <button
                onClick={handleReset}
                disabled={!isModified}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ color: theme.colors.textDim }}
                title="Reset to default prompt"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            </div>
            <div className="text-[10px] mb-2" style={{ color: theme.colors.textDim }}>
              Use <code className="px-1 py-0.5 rounded" style={{ backgroundColor: theme.colors.bgActivity }}>$$SCRATCHPAD$$</code> as placeholder for the scratchpad file path
            </div>

            {/* Template Variables Documentation */}
            <div
              className="rounded-lg border overflow-hidden mb-2"
              style={{ backgroundColor: theme.colors.bgMain, borderColor: theme.colors.border }}
            >
              <button
                onClick={() => setVariablesExpanded(!variablesExpanded)}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Variable className="w-3.5 h-3.5" style={{ color: theme.colors.accent }} />
                  <span className="text-xs font-bold uppercase" style={{ color: theme.colors.textDim }}>
                    Template Variables
                  </span>
                </div>
                {variablesExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" style={{ color: theme.colors.textDim }} />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" style={{ color: theme.colors.textDim }} />
                )}
              </button>
              {variablesExpanded && (
                <div className="px-3 pb-3 pt-1 border-t" style={{ borderColor: theme.colors.border }}>
                  <p className="text-[10px] mb-2" style={{ color: theme.colors.textDim }}>
                    Use these variables in your prompt. They will be replaced with actual values at runtime.
                  </p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 max-h-48 overflow-y-auto scrollbar-thin">
                    {TEMPLATE_VARIABLES.map(({ variable, description }) => (
                      <div key={variable} className="flex items-center gap-2 py-0.5">
                        <code
                          className="text-[10px] font-mono px-1 py-0.5 rounded shrink-0"
                          style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.accent }}
                        >
                          {variable}
                        </code>
                        <span className="text-[10px] truncate" style={{ color: theme.colors.textDim }}>
                          {description}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="flex-1 w-full p-4 rounded border bg-transparent outline-none resize-none font-mono text-sm"
              style={{
                borderColor: theme.colors.border,
                color: theme.colors.textMain,
                minHeight: '300px'
              }}
              placeholder="Enter the prompt for the batch agent..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex justify-end gap-2 shrink-0" style={{ borderColor: theme.colors.border }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded border hover:bg-white/5 transition-colors"
            style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!hasUnsavedChanges}
            className="flex items-center gap-2 px-4 py-2 rounded border hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ borderColor: theme.colors.border, color: theme.colors.success }}
            title={hasUnsavedChanges ? 'Save prompt for this session' : 'No unsaved changes'}
          >
            <Save className="w-4 h-4" />
            Save
          </button>
          <button
            onClick={handleGo}
            className="flex items-center gap-2 px-4 py-2 rounded text-white font-bold"
            style={{ backgroundColor: theme.colors.accent }}
          >
            <Play className="w-4 h-4" />
            Go
          </button>
        </div>
      </div>
    </div>
  );
}

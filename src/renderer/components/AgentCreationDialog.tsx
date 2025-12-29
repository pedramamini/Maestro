/**
 * AgentCreationDialog
 *
 * Dialog for selecting an AI provider and creating a dedicated agent session
 * for a Symphony contribution. Shown when user clicks "Start Symphony" on an issue.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Music,
  X,
  Loader2,
  Bot,
  Settings,
  FolderOpen,
} from 'lucide-react';
import type { Theme } from '../types';
import type { RegisteredRepository, SymphonyIssue } from '../../shared/symphony-types';
import { useLayerStack } from '../contexts/LayerStackContext';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';

// ============================================================================
// Types
// ============================================================================

/**
 * Minimal agent info needed for the agent selection card.
 * Compatible with the IPC API response (global.d.ts AgentConfig).
 */
interface AgentInfo {
  id: string;
  name: string;
  command: string;
  available: boolean;
  path?: string;
  hidden?: boolean;
}

export interface AgentCreationDialogProps {
  theme: Theme;
  isOpen: boolean;
  onClose: () => void;
  repo: RegisteredRepository;
  issue: SymphonyIssue;
  onCreateAgent: (config: AgentCreationConfig) => Promise<{ success: boolean; error?: string }>;
}

export interface AgentCreationConfig {
  /** Selected agent type (e.g., 'claude-code') */
  agentType: string;
  /** Session name (pre-filled, editable) */
  sessionName: string;
  /** Working directory (pre-filled, usually not editable) */
  workingDirectory: string;
  /** Repository being contributed to */
  repo: RegisteredRepository;
  /** Issue being worked on */
  issue: SymphonyIssue;
}

// ============================================================================
// Agent Selection Card
// ============================================================================

function AgentCard({
  agent,
  theme,
  isSelected,
  onSelect,
}: {
  agent: AgentInfo;
  theme: Theme;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full p-4 rounded-lg border text-left transition-all hover:bg-white/5 ${
        isSelected ? 'ring-2' : ''
      }`}
      style={{
        backgroundColor: isSelected ? theme.colors.bgActivity : 'transparent',
        borderColor: isSelected ? theme.colors.accent : theme.colors.border,
        ...(isSelected && { boxShadow: `0 0 0 2px ${theme.colors.accent}` }),
      }}
    >
      <div className="flex items-center gap-3">
        <Bot className="w-6 h-6" style={{ color: isSelected ? theme.colors.accent : theme.colors.textDim }} />
        <div className="flex-1 min-w-0">
          <h4 className="font-medium" style={{ color: theme.colors.textMain }}>
            {agent.name}
          </h4>
          <p className="text-xs truncate" style={{ color: theme.colors.textDim }}>
            {agent.path ?? agent.command}
          </p>
        </div>
        {isSelected && (
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.colors.accent }} />
        )}
      </div>
    </button>
  );
}

// ============================================================================
// Main Dialog Component
// ============================================================================

export function AgentCreationDialog({
  theme,
  isOpen,
  onClose,
  repo,
  issue,
  onCreateAgent,
}: AgentCreationDialogProps) {
  const { registerLayer, unregisterLayer } = useLayerStack();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // State
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [isLoadingAgents, setIsLoadingAgents] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [sessionName, setSessionName] = useState('');
  const [workingDirectory, setWorkingDirectory] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate default session name
  useEffect(() => {
    if (isOpen && repo && issue) {
      setSessionName(`Symphony: ${repo.slug} #${issue.number}`);
      // Default working directory: ~/Maestro-Symphony/{owner}-{repo}/
      const [owner, repoName] = repo.slug.split('/');
      // Note: getHomePath may not be available in all contexts
      const homeDir = '~';
      setWorkingDirectory(`${homeDir}/Maestro-Symphony/${owner}-${repoName}`);
    }
  }, [isOpen, repo, issue]);

  // Fetch available agents
  useEffect(() => {
    if (isOpen) {
      setIsLoadingAgents(true);
      setError(null);
      window.maestro.agents.detect()
        .then((detectedAgents: AgentInfo[]) => {
          // Filter to only agents that are available and not hidden (like terminal)
          const compatibleAgents = detectedAgents.filter((a: AgentInfo) =>
            a.id !== 'terminal' && a.available && !a.hidden
          );
          setAgents(compatibleAgents);
          // Auto-select first agent (usually Claude Code)
          if (compatibleAgents.length > 0 && !selectedAgent) {
            setSelectedAgent(compatibleAgents[0].id);
          }
        })
        .catch((err: Error) => {
          setError('Failed to detect available agents');
          console.error('Agent detection failed:', err);
        })
        .finally(() => {
          setIsLoadingAgents(false);
        });
    }
  }, [isOpen]);

  // Layer stack registration
  useEffect(() => {
    if (isOpen) {
      const id = registerLayer({
        type: 'modal',
        priority: MODAL_PRIORITIES.SYMPHONY_AGENT_CREATION ?? 711,
        blocksLowerLayers: true,
        capturesFocus: true,
        focusTrap: 'strict',
        ariaLabel: 'Create Agent for Symphony Contribution',
        onEscape: () => onCloseRef.current(),
      });
      return () => unregisterLayer(id);
    }
  }, [isOpen, registerLayer, unregisterLayer]);

  // Handle create
  const handleCreate = useCallback(async () => {
    if (!selectedAgent || !sessionName.trim()) return;

    setIsCreating(true);
    setError(null);

    try {
      const result = await onCreateAgent({
        agentType: selectedAgent,
        sessionName: sessionName.trim(),
        workingDirectory,
        repo,
        issue,
      });

      if (!result.success) {
        setError(result.error ?? 'Failed to create agent session');
      }
      // On success, parent will close dialog
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent');
    } finally {
      setIsCreating(false);
    }
  }, [selectedAgent, sessionName, workingDirectory, repo, issue, onCreateAgent]);

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 modal-overlay flex items-center justify-center z-[9999] animate-in fade-in duration-100"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-creation-dialog-title"
        tabIndex={-1}
        className="w-[500px] max-w-[95vw] rounded-xl shadow-2xl border overflow-hidden flex flex-col outline-none"
        style={{ backgroundColor: theme.colors.bgActivity, borderColor: theme.colors.border }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: theme.colors.border }}>
          <div className="flex items-center gap-2">
            <Music className="w-5 h-5" style={{ color: theme.colors.accent }} />
            <h2 id="agent-creation-dialog-title" className="text-lg font-semibold" style={{ color: theme.colors.textMain }}>
              Create Agent Session
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/10 transition-colors" title="Close (Esc)">
            <X className="w-4 h-4" style={{ color: theme.colors.textDim }} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Issue info */}
          <div className="p-3 rounded-lg" style={{ backgroundColor: theme.colors.bgMain }}>
            <p className="text-xs mb-1" style={{ color: theme.colors.textDim }}>Contributing to</p>
            <p className="font-medium" style={{ color: theme.colors.textMain }}>{repo.name}</p>
            <p className="text-sm" style={{ color: theme.colors.textDim }}>
              #{issue.number}: {issue.title}
            </p>
            <p className="text-xs mt-1" style={{ color: theme.colors.textDim }}>
              {issue.documentPaths.length} Auto Run document{issue.documentPaths.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Agent selection */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.colors.textMain }}>
              <Bot className="w-4 h-4 inline mr-1" />
              Select AI Provider
            </label>
            {isLoadingAgents ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: theme.colors.accent }} />
              </div>
            ) : agents.length === 0 ? (
              <div className="text-center py-4" style={{ color: theme.colors.textDim }}>
                No AI agents detected. Please install Claude Code or another supported agent.
              </div>
            ) : (
              <div className="space-y-2">
                {agents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    theme={theme}
                    isSelected={selectedAgent === agent.id}
                    onSelect={() => setSelectedAgent(agent.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Session name */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.colors.textMain }}>
              <Settings className="w-4 h-4 inline mr-1" />
              Session Name
            </label>
            <input
              type="text"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              className="w-full px-3 py-2 rounded border bg-transparent outline-none text-sm focus:ring-1"
              style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
              placeholder="Symphony: owner/repo #123"
            />
          </div>

          {/* Working directory (read-only display) */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.colors.textMain }}>
              <FolderOpen className="w-4 h-4 inline mr-1" />
              Working Directory
            </label>
            <div
              className="px-3 py-2 rounded border text-sm truncate"
              style={{ backgroundColor: theme.colors.bgMain, borderColor: theme.colors.border, color: theme.colors.textDim }}
              title={workingDirectory}
            >
              {workingDirectory}
            </div>
            <p className="text-xs mt-1" style={{ color: theme.colors.textDim }}>
              Repository will be cloned here
            </p>
          </div>

          {/* Error display */}
          {error && (
            <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: '#cc331120', color: '#cc3311' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t" style={{ borderColor: theme.colors.border }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded text-sm hover:bg-white/10 transition-colors"
            style={{ color: theme.colors.textDim }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!selectedAgent || !sessionName.trim() || isCreating || agents.length === 0}
            className="px-4 py-2 rounded font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            style={{ backgroundColor: theme.colors.accent, color: theme.colors.accentForeground }}
          >
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Bot className="w-4 h-4" />
                Create Agent
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export default AgentCreationDialog;

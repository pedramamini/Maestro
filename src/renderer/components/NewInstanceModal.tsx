import React, { useState, useEffect, useRef } from 'react';
import { Folder, X, RefreshCw } from 'lucide-react';
import type { AgentConfig } from '../types';
import { useLayerStack } from '../contexts/LayerStackContext';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';

interface AgentDebugInfo {
  agentId: string;
  available: boolean;
  path: string | null;
  binaryName: string;
  envPath: string;
  homeDir: string;
  platform: string;
  whichCommand: string;
  error: string | null;
}

interface NewInstanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (agentId: string, workingDir: string, name: string) => void;
  theme: any;
  defaultAgent: string;
}

export function NewInstanceModal({ isOpen, onClose, onCreate, theme, defaultAgent }: NewInstanceModalProps) {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [selectedAgent, setSelectedAgent] = useState(defaultAgent);
  const [workingDir, setWorkingDir] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshingAgent, setRefreshingAgent] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<AgentDebugInfo | null>(null);
  const [homeDir, setHomeDir] = useState<string>('');

  // Layer stack integration
  const { registerLayer, unregisterLayer, updateLayerHandler } = useLayerStack();
  const layerIdRef = useRef<string>();
  const modalRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

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

  // Define handlers first before they're used in effects
  const loadAgents = async () => {
    setLoading(true);
    try {
      const detectedAgents = await window.maestro.agents.detect();
      setAgents(detectedAgents);

      // Set default or first available
      const defaultAvailable = detectedAgents.find((a: AgentConfig) => a.id === defaultAgent && a.available);
      const firstAvailable = detectedAgents.find((a: AgentConfig) => a.available);

      if (defaultAvailable) {
        setSelectedAgent(defaultAgent);
      } else if (firstAvailable) {
        setSelectedAgent(firstAvailable.id);
      }
    } catch (error) {
      console.error('Failed to load agents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFolder = React.useCallback(async () => {
    const folder = await window.maestro.dialog.selectFolder();
    if (folder) {
      setWorkingDir(folder);
    }
  }, []);

  const handleRefreshAgent = React.useCallback(async (agentId: string) => {
    setRefreshingAgent(agentId);
    setDebugInfo(null);
    try {
      const result = await window.maestro.agents.refresh(agentId);
      setAgents(result.agents);
      if (result.debugInfo && !result.debugInfo.available) {
        setDebugInfo(result.debugInfo);
      }
    } catch (error) {
      console.error('Failed to refresh agent:', error);
    } finally {
      setRefreshingAgent(null);
    }
  }, []);

  const handleCreate = React.useCallback(() => {
    const name = instanceName || agents.find(a => a.id === selectedAgent)?.name || 'New Agent';
    // Expand tilde before passing to callback
    const expandedWorkingDir = expandTilde(workingDir.trim());
    onCreate(selectedAgent, expandedWorkingDir, name);
    onClose();

    // Reset
    setInstanceName('');
    setWorkingDir('');
  }, [instanceName, agents, selectedAgent, workingDir, onCreate, onClose, expandTilde]);

  // Effects
  useEffect(() => {
    if (isOpen) {
      loadAgents();
    }
  }, [isOpen]);

  // Register layer when modal is open
  useEffect(() => {
    if (isOpen) {
      const id = registerLayer({
        id: '',
        type: 'modal',
        priority: MODAL_PRIORITIES.NEW_INSTANCE,
        blocksLowerLayers: true,
        capturesFocus: true,
        focusTrap: 'strict',
        ariaLabel: 'Create New Agent',
        onEscape: onClose,
      });
      layerIdRef.current = id;

      return () => {
        if (layerIdRef.current) {
          unregisterLayer(layerIdRef.current);
        }
      };
    }
  }, [isOpen, registerLayer, unregisterLayer]);

  // Update handler when dependencies change
  useEffect(() => {
    if (isOpen && layerIdRef.current) {
      updateLayerHandler(layerIdRef.current, onClose);
    }
  }, [isOpen, onClose, updateLayerHandler]);

  // Focus name input on open (only once, not on every render)
  useEffect(() => {
    if (isOpen && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999]"
      role="dialog"
      aria-modal="true"
      aria-label="Create New Agent"
      tabIndex={-1}
      ref={modalRef}
      onKeyDown={(e) => {
        // Handle Cmd+O for folder picker before stopping propagation
        if ((e.key === 'o' || e.key === 'O') && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          e.stopPropagation();
          handleSelectFolder();
          return;
        }
        // Handle Cmd+Enter for creating agent
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          e.stopPropagation();
          if (selectedAgent && agents.find(a => a.id === selectedAgent)?.available && workingDir.trim()) {
            handleCreate();
          }
          return;
        }
        // Stop propagation of all other keyboard events to prevent background components from handling them
        if (e.key !== 'Escape') {
          e.stopPropagation();
        }
      }}
    >
      <div
        className="w-[500px] rounded-xl border shadow-2xl overflow-hidden"
        style={{ backgroundColor: theme.colors.bgSidebar, borderColor: theme.colors.border }}
      >
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: theme.colors.border }}>
          <h2 className="text-lg font-bold" style={{ color: theme.colors.textMain }}>Create New Agent</h2>
          <button onClick={onClose} style={{ color: theme.colors.textDim }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Agent Name */}
          <div>
            <label className="block text-xs font-bold opacity-70 uppercase mb-2" style={{ color: theme.colors.textMain }}>
              Agent Name (Optional)
            </label>
            <input
              ref={nameInputRef}
              type="text"
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value)}
              placeholder="My Project Session"
              className="w-full p-2 rounded border bg-transparent outline-none"
              style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
            />
          </div>

          {/* Agent Selection */}
          <div>
            <label className="block text-xs font-bold opacity-70 uppercase mb-2" style={{ color: theme.colors.textMain }}>
              AI Agent / Tool
            </label>
            {loading ? (
              <div className="text-sm opacity-50">Loading agents...</div>
            ) : (
              <div className="space-y-2">
                {agents.filter(a => !a.hidden).map((agent) => (
                  <div
                    key={agent.id}
                    onClick={() => {
                      if (agent.id === 'claude-code' && agent.available) {
                        setSelectedAgent(agent.id);
                      }
                    }}
                    className={`w-full text-left p-3 rounded border transition-all ${
                      selectedAgent === agent.id ? 'ring-2' : ''
                    } ${(agent.id !== 'claude-code' || !agent.available) ? 'opacity-40 cursor-not-allowed' : 'hover:bg-opacity-10 cursor-pointer'}`}
                    style={{
                      borderColor: theme.colors.border,
                      backgroundColor: selectedAgent === agent.id ? theme.colors.accentDim : 'transparent',
                      ringColor: theme.colors.accent,
                      color: theme.colors.textMain,
                    }}
                    role="option"
                    aria-selected={selectedAgent === agent.id}
                    tabIndex={agent.id === 'claude-code' && agent.available ? 0 : -1}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{agent.name}</div>
                        {agent.path && (
                          <div className="text-xs opacity-50 font-mono mt-1">{agent.path}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {agent.id === 'claude-code' ? (
                          <>
                            {agent.available ? (
                              <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: theme.colors.success + '20', color: theme.colors.success }}>
                                Available
                              </span>
                            ) : (
                              <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: theme.colors.error + '20', color: theme.colors.error }}>
                                Not Found
                              </span>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRefreshAgent(agent.id);
                              }}
                              className="p-1 rounded hover:bg-white/10 transition-colors"
                              title="Refresh detection (shows debug info if not found)"
                              style={{ color: theme.colors.textDim }}
                            >
                              <RefreshCw className={`w-4 h-4 ${refreshingAgent === agent.id ? 'animate-spin' : ''}`} />
                            </button>
                          </>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: theme.colors.warning + '20', color: theme.colors.warning }}>
                            Coming Soon
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Debug Info Display */}
            {debugInfo && (
              <div
                className="mt-3 p-3 rounded border text-xs font-mono overflow-auto max-h-40"
                style={{
                  backgroundColor: theme.colors.error + '10',
                  borderColor: theme.colors.error + '40',
                  color: theme.colors.textMain,
                }}
              >
                <div className="font-bold mb-2" style={{ color: theme.colors.error }}>
                  Debug Info: {debugInfo.binaryName} not found
                </div>
                {debugInfo.error && (
                  <div className="mb-2 text-red-400">{debugInfo.error}</div>
                )}
                <div className="space-y-1 opacity-70">
                  <div><span className="opacity-50">Platform:</span> {debugInfo.platform}</div>
                  <div><span className="opacity-50">Home:</span> {debugInfo.homeDir}</div>
                  <div><span className="opacity-50">PATH:</span></div>
                  <div className="pl-2 break-all text-[10px]">
                    {debugInfo.envPath.split(':').map((p, i) => (
                      <div key={i}>{p}</div>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => setDebugInfo(null)}
                  className="mt-2 text-xs underline"
                  style={{ color: theme.colors.textDim }}
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>

          {/* Working Directory */}
          <div>
            <label className="block text-xs font-bold opacity-70 uppercase mb-2" style={{ color: theme.colors.textMain }}>
              Working Directory
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={workingDir}
                onChange={(e) => setWorkingDir(e.target.value)}
                placeholder="Select directory..."
                className="flex-1 p-2 rounded border bg-transparent outline-none font-mono text-sm"
                style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
              />
              <button
                onClick={handleSelectFolder}
                className="p-2 rounded border hover:bg-opacity-10"
                style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
                title="Browse folders (Cmd+O)"
              >
                <Folder className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex justify-end gap-2" style={{ borderColor: theme.colors.border }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded border"
            style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!selectedAgent || !agents.find(a => a.id === selectedAgent)?.available || !workingDir.trim()}
            className="px-4 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: theme.colors.accent, color: theme.colors.accentForeground }}
          >
            Create Agent
          </button>
        </div>
      </div>
    </div>
  );
}

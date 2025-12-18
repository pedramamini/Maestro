import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Folder, RefreshCw, ChevronRight } from 'lucide-react';
import type { AgentConfig, Session, ToolType } from '../types';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';
import { validateNewSession, validateEditSession } from '../utils/sessionValidation';
import { FormInput } from './ui/FormInput';
import { Modal, ModalFooter } from './ui/Modal';

// Maximum character length for nudge message
const NUDGE_MESSAGE_MAX_LENGTH = 1000;

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
  onCreate: (agentId: string, workingDir: string, name: string, nudgeMessage?: string) => void;
  theme: any;
  defaultAgent: string;
  existingSessions: Session[];
}

interface EditAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (sessionId: string, name: string, nudgeMessage?: string) => void;
  theme: any;
  session: Session | null;
  existingSessions: Session[];
}

// Supported agents that are fully implemented
const SUPPORTED_AGENTS = ['claude-code', 'opencode', 'codex'];

export function NewInstanceModal({ isOpen, onClose, onCreate, theme, defaultAgent, existingSessions }: NewInstanceModalProps) {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [selectedAgent, setSelectedAgent] = useState(defaultAgent);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [workingDir, setWorkingDir] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [nudgeMessage, setNudgeMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshingAgent, setRefreshingAgent] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<AgentDebugInfo | null>(null);
  const [homeDir, setHomeDir] = useState<string>('');
  const [customAgentPaths, setCustomAgentPaths] = useState<Record<string, string>>({});
  const [customAgentArgs, setCustomAgentArgs] = useState<Record<string, string>>({});
  const [agentConfigs, setAgentConfigs] = useState<Record<string, Record<string, any>>>({});

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

  // Validate session uniqueness
  const validation = useMemo(() => {
    const name = instanceName.trim();
    const expandedDir = expandTilde(workingDir.trim());
    if (!name || !expandedDir || !selectedAgent) {
      return { valid: true }; // Don't show errors until fields are filled
    }
    return validateNewSession(name, expandedDir, selectedAgent as ToolType, existingSessions);
  }, [instanceName, workingDir, selectedAgent, existingSessions, homeDir]);

  // Define handlers first before they're used in effects
  const loadAgents = async () => {
    setLoading(true);
    try {
      const detectedAgents = await window.maestro.agents.detect();
      setAgents(detectedAgents);

      // Load custom paths and args for agents
      const paths = await window.maestro.agents.getAllCustomPaths();
      setCustomAgentPaths(paths);
      const args = await window.maestro.agents.getAllCustomArgs();
      setCustomAgentArgs(args);

      // Load configurations for all agents
      const configs: Record<string, Record<string, any>> = {};
      for (const agent of detectedAgents) {
        const config = await window.maestro.agents.getConfig(agent.id);
        configs[agent.id] = config;
      }
      setAgentConfigs(configs);

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
    const name = instanceName.trim();
    if (!name) return; // Name is required
    // Expand tilde before passing to callback
    const expandedWorkingDir = expandTilde(workingDir.trim());

    // Validate before creating
    const result = validateNewSession(name, expandedWorkingDir, selectedAgent as ToolType, existingSessions);
    if (!result.valid) return;

    onCreate(selectedAgent, expandedWorkingDir, name, nudgeMessage.trim() || undefined);
    onClose();

    // Reset
    setInstanceName('');
    setWorkingDir('');
    setNudgeMessage('');
  }, [instanceName, selectedAgent, workingDir, nudgeMessage, onCreate, onClose, expandTilde, existingSessions]);

  // Check if form is valid for submission
  const isFormValid = useMemo(() => {
    return selectedAgent &&
           agents.find(a => a.id === selectedAgent)?.available &&
           workingDir.trim() &&
           instanceName.trim() &&
           validation.valid;
  }, [selectedAgent, agents, workingDir, instanceName, validation.valid]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
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
      if (isFormValid) {
        handleCreate();
      }
      return;
    }
  }, [handleSelectFolder, handleCreate, isFormValid]);

  // Sort agents: supported first, then coming soon at the bottom
  const sortedAgents = useMemo(() => {
    const visible = agents.filter(a => !a.hidden);
    const supported = visible.filter(a => SUPPORTED_AGENTS.includes(a.id));
    const comingSoon = visible.filter(a => !SUPPORTED_AGENTS.includes(a.id));
    return [...supported, ...comingSoon];
  }, [agents]);

  // Effects
  useEffect(() => {
    if (isOpen) {
      loadAgents();
      // Keep all agents collapsed by default
      setExpandedAgent(null);
    }
  }, [isOpen, defaultAgent]);

  if (!isOpen) return null;

  return (
    <div onKeyDown={handleKeyDown}>
      <Modal
        theme={theme}
        title="Create New Agent"
        priority={MODAL_PRIORITIES.NEW_INSTANCE}
        onClose={onClose}
        width={500}
        initialFocusRef={nameInputRef}
        footer={
          <ModalFooter
            theme={theme}
            onCancel={onClose}
            onConfirm={handleCreate}
            confirmLabel="Create Agent"
            confirmDisabled={!isFormValid}
          />
        }
      >
        <div className="space-y-5">
          {/* Agent Name */}
          <FormInput
            ref={nameInputRef}
            id="agent-name-input"
            theme={theme}
            label="Agent Name"
            value={instanceName}
            onChange={setInstanceName}
            placeholder=""
            error={validation.errorField === 'name' ? validation.error : undefined}
            heightClass="p-2"
          />

          {/* Agent Selection */}
          <div>
            <label className="block text-xs font-bold opacity-70 uppercase mb-2" style={{ color: theme.colors.textMain }}>
              Agent Provider
            </label>
            {loading ? (
              <div className="text-sm opacity-50">Loading agents...</div>
            ) : (
              <div className="space-y-1">
                {sortedAgents.map((agent) => {
                  const isSupported = SUPPORTED_AGENTS.includes(agent.id);
                  const isExpanded = expandedAgent === agent.id;
                  const isSelected = selectedAgent === agent.id;
                  const canSelect = isSupported && agent.available;

                  return (
                    <div
                      key={agent.id}
                      className={`rounded border transition-all overflow-hidden ${
                        isSelected ? 'ring-2' : ''
                      }`}
                      style={{
                        borderColor: theme.colors.border,
                        backgroundColor: isSelected ? theme.colors.accentDim : 'transparent',
                        ringColor: theme.colors.accent,
                      }}
                    >
                      {/* Collapsed header row */}
                      <div
                        onClick={() => {
                          if (isSupported) {
                            // Toggle expansion
                            setExpandedAgent(isExpanded ? null : agent.id);
                            // Auto-select if available
                            if (canSelect) {
                              setSelectedAgent(agent.id);
                            }
                          }
                        }}
                        className={`w-full text-left px-3 py-2 flex items-center justify-between ${
                          !isSupported ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/5 cursor-pointer'
                        }`}
                        style={{ color: theme.colors.textMain }}
                        role="option"
                        aria-selected={isSelected}
                        aria-expanded={isExpanded}
                        tabIndex={isSupported ? 0 : -1}
                      >
                        <div className="flex items-center gap-2">
                          {/* Expand/collapse chevron for supported agents */}
                          {isSupported && (
                            <ChevronRight
                              className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                              style={{ color: theme.colors.textDim }}
                            />
                          )}
                          <span className="font-medium">{agent.name}</span>
                          {/* "New" badge for Codex and OpenCode */}
                          {(agent.id === 'codex' || agent.id === 'opencode') && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                              style={{
                                backgroundColor: '#22c55e30',
                                color: '#22c55e',
                              }}
                            >
                              New
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {isSupported ? (
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
                                title="Refresh detection"
                                style={{ color: theme.colors.textDim }}
                              >
                                <RefreshCw className={`w-3 h-3 ${refreshingAgent === agent.id ? 'animate-spin' : ''}`} />
                              </button>
                            </>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: theme.colors.warning + '20', color: theme.colors.warning }}>
                              Coming Soon
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Expanded details for supported agents */}
                      {isSupported && isExpanded && (
                        <div className="px-3 pb-3 pt-2 space-y-3">
                          {/* Show detected path if available */}
                          {agent.path && (
                            <div
                              className="text-xs font-mono px-3 py-2 rounded"
                              style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.textDim }}
                            >
                              <span className="opacity-60">Detected:</span> {agent.path}
                            </div>
                          )}
                          {/* Custom path input */}
                          <div
                            className="p-3 rounded border"
                            style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgMain }}
                          >
                            <label className="block text-xs font-medium mb-2" style={{ color: theme.colors.textDim }}>
                              Custom Path (optional)
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={customAgentPaths[agent.id] || ''}
                                onChange={(e) => {
                                  const newPaths = { ...customAgentPaths, [agent.id]: e.target.value };
                                  setCustomAgentPaths(newPaths);
                                }}
                                onBlur={async () => {
                                  const path = customAgentPaths[agent.id]?.trim() || null;
                                  await window.maestro.agents.setCustomPath(agent.id, path);
                                  loadAgents();
                                }}
                                onClick={(e) => e.stopPropagation()}
                                placeholder={`/path/to/${agent.binaryName}`}
                                className="flex-1 p-2 rounded border bg-transparent outline-none text-xs font-mono"
                                style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
                              />
                              {customAgentPaths[agent.id] && (
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const newPaths = { ...customAgentPaths };
                                    delete newPaths[agent.id];
                                    setCustomAgentPaths(newPaths);
                                    await window.maestro.agents.setCustomPath(agent.id, null);
                                    loadAgents();
                                  }}
                                  className="px-2 py-1.5 rounded text-xs"
                                  style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.textDim }}
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                            <p className="text-xs opacity-50 mt-2">
                              Specify a custom path if the agent is not in your PATH
                            </p>
                          </div>
                          {/* Custom CLI arguments input */}
                          <div
                            className="p-3 rounded border"
                            style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgMain }}
                          >
                            <label className="block text-xs font-medium mb-2" style={{ color: theme.colors.textDim }}>
                              Custom Arguments (optional)
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={customAgentArgs[agent.id] || ''}
                                onChange={(e) => {
                                  const newArgs = { ...customAgentArgs, [agent.id]: e.target.value };
                                  setCustomAgentArgs(newArgs);
                                }}
                                onBlur={async () => {
                                  const args = customAgentArgs[agent.id]?.trim() || null;
                                  await window.maestro.agents.setCustomArgs(agent.id, args);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                placeholder="--flag value --another-flag"
                                className="flex-1 p-2 rounded border bg-transparent outline-none text-xs font-mono"
                                style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
                              />
                              {customAgentArgs[agent.id] && (
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const newArgs = { ...customAgentArgs };
                                    delete newArgs[agent.id];
                                    setCustomAgentArgs(newArgs);
                                    await window.maestro.agents.setCustomArgs(agent.id, null);
                                  }}
                                  className="px-2 py-1.5 rounded text-xs"
                                  style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.textDim }}
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                            <p className="text-xs opacity-50 mt-2">
                              Additional CLI arguments appended to all calls to this agent
                            </p>
                          </div>

                          {/* Agent-specific configuration options (contextWindow, model, etc.) */}
                          {agent.configOptions && agent.configOptions.length > 0 && agent.configOptions.map((option: any) => (
                            <div
                              key={option.key}
                              className="p-3 rounded border"
                              style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgMain }}
                            >
                              <label className="block text-xs font-medium mb-2" style={{ color: theme.colors.textDim }}>
                                {option.label}
                              </label>
                              {option.type === 'number' && (
                                <input
                                  type="number"
                                  value={agentConfigs[agent.id]?.[option.key] ?? option.default}
                                  onChange={(e) => {
                                    const value = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                                    const newConfig = {
                                      ...agentConfigs[agent.id],
                                      [option.key]: isNaN(value) ? 0 : value
                                    };
                                    setAgentConfigs(prev => ({
                                      ...prev,
                                      [agent.id]: newConfig
                                    }));
                                  }}
                                  onBlur={() => {
                                    const currentConfig = agentConfigs[agent.id] || {};
                                    window.maestro.agents.setConfig(agent.id, currentConfig);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  placeholder={option.default?.toString() || '0'}
                                  min={0}
                                  className="w-full p-2 rounded border bg-transparent outline-none text-xs font-mono"
                                  style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
                                />
                              )}
                              {option.type === 'text' && (
                                <input
                                  type="text"
                                  value={agentConfigs[agent.id]?.[option.key] ?? option.default}
                                  onChange={(e) => {
                                    const newConfig = {
                                      ...agentConfigs[agent.id],
                                      [option.key]: e.target.value
                                    };
                                    setAgentConfigs(prev => ({
                                      ...prev,
                                      [agent.id]: newConfig
                                    }));
                                  }}
                                  onBlur={() => {
                                    const currentConfig = agentConfigs[agent.id] || {};
                                    window.maestro.agents.setConfig(agent.id, currentConfig);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  placeholder={option.default || ''}
                                  className="w-full p-2 rounded border bg-transparent outline-none text-xs font-mono"
                                  style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
                                />
                              )}
                              {option.type === 'checkbox' && (
                                <label className="flex items-center gap-2 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={agentConfigs[agent.id]?.[option.key] ?? option.default}
                                    onChange={(e) => {
                                      const newConfig = {
                                        ...agentConfigs[agent.id],
                                        [option.key]: e.target.checked
                                      };
                                      setAgentConfigs(prev => ({
                                        ...prev,
                                        [agent.id]: newConfig
                                      }));
                                      window.maestro.agents.setConfig(agent.id, newConfig);
                                    }}
                                    className="w-4 h-4"
                                    style={{ accentColor: theme.colors.accent }}
                                  />
                                  <span className="text-xs" style={{ color: theme.colors.textMain }}>Enabled</span>
                                </label>
                              )}
                              <p className="text-xs opacity-50 mt-2">
                                {option.description}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
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
          <FormInput
            theme={theme}
            label="Working Directory"
            value={workingDir}
            onChange={setWorkingDir}
            placeholder="Select directory..."
            error={validation.errorField === 'directory' ? validation.error : undefined}
            monospace
            heightClass="p-2"
            addon={
              <button
                onClick={handleSelectFolder}
                className="p-2 rounded border hover:bg-opacity-10"
                style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
                title="Browse folders (Cmd+O)"
              >
                <Folder className="w-5 h-5" />
              </button>
            }
          />

          {/* Nudge Message */}
          <div>
            <label className="block text-xs font-bold opacity-70 uppercase mb-2" style={{ color: theme.colors.textMain }}>
              Nudge Message <span className="font-normal opacity-50">(optional)</span>
            </label>
            <textarea
              value={nudgeMessage}
              onChange={(e) => setNudgeMessage(e.target.value.slice(0, NUDGE_MESSAGE_MAX_LENGTH))}
              placeholder="Instructions appended to every message you send..."
              className="w-full p-2 rounded border bg-transparent outline-none resize-none text-sm"
              style={{
                borderColor: theme.colors.border,
                color: theme.colors.textMain,
                minHeight: '80px',
              }}
              maxLength={NUDGE_MESSAGE_MAX_LENGTH}
            />
            <p className="mt-1 text-xs" style={{ color: theme.colors.textDim }}>
              {nudgeMessage.length}/{NUDGE_MESSAGE_MAX_LENGTH} characters. This text is added to every message you send to the agent (not visible in chat).
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/**
 * EditAgentModal - Modal for editing an existing agent's settings
 *
 * Allows editing:
 * - Agent name
 * - Nudge message
 *
 * Does NOT allow editing:
 * - Agent provider (toolType)
 * - Working directory (projectRoot)
 */
export function EditAgentModal({ isOpen, onClose, onSave, theme, session, existingSessions }: EditAgentModalProps) {
  const [instanceName, setInstanceName] = useState('');
  const [nudgeMessage, setNudgeMessage] = useState('');
  const [agent, setAgent] = useState<AgentConfig | null>(null);
  const [agentConfig, setAgentConfig] = useState<Record<string, any>>({});

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Load agent info and config when modal opens
  useEffect(() => {
    if (isOpen && session) {
      // Load agent definition to get configOptions
      window.maestro.agents.detect().then((agents: AgentConfig[]) => {
        const foundAgent = agents.find(a => a.id === session.toolType);
        setAgent(foundAgent || null);
      });
      // Load agent config
      window.maestro.agents.getConfig(session.toolType).then(setAgentConfig);
    }
  }, [isOpen, session]);

  // Populate form when session changes or modal opens
  useEffect(() => {
    if (isOpen && session) {
      setInstanceName(session.name);
      setNudgeMessage(session.nudgeMessage || '');
    }
  }, [isOpen, session]);

  // Validate session name uniqueness (excluding current session)
  const validation = useMemo(() => {
    const name = instanceName.trim();
    if (!name || !session) {
      return { valid: true }; // Don't show errors until fields are filled
    }
    return validateEditSession(name, session.id, existingSessions);
  }, [instanceName, session, existingSessions]);

  const handleSave = useCallback(() => {
    if (!session) return;
    const name = instanceName.trim();
    if (!name) return;

    // Validate before saving
    const result = validateEditSession(name, session.id, existingSessions);
    if (!result.valid) return;

    onSave(session.id, name, nudgeMessage.trim() || undefined);
    onClose();
  }, [session, instanceName, nudgeMessage, onSave, onClose, existingSessions]);

  // Check if form is valid for submission
  const isFormValid = useMemo(() => {
    return instanceName.trim() && validation.valid;
  }, [instanceName, validation.valid]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Handle Cmd+Enter for saving
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      e.stopPropagation();
      if (isFormValid) {
        handleSave();
      }
      return;
    }
  }, [handleSave, isFormValid]);

  if (!isOpen || !session) return null;

  // Get agent name for display
  const agentNameMap: Record<string, string> = {
    'claude-code': 'Claude Code',
    'codex': 'Codex',
    'opencode': 'OpenCode',
    'aider': 'Aider',
  };
  const agentName = agentNameMap[session.toolType] || session.toolType;

  return (
    <div onKeyDown={handleKeyDown}>
      <Modal
        theme={theme}
        title="Edit Agent"
        priority={MODAL_PRIORITIES.NEW_INSTANCE}
        onClose={onClose}
        width={500}
        initialFocusRef={nameInputRef}
        footer={
          <ModalFooter
            theme={theme}
            onCancel={onClose}
            onConfirm={handleSave}
            confirmLabel="Save Changes"
            confirmDisabled={!isFormValid}
          />
        }
      >
        <div className="space-y-5">
          {/* Agent Name */}
          <FormInput
            ref={nameInputRef}
            id="edit-agent-name-input"
            theme={theme}
            label="Agent Name"
            value={instanceName}
            onChange={setInstanceName}
            placeholder=""
            error={validation.errorField === 'name' ? validation.error : undefined}
            heightClass="p-2"
          />

          {/* Agent Provider (read-only) */}
          <div>
            <label className="block text-xs font-bold opacity-70 uppercase mb-2" style={{ color: theme.colors.textMain }}>
              Agent Provider
            </label>
            <div
              className="p-2 rounded border text-sm"
              style={{
                borderColor: theme.colors.border,
                color: theme.colors.textDim,
                backgroundColor: theme.colors.bgActivity,
              }}
            >
              {agentName}
            </div>
            <p className="mt-1 text-xs" style={{ color: theme.colors.textDim }}>
              Provider cannot be changed after creation.
            </p>
          </div>

          {/* Working Directory (read-only) */}
          <div>
            <label className="block text-xs font-bold opacity-70 uppercase mb-2" style={{ color: theme.colors.textMain }}>
              Working Directory
            </label>
            <div
              className="p-2 rounded border font-mono text-sm overflow-hidden text-ellipsis"
              style={{
                borderColor: theme.colors.border,
                color: theme.colors.textDim,
                backgroundColor: theme.colors.bgActivity,
              }}
              title={session.projectRoot}
            >
              {session.projectRoot}
            </div>
            <p className="mt-1 text-xs" style={{ color: theme.colors.textDim }}>
              Directory cannot be changed. Create a new agent for a different directory.
            </p>
          </div>

          {/* Nudge Message */}
          <div>
            <label className="block text-xs font-bold opacity-70 uppercase mb-2" style={{ color: theme.colors.textMain }}>
              Nudge Message <span className="font-normal opacity-50">(optional)</span>
            </label>
            <textarea
              value={nudgeMessage}
              onChange={(e) => setNudgeMessage(e.target.value.slice(0, NUDGE_MESSAGE_MAX_LENGTH))}
              placeholder="Instructions appended to every message you send..."
              className="w-full p-2 rounded border bg-transparent outline-none resize-none text-sm"
              style={{
                borderColor: theme.colors.border,
                color: theme.colors.textMain,
                minHeight: '80px',
              }}
              maxLength={NUDGE_MESSAGE_MAX_LENGTH}
            />
            <p className="mt-1 text-xs" style={{ color: theme.colors.textDim }}>
              {nudgeMessage.length}/{NUDGE_MESSAGE_MAX_LENGTH} characters. This text is added to every message you send to the agent (not visible in chat).
            </p>
          </div>

          {/* Agent-specific configuration options (contextWindow, model, etc.) */}
          {agent?.configOptions && agent.configOptions.length > 0 && (
            <div>
              <label className="block text-xs font-bold opacity-70 uppercase mb-2" style={{ color: theme.colors.textMain }}>
                {agentName} Settings
              </label>
              <div className="space-y-3">
                {agent.configOptions.map((option: any) => (
                  <div
                    key={option.key}
                    className="p-3 rounded border"
                    style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgMain }}
                  >
                    <label className="block text-xs font-medium mb-2" style={{ color: theme.colors.textDim }}>
                      {option.label}
                    </label>
                    {option.type === 'number' && (
                      <input
                        type="number"
                        value={agentConfig[option.key] ?? option.default}
                        onChange={(e) => {
                          const value = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                          setAgentConfig(prev => ({
                            ...prev,
                            [option.key]: isNaN(value) ? 0 : value
                          }));
                        }}
                        onBlur={() => {
                          window.maestro.agents.setConfig(session.toolType, agentConfig);
                        }}
                        placeholder={option.default?.toString() || '0'}
                        min={0}
                        className="w-full p-2 rounded border bg-transparent outline-none text-xs font-mono"
                        style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
                      />
                    )}
                    {option.type === 'text' && (
                      <input
                        type="text"
                        value={agentConfig[option.key] ?? option.default}
                        onChange={(e) => {
                          setAgentConfig(prev => ({
                            ...prev,
                            [option.key]: e.target.value
                          }));
                        }}
                        onBlur={() => {
                          window.maestro.agents.setConfig(session.toolType, agentConfig);
                        }}
                        placeholder={option.default || ''}
                        className="w-full p-2 rounded border bg-transparent outline-none text-xs font-mono"
                        style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
                      />
                    )}
                    {option.type === 'checkbox' && (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={agentConfig[option.key] ?? option.default}
                          onChange={(e) => {
                            const newConfig = {
                              ...agentConfig,
                              [option.key]: e.target.checked
                            };
                            setAgentConfig(newConfig);
                            window.maestro.agents.setConfig(session.toolType, newConfig);
                          }}
                          className="w-4 h-4"
                          style={{ accentColor: theme.colors.accent }}
                        />
                        <span className="text-xs" style={{ color: theme.colors.textMain }}>Enabled</span>
                      </label>
                    )}
                    <p className="text-xs opacity-50 mt-2">
                      {option.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

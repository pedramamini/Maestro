import React, { useState, useEffect, useMemo } from 'react';
import { X, Key, Moon, Sun, Keyboard, Check, Terminal } from 'lucide-react';
import type { AgentConfig, Theme, Shortcut, ShellInfo } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: Theme;
  themes: Record<string, Theme>;
  activeThemeId: string;
  setActiveThemeId: (id: string) => void;
  llmProvider: string;
  setLlmProvider: (provider: string) => void;
  modelSlug: string;
  setModelSlug: (slug: string) => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  tunnelProvider: string;
  setTunnelProvider: (provider: string) => void;
  tunnelApiKey: string;
  setTunnelApiKey: (key: string) => void;
  shortcuts: Record<string, Shortcut>;
  setShortcuts: (shortcuts: Record<string, Shortcut>) => void;
  defaultAgent: string;
  setDefaultAgent: (agentId: string) => void;
  fontFamily: string;
  setFontFamily: (font: string) => void;
  fontSize: number;
  setFontSize: (size: number) => void;
  terminalWidth: number;
  setTerminalWidth: (width: number) => void;
  logLevel: string;
  setLogLevel: (level: string) => void;
  maxOutputLines: number;
  setMaxOutputLines: (lines: number) => void;
  defaultShell: string;
  setDefaultShell: (shell: string) => void;
  enterToSendAI: boolean;
  setEnterToSendAI: (value: boolean) => void;
  enterToSendTerminal: boolean;
  setEnterToSendTerminal: (value: boolean) => void;
  initialTab?: 'general' | 'llm' | 'shortcuts' | 'theme' | 'network';
}

export function SettingsModal(props: SettingsModalProps) {
  const { isOpen, onClose, theme, themes, initialTab } = props;
  const [activeTab, setActiveTab] = useState<'general' | 'llm' | 'shortcuts' | 'theme' | 'network'>('general');
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [customFontInput, setCustomFontInput] = useState('');
  const [customFonts, setCustomFonts] = useState<string[]>([]);
  const [fontLoading, setFontLoading] = useState(false);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentConfigs, setAgentConfigs] = useState<Record<string, Record<string, any>>>({});
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [shortcutsFilter, setShortcutsFilter] = useState('');
  const [testingLLM, setTestingLLM] = useState(false);
  const [testResult, setTestResult] = useState<{ status: 'success' | 'error' | null; message: string }>({ status: null, message: '' });
  const [shells, setShells] = useState<ShellInfo[]>([]);
  const [shellsLoading, setShellsLoading] = useState(false);
  const [shellsLoaded, setShellsLoaded] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadAgents();
      // Don't load fonts immediately - only when user interacts with font selector
      // Set initial tab if provided, otherwise default to 'general'
      setActiveTab(initialTab || 'general');
    }
  }, [isOpen, initialTab]);

  // Tab navigation with Cmd+Shift+[ and ]
  useEffect(() => {
    if (!isOpen) return;

    const handleTabNavigation = (e: KeyboardEvent) => {
      const tabs: Array<'general' | 'llm' | 'shortcuts' | 'theme' | 'network'> = ['general', 'llm', 'shortcuts', 'theme', 'network'];
      const currentIndex = tabs.indexOf(activeTab);

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === '[') {
        e.preventDefault();
        const prevIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
        setActiveTab(tabs[prevIndex]);
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === ']') {
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % tabs.length;
        setActiveTab(tabs[nextIndex]);
      }
    };

    window.addEventListener('keydown', handleTabNavigation);
    return () => window.removeEventListener('keydown', handleTabNavigation);
  }, [isOpen, activeTab]);

  const loadAgents = async () => {
    setLoading(true);
    try {
      const detectedAgents = await window.maestro.agents.detect();
      setAgents(detectedAgents);

      // Load configurations for all agents
      const configs: Record<string, Record<string, any>> = {};
      for (const agent of detectedAgents) {
        const config = await window.maestro.agents.getConfig(agent.id);
        configs[agent.id] = config;
      }
      setAgentConfigs(configs);
    } catch (error) {
      console.error('Failed to load agents:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFonts = async () => {
    if (fontsLoaded) return; // Don't reload if already loaded

    setFontLoading(true);
    try {
      const detected = await window.maestro.fonts.detect();
      setSystemFonts(detected);

      const savedCustomFonts = await window.maestro.settings.get('customFonts');
      if (savedCustomFonts) {
        setCustomFonts(savedCustomFonts);
      }
      setFontsLoaded(true);
    } catch (error) {
      console.error('Failed to load fonts:', error);
    } finally {
      setFontLoading(false);
    }
  };

  const handleFontInteraction = () => {
    if (!fontsLoaded && !fontLoading) {
      loadFonts();
    }
  };

  const loadShells = async () => {
    if (shellsLoaded) return; // Don't reload if already loaded

    setShellsLoading(true);
    try {
      const detected = await window.maestro.shells.detect();
      setShells(detected);
      setShellsLoaded(true);
    } catch (error) {
      console.error('Failed to load shells:', error);
    } finally {
      setShellsLoading(false);
    }
  };

  const handleShellInteraction = () => {
    if (!shellsLoaded && !shellsLoading) {
      loadShells();
    }
  };

  const addCustomFont = () => {
    if (customFontInput.trim() && !customFonts.includes(customFontInput.trim())) {
      const newCustomFonts = [...customFonts, customFontInput.trim()];
      setCustomFonts(newCustomFonts);
      window.maestro.settings.set('customFonts', newCustomFonts);
      setCustomFontInput('');
    }
  };

  const removeCustomFont = (font: string) => {
    const newCustomFonts = customFonts.filter(f => f !== font);
    setCustomFonts(newCustomFonts);
    window.maestro.settings.set('customFonts', newCustomFonts);
  };

  const testLLMConnection = async () => {
    setTestingLLM(true);
    setTestResult({ status: null, message: '' });

    try {
      let response;
      const testPrompt = 'Respond with exactly: "Connection successful"';

      if (props.llmProvider === 'openrouter') {
        if (!props.apiKey) {
          throw new Error('API key is required for OpenRouter');
        }

        response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${props.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://maestro.local',
          },
          body: JSON.stringify({
            model: props.modelSlug || 'anthropic/claude-3.5-sonnet',
            messages: [{ role: 'user', content: testPrompt }],
            max_tokens: 50,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || `OpenRouter API error: ${response.status}`);
        }

        const data = await response.json();
        if (!data.choices?.[0]?.message?.content) {
          throw new Error('Invalid response from OpenRouter');
        }

        setTestResult({
          status: 'success',
          message: 'Successfully connected to OpenRouter!',
        });
      } else if (props.llmProvider === 'anthropic') {
        if (!props.apiKey) {
          throw new Error('API key is required for Anthropic');
        }

        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': props.apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: props.modelSlug || 'claude-3-5-sonnet-20241022',
            max_tokens: 50,
            messages: [{ role: 'user', content: testPrompt }],
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || `Anthropic API error: ${response.status}`);
        }

        const data = await response.json();
        if (!data.content?.[0]?.text) {
          throw new Error('Invalid response from Anthropic');
        }

        setTestResult({
          status: 'success',
          message: 'Successfully connected to Anthropic!',
        });
      } else if (props.llmProvider === 'ollama') {
        response = await fetch('http://localhost:11434/api/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: props.modelSlug || 'llama3:latest',
            prompt: testPrompt,
            stream: false,
          }),
        });

        if (!response.ok) {
          throw new Error(`Ollama API error: ${response.status}. Make sure Ollama is running locally.`);
        }

        const data = await response.json();
        if (!data.response) {
          throw new Error('Invalid response from Ollama');
        }

        setTestResult({
          status: 'success',
          message: 'Successfully connected to Ollama!',
        });
      }
    } catch (error: any) {
      setTestResult({
        status: 'error',
        message: error.message || 'Connection failed',
      });
    } finally {
      setTestingLLM(false);
    }
  };

  // Check if a font is available on the system
  // Memoize normalized font set for O(1) lookup instead of O(n) array search
  const normalizedFontsSet = useMemo(() => {
    const normalize = (str: string) => str.toLowerCase().replace(/[\s-]/g, '');
    const fontSet = new Set<string>();
    systemFonts.forEach(font => {
      fontSet.add(normalize(font));
      // Also add the original name for exact matches
      fontSet.add(font.toLowerCase());
    });
    return fontSet;
  }, [systemFonts]);

  const isFontAvailable = (fontName: string) => {
    const normalize = (str: string) => str.toLowerCase().replace(/[\s-]/g, '');
    const normalizedSearch = normalize(fontName);

    // Fast O(1) lookup
    if (normalizedFontsSet.has(normalizedSearch)) return true;
    if (normalizedFontsSet.has(fontName.toLowerCase())) return true;

    // Fallback to substring search (slower but comprehensive)
    for (const font of normalizedFontsSet) {
      if (font.includes(normalizedSearch) || normalizedSearch.includes(font)) {
        return true;
      }
    }
    return false;
  };

  const handleRecord = (e: React.KeyboardEvent, actionId: string) => {
    e.preventDefault();
    e.stopPropagation();

    // Escape cancels recording without saving
    if (e.key === 'Escape') {
      setRecordingId(null);
      return;
    }

    const keys = [];
    if (e.metaKey) keys.push('Meta');
    if (e.ctrlKey) keys.push('Ctrl');
    if (e.altKey) keys.push('Alt');
    if (e.shiftKey) keys.push('Shift');
    if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return;
    keys.push(e.key);
    props.setShortcuts({
      ...props.shortcuts,
      [actionId]: { ...props.shortcuts[actionId], keys }
    });
    setRecordingId(null);
  };

  if (!isOpen) return null;

  const ThemePicker = () => {
    const themePickerRef = React.useRef<HTMLDivElement>(null);

    const grouped = Object.values(themes).reduce((acc: Record<string, Theme[]>, t: Theme) => {
      if (!acc[t.mode]) acc[t.mode] = [];
      acc[t.mode].push(t);
      return acc;
    }, {} as Record<string, Theme[]>);

    // Ensure focus when component mounts
    React.useEffect(() => {
      themePickerRef.current?.focus();
    }, []);

    const handleThemePickerKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        // Create ordered array: dark themes first (left-to-right, top-to-bottom), then light themes
        const allThemes = [...(grouped['dark'] || []), ...(grouped['light'] || [])];
        const currentIndex = allThemes.findIndex((t: Theme) => t.id === props.activeThemeId);

        if (e.shiftKey) {
          // Shift+Tab: go backwards
          const prevIndex = currentIndex === 0 ? allThemes.length - 1 : currentIndex - 1;
          props.setActiveThemeId(allThemes[prevIndex].id);
        } else {
          // Tab: go forward
          const nextIndex = (currentIndex + 1) % allThemes.length;
          props.setActiveThemeId(allThemes[nextIndex].id);
        }
      }
    };

    return (
      <div
        ref={themePickerRef}
        className="space-y-6 outline-none"
        tabIndex={0}
        onKeyDown={handleThemePickerKeyDown}
      >
        {['dark', 'light'].map(mode => (
          <div key={mode}>
            <div className="text-xs font-bold uppercase mb-3 flex items-center gap-2" style={{ color: theme.colors.textDim }}>
              {mode === 'dark' ? <Moon className="w-3 h-3" /> : <Sun className="w-3 h-3" />}
              {mode} Mode
            </div>
            <div className="grid grid-cols-2 gap-3">
              {grouped[mode]?.map((t: Theme) => (
                <button
                  key={t.id}
                  onClick={() => props.setActiveThemeId(t.id)}
                  className={`p-3 rounded-lg border text-left transition-all ${props.activeThemeId === t.id ? 'ring-2' : ''}`}
                  style={{
                    borderColor: theme.colors.border,
                    backgroundColor: t.colors.bgSidebar,
                    ringColor: theme.colors.accent
                  }}
                  tabIndex={-1}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-bold" style={{ color: t.colors.textMain }}>{t.name}</span>
                    {props.activeThemeId === t.id && <Check className="w-4 h-4" style={{ color: theme.colors.accent }} />}
                  </div>
                  <div className="flex h-3 rounded overflow-hidden">
                    <div className="flex-1" style={{ backgroundColor: t.colors.bgMain }} />
                    <div className="flex-1" style={{ backgroundColor: t.colors.bgActivity }} />
                    <div className="flex-1" style={{ backgroundColor: t.colors.accent }} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 outline-none"
      tabIndex={0}
      ref={(el) => el?.focus()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
        // Allow all other keyboard events to propagate to child elements
        // This enables shortcut recording and tab navigation
      }}
    >
      <div className="w-[600px] h-[500px] rounded-xl border shadow-2xl overflow-hidden flex flex-col"
           style={{ backgroundColor: theme.colors.bgSidebar, borderColor: theme.colors.border }}>

        <div className="flex border-b" style={{ borderColor: theme.colors.border }}>
          <button onClick={() => setActiveTab('general')} className={`px-6 py-4 text-sm font-bold border-b-2 ${activeTab === 'general' ? 'border-indigo-500' : 'border-transparent'}`} tabIndex={-1}>General</button>
          <button onClick={() => setActiveTab('llm')} className={`px-6 py-4 text-sm font-bold border-b-2 ${activeTab === 'llm' ? 'border-indigo-500' : 'border-transparent'}`} tabIndex={-1}>LLM</button>
          <button onClick={() => setActiveTab('shortcuts')} className={`px-6 py-4 text-sm font-bold border-b-2 ${activeTab === 'shortcuts' ? 'border-indigo-500' : 'border-transparent'}`} tabIndex={-1}>Shortcuts</button>
          <button onClick={() => setActiveTab('theme')} className={`px-6 py-4 text-sm font-bold border-b-2 ${activeTab === 'theme' ? 'border-indigo-500' : 'border-transparent'}`} tabIndex={-1}>Themes</button>
          <button onClick={() => setActiveTab('network')} className={`px-6 py-4 text-sm font-bold border-b-2 ${activeTab === 'network' ? 'border-indigo-500' : 'border-transparent'}`} tabIndex={-1}>Network</button>
          <div className="flex-1 flex justify-end items-center pr-4">
            <button onClick={onClose} tabIndex={-1}><X className="w-5 h-5 opacity-50 hover:opacity-100" /></button>
          </div>
        </div>

        <div className="flex-1 p-6 overflow-y-auto">
          {activeTab === 'general' && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold opacity-70 uppercase mb-2">Default AI Agent</label>
                {loading ? (
                  <div className="text-sm opacity-50">Loading agents...</div>
                ) : (
                  <div className="space-y-2">
                    {agents.map((agent) => (
                      <button
                        key={agent.id}
                        disabled={agent.id !== 'claude-code' || !agent.available}
                        onClick={() => props.setDefaultAgent(agent.id)}
                        className={`w-full text-left p-3 rounded border transition-all ${
                          props.defaultAgent === agent.id ? 'ring-2' : ''
                        } ${(agent.id !== 'claude-code' || !agent.available) ? 'opacity-40 cursor-not-allowed' : 'hover:bg-opacity-10'}`}
                        style={{
                          borderColor: theme.colors.border,
                          backgroundColor: props.defaultAgent === agent.id ? theme.colors.accentDim : theme.colors.bgMain,
                          ringColor: theme.colors.accent,
                          color: theme.colors.textMain,
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{agent.name}</div>
                            {agent.path && (
                              <div className="text-xs opacity-50 font-mono mt-1">{agent.path}</div>
                            )}
                          </div>
                          {agent.id === 'claude-code' ? (
                            agent.available ? (
                              <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: theme.colors.success + '20', color: theme.colors.success }}>
                                Available
                              </span>
                            ) : (
                              <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: theme.colors.error + '20', color: theme.colors.error }}>
                                Not Found
                              </span>
                            )
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: theme.colors.warning + '20', color: theme.colors.warning }}>
                              Coming Soon
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Agent-Specific Configuration */}
              {!loading && agents.length > 0 && (() => {
                const selectedAgent = agents.find(a => a.id === props.defaultAgent);
                if (!selectedAgent || !selectedAgent.configOptions || selectedAgent.configOptions.length === 0) {
                  return null;
                }

                return (
                  <div>
                    <label className="block text-xs font-bold opacity-70 uppercase mb-2">
                      {selectedAgent.name} Configuration
                    </label>
                    <div className="space-y-3">
                      {selectedAgent.configOptions.map((option: any) => (
                        <div key={option.key}>
                          {option.type === 'checkbox' && (
                            <label className="flex items-center gap-3 p-3 rounded border cursor-pointer hover:bg-opacity-10"
                                   style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgMain }}>
                              <input
                                type="checkbox"
                                checked={agentConfigs[selectedAgent.id]?.[option.key] ?? option.default}
                                onChange={(e) => {
                                  const newConfig = {
                                    ...agentConfigs[selectedAgent.id],
                                    [option.key]: e.target.checked
                                  };
                                  setAgentConfigs(prev => ({
                                    ...prev,
                                    [selectedAgent.id]: newConfig
                                  }));
                                  window.maestro.agents.setConfig(selectedAgent.id, newConfig);
                                }}
                                className="w-4 h-4"
                                style={{ accentColor: theme.colors.accent }}
                              />
                              <div className="flex-1">
                                <div className="font-medium" style={{ color: theme.colors.textMain }}>
                                  {option.label}
                                </div>
                                <div className="text-xs opacity-50 mt-0.5" style={{ color: theme.colors.textDim }}>
                                  {option.description}
                                </div>
                              </div>
                            </label>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Font Family */}
              <div>
                <label className="block text-xs font-bold opacity-70 uppercase mb-2">Interface Font</label>
                {fontLoading ? (
                  <div className="text-sm opacity-50 p-2">Loading fonts...</div>
                ) : (
                  <>
                    <select
                      value={props.fontFamily}
                      onChange={(e) => props.setFontFamily(e.target.value)}
                      onFocus={handleFontInteraction}
                      onClick={handleFontInteraction}
                      className="w-full p-2 rounded border bg-transparent outline-none mb-3"
                      style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
                    >
                      <optgroup label="Common Monospace Fonts">
                        {['Roboto Mono', 'JetBrains Mono', 'Fira Code', 'Monaco', 'Menlo', 'Consolas', 'Courier New', 'SF Mono', 'Cascadia Code', 'Source Code Pro'].map(font => {
                          const available = fontsLoaded ? isFontAvailable(font) : true;
                          return (
                            <option
                              key={font}
                              value={font}
                              style={{ opacity: available ? 1 : 0.4 }}
                            >
                              {font} {fontsLoaded && !available && '(Not Found)'}
                            </option>
                          );
                        })}
                      </optgroup>
                      {customFonts.length > 0 && (
                        <optgroup label="Custom Fonts">
                          {customFonts.map(font => (
                            <option key={font} value={font}>
                              {font}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>

                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={customFontInput}
                          onChange={(e) => setCustomFontInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && addCustomFont()}
                          placeholder="Add custom font name..."
                          className="flex-1 p-2 rounded border bg-transparent outline-none text-sm"
                          style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
                        />
                        <button
                          onClick={addCustomFont}
                          className="px-3 py-2 rounded text-xs font-bold"
                          style={{ backgroundColor: theme.colors.accent, color: 'white' }}
                        >
                          Add
                        </button>
                      </div>

                      {customFonts.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {customFonts.map(font => (
                            <div
                              key={font}
                              className="flex items-center gap-2 px-2 py-1 rounded text-xs"
                              style={{ backgroundColor: theme.colors.bgActivity, borderColor: theme.colors.border }}
                            >
                              <span style={{ color: theme.colors.textMain }}>{font}</span>
                              <button
                                onClick={() => removeCustomFont(font)}
                                className="hover:opacity-70"
                                style={{ color: theme.colors.error }}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Font Size */}
              <div>
                <label className="block text-xs font-bold opacity-70 uppercase mb-2">Font Size</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => props.setFontSize(12)}
                    className={`flex-1 py-2 px-3 rounded border transition-all ${props.fontSize === 12 ? 'ring-2' : ''}`}
                    style={{
                      borderColor: theme.colors.border,
                      backgroundColor: props.fontSize === 12 ? theme.colors.accentDim : 'transparent',
                      ringColor: theme.colors.accent,
                      color: theme.colors.textMain
                    }}
                  >
                    Small
                  </button>
                  <button
                    onClick={() => props.setFontSize(14)}
                    className={`flex-1 py-2 px-3 rounded border transition-all ${props.fontSize === 14 ? 'ring-2' : ''}`}
                    style={{
                      borderColor: theme.colors.border,
                      backgroundColor: props.fontSize === 14 ? theme.colors.accentDim : 'transparent',
                      ringColor: theme.colors.accent,
                      color: theme.colors.textMain
                    }}
                  >
                    Medium
                  </button>
                  <button
                    onClick={() => props.setFontSize(16)}
                    className={`flex-1 py-2 px-3 rounded border transition-all ${props.fontSize === 16 ? 'ring-2' : ''}`}
                    style={{
                      borderColor: theme.colors.border,
                      backgroundColor: props.fontSize === 16 ? theme.colors.accentDim : 'transparent',
                      ringColor: theme.colors.accent,
                      color: theme.colors.textMain
                    }}
                  >
                    Large
                  </button>
                  <button
                    onClick={() => props.setFontSize(18)}
                    className={`flex-1 py-2 px-3 rounded border transition-all ${props.fontSize === 18 ? 'ring-2' : ''}`}
                    style={{
                      borderColor: theme.colors.border,
                      backgroundColor: props.fontSize === 18 ? theme.colors.accentDim : 'transparent',
                      ringColor: theme.colors.accent,
                      color: theme.colors.textMain
                    }}
                  >
                    X-Large
                  </button>
                </div>
              </div>

              {/* Terminal Width */}
              <div>
                <label className="block text-xs font-bold opacity-70 uppercase mb-2">Terminal Width (Columns)</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => props.setTerminalWidth(80)}
                    className={`flex-1 py-2 px-3 rounded border transition-all ${props.terminalWidth === 80 ? 'ring-2' : ''}`}
                    style={{
                      borderColor: theme.colors.border,
                      backgroundColor: props.terminalWidth === 80 ? theme.colors.accentDim : 'transparent',
                      ringColor: theme.colors.accent,
                      color: theme.colors.textMain
                    }}
                  >
                    80
                  </button>
                  <button
                    onClick={() => props.setTerminalWidth(100)}
                    className={`flex-1 py-2 px-3 rounded border transition-all ${props.terminalWidth === 100 ? 'ring-2' : ''}`}
                    style={{
                      borderColor: theme.colors.border,
                      backgroundColor: props.terminalWidth === 100 ? theme.colors.accentDim : 'transparent',
                      ringColor: theme.colors.accent,
                      color: theme.colors.textMain
                    }}
                  >
                    100
                  </button>
                  <button
                    onClick={() => props.setTerminalWidth(120)}
                    className={`flex-1 py-2 px-3 rounded border transition-all ${props.terminalWidth === 120 ? 'ring-2' : ''}`}
                    style={{
                      borderColor: theme.colors.border,
                      backgroundColor: props.terminalWidth === 120 ? theme.colors.accentDim : 'transparent',
                      ringColor: theme.colors.accent,
                      color: theme.colors.textMain
                    }}
                  >
                    120
                  </button>
                  <button
                    onClick={() => props.setTerminalWidth(160)}
                    className={`flex-1 py-2 px-3 rounded border transition-all ${props.terminalWidth === 160 ? 'ring-2' : ''}`}
                    style={{
                      borderColor: theme.colors.border,
                      backgroundColor: props.terminalWidth === 160 ? theme.colors.accentDim : 'transparent',
                      ringColor: theme.colors.accent,
                      color: theme.colors.textMain
                    }}
                  >
                    160
                  </button>
                </div>
              </div>

              {/* Log Level */}
              <div>
                <label className="block text-xs font-bold opacity-70 uppercase mb-2">System Log Level</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => props.setLogLevel('debug')}
                    className={`flex-1 py-2 px-3 rounded border transition-all ${props.logLevel === 'debug' ? 'ring-2' : ''}`}
                    style={{
                      borderColor: theme.colors.border,
                      backgroundColor: props.logLevel === 'debug' ? '#6366f1' : 'transparent',
                      ringColor: '#6366f1',
                      color: props.logLevel === 'debug' ? 'white' : theme.colors.textMain
                    }}
                  >
                    Debug
                  </button>
                  <button
                    onClick={() => props.setLogLevel('info')}
                    className={`flex-1 py-2 px-3 rounded border transition-all ${props.logLevel === 'info' ? 'ring-2' : ''}`}
                    style={{
                      borderColor: theme.colors.border,
                      backgroundColor: props.logLevel === 'info' ? '#3b82f6' : 'transparent',
                      ringColor: '#3b82f6',
                      color: props.logLevel === 'info' ? 'white' : theme.colors.textMain
                    }}
                  >
                    Info
                  </button>
                  <button
                    onClick={() => props.setLogLevel('warn')}
                    className={`flex-1 py-2 px-3 rounded border transition-all ${props.logLevel === 'warn' ? 'ring-2' : ''}`}
                    style={{
                      borderColor: theme.colors.border,
                      backgroundColor: props.logLevel === 'warn' ? '#f59e0b' : 'transparent',
                      ringColor: '#f59e0b',
                      color: props.logLevel === 'warn' ? 'white' : theme.colors.textMain
                    }}
                  >
                    Warn
                  </button>
                  <button
                    onClick={() => props.setLogLevel('error')}
                    className={`flex-1 py-2 px-3 rounded border transition-all ${props.logLevel === 'error' ? 'ring-2' : ''}`}
                    style={{
                      borderColor: theme.colors.border,
                      backgroundColor: props.logLevel === 'error' ? '#ef4444' : 'transparent',
                      ringColor: '#ef4444',
                      color: props.logLevel === 'error' ? 'white' : theme.colors.textMain
                    }}
                  >
                    Error
                  </button>
                </div>
                <p className="text-xs opacity-50 mt-2">
                  Higher levels show fewer logs. Debug shows all logs, Error shows only errors.
                </p>
              </div>

              {/* Max Output Lines */}
              <div>
                <label className="block text-xs font-bold opacity-70 uppercase mb-2">Max Output Lines per Response</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => props.setMaxOutputLines(15)}
                    className={`flex-1 py-2 px-3 rounded border transition-all ${props.maxOutputLines === 15 ? 'ring-2' : ''}`}
                    style={{
                      borderColor: theme.colors.border,
                      backgroundColor: props.maxOutputLines === 15 ? theme.colors.accentDim : 'transparent',
                      ringColor: theme.colors.accent,
                      color: theme.colors.textMain
                    }}
                  >
                    15
                  </button>
                  <button
                    onClick={() => props.setMaxOutputLines(25)}
                    className={`flex-1 py-2 px-3 rounded border transition-all ${props.maxOutputLines === 25 ? 'ring-2' : ''}`}
                    style={{
                      borderColor: theme.colors.border,
                      backgroundColor: props.maxOutputLines === 25 ? theme.colors.accentDim : 'transparent',
                      ringColor: theme.colors.accent,
                      color: theme.colors.textMain
                    }}
                  >
                    25
                  </button>
                  <button
                    onClick={() => props.setMaxOutputLines(50)}
                    className={`flex-1 py-2 px-3 rounded border transition-all ${props.maxOutputLines === 50 ? 'ring-2' : ''}`}
                    style={{
                      borderColor: theme.colors.border,
                      backgroundColor: props.maxOutputLines === 50 ? theme.colors.accentDim : 'transparent',
                      ringColor: theme.colors.accent,
                      color: theme.colors.textMain
                    }}
                  >
                    50
                  </button>
                  <button
                    onClick={() => props.setMaxOutputLines(100)}
                    className={`flex-1 py-2 px-3 rounded border transition-all ${props.maxOutputLines === 100 ? 'ring-2' : ''}`}
                    style={{
                      borderColor: theme.colors.border,
                      backgroundColor: props.maxOutputLines === 100 ? theme.colors.accentDim : 'transparent',
                      ringColor: theme.colors.accent,
                      color: theme.colors.textMain
                    }}
                  >
                    100
                  </button>
                  <button
                    onClick={() => props.setMaxOutputLines(Infinity)}
                    className={`flex-1 py-2 px-3 rounded border transition-all ${props.maxOutputLines === Infinity ? 'ring-2' : ''}`}
                    style={{
                      borderColor: theme.colors.border,
                      backgroundColor: props.maxOutputLines === Infinity ? theme.colors.accentDim : 'transparent',
                      ringColor: theme.colors.accent,
                      color: theme.colors.textMain
                    }}
                  >
                    All
                  </button>
                </div>
                <p className="text-xs opacity-50 mt-2">
                  Long outputs will be collapsed into a scrollable window. Set to "All" to always show full output.
                </p>
              </div>

              {/* Default Shell */}
              <div>
                <label className="block text-xs font-bold opacity-70 uppercase mb-2 flex items-center gap-2">
                  <Terminal className="w-3 h-3" />
                  Default Terminal Shell
                </label>
                {shellsLoading ? (
                  <div className="text-sm opacity-50 p-2">Loading shells...</div>
                ) : (
                  <div className="space-y-2">
                    {shellsLoaded && shells.length > 0 ? (
                      shells.map((shell) => (
                        <button
                          key={shell.id}
                          disabled={!shell.available}
                          onClick={() => {
                            if (shell.available) {
                              props.setDefaultShell(shell.id);
                            }
                          }}
                          onMouseEnter={handleShellInteraction}
                          onFocus={handleShellInteraction}
                          className={`w-full text-left p-3 rounded border transition-all ${
                            props.defaultShell === shell.id ? 'ring-2' : ''
                          } ${!shell.available ? 'opacity-40 cursor-not-allowed' : 'hover:bg-opacity-10'}`}
                          style={{
                            borderColor: theme.colors.border,
                            backgroundColor: props.defaultShell === shell.id ? theme.colors.accentDim : theme.colors.bgMain,
                            ringColor: theme.colors.accent,
                            color: theme.colors.textMain,
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">{shell.name}</div>
                              {shell.path && (
                                <div className="text-xs opacity-50 font-mono mt-1">{shell.path}</div>
                              )}
                            </div>
                            {shell.available ? (
                              props.defaultShell === shell.id ? (
                                <Check className="w-4 h-4" style={{ color: theme.colors.accent }} />
                              ) : (
                                <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: theme.colors.success + '20', color: theme.colors.success }}>
                                  Available
                                </span>
                              )
                            ) : (
                              <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: theme.colors.error + '20', color: theme.colors.error }}>
                                Not Found
                              </span>
                            )}
                          </div>
                        </button>
                      ))
                    ) : (
                      <button
                        onClick={handleShellInteraction}
                        className="w-full text-left p-3 rounded border"
                        style={{
                          borderColor: theme.colors.border,
                          backgroundColor: theme.colors.bgMain,
                          color: theme.colors.textMain,
                        }}
                      >
                        Click to detect available shells...
                      </button>
                    )}
                  </div>
                )}
                <p className="text-xs opacity-50 mt-2">
                  Choose which shell to use for terminal sessions. Only available shells are shown.
                </p>
              </div>

              {/* Input Behavior Settings */}
              <div>
                <label className="block text-xs font-bold opacity-70 uppercase mb-2 flex items-center gap-2">
                  <Keyboard className="w-3 h-3" />
                  Input Send Behavior
                </label>
                <p className="text-xs opacity-50 mb-3">
                  Configure how to send messages in each mode. Choose between Enter or Command+Enter for each input type.
                </p>

                {/* AI Mode Setting */}
                <div className="mb-4 p-3 rounded border" style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgMain }}>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium">AI Interaction Mode</label>
                    <button
                      onClick={() => props.setEnterToSendAI(!props.enterToSendAI)}
                      className="px-3 py-1.5 rounded text-xs font-mono transition-all"
                      style={{
                        backgroundColor: props.enterToSendAI ? theme.colors.accentDim : theme.colors.bgActivity,
                        color: theme.colors.textMain,
                        border: `1px solid ${theme.colors.border}`
                      }}
                    >
                      {props.enterToSendAI ? 'Enter' : '⌘ + Enter'}
                    </button>
                  </div>
                  <p className="text-xs opacity-50">
                    {props.enterToSendAI
                      ? 'Press Enter to send. Use Shift+Enter for new line.'
                      : 'Press Command+Enter to send. Enter creates new line.'}
                  </p>
                </div>

                {/* Terminal Mode Setting */}
                <div className="p-3 rounded border" style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgMain }}>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium">Terminal Mode</label>
                    <button
                      onClick={() => props.setEnterToSendTerminal(!props.enterToSendTerminal)}
                      className="px-3 py-1.5 rounded text-xs font-mono transition-all"
                      style={{
                        backgroundColor: props.enterToSendTerminal ? theme.colors.accentDim : theme.colors.bgActivity,
                        color: theme.colors.textMain,
                        border: `1px solid ${theme.colors.border}`
                      }}
                    >
                      {props.enterToSendTerminal ? 'Enter' : '⌘ + Enter'}
                    </button>
                  </div>
                  <p className="text-xs opacity-50">
                    {props.enterToSendTerminal
                      ? 'Press Enter to send. Use Shift+Enter for new line.'
                      : 'Press Command+Enter to send. Enter creates new line.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'llm' && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold opacity-70 uppercase mb-2">LLM Provider</label>
                <select
                  value={props.llmProvider}
                  onChange={(e) => props.setLlmProvider(e.target.value)}
                  className="w-full p-2 rounded border bg-transparent outline-none"
                  style={{ borderColor: theme.colors.border }}
                >
                  <option value="openrouter">OpenRouter</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="ollama">Ollama (Local)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold opacity-70 uppercase mb-2">Model Slug</label>
                <input
                  value={props.modelSlug}
                  onChange={(e) => props.setModelSlug(e.target.value)}
                  className="w-full p-2 rounded border bg-transparent outline-none"
                  style={{ borderColor: theme.colors.border }}
                  placeholder={props.llmProvider === 'ollama' ? 'llama3:latest' : 'anthropic/claude-3.5-sonnet'}
                />
              </div>

              {props.llmProvider !== 'ollama' && (
                <div>
                  <label className="block text-xs font-bold opacity-70 uppercase mb-2">API Key</label>
                  <div className="flex items-center border rounded px-3 py-2" style={{ backgroundColor: theme.colors.bgMain, borderColor: theme.colors.border }}>
                    <Key className="w-4 h-4 mr-2 opacity-50" />
                    <input
                      type="password"
                      value={props.apiKey}
                      onChange={(e) => props.setApiKey(e.target.value)}
                      className="bg-transparent flex-1 text-sm outline-none"
                      placeholder="sk-..."
                    />
                  </div>
                  <p className="text-[10px] mt-2 opacity-50">Keys are stored locally in ~/.maestro/settings.json</p>
                </div>
              )}

              {/* Test Connection */}
              <div className="pt-4 border-t" style={{ borderColor: theme.colors.border }}>
                <button
                  onClick={testLLMConnection}
                  disabled={testingLLM || (props.llmProvider !== 'ollama' && !props.apiKey)}
                  className="w-full py-3 rounded-lg font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: theme.colors.accent,
                    color: 'white',
                  }}
                >
                  {testingLLM ? 'Testing Connection...' : 'Test Connection'}
                </button>

                {testResult.status && (
                  <div
                    className="mt-3 p-3 rounded-lg text-sm"
                    style={{
                      backgroundColor: testResult.status === 'success' ? theme.colors.success + '20' : theme.colors.error + '20',
                      color: testResult.status === 'success' ? theme.colors.success : theme.colors.error,
                      border: `1px solid ${testResult.status === 'success' ? theme.colors.success : theme.colors.error}`,
                    }}
                  >
                    {testResult.message}
                  </div>
                )}

                <p className="text-[10px] mt-3 opacity-50 text-center">
                  Test sends a simple prompt to verify connectivity and configuration
                </p>
              </div>
            </div>
          )}

          {activeTab === 'network' && (
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold opacity-70 uppercase mb-2">Tunnel Provider</label>
                <div className="flex items-center gap-4">
                  <button
                    className={`flex-1 py-3 border rounded-lg flex items-center justify-center gap-2 ${props.tunnelProvider === 'ngrok' ? 'ring-2 ring-indigo-500 border-indigo-500' : 'opacity-50'}`}
                    style={{ borderColor: theme.colors.border }}
                    onClick={() => props.setTunnelProvider('ngrok')}
                  >
                    <div className="font-bold">ngrok</div>
                  </button>
                  <button
                    className={`flex-1 py-3 border rounded-lg flex items-center justify-center gap-2 ${props.tunnelProvider === 'cloudflare' ? 'ring-2 ring-indigo-500 border-indigo-500' : 'opacity-50'}`}
                    style={{ borderColor: theme.colors.border }}
                    onClick={() => props.setTunnelProvider('cloudflare')}
                  >
                    <div className="font-bold">Cloudflare</div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold opacity-70 uppercase mb-2">Auth Token / API Key</label>
                <div className="flex items-center border rounded px-3 py-2" style={{ backgroundColor: theme.colors.bgMain, borderColor: theme.colors.border }}>
                  <Key className="w-4 h-4 mr-2 opacity-50" />
                  <input
                    type="password"
                    value={props.tunnelApiKey}
                    onChange={(e) => props.setTunnelApiKey(e.target.value)}
                    className="bg-transparent flex-1 text-sm outline-none"
                    placeholder={`Enter ${props.tunnelProvider} auth token...`}
                  />
                </div>
                <p className="text-[10px] mt-2 opacity-50">Tokens are stored securely in your OS keychain. Tunnels will not start without a valid token.</p>
              </div>
            </div>
          )}

          {activeTab === 'shortcuts' && (
            <div className="space-y-3">
              <input
                type="text"
                value={shortcutsFilter}
                onChange={(e) => setShortcutsFilter(e.target.value)}
                placeholder="Filter shortcuts..."
                className="w-full px-3 py-2 rounded border bg-transparent outline-none text-sm"
                style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
                autoFocus
              />
              <div className="space-y-2 max-h-[350px] overflow-y-auto pr-2">
                {Object.values(props.shortcuts)
                  .filter((sc: Shortcut) => sc.label.toLowerCase().includes(shortcutsFilter.toLowerCase()))
                  .map((sc: Shortcut) => (
                    <div key={sc.id} className="flex items-center justify-between p-3 rounded border" style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgMain }}>
                      <span className="text-sm font-medium" style={{ color: theme.colors.textMain }}>{sc.label}</span>
                      <button
                        onClick={() => setRecordingId(sc.id)}
                        onKeyDown={(e) => recordingId === sc.id && handleRecord(e, sc.id)}
                        className={`px-3 py-1.5 rounded border text-xs font-mono min-w-[80px] text-center transition-colors ${recordingId === sc.id ? 'ring-2' : ''}`}
                        style={{
                          borderColor: recordingId === sc.id ? theme.colors.accent : theme.colors.border,
                          backgroundColor: recordingId === sc.id ? theme.colors.accentDim : theme.colors.bgActivity,
                          color: recordingId === sc.id ? theme.colors.accent : theme.colors.textDim,
                          ringColor: theme.colors.accent
                        }}
                      >
                        {recordingId === sc.id ? 'Press keys...' : sc.keys.join(' + ')}
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {activeTab === 'theme' && <ThemePicker />}
        </div>
      </div>
    </div>
  );
}

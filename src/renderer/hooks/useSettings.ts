import { useState, useEffect } from 'react';
import type { LLMProvider, ThemeId, Shortcut, CustomAICommand, GlobalStats } from '../types';
import { DEFAULT_SHORTCUTS } from '../constants/shortcuts';

// Default global stats
const DEFAULT_GLOBAL_STATS: GlobalStats = {
  totalSessions: 0,
  totalMessages: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCacheReadTokens: 0,
  totalCacheCreationTokens: 0,
  totalCostUsd: 0,
  totalActiveTimeMs: 0,
};

// Default AI commands that ship with Maestro
// Template variables available: {{SESSION_ID}}, {{SESSION_NAME}}, {{CLAUDE_SESSION_ID}}, {{PROJECT_NAME}}, {{DATE}}, {{TIME}}, etc.
const DEFAULT_AI_COMMANDS: CustomAICommand[] = [
  {
    id: 'synopsis',
    command: '/synopsis',
    description: 'Get a synopsis of recent work and add to history',
    prompt: 'Synopsize our recent work in 2-3 sentences max.',
    isBuiltIn: true,
    isSystemCommand: true, // This is handled by slashCommands.ts, not sent as a prompt
  },
  {
    id: 'commit',
    command: '/commit',
    description: 'Commit outstanding changes and push up',
    prompt: `Examine the current git diff and determine if we need to make any updates to the README.md or CLAUDE.md files.

Then create a sensible git commit message. IMPORTANT: The commit message MUST include the Claude session ID "{{CLAUDE_SESSION_ID}}" somewhere in the commit body (not the subject line). This allows us to trace commits back to their original conversation for context and continuity.

Example commit format:
<subject line summarizing changes>

<detailed description>

Session: {{CLAUDE_SESSION_ID}}

After committing, push all changes up to origin.`,
    isBuiltIn: true,
  },
];

export interface UseSettingsReturn {
  // Loading state
  settingsLoaded: boolean;

  // LLM settings
  llmProvider: LLMProvider;
  modelSlug: string;
  apiKey: string;
  setLlmProvider: (value: LLMProvider) => void;
  setModelSlug: (value: string) => void;
  setApiKey: (value: string) => void;

  // Tunnel settings
  tunnelProvider: string;
  tunnelApiKey: string;
  setTunnelProvider: (value: string) => void;
  setTunnelApiKey: (value: string) => void;

  // Agent settings
  defaultAgent: string;
  setDefaultAgent: (value: string) => void;

  // Shell settings
  defaultShell: string;
  setDefaultShell: (value: string) => void;

  // Font settings
  fontFamily: string;
  fontSize: number;
  customFonts: string[];
  setFontFamily: (value: string) => void;
  setFontSize: (value: number) => void;
  setCustomFonts: (value: string[]) => void;

  // UI settings
  activeThemeId: ThemeId;
  setActiveThemeId: (value: ThemeId) => void;
  enterToSendAI: boolean;
  setEnterToSendAI: (value: boolean) => void;
  enterToSendTerminal: boolean;
  setEnterToSendTerminal: (value: boolean) => void;
  leftSidebarWidth: number;
  rightPanelWidth: number;
  markdownRawMode: boolean;
  setLeftSidebarWidth: (value: number) => void;
  setRightPanelWidth: (value: number) => void;
  setMarkdownRawMode: (value: boolean) => void;

  // Terminal settings
  terminalWidth: number;
  setTerminalWidth: (value: number) => void;

  // Logging settings
  logLevel: string;
  setLogLevel: (value: string) => void;
  maxLogBuffer: number;
  setMaxLogBuffer: (value: number) => void;

  // Output settings
  maxOutputLines: number;
  setMaxOutputLines: (value: number) => void;

  // Notification settings
  osNotificationsEnabled: boolean;
  setOsNotificationsEnabled: (value: boolean) => void;
  audioFeedbackEnabled: boolean;
  setAudioFeedbackEnabled: (value: boolean) => void;
  audioFeedbackCommand: string;
  setAudioFeedbackCommand: (value: string) => void;
  toastDuration: number;
  setToastDuration: (value: number) => void;

  // Shortcuts
  shortcuts: Record<string, Shortcut>;
  setShortcuts: (value: Record<string, Shortcut>) => void;

  // Custom AI Commands
  customAICommands: CustomAICommand[];
  setCustomAICommands: (value: CustomAICommand[]) => void;

  // Global Stats (persistent across restarts)
  globalStats: GlobalStats;
  setGlobalStats: (value: GlobalStats) => void;
  updateGlobalStats: (delta: Partial<GlobalStats>) => void;
}

export function useSettings(): UseSettingsReturn {
  // Loading state
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // LLM Config
  const [llmProvider, setLlmProviderState] = useState<LLMProvider>('openrouter');
  const [modelSlug, setModelSlugState] = useState('anthropic/claude-3.5-sonnet');
  const [apiKey, setApiKeyState] = useState('');

  // Tunnel Config
  const [tunnelProvider, setTunnelProviderState] = useState('ngrok');
  const [tunnelApiKey, setTunnelApiKeyState] = useState('');

  // Agent Config
  const [defaultAgent, setDefaultAgentState] = useState('claude-code');

  // Shell Config
  const [defaultShell, setDefaultShellState] = useState('zsh');

  // Font Config
  const [fontFamily, setFontFamilyState] = useState('Roboto Mono, Menlo, "Courier New", monospace');
  const [fontSize, setFontSizeState] = useState(14);
  const [customFonts, setCustomFontsState] = useState<string[]>([]);

  // UI Config
  const [activeThemeId, setActiveThemeIdState] = useState<ThemeId>('dracula');
  const [enterToSendAI, setEnterToSendAIState] = useState(false); // AI mode defaults to Command+Enter
  const [enterToSendTerminal, setEnterToSendTerminalState] = useState(true); // Terminal defaults to Enter
  const [leftSidebarWidth, setLeftSidebarWidthState] = useState(256);
  const [rightPanelWidth, setRightPanelWidthState] = useState(384);
  const [markdownRawMode, setMarkdownRawModeState] = useState(false);

  // Terminal Config
  const [terminalWidth, setTerminalWidthState] = useState(100);

  // Logging Config
  const [logLevel, setLogLevelState] = useState('info');
  const [maxLogBuffer, setMaxLogBufferState] = useState(5000);

  // Output Config
  const [maxOutputLines, setMaxOutputLinesState] = useState(25);

  // Notification Config
  const [osNotificationsEnabled, setOsNotificationsEnabledState] = useState(true); // Default: on
  const [audioFeedbackEnabled, setAudioFeedbackEnabledState] = useState(false); // Default: off
  const [audioFeedbackCommand, setAudioFeedbackCommandState] = useState('say'); // Default: macOS say command
  const [toastDuration, setToastDurationState] = useState(20); // Default: 20 seconds, 0 = never auto-dismiss

  // Shortcuts
  const [shortcuts, setShortcutsState] = useState<Record<string, Shortcut>>(DEFAULT_SHORTCUTS);

  // Custom AI Commands
  const [customAICommands, setCustomAICommandsState] = useState<CustomAICommand[]>(DEFAULT_AI_COMMANDS);

  // Global Stats (persistent)
  const [globalStats, setGlobalStatsState] = useState<GlobalStats>(DEFAULT_GLOBAL_STATS);

  // Wrapper functions that persist to electron-store
  const setLlmProvider = (value: LLMProvider) => {
    setLlmProviderState(value);
    window.maestro.settings.set('llmProvider', value);
  };

  const setModelSlug = (value: string) => {
    setModelSlugState(value);
    window.maestro.settings.set('modelSlug', value);
  };

  const setApiKey = (value: string) => {
    setApiKeyState(value);
    window.maestro.settings.set('apiKey', value);
  };

  const setTunnelProvider = (value: string) => {
    setTunnelProviderState(value);
    window.maestro.settings.set('tunnelProvider', value);
  };

  const setTunnelApiKey = (value: string) => {
    setTunnelApiKeyState(value);
    window.maestro.settings.set('tunnelApiKey', value);
  };

  const setDefaultAgent = (value: string) => {
    setDefaultAgentState(value);
    window.maestro.settings.set('defaultAgent', value);
  };

  const setDefaultShell = (value: string) => {
    setDefaultShellState(value);
    window.maestro.settings.set('defaultShell', value);
  };

  const setFontFamily = (value: string) => {
    setFontFamilyState(value);
    window.maestro.settings.set('fontFamily', value);
  };

  const setFontSize = (value: number) => {
    setFontSizeState(value);
    window.maestro.settings.set('fontSize', value);
  };

  const setCustomFonts = (value: string[]) => {
    setCustomFontsState(value);
    window.maestro.settings.set('customFonts', value);
  };

  const setActiveThemeId = (value: ThemeId) => {
    setActiveThemeIdState(value);
    window.maestro.settings.set('activeThemeId', value);
  };

  const setEnterToSendAI = (value: boolean) => {
    setEnterToSendAIState(value);
    window.maestro.settings.set('enterToSendAI', value);
  };

  const setEnterToSendTerminal = (value: boolean) => {
    setEnterToSendTerminalState(value);
    window.maestro.settings.set('enterToSendTerminal', value);
  };

  const setLeftSidebarWidth = (width: number) => {
    setLeftSidebarWidthState(width);
    window.maestro.settings.set('leftSidebarWidth', width);
  };

  const setRightPanelWidth = (width: number) => {
    setRightPanelWidthState(width);
    window.maestro.settings.set('rightPanelWidth', width);
  };

  const setMarkdownRawMode = (value: boolean) => {
    setMarkdownRawModeState(value);
    window.maestro.settings.set('markdownRawMode', value);
  };

  const setShortcuts = (value: Record<string, Shortcut>) => {
    setShortcutsState(value);
    window.maestro.settings.set('shortcuts', value);
  };

  const setTerminalWidth = (value: number) => {
    setTerminalWidthState(value);
    window.maestro.settings.set('terminalWidth', value);
  };

  const setLogLevel = async (value: string) => {
    setLogLevelState(value);
    await window.maestro.logger.setLogLevel(value);
  };

  const setMaxLogBuffer = async (value: number) => {
    setMaxLogBufferState(value);
    await window.maestro.logger.setMaxLogBuffer(value);
  };

  const setMaxOutputLines = (value: number) => {
    setMaxOutputLinesState(value);
    window.maestro.settings.set('maxOutputLines', value);
  };

  const setOsNotificationsEnabled = (value: boolean) => {
    setOsNotificationsEnabledState(value);
    window.maestro.settings.set('osNotificationsEnabled', value);
  };

  const setAudioFeedbackEnabled = (value: boolean) => {
    setAudioFeedbackEnabledState(value);
    window.maestro.settings.set('audioFeedbackEnabled', value);
  };

  const setAudioFeedbackCommand = (value: string) => {
    setAudioFeedbackCommandState(value);
    window.maestro.settings.set('audioFeedbackCommand', value);
  };

  const setToastDuration = (value: number) => {
    setToastDurationState(value);
    window.maestro.settings.set('toastDuration', value);
  };

  const setCustomAICommands = (value: CustomAICommand[]) => {
    setCustomAICommandsState(value);
    window.maestro.settings.set('customAICommands', value);
  };

  const setGlobalStats = (value: GlobalStats) => {
    setGlobalStatsState(value);
    window.maestro.settings.set('globalStats', value);
  };

  // Update global stats by adding deltas to existing values
  const updateGlobalStats = (delta: Partial<GlobalStats>) => {
    setGlobalStatsState(prev => {
      const updated: GlobalStats = {
        totalSessions: prev.totalSessions + (delta.totalSessions || 0),
        totalMessages: prev.totalMessages + (delta.totalMessages || 0),
        totalInputTokens: prev.totalInputTokens + (delta.totalInputTokens || 0),
        totalOutputTokens: prev.totalOutputTokens + (delta.totalOutputTokens || 0),
        totalCacheReadTokens: prev.totalCacheReadTokens + (delta.totalCacheReadTokens || 0),
        totalCacheCreationTokens: prev.totalCacheCreationTokens + (delta.totalCacheCreationTokens || 0),
        totalCostUsd: prev.totalCostUsd + (delta.totalCostUsd || 0),
        totalActiveTimeMs: prev.totalActiveTimeMs + (delta.totalActiveTimeMs || 0),
      };
      window.maestro.settings.set('globalStats', updated);
      return updated;
    });
  };

  // Load settings from electron-store on mount
  useEffect(() => {
    const loadSettings = async () => {
      // Migration: check for old enterToSend setting
      const oldEnterToSend = await window.maestro.settings.get('enterToSend');
      const savedEnterToSendAI = await window.maestro.settings.get('enterToSendAI');
      const savedEnterToSendTerminal = await window.maestro.settings.get('enterToSendTerminal');

      const savedLlmProvider = await window.maestro.settings.get('llmProvider');
      const savedModelSlug = await window.maestro.settings.get('modelSlug');
      const savedApiKey = await window.maestro.settings.get('apiKey');
      const savedTunnelProvider = await window.maestro.settings.get('tunnelProvider');
      const savedTunnelApiKey = await window.maestro.settings.get('tunnelApiKey');
      const savedDefaultAgent = await window.maestro.settings.get('defaultAgent');
      const savedDefaultShell = await window.maestro.settings.get('defaultShell');
      const savedFontSize = await window.maestro.settings.get('fontSize');
      const savedFontFamily = await window.maestro.settings.get('fontFamily');
      const savedCustomFonts = await window.maestro.settings.get('customFonts');
      const savedLeftSidebarWidth = await window.maestro.settings.get('leftSidebarWidth');
      const savedRightPanelWidth = await window.maestro.settings.get('rightPanelWidth');
      const savedMarkdownRawMode = await window.maestro.settings.get('markdownRawMode');
      const savedShortcuts = await window.maestro.settings.get('shortcuts');
      const savedActiveThemeId = await window.maestro.settings.get('activeThemeId');
      const savedTerminalWidth = await window.maestro.settings.get('terminalWidth');
      const savedLogLevel = await window.maestro.logger.getLogLevel();
      const savedMaxLogBuffer = await window.maestro.logger.getMaxLogBuffer();
      const savedMaxOutputLines = await window.maestro.settings.get('maxOutputLines');
      const savedOsNotificationsEnabled = await window.maestro.settings.get('osNotificationsEnabled');
      const savedAudioFeedbackEnabled = await window.maestro.settings.get('audioFeedbackEnabled');
      const savedAudioFeedbackCommand = await window.maestro.settings.get('audioFeedbackCommand');
      const savedToastDuration = await window.maestro.settings.get('toastDuration');
      const savedCustomAICommands = await window.maestro.settings.get('customAICommands');
      const savedGlobalStats = await window.maestro.settings.get('globalStats');

      // Migration: if old setting exists but new ones don't, migrate
      if (oldEnterToSend !== undefined && savedEnterToSendAI === undefined && savedEnterToSendTerminal === undefined) {
        setEnterToSendAIState(oldEnterToSend);
        setEnterToSendTerminalState(oldEnterToSend);
        window.maestro.settings.set('enterToSendAI', oldEnterToSend);
        window.maestro.settings.set('enterToSendTerminal', oldEnterToSend);
      } else {
        if (savedEnterToSendAI !== undefined) setEnterToSendAIState(savedEnterToSendAI);
        if (savedEnterToSendTerminal !== undefined) setEnterToSendTerminalState(savedEnterToSendTerminal);
      }

      if (savedLlmProvider !== undefined) setLlmProviderState(savedLlmProvider);
      if (savedModelSlug !== undefined) setModelSlugState(savedModelSlug);
      if (savedApiKey !== undefined) setApiKeyState(savedApiKey);
      if (savedTunnelProvider !== undefined) setTunnelProviderState(savedTunnelProvider);
      if (savedTunnelApiKey !== undefined) setTunnelApiKeyState(savedTunnelApiKey);
      if (savedDefaultAgent !== undefined) setDefaultAgentState(savedDefaultAgent);
      if (savedDefaultShell !== undefined) setDefaultShellState(savedDefaultShell);
      if (savedFontSize !== undefined) setFontSizeState(savedFontSize);
      if (savedFontFamily !== undefined) setFontFamilyState(savedFontFamily);
      if (savedCustomFonts !== undefined) setCustomFontsState(savedCustomFonts);
      if (savedLeftSidebarWidth !== undefined) setLeftSidebarWidthState(savedLeftSidebarWidth);
      if (savedRightPanelWidth !== undefined) setRightPanelWidthState(savedRightPanelWidth);
      if (savedMarkdownRawMode !== undefined) setMarkdownRawModeState(savedMarkdownRawMode);
      if (savedActiveThemeId !== undefined) setActiveThemeIdState(savedActiveThemeId);
      if (savedTerminalWidth !== undefined) setTerminalWidthState(savedTerminalWidth);
      if (savedLogLevel !== undefined) setLogLevelState(savedLogLevel);
      if (savedMaxLogBuffer !== undefined) setMaxLogBufferState(savedMaxLogBuffer);
      if (savedMaxOutputLines !== undefined) setMaxOutputLinesState(savedMaxOutputLines);
      if (savedOsNotificationsEnabled !== undefined) setOsNotificationsEnabledState(savedOsNotificationsEnabled);
      if (savedAudioFeedbackEnabled !== undefined) setAudioFeedbackEnabledState(savedAudioFeedbackEnabled);
      if (savedAudioFeedbackCommand !== undefined) setAudioFeedbackCommandState(savedAudioFeedbackCommand);
      if (savedToastDuration !== undefined) setToastDurationState(savedToastDuration);

      // Merge saved shortcuts with defaults (in case new shortcuts were added)
      if (savedShortcuts !== undefined) {
        setShortcutsState({ ...DEFAULT_SHORTCUTS, ...savedShortcuts });
      }

      // Merge saved AI commands with defaults (ensure built-in commands always exist)
      if (savedCustomAICommands !== undefined) {
        // Start with defaults, then merge saved commands (by ID to avoid duplicates)
        const commandsById = new Map<string, CustomAICommand>();
        DEFAULT_AI_COMMANDS.forEach(cmd => commandsById.set(cmd.id, cmd));
        savedCustomAICommands.forEach((cmd: CustomAICommand) => {
          // For built-in commands, merge to allow user edits but preserve isBuiltIn flag
          if (commandsById.has(cmd.id)) {
            const existing = commandsById.get(cmd.id)!;
            commandsById.set(cmd.id, { ...cmd, isBuiltIn: existing.isBuiltIn });
          } else {
            commandsById.set(cmd.id, cmd);
          }
        });
        setCustomAICommandsState(Array.from(commandsById.values()));
      }

      // Load global stats
      if (savedGlobalStats !== undefined) {
        setGlobalStatsState({ ...DEFAULT_GLOBAL_STATS, ...savedGlobalStats });
      }

      // Mark settings as loaded
      setSettingsLoaded(true);
    };
    loadSettings();
  }, []);

  // Apply font size to HTML root element so rem-based Tailwind classes scale
  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSize}px`;
  }, [fontSize]);

  return {
    settingsLoaded,
    llmProvider,
    modelSlug,
    apiKey,
    setLlmProvider,
    setModelSlug,
    setApiKey,
    tunnelProvider,
    tunnelApiKey,
    setTunnelProvider,
    setTunnelApiKey,
    defaultAgent,
    setDefaultAgent,
    defaultShell,
    setDefaultShell,
    fontFamily,
    fontSize,
    customFonts,
    setFontFamily,
    setFontSize,
    setCustomFonts,
    activeThemeId,
    setActiveThemeId,
    enterToSendAI,
    setEnterToSendAI,
    enterToSendTerminal,
    setEnterToSendTerminal,
    leftSidebarWidth,
    rightPanelWidth,
    markdownRawMode,
    setLeftSidebarWidth,
    setRightPanelWidth,
    setMarkdownRawMode,
    terminalWidth,
    setTerminalWidth,
    logLevel,
    setLogLevel,
    maxLogBuffer,
    setMaxLogBuffer,
    maxOutputLines,
    setMaxOutputLines,
    osNotificationsEnabled,
    setOsNotificationsEnabled,
    audioFeedbackEnabled,
    setAudioFeedbackEnabled,
    audioFeedbackCommand,
    setAudioFeedbackCommand,
    toastDuration,
    setToastDuration,
    shortcuts,
    setShortcuts,
    customAICommands,
    setCustomAICommands,
    globalStats,
    setGlobalStats,
    updateGlobalStats,
  };
}

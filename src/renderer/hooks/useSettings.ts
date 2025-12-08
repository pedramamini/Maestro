import { useState, useEffect } from 'react';
import type { LLMProvider, ThemeId, Shortcut, CustomAICommand, GlobalStats, AutoRunStats } from '../types';
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

// Default auto-run stats
const DEFAULT_AUTO_RUN_STATS: AutoRunStats = {
  cumulativeTimeMs: 0,
  longestRunMs: 0,
  longestRunTimestamp: 0,
  totalRuns: 0,
  currentBadgeLevel: 0,
  lastBadgeUnlockLevel: 0,
  lastAcknowledgedBadgeLevel: 0,
  badgeHistory: [],
};

// Default AI commands that ship with Maestro
// Template variables available: {{SESSION_ID}}, {{SESSION_NAME}}, {{AGENT_SESSION_ID}}, {{PROJECT_NAME}}, {{DATE}}, {{TIME}}, etc.
const DEFAULT_AI_COMMANDS: CustomAICommand[] = [
  {
    id: 'commit',
    command: '/commit',
    description: 'Commit outstanding changes and push up',
    prompt: `Examine the current git diff and determine if we need to make any updates to the README.md or CLAUDE.md files.

Then create a sensible git commit message. IMPORTANT: The commit message MUST include the agent session ID "{{AGENT_SESSION_ID}}" somewhere in the commit body (not the subject line). This allows us to trace commits back to their original conversation for context and continuity.

Example commit format:
<subject line summarizing changes>

<detailed description>

Session: {{AGENT_SESSION_ID}}

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

  // Agent settings
  defaultAgent: string;
  setDefaultAgent: (value: string) => void;

  // Shell settings
  defaultShell: string;
  setDefaultShell: (value: string) => void;

  // GitHub CLI settings
  ghPath: string;
  setGhPath: (value: string) => void;

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
  defaultSaveToHistory: boolean;
  setDefaultSaveToHistory: (value: boolean) => void;
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

  // Log Viewer settings
  logViewerSelectedLevels: string[];
  setLogViewerSelectedLevels: (value: string[]) => void;

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

  // Auto-run Stats (persistent across restarts)
  autoRunStats: AutoRunStats;
  setAutoRunStats: (value: AutoRunStats) => void;
  recordAutoRunComplete: (elapsedTimeMs: number) => { newBadgeLevel: number | null; isNewRecord: boolean };
  acknowledgeBadge: (level: number) => void;
  getUnacknowledgedBadgeLevel: () => number | null;
}

export function useSettings(): UseSettingsReturn {
  // Loading state
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // LLM Config
  const [llmProvider, setLlmProviderState] = useState<LLMProvider>('openrouter');
  const [modelSlug, setModelSlugState] = useState('anthropic/claude-3.5-sonnet');
  const [apiKey, setApiKeyState] = useState('');

  // Agent Config
  const [defaultAgent, setDefaultAgentState] = useState('claude-code');

  // Shell Config
  const [defaultShell, setDefaultShellState] = useState('zsh');

  // GitHub CLI Config
  const [ghPath, setGhPathState] = useState('');

  // Font Config
  const [fontFamily, setFontFamilyState] = useState('Roboto Mono, Menlo, "Courier New", monospace');
  const [fontSize, setFontSizeState] = useState(14);
  const [customFonts, setCustomFontsState] = useState<string[]>([]);

  // UI Config
  const [activeThemeId, setActiveThemeIdState] = useState<ThemeId>('dracula');
  const [enterToSendAI, setEnterToSendAIState] = useState(false); // AI mode defaults to Command+Enter
  const [enterToSendTerminal, setEnterToSendTerminalState] = useState(true); // Terminal defaults to Enter
  const [defaultSaveToHistory, setDefaultSaveToHistoryState] = useState(false); // History toggle defaults to off
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

  // Log Viewer Config
  const [logViewerSelectedLevels, setLogViewerSelectedLevelsState] = useState<string[]>(['debug', 'info', 'warn', 'error', 'toast']);

  // Shortcuts
  const [shortcuts, setShortcutsState] = useState<Record<string, Shortcut>>(DEFAULT_SHORTCUTS);

  // Custom AI Commands
  const [customAICommands, setCustomAICommandsState] = useState<CustomAICommand[]>(DEFAULT_AI_COMMANDS);

  // Global Stats (persistent)
  const [globalStats, setGlobalStatsState] = useState<GlobalStats>(DEFAULT_GLOBAL_STATS);

  // Auto-run Stats (persistent)
  const [autoRunStats, setAutoRunStatsState] = useState<AutoRunStats>(DEFAULT_AUTO_RUN_STATS);

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

  const setDefaultAgent = (value: string) => {
    setDefaultAgentState(value);
    window.maestro.settings.set('defaultAgent', value);
  };

  const setDefaultShell = (value: string) => {
    setDefaultShellState(value);
    window.maestro.settings.set('defaultShell', value);
  };

  const setGhPath = (value: string) => {
    setGhPathState(value);
    window.maestro.settings.set('ghPath', value);
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

  const setDefaultSaveToHistory = (value: boolean) => {
    setDefaultSaveToHistoryState(value);
    window.maestro.settings.set('defaultSaveToHistory', value);
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

  const setLogViewerSelectedLevels = (value: string[]) => {
    setLogViewerSelectedLevelsState(value);
    window.maestro.settings.set('logViewerSelectedLevels', value);
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

  const setAutoRunStats = (value: AutoRunStats) => {
    setAutoRunStatsState(value);
    window.maestro.settings.set('autoRunStats', value);
  };

  // Import badge calculation from constants (moved inline to avoid circular dependency)
  const getBadgeLevelForTime = (cumulativeTimeMs: number): number => {
    // Time thresholds in milliseconds
    const MINUTE = 60 * 1000;
    const HOUR = 60 * MINUTE;
    const DAY = 24 * HOUR;
    const WEEK = 7 * DAY;
    const MONTH = 30 * DAY;

    const thresholds = [
      15 * MINUTE,     // Level 1: 15 minutes
      1 * HOUR,        // Level 2: 1 hour
      8 * HOUR,        // Level 3: 8 hours
      1 * DAY,         // Level 4: 1 day
      1 * WEEK,        // Level 5: 1 week
      1 * MONTH,       // Level 6: 1 month
      3 * MONTH,       // Level 7: 3 months
      6 * MONTH,       // Level 8: 6 months
      365 * DAY,       // Level 9: 1 year
      5 * 365 * DAY,   // Level 10: 5 years
      10 * 365 * DAY,  // Level 11: 10 years
    ];

    let level = 0;
    for (let i = 0; i < thresholds.length; i++) {
      if (cumulativeTimeMs >= thresholds[i]) {
        level = i + 1;
      } else {
        break;
      }
    }
    return level;
  };

  // Record an auto-run completion and check for new badges/records
  const recordAutoRunComplete = (elapsedTimeMs: number): { newBadgeLevel: number | null; isNewRecord: boolean } => {
    let newBadgeLevel: number | null = null;
    let isNewRecord = false;

    setAutoRunStatsState(prev => {
      const newCumulativeTime = prev.cumulativeTimeMs + elapsedTimeMs;
      const newBadgeLevelCalc = getBadgeLevelForTime(newCumulativeTime);

      // Check if this is a new badge level
      if (newBadgeLevelCalc > prev.lastBadgeUnlockLevel) {
        newBadgeLevel = newBadgeLevelCalc;
      }

      // Check if this is a new record
      isNewRecord = elapsedTimeMs > prev.longestRunMs;

      // Build updated badge history if new badge unlocked
      let updatedBadgeHistory = prev.badgeHistory || [];
      if (newBadgeLevel !== null) {
        updatedBadgeHistory = [
          ...updatedBadgeHistory,
          { level: newBadgeLevel, unlockedAt: Date.now() }
        ];
      }

      const updated: AutoRunStats = {
        cumulativeTimeMs: newCumulativeTime,
        longestRunMs: isNewRecord ? elapsedTimeMs : prev.longestRunMs,
        longestRunTimestamp: isNewRecord ? Date.now() : prev.longestRunTimestamp,
        totalRuns: prev.totalRuns + 1,
        currentBadgeLevel: newBadgeLevelCalc,
        lastBadgeUnlockLevel: newBadgeLevel !== null ? newBadgeLevelCalc : prev.lastBadgeUnlockLevel,
        lastAcknowledgedBadgeLevel: prev.lastAcknowledgedBadgeLevel ?? 0,
        badgeHistory: updatedBadgeHistory,
      };

      window.maestro.settings.set('autoRunStats', updated);
      return updated;
    });

    return { newBadgeLevel, isNewRecord };
  };

  // Acknowledge that user has seen the standing ovation for a badge level
  const acknowledgeBadge = (level: number) => {
    setAutoRunStatsState(prev => {
      const updated: AutoRunStats = {
        ...prev,
        lastAcknowledgedBadgeLevel: Math.max(level, prev.lastAcknowledgedBadgeLevel ?? 0),
      };
      window.maestro.settings.set('autoRunStats', updated);
      return updated;
    });
  };

  // Get the highest unacknowledged badge level (if any)
  const getUnacknowledgedBadgeLevel = (): number | null => {
    const acknowledged = autoRunStats.lastAcknowledgedBadgeLevel ?? 0;
    const current = autoRunStats.currentBadgeLevel;
    if (current > acknowledged) {
      return current;
    }
    return null;
  };

  // Load settings from electron-store on mount
  useEffect(() => {
    const loadSettings = async () => {
      const savedEnterToSendAI = await window.maestro.settings.get('enterToSendAI');
      const savedEnterToSendTerminal = await window.maestro.settings.get('enterToSendTerminal');
      const savedDefaultSaveToHistory = await window.maestro.settings.get('defaultSaveToHistory');

      const savedLlmProvider = await window.maestro.settings.get('llmProvider');
      const savedModelSlug = await window.maestro.settings.get('modelSlug');
      const savedApiKey = await window.maestro.settings.get('apiKey');
      const savedDefaultAgent = await window.maestro.settings.get('defaultAgent');
      const savedDefaultShell = await window.maestro.settings.get('defaultShell');
      const savedGhPath = await window.maestro.settings.get('ghPath');
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
      const savedLogViewerSelectedLevels = await window.maestro.settings.get('logViewerSelectedLevels');
      const savedCustomAICommands = await window.maestro.settings.get('customAICommands');
      const savedGlobalStats = await window.maestro.settings.get('globalStats');
      const savedAutoRunStats = await window.maestro.settings.get('autoRunStats');

      if (savedEnterToSendAI !== undefined) setEnterToSendAIState(savedEnterToSendAI);
      if (savedEnterToSendTerminal !== undefined) setEnterToSendTerminalState(savedEnterToSendTerminal);
      if (savedDefaultSaveToHistory !== undefined) setDefaultSaveToHistoryState(savedDefaultSaveToHistory);

      if (savedLlmProvider !== undefined) setLlmProviderState(savedLlmProvider);
      if (savedModelSlug !== undefined) setModelSlugState(savedModelSlug);
      if (savedApiKey !== undefined) setApiKeyState(savedApiKey);
      if (savedDefaultAgent !== undefined) setDefaultAgentState(savedDefaultAgent);
      if (savedDefaultShell !== undefined) setDefaultShellState(savedDefaultShell);
      if (savedGhPath !== undefined) setGhPathState(savedGhPath);
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
      if (savedLogViewerSelectedLevels !== undefined) setLogViewerSelectedLevelsState(savedLogViewerSelectedLevels);

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

      // Load auto-run stats
      if (savedAutoRunStats !== undefined) {
        setAutoRunStatsState({ ...DEFAULT_AUTO_RUN_STATS, ...savedAutoRunStats });
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
    defaultAgent,
    setDefaultAgent,
    defaultShell,
    setDefaultShell,
    ghPath,
    setGhPath,
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
    defaultSaveToHistory,
    setDefaultSaveToHistory,
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
    logViewerSelectedLevels,
    setLogViewerSelectedLevels,
    shortcuts,
    setShortcuts,
    customAICommands,
    setCustomAICommands,
    globalStats,
    setGlobalStats,
    updateGlobalStats,
    autoRunStats,
    setAutoRunStats,
    recordAutoRunComplete,
    acknowledgeBadge,
    getUnacknowledgedBadgeLevel,
  };
}

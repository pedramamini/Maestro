import type { Shortcut } from '../types';

export const DEFAULT_SHORTCUTS: Record<string, Shortcut> = {
  toggleSidebar: { id: 'toggleSidebar', label: 'Toggle Sidebar', keys: ['Meta', 'b'] },
  toggleRightPanel: { id: 'toggleRightPanel', label: 'Toggle Right Panel', keys: ['Meta', '\\'] },
  cyclePrev: { id: 'cyclePrev', label: 'Previous Agent', keys: ['Meta', 'Shift', '{'] },
  cycleNext: { id: 'cycleNext', label: 'Next Agent', keys: ['Meta', 'Shift', '}'] },
  newInstance: { id: 'newInstance', label: 'New Agent', keys: ['Meta', 'n'] },
  killInstance: { id: 'killInstance', label: 'Kill Agent', keys: ['Meta', 'Shift', 'Backspace'] },
  moveToGroup: { id: 'moveToGroup', label: 'Move Session to Group', keys: ['Meta', 'Shift', 'm'] },
  toggleMode: { id: 'toggleMode', label: 'Switch AI/Shell Mode', keys: ['Meta', 'j'] },
  quickAction: { id: 'quickAction', label: 'Quick Actions', keys: ['Meta', 'k'] },
  help: { id: 'help', label: 'Show Shortcuts', keys: ['Meta', '/'] },
  settings: { id: 'settings', label: 'Open Settings', keys: ['Meta', ','] },
  goToFiles: { id: 'goToFiles', label: 'Go to Files Tab', keys: ['Meta', 'Shift', 'f'] },
  goToHistory: { id: 'goToHistory', label: 'Go to History Tab', keys: ['Meta', 'Shift', 'h'] },
  goToScratchpad: { id: 'goToScratchpad', label: 'Go to Scratchpad Tab', keys: ['Meta', 'Shift', 's'] },
  copyFilePath: { id: 'copyFilePath', label: 'Copy File Path (in Preview)', keys: ['Meta', 'p'] },
  toggleMarkdownMode: { id: 'toggleMarkdownMode', label: 'Toggle Markdown Raw/Preview', keys: ['Meta', 'e'] },
  focusInput: { id: 'focusInput', label: 'Focus Input Field', keys: ['Meta', '.'] },
};

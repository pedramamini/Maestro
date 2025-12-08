import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock window.matchMedia for components that use media queries
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver using a proper class-like constructor
class MockResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock Element.prototype.scrollTo - needed for components that use scrollTo
Element.prototype.scrollTo = vi.fn();

// Mock Element.prototype.scrollIntoView - needed for components that scroll elements into view
Element.prototype.scrollIntoView = vi.fn();

// Mock window.maestro API (Electron IPC bridge)
const mockMaestro = {
  settings: {
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    getAll: vi.fn().mockResolvedValue({}),
  },
  sessions: {
    get: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockResolvedValue(undefined),
    setAll: vi.fn().mockResolvedValue(undefined),
  },
  groups: {
    get: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockResolvedValue(undefined),
  },
  process: {
    spawn: vi.fn().mockResolvedValue({ pid: 12345 }),
    write: vi.fn().mockResolvedValue(undefined),
    kill: vi.fn().mockResolvedValue(undefined),
    resize: vi.fn().mockResolvedValue(undefined),
    onOutput: vi.fn().mockReturnValue(() => {}),
    onExit: vi.fn().mockReturnValue(() => {}),
  },
  git: {
    status: vi.fn().mockResolvedValue({ files: [], branch: 'main', stdout: '' }),
    diff: vi.fn().mockResolvedValue(''),
    isRepo: vi.fn().mockResolvedValue(true),
    numstat: vi.fn().mockResolvedValue([]),
    getStatus: vi.fn().mockResolvedValue({ branch: 'main', status: [] }),
    worktreeSetup: vi.fn().mockResolvedValue({ success: true }),
    worktreeCheckout: vi.fn().mockResolvedValue({ success: true }),
    getDefaultBranch: vi.fn().mockResolvedValue({ success: true, branch: 'main' }),
    createPR: vi.fn().mockResolvedValue({ success: true, prUrl: 'https://github.com/test/pr/1' }),
    branches: vi.fn().mockResolvedValue({ branches: ['main', 'develop'] }),
    checkGhCli: vi.fn().mockResolvedValue({ installed: true, authenticated: true }),
    worktreeInfo: vi.fn().mockResolvedValue({ success: true, exists: false, isWorktree: false }),
    getRepoRoot: vi.fn().mockResolvedValue({ success: true, root: '/path/to/project' }),
    log: vi.fn().mockResolvedValue({ entries: [], error: undefined }),
    show: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
    getRemoteUrl: vi.fn().mockResolvedValue(null),
    info: vi.fn().mockResolvedValue({ branch: 'main', remote: '', behind: 0, ahead: 0, uncommittedChanges: 0 }),
  },
  fs: {
    readDir: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockResolvedValue(''),
    stat: vi.fn().mockResolvedValue({
      size: 1024,
      createdAt: '2024-01-01T00:00:00.000Z',
      modifiedAt: '2024-01-15T12:30:00.000Z',
    }),
    homeDir: vi.fn().mockResolvedValue('/home/testuser'),
  },
  agents: {
    detect: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    config: vi.fn().mockResolvedValue({}),
    getConfig: vi.fn().mockResolvedValue({}),
    setConfig: vi.fn().mockResolvedValue(undefined),
    getAllCustomPaths: vi.fn().mockResolvedValue({}),
    setCustomPath: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue({ agents: [], debugInfo: null }),
  },
  fonts: {
    detect: vi.fn().mockResolvedValue([]),
  },
  claude: {
    listSessions: vi.fn().mockResolvedValue([]),
    listSessionsPaginated: vi.fn().mockResolvedValue({
      sessions: [],
      hasMore: false,
      totalCount: 0,
      nextCursor: null,
    }),
    readSession: vi.fn().mockResolvedValue(null),
    readSessionMessages: vi.fn().mockResolvedValue({
      messages: [],
      total: 0,
      hasMore: false,
    }),
    searchSessions: vi.fn().mockResolvedValue([]),
    getGlobalStats: vi.fn().mockResolvedValue(null),
    getProjectStats: vi.fn().mockResolvedValue(undefined),
    onGlobalStatsUpdate: vi.fn().mockReturnValue(() => {}),
    onProjectStatsUpdate: vi.fn().mockReturnValue(() => {}),
    getAllNamedSessions: vi.fn().mockResolvedValue([]),
    getSessionOrigins: vi.fn().mockResolvedValue({}),
    updateSessionName: vi.fn().mockResolvedValue(undefined),
    updateSessionStarred: vi.fn().mockResolvedValue(undefined),
    registerSessionOrigin: vi.fn().mockResolvedValue(undefined),
  },
  autorun: {
    readDoc: vi.fn().mockResolvedValue({ success: true, content: '' }),
    writeDoc: vi.fn().mockResolvedValue({ success: true }),
    watchFolder: vi.fn().mockReturnValue(() => {}),
    unwatchFolder: vi.fn(),
    readFolder: vi.fn().mockResolvedValue({ success: true, files: [] }),
    listDocs: vi.fn().mockResolvedValue({ success: true, files: [] }),
  },
  playbooks: {
    list: vi.fn().mockResolvedValue({ success: true, playbooks: [] }),
    create: vi.fn().mockResolvedValue({ success: true, playbook: {} }),
    update: vi.fn().mockResolvedValue({ success: true, playbook: {} }),
    delete: vi.fn().mockResolvedValue({ success: true }),
    export: vi.fn().mockResolvedValue({ success: true }),
    import: vi.fn().mockResolvedValue({ success: true, playbook: {} }),
  },
  web: {
    broadcastAutoRunState: vi.fn(),
    broadcastSessionState: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockResolvedValue({ running: false }),
  },
  logger: {
    log: vi.fn(),
    error: vi.fn(),
    toast: vi.fn(),
    getLogLevel: vi.fn().mockResolvedValue('info'),
    setLogLevel: vi.fn().mockResolvedValue(undefined),
    getMaxLogBuffer: vi.fn().mockResolvedValue(5000),
    setMaxLogBuffer: vi.fn().mockResolvedValue(undefined),
  },
  notification: {
    speak: vi.fn().mockResolvedValue({ success: true, ttsId: 1 }),
    stopSpeak: vi.fn().mockResolvedValue({ success: true }),
    onTtsCompleted: vi.fn().mockReturnValue(() => {}),
    show: vi.fn().mockResolvedValue(undefined),
  },
  dialog: {
    selectFolder: vi.fn().mockResolvedValue(null),
  },
  shells: {
    detect: vi.fn().mockResolvedValue([]),
  },
  shell: {
    openExternal: vi.fn().mockResolvedValue(undefined),
  },
};

Object.defineProperty(window, 'maestro', {
  writable: true,
  value: mockMaestro,
});

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Maestro is a unified, highly-responsive Electron desktop application for managing multiple AI coding assistants (Claude Code, Aider, OpenCode, etc.) simultaneously. It provides a Linear/Superhuman-level responsive interface with keyboard-first navigation, dual-mode input (terminal vs AI), and remote web access capabilities.

## Development Commands

### Running the Application

```bash
# Development mode with hot reload
npm run dev

# Build and run production
npm run build
npm start
```

### Building

```bash
# Build both main and renderer processes
npm run build

# Build main process only (Electron backend)
npm run build:main

# Build renderer only (React frontend)
npm run build:renderer
```

### Packaging

```bash
# Package for all platforms
npm run package

# Platform-specific builds
npm run package:mac    # macOS (.dmg, .zip)
npm run package:win    # Windows (.exe, portable)
npm run package:linux  # Linux (.AppImage, .deb, .rpm)
```

### Utilities

```bash
# Clean build artifacts and cache
npm run clean
```

## Architecture

### Dual-Process Model

Maestro uses Electron's main/renderer architecture with strict context isolation:

**Main Process (`src/main/`)** - Node.js backend with full system access
- `index.ts` - Application entry point, IPC handler registration, window management
- `process-manager.ts` - Core primitive for spawning and managing CLI processes
- `web-server.ts` - Fastify-based HTTP/WebSocket server for remote access
- `agent-detector.ts` - Auto-detects available AI tools (Claude Code, Aider, etc.) via PATH
- `preload.ts` - Secure IPC bridge via contextBridge (no direct Node.js exposure to renderer)

**Renderer Process (`src/renderer/`)** - React frontend with no direct Node.js access
- `App.tsx` - Main UI coordinator (~1,650 lines, continuously being refactored)
- `main.tsx` - Renderer entry point
- `components/` - React components (modals, panels, UI elements)
  - `SessionList.tsx` - Left sidebar with sessions and groups
  - `MainPanel.tsx` - Center workspace (terminal, log viewer, input)
  - `RightPanel.tsx` - Right sidebar (files, history, scratchpad)
  - `LogViewer.tsx` - System logs viewer with filtering and search
  - `SettingsModal.tsx`, `NewInstanceModal.tsx`, `Scratchpad.tsx`, `FilePreview.tsx` - Other UI components
- `hooks/` - Custom React hooks for reusable state logic
  - `useSettings.ts` - Settings management and persistence
  - `useSessionManager.ts` - Session and group CRUD operations
  - `useFileExplorer.ts` - File tree state and operations
- `services/` - Business logic services (clean wrappers around IPC calls)
  - `git.ts` - Git operations (status, diff, isRepo)
  - `process.ts` - Process management (spawn, write, kill, resize)

### Process Management System

The `ProcessManager` class is the core architectural primitive that abstracts two process types:

1. **PTY Processes** (via `node-pty`) - For terminal sessions with full shell emulation
   - Used for `toolType: 'terminal'`
   - Supports resize, ANSI escape codes, interactive shell

2. **Child Processes** (via `child_process`) - For AI assistants
   - Used for all non-terminal tool types (claude-code, aider, etc.)
   - Direct stdin/stdout/stderr capture without shell interpretation
   - **Security**: Uses `spawn()` with `shell: false` to prevent command injection

All process operations go through IPC handlers in `src/main/index.ts`:
- `process:spawn` - Start a new process
- `process:write` - Send data to stdin
- `process:kill` - Terminate a process
- `process:resize` - Resize PTY terminal (terminal mode only)

Events are emitted back to renderer via:
- `process:data` - Stdout/stderr output
- `process:exit` - Process exit code

### Session Model

Each "session" is a unified abstraction with these attributes:
- `sessionId` - Unique identifier
- `toolType` - Agent type (claude-code, aider, terminal, custom)
- `cwd` - Working directory
- `state` - Current state (idle, busy, error)
- `stdinMode` - Input routing mode (terminal vs AI)

### IPC Security Model

All renderer-to-main communication goes through the preload script:
- **Context isolation**: Enabled (renderer has no direct Node.js access)
- **Node integration**: Disabled (no `require()` in renderer)
- **Preload script**: Exposes minimal API via `contextBridge.exposeInMainWorld('maestro', ...)`

The `window.maestro` API provides type-safe access to:
- Settings management
- Process control
- Git operations
- File system access
- Tunnel management
- Agent detection

### Git Integration

Git operations use the safe `execFileNoThrow` utility (located in `src/main/utils/execFile.ts`) to prevent shell injection vulnerabilities:
- `git:status` - Get porcelain status
- `git:diff` - Get diff for files
- `git:isRepo` - Check if directory is a Git repository

### Web Server Architecture

Fastify server (`src/main/web-server.ts`) provides:
- REST API endpoints (`/api/sessions`, `/health`)
- WebSocket endpoint (`/ws`) for real-time updates
- CORS enabled for mobile/remote access
- Binds to `0.0.0.0:8000` for LAN access

### Agent Detection

`AgentDetector` class auto-discovers CLI tools in PATH:
- Uses `which` (Unix) or `where` (Windows) via `execFileNoThrow`
- Caches results for performance
- Pre-configured agents: Claude Code, Aider, Qwen Coder, CLI Terminal
- Extensible via `AGENT_DEFINITIONS` array in `src/main/agent-detector.ts`

## Key Design Patterns

### Dual-Mode Input Router

Sessions toggle between two input modes:
1. **Terminal Mode** - Raw shell commands via PTY
2. **AI Interaction Mode** - Direct communication with AI assistant

This is implemented via the `isTerminal` flag in `ProcessManager`.

### Event-Driven Output Streaming

ProcessManager extends EventEmitter:
```typescript
processManager.on('data', (sessionId, data) => { ... })
processManager.on('exit', (sessionId, code) => { ... })
```

Events are forwarded to renderer via IPC:
```typescript
mainWindow?.webContents.send('process:data', sessionId, data)
```

### Secure Command Execution

**ALWAYS use `execFileNoThrow` utility** from `src/main/utils/execFile.ts` for running external commands. This prevents shell injection vulnerabilities by using `execFile` instead of `exec`:

```typescript
// Correct - safe from injection
import { execFileNoThrow } from './utils/execFile';
const result = await execFileNoThrow('git', ['status', '--porcelain'], cwd);

// The utility returns: { stdout: string, stderr: string, exitCode: number }
// It never throws - non-zero exit codes return exitCode !== 0
```

## Custom Hooks Architecture

The renderer now uses custom hooks to encapsulate reusable state logic and reduce the size of App.tsx.

### useSettings (`src/renderer/hooks/useSettings.ts`)

Manages all application settings with automatic persistence to electron-store.

**What it manages:**
- LLM settings (provider, model, API key)
- Tunnel settings (provider, API key)
- Agent settings (default agent)
- Font settings (family, size, custom fonts)
- UI settings (theme, enter-to-send, panel widths, markdown mode)
- Keyboard shortcuts

**Usage:**
```typescript
import { useSettings } from './hooks';

const settings = useSettings();
// Access: settings.llmProvider, settings.fontSize, etc.
// Update: settings.setTheme('dracula'), settings.setFontSize(16), etc.
```

All setter functions automatically persist to electron-store.

### useSessionManager (`src/renderer/hooks/useSessionManager.ts`)

Manages sessions and groups with CRUD operations, drag & drop, and persistence.

**What it manages:**
- Sessions array and groups array
- Active session selection
- Session CRUD (create, delete, rename, toggle modes)
- Group operations (create, toggle collapse, rename)
- Drag and drop state and handlers
- Automatic persistence to electron-store

**Usage:**
```typescript
import { useSessionManager } from './hooks';

const sessionManager = useSessionManager();
// Access: sessionManager.sessions, sessionManager.activeSession, etc.
// Operations: sessionManager.createNewSession(), sessionManager.deleteSession(), etc.
```

**Key methods:**
- `createNewSession(agentId, workingDir, name)` - Create new session
- `deleteSession(id, showConfirmation)` - Delete with confirmation
- `toggleInputMode()` - Switch between AI and terminal mode
- `updateScratchPad(content)` - Update session scratchpad
- `createNewGroup(name, emoji, moveSession, activeSessionId)` - Create group

### useFileExplorer (`src/renderer/hooks/useFileExplorer.ts`)

Manages file tree state, expansion, navigation, and file operations.

**What it manages:**
- File preview state
- File tree navigation and selection
- Folder expansion/collapse
- File tree filtering
- File loading and operations

**Usage:**
```typescript
import { useFileExplorer } from './hooks';

const fileExplorer = useFileExplorer(activeSession, setActiveFocus);
// Access: fileExplorer.previewFile, fileExplorer.filteredFileTree, etc.
// Operations: fileExplorer.handleFileClick(), fileExplorer.expandAllFolders(), etc.
```

**Key methods:**
- `handleFileClick(node, path, activeSession)` - Open file or external app
- `loadFileTree(dirPath, maxDepth?)` - Load directory tree
- `toggleFolder(path, activeSessionId, setSessions)` - Toggle folder expansion
- `expandAllFolders()` / `collapseAllFolders()` - Bulk operations
- `updateSessionWorkingDirectory()` - Change session CWD

## Services Architecture

Services provide clean wrappers around IPC calls, abstracting away the `window.maestro` API details.

### Git Service (`src/renderer/services/git.ts`)

Provides type-safe git operations.

**Usage:**
```typescript
import { gitService } from '../services/git';

// Check if directory is a git repo
const isRepo = await gitService.isRepo(cwd);

// Get git status
const status = await gitService.getStatus(cwd);
// Returns: { files: [{ path: string, status: string }] }

// Get git diff
const diff = await gitService.getDiff(cwd, ['file1.ts', 'file2.ts']);
// Returns: { diff: string }
```

All methods handle errors gracefully and return safe defaults.

### Process Service (`src/renderer/services/process.ts`)

Provides type-safe process management operations.

**Usage:**
```typescript
import { processService } from '../services/process';

// Spawn a process
await processService.spawn(sessionId, {
  cwd: '/path/to/dir',
  command: 'claude-code',
  args: [],
  isTerminal: false
});

// Write to process stdin
await processService.write(sessionId, 'user input\n');

// Kill process
await processService.kill(sessionId);

// Listen for process events
const unsubscribeData = processService.onData((sessionId, data) => {
  console.log('Process output:', data);
});

const unsubscribeExit = processService.onExit((sessionId, code) => {
  console.log('Process exited:', code);
});

// Clean up listeners
unsubscribeData();
unsubscribeExit();
```

## UI Architecture & Components

### Main Application Structure (App.tsx)

The main application is structured in three columns:
1. **Left Sidebar** - Session list, groups, new instance button
2. **Main Panel** - Terminal/AI output, input area, toolbar
3. **Right Panel** - Files, History, Scratchpad tabs

### Key Components

#### MainPanel (`src/renderer/components/MainPanel.tsx`)
- Center workspace container that handles three states:
  - LogViewer when system logs are open
  - Empty state when no session is active
  - Normal session view (top bar, terminal output, input area, file preview)
- Encapsulates all main panel UI logic outside of App.tsx

#### LogViewer (`src/renderer/components/LogViewer.tsx`)
- System logs viewer accessible via Cmd+K → "View System Logs"
- Color-coded log levels (Debug, Info, Warn, Error)
- Searchable with `/` key, filterable by log level
- Export logs to file, clear all logs
- Keyboard navigation (arrows to scroll, Cmd+arrows to jump)

#### SettingsModal (`src/renderer/components/SettingsModal.tsx`)
- Tabbed interface: General, LLM, Shortcuts, Themes, Network
- All settings changes should use wrapper functions for persistence
- Includes LLM test functionality to verify API connectivity
- Log level selector with color-coded buttons (defaults to "info")

#### Scratchpad (`src/renderer/components/Scratchpad.tsx`)
- Edit/Preview mode toggle (Command-E to switch)
- Markdown rendering with GFM support
- Smart list continuation (unordered, ordered, task lists)
- Container must be focusable (tabIndex) for keyboard shortcuts

#### FilePreview (`src/renderer/components/FilePreview.tsx`)
- Full-screen overlay for file viewing
- Syntax highlighting via react-syntax-highlighter
- Markdown rendering for .md files
- Arrow keys for scrolling, Escape to close
- Auto-focuses when opened for immediate keyboard control

### Keyboard Navigation Patterns

The app is keyboard-first with these patterns:

**Focus Management:**
- Escape in input → Focus output window
- Escape in output → Focus back to input
- Escape in file preview → Return to file tree
- Components need `tabIndex={-1}` and `outline-none` for programmatic focus

**Output Window:**
- `/` → Open search/filter
- Arrow Up/Down → Scroll output
- Cmd/Ctrl + Arrow Up/Down → Jump to top/bottom
- Escape → Close search (if open) or return to input

**File Tree:**
- Arrow keys → Navigate files/folders
- Enter → Open file preview
- Space → Toggle folder expansion
- Cmd+E → Expand all, Cmd+Shift+E → Collapse all

**Scratchpad:**
- Cmd+E → Toggle Edit/Preview mode

### Theme System

Themes defined in `THEMES` object in App.tsx with structure:
```typescript
{
  id: string;
  name: string;
  mode: 'light' | 'dark';
  colors: {
    bgMain: string;      // Main content background
    bgSidebar: string;   // Sidebar background
    bgActivity: string;  // Accent background
    border: string;      // Border colors
    textMain: string;    // Primary text
    textDim: string;     // Secondary text
    accent: string;      // Accent color
    accentDim: string;   // Dimmed accent
    success: string;     // Success state
    warning: string;     // Warning state
    error: string;       // Error state
  }
}
```

Use `style={{ color: theme.colors.textMain }}` instead of fixed colors.

### Styling Conventions

- **Tailwind CSS** for layout and spacing
- **Inline styles** for theme colors (dynamic based on selected theme)
- **Standard spacing**: `gap-2`, `p-4`, `mb-3` for consistency
- **Focus states**: Always add `outline-none` when using `tabIndex`
- **Sticky elements**: Use `sticky top-0 z-10` with solid background
- **Overlays**: Use `fixed inset-0` with backdrop blur and high z-index

### State Management Per Session

Each session stores:
- `cwd` - Current working directory
- `fileTree` - File tree structure
- `fileExplorerExpanded` - Expanded folder paths
- `fileExplorerScrollPos` - Scroll position in file tree
- `aiLogs` / `shellLogs` - Output history
- `inputMode` - 'ai' or 'terminal'
- `state` - 'idle' | 'busy' | 'waiting_input'

Sessions persist scroll positions, expanded states, and UI state per-session.

## Code Conventions

### TypeScript

- All code is TypeScript with strict mode enabled
- Interface definitions for all data structures
- Type exports via `preload.ts` for renderer types

### Component Extraction Pattern

**Principle**: Keep App.tsx minimal by extracting UI sections into dedicated components.

When adding new features that would add significant complexity to App.tsx:

1. **Create a new component** in `src/renderer/components/` that encapsulates the entire UI section
2. **Pass only necessary props** - state, setters, refs, and callback functions
3. **Handle all conditional logic** within the component (e.g., empty states, different views)
4. **Keep App.tsx as a coordinator** - it should orchestrate state and wire components together, not contain UI logic

**Example - MainPanel component:**
```typescript
// App.tsx - Minimal integration
<MainPanel
  logViewerOpen={logViewerOpen}
  activeSession={activeSession}
  theme={theme}
  // ... other props
  setLogViewerOpen={setLogViewerOpen}
  toggleInputMode={toggleInputMode}
  // ... other handlers
/>

// MainPanel.tsx - Contains all UI logic
export function MainPanel(props: MainPanelProps) {
  // Handles: log viewer, empty state, normal session view
  if (logViewerOpen) return <LogViewer ... />;
  if (!activeSession) return <EmptyState ... />;
  return <SessionView ... />;
}
```

**Benefits:**
- App.tsx stays manageable and readable
- Components are self-contained and testable
- Changes to UI sections don't bloat App.tsx
- Easier code review and maintenance

### Commit Message Format

Use conventional commits:
- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `refactor:` - Code refactoring
- `test:` - Test additions/changes
- `chore:` - Build process or tooling changes

### Security Requirements

1. **Use `execFileNoThrow` for all external commands** - Located in `src/main/utils/execFile.ts`
2. **Context isolation** - Keep enabled in BrowserWindow
3. **Input sanitization** - Validate all user inputs
4. **Minimal preload exposure** - Only expose necessary APIs via contextBridge
5. **Process spawning** - Use `spawn()` with `shell: false` flag

### Error Handling Patterns

Maestro uses different error handling strategies depending on the architectural layer:

#### IPC Handler Errors (Main Process)

IPC handlers in `src/main/index.ts` should handle errors gracefully but may throw for critical failures:

**Pattern 1: Throw for critical failures**
```typescript
ipcMain.handle('process:spawn', async (_, config) => {
  if (!processManager) throw new Error('Process manager not initialized');
  return processManager.spawn(config);
});
```
- Use for: Initialization failures, missing required services
- Effect: Renderer will receive rejected promise

**Pattern 2: Try-catch with boolean return**
```typescript
ipcMain.handle('git:isRepo', async (_, cwd: string) => {
  try {
    const result = await execFileNoThrow('git', ['rev-parse', '--is-inside-work-tree'], cwd);
    return result.exitCode === 0;
  } catch {
    return false;
  }
});
```
- Use for: Optional operations where false is a valid answer
- Effect: Graceful degradation (e.g., git features disabled)

**Pattern 3: Return error in result object**
```typescript
ipcMain.handle('git:status', async (_, cwd: string) => {
  const result = await execFileNoThrow('git', ['status', '--porcelain'], cwd);
  return { stdout: result.stdout, stderr: result.stderr };
});
```
- Use for: Operations where both success and error info are valuable
- Effect: Caller can inspect both stdout and stderr

#### Service Layer Errors (Renderer)

Services in `src/renderer/services/` wrap IPC calls and should never throw:

```typescript
export const gitService = {
  async isRepo(cwd: string): Promise<boolean> {
    try {
      const result = await window.maestro.git.isRepo(cwd);
      return result;
    } catch (error) {
      console.error('Git isRepo error:', error);
      return false;
    }
  },

  async getStatus(cwd: string): Promise<GitStatus> {
    try {
      const result = await window.maestro.git.status(cwd);
      return result;
    } catch (error) {
      console.error('Git status error:', error);
      return { files: [] }; // Safe default
    }
  }
};
```

**Pattern**: Try-catch with safe default return
- Always catch errors from IPC calls
- Log error to console (or use logger utility)
- Return safe default value (empty array, empty string, false, etc.)
- Never throw - let the UI continue functioning

#### ProcessManager Errors (Main Process)

`ProcessManager` extends `EventEmitter` and uses events for runtime errors:

```typescript
// Spawn errors - throw immediately
spawn(config: ProcessConfig): { pid: number; success: boolean } {
  try {
    // ... spawn logic
    return { pid: ptyProcess.pid, success: true };
  } catch (error) {
    console.error('Failed to spawn process:', error);
    throw error; // Propagate to IPC handler
  }
}

// Runtime errors - emit events
ptyProcess.onExit(({ exitCode }) => {
  this.emit('exit', sessionId, exitCode);
  this.processes.delete(sessionId);
});
```

**Pattern**: Throw on spawn failure, emit events for runtime errors
- Spawn failures: Throw error (critical, can't continue)
- Process exit: Emit 'exit' event with exit code
- Process output: Emit 'data' event
- Let renderer handle process lifecycle errors

#### React Component Errors (Renderer)

React components use Error Boundaries to catch rendering errors:

```typescript
// Wrap major UI sections in ErrorBoundary
<ErrorBoundary>
  <SessionList {...props} />
</ErrorBoundary>
```

**Pattern**: Use Error Boundaries for component isolation
- Error boundaries defined in `src/renderer/components/ErrorBoundary.tsx`
- Wrap major UI sections (sidebar, main panel, right panel)
- Display fallback UI with error details and recovery options
- Prevents one component crash from taking down the entire app

**Component-level error handling**:
```typescript
const handleFileLoad = async (path: string) => {
  try {
    const content = await window.maestro.fs.readFile(path);
    setFileContent(content);
  } catch (error) {
    console.error('Failed to load file:', error);
    setError('Failed to load file'); // Show user-friendly message
  }
};
```
- Use try-catch for async operations
- Display user-friendly error messages in UI
- Don't crash the component - maintain partial functionality

#### Custom Hook Errors (Renderer)

Custom hooks should handle errors internally and expose error state:

```typescript
const useFileExplorer = (activeSession, setActiveFocus) => {
  const [error, setError] = useState<string | null>(null);

  const loadFileTree = async (dirPath: string) => {
    try {
      setError(null);
      const tree = await buildFileTree(dirPath);
      setFileTree(tree);
    } catch (err) {
      console.error('Failed to load file tree:', err);
      setError('Failed to load directory');
      setFileTree([]); // Safe default
    }
  };

  return { loadFileTree, error, /* ... */ };
};
```

**Pattern**: Internal try-catch with error state
- Expose error state so components can display messages
- Reset error state before retry
- Return safe defaults to keep UI functional

#### Utility Function Errors

Utility functions should document their error behavior clearly:

**Option 1: Return default value (no throw)**
```typescript
// src/main/utils/execFile.ts
export async function execFileNoThrow(
  command: string,
  args: string[],
  cwd?: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  // Never throws - returns exitCode !== 0 for failures
  try {
    // ... execution logic
  } catch (error) {
    return { stdout: '', stderr: String(error), exitCode: 1 };
  }
}
```

**Option 2: Throw errors (document clearly)**
```typescript
/**
 * Load file tree recursively
 * @throws {Error} If directory cannot be read
 */
export async function buildFileTree(dirPath: string): Promise<FileTreeNode[]> {
  // Throws on filesystem errors - caller must handle
  const entries = await fs.readdir(dirPath);
  // ...
}
```

#### Summary of Patterns

| Layer | Pattern | Example |
|-------|---------|---------|
| **IPC Handlers** | Throw critical failures, try-catch optional ops | `git:isRepo` returns false on error |
| **Services** | Never throw, return safe defaults | `gitService.getStatus()` returns `{ files: [] }` |
| **ProcessManager** | Throw spawn failures, emit runtime events | `emit('exit', sessionId, code)` |
| **React Components** | Try-catch async ops, show UI errors | Display "Failed to load" message |
| **Error Boundaries** | Catch render errors, show fallback UI | Wrap major sections |
| **Custom Hooks** | Internal try-catch, expose error state | Return `{ error, ... }` |
| **Utilities** | Document throw behavior clearly | JSDoc with `@throws` |

## Technology Stack

### Backend (Main Process)
- Electron 28+
- TypeScript
- node-pty - Terminal emulation
- Fastify - Web server
- electron-store - Settings persistence
- ws - WebSocket support

### Frontend (Renderer)
- React 18
- TypeScript
- Tailwind CSS
- Vite
- Lucide React - Icons
- react-syntax-highlighter - Code display
- marked - Markdown rendering
- dompurify - XSS prevention

## Settings Storage

Settings persisted via `electron-store`:
- **macOS**: `~/Library/Application Support/maestro/`
- **Windows**: `%APPDATA%/maestro/`
- **Linux**: `~/.config/maestro/`

Files:
- `maestro-settings.json` - User preferences
- `maestro-sessions.json` - Session persistence (planned)
- `maestro-groups.json` - Session groups (planned)

### Adding New Persistent Settings

To add a new setting that persists across sessions:

1. **Define state variable** in App.tsx:
```typescript
const [mySetting, setMySettingState] = useState<MyType>(defaultValue);
```

2. **Create wrapper function** that persists:
```typescript
const setMySetting = (value: MyType) => {
  setMySettingState(value);
  window.maestro.settings.set('mySetting', value);
};
```

3. **Load in useEffect**:
```typescript
// Inside the loadSettings useEffect
const savedMySetting = await window.maestro.settings.get('mySetting');
if (savedMySetting !== undefined) setMySettingState(savedMySetting);
```

4. **Pass wrapper to child components**, not the direct setState

**Current Persistent Settings:**
- `llmProvider`, `modelSlug`, `apiKey` - LLM configuration
- `tunnelProvider`, `tunnelApiKey` - Tunnel configuration
- `defaultAgent` - Default AI agent selection
- `fontFamily`, `fontSize`, `customFonts` - UI font settings
- `enterToSend` - Input behavior (Enter vs Command-Enter to send)
- `activeThemeId` - Selected theme

## Development Phases

The project follows a phased development approach (see PRD.md):

**Completed Phases:**
- Phase 1: Core Primitives (ProcessManager, Session Model, Dual-Mode Input)
- Phase 2: UI Foundations (Obsidian-inspired design, keyboard navigation)

**In Progress:**
- Phase 3: Intelligence Layer (auto-generated descriptions, semantic worklogs)

**Planned:**
- Phase 4: Workspace Intelligence (dual Git/non-Git modes)
- Phase 5: Status & Control Layer
- Phase 6: Remote Access & Tunneling (ngrok integration)
- Phase 7: Performance & Polish
- Phase 8: Multi-Device Continuity

## Common Development Tasks

### Adding a New UI Feature

1. **Plan the state** - Determine if it's per-session or global
2. **Add state management** - In App.tsx or component
3. **Create persistence** - Use wrapper function pattern if global
4. **Implement UI** - Follow Tailwind + theme color pattern
5. **Add keyboard shortcuts** - Integrate with existing keyboard handler
6. **Test focus flow** - Ensure Escape key navigation works

### Adding a New Modal

1. Create component in `src/renderer/components/`
2. Add state in App.tsx: `const [myModalOpen, setMyModalOpen] = useState(false)`
3. Add Escape handler in keyboard shortcuts
4. Use `fixed inset-0` overlay with `z-[50]` or higher
5. Include close button and backdrop click handler
6. Use `ref={(el) => el?.focus()}` for immediate keyboard control

### Adding Keyboard Shortcuts

1. Find the main keyboard handler in App.tsx (around line 650)
2. Add your shortcut in the appropriate section:
   - Component-specific: Inside component's onKeyDown
   - Global: In main useEffect keyboard handler
   - Modify pressed: Check for `e.metaKey || e.ctrlKey`
3. Remember to `e.preventDefault()` to avoid browser defaults

### Working with File Tree

File tree structure is stored per-session as `fileTree` array of nodes:
```typescript
{
  name: string;
  type: 'file' | 'folder';
  path: string;
  children?: FileTreeNode[];
}
```

Expanded folders tracked in session's `fileExplorerExpanded: string[]` as full paths.

### Modifying Themes

1. Find `THEMES` constant in App.tsx
2. Add new theme or modify existing one
3. All color keys must be present (11 required colors)
4. Test in both light and dark mode contexts
5. Theme ID is stored in settings and persists across sessions

### Adding to Settings Modal

1. Add tab if needed in SettingsModal.tsx
2. Create state in App.tsx with wrapper function
3. Add to loadSettings useEffect
4. Pass wrapper function (not setState) to SettingsModal props
5. Add UI in appropriate tab section

## Important File Locations

### Main Process Entry Points
- `src/main/index.ts:81-109` - IPC handler setup
- `src/main/index.ts:272-282` - Process event listeners
- `src/main/process-manager.ts:30-116` - Process spawning logic

### Security-Critical Code
- `src/main/preload.ts:5` - Context bridge API exposure
- `src/main/process-manager.ts:75` - Shell disabled for spawn
- `src/main/utils/execFile.ts` - Safe command execution wrapper

### Configuration
- `package.json:26-86` - electron-builder config
- `tsconfig.json` - Renderer TypeScript config
- `tsconfig.main.json` - Main process TypeScript config
- `vite.config.mts` - Vite bundler config

## Debugging & Common Issues

### Focus Not Working

If keyboard shortcuts aren't working:
1. Check element has `tabIndex={0}` or `tabIndex={-1}`
2. Add `outline-none` class to hide focus ring
3. Use `ref={(el) => el?.focus()}` or `useEffect` to auto-focus
4. Check for `e.stopPropagation()` blocking events

### Settings Not Persisting

If settings don't save across sessions:
1. Ensure you created a wrapper function with `window.maestro.settings.set()`
2. Check the wrapper is passed to child components, not the direct setState
3. Verify loading code exists in the `loadSettings` useEffect
4. Use direct state setter (e.g., `setMySettingState`) in the loading code

### Modal Escape Key Not Working

If Escape doesn't close a modal:
1. Modal overlay needs `tabIndex={0}`
2. Use `ref={(el) => el?.focus()}` to focus on mount
3. Add `e.stopPropagation()` in onKeyDown handler
4. Check z-index is higher than other modals

### Theme Colors Not Applying

If colors appear hardcoded:
1. Replace fixed colors with `style={{ color: theme.colors.textMain }}`
2. Never use hardcoded hex colors for text/borders
3. Use inline styles for theme colors, Tailwind for layout
4. Check theme prop is being passed down correctly

### Scroll Position Not Saving

Per-session scroll position:
1. Container needs a ref: `useRef<HTMLDivElement>(null)`
2. Add `onScroll` handler that updates session state
3. Add useEffect to restore scroll on session change
4. Use `ref.current.scrollTop` to get/set position

## Running Tests

Currently no test suite implemented. When adding tests, use the `test` script in package.json.

## Recent Features Added

- **System Log Viewer** - Cmd+K → "View System Logs" for internal logging with color-coded levels, search, and export
- **Structured Logging** - Configurable log levels (Debug, Info, Warn, Error) with persistence and UI controls
- **Component Extraction** - MainPanel component to keep App.tsx minimal and maintainable
- **Output Search/Filter** - Press `/` in output window to filter logs
- **Scratchpad Command-E** - Toggle between Edit and Preview modes
- **File Preview Focus** - Arrow keys scroll, Escape returns to file tree
- **Sticky File Tree Header** - Working directory stays visible when scrolling
- **LLM Connection Test** - Test API connectivity in Settings before saving
- **Settings Persistence** - All settings now save across sessions
- **Emoji Picker Improvements** - Proper positioning and Escape key support

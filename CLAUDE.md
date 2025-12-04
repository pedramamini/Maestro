# CLAUDE.md

Essential guidance for working with this codebase. For detailed architecture, see [ARCHITECTURE.md](ARCHITECTURE.md). For development setup and processes, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Standardized Vernacular

Use these terms consistently in code, comments, and documentation:

### UI Components
- **Left Bar** - Left sidebar with session list and groups (`SessionList.tsx`)
- **Right Bar** - Right sidebar with Files, History, Auto Run tabs (`RightPanel.tsx`)
- **Main Window** - Center workspace (`MainPanel.tsx`)
  - **AI Terminal** - Main window in AI mode (interacting with AI agents)
  - **Command Terminal** - Main window in terminal/shell mode
  - **System Log Viewer** - Special view for system logs (`LogViewer.tsx`)

### Session States (color-coded)
- **Green** - Ready/idle
- **Yellow** - Agent thinking/busy
- **Red** - No connection/error
- **Pulsing Orange** - Connecting

## Project Overview

Maestro is an Electron desktop app for managing multiple AI coding assistants (Claude Code, OpenAI Codex, Gemini CLI, Qwen3 Coder) simultaneously with a keyboard-first interface.

## Quick Commands

```bash
npm run dev        # Development with hot reload
npm run build      # Full production build
npm run clean      # Clean build artifacts
npm run package    # Package for all platforms
```

## Architecture at a Glance

```
src/
├── main/                    # Electron main process (Node.js)
│   ├── index.ts            # Entry point, IPC handlers
│   ├── process-manager.ts  # Process spawning (PTY + child_process)
│   ├── preload.ts          # Secure IPC bridge
│   └── utils/execFile.ts   # Safe command execution
│
└── renderer/               # React frontend
    ├── App.tsx            # Main coordinator
    ├── components/        # UI components
    ├── hooks/             # Custom React hooks
    ├── services/          # IPC wrappers (git.ts, process.ts)
    ├── constants/         # Themes, shortcuts, priorities
    └── contexts/          # Layer stack context
```

### Key Files for Common Tasks

| Task | Primary Files |
|------|---------------|
| Add IPC handler | `src/main/index.ts`, `src/main/preload.ts` |
| Add UI component | `src/renderer/components/` |
| Add keyboard shortcut | `src/renderer/constants/shortcuts.ts`, `App.tsx` |
| Add theme | `src/renderer/constants/themes.ts` |
| Add slash command | `src/renderer/slashCommands.ts` |
| Add modal | Component + `src/renderer/constants/modalPriorities.ts` |
| Add setting | `src/renderer/hooks/useSettings.ts`, `src/main/index.ts` |
| Add template variable | `src/renderer/utils/templateVariables.ts` |

## Core Patterns

### 1. Process Management

Each session runs **two processes** simultaneously:
- AI agent process (Claude Code, etc.) - spawned with `-ai` suffix
- Terminal process (PTY shell) - spawned with `-terminal` suffix

```typescript
// Session stores both PIDs
session.aiPid       // AI agent process
session.terminalPid // Terminal process
```

### 2. Security Requirements

**Always use `execFileNoThrow`** for external commands:
```typescript
import { execFileNoThrow } from './utils/execFile';
const result = await execFileNoThrow('git', ['status'], cwd);
// Returns: { stdout, stderr, exitCode } - never throws
```

**Never use shell-based command execution** - it creates injection vulnerabilities. The `execFileNoThrow` utility is the safe alternative.

### 3. Settings Persistence

Add new settings in `useSettings.ts`:
```typescript
// 1. Add state
const [mySetting, setMySettingState] = useState(defaultValue);

// 2. Add wrapper that persists
const setMySetting = (value) => {
  setMySettingState(value);
  window.maestro.settings.set('mySetting', value);
};

// 3. Load in useEffect
const saved = await window.maestro.settings.get('mySetting');
if (saved !== undefined) setMySettingState(saved);
```

### 4. Adding Modals

1. Create component in `src/renderer/components/`
2. Add priority in `src/renderer/constants/modalPriorities.ts`
3. Register with layer stack:

```typescript
import { useLayerStack } from '../contexts/LayerStackContext';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';

const { registerLayer, unregisterLayer } = useLayerStack();
const onCloseRef = useRef(onClose);
onCloseRef.current = onClose;

useEffect(() => {
  if (isOpen) {
    const id = registerLayer({
      type: 'modal',
      priority: MODAL_PRIORITIES.YOUR_MODAL,
      onEscape: () => onCloseRef.current(),
    });
    return () => unregisterLayer(id);
  }
}, [isOpen, registerLayer, unregisterLayer]);
```

### 5. Theme Colors

Themes have 13 required colors. Use inline styles for theme colors:
```typescript
style={{ color: theme.colors.textMain }}  // Correct
className="text-gray-500"                  // Wrong for themed text
```

## Code Conventions

### TypeScript
- Strict mode enabled
- Interface definitions for all data structures
- Types exported via `preload.ts` for renderer

### React Components
- Functional components with hooks
- Tailwind for layout, inline styles for theme colors
- `tabIndex={-1}` + `outline-none` for programmatic focus

### Commit Messages
```
feat: new feature
fix: bug fix
docs: documentation
refactor: code refactoring
```

## Session Interface

Key fields on the Session object:
```typescript
interface Session {
  id: string;
  name: string;
  toolType: ToolType;           // 'claude-code' | 'aider' | 'terminal' | etc.
  state: SessionState;          // 'idle' | 'busy' | 'error' | 'connecting'
  inputMode: 'ai' | 'terminal'; // Which process receives input
  cwd: string;                  // Current working directory (can change via cd)
  projectRoot: string;          // Initial working directory (never changes, used for Claude session storage)
  aiPid: number;                // AI process ID
  terminalPid: number;          // Terminal process ID
  aiLogs: LogEntry[];           // AI output history
  shellLogs: LogEntry[];        // Terminal output history
  usageStats?: UsageStats;      // Token usage and cost
  claudeSessionId?: string;     // For conversation continuity
  isGitRepo: boolean;           // Git features enabled
  fileTree: any[];              // File explorer tree
  fileExplorerExpanded: string[]; // Expanded folder paths
  messageQueue: LogEntry[];     // Messages queued while AI is busy
}
```

## IPC API Surface

The `window.maestro` API exposes:
- `settings` - Get/set app settings
- `sessions` / `groups` - Persistence
- `process` - Spawn, write, kill, resize
- `git` - Status, diff, isRepo, numstat
- `fs` - readDir, readFile
- `agents` - Detect, get, config
- `claude` - List/read/search Claude Code sessions, global stats
- `logger` - System logging
- `dialog` - Folder selection
- `shells` - Detect available shells

## Available Agents

| ID | Name | Notes |
|----|------|-------|
| `claude-code` | Claude Code | Batch mode with `--print` |
| `openai-codex` | OpenAI Codex | Coming soon |
| `gemini-cli` | Gemini CLI | Coming soon |
| `qwen3-coder` | Qwen3 Coder | Coming soon |

## Debugging

### Focus Not Working
1. Add `tabIndex={0}` or `tabIndex={-1}`
2. Add `outline-none` class
3. Use `ref={(el) => el?.focus()}` for auto-focus

### Settings Not Persisting
1. Check wrapper function calls `window.maestro.settings.set()`
2. Check loading code in `useSettings.ts` useEffect

### Modal Escape Not Working
1. Register with layer stack (don't handle Escape locally)
2. Check priority is set correctly

## Keyboard Shortcuts

Key shortcuts for navigation and common actions. Full list available via `⌘+/` (Help).

### Panel Navigation
| Shortcut | Action |
|----------|--------|
| `⌥⌘←` | Toggle Left Panel |
| `⌥⌘→` | Toggle Right Panel |
| `⌘⇧F` | Go to Files Tab |
| `⌘⇧H` | Go to History Tab |
| `⌘⇧1` | Go to Auto Run Tab |

### Session Management
| Shortcut | Action |
|----------|--------|
| `⌘N` | New Agent |
| `⌘[` / `⌘]` | Previous/Next Agent |
| `⌥⌘1-0` | Jump to Session 1-10 |
| `⌘⇧⌫` | Remove Agent |
| `⌘⇧M` | Move Session to Group |

### Tab Management (AI Mode)
| Shortcut | Action |
|----------|--------|
| `⌘T` | New Tab |
| `⌘W` | Close Tab |
| `⌘⇧T` | Reopen Closed Tab |
| `⌘1-9` | Go to Tab 1-9 |
| `⌘0` | Go to Last Tab |
| `⌥⌘T` | Tab Switcher |

### Mode & Focus
| Shortcut | Action |
|----------|--------|
| `⌘J` | Switch AI/Shell Mode |
| `⌘.` | Focus Input Field |
| `⌘⇧A` | Focus Left Panel |
| `⌘R` | Toggle Read-Only Mode |
| `⌘E` | Toggle Markdown Raw/Preview |

### Git & System
| Shortcut | Action |
|----------|--------|
| `⌘⇧D` | View Git Diff |
| `⌘⇧G` | View Git Log |
| `⌥⌘L` | System Log Viewer |
| `⌥⌘P` | System Process Monitor |

### Quick Access
| Shortcut | Action |
|----------|--------|
| `⌘K` | Quick Actions |
| `⌘,` | Open Settings |
| `⌘/` | Show All Shortcuts |

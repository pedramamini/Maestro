# Contributing to Maestro

Thank you for your interest in contributing to Maestro! This document provides guidelines, setup instructions, and practical guidance for developers.

For architecture details, see [ARCHITECTURE.md](ARCHITECTURE.md). For quick reference while coding, see [CLAUDE.md](CLAUDE.md).

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Scripts](#development-scripts)
- [Common Development Tasks](#common-development-tasks)
- [Code Style](#code-style)
- [Debugging Guide](#debugging-guide)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Building for Release](#building-for-release)

## Development Setup

### Prerequisites

- Node.js 20+
- npm or yarn
- Git

### Getting Started

```bash
# Fork and clone the repository
git clone <your-fork-url>
cd maestro

# Install dependencies
npm install

# Run in development mode with hot reload
npm run dev
```

## Project Structure

```
maestro/
├── src/
│   ├── main/              # Electron main process (Node.js backend)
│   │   ├── index.ts       # Entry point, IPC handlers
│   │   ├── process-manager.ts
│   │   ├── preload.ts     # Secure IPC bridge
│   │   └── utils/         # Shared utilities
│   ├── renderer/          # React frontend (Desktop UI)
│   │   ├── App.tsx        # Main coordinator
│   │   ├── components/    # React components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── services/      # IPC wrappers (git, process)
│   │   ├── contexts/      # React contexts
│   │   ├── constants/     # Themes, shortcuts, priorities
│   │   ├── types/         # TypeScript definitions
│   │   └── utils/         # Frontend utilities
│   ├── cli/               # CLI tool (maestro-cli)
│   │   ├── index.ts       # CLI entry point
│   │   ├── commands/      # Command implementations
│   │   ├── services/      # CLI services (storage, batch processor)
│   │   └── output/        # Output formatters (human, JSONL)
│   ├── shared/            # Shared code across processes
│   │   ├── theme-types.ts # Theme type definitions
│   │   └── templateVariables.ts # Template variable system
│   └── web/               # Web interface (Remote Control)
│       └── ...            # Mobile-optimized React app
├── build/                 # Application icons
├── .github/workflows/     # CI/CD automation
└── dist/                  # Build output (generated)
```

## Development Scripts

```bash
npm run dev            # Start dev server with hot reload
npm run dev:web        # Start web interface dev server
npm run build          # Full production build (main + renderer + web + CLI)
npm run build:main     # Build main process only
npm run build:renderer # Build renderer only
npm run build:web      # Build web interface only
npm run build:cli      # Build CLI tool only
npm start              # Start built application
npm run clean          # Clean build artifacts
npm run package        # Package for all platforms
npm run package:mac    # Package for macOS
npm run package:win    # Package for Windows
npm run package:linux  # Package for Linux
```

## Common Development Tasks

### Adding a New UI Feature

1. **Plan the state** - Determine if it's per-session or global
2. **Add state management** - In `useSettings.ts` (global) or session state
3. **Create persistence** - Use wrapper function pattern for global settings
4. **Implement UI** - Follow Tailwind + theme color pattern
5. **Add keyboard shortcuts** - In `shortcuts.ts` and `App.tsx`
6. **Test focus flow** - Ensure Escape key navigation works

### Adding a New Modal

1. Create component in `src/renderer/components/`
2. Add priority in `src/renderer/constants/modalPriorities.ts`:
   ```typescript
   MY_MODAL: 600,
   ```
3. Register with layer stack (see [ARCHITECTURE.md](ARCHITECTURE.md#layer-stack-system))
4. Use proper ARIA attributes:
   ```typescript
   <div role="dialog" aria-modal="true" aria-label="My Modal">
   ```

### Adding Keyboard Shortcuts

1. Add definition in `src/renderer/constants/shortcuts.ts`:
   ```typescript
   myShortcut: { id: 'myShortcut', label: 'My Action', keys: ['Meta', 'k'] },
   ```

2. Add handler in `App.tsx` keyboard event listener:
   ```typescript
   else if (isShortcut(e, 'myShortcut')) {
     e.preventDefault();
     // Handler code
   }
   ```

**Supported modifiers:** `Meta` (Cmd/Win), `Ctrl`, `Alt`, `Shift`
**Arrow keys:** `ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`

### Adding a New Setting

1. Add state in `useSettings.ts`:
   ```typescript
   const [mySetting, setMySettingState] = useState(defaultValue);
   ```

2. Create wrapper function:
   ```typescript
   const setMySetting = (value) => {
     setMySettingState(value);
     window.maestro.settings.set('mySetting', value);
   };
   ```

3. Load in useEffect:
   ```typescript
   const saved = await window.maestro.settings.get('mySetting');
   if (saved !== undefined) setMySettingState(saved);
   ```

4. Add to return object and export.

### Adding a Slash Command

Slash commands are now **Custom AI Commands** defined in Settings, not in code. They are prompt macros that get substituted and sent to the AI agent.

To add a built-in slash command that users see by default, add it to the Custom AI Commands default list in `useSettings.ts`. Each command needs:

```typescript
{
  command: '/mycommand',
  description: 'Does something useful',
  prompt: 'The prompt text with {{TEMPLATE_VARIABLES}}',
}
```

For commands that need programmatic behavior (not just prompts), handle them in `App.tsx` where slash commands are processed before being sent to the agent.

### Adding a New Theme

Maestro has 16 themes across 3 modes: dark, light, and vibe.

Add to `src/renderer/constants/themes.ts`:

```typescript
'my-theme': {
  id: 'my-theme',
  name: 'My Theme',
  mode: 'dark',  // 'dark', 'light', or 'vibe'
  colors: {
    bgMain: '#...',           // Main background
    bgSidebar: '#...',        // Sidebar background
    bgActivity: '#...',       // Activity/hover background
    border: '#...',           // Border color
    textMain: '#...',         // Primary text
    textDim: '#...',          // Secondary/dimmed text
    accent: '#...',           // Accent color
    accentDim: 'rgba(...)',   // Dimmed accent (with alpha)
    accentText: '#...',       // Text in accent contexts
    accentForeground: '#...', // Text ON accent backgrounds (contrast)
    success: '#...',          // Success state (green)
    warning: '#...',          // Warning state (yellow/orange)
    error: '#...',            // Error state (red)
  }
}
```

Then add the ID to `ThemeId` type in `src/shared/theme-types.ts` and to the `isValidThemeId` function.

### Adding an IPC Handler

1. Add handler in `src/main/index.ts`:
   ```typescript
   ipcMain.handle('myNamespace:myAction', async (_, arg1, arg2) => {
     // Implementation
     return result;
   });
   ```

2. Expose in `src/main/preload.ts`:
   ```typescript
   myNamespace: {
     myAction: (arg1, arg2) => ipcRenderer.invoke('myNamespace:myAction', arg1, arg2),
   },
   ```

3. Add types to `MaestroAPI` interface in preload.ts.

## Code Style

### TypeScript

- Strict mode enabled
- Interface definitions for all data structures
- Export types via `preload.ts` for renderer

### React Components

- Functional components with hooks
- Keep components focused and small
- Use Tailwind for layout, inline styles for theme colors
- Maintain keyboard accessibility
- Use `tabIndex={-1}` + `outline-none` for programmatic focus

### Security

- **Always use `execFileNoThrow`** for external commands (never shell-based execution)
- Keep context isolation enabled
- Use preload script for all IPC
- Sanitize all user inputs
- Use `spawn()` with `shell: false`

## Debugging Guide

### Focus Not Working

1. Add `tabIndex={0}` or `tabIndex={-1}` to element
2. Add `outline-none` class to hide focus ring
3. Use `ref={(el) => el?.focus()}` for auto-focus
4. Check for `e.stopPropagation()` blocking events

### Settings Not Persisting

1. Ensure wrapper function calls `window.maestro.settings.set()`
2. Check loading code in `useSettings.ts` useEffect
3. Verify the key name matches in both save and load

### Modal Escape Not Working

1. Register modal with layer stack (don't handle Escape locally)
2. Check priority in `modalPriorities.ts`
3. Use ref pattern to avoid re-registration:
   ```typescript
   const onCloseRef = useRef(onClose);
   onCloseRef.current = onClose;
   ```

### Theme Colors Not Applying

1. Use `style={{ color: theme.colors.textMain }}` instead of Tailwind color classes
2. Check theme prop is passed to component
3. Never use hardcoded hex colors for themed elements

### Process Output Not Showing

1. Check session ID matches (with `-ai` or `-terminal` suffix)
2. Verify `onData` listener is registered
3. Check process spawned successfully (check pid > 0)
4. Look for errors in DevTools console

### DevTools

Open via Quick Actions (`Cmd+K` → "Toggle DevTools") or set `DEBUG=true` env var.

## Commit Messages

Use conventional commits:

```
feat: new feature
fix: bug fix
docs: documentation changes
refactor: code refactoring
test: test additions/changes
chore: build process or tooling changes
```

Example: `feat: add context usage visualization`

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes following the code style
3. Test thoroughly (keyboard navigation, themes, focus)
4. Update documentation if needed
5. Submit PR with clear description
6. Wait for review

## Building for Release

### 1. Prepare Icons

Place icons in `build/` directory:
- `icon.icns` - macOS (512x512 or 1024x1024)
- `icon.ico` - Windows (256x256)
- `icon.png` - Linux (512x512)

### 2. Update Version

Update in `package.json`:
```json
{
  "version": "0.1.0"
}
```

### 3. Build Distributables

```bash
npm run package           # All platforms
npm run package:mac       # macOS (.dmg, .zip)
npm run package:win       # Windows (.exe)
npm run package:linux     # Linux (.AppImage, .deb, .rpm)
```

Output in `release/` directory.

### GitHub Actions

Create a release tag to trigger automated builds:

```bash
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions will build for all platforms and create a release.

## Questions?

Open a GitHub Discussion or create an Issue.

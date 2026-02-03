# CLAUDE.md

Essential guidance for working with this codebase. For detailed architecture, see [ARCHITECTURE.md](ARCHITECTURE.md). For development setup and processes, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Documentation Index

This guide has been split into focused sub-documents for progressive disclosure:

| Document | Description |
|----------|-------------|
| [[CLAUDE-PATTERNS.md]] | Core implementation patterns (process management, settings, modals, themes, Auto Run, SSH) |
| [[CLAUDE-IPC.md]] | IPC API surface (`window.maestro.*` namespaces) |
| [[CLAUDE-PERFORMANCE.md]] | Performance best practices (React optimization, debouncing, batching) |
| [[CLAUDE-WIZARD.md]] | Onboarding Wizard, Inline Wizard, and Tour System |
| [[CLAUDE-FEATURES.md]] | Usage Dashboard and Document Graph features |
| [[CLAUDE-AGENTS.md]] | Supported agents and capabilities |
| [[CLAUDE-SESSION.md]] | Session interface and code conventions |
| [AGENT_SUPPORT.md](AGENT_SUPPORT.md) | Detailed agent integration guide |

---

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

---

## Project Overview

Maestro is an Electron desktop app for managing multiple AI coding assistants simultaneously with a keyboard-first interface.

### Supported Agents

| ID | Name | Status |
|----|------|--------|
| `claude-code` | Claude Code | **Active** |
| `codex` | OpenAI Codex | **Active** |
| `opencode` | OpenCode | **Active** |
| `terminal` | Terminal | Internal |

See [[CLAUDE-AGENTS.md]] for capabilities and integration details.

---

## Quick Commands

```bash
npm run dev           # Development with hot reload (isolated data, can run alongside production)
npm run dev:prod-data # Development using production data (close production app first)
npm run dev:web       # Web interface development
npm run build         # Full production build
npm run clean         # Clean build artifacts
npm run lint          # TypeScript type checking (all configs)
npm run lint:eslint   # ESLint code quality checks
npm run package       # Package for all platforms
npm run test          # Run test suite
npm run test:watch    # Run tests in watch mode
```

---

## Architecture at a Glance

```
src/
├── main/                    # Electron main process (Node.js)
│   ├── index.ts            # Entry point, IPC handlers
│   ├── process-manager.ts  # Process spawning (PTY + child_process)
│   ├── preload.ts          # Secure IPC bridge
│   ├── agent-detector.ts   # Agent detection and configuration
│   ├── agent-capabilities.ts # Agent capability definitions
│   ├── agent-session-storage.ts # Session storage interface
│   ├── parsers/            # Agent output parsers
│   │   ├── agent-output-parser.ts  # Parser interface
│   │   ├── claude-output-parser.ts # Claude Code parser
│   │   ├── opencode-output-parser.ts # OpenCode parser
│   │   └── error-patterns.ts # Error detection patterns
│   ├── storage/            # Session storage implementations
│   │   ├── claude-session-storage.ts
│   │   └── opencode-session-storage.ts
│   ├── tunnel-manager.ts   # Cloudflare tunnel support
│   ├── web-server.ts       # Fastify server for web/mobile interface
│   └── utils/execFile.ts   # Safe command execution
│
├── renderer/               # React frontend (desktop)
│   ├── App.tsx            # Main coordinator
│   ├── components/        # UI components
│   ├── hooks/             # Custom React hooks
│   ├── services/          # IPC wrappers (git.ts, process.ts)
│   ├── constants/         # Themes, shortcuts, priorities
│   └── contexts/          # Layer stack context
│
├── web/                    # Web/mobile interface
│   ├── mobile/            # Mobile-optimized React app
│   ├── components/        # Shared web components
│   └── hooks/             # Web-specific hooks
│
├── cli/                    # CLI tooling for batch automation
│   ├── commands/          # CLI command implementations
│   ├── services/          # Playbook and batch processing
│   └── index.ts           # CLI entry point
│
├── prompts/                # System prompts (editable .md files)
│   ├── wizard-*.md        # Wizard conversation prompts
│   ├── autorun-*.md       # Auto Run default prompts
│   └── index.ts           # Central exports
│
├── shared/                 # Shared types and utilities
│   ├── types.ts           # Common type definitions
│   └── templateVariables.ts # Template variable processing
│
└── docs/                   # Mintlify documentation (docs.runmaestro.ai)
    ├── docs.json          # Navigation and configuration
    ├── screenshots/       # All documentation screenshots
    └── *.md               # Documentation pages
```

---

## Key Files for Common Tasks

| Task | Primary Files |
|------|---------------|
| Add IPC handler | `src/main/index.ts`, `src/main/preload.ts` |
| Add UI component | `src/renderer/components/` |
| Add web/mobile component | `src/web/components/`, `src/web/mobile/` |
| Add keyboard shortcut | `src/renderer/constants/shortcuts.ts`, `App.tsx` |
| Add theme | `src/renderer/constants/themes.ts` |
| Add modal | Component + `src/renderer/constants/modalPriorities.ts` |
| Add tab overlay menu | See Tab Hover Overlay Menu pattern in [[CLAUDE-PATTERNS.md]] |
| Add setting | `src/renderer/hooks/useSettings.ts`, `src/main/index.ts` |
| Add template variable | `src/shared/templateVariables.ts`, `src/renderer/utils/templateVariables.ts` |
| Modify system prompts | `src/prompts/*.md` (wizard, Auto Run, etc.) |
| Add Spec-Kit command | `src/prompts/speckit/`, `src/main/speckit-manager.ts` |
| Add OpenSpec command | `src/prompts/openspec/`, `src/main/openspec-manager.ts` |
| Add CLI command | `src/cli/commands/`, `src/cli/index.ts` |
| Configure agent | `src/main/agent-detector.ts`, `src/main/agent-capabilities.ts` |
| Add agent output parser | `src/main/parsers/`, `src/main/parsers/index.ts` |
| Add agent session storage | `src/main/storage/`, `src/main/agent-session-storage.ts` |
| Add agent error patterns | `src/main/parsers/error-patterns.ts` |
| Add playbook feature | `src/cli/services/playbooks.ts` |
| Add marketplace playbook | `src/main/ipc/handlers/marketplace.ts` (import from GitHub) |
| Playbook import/export | `src/main/ipc/handlers/playbooks.ts` (ZIP handling with assets) |
| Modify wizard flow | `src/renderer/components/Wizard/` (see [[CLAUDE-WIZARD.md]]) |
| Add tour step | `src/renderer/components/Wizard/tour/tourSteps.ts` |
| Modify file linking | `src/renderer/utils/remarkFileLinks.ts` (remark plugin for `[[wiki]]` and path links) |
| Add documentation page | `docs/*.md`, `docs/docs.json` (navigation) |
| Add documentation screenshot | `docs/screenshots/` (PNG, kebab-case naming) |
| MCP server integration | See [MCP Server docs](https://docs.runmaestro.ai/mcp-server) |
| Add stats/analytics feature | `src/main/stats-db.ts`, `src/main/ipc/handlers/stats.ts` |
| Add Usage Dashboard chart | `src/renderer/components/UsageDashboard/` |
| Add Document Graph feature | `src/renderer/components/DocumentGraph/`, `src/main/ipc/handlers/documentGraph.ts` |
| Add colorblind palette | `src/renderer/constants/colorblindPalettes.ts` |
| Add performance metrics | `src/shared/performance-metrics.ts` |
| Add power management | `src/main/power-manager.ts`, `src/main/ipc/handlers/system.ts` |
| Spawn agent with SSH support | `src/main/utils/ssh-spawn-wrapper.ts` (required for SSH remote execution) |
| Modify file preview tabs | `TabBar.tsx`, `FilePreview.tsx`, `MainPanel.tsx` (see ARCHITECTURE.md → File Preview Tab System) |

---

## Critical Implementation Guidelines

### SSH Remote Execution Awareness

**IMPORTANT:** When implementing any feature that spawns agent processes (e.g., context grooming, group chat, batch operations), you MUST support SSH remote execution.

Sessions can be configured to run on remote hosts via SSH. Without proper SSH wrapping, agents will always execute locally, breaking the user's expected behavior.

**Required pattern:**
1. Check if the session has `sshRemoteConfig` with `enabled: true`
2. Use `wrapSpawnWithSsh()` from `src/main/utils/ssh-spawn-wrapper.ts` to wrap the spawn config
3. Pass the SSH store (available via `createSshRemoteStoreAdapter(settingsStore)`)

```typescript
import { wrapSpawnWithSsh } from '../utils/ssh-spawn-wrapper';
import { createSshRemoteStoreAdapter } from '../utils/ssh-remote-resolver';

// Before spawning, wrap the config with SSH if needed
if (sshStore && session.sshRemoteConfig?.enabled) {
  const sshWrapped = await wrapSpawnWithSsh(spawnConfig, session.sshRemoteConfig, sshStore);
  // Use sshWrapped.command, sshWrapped.args, sshWrapped.cwd, etc.
}
```

**Also ensure:**
- The correct agent type is used (don't hardcode `claude-code`)
- Custom agent configuration (customPath, customArgs, customEnvVars) is passed through
- Agent's `binaryName` is used for remote execution (not local paths)

See [[CLAUDE-PATTERNS.md]] for detailed SSH patterns.

---

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

---

## MCP Server

Maestro provides a hosted MCP (Model Context Protocol) server for AI applications to search the documentation.

**Server URL:** `https://docs.runmaestro.ai/mcp`

**Available Tools:**
- `SearchMaestro` - Search the Maestro knowledge base for documentation, code examples, API references, and guides

**Connect from Claude Desktop/Code:**
```json
{
  "mcpServers": {
    "maestro": {
      "url": "https://docs.runmaestro.ai/mcp"
    }
  }
}
```

See [MCP Server documentation](https://docs.runmaestro.ai/mcp-server) for full details.

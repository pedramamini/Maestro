# CLAUDE-PLUGINS.md

Plugin system architecture and development guide. For the main guide, see [[CLAUDE.md]].

---

## Overview

Maestro's plugin system allows extending functionality through sandboxed JavaScript modules that run in the main process. Plugins can read process events, send webhooks, write files, and register UI surfaces — all scoped by a permission model.

Plugins are discovered from `userData/plugins/` at startup. First-party plugins ship bundled in `src/plugins/` and are bootstrapped (copied) to userData on version mismatch.

---

## Architecture

```
src/plugins/                    # Bundled first-party plugin source
  ├── agent-status-exporter/    # Exports agent status to JSON
  └── notification-webhook/     # Sends webhooks on agent events

src/main/
  ├── plugin-loader.ts          # Discovery, manifest validation, bootstrap
  ├── plugin-manager.ts         # Lifecycle orchestration (singleton)
  ├── plugin-host.ts            # API creation, activation, sandboxing
  ├── plugin-storage.ts         # Per-plugin file storage
  ├── plugin-ipc-bridge.ts      # Main↔renderer plugin communication
  ├── ipc/handlers/plugins.ts   # IPC handlers for renderer
  └── preload/plugins.ts        # Preload bridge (window.maestro.plugins)

src/shared/plugin-types.ts      # All plugin type definitions
src/renderer/
  ├── components/PluginManager.tsx  # Plugin UI (list, detail, settings)
  ├── hooks/usePluginRegistry.ts    # React hook for plugin state
  └── global.d.ts                   # Plugin IPC type declarations
```

### Lifecycle Flow

```
Bootstrap → Discover → Validate → Auto-enable (first-party) → Activate
                                                                  ↓
                                                         Plugin receives PluginAPI
                                                         (scoped by permissions)
```

1. **Bootstrap** (`bootstrapBundledPlugins`): Copies `dist/plugins/` → `userData/plugins/` on version mismatch
2. **Discover** (`discoverPlugins`): Reads each subdirectory's `manifest.json` + `README.md`
3. **Validate**: Schema validation of manifest fields, permission checking
4. **Auto-enable**: First-party plugins activate unless user explicitly disabled them
5. **Activate** (`PluginHost.activatePlugin`): Loads module, creates scoped API, calls `activate(api)`

---

## Plugin Manifest

Every plugin requires a `manifest.json`:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "What this plugin does",
  "author": "Author Name",
  "firstParty": true,
  "main": "index.js",
  "permissions": ["process:read", "storage"],
  "settings": [
    { "key": "outputPath", "type": "string", "label": "Output Path", "default": "" },
    { "key": "enabled", "type": "boolean", "label": "Feature Enabled", "default": true }
  ],
  "tags": ["monitoring", "automation"]
}
```

### Permission Model

| Permission | Grants | Risk |
|------------|--------|------|
| `process:read` | Subscribe to agent data, exit, usage, tool events | Low |
| `process:write` | Kill/write to agent processes | High |
| `stats:read` | Query usage statistics database | Low |
| `settings:read` | Read plugin-scoped settings | Low |
| `settings:write` | Read and write plugin-scoped settings | Medium |
| `storage` | File I/O in plugin's data directory | Medium |
| `notifications` | Show desktop notifications, play sounds | Low |
| `network` | HTTP requests (implicit, not enforced yet) | Medium |
| `middleware` | Reserved for v2 — intercept/transform data | High |

Permissions are color-coded in the UI: green (read), yellow (write), red (middleware).

---

## Plugin API Surface

Plugins receive a scoped `PluginAPI` object in their `activate(api)` call. Namespaces are only present when the plugin has the required permission.

### `api.maestro` (always available)

```typescript
{
  version: string;      // Maestro app version
  platform: string;     // 'darwin' | 'win32' | 'linux'
  pluginId: string;     // This plugin's ID
  pluginDir: string;    // Absolute path to plugin directory
  dataDir: string;      // Absolute path to plugin's data/ directory
}
```

### `api.process` (requires `process:read`)

```typescript
{
  getActiveProcesses(): Promise<Array<{
    sessionId: string;
    toolType: string;    // Agent type: 'claude-code', 'codex', etc.
    pid: number;
    startTime: number;
    name: string | null; // User-assigned agent name
  }>>;
  onData(cb: (sessionId, data) => void): () => void;
  onExit(cb: (sessionId, code) => void): () => void;
  onUsage(cb: (sessionId, stats) => void): () => void;
  onToolExecution(cb: (sessionId, tool) => void): () => void;
  onThinkingChunk(cb: (sessionId, text) => void): () => void;
}
```

### `api.settings` (requires `settings:read` or `settings:write`)

```typescript
{
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;  // requires settings:write
  getAll(): Promise<Record<string, unknown>>;
}
```

Settings are namespaced to `plugin:<id>:<key>` in electron-store.

### `api.storage` (requires `storage`)

```typescript
{
  read(filename: string): Promise<string | null>;
  write(filename: string, data: string): Promise<void>;
  list(): Promise<string[]>;
  delete(filename: string): Promise<void>;
}
```

Files stored in `userData/plugins/<id>/data/`.

### `api.notifications` (requires `notifications`)

```typescript
{
  show(title: string, body: string): Promise<void>;
  playSound(sound: string): Promise<void>;
}
```

### `api.ipcBridge` (always available if PluginIpcBridge is wired)

```typescript
{
  onMessage(channel: string, handler: (...args) => unknown): () => void;
  sendToRenderer(channel: string, ...args): void;
}
```

---

## Settings Persistence

Plugin settings flow through two paths:

1. **Runtime API** (`api.settings.get/set`): Used by the plugin code at runtime. Keys are stored as `plugin:<id>:<key>` in the main settings store via `PluginHost.createSettingsAPI()`.

2. **Renderer IPC** (`plugins:settings:get/set`): Used by the PluginManager UI. Calls through to `PluginManager.getAllPluginSettings()` / `setPluginSetting()`.

**Critical:** `PluginManager.setSettingsStore(store)` must be called during initialization, or settings silently no-op (both methods have early returns when `settingsStore` is null).

---

## Build Pipeline

Plugins in `src/plugins/` are plain JavaScript (not TypeScript) and need to be copied to `dist/plugins/` for the main process to find them at runtime.

```bash
npm run build:plugins  # Copies src/plugins/ → dist/plugins/
```

This runs as part of `build:main`, `dev:main`, and `dev:main:prod-data`. The Windows `start-dev.ps1` also includes it.

**Why not TypeScript?** Plugins are loaded via `require()` at runtime from userData. They must be self-contained `.js` files without a compile step. The manifest and README are JSON/Markdown.

---

## Bootstrap and Deprecation

`bootstrapBundledPlugins()` in `plugin-loader.ts`:

1. Reads `dist/plugins/` (or `resources/plugins/` in production)
2. Removes any deprecated plugin directories (hardcoded list: `['agent-dashboard']`)
3. For each bundled plugin:
   - If destination doesn't exist → copy (install)
   - If version differs → overwrite (update)
   - If version matches → skip (preserve user modifications)

**To rename a plugin:** Add the old ID to the `deprecatedPlugins` array and bump the new plugin's version.

---

## IPC Handlers

All plugin IPC is registered in `src/main/ipc/handlers/plugins.ts`:

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `plugins:list` | Renderer → Main | Get all discovered plugins |
| `plugins:enable` | Renderer → Main | Enable/activate a plugin |
| `plugins:disable` | Renderer → Main | Disable/deactivate a plugin |
| `plugins:refresh` | Renderer → Main | Re-run discovery |
| `plugins:dir` | Renderer → Main | Get plugins directory path |
| `plugins:settings:get` | Renderer → Main | Get all settings for a plugin |
| `plugins:settings:set` | Renderer → Main | Set a single plugin setting |
| `plugins:bridge:invoke` | Renderer → Main | Call a plugin's registered handler |

Preload bridge: `window.maestro.plugins.*` (see `src/main/preload/plugins.ts`).

---

## UI Integration

Plugins are managed via **Settings → Plugins** tab (shortcut: `Ctrl+Shift+X`).

### PluginManager Component

- **List view**: Cards showing name, version, author, permissions, toggle
- **Detail view**: Back button, header, toggle, permission badges, settings editor, README (rendered via `react-markdown`)
- **Settings editor**: Validates path-like keys (absolute path) and URL-like keys (valid URL). Text inputs save on blur with "Saved" flash indicator.

### Keyboard Shortcut

The `openPlugins` shortcut calls `useModalStore.getState().openModal('settings', { tab: 'plugins' })` directly — it must not go through `setSettingsModalOpen()` which hardcodes `{ tab: 'general' }`.

---

## Writing a New Plugin

### Minimal Plugin

```
my-plugin/
  ├── manifest.json
  ├── index.js
  └── README.md    (optional, displayed in UI)
```

**manifest.json:**
```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "Does something useful",
  "author": "You",
  "main": "index.js",
  "permissions": ["process:read"]
}
```

**index.js:**
```javascript
let unsubscribers = [];

async function activate(api) {
  const unsub = api.process.onExit((sessionId, code) => {
    console.log(`[my-plugin] Agent ${sessionId} exited with code ${code}`);
  });
  unsubscribers.push(unsub);
}

async function deactivate() {
  for (const unsub of unsubscribers) unsub();
  unsubscribers = [];
}

module.exports = { activate, deactivate };
```

### First-Party Plugin Checklist

- [ ] Place in `src/plugins/<id>/`
- [ ] Set `"firstParty": true` in manifest
- [ ] Write a README.md (shown in plugin detail view)
- [ ] Add tests in `src/__tests__/main/plugin-reference.test.ts`
- [ ] Bump version on any change (triggers bootstrap re-copy)
- [ ] Clean up timers/subscriptions in `deactivate()`

---

## Bundled Plugins

### Agent Status Exporter (`agent-status-exporter`)

Writes a `status.json` file with real-time agent state. Heartbeat every 10 seconds ensures the file stays fresh even when idle.

**Permissions:** `process:read`, `storage`, `settings:read`
**Settings:** `outputPath` — custom absolute path for status.json (defaults to plugin data dir)

### Notification Webhook (`notification-webhook`)

Sends HTTP POST webhooks on agent exit and error events. Includes agent name, type, exit code, and last ~1000 chars of output.

**Permissions:** `process:read`, `settings:write`, `notifications`, `network`
**Settings:** `webhookUrl`, `notifyOnCompletion`, `notifyOnError`

**IPv6 note:** The plugin resolves `localhost` to `127.0.0.1` explicitly to avoid `ECONNREFUSED ::1` on Linux systems where Node prefers IPv6.

---

## Common Gotchas

1. **Settings not persisting**: Ensure `pluginManager.setSettingsStore(store)` is called in `index.ts`
2. **Plugins not bootstrapping in dev**: `dist/plugins/` must exist — run `npm run build:plugins` or restart with `npm run dev`
3. **Stale plugin in userData after rename**: Add old ID to `deprecatedPlugins` array in `bootstrapBundledPlugins()`
4. **Session ID format**: Process manager uses `{baseId}-ai-{tabId}`. Strip suffix with `/-ai-.+$|-terminal$|-batch-\d+$|-synopsis-\d+$/` to match against sessions store
5. **Shortcut opens wrong tab**: `openPlugins` must use `openModal('settings', { tab: 'plugins' })` directly, not `setSettingsModalOpen(true)`

---

## Key Files

| File | Purpose |
|------|---------|
| `src/main/plugin-loader.ts` | Discovery, validation, bootstrap |
| `src/main/plugin-manager.ts` | Lifecycle, settings, singleton |
| `src/main/plugin-host.ts` | API creation, sandboxing, activation |
| `src/main/plugin-storage.ts` | Per-plugin file I/O |
| `src/main/plugin-ipc-bridge.ts` | Main↔renderer communication |
| `src/main/ipc/handlers/plugins.ts` | IPC handler registration |
| `src/main/preload/plugins.ts` | Preload bridge |
| `src/shared/plugin-types.ts` | All type definitions |
| `src/renderer/components/PluginManager.tsx` | Plugin UI |
| `src/renderer/hooks/usePluginRegistry.ts` | React state management |
| `src/plugins/` | Bundled first-party plugins |
| `src/__tests__/main/plugin-reference.test.ts` | Plugin integration tests |

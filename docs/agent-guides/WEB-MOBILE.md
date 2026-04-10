<!-- Verified 2026-04-10 against origin/rc (06e5a2eb3) -->

# Web & Mobile Interface

Architecture, components, hooks, and patterns for the Maestro web/mobile remote control interface.

---

## Overview

The web interface is a **separate React application** from the desktop renderer. It provides remote control of Maestro sessions from mobile/tablet devices over the local network. Communication with the Electron main process happens via WebSocket and REST API, not Electron IPC.

```
Desktop App (Electron)
├── Main Process
│   └── Web Server (Express + WebSocket)
│       ├── REST API: /$TOKEN/api/*
│       └── WebSocket: /$TOKEN/ws
└── Web Client (separate React app)
    └── Connects over HTTP/WS to main process
```

---

## Architecture

### Directory Structure

```
src/web/
├── App.tsx                   # Root app component (contexts, routing)
├── main.tsx                  # Entry point (createRoot)
├── index.ts                  # Module exports
├── index.css                 # Global styles
├── index.html                # HTML template
├── components/               # Shared web components
│   ├── Badge.tsx
│   ├── Button.tsx
│   ├── Card.tsx
│   ├── Input.tsx
│   ├── PullToRefresh.tsx
│   ├── ThemeProvider.tsx
│   └── index.ts
├── hooks/                    # Web-specific hooks
│   ├── useWebSocket.ts       # Core WS connection
│   ├── useSessions.ts        # Session state management
│   ├── useNotifications.ts   # Push notifications
│   ├── useOfflineQueue.ts    # Offline command queueing
│   ├── useUnreadBadge.ts     # Tab badge counter
│   ├── useCommandHistory.ts  # Command recall
│   ├── useSwipeGestures.ts   # Touch gestures
│   ├── useSwipeUp.ts         # Swipe-up for history
│   ├── usePullToRefresh.ts   # Pull-to-refresh
│   ├── useLongPress.ts       # Long-press detection
│   ├── useLongPressMenu.ts   # Long-press context menu
│   ├── useVoiceInput.ts      # Voice-to-text
│   ├── useKeyboardVisibility.ts  # Virtual keyboard state
│   ├── useDeviceColorScheme.ts   # System dark/light mode
│   ├── useSlashCommandAutocomplete.ts
│   ├── useMobileKeyboardHandler.ts
│   ├── useMobileViewState.ts
│   ├── useMobileSessionManagement.ts
│   ├── useMobileAutoReconnect.ts
│   └── index.ts
├── utils/                    # Web-specific utilities
│   ├── config.ts             # Server config from window.__MAESTRO_CONFIG__
│   ├── cssCustomProperties.ts
│   ├── logger.ts             # Web-specific logger
│   ├── serviceWorker.ts      # PWA offline support
│   └── viewState.ts          # View state persistence (localStorage)
├── mobile/                   # Mobile-optimized React app (~38 components)
│   ├── App.tsx               # Mobile app root (defines MobileHeader internally)
│   ├── index.tsx             # Mobile entry point
│   ├── constants.ts          # Haptic patterns, breakpoints
│   │
│   ├── AllSessionsView.tsx        # Dashboard session grid
│   ├── AutoRunDocumentCard.tsx    # Auto Run doc card
│   ├── AutoRunDocumentViewer.tsx  # Full Auto Run doc viewer
│   ├── AutoRunIndicator.tsx
│   ├── AutoRunPanel.tsx
│   ├── AutoRunSetupSheet.tsx
│   ├── AchievementsPanel.tsx
│   ├── AgentCreationSheet.tsx
│   ├── CommandHistoryDrawer.tsx
│   ├── CommandInputBar.tsx
│   ├── CommandInputButtons.tsx
│   ├── ConnectionStatusIndicator.tsx
│   ├── ContextManagementSheet.tsx
│   ├── CuePanel.tsx
│   ├── GitDiffViewer.tsx
│   ├── GitStatusPanel.tsx
│   ├── GroupChatPanel.tsx
│   ├── GroupChatSetupSheet.tsx
│   ├── LeftPanel.tsx              # Mobile left drawer
│   ├── MessageHistory.tsx
│   ├── MobileHistoryPanel.tsx
│   ├── MobileMarkdownRenderer.tsx
│   ├── NotificationSettingsSheet.tsx
│   ├── OfflineQueueBanner.tsx
│   ├── QuickActionsMenu.tsx
│   ├── RecentCommandChips.tsx
│   ├── ResponseViewer.tsx
│   ├── RightDrawer.tsx            # Mobile right drawer
│   ├── RightPanel.tsx
│   ├── SessionPillBar.tsx
│   ├── SessionStatusBanner.tsx
│   ├── SettingsPanel.tsx
│   ├── SlashCommandAutocomplete.tsx
│   ├── TabBar.tsx
│   ├── TabSearchModal.tsx
│   ├── UsageDashboardPanel.tsx
│   └── WebTerminal.tsx            # xterm-based mobile terminal
└── public/                   # Static assets
```

### Key Differences from Desktop Renderer

| Aspect          | Desktop                               | Web                        |
| --------------- | ------------------------------------- | -------------------------- |
| IPC             | `window.maestro.*` (Electron preload) | WebSocket + REST API       |
| State           | Zustand stores                        | React hooks + WS events    |
| Navigation      | Keyboard-first                        | Touch-first                |
| Process control | Direct PTY spawn                      | Commands sent over WS      |
| Theme source    | Settings store                        | Synced from desktop via WS |
| File system     | Direct IPC access                     | No direct FS access        |

---

## Configuration

### Server-Injected Config

The Electron main process injects configuration into `window.__MAESTRO_CONFIG__`:

```typescript
interface MaestroConfig {
	securityToken: string; // UUID - required in all API/WS URLs
	sessionId: string | null; // Viewing specific session or null for dashboard
	tabId: string | null; // Specific tab within session
	apiBase: string; // e.g., "/$TOKEN/api"
	wsUrl: string; // e.g., "/$TOKEN/ws"
}
```

Access via `getMaestroConfig()` from `src/web/utils/config.ts`.

### URL Structure

```
http://host:port/$SECURITY_TOKEN/                    # Dashboard
http://host:port/$SECURITY_TOKEN/session/$SESSION_ID  # Session view
http://host:port/$SECURITY_TOKEN/session/$SESSION_ID?tabId=$TAB_ID  # Tab view
```

The security token is a UUID that must be present in all API and WebSocket URLs.

---

## WebSocket Communication

### Connection Hook (`useWebSocket`)

File: `src/web/hooks/useWebSocket.ts`

Manages WebSocket lifecycle:

```typescript
type WebSocketState =
	| 'disconnected'
	| 'connecting'
	| 'connected'
	| 'authenticating'
	| 'authenticated';
```

The hook provides connection state, message sending, and event handlers. Authentication happens via the URL path (security token), so no separate auth handshake is needed.

### Session Data Model

The WebSocket transmits `SessionData` objects:

```typescript
interface SessionData {
	id: string;
	name: string;
	toolType: string;
	state: string; // 'idle' | 'busy' | 'error' | 'connecting'
	inputMode: string; // 'ai' | 'terminal'
	cwd: string;
	groupId?: string | null;
	groupName?: string | null;
	groupEmoji?: string | null;
	usageStats?: UsageStats | null;
	lastResponse?: LastResponsePreview | null;
	agentSessionId?: string | null;
	aiTabs?: AITabData[]; // Multi-tab support
	activeTabId?: string | null;
}
```

### AI Tab Data

Each session can have multiple AI tabs. The WebSocket sends `AITabData`:

```typescript
interface AITabData {
	id: string;
	agentSessionId: string | null;
	name: string | null;
	starred: boolean;
	inputValue: string;
	usageStats?: UsageStats | null;
	createdAt: number;
	state: 'idle' | 'busy';
	thinkingStartTime?: number | null;
}
```

### Last Response Preview

For mobile display, responses are truncated server-side:

```typescript
interface LastResponsePreview {
	text: string; // First 3 lines or ~500 chars
	timestamp: number;
	source: 'stdout' | 'stderr' | 'system';
	fullLength: number; // Original length
}
```

---

## Session Management (`useSessions`)

File: `src/web/hooks/useSessions.ts`

Builds on `useWebSocket` to provide high-level session management:

```typescript
interface Session extends SessionData {
	isSending?: boolean;
	lastError?: string;
}

interface UseSessionsReturn {
	sessions: Session[];
	activeSession: Session | null;
	connectionState: WebSocketState;
	sendCommand: (sessionId: string, command: string) => Promise<boolean>;
	sendToActive: (command: string) => Promise<boolean>;
	interrupt: (sessionId: string) => Promise<boolean>;
	interruptActive: () => Promise<boolean>;
	switchMode: (sessionId: string, mode: InputMode) => Promise<boolean>;
	// ... tab ops (selectTab, newTab, closeTab, ...) and more
}
```

### Group Organization

Sessions are grouped into `GroupInfo` objects:

```typescript
interface GroupInfo {
	id: string | null; // null = ungrouped
	name: string;
	emoji: string | null;
	sessions: Session[];
}
```

---

## Mobile App Component Tree

```
AppRoot (App.tsx)
├── ThemeProvider
│   └── MaestroModeContext.Provider
│       └── OfflineContext.Provider
│           └── MobileApp (mobile/App.tsx)
│               ├── MobileHeader
│               ├── OfflineQueueBanner
│               ├── SessionPillBar
│               ├── TabBar
│               ├── AutoRunIndicator
│               ├── CommandInputBar
│               │   ├── SlashCommandAutocomplete
│               │   └── CommandInputButtons
│               ├── ResponseViewer
│               ├── MessageHistory
│               ├── AllSessionsView
│               ├── MobileHistoryPanel
│               └── TabSearchModal
```

---

## Contexts

### OfflineContext

Tracks whether the device is offline:

```typescript
const { isOffline } = useOfflineStatus();
```

### MaestroModeContext

Manages dashboard vs. session view navigation:

```typescript
const {
	isDashboard,
	isSession,
	sessionId,
	tabId,
	securityToken,
	goToDashboard,
	goToSession,
	updateUrl,
} = useMaestroMode();
```

### DesktopTheme

Theme synced from the desktop app via WebSocket:

```typescript
const theme = useDesktopTheme();
```

---

## Mobile-Specific Hooks

### `useOfflineQueue`

Queues commands typed while offline and sends them when reconnected:

```typescript
interface QueuedCommand {
	id: string;
	command: string;
	sessionId: string;
	timestamp: number;
	inputMode: 'ai' | 'terminal';
	attempts: number;
	lastError?: string;
}
```

Features:

- Persists to `localStorage` (survives page reloads)
- Max queue size: 50 commands
- Automatic retry on reconnection with 100ms delay between sends
- Manual retry and clearing

### `useNotifications`

Browser push notification management:

```typescript
const {
	permission, // 'default' | 'granted' | 'denied'
	isSupported,
	hasPrompted,
	requestPermission,
} = useNotifications({
	autoRequest: true,
	requestDelay: 2000,
	onGranted: () => console.log('Notifications enabled'),
});
```

### `useMobileViewState`

Persists view state to `localStorage`:

- Which overlays are open (all sessions, history panel, tab search)
- History filter and search state
- Active session and tab selection
- Screen size tracking (phone vs tablet breakpoint at 700px height)

### `useMobileKeyboardHandler`

Adapts keyboard shortcuts for the mobile interface.

### `useMobileAutoReconnect`

Automatic WebSocket reconnection with exponential backoff.

### `useMobileSessionManagement`

Session selection, switching, and tab management for mobile.

### Touch Gesture Hooks

- `useSwipeGestures` - Horizontal swipe for session switching
- `useSwipeUp` - Swipe up to reveal history
- `usePullToRefresh` - Pull-to-refresh for session data
- `useLongPress` / `useLongPressMenu` - Long-press for context menus

### `useVoiceInput`

Voice-to-text input using the Web Speech API.

### `useKeyboardVisibility`

Tracks virtual keyboard state on mobile devices to adjust layout.

### `useUnreadBadge`

Manages browser tab badge for unread session responses.

---

## Shared Web Components

Located in `src/web/components/`:

| Component       | Purpose                                    |
| --------------- | ------------------------------------------ |
| `ThemeProvider` | Provides theme context synced from desktop |
| `Button`        | Themed button with variants                |
| `Badge`         | Status badges                              |
| `Card`          | Content cards                              |
| `Input`         | Form inputs                                |
| `PullToRefresh` | Pull-to-refresh wrapper                    |

---

## Mobile Components

### `CommandInputBar`

Primary input surface. Supports two modes:

- **AI mode** - sends to AI agent
- **Terminal mode** - sends as shell command

Features:

- Slash command autocomplete
- Per-session, per-tab draft persistence
- Voice input toggle
- Image attachment
- Read-only mode indicator

### `SessionPillBar`

Horizontal scrollable session list. Each pill shows:

- Session name and status color
- Group emoji
- Unread indicator

### `TabBar`

Tab navigation within a session (mirroring the desktop tab system).

### `ResponseViewer`

Displays AI responses with:

- Markdown rendering (`MobileMarkdownRenderer`)
- Thinking indicator
- Response timestamp
- Full-length toggle

### `AllSessionsView`

Dashboard grid showing all active sessions with:

- Group organization
- Status indicators
- Quick session switching
- Cost and context usage display

### `MobileHistoryPanel`

History viewer with:

- Filter by type (all, auto-run, user)
- Search
- Expandable entries

### `AutoRunIndicator`

Compact auto-run status indicator showing current task progress.

---

## Service Worker & PWA

File: `src/web/utils/serviceWorker.ts`

The web interface registers a service worker for:

- Offline support (cached static assets)
- `isOffline()` detection
- Background sync for command queue

---

## Haptic Feedback

File: `src/web/mobile/constants.ts`

Touch interactions trigger haptic feedback via `navigator.vibrate()`:

```typescript
import { triggerHaptic, HAPTIC_PATTERNS } from './constants';

triggerHaptic(HAPTIC_PATTERNS.TAP); // Light tap
triggerHaptic(HAPTIC_PATTERNS.SUCCESS); // Success pattern
triggerHaptic(HAPTIC_PATTERNS.ERROR); // Error pattern
```

---

## Key Files Reference

| Concern           | Primary Files                                                        |
| ----------------- | -------------------------------------------------------------------- |
| App root          | `src/web/App.tsx`, `src/web/main.tsx`                                |
| Mobile app        | `src/web/mobile/App.tsx`, `src/web/mobile/index.tsx`                 |
| WebSocket         | `src/web/hooks/useWebSocket.ts`                                      |
| Sessions          | `src/web/hooks/useSessions.ts`                                       |
| Config            | `src/web/utils/config.ts`                                            |
| Theme             | `src/web/components/ThemeProvider.tsx`                               |
| Offline           | `src/web/hooks/useOfflineQueue.ts`, `src/web/utils/serviceWorker.ts` |
| View state        | `src/web/hooks/useMobileViewState.ts`, `src/web/utils/viewState.ts`  |
| Notifications     | `src/web/hooks/useNotifications.ts`                                  |
| Shared components | `src/web/components/`                                                |
| Mobile components | `src/web/mobile/`                                                    |
| Development       | `npm run dev:web`                                                    |

---
title: Multi-Window Support
description: Organize your workspace across multiple windows with drag-and-drop tab management and automatic session preservation.
icon: window-restore
---

## Overview

Maestro supports multiple windows, allowing you to spread your AI sessions across your displays for better organization and multitasking. Move tabs between windows via drag-and-drop, keyboard shortcuts, or context menus.

**Key features:**

- **Drag tabs out** to create new windows
- **Move tabs** between existing windows
- **Automatic session transfer** when closing secondary windows
- **Multi-display support** with display-aware window restoration
- **Window identification** with visual badges

## Creating Additional Windows

There are three ways to create a new window with a tab:

### 1. Keyboard Shortcut

Press `Cmd+Shift+O` (macOS) or `Ctrl+Shift+O` (Windows/Linux) to move the current tab to a new window.

### 2. Tab Context Menu

Hover over any tab to reveal the tab menu overlay, then click **Move to New Window**.

### 3. Drag and Drop

Drag a tab outside the tab bar area to create a new window containing that tab.

## Moving Tabs Between Windows

Once you have multiple windows open, you can move tabs between them:

### Drag and Drop

1. Start dragging a tab from one window
2. Drag it to the tab bar of another Maestro window
3. Drop to move the tab to that window

### Focus Existing Session

If you try to open a session that's already open in another window, Maestro will focus the existing window rather than creating a duplicate. This prevents accidentally having the same session open in multiple places.

## Window Identification

To help you identify windows when using Mission Control, Exposé, or Alt+Tab:

- **Primary window** — The main Maestro window (no badge visible)
- **Secondary windows** — Display a badge in the tab bar (e.g., "W2", "W3")

The OS window title also reflects the window number:
- Primary: "Maestro"
- Secondary: "Maestro [2]", "Maestro [3]", etc.

## Closing Windows

When you close a secondary window:

1. **Sessions are preserved** — All sessions in that window are automatically moved back to the primary window
2. **Toast notification** — A brief message confirms how many sessions were moved (e.g., "2 sessions moved to main window")
3. **No data loss** — Your conversation history and session state are maintained

<Warning>
The primary window cannot be closed while secondary windows are open. Close secondary windows first, or simply close all Maestro windows together.
</Warning>

## Multi-Display Support

Maestro remembers which display each window was on and restores windows to the correct display on restart:

| Scenario | Behavior |
|----------|----------|
| Display still connected | Window restored to saved position on the same display |
| Display arrangement changed | Window repositioned to stay on the saved display |
| Display disconnected | Window moved to the primary display |

This works across application restarts and system reboots.

## Panel State Per Window

Each window maintains its own panel state:

- **Left panel** (session list) — Collapsed/expanded state is per-window
- **Right panel** (Files, History, Auto Run) — Collapsed/expanded state is per-window
- **Active tab** — Each window tracks its own active session

## Keyboard Shortcuts

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| Move Tab to New Window | `Cmd+Shift+O` | `Ctrl+Shift+O` |
| Previous Tab | `Cmd+Shift+[` | `Ctrl+Shift+[` |
| Next Tab | `Cmd+Shift+]` | `Ctrl+Shift+]` |
| Close Tab | `Cmd+W` | `Ctrl+W` |

Most keyboard shortcuts operate at the **window** level, affecting only the current window. See [Keyboard Shortcuts](./keyboard-shortcuts#shortcut-scope) for details on global vs window-scoped shortcuts.

## Best Practices

### Organize by Project

Use separate windows for different projects or contexts. For example:
- Window 1: Frontend development sessions
- Window 2: Backend/API sessions
- Window 3: Documentation and research

### Use Multiple Displays

Spread windows across displays to maximize screen real estate:
- Main display: Primary window with active work
- Secondary display: Reference sessions or monitoring

### Leverage Window Badges

When using Mission Control or Alt+Tab, look for the window badges (W2, W3, etc.) to quickly identify which Maestro window to switch to.

## Technical Details

### Session Ownership

Each session belongs to exactly one window at any time. The session's window assignment is:

- Tracked in the window registry
- Persisted across application restarts
- Updated atomically during move operations

### Race Condition Prevention

Rapid session movements (e.g., quickly dragging multiple tabs) are handled safely through operation queuing. Moves are processed sequentially to prevent session duplication or loss.

### Telemetry

If you have statistics collection enabled, multi-window usage is tracked for analytics:

- Window creation/closure events
- Session move events
- Peak concurrent window count

This data helps inform future improvements to multi-window support. Telemetry respects your [statistics collection settings](./usage-dashboard#privacy).

---
title: Configuration
description: Settings overview, updates, storage locations, and cross-device sync.
icon: gear
---

## Settings Overview

Open Settings with `Cmd+,` / `Ctrl+,` or via **Quick Actions** (`Cmd+K` / `Ctrl+K`) → "Open Settings".

Settings are organized into tabs:

| Tab | Contents |
|-----|----------|
| **General** | Theme, input behavior, toggles defaults, context warnings, log level, storage location |
| **Shortcuts** | Customize keyboard shortcuts (see [Keyboard Shortcuts](./keyboard-shortcuts)) |
| **Appearance** | Font size, UI density |
| **Notifications** | Sound alerts, text-to-speech settings |
| **AI Commands** | View and edit slash commands, [Spec-Kit](./speckit-commands), and [OpenSpec](./openspec-commands) prompts |

## Checking for Updates

Maestro checks for updates automatically on startup (configurable in Settings → General → **Check for updates on startup**).

**To manually check for updates:**
- **Quick Actions:** `Cmd+K` / `Ctrl+K` → "Check for Updates"
- **Menu:** Click the hamburger menu (☰) → "Check for Updates"

When an update is available, you'll see:
- Current version and new version number
- Release notes summary
- **Download** button to get the latest release from GitHub
- Option to enable/disable automatic update checks

### Pre-release Channel (Beta Opt-in)

By default, Maestro only notifies you about stable releases. If you want to try new features before they're officially released, you can opt into the pre-release channel.

**To enable beta updates:**
1. Open **Settings** (`Cmd+,` / `Ctrl+,`) → **General** tab
2. Toggle **Include beta and release candidate updates** on

**What changes:**
- Update checks will include pre-release versions (e.g., `v0.11.1-rc`, `v0.12.0-beta`)
- You'll receive notifications for beta, release candidate (rc), and alpha releases
- The Update dialog will show all available pre-release versions

**Pre-release version types:**
| Suffix | Description |
|--------|-------------|
| `-alpha` | Early development, may be unstable |
| `-beta` | Feature-complete but still testing |
| `-rc` | Release candidate, nearly ready for stable |
| `-dev` | Development builds |
| `-canary` | Cutting-edge nightly builds |

**Reverting to stable:** Toggle the setting off and download the latest stable release from GitHub. Pre-releases won't auto-downgrade to stable versions.

<Warning>
Pre-release versions may contain experimental features and bugs. Use at your own risk. If you encounter issues, you can always download the latest stable release from [GitHub Releases](https://github.com/pedramamini/maestro/releases).
</Warning>

## Notifications & Sound

Configure audio and visual notifications in **Settings** (`Cmd+,` / `Ctrl+,`) → **Notifications** tab.

### OS Notifications

Enable desktop notifications to be alerted when:
- An AI task completes
- A long-running command finishes
- The agent requires attention

**To enable:**
1. Toggle **Enable OS Notifications** on
2. Click **Test Notification** to verify it works

### Audio Feedback (Text-to-Speech)

Maestro can speak a brief summary when AI tasks complete using your system's text-to-speech.

**To configure:**
1. Toggle **Enable Audio Feedback** on
2. Set the **TTS Command** — the command that accepts text via stdin:
   - **macOS:** `say` (built-in)
   - **Linux:** `espeak` or `festival --tts`
   - **Windows:** Use a PowerShell script or third-party TTS tool
3. Click **Test** to hear a sample message
4. Click **Stop** to interrupt a running test

**Piped commands:** You can pipe through multiple commands, e.g., `cmd1 | cmd2`.

### Toast Notifications

In-app toast notifications appear in the corner when events occur. Configure how long they stay visible:

| Duration | Behavior |
|----------|----------|
| **Off** | Toasts are disabled entirely |
| **5s / 10s / 20s / 30s** | Toast disappears after the specified time |
| **Never** | Toast stays until manually dismissed |

### When Notifications Trigger

Notifications are sent when:
- An AI task completes (OS notification + optional TTS)
- A long-running command finishes (OS notification)
- The LLM analysis generates a feedback synopsis (TTS only, if configured)

## Storage Location

Settings are stored in:

- **macOS**: `~/Library/Application Support/maestro/`
- **Windows**: `%APPDATA%/maestro/`
- **Linux**: `~/.config/maestro/`

## Cross-Device Sync (Beta)

Maestro can sync settings, sessions, and groups across multiple devices by storing them in a cloud-synced folder like iCloud Drive, Dropbox, or OneDrive.

**Setup:**

1. Open **Settings** (`Cmd+,` / `Ctrl+,`) → **General** tab
2. Scroll to **Storage Location**
3. Click **Choose Folder...** and select a synced folder:
   - **iCloud Drive**: `~/Library/Mobile Documents/com~apple~CloudDocs/Maestro`
   - **Dropbox**: `~/Dropbox/Maestro`
   - **OneDrive**: `~/OneDrive/Maestro`
4. Maestro will migrate your existing settings to the new location
5. Restart Maestro for changes to take effect
6. Repeat on your other devices, selecting the same synced folder

**What syncs:**
- Settings and preferences
- Session configurations
- Groups and organization
- Agent configurations
- Session origins and metadata

**What stays local:**
- Window size and position (device-specific)
- The bootstrap file that points to your sync location

**Important limitations:**
- **Single-device usage**: Only run Maestro on one device at a time. Running simultaneously on multiple devices can cause sync conflicts where the last write wins.
- **No conflict resolution**: If settings are modified on two devices before syncing completes, one set of changes will be lost.
- **Restart required**: Changes to storage location require an app restart to take effect.

To reset to the default location, click **Use Default** in the Storage Location settings.

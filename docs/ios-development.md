---
title: iOS Development Tools
description: Capture screenshots, logs, and crash data from iOS simulators to close the feedback loop.
icon: mobile
---

Maestro includes built-in iOS development tools that allow AI agents to "see" what's happening in iOS simulators. This closes the feedback loop between code changes and their visual/behavioral results.

## Overview

The iOS tools provide:

- **Screenshot capture** - Instant snapshots of simulator screens
- **System log collection** - Recent logs filtered by time and app bundle ID
- **Crash detection** - Automatic identification of crash logs
- **Organized artifacts** - All data stored in a structured directory for analysis

These tools work with any booted iOS Simulator and require Xcode to be installed.

## The `/ios.snapshot` Command

Capture the current state of an iOS simulator with a single command:

```
/ios.snapshot
```

This captures:
1. A screenshot of the simulator screen
2. Recent system logs (last 60 seconds by default)
3. Any crash logs that occurred

### Command Options

| Option | Short | Description |
|--------|-------|-------------|
| `--simulator <name\|udid>` | `-s` | Target simulator by name or UDID (default: first booted) |
| `--app <bundleId>` | `-a` | Filter logs to a specific app |
| `--duration <seconds>` | `-d` | Seconds of logs to capture (default: 60) |
| `--include-crash` | | Include full crash log content |
| `--output <path>` | `-o` | Custom output directory |

### Examples

**Basic snapshot** - Uses the first booted simulator:
```
/ios.snapshot
```

**Target a specific simulator**:
```
/ios.snapshot --simulator "iPhone 15 Pro"
```

**Filter logs to your app**:
```
/ios.snapshot --app com.example.myapp
```

**Capture more log history**:
```
/ios.snapshot -d 300
```

**Combined options**:
```
/ios.snapshot -s "iPhone 15" -a com.example.app -d 120 --include-crash
```

### Agent Output

When you run `/ios.snapshot`, the AI agent receives a structured summary:

```markdown
## iOS Snapshot Captured

**Timestamp**: 2024-01-15T10:30:00
**Simulator**: iPhone 15 Pro (iOS 17.2)
**App**: com.example.myapp

### Screenshot
Saved to: ~/Library/Application Support/Maestro/ios-artifacts/{session}/screenshot.png

### System Log Summary
- Total entries: 245
- Errors: 3
- Faults: 0
- Warnings: 12
- Last error: "Failed to load resource at..."

### Crash Logs
No crash logs found

### Artifacts
All artifacts saved to: ~/Library/Application Support/Maestro/ios-artifacts/{session}/{snapshot}/
```

This structured output enables the AI to:
- Identify errors and warnings in logs
- Detect crashes and analyze stack traces
- Reference the screenshot path for image analysis
- Track the artifact directory for follow-up queries

## Auto Run Integration

Use `ios.snapshot` in playbook YAML files for automated iOS testing workflows:

```yaml
name: iOS Debug Workflow
steps:
  - action: ios.snapshot
    simulator: "iPhone 15 Pro"
    app: com.example.myapp
    duration: 120
    include_crash: true
    store_as: snapshot_result

  - action: message
    content: |
      Analyze the iOS snapshot:
      - Screenshot: {{snapshot_result.screenshotPath}}
      - Logs: {{snapshot_result.logsPath}}
      - Errors found: {{snapshot_result.summary.errorCount}}
      - Crashes: {{snapshot_result.hasCrashes}}
```

### Action Inputs

| Input | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `simulator` | string | No | First booted | Simulator name or UDID |
| `app` | string | No | - | Bundle ID to filter logs |
| `duration` | number | No | 60 | Seconds of log history |
| `include_crash` | boolean | No | false | Include full crash content |

### Action Outputs

When using `store_as`, the following fields are available:

| Output | Type | Description |
|--------|------|-------------|
| `screenshotPath` | string | Path to captured screenshot |
| `logsPath` | string | Path to logs JSON file |
| `hasCrashes` | boolean | Whether crashes were found |
| `crashPaths` | array | Paths to crash log files |
| `artifactDir` | string | Directory with all artifacts |
| `summary.errorCount` | number | Count of error-level logs |
| `summary.faultCount` | number | Count of fault-level logs |
| `summary.warningCount` | number | Count of warning-level logs |
| `simulator.name` | string | Simulator device name |
| `simulator.iosVersion` | string | iOS version string |

## Artifact Directory Structure

All iOS artifacts are stored in a structured directory:

```
~/Library/Application Support/Maestro/ios-artifacts/
└── {sessionId}/
    ├── snapshot-20240115-103000-123/
    │   ├── screenshot.png
    │   ├── logs.json
    │   └── metadata.json
    ├── snapshot-20240115-103500-456/
    │   ├── screenshot.png
    │   ├── logs.json
    │   ├── crash-0.log
    │   └── metadata.json
    └── ...
```

### Files

| File | Description |
|------|-------------|
| `screenshot.png` | Simulator screen capture |
| `logs.json` | Array of log entries with timestamp, level, message, process, subsystem |
| `crash-N.log` | Crash reports (when `--include-crash` is used) |
| `metadata.json` | Snapshot metadata (timestamp, simulator info, counts) |

### Log Entry Format

Each entry in `logs.json`:

```json
{
  "timestamp": "2024-01-15T10:30:00.123Z",
  "level": "error",
  "message": "Failed to load resource",
  "process": "MyApp",
  "pid": 12345,
  "subsystem": "com.example.myapp.network",
  "category": "URLSession"
}
```

Log levels: `error`, `fault`, `warning`, `info`, `debug`, `default`

### Artifact Retention

By default, Maestro keeps the 50 most recent snapshots per session. Older artifacts are automatically pruned to manage disk space.

## UI Panel (iOS Sessions)

For sessions working with iOS projects, the Right Bar includes an **iOS** tab that provides:

- **Screenshot viewer** - Display captured screenshot with zoom
- **Log viewer** - Filterable, searchable log display
  - Filter by log level (error, fault, warning, info, debug)
  - Full-text search with `Cmd+F`
  - Expandable entries with full details
- **Crash alerts** - Highlighted crash log section
- **History dropdown** - Browse previous snapshots

The iOS tab appears when enabled for a session and provides a visual interface to the same data available via the slash command.

## Requirements

- **macOS only** - iOS Simulator requires macOS
- **Xcode installed** - Required for `xcrun simctl` commands
- **Booted simulator** - At least one simulator must be running

Check if a simulator is booted:
```bash
xcrun simctl list devices booted
```

Start a simulator:
```bash
xcrun simctl boot "iPhone 15 Pro"
```

## Troubleshooting

### "No simulator booted" Error

Ensure at least one simulator is running:
```bash
# List booted simulators
xcrun simctl list devices booted

# Boot a simulator if none running
xcrun simctl boot "iPhone 15 Pro"

# Or open Simulator app
open -a Simulator
```

### "Simulator not found" Error

The simulator name must match exactly (case-insensitive). List available simulators:
```bash
xcrun simctl list devices available
```

### Screenshot Timeout

If the simulator is frozen or unresponsive:
1. Quit and restart Simulator.app
2. Erase simulator content: `xcrun simctl erase "iPhone 15 Pro"`
3. Try a different simulator

### Permission Errors

Ensure Maestro has access to the artifacts directory:
```bash
ls -la ~/Library/Application\ Support/Maestro/ios-artifacts/
```

### Missing Logs

If no logs appear:
- Increase `--duration` to capture more history
- Remove `--app` filter to see all logs
- Ensure the app is actually running in the simulator

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

## The `/ios.run_flow` Command

Execute Maestro Mobile test flows on iOS simulators. This command runs YAML-based UI automation flows using the [Maestro Mobile CLI](https://maestro.mobile.dev/).

```
/ios.run_flow <path>
/ios.run_flow --inline "tap:Login" "type:password123"
```

### Prerequisites

Install Maestro Mobile CLI before using this command:

```bash
# Option 1: Homebrew (recommended)
brew tap mobile-dev-inc/tap && brew install maestro

# Option 2: Direct installation
curl -Ls "https://get.maestro.mobile.dev" | bash
```

Verify installation:
```bash
maestro --version
```

### Command Options

| Option | Short | Description |
|--------|-------|-------------|
| `--simulator <name\|udid>` | `-s` | Target simulator by name or UDID (default: first booted) |
| `--app <bundleId>` | `-a` | App bundle ID to target |
| `--timeout <seconds>` | `-t` | Maximum execution time in seconds (default: 300) |
| `--screenshot-dir <path>` | | Output directory for screenshots |
| `--inline` | | Run inline action strings instead of a file |
| `--retry <count>` | | Number of retry attempts on failure (default: 1) |
| `--continue` | | Continue on error (don't stop at first failure) |
| `--debug` | | Enable debug mode with verbose output |

### Examples

**Run a flow file**:
```
/ios.run_flow login_flow.yaml
```

**Target a specific simulator**:
```
/ios.run_flow flows/signup.yaml --simulator "iPhone 15 Pro"
```

**Specify app and timeout**:
```
/ios.run_flow test.yaml --app com.example.myapp --timeout 60
```

**Retry on failure**:
```
/ios.run_flow flow.yaml --retry 3
```

**Run inline steps**:
```
/ios.run_flow --inline "tap:Login" "type:password123" "tap:Submit"
```

**Combined options**:
```
/ios.run_flow flow.yaml -s "iPhone 15" -a com.example.app --debug
```

### Agent Output

When you run `/ios.run_flow`, the AI agent receives a structured summary:

```markdown
## ✓ Flow Execution PASSED

| Metric | Value |
|--------|-------|
| Status | PASSED |
| Duration | 12.5s |
| Steps Passed | 8/8 |

### Steps

- ✓ Launch app (2100ms)
- ✓ Tap on "Login" (450ms)
- ✓ Input text (120ms)
- ✓ Tap on "Submit" (380ms)
- ✓ Assert visible "Welcome" (250ms)
- ✓ Take screenshot (180ms)
- ✓ Scroll down (320ms)
- ✓ Tap on "Settings" (400ms)

### Artifacts

- Report: `~/Library/Application Support/Maestro/ios-artifacts/{session}/report.html`
```

For failed flows, the output includes:
- Error message with details
- Failure screenshot path
- Step-by-step results showing which step failed
- Troubleshooting suggestions

### Maestro Mobile YAML Format

Flow files use Maestro Mobile's YAML syntax. This section provides a comprehensive reference of all supported actions and configuration options.

#### Flow Structure

A Maestro flow file consists of an optional configuration header followed by a list of steps:

```yaml
# Configuration (optional)
appId: com.example.myapp
name: My Flow Name
tags:
  - smoke
  - regression
env:
  USERNAME: testuser
  PASSWORD: secret123
---
# Steps (required)
- launchApp
- tapOn: "Login"
- inputText: "${USERNAME}"
```

| Config Option | Description |
|---------------|-------------|
| `appId` | Bundle ID of the app to target |
| `name` | Human-readable flow name |
| `tags` | Array of tags for filtering flows |
| `env` | Environment variables accessible as `${VAR_NAME}` |

#### Tap Actions

```yaml
# Tap on element by text
- tapOn: "Login"

# Tap on element by accessibility ID
- tapOn:
    id: "login_button"

# Tap at specific coordinates
- tapOn:
    point: "150,300"

# Tap with partial text match
- tapOn:
    containsText: "Log"

# Tap on nth element when multiple matches exist
- tapOn:
    text: "Item"
    index: 0  # 0-based index

# Tap without waiting for element to settle
- tapOn:
    text: "Button"
    waitToSettle: false

# Double tap
- doubleTapOn: "Image"

# Long press
- longPressOn: "Delete"
```

#### Text Input Actions

```yaml
# Input text (into focused element)
- inputText: "hello@example.com"

# Erase all text from focused field
- eraseText

# Erase specific number of characters
- eraseText: 10

# Hide keyboard
- hideKeyboard

# Copy text from element
- copyTextFrom: "Username"
- copyTextFrom:
    id: "username_label"
```

#### Scrolling and Swiping

```yaml
# Scroll in direction
- scroll:
    direction: DOWN  # UP, DOWN, LEFT, RIGHT

# Scroll within a specific element
- scroll:
    elementId: "scroll_view"
    direction: DOWN

# Scroll until element visible
- scrollUntilVisible:
    element:
      text: "Terms of Service"
    direction: DOWN

# Scroll until element with ID visible
- scrollUntilVisible:
    element:
      id: "footer"
    direction: DOWN

# Swipe gesture with start/end points
- swipe:
    start: "50%, 80%"
    end: "50%, 20%"
    duration: 500  # milliseconds
```

#### Assertions and Waiting

```yaml
# Assert element is visible
- assertVisible: "Welcome"

# Assert by ID
- assertVisible:
    id: "welcome_message"

# Assert with partial text match
- assertVisible:
    containsText: "Welc"

# Assert with timeout
- assertVisible:
    text: "Loading Complete"
    timeout: 15000  # milliseconds

# Assert element is NOT visible
- assertNotVisible: "Loading..."

# Assert by ID not visible
- assertNotVisible:
    id: "error_message"

# Wait for element (with timeout)
- extendedWaitUntil:
    visible:
      text: "Dashboard"
    timeout: 10000

# Wait for element by ID
- extendedWaitUntil:
    visible:
      id: "main_content"
    timeout: 10000

# Wait for animation to complete
- waitForAnimationToEnd:
    timeout: 5000
```

#### App Control

```yaml
# Launch app (uses appId from config)
- launchApp

# Launch specific app with options
- launchApp:
    appId: "com.example.myapp"
    clearState: true      # Reset app data
    clearKeychain: true   # Clear keychain entries
    stopApp: true         # Stop if running first

# Stop current app
- stopApp

# Stop specific app
- stopApp: "com.example.myapp"

# Open deep link or URL
- openLink: "myapp://settings"
- openLink: "https://example.com/login"
```

#### Screenshots and Utility

```yaml
# Take screenshot (auto-named)
- takeScreenshot

# Take named screenshot
- takeScreenshot: "login_page"

# Press hardware keys
- pressKey: home
- pressKey: back
- pressKey: enter
- pressKey: backspace
- pressKey: volume_up
- pressKey: volume_down

# Wait (in milliseconds)
- wait: 2000
```

#### Complete Flow Example

```yaml
appId: com.example.myapp
name: Login Flow
tags:
  - auth
  - smoke
env:
  TEST_EMAIL: test@example.com
  TEST_PASSWORD: password123
---
# Launch the app fresh
- launchApp:
    clearState: true

# Wait for login screen
- assertVisible: "Sign In"

# Enter credentials
- tapOn:
    id: "email_field"
- inputText: "${TEST_EMAIL}"
- tapOn:
    id: "password_field"
- inputText: "${TEST_PASSWORD}"

# Submit
- tapOn: "Sign In"

# Wait for dashboard
- extendedWaitUntil:
    visible:
      text: "Welcome"
    timeout: 10000

# Verify success and capture
- assertVisible: "Welcome"
- takeScreenshot: "login_success"
```

### Inline Action Shortcuts

When using `--inline`, these shorthand formats are supported:

| Shorthand | Description | Example |
|-----------|-------------|---------|
| `tap:<text>` | Tap element by text | `tap:Login` |
| `tapid:<id>` | Tap element by accessibility ID | `tapid:login_button` |
| `type:<text>` | Input text | `type:hello@example.com` |
| `scroll:<dir>` | Scroll direction | `scroll:down` |
| `screenshot` | Take screenshot | `screenshot` |
| `screenshot:<name>` | Named screenshot | `screenshot:login` |
| `visible:<text>` | Assert visible | `visible:Welcome` |
| `notvisible:<text>` | Assert not visible | `notvisible:Error` |
| `wait:<ms>` | Wait duration | `wait:2000` |
| `waitfor:<text>` | Wait for element | `waitfor:Dashboard` |
| `press:<key>` | Press key | `press:home` |
| `open:<url>` | Open URL | `open:myapp://home` |
| `launchapp` | Launch app | `launchapp` |
| `launchapp:<id>` | Launch specific app | `launchapp:com.example.app` |
| `stopapp` | Stop app | `stopapp` |
| `hidekeyboard` | Hide keyboard | `hidekeyboard` |
| `erasetext` | Erase text | `erasetext` |

**Example inline flow**:
```
/ios.run_flow --inline "launchapp:com.example.app" "waitfor:Login" "tap:Login" "type:user@example.com" "tap:Submit" "visible:Welcome" "screenshot:success"
```

### Auto Run Integration

Use `ios.run_flow` in playbook YAML files:

```yaml
name: iOS Login Test
steps:
  - action: ios.run_flow
    inputs:
      flow: flows/login_flow.yaml
      app: com.example.myapp
      simulator: "iPhone 15 Pro"
      timeout: 120
      retry: 2
    store_as: flow_result

  - action: assert
    inputs:
      condition: "{{ variables.flow_result.passed }}"
      message: "Login flow should pass"

  - action: message
    content: |
      Flow completed in {{flow_result.durationSeconds}}s
      Steps: {{flow_result.passedSteps}}/{{flow_result.totalSteps}}
```

### Action Inputs for Auto Run

| Input | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `flow` | string | Yes | - | Path to flow YAML file |
| `app` | string | No | - | Bundle ID to target |
| `simulator` | string | No | First booted | Simulator name or UDID |
| `timeout` | number | No | 300 | Timeout in seconds |
| `retry` | number | No | 1 | Retry attempts |
| `continue_on_error` | boolean | No | false | Continue past failures |
| `env` | object | No | - | Environment variables |

### Action Outputs for Auto Run

When using `store_as`, these fields are available:

| Output | Type | Description |
|--------|------|-------------|
| `passed` | boolean | Whether flow passed |
| `duration` | number | Duration in milliseconds |
| `durationSeconds` | string | Duration as string (e.g., "12.5") |
| `totalSteps` | number | Total steps in flow |
| `passedSteps` | number | Number of passed steps |
| `failedSteps` | number | Number of failed steps |
| `error` | string | Error message if failed |
| `failureScreenshotPath` | string | Path to failure screenshot |
| `reportPath` | string | Path to HTML report |

### Troubleshooting

#### "Maestro CLI not installed" Error

Install Maestro Mobile CLI:
```bash
brew tap mobile-dev-inc/tap && brew install maestro
```

Or:
```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
```

#### "No simulator booted" Error

Ensure a simulator is running:
```bash
xcrun simctl list devices booted
xcrun simctl boot "iPhone 15 Pro"
```

#### Flow Validation Errors

Validate your YAML syntax:
```bash
maestro validate path/to/flow.yaml
```

#### Element Not Found

- Check element accessibility IDs using Xcode Accessibility Inspector
- Use `/ios.snapshot` to capture current UI state
- Try using `containsText` for partial matches:
  ```yaml
  - tapOn:
      containsText: "Log"
  ```

#### Timeout Errors

- Increase `--timeout` value
- Add explicit waits before actions:
  ```yaml
  - extendedWaitUntil:
      visible:
        text: "Login"
      timeout: 15000
  ```

#### Flaky Tests

- Use `--retry` to automatically retry on failure
- Add `wait` steps between rapid actions
- Use `waitForAnimationToEnd` before assertions

## Primitive Interaction Commands

For direct UI interactions without YAML flow files, Maestro provides primitive commands that tap, type, scroll, and swipe on iOS simulator elements. These commands use the native XCUITest driver internally.

<Note>
The native XCUITest driver is not yet fully implemented. While these commands are available, they currently return "not yet implemented". For production use, prefer Maestro Mobile flows via `/ios.run_flow`.
</Note>

### The `/ios.tap` Command

Tap an element on the iOS simulator by accessibility identifier, label, or coordinates.

```
/ios.tap <target> --app <bundleId>
```

#### Target Formats

| Format | Description | Example |
|--------|-------------|---------|
| `#identifier` | Tap by accessibility ID | `/ios.tap #login_button --app com.example.app` |
| `"label text"` | Tap by accessibility label | `/ios.tap "Sign In" --app com.example.app` |
| `x,y` | Tap at screen coordinates | `/ios.tap 100,200 --app com.example.app` |

#### Command Options

| Option | Short | Description |
|--------|-------|-------------|
| `--app <bundleId>` | `-a` | App bundle ID (required) |
| `--simulator <name\|udid>` | `-s` | Target simulator (default: first booted) |
| `--double` | | Perform double tap instead of single tap |
| `--long [seconds]` | | Perform long press (default: 1.0 seconds) |
| `--offset <x,y>` | | Offset from element center for tap |
| `--timeout <ms>` | | Element wait timeout (default: 10000) |
| `--debug` | | Enable debug output |

#### Examples

**Tap by accessibility identifier**:
```
/ios.tap #submit_button --app com.example.app
```

**Tap by label**:
```
/ios.tap "Continue" -a com.example.app
```

**Tap at coordinates**:
```
/ios.tap 150,300 --app com.example.app
```

**Double tap**:
```
/ios.tap #image_view --double --app com.example.app
```

**Long press for 2 seconds**:
```
/ios.tap #delete_button --long 2 --app com.example.app
```

**Tap with offset from element center**:
```
/ios.tap #cell --offset 10,-5 --app com.example.app
```

### The `/ios.type` Command

Type text into the focused element or a specific text field.

```
/ios.type "text" --app <bundleId>
/ios.type --into <target> "text" --app <bundleId>
```

#### Target Formats (for --into)

| Format | Description | Example |
|--------|-------------|---------|
| `#identifier` | Type into element by accessibility ID | `--into #email_field` |
| `"label text"` | Type into element by label | `--into "Email"` |

#### Command Options

| Option | Short | Description |
|--------|-------|-------------|
| `--app <bundleId>` | `-a` | App bundle ID (required) |
| `--into <target>` | `-i` | Target element to type into (default: focused element) |
| `--simulator <name\|udid>` | `-s` | Target simulator (default: first booted) |
| `--clear` | `-c` | Clear existing text before typing |
| `--timeout <ms>` | | Element wait timeout (default: 10000) |
| `--debug` | | Enable debug output |

#### Examples

**Type into focused element**:
```
/ios.type "hello world" --app com.example.app
```

**Type into specific field by ID**:
```
/ios.type --into #email_field "user@example.com" --app com.example.app
```

**Type into field by label**:
```
/ios.type -i "Password" "secret123" -a com.example.app
```

**Clear field before typing**:
```
/ios.type --into #search_field "new query" --clear --app com.example.app
```

### The `/ios.scroll` Command

Scroll in a direction or scroll until an element is visible.

```
/ios.scroll <direction> --app <bundleId>
/ios.scroll --to <target> --app <bundleId>
```

#### Directions

| Direction | Aliases | Description |
|-----------|---------|-------------|
| `up` | `u` | Scroll up |
| `down` | `d` | Scroll down |
| `left` | `l` | Scroll left |
| `right` | `r` | Scroll right |

#### Target Formats (for --to)

| Format | Description | Example |
|--------|-------------|---------|
| `#identifier` | Scroll to element by accessibility ID | `--to #footer` |
| `"label text"` | Scroll to element by label | `--to "Terms of Service"` |

#### Command Options

| Option | Short | Description |
|--------|-------|-------------|
| `--app <bundleId>` | `-a` | App bundle ID (required) |
| `--to <target>` | `-t` | Target element to scroll to |
| `--simulator <name\|udid>` | `-s` | Target simulator (default: first booted) |
| `--distance <n>` | | Scroll distance as fraction (0.0-1.0, default: 0.5) |
| `--attempts <n>` | | Max scroll attempts when targeting element (default: 10) |
| `--in <target>` | | Scroll within a specific container element |
| `--timeout <ms>` | | Element wait timeout (default: 10000) |
| `--debug` | | Enable debug output |

#### Examples

**Scroll down**:
```
/ios.scroll down --app com.example.app
```

**Scroll with custom distance**:
```
/ios.scroll up --distance 0.8 --app com.example.app
```

**Scroll to specific element**:
```
/ios.scroll --to #footer_element --app com.example.app
```

**Scroll to element by label**:
```
/ios.scroll --to "Privacy Policy" -a com.example.app
```

**Scroll within a container**:
```
/ios.scroll down --in #scroll_view --app com.example.app
```

**Scroll to element with more attempts**:
```
/ios.scroll --to #end_of_list --attempts 20 --app com.example.app
```

### The `/ios.swipe` Command

Perform swipe gestures for navigation and UI interactions.

```
/ios.swipe <direction> --app <bundleId>
```

#### Directions

| Direction | Aliases | Common Use Cases |
|-----------|---------|-----------------|
| `up` | `u` | Dismiss modal, pull to refresh |
| `down` | `d` | Dismiss notification |
| `left` | `l` | Delete action, next page |
| `right` | `r` | Back navigation |

#### Command Options

| Option | Short | Description |
|--------|-------|-------------|
| `--app <bundleId>` | `-a` | App bundle ID (required) |
| `--simulator <name\|udid>` | `-s` | Target simulator (default: first booted) |
| `--velocity <v>` | `-v` | Swipe velocity: `slow`, `normal`, `fast` (default: normal) |
| `--from <target>` | | Start swipe from specific element |
| `--timeout <ms>` | | Element wait timeout (default: 10000) |
| `--debug` | | Enable debug output |

#### Target Formats (for --from)

| Format | Description | Example |
|--------|-------------|---------|
| `#identifier` | Swipe from element by accessibility ID | `--from #carousel` |
| `"label text"` | Swipe from element by label | `--from "Image Gallery"` |

#### Examples

**Swipe left (e.g., for delete action)**:
```
/ios.swipe left --app com.example.app
```

**Swipe right (e.g., for back navigation)**:
```
/ios.swipe right -a com.example.app
```

**Fast swipe up**:
```
/ios.swipe up --velocity fast --app com.example.app
```

**Swipe on a specific element**:
```
/ios.swipe left --from #carousel --app com.example.app
```

**Swipe from element by label**:
```
/ios.swipe right --from "Card View" -a com.example.app
```

### Auto Run Integration for Primitives

Use primitive commands in playbook YAML files:

```yaml
name: iOS Interaction Workflow
steps:
  - action: ios.tap
    inputs:
      target: "#login_button"
      app: com.example.myapp
    store_as: tap_result

  - action: ios.type
    inputs:
      into: "#email_field"
      text: "user@example.com"
      app: com.example.myapp
      clear: true

  - action: ios.type
    inputs:
      into: "#password_field"
      text: "password123"
      app: com.example.myapp

  - action: ios.tap
    inputs:
      target: "#submit_button"
      app: com.example.myapp

  - action: ios.scroll
    inputs:
      direction: down
      app: com.example.myapp
      distance: 0.5

  - action: ios.scroll
    inputs:
      to: "#footer_element"
      app: com.example.myapp
      attempts: 15

  - action: ios.swipe
    inputs:
      direction: left
      app: com.example.myapp
      velocity: fast
```

#### Action Inputs

**ios.tap**:

| Input | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `target` | string | Yes | - | Target element (#id, "label", or x,y) |
| `app` | string | Yes | - | Bundle ID |
| `simulator` | string | No | First booted | Simulator name or UDID |
| `double_tap` | boolean | No | false | Perform double tap |
| `long_press` | number | No | - | Long press duration in seconds |
| `offset` | object | No | - | Offset from center (`{x, y}`) |
| `timeout` | number | No | 10000 | Timeout in ms |

**ios.type**:

| Input | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `text` | string | Yes | - | Text to type |
| `into` | string | No | Focused | Target element (#id or "label") |
| `app` | string | Yes | - | Bundle ID |
| `simulator` | string | No | First booted | Simulator name or UDID |
| `clear` | boolean | No | false | Clear existing text first |
| `timeout` | number | No | 10000 | Timeout in ms |

**ios.scroll**:

| Input | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `direction` | string | No* | - | Scroll direction (up/down/left/right) |
| `to` | string | No* | - | Target element to scroll to |
| `app` | string | Yes | - | Bundle ID |
| `simulator` | string | No | First booted | Simulator name or UDID |
| `distance` | number | No | 0.5 | Scroll distance (0.0-1.0) |
| `attempts` | number | No | 10 | Max scroll attempts for --to |
| `in` | string | No | - | Container to scroll within |
| `timeout` | number | No | 10000 | Timeout in ms |

*Either `direction` or `to` is required.

**ios.swipe**:

| Input | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `direction` | string | Yes | - | Swipe direction (up/down/left/right) |
| `app` | string | Yes | - | Bundle ID |
| `simulator` | string | No | First booted | Simulator name or UDID |
| `velocity` | string | No | normal | Swipe velocity (slow/normal/fast) |
| `from` | string | No | - | Element to start swipe from |
| `timeout` | number | No | 10000 | Timeout in ms |

### Troubleshooting Primitives

#### Element Not Found

- Use `/ios.inspect` to view the current UI hierarchy
- Verify accessibility identifiers/labels match exactly (case-sensitive)
- Increase timeout if elements appear after animations: `--timeout 15000`
- Try alternate targeting (ID vs label)

#### Element Not Hittable

- Ensure element is visible on screen
- Check if element is obscured by another view
- Scroll to reveal the element first
- Verify element is enabled for interaction

#### Coordinator/Display Errors

- Ensure the simulator is in foreground
- Check that the app is running and responsive
- Try restarting the simulator

#### Using Maestro Mobile Instead

Until the native driver is fully implemented, use Maestro Mobile flows for reliable interactions:

```
# Instead of: /ios.tap #login_button --app com.example.app
/ios.run_flow --inline "tap:Login" --app com.example.app

# Instead of: /ios.type "hello" --app com.example.app
/ios.run_flow --inline "inputText:hello" --app com.example.app

# Instead of: /ios.scroll down --app com.example.app
/ios.run_flow --inline "scroll:down" --app com.example.app
```

## Native Driver Swift Integration

The primitive commands (`/ios.tap`, `/ios.type`, `/ios.scroll`, `/ios.swipe`) are powered by a native XCUITest driver that provides direct access to iOS UI testing APIs. This section documents the Swift integration architecture for developers extending or maintaining the native driver.

<Note>
The native driver is not yet fully implemented—execution currently returns "not yet implemented". The Swift code and TypeScript wrapper are complete and ready for when XCUITest project building is implemented. For production use, prefer Maestro Mobile flows via `/ios.run_flow`.
</Note>

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    TypeScript Layer                          │
│  src/main/ios-tools/native-driver.ts                        │
│  - NativeDriver class                                        │
│  - Target helpers (byId, byLabel, byCoordinates, etc.)      │
│  - Action helpers (tap, doubleTap, typeText, etc.)          │
└──────────────────────────┬──────────────────────────────────┘
                           │ JSON ActionRequest
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     Swift Layer                              │
│  src/main/ios-tools/xcuitest-driver/                        │
│  - ActionTypes.swift   - Action and target definitions       │
│  - ActionResult.swift  - Result serialization with markers   │
│  - ActionRunner.swift  - Main action executor                │
└──────────────────────────┬──────────────────────────────────┘
                           │ XCUITest APIs
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    iOS Simulator                             │
│  - XCUIApplication                                           │
│  - XCUIElement interactions                                  │
└─────────────────────────────────────────────────────────────┘
```

### Swift Components

The native driver consists of three Swift files in `src/main/ios-tools/xcuitest-driver/`:

#### ActionTypes.swift

Defines all action types and target specifications. Designed to be JSON-deserializable from TypeScript.

**Action Types:**

| Type | Description |
|------|-------------|
| `tap` | Single tap on element |
| `doubleTap` | Double tap on element |
| `longPress` | Long press with duration |
| `typeText` | Type text into element |
| `clearText` | Clear text from element |
| `scroll` | Scroll in direction |
| `scrollTo` | Scroll until element visible |
| `swipe` | Swipe gesture |
| `pinch` | Pinch gesture for zoom |
| `rotate` | Rotation gesture |
| `waitForElement` | Wait for element to exist |
| `waitForNotExist` | Wait for element to disappear |
| `assertExists` | Verify element exists |
| `assertNotExists` | Verify element does not exist |
| `assertEnabled` | Verify element is enabled |
| `assertDisabled` | Verify element is disabled |

**Target Types:**

| Type | Description | Example Value |
|------|-------------|---------------|
| `identifier` | Accessibility identifier | `"login_button"` |
| `label` | Accessibility label | `"Sign In"` |
| `text` | Text content (label or value) | `"Welcome"` |
| `predicate` | NSPredicate format | `"label BEGINSWITH 'Sign'"` |
| `coordinates` | Screen coordinates | `"150,300"` |
| `type` | Element type with optional index | `"button"` |

**Direction and Velocity:**

```swift
enum SwipeDirection: String, Codable {
    case up, down, left, right
}

enum SwipeVelocity: String, Codable {
    case slow    // XCUIGestureVelocity.slow
    case normal  // XCUIGestureVelocity.default
    case fast    // XCUIGestureVelocity.fast
}
```

#### ActionResult.swift

Handles result serialization with JSON markers for extraction from mixed stdout output.

**Output Markers:**

```swift
// Results are wrapped with markers for extraction
===MAESTRO_ACTION_RESULT_START===
{ "success": true, "status": "success", ... }
===MAESTRO_ACTION_RESULT_END===
```

**Status Codes:**

| Status | Description |
|--------|-------------|
| `success` | Action completed successfully |
| `failed` | Action failed (generic) |
| `timeout` | Element wait timed out |
| `notFound` | Element not found |
| `notHittable` | Element found but not tappable |
| `notEnabled` | Element is disabled |
| `error` | Unexpected error |

**Result Structure:**

```json
{
  "success": true,
  "status": "success",
  "actionType": "tap",
  "duration": 245,
  "timestamp": "2024-01-15T10:30:00Z",
  "details": {
    "element": {
      "type": "button",
      "identifier": "login_button",
      "label": "Sign In",
      "frame": { "x": 100, "y": 200, "width": 80, "height": 44 },
      "isEnabled": true,
      "isHittable": true
    }
  }
}
```

#### ActionRunner.swift

The main action executor that finds elements and performs interactions using XCUITest APIs.

**Key Methods:**

```swift
class ActionRunner {
    let app: XCUIApplication
    var defaultTimeout: TimeInterval = 10.0
    var screenshotOnFailure: Bool = true

    // Execute a single action
    func execute(_ request: ActionRequest) -> ActionResult

    // Execute multiple actions in sequence
    func executeAll(_ requests: [ActionRequest], stopOnFailure: Bool = true) -> BatchActionResult
}
```

**Element Finding:**

The `findElement` method supports all target types:

```swift
private func findElement(_ target: ActionTarget, timeout: TimeInterval? = nil) throws -> XCUIElement {
    switch target.type {
    case .identifier:
        // app.descendants(matching: .any).matching(identifier: "...")
    case .label:
        // NSPredicate(format: "label == %@", label)
    case .text:
        // NSPredicate(format: "label CONTAINS %@ OR value CONTAINS %@", ...)
    case .predicate:
        // NSPredicate(format: predicateString)
    case .coordinates:
        // app.windows.firstMatch + normalized coordinates
    case .type:
        // app.descendants(matching: xcType)
    }
}
```

**Error Handling with Suggestions:**

When an element is not found, the driver searches for similar elements to provide suggestions:

```swift
private func findSimilarElements(_ target: ActionTarget) -> [String] {
    // Searches buttons, text fields, static texts
    // Returns identifiers/labels containing the search term
    // Limited to 5 suggestions
}
```

### TypeScript API

The TypeScript wrapper in `src/main/ios-tools/native-driver.ts` provides a high-level API.

#### Target Helpers

```typescript
import { byId, byLabel, byText, byPredicate, byCoordinates, byType } from './native-driver';

// By accessibility identifier
const target1 = byId('login_button');

// By accessibility label
const target2 = byLabel('Sign In');

// By text content
const target3 = byText('Welcome');

// By NSPredicate
const target4 = byPredicate('label BEGINSWITH "Sign"');

// By screen coordinates
const target5 = byCoordinates(150, 300);

// By element type with optional index
const target6 = byType('button', 0);  // First button
```

#### Action Helpers

```typescript
import {
  tap, doubleTap, longPress,
  typeText, clearText,
  scroll, scrollTo, swipe,
  pinch, rotate,
  waitForElement, waitForNotExist,
  assertExists, assertNotExists, assertEnabled, assertDisabled
} from './native-driver';

// Tap actions
const tapAction = tap(byId('button'));
const tapWithOffset = tap(byId('cell'), { offsetX: 0.9, offsetY: 0.5 });
const doubleTapAction = doubleTap(byLabel('Image'));
const longPressAction = longPress(byId('delete'), 2.0);  // 2 seconds

// Text actions
const typeAction = typeText('hello@example.com');
const typeIntoAction = typeText('password', { target: byId('password_field'), clearFirst: true });
const clearAction = clearText(byId('search_field'));

// Scroll/swipe actions
const scrollAction = scroll('down', { distance: 0.5 });
const scrollToAction = scrollTo(byId('footer'), { maxAttempts: 15 });
const swipeAction = swipe('left', { velocity: 'fast' });

// Gesture actions
const pinchAction = pinch(2.0, { target: byId('image') });  // Zoom in
const rotateAction = rotate(Math.PI / 4);  // 45 degrees

// Wait actions
const waitAction = waitForElement(byId('loading'), 5000);
const waitGoneAction = waitForNotExist(byLabel('Spinner'), 10000);

// Assert actions
const assertAction = assertExists(byId('welcome_message'));
const assertGoneAction = assertNotExists(byId('error'));
const assertEnabledAction = assertEnabled(byId('submit_button'));
```

#### NativeDriver Class

```typescript
import { NativeDriver, createNativeDriver } from './native-driver';

// Create driver instance
const driver = createNativeDriver({
  bundleId: 'com.example.myapp',
  udid: 'SIMULATOR_UDID',  // Optional, auto-detects if omitted
  timeout: 10000,           // Default element timeout (ms)
  screenshotDir: '/path/to/screenshots',
  debug: true
});

// Initialize (verifies simulator, etc.)
await driver.initialize();

// Execute single action
const result = await driver.execute(tap(byId('login')));

// Execute batch of actions
const batchResult = await driver.executeAll([
  tap(byId('email_field')),
  typeText('user@example.com'),
  tap(byId('password_field')),
  typeText('password123'),
  tap(byId('login_button'))
], { stopOnFailure: true });

// Convenience methods
await driver.tapById('submit_button');
await driver.tapByLabel('Continue');
await driver.tapAt(150, 300);
await driver.type('hello world');
await driver.typeInto('search_field', 'query', true);  // clearFirst=true
await driver.scrollDown(0.5);
await driver.scrollUp(0.5);
await driver.scrollToId('footer_element', 15);  // maxAttempts=15
await driver.swipeDirection('left');
await driver.waitFor('loading_indicator', 5000);
await driver.waitForGone('spinner', 10000);
await driver.assertElementExists('welcome_message');
await driver.assertElementNotExists('error_banner');
```

### Result Types

```typescript
interface ActionResult {
  success: boolean;
  status: 'success' | 'failed' | 'timeout' | 'notFound' | 'notHittable' | 'notEnabled' | 'error';
  actionType: ActionType;
  duration: number;  // milliseconds
  error?: string;
  details?: {
    element?: ElementInfo;
    suggestions?: string[];  // Alternative targets on notFound
    typedText?: string;
    scrollAttempts?: number;
    direction?: string;
    screenshotPath?: string;
  };
  timestamp: string;  // ISO8601
}

interface BatchActionResult {
  allPassed: boolean;
  totalActions: number;
  passedActions: number;
  failedActions: number;
  totalDuration: number;
  results: ActionResult[];
  timestamp: string;
}
```

### Extending the Native Driver

To add a new action type:

1. **Swift: ActionTypes.swift**
   ```swift
   // Add to ActionType enum
   enum ActionType: String, Codable {
       // ... existing types
       case newAction
   }

   // Create action struct
   struct NewAction: Action, Codable {
       let actionType = ActionType.newAction
       let target: ActionTarget
       let customParam: String
   }

   // Add to ActionRequest if needed
   struct ActionRequest: Codable {
       // ... existing fields
       let customParam: String?
   }
   ```

2. **Swift: ActionRunner.swift**
   ```swift
   private func executeAction(_ request: ActionRequest) throws -> ActionResult {
       switch request.type {
       // ... existing cases
       case .newAction:
           return try executeNewAction(request, startTime: startTime)
       }
   }

   private func executeNewAction(_ request: ActionRequest, startTime: Date) throws -> ActionResult {
       // Implementation
   }
   ```

3. **TypeScript: native-driver.ts**
   ```typescript
   // Add to ActionType union
   export type ActionType = /* existing */ | 'newAction';

   // Add action helper
   export function newAction(target: ActionTarget, customParam: string): ActionRequest {
       return { type: 'newAction', target, customParam };
   }

   // Add convenience method to NativeDriver class
   async newActionById(identifier: string, customParam: string): Promise<IOSResult<ActionResult>> {
       return this.execute(newAction(byId(identifier), customParam));
   }
   ```

### Element Type Mappings

The Swift driver maps string element types to XCUIElement.ElementType:

| String | XCUIElement.ElementType |
|--------|------------------------|
| `button` | `.button` |
| `textField`, `text_field` | `.textField` |
| `secureTextField`, `password` | `.secureTextField` |
| `staticText`, `text` | `.staticText` |
| `image` | `.image` |
| `switch`, `toggle` | `.switch` |
| `slider` | `.slider` |
| `picker` | `.picker` |
| `datePicker`, `date_picker` | `.datePicker` |
| `table` | `.table` |
| `cell` | `.cell` |
| `collectionView` | `.collectionView` |
| `scrollView` | `.scrollView` |
| `navigationBar` | `.navigationBar` |
| `tabBar` | `.tabBar` |
| `toolbar` | `.toolbar` |
| `alert` | `.alert` |
| `sheet` | `.sheet` |
| `searchField` | `.searchField` |
| `textView` | `.textView` |
| `link` | `.link` |
| `menu` | `.menu` |
| `menuItem` | `.menuItem` |
| `webView` | `.webView` |
| `window` | `.window` |
| `any` | `.any` |

### Hardware Key Codes

For keyboard interactions:

| KeyCode | XCUIKeyboardKey |
|---------|-----------------|
| `return` | `.return` |
| `delete` | `.delete` |
| `escape` | `.escape` |
| `tab` | `.tab` |
| `space` | `.space` |
| `up` | `.upArrow` |
| `down` | `.downArrow` |
| `left` | `.leftArrow` |
| `right` | `.rightArrow` |
| `home` | `.home` |
| `end` | `.end` |
| `pageUp` | `.pageUp` |
| `pageDown` | `.pageDown` |

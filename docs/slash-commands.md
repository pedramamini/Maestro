---
title: Slash Commands
description: Create custom slash commands with template variables for your AI workflows.
icon: terminal
---

Maestro includes an extensible slash command system with autocomplete. Type `/` in the input area to open the autocomplete menu, use arrow keys to navigate, and press `Tab` or `Enter` to select.

## Custom AI Commands

Create your own slash commands in **Settings > Custom AI Commands**. Each command has a trigger (e.g., `/deploy`) and a prompt that gets sent to the AI agent.

Commands support **template variables** that are automatically substituted at runtime:

### Agent Variables

| Variable | Description |
|----------|-------------|
| `{{AGENT_NAME}}` | Agent name |
| `{{AGENT_PATH}}` | Agent home directory path (full path to project) |
| `{{AGENT_GROUP}}` | Agent's group name (if grouped) |
| `{{AGENT_SESSION_ID}}` | Agent session ID (for conversation continuity) |
| `{{TAB_NAME}}` | Custom tab name (alias: `SESSION_NAME`) |
| `{{TOOL_TYPE}}` | Agent type (claude-code, codex, opencode) |

### Path Variables

| Variable | Description |
|----------|-------------|
| `{{CWD}}` | Current working directory |
| `{{AUTORUN_FOLDER}}` | Auto Run documents folder path |

### Auto Run Variables

| Variable | Description |
|----------|-------------|
| `{{DOCUMENT_NAME}}` | Current Auto Run document name (without .md) |
| `{{DOCUMENT_PATH}}` | Full path to current Auto Run document |
| `{{LOOP_NUMBER}}` | Current loop iteration (starts at 1) |

### Date/Time Variables

| Variable | Description |
|----------|-------------|
| `{{DATE}}` | Current date (YYYY-MM-DD) |
| `{{TIME}}` | Current time (HH:MM:SS) |
| `{{DATETIME}}` | Full datetime (YYYY-MM-DD HH:MM:SS) |
| `{{TIMESTAMP}}` | Unix timestamp in milliseconds |
| `{{DATE_SHORT}}` | Short date (MM/DD/YY) |
| `{{TIME_SHORT}}` | Short time (HH:MM) |
| `{{YEAR}}` | Current year (YYYY) |
| `{{MONTH}}` | Current month (01-12) |
| `{{DAY}}` | Current day (01-31) |
| `{{WEEKDAY}}` | Day of week (Monday, Tuesday, etc.) |

### Git & Context Variables

| Variable | Description |
|----------|-------------|
| `{{GIT_BRANCH}}` | Current git branch name (requires git repo) |
| `{{IS_GIT_REPO}}` | "true" or "false" |
| `{{CONTEXT_USAGE}}` | Current context window usage percentage |

**Example**: A custom `/standup` command with prompt:

```
It's {{WEEKDAY}}, {{DATE}}. I'm on branch {{GIT_BRANCH}} at {{AGENT_PATH}}.
Summarize what I worked on yesterday and suggest priorities for today.
```

## Spec-Kit Commands

Maestro bundles [GitHub's spec-kit](https://github.com/github/spec-kit) methodology for structured feature development. Commands include `/speckit.constitution`, `/speckit.specify`, `/speckit.clarify`, `/speckit.plan`, `/speckit.tasks`, and `/speckit.implement`.

See [Spec-Kit Commands](/speckit-commands) for the complete workflow guide.

## OpenSpec Commands

Maestro bundles [OpenSpec](https://github.com/Fission-AI/OpenSpec) for spec-driven change management. These commands help you propose, implement, and archive changes systematically:

| Command | Description |
|---------|-------------|
| `/openspec.proposal` | Create a change proposal with spec deltas before writing code |
| `/openspec.apply` | Implement an approved proposal by following the tasks |
| `/openspec.archive` | Archive completed changes after deployment |
| `/openspec.implement` | Generate Auto Run documents from a proposal (Maestro-specific) |
| `/openspec.help` | Get help with OpenSpec workflow and concepts |

See [OpenSpec Commands](/openspec-commands) for the complete workflow guide and directory structure.

## iOS Development Commands

For iOS development workflows, Maestro provides commands to capture simulator state and automate UI interactions:

| Command | Description |
|---------|-------------|
| `/ios.snapshot` | Capture screenshot, logs, and crash data from iOS simulator |
| `/ios.run_flow` | Run Maestro Mobile YAML test flows on iOS simulator |

### `/ios.run_flow` Options

```
/ios.run_flow <path> [--simulator <name|udid>] [--app <bundleId>] [--timeout <seconds>]
/ios.run_flow --inline "tap:Login" "type:password" "tap:Submit"
```

| Option | Short | Description |
|--------|-------|-------------|
| `--simulator` | `-s` | Target simulator by name or UDID |
| `--app` | `-a` | Target app bundle ID |
| `--timeout` | `-t` | Max execution time in seconds (default: 300) |
| `--inline` | | Run inline action strings instead of file |
| `--retry` | | Number of retry attempts on failure |
| `--continue` | | Continue on error |
| `--debug` | | Enable verbose output |

**Examples**:
```
/ios.run_flow login_flow.yaml
/ios.run_flow flows/test.yaml --simulator "iPhone 15 Pro" --app com.example.app
/ios.run_flow --inline "tap:Login" "type:password123" "tap:Submit"
```

### `/ios.snapshot` Options

```
/ios.snapshot [--simulator <name|udid>] [--app <bundleId>] [--duration <seconds>]
```

| Option | Short | Description |
|--------|-------|-------------|
| `--simulator` | `-s` | Target simulator by name or UDID |
| `--app` | `-a` | Filter logs to specific bundle ID |
| `--duration` | `-d` | Seconds of logs to capture (default: 60) |
| `--include-crash` | | Include full crash log content |

**Examples**:
```
/ios.snapshot
/ios.snapshot --simulator "iPhone 15 Pro"
/ios.snapshot --app com.example.myapp -d 120
```

See [iOS Development Tools](/ios-development) for complete documentation.

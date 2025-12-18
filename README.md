# Maestro

[![Made with Maestro](docs/assets/made-with-maestro.svg)](https://github.com/pedramamini/Maestro)
[![Discord](https://img.shields.io/badge/Discord-Join%20Us-5865F2?logo=discord&logoColor=white)](https://discord.gg/86crXbGb)

> Run AI coding agents autonomously for days.

Maestro is a cross-platform desktop app for orchestrating your fleet of AI agents and projects. It's a high-velocity solution for hackers who are juggling multiple projects in parallel. Designed for power users who live on the keyboard and rarely touch the mouse.

Collaborate with AI to create detailed specification documents, then let Auto Run execute them automatically, each task in a fresh session with clean context. Allowing for long running unattended sessions, my current record is nearly 24 hours of continuos runtime.

Run multiple agents in parallel with a Linear/Superhuman-level responsive interface. Currently supporting **Claude Code**, **OpenAI Codex**, and **OpenCode** with plans for additional agentic coding tools (Aider, Gemini CLI, Qwen3 Coder) based on user demand.

<div align="center">
  <a href="https://youtu.be/fmwwTOg7cyA?si=dJ89K54tGflKa5G4">
    <img src="https://github.com/user-attachments/assets/deaf601d-1898-4ede-bf5a-42e46874ebb3"
         alt="Maestro Video Thumbnail"
         width="650" />
  </a>

  <div>
    <a href="https://youtu.be/fmwwTOg7cyA?si=VOkjO6oYjCSQvM0A">~27m Walkthrough and Demo</a>
    &nbsp;|&nbsp;
    <a href="https://youtu.be/3wX5Q1I0sgI?si=oJkJDxgAWUvBXX4D">~6m Onboarding Demo</a>
  </div>
</div>

## Installation

### Download

Download the latest release for your platform from the [Releases](https://github.com/pedramamini/maestro/releases) page:

- **macOS**: `.dmg` or `.zip`
- **Windows**: `.exe` installer
- **Linux**: `.AppImage`, `.deb`, or `.rpm`
- **Upgrading**: Simply replace the old binary with the new one. All your data (sessions, settings, playbooks, history) persists in your [config directory](#configuration).

### Requirements

- At least one supported AI coding agent installed and authenticated:
  - [Claude Code](https://docs.anthropic.com/en/docs/claude-code) - Anthropic's AI coding assistant
  - [OpenAI Codex](https://github.com/openai/codex) - OpenAI's coding agent
  - [OpenCode](https://github.com/opencode-ai/opencode) - Open-source AI coding assistant
- Git (optional, for git-aware features)

## Features

### Power Features

- 🤖 **[Auto Run & Playbooks](#auto-run)** - File-system-based task runner that batch-processes markdown checklists through AI agents. Create playbooks for repeatable workflows, run in loops, and track progress with full history. Each task gets its own AI session for clean conversation context.
- 🌐 **[Mobile Remote Control](#remote-access)** - Built-in web server with QR code access. Monitor and control all your agents from your phone. Supports local network access and remote tunneling via Cloudflare for access from anywhere.
- 💻 **[Command Line Interface](#command-line-interface)** - Full CLI (`maestro-cli`) for headless operation. List agents/groups, run playbooks from cron jobs or CI/CD pipelines, with human-readable or JSONL output for scripting.
- 🚀 **Multi-Instance Management** - Run unlimited Claude Code instances and terminal sessions in parallel. Each agent has its own workspace, conversation history, and isolated context.
- 📬 **Message Queueing** - Queue messages while AI is busy; they're sent automatically when the agent becomes ready. Never lose a thought.

### Core Features

- 🔄 **Dual-Mode Sessions** - Each agent has both an AI Terminal and Command Terminal. Switch seamlessly between AI conversation and shell commands with `Cmd+J`.
- ⌨️ **[Keyboard-First Design](#keyboard-shortcuts)** - Full keyboard control with customizable shortcuts. `Cmd+K` quick actions, vim-style navigation, rapid agent switching, and focus management designed for flow state.
- 📋 **Session Discovery** - Automatically discovers and imports all Claude Code sessions, including conversations from before Maestro was installed. Browse, search, star, rename, and resume any session.
- 🔀 **Git Integration** - Automatic repo detection, branch display, diff viewer, commit logs, and git-aware file completion. Work with git without leaving the app.
- 📁 **[File Explorer](#ui-overview)** - Browse project files with syntax highlighting, markdown preview, and image viewing. Reference files in prompts with `@` mentions.
- 🔍 **[Powerful Output Filtering](#inputoutput)** - Search and filter AI output with include/exclude modes, regex support, and per-response local filters.
- ⚡ **[Slash Commands](#slash-commands)** - Extensible command system with autocomplete. Create custom commands with template variables for your workflows.
- 💾 **Draft Auto-Save** - Never lose work. Drafts are automatically saved and restored per session.
- 🔊 **Speakable Notifications** - Audio alerts with text-to-speech announcements when agents complete tasks.
- 🎨 **[Beautiful Themes](THEMES.md)** - 12 themes including Dracula, Monokai, Nord, Tokyo Night, GitHub Light, and more.
- 💰 **Cost Tracking** - Real-time token usage and cost tracking per session and globally.
- 🏆 **[Achievements](#achievements)** - Level up from Apprentice to Titan of the Baton based on cumulative Auto Run time. 11 conductor-themed ranks to unlock.

> **Note**: Maestro supports Claude Code, OpenAI Codex, and OpenCode. Support for additional agents (Aider, Gemini CLI, Qwen3 Coder) may be added in future releases based on community demand.

### Spec-Driven Workflow

Maestro enables a **specification-first approach** to AI-assisted development. Instead of ad-hoc prompting, you collaboratively build detailed specs with the AI, then execute them systematically:

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. PLAN          2. SPECIFY         3. EXECUTE        4. REFINE    │
│  ─────────        ──────────         ─────────         ─────────    │
│  Discuss the      Create markdown    Auto Run works    Review       │
│  feature with     docs with task     through tasks,    results,     │
│  the AI agent     checklists in      fresh session     update specs │
│                   your Auto Run      per task          and repeat   │
│                   folder                                            │
└─────────────────────────────────────────────────────────────────────┘
```

**Why this works:**
- **Deliberate planning** — Conversation forces you to think through requirements before coding
- **Documented specs** — Your markdown files become living documentation
- **Clean execution** — Each task runs in isolation with no context bleed
- **Iterative refinement** — Review, adjust specs, re-run—specs evolve with your understanding

**Example workflow:**

1. **Plan**: In the AI Terminal, discuss your feature: *"I want to add user authentication with OAuth support"*
2. **Specify**: Ask the AI to help create a spec: *"Create a markdown checklist for implementing this feature"*
3. **Save**: Copy the spec to your Auto Run folder (or have the AI write it directly)
4. **Execute**: Switch to Auto Run tab, select the doc, click Run—Maestro handles the rest
5. **Review**: Check the History tab for results, refine specs as needed

This approach mirrors methodologies like [Spec-Kit](https://github.com/github/spec-kit), but with a graphical interface, real-time AI collaboration, and multi-agent parallelism.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Agent** | A workspace tied to a project directory and AI provider (Claude Code, Codex, or OpenCode). Contains one Command Terminal and one AI Terminal with full conversation history. |
| **Group** | Organizational container for agents. Group by project, client, or workflow. |
| **AI Terminal** | The conversation interface with your AI agent. Supports `@` file mentions, slash commands, and image attachments. |
| **Command Terminal** | A PTY shell session for running commands directly. Tab completion for files, git branches, and command history. |
| **Session Explorer** | Browse all past conversations for an agent. Star, rename, search, and resume any previous session. |
| **Auto Run** | Automated task runner that processes markdown checklists. Spawns fresh AI sessions per task. |
| **Playbook** | A saved Auto Run configuration with document order, options, and settings for repeatable batch workflows. |
| **History** | Timestamped log of all actions (user commands, AI responses, Auto Run completions) with session links. |
| **Remote Control** | Web interface for mobile access. Local network or remote via Cloudflare tunnel. |
| **CLI** | Headless command-line tool for scripting, automation, and CI/CD integration. |

## UI Overview

Maestro features a three-panel layout:

- **Left Panel** - Agent list with grouping, filtering, search, bookmarks, and drag-and-drop organization
- **Main Panel** - Center workspace with two modes per agent:
  - **AI Terminal** - Converse with your AI agent (Claude Code, Codex, or OpenCode). Supports multiple tabs/sessions, `@` file mentions, image attachments, slash commands, and draft auto-save.
  - **Command Terminal** - PTY shell with tab completion for files, branches, tags, and command history.
  - **Views**: Session Explorer, File Preview, Git Diffs, Git Logs
- **Right Panel** - Three tabs: File Explorer, History Viewer, and Auto Run

### Agent Status Indicators

Each session shows a color-coded status indicator:

- 🟢 **Green** - Ready and waiting
- 🟡 **Yellow** - Agent is thinking
- 🔴 **Red** - No connection with agent
- 🟠 **Pulsing Orange** - Attempting to establish connection
- 🔴 **Red Badge** - Unread messages (small red dot overlapping top-right of status indicator, iPhone-style)

## Screenshots
All these screenshots were captured in the them "Pedurple". For screenshots of other themes, see [THEMES.md](THEMES.md). Also note that these screenshots are probably dated as the project is evolving rapidly.

### Main Screen
<img width="3592" height="2302" alt="image" src="https://github.com/user-attachments/assets/a65b27a7-0db7-4b3f-ac23-7ef08e3b614e" />

### Command Interpreter (with collapsed left panel)
<img width="3592" height="2302" alt="image" src="https://github.com/user-attachments/assets/b4691e96-f55b-4c92-a561-56b2f50b82b1" />

### Git Logs and Diff Viewer
<img width="3592" height="2302" alt="image" src="https://github.com/user-attachments/assets/78827d23-bfa6-424a-9a8e-217258b85e29" />
<img width="3592" height="2302" alt="image" src="https://github.com/user-attachments/assets/ef0480a7-ecb6-4ee3-bd6c-1d1ad0e99d18" />

### File Viewer
<img width="3592" height="2302" alt="image" src="https://github.com/user-attachments/assets/91960bc0-9dc9-49a3-b0dd-37ea923f65ac" />

### CMD+K and Shortcuts Galore
<img width="3592" height="2302" alt="image" src="https://github.com/user-attachments/assets/5a8eb082-ebd0-4b57-a48e-34e8c6aa4c36" />
<img width="3592" height="2302" alt="image" src="https://github.com/user-attachments/assets/b2ab9cda-4fa8-4dcb-b322-8d31e50f7127" />
<img width="3592" height="2302" alt="image" src="https://github.com/user-attachments/assets/f7b7b457-d7e6-48be-a3d3-b2851ab7a02c" />
<img width="3592" height="2302" alt="image" src="https://github.com/user-attachments/assets/9dd8f89e-5330-4025-b416-3ad2aff61e1d" />

### Themes and Achievements
<img width="3592" height="2302" alt="image" src="https://github.com/user-attachments/assets/bd9b9e07-7b3c-45fe-955e-18959394c169" />
<img width="3592" height="2302" alt="image" src="https://github.com/user-attachments/assets/286a0a33-7c29-430a-982f-318e90d9e8c9" />

### Session Tracking, Starring, Labeling, and Recall
<img width="3592" height="2302" alt="image" src="https://github.com/user-attachments/assets/4b3a5ae6-6654-43b6-a25b-ffe689ea1748" />

### AutoRuns with Change History Tracking
<img width="3592" height="2302" alt="image" src="https://github.com/user-attachments/assets/66e6f9e9-969e-497e-8139-f9fbf26f976a" />
<img width="3592" height="2302" alt="image" src="https://github.com/user-attachments/assets/0aec0a73-a687-4b7f-9710-4bf9d1325b6d" />

### Web Interface / Remote Control
#### Chat
<img width="400" alt="IMG_0163" src="https://github.com/user-attachments/assets/366addb0-f75a-4399-acd3-20d35954802a" />

#### Groups / Sessions
<img width="400" alt="IMG_0162" src="https://github.com/user-attachments/assets/39a2c029-3f5a-4d1e-a291-a6037a67da79" />

#### History
<img width="400" alt="IMG_0164" src="https://github.com/user-attachments/assets/ee82d715-118d-4308-b478-f7116df87381" />

## Keyboard Shortcuts

### Global Shortcuts

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| Quick Actions | `Cmd+K` | `Ctrl+K` |
| Toggle Sidebar | `Cmd+B` | `Ctrl+B` |
| Toggle Right Panel | `Cmd+\` | `Ctrl+\` |
| New Agent | `Cmd+N` | `Ctrl+N` |
| Kill Agent | `Cmd+Shift+Backspace` | `Ctrl+Shift+Backspace` |
| Move Agent to Group | `Cmd+Shift+M` | `Ctrl+Shift+M` |
| Previous Agent | `Cmd+[` | `Ctrl+[` |
| Next Agent | `Cmd+]` | `Ctrl+]` |
| Jump to Agent (1-9, 0=10th) | `Opt+Cmd+NUMBER` | `Alt+Ctrl+NUMBER` |
| Switch AI/Command Terminal | `Cmd+J` | `Ctrl+J` |
| Show Shortcuts Help | `Cmd+/` | `Ctrl+/` |
| Open Settings | `Cmd+,` | `Ctrl+,` |
| View All Agent Sessions | `Cmd+Shift+L` | `Ctrl+Shift+L` |
| Jump to Bottom | `Cmd+Shift+J` | `Ctrl+Shift+J` |
| Cycle Focus Areas | `Tab` | `Tab` |
| Cycle Focus Backwards | `Shift+Tab` | `Shift+Tab` |

### Panel Shortcuts

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| Go to Files Tab | `Cmd+Shift+F` | `Ctrl+Shift+F` |
| Go to History Tab | `Cmd+Shift+H` | `Ctrl+Shift+H` |
| Go to Auto Run Tab | `Cmd+Shift+1` | `Ctrl+Shift+1` |
| Toggle Markdown Raw/Preview | `Cmd+E` | `Ctrl+E` |
| Insert Checkbox (Auto Run) | `Cmd+L` | `Ctrl+L` |

### Input & Output

| Action | Key |
|--------|-----|
| Send Message | `Enter` or `Cmd+Enter` (configurable in Settings) |
| Multiline Input | `Shift+Enter` |
| Navigate Command History | `Up Arrow` while in input |
| Slash Commands | Type `/` to open autocomplete |
| Focus Output | `Esc` while in input |
| Focus Input | `Esc` while in output |
| Open Output Search | `Cmd+F` while in output |
| Scroll Output | `Up/Down Arrow` while in output |
| Page Up/Down | `Alt+Up/Down Arrow` while in output |
| Jump to Top/Bottom | `Cmd+Up/Down Arrow` while in output |

### Tab Completion (Command Terminal)

The Command Terminal provides intelligent tab completion for faster command entry:

| Action | Key |
|--------|-----|
| Open Tab Completion | `Tab` (when there's input text) |
| Navigate Suggestions | `Up/Down Arrow` |
| Select Suggestion | `Enter` |
| Cycle Filter Types | `Tab` (while dropdown is open, git repos only) |
| Cycle Filter Backwards | `Shift+Tab` (while dropdown is open) |
| Close Dropdown | `Esc` |

**Completion Sources:**
- **History** - Previous shell commands from your session
- **Files/Folders** - Files and directories in your current working directory
- **Git Branches** - Local and remote branches (git repos only)
- **Git Tags** - Available tags (git repos only)

In git repositories, filter buttons appear in the dropdown header allowing you to filter by type (All, History, Branches, Tags, Files). Use `Tab`/`Shift+Tab` to cycle through filters or click directly.

### @ File Mentions (AI Terminal)

In AI mode, use `@` to reference files in your prompts:

| Action | Key |
|--------|-----|
| Open File Picker | Type `@` followed by a search term |
| Navigate Suggestions | `Up/Down Arrow` |
| Select File | `Tab` or `Enter` |
| Close Dropdown | `Esc` |

**Example**: Type `@readme` to see matching files, then select to insert the file reference into your prompt. The AI will have context about the referenced file.

### Navigation & Search

| Action | Key |
|--------|-----|
| Navigate Agents | `Up/Down Arrow` while in sidebar |
| Select Agent | `Enter` while in sidebar |
| Open Session Filter | `Cmd+F` while in sidebar |
| Navigate Files | `Up/Down Arrow` while in file tree |
| Open File Tree Filter | `Cmd+F` while in file tree |
| Open File Preview | `Enter` on selected file |
| Close Preview/Filter/Modal | `Esc` |

### File Preview

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| Copy File Path | `Cmd+P` | `Ctrl+P` |
| Open Search | `Cmd+F` | `Ctrl+F` |
| Scroll | `Up/Down Arrow` | `Up/Down Arrow` |
| Close | `Esc` | `Esc` |

*Most shortcuts are customizable in Settings > Shortcuts*

## Slash Commands

Maestro includes an extensible slash command system with autocomplete. Type `/` in the input area to open the autocomplete menu, use arrow keys to navigate, and press `Tab` or `Enter` to select.

### Custom AI Commands

Create your own slash commands in **Settings > Custom AI Commands**. Each command has a trigger (e.g., `/deploy`) and a prompt that gets sent to the AI agent.

Commands support **template variables** that are automatically substituted at runtime:

#### Agent Variables
| Variable | Description |
|----------|-------------|
| `{{AGENT_NAME}}` | Agent name |
| `{{AGENT_PATH}}` | Agent home directory path (full path to project) |
| `{{AGENT_GROUP}}` | Agent's group name (if grouped) |
| `{{AGENT_SESSION_ID}}` | Agent session ID (for conversation continuity) |
| `{{TAB_NAME}}` | Custom tab name (alias: `SESSION_NAME`) |
| `{{TOOL_TYPE}}` | Agent type (claude-code, codex, opencode) |

#### Path Variables
| Variable | Description |
|----------|-------------|
| `{{CWD}}` | Current working directory |
| `{{AUTORUN_FOLDER}}` | Auto Run documents folder path |

#### Auto Run Variables
| Variable | Description |
|----------|-------------|
| `{{DOCUMENT_NAME}}` | Current Auto Run document name (without .md) |
| `{{DOCUMENT_PATH}}` | Full path to current Auto Run document |
| `{{LOOP_NUMBER}}` | Current loop iteration (starts at 1) |

#### Date/Time Variables
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

#### Git & Context Variables
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

## Auto Run

Auto Run is a file-system-based document runner that lets you batch-process tasks using AI agents. Select a folder containing markdown documents with task checkboxes, and Maestro will work through them one by one, spawning a fresh AI session for each task.

### Setting Up Auto Run

1. Navigate to the **Auto Run** tab in the right panel (`Cmd+Shift+1`)
2. Select a folder containing your markdown task documents
3. Each `.md` file becomes a selectable document

### Creating Tasks

Use markdown checkboxes in your documents:

```markdown
# Feature Implementation Plan

- [ ] Implement user authentication
- [ ] Add unit tests for the login flow
- [ ] Update API documentation
```

**Tip**: Press `Cmd+L` (Mac) or `Ctrl+L` (Windows/Linux) to quickly insert a new checkbox at your cursor position.

### Running Single Documents

1. Select a document from the dropdown
2. Click the **Run** button (or the ▶ icon)
3. Customize the agent prompt if needed, then click **Go**

### Multi-Document Batch Runs

Auto Run supports running multiple documents in sequence:

1. Click **Run** to open the Batch Runner Modal
2. Click **+ Add Docs** to add more documents to the queue
3. Drag to reorder documents as needed
4. Configure options per document:
   - **Reset on Completion** - Uncheck all boxes when document completes (for repeatable tasks)
   - **Duplicate** - Add the same document multiple times
5. Enable **Loop Mode** to cycle back to the first document after completing the last
6. Click **Go** to start the batch run

### Playbooks

Save your batch configurations for reuse:

1. Configure your documents, order, and options
2. Click **Save as Playbook** and enter a name
3. Load saved playbooks from the **Load Playbook** dropdown
4. Update or discard changes to loaded playbooks

### Git Worktree Support

Git worktrees allow Auto Run to operate in an isolated directory while you continue working interactively in the main repository—no read-only restrictions, no waiting.

**Setup:**
1. Enable **Worktree** in the Batch Runner Modal
2. Select a **Worktree Directory** (base folder for all worktrees)
3. Enter a **Branch Name** (becomes the worktree subdirectory)
4. The computed path shows where the worktree will be created
5. Optionally enable **Create PR on completion** to auto-open a pull request

**Benefits:**
- **Continue working** in the main repo while Auto Run processes tasks in the background
- **No read-only mode** — the yellow border and input lock only appear when running without a worktree
- **Visual indicator** — a git branch icon appears in the AUTO badge, right panel, and status pill when using a worktree
- **Automatic PR creation** — when enabled, opens a PR from the worktree branch to your target branch

**Without a worktree:** Auto Run queues with other write operations to prevent conflicts, and the editor enters read-only mode until completion.

### Progress Tracking

The runner will:
- Process tasks serially from top to bottom
- Skip documents with no unchecked tasks
- Show progress: "Document X of Y" and "Task X of Y"
- Mark tasks as complete (`- [x]`) when done
- Log each completion to the **History** panel

### Session Isolation

Each task executes in a completely fresh AI session with its own unique session ID. This provides:

- **Clean context** - No conversation history bleeding between tasks
- **Predictable behavior** - Tasks in looping playbooks execute identically each iteration
- **Independent execution** - The agent approaches each task without memory of previous work

This isolation is critical for playbooks with `Reset on Completion` documents that loop indefinitely. Without it, the AI might "remember" completing a task and skip re-execution on subsequent loops.

### History & Tracking

Each completed task is logged to the History panel with:
- **AUTO** label indicating automated execution
- **Session ID** pill (clickable to jump to that AI conversation)
- **Summary** of what the agent accomplished
- **Full response** viewable by clicking the entry

**Keyboard navigation in History**:
- `Up/Down Arrow` - Navigate entries
- `Enter` - View full response
- `Esc` - Close detail view and return to list

### Auto-Save

Documents auto-save after 5 seconds of inactivity, and immediately when switching documents. Full undo/redo support with `Cmd+Z` / `Cmd+Shift+Z`.

### Image Support

Paste images directly into your documents. Images are saved to an `images/` subfolder with relative paths for portability.

### Stopping the Runner

Click the **Stop** button at any time. The runner will:
- Complete the current task before stopping
- Preserve all completed work
- Allow you to resume later by clicking Run again

### Parallel Batches

You can run separate batch processes in different Maestro sessions simultaneously. Each session maintains its own independent batch state. With Git worktrees enabled, you can work on the main branch while Auto Run operates in an isolated worktree.

## Achievements

Maestro features a conductor-themed achievement system that tracks your cumulative Auto Run time. The focus is simple: **longest run wins**. As you accumulate Auto Run hours, you level up through 11 ranks inspired by the hierarchy of orchestral conductors.

### Conductor Ranks

| Level | Rank | Time Required | Example Conductor |
|:-----:|------|---------------|-------------------|
| 1 | **Apprentice Conductor** | 15 minutes | Gustavo Dudamel (early career) |
| 2 | **Assistant Conductor** | 1 hour | Marin Alsop |
| 3 | **Associate Conductor** | 8 hours | Yannick Nézet-Séguin |
| 4 | **Resident Conductor** | 24 hours | Jaap van Zweden |
| 5 | **Principal Guest Conductor** | 1 week | Esa-Pekka Salonen |
| 6 | **Chief Conductor** | 30 days | Andris Nelsons |
| 7 | **Music Director** | 3 months | Sir Simon Rattle |
| 8 | **Maestro Emeritus** | 6 months | Bernard Haitink |
| 9 | **World Maestro** | 1 year | Kirill Petrenko |
| 10 | **Grand Maestro** | 5 years | Riccardo Muti |
| 11 | **Titan of the Baton** | 10 years | Leonard Bernstein |

### Reaching the Top

Since Auto Runs can execute in parallel across multiple Maestro sessions, achieving **Titan of the Baton** (Level 11) is technically feasible in less than 10 calendar years. Run 10 agents simultaneously with worktrees and you could theoretically hit that milestone in about a year of real time.

But let's be real—getting to Level 11 is going to take some serious hacking. You'll need a well-orchestrated fleet of agents running around the clock, carefully crafted playbooks that loop indefinitely, and the infrastructure to keep it all humming. It's the ultimate test of your Maestro skills.

The achievement panel shows your current rank, progress to the next level, and total accumulated time. Each rank includes flavor text and information about a legendary conductor who exemplifies that level of mastery.

## Command Line Interface

Maestro includes a CLI tool (`maestro-cli`) for managing agents and running playbooks from the command line, cron jobs, or CI/CD pipelines. The CLI requires Node.js (which you already have if you're using Claude Code).

### Installation

The CLI is bundled with Maestro as a JavaScript file. Create a shell wrapper to run it:

```bash
# macOS (after installing Maestro.app)
echo '#!/bin/bash\nnode "/Applications/Maestro.app/Contents/Resources/maestro-cli.js" "$@"' | sudo tee /usr/local/bin/maestro-cli && sudo chmod +x /usr/local/bin/maestro-cli

# Linux (deb/rpm installs to /opt)
echo '#!/bin/bash\nnode "/opt/Maestro/resources/maestro-cli.js" "$@"' | sudo tee /usr/local/bin/maestro-cli && sudo chmod +x /usr/local/bin/maestro-cli

# Windows (PowerShell as Administrator) - create a batch file
@"
@echo off
node "%ProgramFiles%\Maestro\resources\maestro-cli.js" %*
"@ | Out-File -FilePath "$env:ProgramFiles\Maestro\maestro-cli.cmd" -Encoding ASCII
```

Alternatively, run directly with Node.js:
```bash
node "/Applications/Maestro.app/Contents/Resources/maestro-cli.js" list groups
```

### Usage

```bash
# List all groups
maestro-cli list groups

# List all agents
maestro-cli list agents
maestro-cli list agents --group <group-id>

# Show agent details (history, usage stats, cost)
maestro-cli show agent <agent-id>

# List all playbooks (or filter by agent)
maestro-cli list playbooks
maestro-cli list playbooks --agent <agent-id>

# Show playbook details
maestro-cli show playbook <playbook-id>

# Run a playbook
maestro-cli playbook <playbook-id>

# Dry run (shows what would be executed)
maestro-cli playbook <playbook-id> --dry-run

# Run without writing to history
maestro-cli playbook <playbook-id> --no-history

# Wait for agent if busy, with verbose output
maestro-cli playbook <playbook-id> --wait --verbose

# Debug mode for troubleshooting
maestro-cli playbook <playbook-id> --debug
```

### JSON Output

By default, commands output human-readable formatted text. Use `--json` for machine-parseable JSONL output:

```bash
# Human-readable output (default)
maestro-cli list groups
GROUPS (2)

  🎨  Frontend
      group-abc123
  ⚙️  Backend
      group-def456

# JSON output for scripting
maestro-cli list groups --json
{"type":"group","id":"group-abc123","name":"Frontend","emoji":"🎨","timestamp":...}
{"type":"group","id":"group-def456","name":"Backend","emoji":"⚙️","timestamp":...}

# Running a playbook with JSON streams events
maestro-cli playbook <playbook-id> --json
{"type":"start","timestamp":...,"playbook":{...}}
{"type":"document_start","timestamp":...,"document":"tasks.md","taskCount":5}
{"type":"task_start","timestamp":...,"taskIndex":0}
{"type":"task_complete","timestamp":...,"success":true,"summary":"...","elapsedMs":8000}
{"type":"document_complete","timestamp":...,"tasksCompleted":5}
{"type":"complete","timestamp":...,"totalTasksCompleted":5,"totalElapsedMs":60000}
```

### Scheduling with Cron

```bash
# Run a playbook every hour (use --json for log parsing)
0 * * * * /usr/local/bin/maestro-cli playbook <playbook-id> --json >> /var/log/maestro.jsonl 2>&1
```

### Requirements

- At least one AI agent CLI must be installed and in PATH (Claude Code, Codex, or OpenCode)
- Maestro config files must exist (created automatically when you use the GUI)

## Configuration

Settings are stored in:

- **macOS**: `~/Library/Application Support/maestro/`
- **Windows**: `%APPDATA%/maestro/`
- **Linux**: `~/.config/maestro/`

## Remote Access

Maestro includes a built-in web server for mobile remote control:

1. **Automatic Security**: Web server runs on a random port with an auto-generated security token embedded in the URL
2. **QR Code Access**: Scan a QR code to connect instantly from your phone
3. **Global Access**: All sessions are accessible when the web interface is enabled - the security token protects access
4. **Remote Tunneling**: Access Maestro from anywhere via Cloudflare tunnel (requires `cloudflared` CLI)

### Mobile Web Interface

The mobile web interface provides:
- Real-time session monitoring and command input
- Device color scheme preference support (light/dark mode)
- Connection status indicator with automatic reconnection
- Offline queue for commands typed while disconnected
- Swipe gestures for common actions
- Quick actions menu for the send button

### Local Access (Same Network)

1. Click the "OFFLINE" button in the header to enable the web interface
2. The button changes to "LIVE" and shows a QR code overlay
3. Scan the QR code or copy the secure URL to access from your phone on the same network

### Remote Access (Outside Your Network)

To access Maestro from outside your local network (e.g., on mobile data or from another location):

1. Install cloudflared: `brew install cloudflared` (macOS) or [download for other platforms](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
2. Enable the web interface (OFFLINE → LIVE)
3. Toggle "Remote Access" in the Live overlay
4. A secure Cloudflare tunnel URL will be generated
5. Use the Local/Remote pill selector to switch between QR codes
6. The tunnel stays active as long as Maestro is running - no time limits, no account required

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, architecture details, and contribution guidelines.

## Contributors

- [@pedramamini](https://github.com/pedramamini) - Creator and maintainer
- [@mattjay](https://github.com/mattjay) - Contributor and tester

## License

[AGPL-3.0 License](LICENSE)

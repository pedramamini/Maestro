# Maestro

[![Made with Maestro](docs/assets/made-with-maestro.svg)](https://github.com/pedramamini/Maestro)

> A unified, highly-responsive developer command center for managing your fleet of AI coding agents.

Maestro is a desktop application that allows you to run and manage multiple AI coding instances in parallel with a Linear/Superhuman-level responsive interface. Currently supporting Claude Code with plans for additional agentic coding tools (OpenAI Codex, Gemini CLI, Qwen3 Coder) based on user demand.

## Screenshots
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

## Installation

### Download

Download the latest release for your platform from the [Releases](https://github.com/pedramamini/maestro/releases) page:

- **macOS**: `.dmg` or `.zip`
- **Windows**: `.exe` installer
- **Linux**: `.AppImage`, `.deb`, or `.rpm`

### Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- Git (optional, for git-aware features)

## Features

- 🚀 **Multi-Instance Management** - Run multiple Claude Code instances and Command Terminal sessions simultaneously
- 🤖 **Automatic Runner** - Batch-process tasks using AI agents with serial execution, history tracking, and saved session per task
- 🔄 **Dual-Mode Input** - Switch between Command Terminal and AI Terminal seamlessly
- ⌨️ **Keyboard-First Design** - Built for fast flow with full keyboard control, customizable shortcuts, and rapid navigation
- 🔍 **Powerful Output Filtering** - Search, filter, and navigate output with include/exclude modes and per-response local filters
- 🎨 **Beautiful Themes** - 12 themes including Dracula, Monokai, Nord, Tokyo Night, GitHub Light, and more
- 🔀 **Git Integration** - Automatic git status, diff tracking, and workspace detection
- 📁 **File Explorer** - Browse project files with syntax highlighting and markdown preview
- 📋 **Session Management** - Group, rename, bookmark, and organize your sessions
- 📝 **Auto Run** - File-system-based document runner for automated task management with playbooks
- ⚡ **Slash Commands** - Extensible command system with autocomplete
- 📬 **Message Queueing** - Queue messages while AI is busy; they're sent automatically when ready
- 🌐 **Mobile Remote Control** - Access agents from your phone with QR codes, live agents, and a mobile-optimized web interface
- 💰 **Cost Tracking** - Real-time token usage and cost tracking per session

> **Note**: Maestro currently supports Claude Code only. Support for other agentic coding tools may be added in future releases based on community demand.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Agents** | An agent has a workspace tied to a directory. Contains one CLI terminal and multiple agent tabs. |
| **CLI Terminal** | A PTY shell session for running commands directly. One per agent. |
| **Agent Tabs** | A conversation context with an agent. Each tab has its own input, images, and message history. |
| **Agent Sessions** | The complete list of conversations with this specific agent. |
| **History** | Actions made by the user or autonomously. |

## UI Overview

Maestro features a three-panel layout:

- **Left Bar** - Agent list with grouping, filtering, bookmarks, and organization
- **Main Window** - Center workspace with two modes:
  - **AI Terminal** - Interact with Claude Code AI assistant
  - **Command Terminal** - Execute shell commands and scripts
  - **Session Explorer** - Enumerate, search, star, rename, and resume past conversations
  - **File Preview** - View images and text documents with source highlighting and markdown rendering
  - **Git Diffs** - View the current diff when working in Git repositories
  - **Git Logs** - Explore commit logs without leaving the app
- **Right Bar** - File explorer, command history, and auto running capabilities

### Agent Status Indicators

Each session shows a color-coded status indicator:

- 🟢 **Green** - Ready and waiting
- 🟡 **Yellow** - Agent is thinking
- 🔴 **Red** - No connection with agent
- 🟠 **Pulsing Orange** - Attempting to establish connection

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
| Open Output Search | `/` while in output |
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
| Open Session Filter | `/` while in sidebar |
| Navigate Files | `Up/Down Arrow` while in file tree |
| Open File Tree Filter | `/` while in file tree |
| Open File Preview | `Enter` on selected file |
| Close Preview/Filter/Modal | `Esc` |

### File Preview

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| Copy File Path | `Cmd+P` | `Ctrl+P` |
| Open Search | `/` | `/` |
| Scroll | `Up/Down Arrow` | `Up/Down Arrow` |
| Close | `Esc` | `Esc` |

*Most shortcuts are customizable in Settings > Shortcuts*

## Slash Commands

Maestro includes an extensible slash command system with autocomplete. Type `/` in the input area to open the autocomplete menu, use arrow keys to navigate, and press `Tab` or `Enter` to select.

### Custom AI Commands

Create your own slash commands in **Settings > Custom AI Commands**. Each command has a trigger (e.g., `/deploy`) and a prompt that gets sent to the AI agent.

Commands support **template variables** that are automatically substituted at runtime:

| Variable | Description |
|----------|-------------|
| `{{SESSION_NAME}}` | Current session name |
| `{{CLAUDE_SESSION_ID}}` | Claude Code session ID (for conversation continuity) |
| `{{PROJECT_NAME}}` | Project folder name |
| `{{PROJECT_PATH}}` | Full path to project directory |
| `{{GIT_BRANCH}}` | Current git branch (if in a git repo) |
| `{{DATE}}` | Current date (YYYY-MM-DD) |
| `{{TIME}}` | Current time (HH:MM:SS) |
| `{{WEEKDAY}}` | Day of week (Monday, Tuesday, etc.) |

**Example**: A custom `/standup` command with prompt:
```
It's {{WEEKDAY}}, {{DATE}}. I'm on branch {{GIT_BRANCH}} in {{PROJECT_NAME}}.
Summarize what I worked on yesterday and suggest priorities for today.
```

See the full list of available variables in the **Template Variables** section within the Custom AI Commands panel.

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

For parallel work without file conflicts:

1. Enable **Worktree** in the Batch Runner Modal
2. Specify a worktree path and branch name
3. Auto Run operates in the isolated worktree
4. Optionally create a PR when the batch completes

Without a worktree, Auto Run queues with other write operations to prevent conflicts.

### Progress Tracking

The runner will:
- Process tasks serially from top to bottom
- Skip documents with no unchecked tasks
- Show progress: "Document X of Y" and "Task X of Y"
- Mark tasks as complete (`- [x]`) when done
- Log each completion to the **History** panel

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

## License

[MIT License](LICENSE)

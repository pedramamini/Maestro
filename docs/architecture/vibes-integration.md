---
type: architecture
title: VIBES Integration Architecture
created: 2026-02-10
tags:
  - vibes
  - instrumentation
  - architecture
related:
  - "[[VIBES-Data-Model]]"
---

# VIBES Integration Architecture

## Overview

Maestro implements a **two-layer instrumentation architecture** for VIBES (Verified Instrumental Behavior and Environment Standard) compliance. This design captures AI attribution metadata at two distinct levels:

1. **Layer 1 - Maestro Orchestration**: High-level coordination events (agent dispatch, batch runs, session lifecycle) captured with `tool_name: "Maestro"`.
2. **Layer 2 - Tool Instrumentation**: Fine-grained tool execution events from individual AI agents (Claude Code, Codex) captured with their respective `tool_name`.

Both layers write to the same `.ai-audit/` directory using the VIBES v1.0 standard, enabling unified querying via the `vibescheck` CLI.

## Layer 1 - Maestro Orchestration

**Instrumenter**: `src/main/vibes/instrumenters/maestro-instrumenter.ts`

Maestro captures orchestration-level events that represent the "big picture" of an AI-assisted development session:

| Event | What is Captured |
|---|---|
| Agent spawn | Command, arguments, prompt text, project path |
| Agent complete | Exit code, output summary |
| Batch run start | Number of agents, batch configuration |
| Batch run complete | Success/failure counts, total duration |

These events are recorded as command and prompt manifest entries with `tool_name: "Maestro"`, linking to line annotations only when file modifications are detected at the orchestration level.

**Assurance-level filtering**: Maestro orchestration events respect the global assurance level setting. At `low`, only environment and session boundary data is captured. At `medium`, prompts sent to agents are also recorded. At `high`, all available metadata is captured.

## Layer 2 - Tool Instrumentation

### Claude Code Instrumenter

**File**: `src/main/vibes/instrumenters/claude-code-instrumenter.ts`

Maps Claude Code tool executions to VIBES action types:

| Claude Code Tool | VIBES Command Type | VIBES Action |
|---|---|---|
| Write, Edit, MultiEdit, NotebookEdit | `file_write` | `create` or `modify` |
| Read | `file_read` | `review` |
| Bash | `shell` | varies |
| Glob, Grep, TodoRead, TodoWrite, Task | `tool_use` | varies |
| WebFetch, WebSearch | `api_call` | varies |

### Codex Instrumenter

**File**: `src/main/vibes/instrumenters/codex-instrumenter.ts`

Maps Codex tool executions to VIBES action types:

| Codex Tool | VIBES Command Type | VIBES Action |
|---|---|---|
| shell, container_shell | `shell` | varies |
| write_file, apply_patch, create_file | `file_write` | `modify` or `create` |
| read_file, list_directory | `file_read` | `review` |
| file_search, grep_search, codebase_search | `tool_use` | varies |

### Reasoning Capture

Both instrumenters buffer reasoning/thinking text received via `thinking-chunk` events. This buffer is flushed when the next tool executes or the session ends, creating a reasoning manifest entry that links to subsequent annotations. Reasoning capture is only active at `high` assurance level.

Token usage statistics from `usage` events are attached to reasoning entries, including model name, input tokens, and output tokens.

## Data Flow Diagram

```
                     Maestro Application
 ┌─────────────────────────────────────────────────────────────────┐
 │                                                                 │
 │  ProcessManager                                                 │
 │  (EventEmitter)                                                 │
 │       │                                                         │
 │       ├── emits 'tool-execution'                                │
 │       ├── emits 'thinking-chunk'                                │
 │       ├── emits 'usage'                                         │
 │       └── emits 'exit'                                          │
 │            │                                                    │
 │            ▼                                                    │
 │  ┌─────────────────────┐                                        │
 │  │  VibesCoordinator   │◄── settings (electron-store)           │
 │  │  (event subscriber) │                                        │
 │  └────────┬────────────┘                                        │
 │           │                                                     │
 │           ├── routes by agent type                               │
 │           │                                                     │
 │     ┌─────┼──────────────┐                                      │
 │     ▼     ▼              ▼                                      │
 │  ┌──────┐ ┌──────┐ ┌──────────┐                                 │
 │  │Claude│ │Codex │ │ Maestro  │   Instrumenters                 │
 │  │Code  │ │Instr.│ │ Instr.   │   (event → annotation)          │
 │  │Instr.│ │      │ │          │                                  │
 │  └──┬───┘ └──┬───┘ └────┬─────┘                                 │
 │     │        │           │                                      │
 │     └────────┴───────────┘                                      │
 │              │                                                  │
 │              ▼                                                  │
 │  ┌───────────────────────┐                                      │
 │  │  VibesSessionManager  │   (session state, lifecycle)         │
 │  └───────────┬───────────┘                                      │
 │              │                                                  │
 │              ▼                                                  │
 │  ┌───────────────────────┐                                      │
 │  │       vibes-io        │   (file operations)                  │
 │  └───────────┬───────────┘                                      │
 │              │                                                  │
 └──────────────┼──────────────────────────────────────────────────┘
                │
                ▼
       Project Directory
       .ai-audit/
       ├── config.json          (project VIBES configuration)
       ├── manifest.json        (content-addressed entries)
       ├── annotations.jsonl    (line/session annotations)
       └── blobs/               (external large data)
```

## File Structure

### Core VIBES Modules (`src/main/vibes/`)

| File | Responsibility |
|---|---|
| `vibes-coordinator.ts` | Central orchestrator; subscribes to ProcessManager events, routes to instrumenters, manages lifecycle |
| `vibes-session.ts` | Per-session state management; tracks active sessions, annotation counts, start/end lifecycle |
| `vibes-io.ts` | All file I/O to `.ai-audit/`; config, manifest, annotations JSONL, directory creation |
| `vibes-hash.ts` | SHA-256 content-addressed hashing; canonical JSON serialization, short hash generation |
| `vibes-annotations.ts` | Builder functions for all annotation and manifest entry types |
| `vibes-bridge.ts` | CLI bridge to `vibescheck` binary; wraps init, build, stats, blame, log, coverage, report, sessions, models |

### Instrumenters (`src/main/vibes/instrumenters/`)

| File | Responsibility |
|---|---|
| `claude-code-instrumenter.ts` | Translates Claude Code tool events to VIBES annotations |
| `codex-instrumenter.ts` | Translates Codex tool events to VIBES annotations |
| `maestro-instrumenter.ts` | Captures Maestro orchestration events (agent spawn/complete, batch start/complete) |

### Shared Types (`src/shared/`)

| File | Responsibility |
|---|---|
| `vibes-types.ts` | TypeScript interfaces and type aliases for the VIBES v1.0 standard |
| `vibes-settings.ts` | Settings schema, defaults, and validation for VIBES configuration |

### IPC & Preload

| File | Responsibility |
|---|---|
| `src/main/ipc/handlers/vibes-handlers.ts` | Registers IPC handlers (`vibes:*`) for renderer-to-main communication |
| `src/main/preload/vibes.ts` | Exposes `window.maestro.vibes` API to renderer process |

### UI Components

| File | Responsibility |
|---|---|
| `src/renderer/components/vibes/VibesPanel.tsx` | Main VIBES panel with sub-tab navigation (Overview, Log, Models) |
| `src/renderer/components/vibes/VibesDashboard.tsx` | Overview dashboard with stats and coverage |
| `src/renderer/components/vibes/VibesAnnotationLog.tsx` | Annotation log viewer with filtering |
| `src/renderer/components/vibes/VibesModelAttribution.tsx` | Model attribution breakdown |
| `src/renderer/components/Settings/VibesSettings.tsx` | Settings panel for VIBES configuration |

## Settings Schema

All VIBES settings are stored in Maestro's `electron-store` and defined in `src/shared/vibes-settings.ts`.

| Setting | Type | Default | Description |
|---|---|---|---|
| `vibesEnabled` | `boolean` | `false` | Master toggle for all VIBES instrumentation |
| `vibesAssuranceLevel` | `'low' \| 'medium' \| 'high'` | `'medium'` | Controls metadata detail level |
| `vibesTrackedExtensions` | `string[]` | `.ts, .tsx, .js, .jsx, .py, .rs, .go, .java, .c, .cpp, .rb, .swift, .kt` | File extensions to instrument |
| `vibesExcludePatterns` | `string[]` | `**/node_modules/**, **/vendor/**, **/.venv/**, **/dist/**, **/target/**, **/.git/**, **/build/**` | Glob patterns to exclude |
| `vibesPerAgentConfig` | `Record<string, { enabled: boolean }>` | `{ 'claude-code': { enabled: true }, 'codex': { enabled: true } }` | Per-agent enable/disable toggles |
| `vibesMaestroOrchestrationEnabled` | `boolean` | `true` | Capture Maestro-level orchestration events |
| `vibesAutoInit` | `boolean` | `true` | Automatically run `vibescheck init` on new projects |
| `vibesCheckBinaryPath` | `string` | `''` (empty = search `$PATH`) | Custom path to vibescheck binary |
| `vibesCompressReasoningThreshold` | `number` | `10240` (10 KB) | Byte threshold for compressing reasoning text |
| `vibesExternalBlobThreshold` | `number` | `102400` (100 KB) | Byte threshold for storing data as external blobs |

## VibesCheck Bridge

Maestro delegates all querying, reporting, and database operations to the `vibescheck` CLI binary. The bridge (`src/main/vibes/vibes-bridge.ts`) wraps CLI invocations with:

- **30-second timeout** per command
- **5 MB max output buffer**
- **Structured results**: All functions return `{ success: boolean, data?: string, error?: string }` — never throws
- **Binary discovery**: Checks custom path first (`vibesCheckBinaryPath` setting), then searches `$PATH`

### Available Commands

| Bridge Function | CLI Command | Purpose |
|---|---|---|
| `vibesInit` | `vibescheck init` | Initialize `.ai-audit/` in a project |
| `vibesBuild` | `vibescheck build` | Rebuild the annotation database |
| `vibesStats` | `vibescheck stats [file]` | Get statistics for project or file |
| `vibesBlame` | `vibescheck blame --json <file>` | Get per-line AI attribution |
| `vibesLog` | `vibescheck log [--session --model --limit]` | Query annotation history |
| `vibesCoverage` | `vibescheck coverage [--json]` | Get AI coverage percentage |
| `vibesReport` | `vibescheck report [--format]` | Generate formatted report |
| `vibesSessions` | `vibescheck sessions --json` | List all recorded sessions |
| `vibesModels` | `vibescheck models --json` | List all models used |

### IPC Integration

The renderer accesses vibescheck via IPC handlers registered at `vibes:*` channels. The preload script exposes these as `window.maestro.vibes.*` methods, providing a clean async API:

```
Renderer (VibesPanel)
    ↓ window.maestro.vibes.getStats(projectPath)
Preload (ipcRenderer.invoke)
    ↓ 'vibes:getStats'
IPC Handler (vibes-handlers.ts)
    ↓ vibesStats(projectPath, file, binaryPath)
vibes-bridge.ts
    ↓ execFile('vibescheck', ['stats', ...])
vibescheck CLI
    ↓ reads .ai-audit/
Result
```

## UI Components

### VibesPanel Tab Structure

The `VibesPanel` component (`src/renderer/components/vibes/VibesPanel.tsx`) is rendered in the right panel when the VIBES tab is active. It contains three sub-tabs:

1. **Overview** (`VibesDashboard`): Shows session statistics, annotation counts, coverage percentage, and assurance level indicator. Displays aggregate data from `vibescheck stats` and `vibescheck coverage`.

2. **Log** (`VibesAnnotationLog`): Displays the annotation log with filtering by session, model, and action type. Data sourced from `vibescheck log`.

3. **Models** (`VibesModelAttribution`): Shows per-model breakdown of annotations and sessions. Data sourced from `vibescheck models`.

### Data Flow

```
VibesPanel
    │
    ├── useSettings() → vibesEnabled, vibesAssuranceLevel
    │
    ├── useVibesData(projectPath, vibesEnabled)
    │   ├── Calls window.maestro.vibes.getStats()
    │   ├── Calls window.maestro.vibes.getSessions()
    │   ├── Calls window.maestro.vibes.getModels()
    │   └── Calls window.maestro.vibes.getLog()
    │
    ├── VibesDashboard ← vibesData, assuranceLevel
    ├── VibesAnnotationLog ← annotations, isLoading
    └── VibesModelAttribution ← models, isLoading
```

When VIBES is disabled, the panel shows a disabled state message with a button to open Settings.

### VibesSettings

The `VibesSettings` component (`src/renderer/components/Settings/VibesSettings.tsx`) provides controls for all VIBES settings:

- Master enable/disable toggle
- Assurance level selector (Low / Medium / High)
- Tracked file extensions (tag list with add/remove)
- Exclude patterns (tag list with add/remove)
- Per-agent toggles (Claude Code, Codex)
- Maestro orchestration toggle
- Auto-init toggle
- Custom vibescheck binary path
- Advanced section: compression and blob thresholds

## Design Decisions

### Why instrumentation lives in Maestro

Maestro is the orchestrator that spawns and manages AI agent processes. By placing instrumentation at this level:

- **No agent modification required**: Claude Code and Codex run unmodified; their stdout events are observed externally.
- **Unified data**: All agents write to the same `.ai-audit/` directory regardless of agent type.
- **Centralized configuration**: One settings interface controls all instrumentation.
- **Cross-agent correlation**: Session IDs assigned by Maestro link annotations across agent boundaries.

### Why vibescheck is the query engine

Maestro writes raw VIBES data (config, manifest, annotations) but delegates all querying and reporting to the `vibescheck` CLI:

- **Separation of concerns**: Maestro captures data; vibescheck analyzes it.
- **CLI reusability**: Users can query VIBES data outside of Maestro using the same `vibescheck` commands.
- **Reduced complexity**: Maestro doesn't need to implement blame algorithms, coverage calculations, or report formatting.
- **Standard compliance**: vibescheck is the reference implementation of the VIBES v1.0 query specification.

### Why both layers exist

The two-layer design captures complementary perspectives:

- **Layer 1 (Maestro)** answers: "What agents were dispatched, with what prompts, and what were the outcomes?" This is the orchestration narrative.
- **Layer 2 (Tool)** answers: "What specific files were read, written, or modified, and what reasoning drove those changes?" This is the execution detail.

Together, they provide complete traceability from high-level intent (user prompt → Maestro dispatch) through to low-level execution (tool invocation → file modification → line annotation).

### Content-addressed storage

Manifest entries are keyed by their SHA-256 hash (computed from canonical JSON, excluding `created_at`). This provides:

- **Deduplication**: Identical environments, commands, or prompts are stored once.
- **Integrity**: Hashes serve as tamper-evident checksums.
- **Linking**: Annotations reference manifest entries by hash, creating a DAG of attribution data.

### JSONL for annotations

Annotations use line-delimited JSON (JSONL) rather than a single JSON array:

- **Append-safe**: New annotations are appended without reading/rewriting the entire file.
- **Concurrent-safe**: Multiple sessions can write to the same file without coordination.
- **Streaming**: Large annotation files can be processed line-by-line without loading into memory.

### Event-driven architecture

The VibesCoordinator subscribes to ProcessManager events rather than requiring agents to call VIBES functions directly:

- **Decoupled**: Agents don't know about VIBES; they just run normally.
- **Non-blocking**: Event handling is asynchronous; instrumentation never delays agent execution.
- **Toggleable**: The coordinator checks `isEnabled()` before processing, so disabled VIBES has near-zero overhead.

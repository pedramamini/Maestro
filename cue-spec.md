All questions resolved, all patterns understood. Here's the final locked spec:

---

## Maestro Cue — Final Spec

### Resolved Decisions

| Decision | Answer |
|---|---|
| **Fan-in timeout** | Default: timeout enabled (30min). On timeout, chain breaks and logs the failure. User can set `timeout_on_fail: continue` in YAML to skip the failed source and proceed anyway. |
| **Global prompts dir** | No. Relative paths from `projectRoot` or absolute paths. User's choice. |
| **Agent type** | Always inherits the session's configured `toolType`. No YAML override. |
| **File debounce** | 5 seconds. |
| **Help panel** | Section-based help modal (like `AutoRunnerHelpModal`) with icon+heading sections, callout boxes, and YAML examples. Accessible via `?` button in the Cue modal header. |

### Updated YAML Schema

```yaml
# maestro-cue.yaml
subscriptions:
  - name: "Hourly Code Review"
    event: time.interval
    interval_minutes: 60
    prompt: prompts/hourly-review.md
    enabled: true

  - name: "Watch for config changes"
    event: file.changed
    watch: "src/config/**/*.ts"
    prompt: prompts/config-audit.md
    enabled: true

  - name: "Post-ingest fan-out"
    event: agent.completed
    source_session: "ingest-agent"
    prompt: prompts/analyze.md
    fan_out:
      - "analyzer-1"
      - "analyzer-2"
    enabled: true

  - name: "Synthesis fan-in"
    event: agent.completed
    source_session:
      - "analyzer-1"
      - "analyzer-2"
    prompt: prompts/synthesize.md
    enabled: true

  - name: "TypeScript changes only"
    event: file.changed
    watch: "src/**/*"
    filter:
      extension: ".ts"
      path: "!*.test.ts"
    prompt: prompts/ts-review.md
    enabled: true

settings:
  timeout_minutes: 30          # default: 30
  timeout_on_fail: break       # "break" (default) or "continue"
  max_concurrent: 1            # default: 1, max: 10
  queue_size: 10               # default: 10, max: 50
```

### Cue-Specific Template Variables

| Variable | Context | Description |
|---|---|---|
| `{{CUE_EVENT_TYPE}}` | All | `time.interval`, `file.changed`, `agent.completed` |
| `{{CUE_EVENT_TIMESTAMP}}` | All | ISO timestamp of the trigger |
| `{{CUE_TRIGGER_NAME}}` | All | Subscription `name` from YAML |
| `{{CUE_RUN_ID}}` | All | UUID for this execution |
| `{{CUE_FILE_PATH}}` | file.changed | Full path of changed file |
| `{{CUE_FILE_NAME}}` | file.changed | Filename only |
| `{{CUE_FILE_DIR}}` | file.changed | Directory of changed file |
| `{{CUE_FILE_EXT}}` | file.changed | File extension |
| `{{CUE_SOURCE_SESSION}}` | agent.completed | Source session name |
| `{{CUE_SOURCE_OUTPUT}}` | agent.completed | Last output from source session |

### New Types

```typescript
// History
export type HistoryEntryType = 'AUTO' | 'USER' | 'CUE';

// System log
export type MainLogLevel = '...' | 'cue';

// CUE pill: teal #06b6d4, icon: Zap
```

### Concurrency Control

Per-session limits prevent burst events from overwhelming the system.

| Setting | Default | Range | Description |
|---|---|---|---|
| `max_concurrent` | 1 | 1–10 | Max simultaneous Cue runs per session |
| `queue_size` | 10 | 0–50 | Max queued events when at concurrency limit |

Behavior:
- When at limit, events queue instead of being dropped
- Stale queued events (older than `timeout_minutes`) are automatically evicted
- Queue drains FIFO as run slots free
- Queue status visible in the Cue Modal sessions table

### Sleep/Wake Reconciliation

Maestro Cue detects laptop sleep via a 30-second heartbeat written to SQLite.

- On wake, if gap ≥ 2 minutes: reconciler fires **one** catch-up event per missed `time.interval` subscription
- `file.changed` events re-initialize naturally (file watchers restart)
- `agent.completed` events are durable through the fan-in tracker
- Catch-up events include `payload.reconciled: true` and `payload.missedCount: N`
- Events older than 7 days are pruned from the journal on startup

### Event Payload Filtering

Subscriptions can include a `filter` block to narrow when they fire. All conditions are AND'd.

| Expression | Meaning | Example |
|---|---|---|
| `"value"` | Exact match | `extension: ".ts"` |
| `"!value"` | Not equal | `status: "!archived"` |
| `">N"` | Greater than | `size: ">1000"` |
| `"<N"` | Less than | `priority: "<5"` |
| `"glob*"` | Glob pattern | `path: "src/**/*.ts"` |
| `true/false` | Boolean | `active: true` |

Dot-notation supported for nested payload fields (e.g., `source.status`).

### Coordination Patterns

Named templates available in the YAML editor for common multi-agent workflows:

| Pattern | Description | Events Used |
|---|---|---|
| **Scheduled Task** | Single agent on a timer | `time.interval` |
| **File Enrichment** | React to file changes | `file.changed` |
| **Reactive** | Trigger on agent completion | `agent.completed` |
| **Research Swarm** | Fan-out → parallel research → synthesize | `time.interval` + `fan_out` + fan-in |
| **Sequential Chain** | A → B → C pipeline | `agent.completed` chaining |
| **Debate** | Opposing perspectives → moderator synthesis | `fan_out` to debaters + fan-in to moderator |

Patterns are available as one-click presets in the YAML editor and documented in the help modal.

### Help Modal Content (Sections)

1. **What is Maestro Cue?** — Event-driven automation. The conductor gives the cue, agents respond.
2. **The YAML File** — `maestro-cue.yaml` at project root, auto-discovered. Code example.
3. **Event Types** — Interval, File Watch, Agent Completed. Each with examples.
4. **Event Filtering** — Filter operators, AND logic, payload field matching.
5. **Template Variables** — Table of `{{CUE_*}}` variables available in prompts.
6. **Fan-Out & Fan-In** — Multi-agent orchestration patterns with diagrams.
7. **Coordination Patterns** — Named templates with ASCII flow diagrams.
8. **Timeouts & Failure** — Default behavior (chain breaks) vs `timeout_on_fail: continue`. Sleep/wake recovery.
9. **Concurrency Control** — Per-session limits, queuing, stale event eviction.
10. **AI YAML Editor** — Free-form text → YAML generation with pattern awareness.
11. **Tips** — Callout boxes for keyboard shortcuts, quick actions.

### Architecture (Files to Create)

**Main Process:**
| File | Purpose |
|---|---|
| `src/main/cue/cue-engine.ts` | Core: loads YAML, manages timers, file watchers, completion listeners, master on/off |
| `src/main/cue/cue-types.ts` | `CueConfig`, `CueSubscription`, `CueEvent`, `CueRunResult` |
| `src/main/cue/cue-executor.ts` | Spawns background agent, substitutes templates, captures results |
| `src/main/cue/cue-file-watcher.ts` | Chokidar watcher with 5s debounce, derived from subscription globs |
| `src/main/cue/cue-filter.ts` | Payload filter matching engine (exact, glob, comparison, negation) |
| `src/main/cue/cue-reconciler.ts` | Sleep/wake reconciliation — catch-up for missed time events |
| `src/main/cue/cue-db.ts` | SQLite event journal + heartbeat (extends existing stats-db pattern) |
| `src/main/ipc/handlers/cue.ts` | IPC handlers: `cue:getStatus`, `cue:enable`, `cue:disable`, `cue:stopRun`, `cue:getLog`, `cue:getQueueStatus` |

**Renderer:**
| File | Purpose |
|---|---|
| `src/renderer/components/CueModal.tsx` | Dashboard: session table, active runs, activity log, master toggle |
| `src/renderer/components/CueYamlEditor.tsx` | AI-assisted code editor with YAML schema awareness |
| `src/renderer/components/CueHelpModal.tsx` | Section-based help (follows `AutoRunnerHelpModal` pattern) |
| `src/renderer/hooks/useCue.ts` | State management, IPC bridge |

**Shared:**
| File | Purpose |
|---|---|
| Extend `src/shared/templateVariables.ts` | Add `CUE_*` variables |
| Extend `src/renderer/types/index.ts` | Add `CUE` to `HistoryEntryType` |
| `src/renderer/constants/cuePatterns.ts` | Named coordination pattern YAML templates |

**Integration Points:**
- `modalPriorities.ts` — Add `CUE_MODAL` and `CUE_HELP` priorities
- `QuickActionsModal.tsx` — Add "Maestro Cue" command
- `useSettings.ts` — Add `cueEnabled` global setting
- `preload.ts` — Add `window.maestro.cue.*` namespace
- `HistoryPanel` — Add CUE pill color/icon
- `LogViewer` — Add `cue` log level with teal color

---

### Implementation Phases

14-phase playbook in `Auto Run Docs/2026-02-14-Maestro-Cue/`:

1. Shared types, template variables, logger extension
2. Cue engine core — YAML loader, timer provider, file watcher
3. Executor — background agent spawning and template substitution
4. IPC handlers and preload API
5. History Panel CUE integration and Log Viewer
6. Cue Modal — dashboard, active runs, activity log
7. YAML editor with AI assistance
8. Help modal and auto-discovery
9. Agent completion chains — fan-out, fan-in, session bridging
10. Polish — hot reload, session indicators, documentation
11. Per-agent concurrency control and event queuing *(Sentinel-inspired)*
12. Sleep/wake reconciliation with SQLite event journal *(Sentinel-inspired)*
13. Event payload filtering with operators *(Sentinel-inspired)*
14. Reusable coordination patterns — named templates *(Sentinel-inspired)*
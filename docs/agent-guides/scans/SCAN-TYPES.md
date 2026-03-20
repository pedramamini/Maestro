# SCAN-TYPES.md - Type and Constant Duplicates

Generated via `grep -rn` on `src/`. All matches are file:line verified. Tests excluded.

---

## Duplicate Interface Definitions

### AgentCapabilities (6 definitions)

```
src/main/agents/capabilities.ts:15                  export interface AgentCapabilities
src/main/preload/agents.ts:17                       export interface AgentCapabilities
src/renderer/global.d.ts:59                         interface AgentCapabilities (first)
src/renderer/global.d.ts:101                        interface AgentCapabilities (second!)
src/renderer/hooks/agent/useAgentCapabilities.ts:14 export interface AgentCapabilities
src/renderer/types/index.ts:747                     export interface AgentCapabilities
```

### UsageStats (6 definitions)

```
src/main/parsers/usage-aggregator.ts:33      export interface UsageStats
src/main/preload/process.ts:88               export interface UsageStats
src/main/process-manager/types.ts:91         export interface UsageStats
src/renderer/global.d.ts:142                 interface UsageStats
src/shared/types.ts:43                       export interface UsageStats
src/web/hooks/useWebSocket.ts:29             export interface UsageStats
```

### SessionInfo (6 definitions)

```
src/main/debug-package/collectors/sessions.ts:13    export interface SessionInfo
src/main/group-chat/group-chat-router.ts:60          export interface SessionInfo
src/renderer/components/CuePipelineEditor/PipelineCanvas.tsx:56  interface SessionInfo
src/renderer/hooks/cue/usePipelineLayout.ts:19       export interface SessionInfo
src/renderer/hooks/cue/usePipelineState.ts:30         export interface SessionInfo
src/shared/types.ts:31                               export interface SessionInfo
```

### AgentConfig (5 definitions)

```
src/main/agents/definitions.ts:72            export interface AgentConfig
src/main/preload/agents.ts:39                export interface AgentConfig
src/renderer/global.d.ts:87                  interface AgentConfig
src/renderer/types/index.ts:774              export interface AgentConfig
src/shared/types.ts:143                      export interface AgentConfig
```

### AgentConfigsData (5 definitions)

```
src/main/ipc/handlers/agents.ts:183          interface AgentConfigsData
src/main/ipc/handlers/index.ts:124           interface AgentConfigsData
src/main/ipc/handlers/process.ts:47          interface AgentConfigsData
src/main/ipc/handlers/tabNaming.ts:47        interface AgentConfigsData
src/main/stores/types.ts:105                 export interface AgentConfigsData
```

### StatsAggregation (4 definitions)

```
src/main/preload/stats.ts:66                              export interface StatsAggregation
src/renderer/components/UsageDashboard/UsageDashboardModal.tsx:73   interface StatsAggregation
src/renderer/hooks/stats/useStats.ts:24                    export interface StatsAggregation
src/shared/stats-types.ts:77                               export interface StatsAggregation
```

### AutoRunSession (4 definitions)

```
src/main/preload/stats.ts:29                                     export interface AutoRunSession
src/renderer/components/UsageDashboard/AutoRunStats.tsx:24        interface AutoRunSession
src/renderer/components/UsageDashboard/LongestAutoRunsTable.tsx:25  interface AutoRunSession
src/shared/stats-types.ts:26                                      export interface AutoRunSession
```

### SlashCommand (4 definitions)

```
src/renderer/components/InputArea.tsx:42                  interface SlashCommand
src/renderer/components/MainPanel.tsx:62                  interface SlashCommand
src/renderer/slashCommands.ts:6                           export interface SlashCommand
src/web/mobile/SlashCommandAutocomplete.tsx:23             export interface SlashCommand
```

### ShellInfo (4 definitions)

```
src/main/preload/system.ts:13               export interface ShellInfo
src/main/utils/shellDetector.ts:4           export interface ShellInfo
src/renderer/global.d.ts:135                interface ShellInfo
src/renderer/types/index.ts:833             export interface ShellInfo
```

### ProcessConfig (4 definitions)

```
src/main/preload/process.ts:25              export interface ProcessConfig
src/main/process-manager/types.ts:9         export interface ProcessConfig
src/renderer/global.d.ts:19                 interface ProcessConfig
src/renderer/types/index.ts:791             export interface ProcessConfig
```

### ProgressStage (4 definitions)

```
src/renderer/components/MergeProgressModal.tsx:28         interface ProgressStage
src/renderer/components/MergeProgressOverlay.tsx:24       interface ProgressStage
src/renderer/components/SummarizeProgressModal.tsx:29     interface ProgressStage
src/renderer/components/SummarizeProgressOverlay.tsx:24   interface ProgressStage
```

### ClaudeSessionOriginsData (4 definitions)

```
src/main/ipc/handlers/claude.ts:121                  interface ClaudeSessionOriginsData
src/main/ipc/handlers/index.ts:138                   interface ClaudeSessionOriginsData
src/main/storage/claude-session-storage.ts:52        export interface ClaudeSessionOriginsData
src/main/stores/types.ts:135                         export interface ClaudeSessionOriginsData
```

### 3-definition interfaces (17 total)

```
UpdateStatus (3):
  src/main/auto-updater.ts:15
  src/main/preload/system.ts:23
  src/renderer/components/UpdateCheckModal.tsx:40

SshConfigHost (3):
  src/main/preload/sshRemote.ts:33
  src/main/utils/ssh-config-parser.ts:19
  src/renderer/components/Settings/SshRemoteModal.tsx:45

SpecKitMetadata (3):
  src/main/speckit-manager.ts:96
  src/prompts/speckit/index.ts:36
  src/renderer/types/index.ts:860

OpenSpecMetadata (3):
  src/main/openspec-manager.ts:67
  src/prompts/openspec/index.ts:36
  src/renderer/types/index.ts:878

SessionMessage (3):
  src/main/agents/session-storage.ts:32
  src/renderer/components/AgentSessionsModal.tsx:31
  src/renderer/hooks/agent/useSessionViewer.ts:6

LogEntry (3):
  src/renderer/types/index.ts:178
  src/web/hooks/useMobileSessionManagement.ts:46
  src/web/mobile/MessageHistory.tsx:19

LeaderboardSubmitResponse (3):
  src/main/ipc/handlers/leaderboard.ts:67
  src/main/preload/leaderboard.ts:45
  src/renderer/types/index.ts:928

EditingCommand (3):
  src/renderer/components/AICommandsPanel.tsx:25
  src/renderer/components/OpenSpecCommandsPanel.tsx:21
  src/renderer/components/SpecKitCommandsPanel.tsx:21

DirectoryEntry (3):
  src/main/preload/fs.ts:16
  src/renderer/global.d.ts:128
  src/renderer/types/index.ts:825

CueSessionStatus (3):
  src/main/cue/cue-types.ts:132
  src/main/preload/cue.ts:53
  src/renderer/hooks/useCue.ts:42

CueRunResult (3):
  src/main/cue/cue-types.ts:116
  src/main/preload/cue.ts:37
  src/renderer/hooks/useCue.ts:26

CueEvent (3):
  src/main/cue/cue-types.ts:104
  src/main/preload/cue.ts:28
  src/renderer/hooks/useCue.ts:17

ClaudeSessionOriginInfo (3):
  src/main/ipc/handlers/claude.ts:114
  src/main/ipc/handlers/index.ts:132
  src/main/stores/types.ts:128

BootstrapSettings (3):
  src/main/group-chat/group-chat-storage.ts:71
  src/main/ipc/handlers/system.ts:38
  src/main/stores/types.ts:37

AutoRunTask (3):
  src/main/preload/stats.ts:41
  src/renderer/components/UsageDashboard/TasksByHourChart.tsx:22
  src/shared/stats-types.ts:41

AutoRunState (3):
  src/main/preload/web.ts:15
  src/main/web-server/types.ts:163
  src/web/hooks/useWebSocket.ts:93

AgentSessionInfo (3):
  src/cli/services/agent-sessions.ts:33
  src/main/agents/session-storage.ts:45
  src/renderer/components/CuePipelineEditor/drawers/AgentDrawer.tsx:5
```

---

## Duplicate Constant Definitions

### AUTO_RUN_FOLDER_NAME (3 definitions)

```
src/renderer/components/Wizard/services/phaseGenerator.ts:153    export const AUTO_RUN_FOLDER_NAME = PLAYBOOKS_DIR
src/renderer/services/inlineWizardDocumentGeneration.ts:25       export const AUTO_RUN_FOLDER_NAME = PLAYBOOKS_DIR
src/renderer/utils/existingDocsDetector.ts:13                    export const AUTO_RUN_FOLDER_NAME = PLAYBOOKS_DIR
```

All three are identical (`= PLAYBOOKS_DIR`). The canonical constant is `PLAYBOOKS_DIR` in `src/shared/maestro-paths.ts:14`.

### DEFAULT_CAPABILITIES (2 definitions)

```
src/main/agents/capabilities.ts:98                      export const DEFAULT_CAPABILITIES: AgentCapabilities
src/renderer/hooks/agent/useAgentCapabilities.ts:89      export const DEFAULT_CAPABILITIES: AgentCapabilities
```

---

## Top 20 Most-Duplicated CSS className Strings

Across all `.tsx` files in `src/`:

| Rank | className | Count |
|------|-----------|-------|
| 1 | `"w-4 h-4"` | 354 |
| 2 | `"w-3 h-3"` | 313 |
| 3 | `"w-3.5 h-3.5"` | 219 |
| 4 | `"text-xs"` | 211 |
| 5 | `"w-5 h-5"` | 176 |
| 6 | `"flex items-center gap-2"` | 154 |
| 7 | `"text-sm"` | 120 |
| 8 | `"text-sm font-medium"` | 84 |
| 9 | `"flex items-center gap-3"` | 63 |
| 10 | `"flex-1"` | 59 |
| 11 | `"font-bold"` | 50 |
| 12 | `"relative"` | 47 |
| 13 | `"font-medium"` | 45 |
| 14 | `"flex items-center gap-2 mb-3"` | 43 |
| 15 | `"flex-1 min-w-0"` | 40 |
| 16 | `"p-4 rounded-lg"` | 39 |
| 17 | `"p-1 rounded hover:bg-white/10 transition-colors"` | 39 |
| 18 | `"space-y-2"` | 35 |
| 19 | `"flex items-center gap-1"` | 35 |
| 20 | `"w-4 h-4 animate-spin"` | 32 |

Note: These are exact `className="..."` matches only (not template literal classNames). The icon sizes (`w-4 h-4`, `w-3 h-3`, etc.) and layout patterns (`flex items-center gap-2`) dominate. While CSS className repetition is normal in Tailwind, the compound patterns like `"p-1 rounded hover:bg-white/10 transition-colors"` (39x) and `"flex items-center gap-2 mb-3"` (43x) suggest opportunities for shared component extraction.

---

## Summary

| Category | Total Duplicates | Top Offenders |
|----------|-----------------|---------------|
| Interfaces with 4+ defs | 11 interfaces, 50 total definitions | AgentCapabilities (6), UsageStats (6), SessionInfo (6) |
| Interfaces with 3 defs | 17 interfaces, 51 total definitions | Cue types (3x3), preload mirrors |
| Duplicate constants | 5 definitions | AUTO_RUN_FOLDER_NAME (3), DEFAULT_CAPABILITIES (2) |
| Repeated CSS patterns | 1,704 class repetitions (top 20) | Icon sizes: 1,062 occurrences |

**Root cause pattern:** Types are defined at the canonical source (e.g., `shared/types.ts`), then re-declared in preload files (`main/preload/*.ts`), then re-declared again in renderer type files (`renderer/types/index.ts`, `renderer/global.d.ts`), and sometimes a fourth time in component-local interfaces. The preload boundary is the primary driver of this duplication.

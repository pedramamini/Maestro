# SCAN-FORMATTERS.md - Formatter Duplicates

Generated via `grep -rn` on `src/`. All matches are file:line verified. Tests excluded.

---

## formatDuration / formatElapsed / formatTime definitions (46 total)

### Shared/canonical definitions

```
src/shared/formatters.ts:144               export function formatElapsedTime(ms: number): string
src/shared/formatters.ts:188               export function formatElapsedTimeColon(seconds: number): string
src/shared/performance-metrics.ts:336      export function formatDuration(durationMs: number): string
```

### Local re-definitions of formatDuration (ms -> string)

```
src/cli/output/formatter.ts:478                             function formatDuration(ms: number): string
src/cli/output/formatter.ts:618                             function formatDurationSeconds(seconds: number): string
src/renderer/components/AboutModal.tsx:92                    const formatDuration = (ms: number): string =>
src/renderer/components/FirstRunCelebration.tsx:64           function formatDuration(ms: number): string
src/renderer/components/SymphonyModal.tsx:124                function formatDurationMs(ms: number): string
src/renderer/components/Toast.tsx:11                         function formatDuration(ms: number): string
src/renderer/components/DirectorNotes/AIOverviewTab.tsx:56   const formatDurationMs = (ms: number): string =>
src/renderer/hooks/symphony/useContributorStats.ts:147       function formatDuration(ms: number): string
src/renderer/utils/groupChatExport.ts:41                     function formatDuration(messages): string
src/renderer/utils/tabExport.ts:42                           function formatDuration(logs): string
```

### UsageDashboard - 10 identical formatDuration definitions

```
src/renderer/components/UsageDashboard/ActivityHeatmap.tsx:206
src/renderer/components/UsageDashboard/AgentComparisonChart.tsx:75
src/renderer/components/UsageDashboard/AgentEfficiencyChart.tsx:32
src/renderer/components/UsageDashboard/AgentUsageChart.tsx:68
src/renderer/components/UsageDashboard/AutoRunStats.tsx:49
src/renderer/components/UsageDashboard/DurationTrendsChart.tsx:64
src/renderer/components/UsageDashboard/LongestAutoRunsTable.tsx:49
src/renderer/components/UsageDashboard/PeakHoursChart.tsx:43
src/renderer/components/UsageDashboard/SourceDistributionChart.tsx:44
src/renderer/components/UsageDashboard/SummaryCards.tsx:51
src/renderer/components/UsageDashboard/WeekdayComparisonChart.tsx:31
```

### formatElapsed / formatElapsedTime re-definitions

```
src/renderer/components/MergeProgressModal.tsx:58            function formatElapsedTime(ms: number): string
src/renderer/components/MergeProgressOverlay.tsx:53          function formatElapsedTime(ms: number): string
src/renderer/components/SummarizeProgressModal.tsx:57         function formatElapsedTime(ms: number): string
src/renderer/components/SummarizeProgressOverlay.tsx:51       function formatElapsedTime(ms: number): string
src/renderer/components/TransferProgressModal.tsx:79          function formatElapsedTime(ms: number): string
src/renderer/components/RightPanel.tsx:264                   const formatElapsed = useCallback((ms: number) =>
src/renderer/components/TerminalOutput.tsx:981               const formatElapsedTime = (seconds: number): string =>
```

### formatTime / formatTimestamp re-definitions

```
src/renderer/components/GroupChatHistoryPanel.tsx:572         const formatTime = (timestamp: number) =>
src/renderer/components/GroupChatMessages.tsx:159             const formatTimestamp = (timestamp: string | number) =>
src/renderer/components/History/HistoryEntryItem.tsx:45       const formatTime = (timestamp: number) =>
src/renderer/components/HistoryDetailModal.tsx:158            const formatTime = (timestamp: number) =>
src/renderer/components/InlineWizard/WizardMessageBubble.tsx:59   function formatTimestamp(timestamp: number): string
src/renderer/components/ParticipantCard.tsx:27                function formatTime(timestamp: number): string
src/renderer/components/ThinkingStatusPill.tsx:43             const formatTime = (seconds: number): string =>
src/renderer/components/UsageDashboard/LongestAutoRunsTable.tsx:115   function formatTime(timestamp: number): string
src/renderer/components/Wizard/screens/ConversationScreen.tsx:52      function formatTimestamp(timestamp: number): string
src/renderer/constants/conductorBadges.ts:287                export function formatTimeRemaining(...)
src/renderer/utils/groupChatExport.ts:33                     function formatTimestamp(timestamp: string | number): string
src/renderer/utils/tabExport.ts:34                           function formatTimestamp(timestamp: number): string
src/web/mobile/MessageHistory.tsx:45                          function formatTime(timestamp: number): string
src/web/mobile/MobileHistoryPanel.tsx:28                      function formatTime(timestamp: number): string
src/web/mobile/ResponseViewer.tsx:69                          function formatTimestamp(timestamp: number): string
```

---

## formatNumber / formatSize / formatFileSize definitions (10 total)

### Shared/canonical definitions

```
src/shared/formatters.ts:27                export function formatSize(bytes: number): string
src/shared/formatters.ts:41                export function formatNumber(num: number): string
```

### Local re-definitions of formatNumber

```
src/main/ipc/handlers/symphony.ts:928                              const formatNumber = (n: number) =>
src/renderer/components/UsageDashboard/AgentComparisonChart.tsx:93  function formatNumber(num: number): string
src/renderer/components/UsageDashboard/AutoRunStats.tsx:70          function formatNumber(num: number): string
src/renderer/components/UsageDashboard/LocationDistributionChart.tsx:40  function formatNumber(num: number): string
src/renderer/components/UsageDashboard/SourceDistributionChart.tsx:62    function formatNumber(num: number): string
src/renderer/components/UsageDashboard/SummaryCards.tsx:72          function formatNumber(num: number): string
```

### Local re-definitions of formatFileSize

```
src/renderer/components/FilePreview.tsx:265           const formatFileSize = (bytes: number): string =>
src/renderer/utils/documentStats.ts:92                export function formatFileSize(bytes: number): string
```

---

## estimateTokens / estimateTokenCount definitions (7 total)

### Shared/canonical definitions

```
src/shared/formatters.ts:176                    export function estimateTokenCount(text: string): number
src/renderer/utils/tokenCounter.ts:55           export function estimateTokens(text: string): number
```

### Local re-definitions

```
src/renderer/components/MergeSessionModal.tsx:82      function estimateTokens(logs: { text: string }[]): number
src/renderer/components/SendToAgentModal.tsx:113       function estimateTokens(logs: { text: string }[]): number
src/renderer/hooks/agent/useMergeSession.ts:48         function estimateTokensFromLogs(logs: { text: string }[]): number
src/renderer/hooks/agent/useSendToAgent.ts:54           function estimateTokensFromLogs(logs: { text: string }[]): number
src/renderer/utils/contextExtractor.ts:442              export function estimateTokenCount(context: ContextSource): number
```

Note: `MergeSessionModal` and `SendToAgentModal` have identical implementations. `useMergeSession` and `useSendToAgent` also have identical implementations (same function, different name).

---

## stripAnsi definitions (2 total)

```
src/main/utils/stripAnsi.ts:47              export function stripAnsi(str: string): string
src/shared/stringUtils.ts:36                export function stripAnsiCodes(text: string): string
```

Same functionality, different names, different locations.

---

## generateId / generateUUID definitions (7 total)

```
src/shared/uuid.ts:10                                           export function generateUUID(): string
src/renderer/utils/ids.ts:2                                     export const generateId = () => crypto.randomUUID()
src/main/stats/utils.ts:29                                      export function generateId(): string
src/renderer/hooks/session/useBatchedSessionUpdates.ts:99       const generateId = (): string =>
src/renderer/hooks/ui/useLayerStack.ts:35                       function generateId(): string
src/web/hooks/useCommandHistory.ts:67                           function generateId(): string
src/web/hooks/useOfflineQueue.ts:107                            function generateId(): string
```

---

## Summary

| Formatter | Canonical Location | Duplicates | Worst Offender |
|-----------|--------------------|------------|----------------|
| `formatDuration(ms)` | `shared/formatters.ts` | 21 | UsageDashboard (11 identical copies) |
| `formatElapsedTime(ms)` | `shared/formatters.ts:144` | 5 | Progress modals (3 identical copies) |
| `formatTime(timestamp)` | none | 15 | No canonical, 15 local definitions |
| `formatNumber(num)` | `shared/formatters.ts:41` | 5 | UsageDashboard (5 copies) |
| `formatFileSize(bytes)` | `shared/formatters.ts:27` (as formatSize) | 2 | FilePreview, documentStats |
| `estimateTokens` | `shared/formatters.ts:176` | 4 | Merge/SendTo modal pairs (identical) |
| `stripAnsi` | `main/utils/stripAnsi.ts` | 1 | `shared/stringUtils.ts` (duplicate) |
| `generateId` | `shared/uuid.ts` + `renderer/utils/ids.ts` | 4 | web hooks, layer stack |

**Total: 46 time formatters, 10 number/size formatters, 7 token estimators, 2 stripAnsi, 7 ID generators = 72 formatter definitions that should consolidate to ~8.**

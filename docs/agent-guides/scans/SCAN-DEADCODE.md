# SCAN-DEADCODE.md - Dead Code

Generated: 2026-03-20 via `grep -rn` against `src/`

Methodology: For each export, count references in all `.ts`/`.tsx` files excluding the defining file and test files. Zero external references = dead.

---

## Dead Component Files (0 non-test imports)

| Component | File |
|-----------|------|
| `AgentSessionsModal` | `renderer/components/AgentSessionsModal.tsx` |
| `GitWorktreeSection` | `renderer/components/GitWorktreeSection.tsx` |
| `GroupChatParticipants` | `renderer/components/GroupChatParticipants.tsx` |
| `MergeProgressModal` | `renderer/components/MergeProgressModal.tsx` |
| `ShortcutEditor` | `renderer/components/ShortcutEditor.tsx` |
| `SummarizeProgressModal` | `renderer/components/SummarizeProgressModal.tsx` |
| `ThemePicker` | `renderer/components/ThemePicker.tsx` |

**Total: 7 component files with zero production imports.**

---

## Dead Store Selectors (exported but zero external uses)

### agentStore.ts
- `selectAvailableAgents`
- `selectAgentsDetected`
- `getAgentState`
- `getAgentActions`

### batchStore.ts
- `selectStoppingBatchSessionIds`
- `selectBatchRunState`
- `getBatchActions`

### fileExplorerStore.ts
- `getFileExplorerState`
- `getFileExplorerActions`

### groupChatStore.ts
- `getGroupChatState`
- `getGroupChatActions`

### modalStore.ts
- `selectModalOpen`
- `selectModal`

### notificationStore.ts
- `selectToasts`
- `selectToastCount`
- `selectConfig`
- `resetToastIdCounter`
- `getNotificationState`
- `getNotificationActions`

### operationStore.ts
- `selectIsAnyOperationInProgress`
- `getOperationState`
- `getOperationActions`

### sessionStore.ts
- `selectBookmarkedSessions`
- `selectSessionsByGroup`
- `selectUngroupedSessions`
- `selectGroupById`
- `selectSessionCount`
- `selectIsReady`
- `selectIsAnySessionBusy`
- `getSessionState`
- `getSessionActions`

### settingsStore.ts
- `DEFAULT_CONTEXT_MANAGEMENT_SETTINGS`
- `DEFAULT_AUTO_RUN_STATS`
- `DEFAULT_USAGE_STATS`
- `DEFAULT_KEYBOARD_MASTERY_STATS`
- `DEFAULT_ONBOARDING_STATS`
- `DEFAULT_ENCORE_FEATURES`
- `DEFAULT_DIRECTOR_NOTES_SETTINGS`
- `DEFAULT_AI_COMMANDS`
- `getBadgeLevelForTime`
- `getSettingsState`
- `getSettingsActions`

### tabStore.ts
- `selectActiveTab`
- `selectActiveFileTab`
- `selectUnifiedTabs`
- `selectTabById`
- `selectFileTabById`
- `selectTabCount`
- `selectAllTabs`
- `selectAllFileTabs`
- `selectActiveTerminalTab`
- `selectTerminalTabs`
- `getTabState`
- `getTabActions`

**Total: 53 dead store exports across 9 store files.**

---

## Dead Shared Utils (exported but zero external imports)

### shared/agentMetadata.ts
- `AGENT_DISPLAY_NAMES`
- `BETA_AGENTS`

### shared/cli-activity.ts
- `CliActivityStatus`
- `CliActivityFile`
- `readCliActivities`
- `updateCliActivity`
- `cleanupStaleActivities`

### shared/cli-server-discovery.ts
- `CliServerInfo`

### shared/cue-pipeline-types.ts
- `DebateConfig`
- `PipelineNodePosition`
- `PipelineNodeType`
- `PipelineViewport`

### shared/deep-link-urls.ts
- `buildFocusDeepLink`

### shared/gitUtils.ts
- `GitFileStatus`
- `GitNumstatFile`
- `GitBehindAhead`
- `cleanBranchName`
- `cleanGitPath`
- `GIT_IMAGE_EXTENSIONS`

### shared/history.ts
- `ORPHANED_SESSION_ID`
- `DEFAULT_PAGINATION`

### shared/logger-types.ts
- `shouldLogLevel`

### shared/maestro-paths.ts
- `PLAYBOOKS_FOLDER_NAME`
- `PLAYBOOKS_RUNS_DIR`
- `PIPELINE_INPUT_PROMPT`
- `PIPELINE_OUTPUT_PROMPT`
- `LEGACY_PLAYBOOKS_RUNS_DIR`
- `ALWAYS_VISIBLE_ENTRIES`

### shared/marketplace-types.ts
- `PlaybookSource`

### shared/pathUtils.ts
- `parseVersion`

### shared/performance-metrics.ts
- `PerformanceLogger`
- `createNoOpMetrics`

### shared/symphony-constants.ts
- `DRAFT_PR_TITLE_TEMPLATE`
- `DRAFT_PR_BODY_TEMPLATE`
- `READY_PR_BODY_TEMPLATE`

### shared/symphony-types.ts
- `SymphonyLabel`
- `SymphonyErrorType`

### shared/synopsis.ts
- `ParsedSynopsis`
- `isNothingToReport`

### shared/templateVariables.ts
- `TemplateSessionInfo`

### shared/treeUtils.ts
- `WalkTreeOptions`
- `walkTree`
- `PartitionedPaths`

### shared/types.ts
- `SshRemoteStatus`

**Total: 44 dead shared exports across 18 files.**

---

## Dead Main Process Exports

### main/constants.ts
- `DEBUG_GROUP_CHAT`
- `debugLogLazy`

### main/cue/cue-db.ts
- `isCueDbReady`
- `getRecentCueEvents`
- `clearGitHubSeenForSubscription`

### main/cue/cue-heartbeat.ts
- `HEARTBEAT_INTERVAL_MS`
- `SLEEP_THRESHOLD_MS`

### main/cue/cue-subscription-setup.ts
- `DEFAULT_FILE_DEBOUNCE_MS`

### main/cue/cue-task-scanner.ts
- `extractPendingTasks`

### main/cue/cue-types.ts
- `CUE_YAML_FILENAME`
- `LEGACY_CUE_YAML_FILENAME`

### main/debug-package/collectors/sanitize.ts
- `sanitizeText`

### main/group-chat/group-chat-agent.ts
- `getParticipantSystemPrompt`
- `getParticipantSessionId`
- `isParticipantActive`
- `getActiveParticipants`
- `clearAllParticipantSessionsGlobal`

### main/group-chat/group-chat-config.ts
- `getCustomShellPath`

### main/group-chat/group-chat-log.ts
- `escapeContent`
- `unescapeContent`

### main/group-chat/group-chat-moderator.ts
- `startSessionCleanup`
- `stopSessionCleanup`
- `clearAllModeratorSessions`

### main/group-chat/group-chat-router.ts
- `setGroupChatReadOnlyState`
- `getPendingParticipants`
- `clearPendingParticipants`
- `extractMentions`
- `extractAllMentions`

### main/group-chat/group-chat-storage.ts
- `getGroupChatsDir`

### main/group-chat/output-buffer.ts
- `hasGroupChatBuffer`
- `isGroupChatBufferTruncated`

### main/group-chat/output-parser.ts
- `extractTextGeneric`
- `extractTextFromAgentOutput`

### main/group-chat/session-recovery.ts
- `detectSessionNotFoundError`

### main/ipc/handlers/autorun.ts
- `getAutoRunWatcherCount`

### main/ipc/handlers/director-notes.ts
- `sanitizeDisplayName`

### main/ipc/handlers/documentGraph.ts
- `getDocumentGraphWatcherCount`

### main/ipc/handlers/index.ts
- `registerAllHandlers`

### main/ipc/handlers/notifications.ts
- `parseNotificationCommand`
- `getNotificationQueueLength`
- `getActiveNotificationCount`
- `clearNotificationQueue`
- `resetNotificationState`
- `getNotificationMaxQueueSize`

### main/parsers/agent-output-parser.ts
- `isValidToolType`

### main/parsers/index.ts
- `initializeOutputParsers`
- `ensureParsersInitialized`

### main/process-listeners/index.ts
- `setupProcessListeners`

### main/stats/migrations.ts
- `getMigrations`

### main/storage/index.ts
- `initializeSessionStorages`

### main/stores/utils.ts
- `findSshRemoteById`

### main/utils/cliDetection.ts
- `clearCloudflaredCache`
- `getGhPath`
- `clearGhCache`
- `getSshPath`
- `clearSshCache`

### main/utils/execFile.ts
- `needsWindowsShell`

### main/utils/ipcHandler.ts
- `createHandler`
- `createDataHandler`
- `withErrorLogging`
- `createIpcDataHandler`

### main/utils/sentry.ts
- `stopMemoryMonitoring`

### main/utils/shell-escape.ts
- `shellEscapeArgs`

### main/utils/shellDetector.ts
- `getShellCommand`

### main/utils/ssh-command-builder.ts
- `buildRemoteCommand`

### main/utils/ssh-config-parser.ts
- `parseConfigContent`
- `findSshConfigHost`

### main/utils/statsCache.ts
- `getStatsCachePath`
- `getGlobalStatsCachePath`

### main/utils/terminalFilter.ts
- `isCommandEcho`
- `extractCommand`

### main/utils/wslDetector.ts
- `isWindowsMountPath`
- `getWslWarningMessage`

### main/wakatime-manager.ts
- `detectLanguageFromPath`
- `WRITE_TOOL_NAMES`

**Total: 75 dead main process exports across 35 files.**

---

## Summary

| Category | Dead Exports |
|----------|-------------|
| Components (0 imports) | 7 files |
| Store selectors | 53 exports |
| Shared utils | 44 exports |
| Main process | 75 exports |
| **Grand Total** | **179 dead exports** |

# Supplementary Scan - Patterns Missed by Domain Scans

Additional duplicated functions found via cross-codebase function name analysis.

---

## 1. `getSessionDisplayName` - 6 definitions

**Canonical:** Should be extracted to `src/renderer/utils/sessionHelpers.ts` (or `src/shared/`)

### All definitions:
- `src/renderer/components/MergeSessionModal.tsx:136` - `function getSessionDisplayName(session: Session): string`
- `src/renderer/components/SendToAgentModal.tsx:105` - `function getSessionDisplayName(session: Session): string`
- `src/renderer/components/UsageDashboard/AgentUsageChart.tsx:143` - `function getSessionDisplayName(sessionId: string, sessions?: Session[]): string` (different signature)
- `src/renderer/hooks/agent/useMergeSession.ts:115` - `function getSessionDisplayName(session: Session): string`
- `src/renderer/hooks/agent/useSendToAgent.ts:113` - `function getSessionDisplayName(session: Session): string`
- `src/web/mobile/AllSessionsView.tsx:258` - `function getSessionDisplayName(session: Session, sessions: Session[]): string` (different signature)

### Analysis:
- 4 definitions have identical signature `(session: Session): string`
- AgentUsageChart takes `(sessionId, sessions?)` - different approach
- Web mobile version takes `(session, sessions)` for parent lookup
- **Migration:** Extract canonical to `src/renderer/utils/sessionHelpers.ts`, update 4 identical sites. AgentUsageChart and web need adapter wrappers.

---

## 2. `formatTimestamp` - 6 definitions

**Canonical:** Should be extracted to `src/shared/formatters.ts`

### All definitions:
- `src/renderer/components/GroupChatMessages.tsx:162` - `const formatTimestamp = (timestamp: string | number) => {...}` (inline arrow)
- `src/renderer/components/InlineWizard/WizardMessageBubble.tsx:59` - `function formatTimestamp(timestamp: number): string`
- `src/renderer/components/Wizard/screens/ConversationScreen.tsx:52` - `function formatTimestamp(timestamp: number): string`
- `src/renderer/utils/groupChatExport.ts:33` - `function formatTimestamp(timestamp: string | number): string`
- `src/renderer/utils/tabExport.ts:34` - `function formatTimestamp(timestamp: number): string`
- `src/web/mobile/ResponseViewer.tsx:69` - `function formatTimestamp(timestamp: number): string`

### Analysis:
- 4 definitions take `number` and return `HH:MM` or `HH:MM:SS` format
- 2 definitions accept `string | number` (GroupChat variants handle ISO strings)
- **Migration:** Extract to `src/shared/formatters.ts` with `(timestamp: string | number): string` signature, update all 6 sites.

---

## Summary

| Pattern | Count | Est. Savings |
|---------|-------|-------------|
| `getSessionDisplayName` | 6 definitions | ~60 lines |
| `formatTimestamp` | 6 definitions | ~50 lines |
| **Total** | 12 definitions | ~110 lines |

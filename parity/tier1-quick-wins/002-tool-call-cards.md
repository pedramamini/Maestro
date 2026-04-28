# Task 002 — Tool call card display in mobile response viewer

## Context

When Claude (or another agent) calls a tool (file_search, edit, bash, etc.), desktop renders a `ToolCallCard` showing the tool name, status (running/success/error), and collapsible input/output JSON. Mobile shows the raw text — readable but unstructured.

## Desktop reference

- `src/renderer/components/ToolCallCard.tsx` — name, status icon, collapsible JSON

## Web target

- New: `src/web/mobile/ToolCallCard.tsx`
- Modify: `src/web/mobile/MessageHistory.tsx` (or wherever rendered output is parsed) to detect tool-call segments and render the card

## Acceptance criteria

- [ ] Tool calls in agent output render as a card, not raw text
- [ ] Card shows: tool name, status icon (▶ running, ✓ success, ✗ error), tap-to-expand JSON
- [ ] Both input args and output result are available in expanded view
- [ ] Long output is scrollable within the card (does not blow out the viewport)
- [ ] Plain text messages render unchanged
- [ ] Lint, ESLint, tests all green

## Implementation tasks

- [ ] Read `ToolCallCard.tsx` desktop implementation
- [ ] Identify how tool calls are demarcated in the message stream (probably specific JSON markers or a structured event type — check `MessageHistory.tsx` desktop for parsing)
- [ ] Decide rendering approach: inline component within message stream, or separate card stack — match desktop UX
- [ ] Build `src/web/mobile/ToolCallCard.tsx` with collapse/expand state
- [ ] Update `MessageHistory.tsx` (mobile) to route tool-call segments to the card
- [ ] Use system fonts; mono for JSON
- [ ] Handle the running state (live updates as the tool executes)
- [ ] Run validation
- [ ] Commit: `feat(web): render tool calls as cards in mobile response viewer`

## Pitfalls

- Don't reimplement message parsing if a shared util exists in `src/shared/`
- JSON viewer can be ugly on mobile — pre-format with 2-space indent, monospace, no syntax highlighting (keep bundle small)
- A streaming tool call's output mutates over time — make sure your rendering re-runs on update without flicker

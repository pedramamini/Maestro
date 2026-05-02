> **State source-of-truth**: Work Graph is the canonical PM data model; Maestro Board is the UI for that data. Use concrete local actions such as `/PM status`, `/PM prd-list`, `/PM epic-list`, `/PM issue-show <id>`, `/PM issue-status <id>`, `/PM epic-sync <id>`, `/PM issue-sync <id>`, `/PM issue-start <id>`, or the app IPC channels listed in `pm-mode-system.md`. Shell agents can inspect dispatch with `maestro-cli fleet board --project <path> --json` and `maestro-cli fleet list --json`. Do NOT use GitHub labels, GitHub issues, or GitHub Projects fields as runtime PM state.

# /PM prd-edit

You are reopening a Conversational PRD session to edit an existing PRD.

The PRD ID is: {{ARGS}}

## Your role

Load the current state of this PRD and present a brief summary of:

- The feature title and problem statement
- Current status and any incomplete sections

Then ask the user what they would like to change. Common edits include:

- Expanding or narrowing scope
- Updating success criteria
- Revising constraints or dependencies
- Adding or removing out-of-scope items

## Editing guidelines

- Show the field being edited before and after so the user can confirm
- Ask one focused question at a time
- Do not discard existing content unless explicitly asked
- When edits are complete, confirm the updated PRD and suggest `/PM epic-decompose {{ARGS}}` to regenerate the epic if the scope changed significantly

## Output format

After each change, summarize the full updated field so the context is clear.

Signal **"Ready to save"** on its own line when the user confirms all edits are complete.

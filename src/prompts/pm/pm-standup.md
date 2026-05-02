> **State source-of-truth**: Work Graph is the canonical PM data model; Maestro Board is the UI for that data. Use concrete local actions such as `/PM status`, `/PM prd-list`, `/PM epic-list`, `/PM issue-show <id>`, `/PM issue-status <id>`, `/PM epic-sync <id>`, `/PM issue-sync <id>`, `/PM issue-start <id>`, or the app IPC channels listed in `pm-mode-system.md`. Shell agents can inspect dispatch with `maestro-cli fleet board --project <path> --json` and `maestro-cli fleet list --json`. Do NOT use GitHub labels, GitHub issues, or GitHub Projects fields as runtime PM state.

# /PM standup

Generate a concise standup summary for the current project.

Format:

## Standup — {{DATE}}

**Yesterday** (Done or moved to Done in the past 24 hours):

- Item title (ID)

**Today** (In Progress or claimed):

- Item title (ID) — assigned to <agent/user>

**Blockers**:

- Item title (ID) — blocking reason

Keep each line short (one sentence max). If a section has no items, write "Nothing to report."
This summary is designed to be pasted directly into a team channel or ticket comment.

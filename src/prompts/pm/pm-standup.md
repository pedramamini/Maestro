> **State source-of-truth**: Work Graph is the canonical PM data model; Maestro Board is the UI for that data. Use concrete local actions such as `/PM status`, `/PM prd-list`, `/PM epic-list`, `/PM issue-show <id>`, `/PM issue-status <id>`, `/PM epic-sync <id>`, `/PM issue-sync <id>`, `/PM issue-start <id>`, or the app IPC channels listed in `pm-mode-system.md`. Shell agents can inspect dispatch with `{{MAESTRO_CLI_PATH}} fleet board --project <path> --json` and `{{MAESTRO_CLI_PATH}} fleet list --json`. Shell agents must create or update board items with `{{MAESTRO_CLI_PATH}} pm work ...`; if that bridge is unavailable, stop and report the blocker instead of creating markdown-only work. Do NOT use GitHub labels, GitHub issues, or GitHub Projects fields as runtime PM state.

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

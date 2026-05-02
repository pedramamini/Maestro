> **State source-of-truth**: This project uses Maestro Board/Work Graph for all PM and dispatch state. Do NOT use GitHub labels or GitHub Projects fields as runtime state. Query and update state through Maestro PM IPC/commands such as `pm:setStatus`.

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

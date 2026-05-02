# 07 — Status & Standup

Two common PM requests are "what's the board look like" and "give me a standup". Use Maestro Board / Work Graph as the live state source.

---

## Fetching Live State

Always query local PM / Work Graph state. Use `/PM status`, `/PM standup`, `/PM next`, or from a shell `maestro-cli fleet board --project <path> --json`. Never reconstruct status from conversation history, markdown files alone, external tracker labels, GitHub issues, or project boards.

Useful groupings:

- By Work Graph `status`
- Active claims by role and agent
- Stale claims by heartbeat/lease age
- Blocked items and their latest blocking event
- Ready items ordered by priority and dependency availability

---

## Status Response Format

Use a compact table:

| Status      | Count | Items                             |
| ----------- | ----: | --------------------------------- |
| ready       |     N | `<workItemId>` title              |
| in_progress |     N | `<workItemId>` title — agent/role |
| blocked     |     N | `<workItemId>` title — reason     |
| done        |     N | `<workItemId>` title              |

Flag stale claims separately.

---

## Standup Format

Format: **Yesterday** (moved to `done` in past 24h) | **Today** (`in_progress` / claimed) | **Blockers** (`blocked` or stale).

Rules:

- One line per item.
- Include the Work Graph/Maestro item ID.
- Keep each line to one sentence.
- If a section has no items, write "Nothing to report."
- Never fabricate items; only report what Work Graph actually shows.

---

## What's Next

When the user asks "what should I work on next" or "what's next":

1. Filter Work Graph items where status is `ready`.
2. Exclude items with active claims.
3. Exclude items with unresolved dependencies.
4. Sort by priority, then created time.
5. Present the top three with Work Graph ID, title, role, and why it is next.

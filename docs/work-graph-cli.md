---
title: Work Graph CLI
description: Query and manage Work Graph items directly from the command line using the maestro-cli wg subcommands.
icon: diagram-project
---

The `maestro-cli wg` command group (alias `work-graph`) gives scripts, agents, and CI pipelines direct read/write access to the Work Graph database. All subcommands operate on the SQLite database at rest — no running Maestro desktop app is required.

## DB location

The Work Graph is stored alongside the other Maestro data files:

| Platform | Path |
| -------- | ---- |
| Linux | `~/.config/Maestro/work-graph.db` |
| macOS | `~/Library/Application Support/Maestro/work-graph.db` |
| Windows | `%APPDATA%\Maestro\work-graph.db` |

To point the CLI at a different data directory (useful in CI), set the `MAESTRO_USER_DATA` environment variable before running any `wg` command.

## Common flags

Every `wg` subcommand accepts `--json`. With `--json` the command writes a single JSON object (or array) to stdout and exits `0` on success, or `{ "ok": false, "error": "<message>" }` and exits `1` on failure. Without `--json` the output is human-readable text and errors go to stderr.

---

## wg list

List work items with optional filters.

```bash
# All items
maestro-cli wg list

# Filter by type and status
maestro-cli wg list --type task --status ready

# Multiple statuses (comma-separated)
maestro-cli wg list --status ready,claimed,in_progress

# Filter by tag (repeatable)
maestro-cli wg list --tag agent-ready --tag backend

# Filter by source and project
maestro-cli wg list --source delivery-planner --project /home/user/myproject

# Limit results and output as JSON
maestro-cli wg list --limit 20 --json
```

### Flags

| Flag | Description |
| ---- | ----------- |
| `--type <type>` | Filter by item type(s), comma-separated |
| `--status <status>` | Filter by status(es), comma-separated |
| `--tag <tag>` | Filter by tag (repeatable) |
| `--source <source>` | Filter by source |
| `--project <path>` | Filter by project path |
| `--limit <n>` | Maximum number of results |
| `--json` | Output as JSON |

### Human-readable output format

```
a1b2c3d4  [ready       ] [task     ] Implement login endpoint
e5f6g7h8  [in_progress ] [bug      ] Fix null pointer in session store
i9j0k1l2  [done        ] [feature  ] Add dark mode toggle
3 item(s)
```

The ID shown is the first 8 characters of the full UUID. Use `wg show` with the full or partial ID to retrieve complete details.

### JSON output shape

```json
{
	"items": [
		{
			"id": "a1b2c3d4-...",
			"type": "task",
			"status": "ready",
			"title": "Implement login endpoint",
			"source": "delivery-planner",
			"projectPath": "/home/user/myproject",
			"tags": ["backend", "agent-ready"],
			"createdAt": "2026-04-15T10:00:00.000Z",
			"updatedAt": "2026-04-15T10:00:00.000Z"
		}
	],
	"total": 1
}
```

### Valid values

**Types:** `task` | `bug` | `feature` | `chore` | `document` | `decision` | `milestone`

**Statuses:** `discovered` | `planned` | `ready` | `claimed` | `in_progress` | `blocked` | `review` | `done` | `archived` | `canceled`

**Sources:** `manual` | `living-wiki` | `delivery-planner` | `agent-dispatch` | `github` | `mcp` | `spec-kit` | `openspec` | `playbook` | `director-notes`

---

## wg show

Show full details for a single work item.

```bash
# By full ID
maestro-cli wg show a1b2c3d4-e5f6-7890-abcd-ef1234567890

# By partial ID (as long as it uniquely matches)
maestro-cli wg show a1b2c3d4

# Machine-readable
maestro-cli wg show a1b2c3d4 --json
```

### Flags

| Flag | Description |
| ---- | ----------- |
| `--json` | Output as JSON |

### Human-readable output

```
ID:          a1b2c3d4-e5f6-7890-abcd-ef1234567890
Title:       Implement login endpoint
Type:        task
Status:      ready
Source:      delivery-planner
Project:     /home/user/myproject
Description: Add POST /api/auth/login with rate limiting
Tags:        backend, agent-ready
Created:     2026-04-15T10:00:00.000Z
Updated:     2026-04-15T10:00:00.000Z
```

When a claim is active, a `Claim:` line is appended:

```
Claim:       abc12345 by agent-xyz (active)
```

---

## wg search

Full-text search across work item titles, descriptions, and tags.

```bash
# Search by keyword
maestro-cli wg search "authentication"

# Limit results
maestro-cli wg search "login" --limit 5

# JSON output for scripting
maestro-cli wg search "rate limit" --json
```

### Flags

| Flag | Description |
| ---- | ----------- |
| `--limit <n>` | Maximum results (default: no limit) |
| `--json` | Output as JSON |

### Human-readable output

```
a1b2c3d4  [ready       ] Implement login endpoint
e5f6g7h8  [in_progress ] Fix token refresh race condition
2 result(s)
```

---

## wg create

Create a new work item.

```bash
# Minimal — type, title, and project are required
maestro-cli wg create \
  --type task \
  --title "Add rate limiting to auth endpoints" \
  --project /home/user/myproject

# With all options
maestro-cli wg create \
  --type bug \
  --title "Null pointer in session store" \
  --project /home/user/myproject \
  --description "Occurs when the session expires mid-request" \
  --status planned \
  --source manual \
  --git-path /home/user/myproject \
  --tag backend \
  --tag auth \
  --priority 10 \
  --json
```

### Flags

| Flag | Description | Default |
| ---- | ----------- | ------- |
| `--type <type>` | Item type (required) | — |
| `--title <title>` | Item title (required) | — |
| `--project <path>` | Project path (required) | — |
| `--description <text>` | Description | — |
| `--status <status>` | Initial status | `discovered` |
| `--git-path <path>` | Git repository path | same as `--project` |
| `--source <source>` | Source attribution | `manual` |
| `--tag <tag>` | Add a tag (repeatable) | — |
| `--priority <n>` | Priority integer (lower = higher priority) | — |
| `--json` | Output as JSON | — |

### Output

Human-readable:
```
✓ Created work item: a1b2c3d4-e5f6-7890-abcd-ef1234567890
Title: Add rate limiting to auth endpoints
```

JSON: the full `WorkItem` object.

---

## wg update

Update fields on an existing work item.

```bash
# Change the status
maestro-cli wg update a1b2c3d4 --status in_progress

# Rename and re-prioritize
maestro-cli wg update a1b2c3d4 --title "Auth rate limiting (v2)" --priority 5

# Replace tags entirely (all --tag values replace the existing tag list)
maestro-cli wg update a1b2c3d4 --tag backend --tag auth --tag urgent

# JSON output
maestro-cli wg update a1b2c3d4 --status done --json
```

### Flags

| Flag | Description |
| ---- | ----------- |
| `--title <title>` | New title |
| `--description <text>` | New description |
| `--status <status>` | New status |
| `--type <type>` | New type |
| `--tag <tag>` | Replace all tags (repeatable; replaces existing tag list) |
| `--priority <n>` | New priority |
| `--json` | Output as JSON |

<Note>
`--tag` replaces the item's entire tag list. To add a single tag without removing others, read the current tags with `wg show --json`, extend the list, and pass all tags to `wg update`.
</Note>

---

## wg claim

Claim a work item on behalf of an agent or user. Only one active claim is permitted per item at a time; attempting to claim an already-claimed item exits with code 1.

```bash
# Claim for an agent (default owner type)
maestro-cli wg claim a1b2c3d4 --owner-id my-agent-session-id

# Specify owner type and display name
maestro-cli wg claim a1b2c3d4 \
  --owner-id my-agent-session-id \
  --owner-type agent \
  --owner-name "Claude Code (auth refactor)" \
  --note "Starting rate limiting implementation"

# Set a lease expiry (ISO 8601)
maestro-cli wg claim a1b2c3d4 \
  --owner-id my-agent-session-id \
  --expires-at "2026-04-16T10:00:00.000Z"

# JSON output
maestro-cli wg claim a1b2c3d4 --owner-id my-agent-session-id --json
```

### Flags

| Flag | Description | Default |
| ---- | ----------- | ------- |
| `--owner-id <id>` | Owner identifier (required) | — |
| `--owner-type <type>` | `agent` \| `user` \| `system` \| `team` | `agent` |
| `--owner-name <name>` | Display name for the owner | — |
| `--note <text>` | Human-readable claim note | — |
| `--expires-at <iso>` | Claim expiry in ISO 8601 format | — |
| `--json` | Output as JSON | — |

### Output

Human-readable:
```
✓ Claimed work item a1b2c3d4-...: claim abc12345-...
```

JSON: the `WorkItemClaim` object.

---

## wg release

Release the active claim on a work item, returning it to `ready` status.

```bash
# Release by work item ID (releases whatever active claim exists)
maestro-cli wg release a1b2c3d4

# Release a specific claim by claim ID
maestro-cli wg release a1b2c3d4 --claim-id abc12345

# Add a release note
maestro-cli wg release a1b2c3d4 --note "Blocked by upstream dependency, releasing for reassignment"

# JSON output
maestro-cli wg release a1b2c3d4 --json
```

### Flags

| Flag | Description |
| ---- | ----------- |
| `--claim-id <id>` | Release a specific claim by ID (optional; defaults to the active claim) |
| `--note <text>` | Human-readable release note |
| `--json` | Output as JSON |

---

## wg complete

Mark the active claim on a work item as completed, transitioning the item to `done` status.

```bash
# Complete by work item ID
maestro-cli wg complete a1b2c3d4

# Complete a specific claim
maestro-cli wg complete a1b2c3d4 --claim-id abc12345

# Add a completion note
maestro-cli wg complete a1b2c3d4 --note "Implemented with tests passing"

# JSON output
maestro-cli wg complete a1b2c3d4 --json
```

### Flags

| Flag | Description |
| ---- | ----------- |
| `--claim-id <id>` | Complete a specific claim by ID (optional; defaults to the active claim) |
| `--note <text>` | Human-readable completion note |
| `--json` | Output as JSON |

---

## wg unblocked

List work items that are tagged `agent-ready`, have no unresolved blockers, and are not currently claimed. This is the primary query agents use to find the next available task.

```bash
# All unblocked agent-ready items
maestro-cli wg unblocked

# Filter by agent ID (returns items previously assigned to this agent)
maestro-cli wg unblocked --agent-id my-agent-id

# Filter by required capabilities
maestro-cli wg unblocked --capability backend --capability auth

# Limit results and output as JSON
maestro-cli wg unblocked --limit 5 --json
```

### Flags

| Flag | Description |
| ---- | ----------- |
| `--agent-id <id>` | Filter by agent ID |
| `--capability <tag>` | Required capability tag (repeatable) |
| `--limit <n>` | Maximum results |
| `--json` | Output as JSON |

### Human-readable output

```
a1b2c3d4  [task     ] Implement login endpoint
e5f6g7h8  [bug      ] Fix null pointer in session store
2 item(s)
```

---

## wg tags

List all tag definitions in the tag registry.

```bash
maestro-cli wg tags

# JSON output
maestro-cli wg tags --json
```

### Flags

| Flag | Description |
| ---- | ----------- |
| `--json` | Output as JSON |

### Human-readable output

```
agent-ready                    manual, canonical
backend                        manual
auth                           delivery-planner
```

The `canonical` marker indicates the tag is used for capability routing in Agent Dispatch. `agent-ready` is the system-reserved canonical tag that makes items visible to the dispatch engine.

---

## wg import

Bulk-import work items from a JSON file. Items are matched against existing records by `externalId` + `source` to avoid duplicates.

```bash
# Import from a file (skips existing items by default)
maestro-cli wg import /path/to/items.json \
  --source manual \
  --project /home/user/myproject

# Update existing items instead of skipping
maestro-cli wg import /path/to/items.json \
  --source delivery-planner \
  --project /home/user/myproject \
  --update

# Custom git path
maestro-cli wg import /path/to/items.json \
  --project /home/user/myproject \
  --git-path /home/user/myproject \
  --json
```

### Flags

| Flag | Description | Default |
| ---- | ----------- | ------- |
| `--source <source>` | Source attribution for all imported items | `manual` |
| `--project <path>` | Project path applied to all items | `cwd` |
| `--git-path <path>` | Git path for all items | same as `--project` |
| `--update` | Update existing items instead of skipping | false (skip) |
| `--json` | Output as JSON | — |

### Input file format

The file must contain a JSON array of objects. Each object supports the same fields as `wg create`:

```json
[
	{
		"type": "task",
		"title": "Implement login endpoint",
		"description": "POST /api/auth/login with rate limiting",
		"status": "ready",
		"tags": ["backend", "agent-ready"],
		"priority": 10
	},
	{
		"type": "bug",
		"title": "Fix null pointer in session store",
		"status": "discovered",
		"tags": ["backend"]
	}
]
```

### Output

Human-readable:
```
✓ Import complete: 2 created, 0 updated, 0 skipped, 0 failed
```

JSON: a summary object with per-item results.

```json
{
	"created": 2,
	"updated": 0,
	"skipped": 0,
	"failed": 0,
	"items": [
		{ "status": "created", "title": "Implement login endpoint" },
		{ "status": "created", "title": "Fix null pointer in session store" }
	]
}
```

---

## Claim lifecycle

Work items move through the following states as agents claim and complete them:

```
discovered → planned → ready → claimed → in_progress → review → done
                                   ↓
                               blocked / released → ready
```

The `wg claim` / `wg release` / `wg complete` commands drive this lifecycle from the command line. The same operations are available through the [Agent Dispatch](/agent-dispatch) kanban board and the Work Graph MCP tools inside agent sessions.

| Command | Effect on item status |
| ------- | --------------------- |
| `wg claim` | `ready` → `claimed` |
| `wg update --status in_progress` | `claimed` → `in_progress` |
| `wg complete` | any claimed status → `done` |
| `wg release` | `claimed` or `in_progress` → `ready` |

---

## Agent automation pattern

A typical agent loop using the Work Graph CLI:

```bash
# 1. Find the next available task for this agent
ITEM=$(maestro-cli wg unblocked --limit 1 --json)
ITEM_ID=$(echo "$ITEM" | jq -r '.items[0].id')

# 2. Claim it
maestro-cli wg claim "$ITEM_ID" \
  --owner-id "$AGENT_SESSION_ID" \
  --note "Starting work"

# 3. Mark as in progress
maestro-cli wg update "$ITEM_ID" --status in_progress

# 4. ... do the work ...

# 5. Complete the claim
maestro-cli wg complete "$ITEM_ID" --note "All acceptance criteria met"
```

If the agent is interrupted before completing, call `wg release` to return the item to the pool so another agent can pick it up.

---

## Troubleshooting

### "Work item not found"

The ID doesn't match any item in the database. Use `wg list` or `wg search` to find the correct ID. Partial IDs (e.g., the first 8 characters) are accepted as long as they uniquely match one item.

### "Only one active claim is permitted per item"

Another agent or user already holds a claim. Use `wg show <id>` to see who holds the claim, then coordinate with them or wait for it to expire. If the original claimant is unavailable, an administrator can release the claim with `wg release <id> --claim-id <claim-id>`.

### "Import file must contain a JSON array"

The import file is not valid JSON or is not a top-level array. Validate the file with `jq . /path/to/items.json` before retrying.

### Items not appearing in Agent Dispatch

The kanban board only shows items tagged `agent-ready`. After creating or importing items, add the tag:

```bash
maestro-cli wg update <id> --tag agent-ready
```

Items also need their dependency blockers resolved before they appear as unblocked. Check with `wg show <id>` and verify that any blocking items are in `done` status.

### Database locked error

The Work Graph database uses WAL mode, which allows one writer at a time. If a concurrent write is in progress (e.g., the desktop app is writing), the CLI will retry briefly before failing. Wait a moment and retry, or check for a stale lock file (`work-graph.db-wal`, `work-graph.db-shm`) if the desktop app is not running.

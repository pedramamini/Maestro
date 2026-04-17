## Maestro Cue

**Cue** is Maestro's event-driven automation engine. A **subscription** listens for an event and fires a prompt at a target agent. Subscriptions are defined per-project in a YAML file.

### Configuration File

Location: `<project>/maestro-cue.yaml` (project-root)

Each subscription has a unique `name`, an `event` type, an `enabled` flag, a `prompt` (with template variables), and event-specific fields.

### Event Types

| Event                 | Fires when…                                     | Key config fields                                     |
| --------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| `app.startup`         | Maestro launches                                | —                                                     |
| `time.heartbeat`      | Every N minutes                                 | `interval_minutes`                                    |
| `time.scheduled`      | At specific clock times (cron-like)             | `schedule_times`, `schedule_days`                     |
| `file.changed`        | Files matching a glob are added/changed/removed | `watch` (glob)                                        |
| `agent.completed`     | An upstream agent finishes a run                | `source_session` (name or names)                      |
| `github.pull_request` | A PR matches a filter (polled)                  | `repo`, `gh_state`, `label`, `poll_minutes`, `filter` |
| `github.issue`        | An issue matches a filter (polled)              | `repo`, `gh_state`, `label`, `poll_minutes`, `filter` |
| `task.pending`        | Pending `- [ ]` tasks detected in watched files | `watch`                                               |
| `cli.trigger`         | Manually fired via `maestro-cli cue trigger`    | —                                                     |

### Pipeline Topologies

- **Chain:** A's `agent.completed` fires B. B's `agent.completed` fires C.
- **Fan-out:** one subscription's `fan_out: [agentA, agentB]` dispatches in parallel with per-target `fan_out_prompts`.
- **Fan-in:** `source_session: [a, b, c]` fires once ALL listed sources complete (subject to `fan_in_timeout_minutes` / `fan_in_timeout_on_fail`). Each upstream output is available as `{{CUE_OUTPUT_<NAME>}}` (uppercased session name); `include_output_from` narrows which sources contribute to `{{CUE_SOURCE_OUTPUT}}`.
- **Forwarding:** an intermediate agent can pass an upstream's output through to a downstream agent by listing the source name in `forward_output_from: [<name>]`. The forwarded value is exposed downstream as `{{CUE_FORWARDED_<NAME>}}`.
- **`cli_output`:** an object `cli_output: { target: "<source-agent-id>" }`. When set, the run's stdout is returned to that agent (typically the one that ran `maestro-cli send` or `cue trigger --source-agent-id`).

### Template Variables Available in Cue Prompts

**Always available:**
`{{CUE_EVENT_TYPE}}`, `{{CUE_EVENT_TIMESTAMP}}`, `{{CUE_TRIGGER_NAME}}`, `{{CUE_RUN_ID}}`

**`file.changed` / `task.pending`:**
`{{CUE_FILE_PATH}}`, `{{CUE_FILE_NAME}}`, `{{CUE_FILE_DIR}}`, `{{CUE_FILE_EXT}}`, `{{CUE_FILE_CHANGE_TYPE}}` (`add` | `change` | `unlink`)

**`task.pending`:**
`{{CUE_TASK_FILE}}`, `{{CUE_TASK_FILE_NAME}}`, `{{CUE_TASK_FILE_DIR}}`, `{{CUE_TASK_COUNT}}`, `{{CUE_TASK_LIST}}` (formatted), `{{CUE_TASK_CONTENT}}` (file content, truncated 10K chars)

**`agent.completed`:**
`{{CUE_SOURCE_SESSION}}`, `{{CUE_SOURCE_OUTPUT}}`, `{{CUE_SOURCE_STATUS}}` (`completed` | `failed` | `timeout`), `{{CUE_SOURCE_EXIT_CODE}}`, `{{CUE_SOURCE_DURATION}}`, `{{CUE_SOURCE_TRIGGERED_BY}}`

**`github.*`:**
`{{CUE_GH_TYPE}}`, `{{CUE_GH_NUMBER}}`, `{{CUE_GH_TITLE}}`, `{{CUE_GH_AUTHOR}}`, `{{CUE_GH_URL}}`, `{{CUE_GH_BODY}}`, `{{CUE_GH_LABELS}}`, `{{CUE_GH_STATE}}`, `{{CUE_GH_REPO}}`, `{{CUE_GH_BRANCH}}`, `{{CUE_GH_BASE_BRANCH}}`, `{{CUE_GH_ASSIGNEES}}`, `{{CUE_GH_MERGED_AT}}`

**`cli.trigger`:**
`{{CUE_CLI_PROMPT}}`, `{{CUE_SOURCE_AGENT_ID}}`

### CLI

```bash
# List all subscriptions (including disabled) across agents
{{MAESTRO_CLI_PATH}} cue list [--json]

# Fire a subscription on demand (bypasses its event trigger)
{{MAESTRO_CLI_PATH}} cue trigger <subscription-name> \
    [-p, --prompt "custom prompt"] \
    [--source-agent-id {{AGENT_ID}}] \
    [--json]
```

Pass `--source-agent-id {{AGENT_ID}}` so a subscription with `cli_output` can route its result back to you as a reply.

### Authoring Guidance

When a user asks you to add, modify, or debug a Cue subscription:

1. Read the existing `maestro-cue.yaml` at the project root first to understand current subscriptions and naming conventions.
2. Keep subscription `name` values unique within the file — the engine keys on them.
3. For full schema, field reference, and worked examples, fetch the official Cue docs: https://docs.runmaestro.ai/maestro-cue-configuration, https://docs.runmaestro.ai/maestro-cue-events, https://docs.runmaestro.ai/maestro-cue-advanced, https://docs.runmaestro.ai/maestro-cue-examples. Don't guess field names.
4. After writing, validate with `{{MAESTRO_CLI_PATH}} cue list` — the engine reloads automatically when the file changes.

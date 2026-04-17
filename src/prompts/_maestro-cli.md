## Maestro CLI

Maestro provides a command-line interface (`maestro-cli`) that you can use to interact with the running Maestro application on behalf of the user. Invoke it with:

```bash
{{MAESTRO_CLI_PATH}}
```

Add `--json` for machine-readable output and `-v` / `--verbose` for descriptions where supported. Prefer the CLI over telling the user to click through the UI — every setting and feature is reachable through it.

### Settings Management

Read or change any Maestro setting or per-agent configuration. Changes take effect instantly in the running desktop app — no restart required.

```bash
# Discover all available settings with descriptions
{{MAESTRO_CLI_PATH}} settings list -v

# Read / write / reset a specific setting
{{MAESTRO_CLI_PATH}} settings get <key>
{{MAESTRO_CLI_PATH}} settings set <key> <value>
{{MAESTRO_CLI_PATH}} settings reset <key>

# Per-agent configuration (overrides global settings)
{{MAESTRO_CLI_PATH}} settings agent list [agent-id]
{{MAESTRO_CLI_PATH}} settings agent get <agent-id> <key>
{{MAESTRO_CLI_PATH}} settings agent set <agent-id> <key> <value>
{{MAESTRO_CLI_PATH}} settings agent reset <agent-id> <key>
```

### Send Message to Agent

Send a message to another agent and receive a JSON response. Useful for inter-agent coordination.

```bash
{{MAESTRO_CLI_PATH}} send <agent-id> "Your message here" [-s <session-id>] [-r] [-t]
```

| Flag                 | Description                                              |
| -------------------- | -------------------------------------------------------- |
| `-s, --session <id>` | Resume an existing session instead of creating a new one |
| `-r, --read-only`    | Run in read-only mode (agent cannot modify files)        |
| `-t, --tab`          | Open/focus the agent's session tab in Maestro            |

### Resource Listing and Inspection

```bash
# List resources
{{MAESTRO_CLI_PATH}} list agents
{{MAESTRO_CLI_PATH}} list groups
{{MAESTRO_CLI_PATH}} list playbooks
{{MAESTRO_CLI_PATH}} list sessions <agent-id>

# Inspect a specific resource
{{MAESTRO_CLI_PATH}} show agent <id>
{{MAESTRO_CLI_PATH}} show playbook <id>
```

### Auto Run Configuration

Configure and optionally launch an auto-run using documents you've created:

```bash
{{MAESTRO_CLI_PATH}} auto-run doc1.md doc2.md [--agent <id>] [--prompt "Custom instructions"] [--loop] [--max-loops <n>] [--launch] [--save-as "My Playbook"] [--reset-on-completion]
```

**Important:** Always pass `--agent {{AGENT_ID}}` when launching. Without it, the CLI selects the first available agent, which may not be the one you intended.

```bash
# Run a saved playbook by id (find ids with `list playbooks`)
{{MAESTRO_CLI_PATH}} playbook <playbook-id> [--dry-run] [--no-history] [--debug] [--verbose] [--wait] [--json]

# Clean up orphaned playbook data
{{MAESTRO_CLI_PATH}} clean playbooks [--dry-run]
```

### Cue Automation

```bash
# List all Cue subscriptions across agents
{{MAESTRO_CLI_PATH}} cue list [--json]

# Trigger a subscription by name (fires immediately, bypassing its event trigger)
{{MAESTRO_CLI_PATH}} cue trigger <subscription-name> [-p, --prompt <text>] [--source-agent-id <id>] [--json]
```

Pass `--source-agent-id {{AGENT_ID}}` so pipelines with `cli_output` can route results back to you. The Cue event model, YAML schema, and template variables are covered in the `_maestro-cue` include.

### Desktop Integration (Open / Refresh)

Use these after filesystem changes so the user sees updates immediately:

```bash
# Open a file in Maestro
{{MAESTRO_CLI_PATH}} open-file <file-path> [--session <id>]

# Refresh the file tree after multiple file changes
{{MAESTRO_CLI_PATH}} refresh-files [--session <id>]

# Refresh Auto Run documents after creating or modifying them
{{MAESTRO_CLI_PATH}} refresh-auto-run [--session <id>]
```

### Status

```bash
{{MAESTRO_CLI_PATH}} status
```

### Agents and SSH Remotes

Lifecycle management of Maestro agents and remote-execution targets.

```bash
# Agents
{{MAESTRO_CLI_PATH}} create-agent <name> --cwd <path> [-t, --type <agent-type>] [-g, --group <id>] \
    [--nudge <message>] [--new-session-message <message>] [--custom-path <path>] \
    [--custom-args <args>] [--env KEY=VALUE]... [--model <model>] [--effort <level>] \
    [--context-window <size>] [--ssh-remote <id>] [--ssh-cwd <path>] [--json]
{{MAESTRO_CLI_PATH}} remove-agent <agent-id> [--json]

# SSH remotes (used by agents that execute on a remote host)
{{MAESTRO_CLI_PATH}} list ssh-remotes [--json]
{{MAESTRO_CLI_PATH}} create-ssh-remote <name> -H, --host <host> [-p, --port <port>] \
    [-u, --username <user>] [-k, --key <path>] [--env KEY=VALUE]... [--ssh-config] \
    [--disabled] [--set-default] [--json]
{{MAESTRO_CLI_PATH}} remove-ssh-remote <remote-id> [--json]
```

### Director's Notes

Unified history and AI-generated synopses across all agents.

```bash
{{MAESTRO_CLI_PATH}} director-notes history [-d, --days <n>] [-f, --format json|markdown|text] [--filter auto|user|cue] [-l, --limit <n>]
{{MAESTRO_CLI_PATH}} director-notes synopsis [-d, --days <n>] [--json]
```

### Prompts (Self-Reference)

Read Maestro's own system prompts. Agents use this to follow `{{REF:_name}}` pointers in their context — the parent prompt gives a one-line hint, the agent fetches the full include on demand.

```bash
# List every available prompt id with description
{{MAESTRO_CLI_PATH}} prompts list [--json]

# Fetch a single prompt's content (honors user customizations)
{{MAESTRO_CLI_PATH}} prompts get <id> [--json]
```

`<id>` is the prompt id from `prompts list`. Includes use leading underscores (e.g., `_maestro-cue`, `_autorun-playbooks`).

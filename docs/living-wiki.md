---
title: Living Wiki
description: Per-project and multi-repo documentation layers that keep your docs in sync with your source tree.
icon: book-open
---

Living Wiki is a per-project documentation layer that maintains a set of Markdown files — called _wiki docs_ — alongside your source tree. Each doc is backed by a Work Graph `document` item so it can be searched, linked, and tracked alongside tasks. A hub layer (v2) aggregates docs across multiple enrolled repositories into a unified portal.

## What Living Wiki Does

- Scaffolds a starter set of Markdown docs based on your project structure on enrollment
- Mirrors on-disk Markdown to the Work Graph for full-text search and cross-linking
- Detects uncovered source files and surfaces them as doc-gap candidates
- Watches the wiki root for file changes and pushes updates to open agent sessions
- Serves `llms.txt` and `llms-full.txt` for LLM-friendly documentation access
- (v2) Aggregates docs across multiple repositories with auto-block generators, static export, and deploy targets

---

## Single-Repo Enrollment

### Enrolling a Project

Open the **Living Wiki** panel in the Right Bar, select your project directory, and click **Enroll**. Maestro will:

1. Create `.maestro/wiki/<project-id>/` inside your project root as the wiki root
2. Scaffold a standard set of Markdown docs (overview, architecture, API reference, etc.)
3. Register each doc as a Work Graph `document` item with `source: 'living-wiki'`
4. Write `docs_manifest.json` under `.maestro/wiki/<project-id>/_meta/`

You can also enroll from an agent session using the `/wiki-enroll` slash command (see [Slash Commands](#slash-commands)).

### Configuration File

Enrollment writes a config file at:

```
{projectPath}/.maestro/wiki/wiki.config.json
```

This file records per-project `wikiRoot` and `metaRoot` overrides. If no overrides are set, the defaults above apply. Edit the config via **Settings → Living Wiki** or by running `/wiki-config` in an AI session.

---

## Doc Tree and Topics

After enrollment, the wiki root contains a set of standard docs:

| Doc | Purpose |
| --- | ------- |
| `overview.md` | Project summary, goals, and key links |
| `architecture.md` | System design and component relationships |
| `api-reference.md` | Public API surface |
| `contributing.md` | Development setup and contribution guide |
| `changelog.md` | Release history and notable changes |

Each doc's frontmatter carries a `topics` list inferred from your source tree. Topics are derived from file paths and import patterns — for example, a project with React components gets a `frontend` topic; one with a `routes/` directory gets `api`.

### Adding a Doc

Create a new `.md` file in the wiki root. On the next save (or after running `/wiki-generate`), Maestro upserts a Work Graph item for the file and adds it to the search index.

### Frontmatter

Living Wiki docs use a Living Wiki dialect of frontmatter distinct from standard Work Graph frontmatter:

```markdown
---
title: Architecture
topics: [backend, api]
sourceGitPaths:
  - src/main/index.ts
  - src/main/process-manager.ts
---
```

| Field | Required | Description |
| ----- | -------- | ----------- |
| `title` | No | Display name; defaults to filename |
| `topics` | No | Topic tags used for filtering and gap detection |
| `sourceGitPaths` | No | Source files this doc covers (drives coverage reporting) |

---

## AUTO Blocks

AUTO blocks are machine-generated regions inside human-authored docs. They let agents fill in structured content without overwriting surrounding prose.

### Syntax

```markdown
<!-- BEGIN AUTO:api-summary -->
(Generated content appears here after a run)
<!-- END AUTO:api-summary -->
```

The `name` attribute after `AUTO:` is a stable identifier for the block. A doc can contain multiple AUTO blocks with different names.

<Note>
v2 hub docs use a slightly different marker syntax: `<!-- AUTO-START name="..." -->` / `<!-- AUTO-END name="..." -->`. Both v1 and v2 markers are validated on every save.
</Note>

### Rules

- Each AUTO block must have a matching open/close pair. Mismatched markers are flagged as errors by the validator.
- AUTO block names must be unique within a document.
- Content inside an AUTO block is replaced on each generation run. Do not manually edit content inside the markers.
- Content outside AUTO blocks is always preserved.

---

## Validation

Run the validator at any time to check your wiki for issues:

```
/wiki-validate
```

Or trigger it from the Right Bar Living Wiki panel by clicking **Validate**.

### Diagnostic Checks

| Check | Severity |
| ----- | -------- |
| File does not end with `.md` | Warning |
| Malformed AUTO block markers (unmatched open/close) | Error |
| Missing `metadata.kind: 'living-wiki-doc'` on Work Graph item | Warning |

A **WikiRunResult** report is returned after each validation or generation run. It includes:

- `diagnostics` — the list of warnings and errors above
- `WikiCoverageReport` — source files discovered in the tree vs. files listed in doc `sourceGitPaths`

Uncovered source files appear in the **Coverage** section of the Living Wiki panel. You can promote any uncovered file to a doc-gap Work Graph item, which makes it visible in the Delivery Planner and the kanban board.

---

## Multi-Repo Hub (v2)

The hub layer aggregates Living Wiki docs from multiple enrolled repositories into a single portal.

### Hub Configuration

The hub is configured in `wiki-hub.json` at your workspace root. Each entry in `repos` represents one enrolled project:

```json
{
  "repos": [
    { "id": "backend", "projectPath": "/path/to/backend", "enabled": true },
    { "id": "frontend", "projectPath": "/path/to/frontend", "enabled": true }
  ]
}
```

| Field | Description |
| ----- | ----------- |
| `id` | Unique repo identifier (used in cross-repo links) |
| `projectPath` | Absolute path to the enrolled project |
| `enabled` | Set to `false` to pause a repo without removing it |

### Snapshot and Sync

The hub aggregates a snapshot on every autopilot cycle:

1. For each enabled repo, it reads all Living Wiki docs and their topics.
2. A `WikiHubSnapshot` is built containing `docs`, `topics`, and `generatedAt`.
3. `detectChanges` diffs the new snapshot against the previous one and writes lock entries.

### AUTO-Block Generators (v2)

Hub docs use `<!-- AUTO-START name="..." -->` markers that are filled by named generators on every autopilot run. Built-in generators include:

| Generator | Description |
| --------- | ----------- |
| `repo-inventory` | Table of all enrolled repos with doc counts and coverage scores |
| `topic-list` | Aggregated topic list across all repos |
| `recent-docs` | Most recently updated docs across all repos |
| `repo-list` | Simple list of enrolled repos |
| `traceability` | Cross-repo dependency table |
| `api-docs` | Aggregated API surface from API-reference docs |
| `coverage-docs` | Per-repo coverage summary |

Custom generators can be registered via the `WikiGeneratorRegistry` API.

### Cross-Repo Links

Reference a doc in another enrolled repo using double-bracket syntax:

```markdown
See [[backend::architecture]] for the server design.
```

The format is `[[repo-id::path/to/doc]]`. The link resolver looks up the repo by id and returns the absolute doc path. Cross-repo links are resolved at export time and in the Right Bar preview.

### Coverage Gate

Enable the hub coverage gate to block automation runs when coverage falls below a threshold. Configure the threshold in `wiki-hub.json`:

```json
{
  "coverageGate": { "enabled": true, "threshold": 0.8 }
}
```

A failed gate returns a `WikiHubCoverageGateResult` with per-repo coverage scores and a blocked flag that the autopilot scheduler respects.

---

## Static Export

Export the hub as a standalone HTML bundle:

```
/wiki-export
```

The exporter produces:

- `index.html` — hub home page with nav and search
- `docs/<repo-id>/<doc-path>.html` — per-doc pages
- `nav.json` — hierarchical navigation tree
- `search-index.json` — full-text search index
- `assets/` — CSS and JS

### Deploy Targets

Configure one or more deploy targets in `wiki-hub.json`:

```json
{
  "deploy": [
    { "kind": "pages", "branch": "gh-pages" },
    { "kind": "s3", "bucket": "my-docs-bucket", "region": "us-east-1" },
    { "kind": "lan", "outputPath": "/var/www/wiki" }
  ]
}
```

| Target | Description |
| ------ | ----------- |
| `pages` | Push the export bundle to a `gh-pages` branch via `git push` |
| `s3` | Upload each file via `aws s3 cp` |
| `lan` | Write files to a local directory |

Run deploy via `/wiki-deploy` or automatically after each successful autopilot cycle.

---

## Slash Commands

Living Wiki provides slash commands in the AI input area. Type `/wiki` to see them in the autocomplete menu.

| Command | Arguments | Description |
| ------- | --------- | ----------- |
| `/wiki-enroll` | — | Enroll the current project and scaffold starter docs |
| `/wiki-generate` | — | Scan source tree, fill AUTO blocks, update Work Graph items |
| `/wiki-validate` | — | Run diagnostics and return coverage report |
| `/wiki-search` | `<query>` | Full-text search across all Living Wiki docs |
| `/wiki-config` | — | Open the Living Wiki configuration editor |
| `/wiki-export` | — | Build the static HTML bundle |
| `/wiki-deploy` | — | Deploy the last export to all configured targets |
| `/wiki-gaps` | — | List uncovered source files with doc-gap candidates |

---

## Troubleshooting

### Living Wiki panel shows no docs after enrollment

The panel lists docs from the Work Graph. If enrollment succeeded but no docs appear:

1. Check that `.maestro/wiki/<project-id>/` was created inside your project root.
2. Run `/wiki-generate` to trigger a scan and upsert pass.
3. Open the System Log Viewer (`View → System Log`) and look for `livingWiki:enroll` errors.

### "Hash conflict" error when saving a doc

The web client detects a stale `mirrorHash` and returns a 409 conflict. This happens when another session wrote the file between when you loaded it and when you saved. Reload the doc, apply your edits, and save again.

### Watcher stops emitting changes

The file watcher (`livingWiki:watch`) is token-scoped. If a session is closed and reopened, the watcher token changes. Run `/wiki-generate` to re-sync, or re-enroll to restart the watcher.

### `/llms/:file` returns 400

The `llms.txt` / `llms-full.txt` endpoint requires:

- A valid `llms.txt` or `llms-full.txt` filename (no other names are allowed).
- A `projectPath` query parameter pointing to the enrolled project root.

If neither file exists in the project root, the route returns 404. Generate them by running `/wiki-generate` or by placing them manually.

### Autopilot cycle skipped with "still running" message

The hub scheduler uses a mutex to avoid overlapping runs. If a previous cycle is still running when the next interval fires, the new cycle is skipped. Check the System Log Viewer for `WikiHubAutopilot` entries to see how long each cycle takes.

### AUTO-block markers not updating after a generator run

Verify the block name in the doc matches a registered generator name exactly (case-sensitive). List available generators with `/wiki-generate --list`. If the generator is custom, ensure it is registered before the autopilot runner starts.

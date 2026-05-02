# AI Wiki Backend Skeleton

AI Wiki is project knowledge/context storage, not Work Graph state truth. Work Graph remains the source of truth for PM boards, tasks, and delivery state.

Slice 1 stores per-project wiki state and generated markdown under Electron `userData/project-wikis/<project-id>/`. The source is the active local project root or the matching SSH project root; the service does not clone repositories and does not create a repo wiki by default.

Refresh writes `state.json`, `index.md`, `changed-files.md`, and `summary.md` using deterministic Git/file metadata only. Model-backed synthesis is intentionally left for later slices.

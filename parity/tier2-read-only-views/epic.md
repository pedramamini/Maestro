# Tier 2 — Read-only views (stub)

Medium-effort ports of desktop view-only features. Web reads, desktop writes.

## Candidate tasks (to be expanded)

- File preview — markdown, images, code with syntax highlighting (mobile-friendly)
- File explorer panel — read-only directory tree, tap to preview
- Auto Run document browser — list playbooks and their docs (read-only; editing stays on desktop)
- Command history persistence UI — currently web has basic ephemeral history; desktop has persistent + searchable
- Process Monitor (read-only) — show running processes, no kill/signal actions
- Director's Notes (read-only) — display the synopsis, no editing

## Why "stub" not "planned"

Tier 1 needs to land first to validate the playbook execution pattern. Once we have signal, we expand this tier with concrete task docs (one `NNN-*.md` per item).

## Expansion criteria

When ≥4 Tier 1 tasks are merged, **and** the playbook execution pattern is proven (one full task end-to-end without intervention), expand this tier:

- [ ] Author one task doc per candidate above
- [ ] Identify shared touchpoints (file preview tasks all touch `MessageHistory.tsx` rendering — sequence them)
- [ ] Confirm data is broadcast to web (or note "needs broadcast change" as a sub-task)
- [ ] Update README status table to "planned"

## Architectural notes

- File preview will need image/PDF/markdown rendering libraries — keep mobile bundle small (lazy load)
- File explorer is read-only — no rename/delete/create. Those are admin-tier.
- Auto Run document browser shows checkboxes as static state — editing requires deeper integration

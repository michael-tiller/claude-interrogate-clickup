# claude-interrogate-clickup

A companion plugin to claude-interrogate that mirrors taskout RC checklists into ClickUp via ClickUp's official remote MCP server. Markdown is canonical; ClickUp is the mirror. One-way sync only.

## What It Does

Pushes roadmap structure from [claude-interrogate](https://github.com/michael-tiller/claude-interrogate) taskout exports into ClickUp for team visibility and sprint planning:

- **Project** → ClickUp Folder
- **Release Candidate (RC)** → List in that Folder (or an existing sprint List by ID)
- **### Targeted subsections** → epic parent tasks
- **Checkbox items** → subtasks under their epic

Each task also carries mirror-only planning metadata, proposed by the model and confirmed once (planning-poker): **Priority**, **Time Estimate**, **Token Budget**, and **Discipline**. When a taskout export includes a per-ticket implementation spec, `clickup-push` seeds it into the task description at create — all at zero extra ClickUp calls.

Requires the claude-interrogate plugin >= 0.1.8 (for the `design_taskout_export` tool); warm-ticket spec seeding needs >= 0.1.16.

## Hierarchy and Mapping

Each consuming project maintains a `.clickup-map.json` sidecar that records the ClickUp Folder and per-RC List mappings. The plugin also maintains:

- `.captain-sdlc/.clickup-ledger.json` (gitignored; legacy: repo root): rolling 24-hour call budget tracker (default 300 calls, 30-call reserve on paid plans without AI add-on)
- `pendingOps[]` in the sidecar: durable queue of deferred work when budget is exhausted

The optional `statusMap` keys `inProgress` and `qa` support intermediate-state mirroring from the Seam 7 release pass (claude-release-clickup).

## Commands

| Command | Purpose |
| --- | --- |
| `/clickup-setup` | Interactive settings + CLAUDE.md workflow block |
| `/clickup-push <rc-id> [output-dir]` | Initial push of an RC into ClickUp; creates Folder, List, epics, and tasks |
| `/clickup-sync [rc-id] [output-dir]` | Re-sync RC checkbox state into mapped tasks and drain pending-ops queue |
| `/clickup-status [--verify]` | Health report: budget usage, pending ops, per-RC mapping, local drift (zero ClickUp calls by default) |

## Safety and Design

- **No deletes.** Items removed from markdown are closed in ClickUp; sidecar entries retire but never disappear.
- **No Definition-of-Done in ClickUp.** DoD items stay in markdown only (they are the ship gate, not work items).
- **Markdown canonical.** No two-way sync. ClickUp reads are for status only; all truth lives in markdown.
- **Budget discipline.** Tracks rolling 24-hour API call budget; queues work if budget is tight; handles 429s gracefully.
- **Idempotent crash recovery.** Task descriptions end with a machine-readable footer (`interrogate-key:`) and before-create reconciliation adoptsjust-created orphans from interrupted runs.

## Install

Install via the Claude Code marketplace or local path:

```text
/plugin marketplace add michael-tiller/claude-interrogate-clickup
/plugin install claude-interrogate-clickup
```

Then OAuth into ClickUp:

```text
/mcp
```

This registers the bundled ClickUp remote MCP server. If the server doesn't register automatically, add it manually:

```text
/mcp add --transport http clickup https://mcp.clickup.com/mcp
```

## Per-Project Toggle

Each project's `.clickup-map.json` has an `enabled` boolean. Set to `false` to disable all ClickUp sync for that project. Declining initialization writes this file automatically.

## Status

See [CHANGELOG.md](CHANGELOG.md) for the current release and version history.
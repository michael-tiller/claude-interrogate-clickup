---
name: clickup-setup
description: Interactive settings for the ClickUp mirror — view and edit the project's sidecar config (enabled toggle, budget/reserve, project Folder, per-RC list targets, status map including in-progress/QA), and install the workflow block into the project's CLAUDE.md. Use when the user asks to configure, set up, enable, disable, or change settings for ClickUp sync.
---

# ClickUp Setup (settings)

FIRST: Read `${CLAUDE_PLUGIN_ROOT}/docs/protocol.md` for the sidecar schemas.

Arguments: `[output-dir]` (default: current working directory).

This skill makes ZERO ClickUp calls except where a setting explicitly needs a
lookup (changing the project Folder or an RC's target list requires one
`Get Workspace Hierarchy` call — budget-gate and ledger it like any other call).

## Flow

1. **Load state.** Read `.clickup-map.json` and `.clickup-ledger.json` if present.
   No sidecar → offer to initialize (creates `{version: 1, enabled: true}` plus
   workspace/project via the hierarchy lookup, exactly like clickup-push step 3) or
   to disable permanently (`{version: 1, enabled: false}`).
2. **Present current settings** as a numbered menu, then loop until the user is done:
   1. **Enabled** — toggle. Disabling leaves all mappings intact; nothing is lost.
   2. **Budget / reserve** — edit the ledger knobs (defaults 300 / 30). Warn below
      50/10: ClickUp's MCP cap is a rolling 24h window shared across all projects
      using this OAuth account.
   3. **Project container** — show Space/Folder; change via one hierarchy call.
   4. **Per-RC targets** — list each RC's List/sprint, statusMap, active/retired
      counts, lastSyncAt. Allow retargeting an RC to a different List (hierarchy
      call; existing mappings keep their taskIds — warn that already-created tasks
      do NOT move automatically; suggest closing the old list manually or accepting
      the split).
   5. **Status map** — edit per-RC `statusMap`. Core keys: `open`, `done`,
      `closed`. Optional keys: `inProgress`, `qa` — needed for intermediate-state
      mirroring from the Seam 7 release pass (claude-release-clickup). Statuses
      must exist on the target list; never invent one.
   6. **Pending ops** — show count/ages; offer to drain now (runs the clickup-sync
      flow) or to discard specific ops (confirm each discard; discarding is the
      ONLY destructive act in this plugin and touches only the local queue, never
      ClickUp).
   7. **CLAUDE.md workflow block** — see below.
3. **Write** the sidecar after each change (not once at the end).

## CLAUDE.md managed block

Install or update a marker-delimited block in `<output-dir>/CLAUDE.md` (create the
file if absent). Idempotent: replace everything between the markers if they exist,
append otherwise. Never touch content outside the markers.

```markdown
<!-- BEGIN claude-interrogate-clickup workflow (managed by /clickup-setup) -->
## ClickUp mirror (claude-interrogate-clickup)

- After a /taskout interview completes: run /clickup-push for a new RC, or
  /clickup-sync for an already-mapped RC.
- After checking off RC items by hand, run /clickup-sync when you want the mirror
  current. /clickup-status shows drift and call budget for free first.
- Markdown is canonical. Never edit task state in ClickUp directly.
<!-- END claude-interrogate-clickup workflow (managed by /clickup-setup) -->
```

Offer the install whenever the block is absent; show a diff before writing when it
exists and differs.

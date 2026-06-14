---
name: clickup-push
description: Initial push of a taskout RC into ClickUp (Folder → List = Epic → Story parents → Task subtasks). Use when the user asks to push an RC to ClickUp, OR proactively immediately after a taskout interview completes in a project whose .clickup-map.json has enabled true and the RC is not yet mapped. Already-mapped RCs belong to clickup-sync instead.
---

# ClickUp Push (initial RC mirror)

FIRST: Read `${CLAUDE_PLUGIN_ROOT}/docs/protocol.md`. It is the binding contract —
sidecar schemas, budget discipline, bulk preference, idempotency, no-delete rule.

Arguments: `<rc-id> [output-dir]`. Output dir defaults to the current working
directory (where `roadmap.md` and `.clickup-map.json` live).

## Steps

1. **Gate.** Load `.clickup-map.json` from `<output-dir>/.captain-sdlc/` (legacy
   fallback: the output-dir root — migrate it into `.captain-sdlc/` on next write).
   - `enabled: false` → report disabled, stop.
   - Missing → ask the user: "Initialize ClickUp sync for this project?" Decline →
     write `{ "version": 1, "enabled": false }`, stop.
   - RC already has mappings under `rcs` → this is a sync job; run the clickup-sync
     flow instead and say so.
2. **Export.** Call `design_taskout_export` on the claude-interrogate MCP server with
   `rc_id` and `output_dir`. If the tool is missing, tell the user to install/update
   claude-interrogate to >= 0.1.8 and stop. Never parse the RC markdown yourself.
3. **Project container.** Use sidecar `project.folderId` if set. Otherwise: one
   `Get Workspace Hierarchy` call, present the Spaces/Folders, let the user pick an
   existing Folder or create one for this project; record
   `workspace.teamId` + `project` in the sidecar.
4. **RC target.** Ask: existing sprint List (pick from hierarchy, no extra call) or
   create a List named after the RC (e.g. `MRC1 — LAUNCH`) inside the project Folder?
   Record `listId`, `listName`, `listKind`.
5. **Status map.** From the chosen list's statuses, propose `{open, done, closed}`,
   plus the optional `{inProgress, qa}` keys when the list has plausible candidate
   statuses (these enable intermediate-state mirroring from the Seam 7 release
   pass; skipping them is fine — `/clickup-setup` can add them later). Confirm once
   with the user, store as `statusMap`.
6. **Budget gate.** Per protocol: estimate ALL calls (reconciliation read + creates +
   dependencies), check the ledger, queue-and-stop loudly if it doesn't fit.
7. **Reconcile.** Before-create reconciliation read on the target list (protocol §
   Idempotency); adopt any orphans into the sidecar first.
8. **Estimate planning fields.** Propose a compact per-item table — **Priority**
   (urgent/high/normal/low), **Time Estimate**, **Token Budget** (the list's $-bucket
   dropdown), **Discipline** (the list's dropdown) — guessing each value from the item
   text; let the user confirm or override in one pass. These are sticky estimates
   (protocol § `items[key].fields`) and ride the create calls below at zero extra cost.
   If a custom field is absent on the list, omit that column AND **suggest the user add
   it via the ClickUp web UI** (field name + type, e.g. `Token Budget` (dropdown)) —
   never block; the next user may not share your field setup (portability). Sprint
   Points / Tags are out of scope — never set them.
9. **Create — one `Create Task` per task, full detail in the single call** (there is no
   bulk endpoint — protocol § Single-call create discipline; never create-then-enrich).
   First discover the list's custom fields once (`Get Custom Fields`, 1 call — already
   budgeted): cache `interrogateKeyFieldId` AND the planning `fieldIds` (Token Budget +
   Discipline ids + their option maps) from the SAME response — no extra spend.
   - **Story parents** (one `Create Task` each — set `task_type: Story` when the workspace
     defines it; if not, omit it and suggest the user add a `Story` custom type via the
     ClickUp web UI — portability): description = theme + goals excerpt + the RC
     **Definition of Done** as reference acceptance/verification prose + `interrogate-key`
     footer; key ALSO set in the `interrogate-key` custom field (protocol § Idempotency).
     The milestone DoD is reference prose, never its own task (principle 3). Write sidecar.
   - **Task subtasks** (one `Create Task` each, parent = story taskId, `task_type: Task` —
     ClickUp's default): the SINGLE call carries
     status (from `checked` via statusMap), the `interrogate-key` field + footer, the
     description (item text + the item's **per-item DOD** from the export's `dod`, when
     present, as an `**Acceptance / DOD**` block above the footer — the authored
     requirement, visible from creation), AND the confirmed planning fields inline —
     `priority`, `time_estimate`, and `custom_fields` for Token Budget + Discipline
     (dropdown OPTION UUIDs via `fieldIds`, never labels). Write them to
     `items[key].fields`. The renovated `spec v1` block is still a touch-point concern
     (protocol § Per-task spec blocks) — the per-item DOD here IS the acceptance bar, not
     the spec block. Write sidecar after each batch. Ledger after every call.
10. **Dependencies.** Only where a blocker resolves to an already-mapped key in this
   sidecar — `Add dependency`. Anything else was already folded into description text
   at creation time; spend nothing extra.
11. **Report.** Created counts (stories/tasks), calls spent, budget remaining, anything
    queued to pendingOps.

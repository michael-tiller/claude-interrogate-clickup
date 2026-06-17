---
name: clickup-push
description: Initial push of a taskout RC into ClickUp (Folder → List → epics → tasks). Use when the user asks to push an RC to ClickUp, OR proactively immediately after a taskout interview completes in a project whose .clickup-map.json has enabled true and the RC is not yet mapped. Already-mapped RCs belong to clickup-sync instead.
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
   Skip any field whose custom field is absent on the list (warn once). Sprint Points /
   Tags are out of scope — never set them.
9. **Create.** Discover the list's custom fields once (`Get Custom Fields`, 1 call —
   already budgeted): cache `interrogateKeyFieldId` AND the planning `fieldIds`
   (Token Budget + Discipline ids + their option maps) from the SAME response — no
   extra spend. One bulk create for all epic parents (description = theme + goals
   excerpt + the RC **Definition of Done** as reference acceptance/verification steps
   + `interrogate-key` footer; key ALSO set in the `interrogate-key` custom field via
   `interrogateKeyFieldId` — protocol § Idempotency). The DoD is reference prose in the
   description so the acceptance bar is visible from creation — never its own task
   (principle 3). Write sidecar. One
   bulk create per epic for its items (parent = epic taskId, status from `checked`
   via statusMap, key in field + footer). **On each item create, set the confirmed
   planning fields inline — `priority`, `time_estimate`, and `custom_fields` for Token
   Budget + Discipline (dropdown OPTION UUIDs resolved via `fieldIds`, never labels) —
   riding the same create call (zero extra calls); write them to `items[key].fields`.**
   **Warm vs cold descriptions (deep-shape-first).** When `taskSpecs: true` AND the
   export item is *warm* — it carries a taskout-authored spec (`howToImplement` /
   `designContext` / `dod`) — seed its `spec v1` block into the item description ON THE
   CREATE CALL from the export: **How to implement** (`howToImplement` — the file:line /
   seam path), **Design context** (`designContext` — traps + why), and **Definition of
   Done** (`dod`). It rides the same create (zero extra calls). A *cold* item (no spec on
   the export) keeps the thin description — touch points own its spec later (protocol §
   Per-task spec blocks), so a cold push spends nothing on specs. With `taskSpecs: false`,
   all descriptions stay thin as before. Write sidecar after each batch. Ledger
   after every call.
10. **Dependencies.** Only where a blocker resolves to an already-mapped key in this
   sidecar — `Add dependency`. Anything else was already folded into description text
   at creation time; spend nothing extra.
11. **Report.** Created counts (epics/items), calls spent, budget remaining, anything
    queued to pendingOps.

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.7.0] - 2026-06-17

### Added

- **Warm-ticket spec seeding at create (deep-shape-first).** When `taskSpecs: true` and a
  taskout export carries a per-ticket implementation spec (`howToImplement` /
  `designContext`, new in claude-interrogate ≥ 0.1.16), `clickup-push` now seeds those two
  `spec v1` sections — **How to implement** + **Design context** — into the task
  description on the single `Create Task` call, alongside the existing per-item DOD /
  planning fields, at zero extra ClickUp calls. A *cold* ticket (no export spec) keeps the
  thin description; touch points still own its verification spec. The `spec v1` format
  gains the two implementation sections (the version sentinel rides the block's first
  heading); the renovation rule carries them forward verbatim, so a later `clickup-sync`
  touch only drafts/renovates the verification sections and never re-derives or discards
  the taskout-authored implementation spec. The export/markdown stays canonical — these
  sections are carried from the export, never authored in ClickUp and never synced back.

### Fixed

- **Version drift.** `plugin/.codex-plugin/plugin.json` was stranded at `0.2.1` while
  `VERSION`, `marketplace.json`, and `.claude-plugin/plugin.json` had advanced; all four
  now agree at `0.7.0`.

## [0.6.1] - 2026-06-17

### Changed

- **Docs:** `protocol.md` § Hierarchy mapping now names the planning vocabulary
  (List/RC = milestone, `### Targeted` subsection = epic, checkbox item = ticket) and
  states that ticket granularity is owned upstream by the taskout interview — tickets
  are kept as small/explicit as possible there to keep goals transparent, and the
  mirror only **honors** that decomposition (never splits/merges/resizes items,
  Principle 1). No behavior change; clarifies the seam between taskout and the mirror.

## [0.6.0] - 2026-06-13

### Added

- **Task planning-field enrichment.** `clickup-push` and `clickup-sync` now mirror
  per-item scoping estimates onto each ClickUp task: **Priority** (native), **Time
  Estimate** (native `time_estimate`), **Token Budget** (custom dropdown), and
  **Discipline** (custom dropdown). Values are proposed by the model and confirmed by
  the user once (planning-poker), stored in the `.clickup-map.json` sidecar under
  `items[key].fields`, and are **sticky** — sync never re-prompts; delete an item's
  `fields` block to re-estimate. Token Budget + Discipline ids and their option maps are
  discovered in the SAME `Get Custom Fields` call that finds `interrogate-key` and cached
  under the RC's new `fieldIds` key — so on a fresh push every field rides the
  task-create call at **zero extra ClickUp calls**. A field absent from the list is
  warn-and-skipped. Both `fieldIds` and `items[key].fields` are additive optional sidecar
  keys (no `version` bump). Estimates are mirror metadata — they never touch the
  canonical roadmap markdown.
- **Start-date on flay.** When `clickup-sync` moves a flayed task to in-progress it now
  also sets the task's native `start_date` to that day (riding the same status update)
  and records `items[key].fields.startedAt`, set-once so re-flaying keeps the original
  start.
- `/clickup-setup`'s per-RC view surfaces discovered `fieldIds`; `/clickup-status`
  reports planning-field coverage (estimates N/M) at zero ClickUp cost.
- **Seam 7 footer-drift detector (zero-call).** `/clickup-status` scans commits since the
  last release tag for `Completes:`/`Needs-QA:`/`Implements:` footers and flags any whose
  sidecar checkbox state doesn't reflect them — completed work that silently lagged the
  checkboxes between releases; points at claude-release-clickup's `release-pass --range`
  catch-up. (Shipped unversioned after 0.5.0; released here.)
- **Derived epic-status rollup cache.** Epic sidecar entries may carry an additive
  optional `status` (rollup derived from item state, never authored) so the release pass
  skips re-setting unchanged epics. (Shipped unversioned after 0.5.0; released here.)

### Note

- **Sprint Points and Tags are intentionally not mirrored.** ClickUp's native Sprint
  Points has no write path in the official MCP server (only `custom_fields` / `priority`
  / `time_estimate` / `start_date` are writable); Tags were deferred.

## [0.5.0] - 2026-06-12

### Changed

- **BREAKING: Verification lands in the task BODY, not a comment.** On a qa/complete flip,
  `clickup-sync` writes the `.captain-sdlc/verifications/<key>.md` artifact into the
  mapped task's DESCRIPTION (DOD/QA specs must stay visible, not scroll away under later
  discussion): with `taskSpecs: true` it feeds the spec block's Automated coverage + Human
  QA steps (zero extra calls — same Get+Update the flip already triggers); without it, a
  standalone **Verification** _(spec v1)_ section above the key footer. Artifact deletion
  (the idempotency token) now happens after the successful Update Task.

### Removed

- **BREAKING: Verification comments.** The mirror no longer posts verification comments;
  `Create Task Comment` leaves the call-cost table. The `post-comment` op is retired in
  favor of `update-spec`; legacy queued `post-comment` ops drain as body writes.

## [0.4.0] - 2026-06-12

### Added

- **Per-task spec blocks (opt-in: sidecar `taskSpecs: true`).** Tasks gain a structured
  description block — **Definition of Done** / **Automated coverage** (tests+smokes added
  for the task, with evidence) / **Human QA steps** (numbered manual script for future
  touch passes) — written at **touch points**: DOD drafted/reviewed at the in-progress
  flip, the two verification sections at the qa/complete flip (sourced
  verification-artifact → RC DoD → item text). Unattended runs batch all drafting at the
  end flip tagged `_(auto-drafted — review)_`. **Renovation rule:** any touched task
  upgrades whatever its description holds (bare, hand-written legacy sections, or an
  older `spec vN`) into the current shape, content carried forward — lazy retro-
  application and rolling format evolution, no backfill campaigns. New `update-spec`
  pendingOps verb; +1 `Get Task` +1 `Update Task` per touched task, ledgered and
  estimated. Rename-remap and all description rewrites MUST preserve an existing block.
  `/clickup-setup` gains the toggle; absent/false = zero behavior change, zero spend.

## [0.3.0] - 2026-06-12

### Added

- **Forced call ledger (enforcement).** A plugin `PreToolUse` hook
  (`plugin/hooks/hooks.json` → `lib/clickup-ledger-hook.mjs`) runs before every ClickUp
  MCP call: it prunes the rolling 25h window, appends the ledger entry, and **denies**
  the call when `calls.length >= budget - reserve`. Ledgering and the budget ceiling no
  longer depend on the model remembering — enabling the plugin enables enforcement, no
  per-project `settings.json` wiring. Fails open on its own errors so a bug never bricks
  the mirror; covered by `clickup-ledger-hook.test.mjs`. Decision recorded in ADR 0001.

## [0.2.2] - 2026-06-12

### Added

- **Verification comments.** When `clickup-sync` flips a key to its `qa` or complete status, it posts the `.captain-sdlc/verifications/<key>.md` artifact (written by claude-release-clickup's `/task-footers`) as a ClickUp task comment, then deletes it; over budget or on 429 it queues a `post-comment` op. New `post-comment` op in the durable-queue vocabulary; `Create Task Comment` added to the bulk-preference table (intentionally single-task). Blocked transitions are a documented forward-extension (no footer verb mints one yet).
- **DoD at creation.** `clickup-push` now seeds each epic's description with the RC Definition of Done as reference acceptance/verification steps (description prose only — never pushed as tasks).

### Changed

- **Ledger rule tightened.** Budget discipline now states explicitly that EVERY ClickUp interaction is ledgered — reads (`Get Task`, list reads, `Get Custom Fields`, `Get Workspace Hierarchy`, searches), writes, and `post-comment` calls — not just writes.

## [0.2.1] - 2026-06-11

### Added

- **Flay awareness (advisory).** When interrogate's flay harness (≥ 0.1.9) has an active task in `.captain-sdlc/flay-state.json`: `clickup-sync` queues one `bulk-status-update` op moving the mirrored task to in-progress (only when the RC's `statusMap.inProgress` is configured — absent key skips silently), and `clickup-status` reports the active task's key, phase, and age, flagging likely-abandoned stale state. Blades never act destructively on flay state.

## [0.2.0] - 2026-06-11

### Added

- `/clickup-setup` skill and command — interactive settings menu: enabled toggle, budget/reserve knobs, project Folder and per-RC list retargeting, status-map editing, pending-ops management, and a marker-managed CLAUDE.md workflow block (idempotent install/update).
- Optional `statusMap` keys `inProgress` and `qa` (additive, no sidecar version bump) enabling intermediate-state mirroring from the Seam 7 release pass (claude-release-clickup).

### Changed

- `clickup-push` now offers the optional statusMap keys during initial status mapping.

## [0.1.0] - 2026-06-11

### Added

- Initial scaffold mirroring claude-interrogate's distribution-repo layout
- Three skills: `/clickup-push` (initial RC mirror), `/clickup-sync` (re-sync + drain pending ops), `/clickup-status` (health report)
- Protocol contract at `plugin/docs/protocol.md`: sidecar schemas (`.clickup-map.json`, `.clickup-ledger.json`), 300/24h budget ledger with 30-call reserve, pending-ops durable queue, and idempotent crash recovery via interrogate-key footers and before-create reconciliation
- No-delete policy: removed items close in place; retirement state preserves history forever
- Bundled ClickUp remote MCP server registration for Claude Code and Codex attachment
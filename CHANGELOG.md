# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
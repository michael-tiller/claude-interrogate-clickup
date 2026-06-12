# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
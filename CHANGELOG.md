# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.1.0] - 2026-06-11

### Added

- Initial scaffold mirroring claude-interrogate's distribution-repo layout
- Three skills: `/clickup-push` (initial RC mirror), `/clickup-sync` (re-sync + drain pending ops), `/clickup-status` (health report)
- Protocol contract at `plugin/docs/protocol.md`: sidecar schemas (`.clickup-map.json`, `.clickup-ledger.json`), 300/24h budget ledger with 30-call reserve, pending-ops durable queue, and idempotent crash recovery via interrogate-key footers and before-create reconciliation
- No-delete policy: removed items close in place; retirement state preserves history forever
- Bundled ClickUp remote MCP server registration for Claude Code and Codex attachment
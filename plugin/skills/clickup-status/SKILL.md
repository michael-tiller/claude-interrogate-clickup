---
name: clickup-status
description: Report ClickUp mirror health — call-budget usage, pending ops, per-RC mapping coverage, and local drift — using zero ClickUp calls by default. Use when the user asks about ClickUp budget, sync status, drift, or what's queued.
---

# ClickUp Status (read-only health report)

FIRST: Read `${CLAUDE_PLUGIN_ROOT}/docs/protocol.md` for the sidecar schemas.

Arguments: `[output-dir]`, optional `--verify` flag.

**Default mode makes ZERO ClickUp calls.** It reads the two sidecar files and calls
only `design_taskout_export` (core calls are free — they never touch ClickUp).

## Report contents

1. **Gate.** `.clickup-map.json` missing or `enabled: false` → say sync is disabled
   for this project and stop.
2. **Budget.** From the ledger (prune >25h first): calls used in the rolling window,
   `remaining = budget - used - reserve`, and when the oldest entries roll off.
   Missing ledger → "no calls recorded on this machine" (note the multi-machine
   caveat from the protocol).
3. **Pending ops.** Count, ages, reasons. Flag anything older than 24h.
4. **Per-RC coverage.** For each RC in `rcs`: active/retired item counts, `lastSyncAt`.
5. **Active flay.** If `.captain-sdlc/flay-state.json` exists, report the active
   task: key, phase, age, and whether its RC's statusMap can mirror in-progress.
   Stale state (phase `done`, very old `updatedAt`) → flag it as likely abandoned.
6. **Local drift.** Re-export each mapped RC via `design_taskout_export` and diff
   against the sidecar: new keys, checked-state flips, removed keys. Summarize what a
   sync run would do and roughly how many calls it would cost (including
   reconciliation reads).

## `--verify` (budget-gated spot check)

Only with the flag: pick a small sample (<= 5) of mapped taskIds, `Get Task` each,
confirm they still exist with the expected status and footer. Budget-gate and ledger
these calls per protocol. Report mismatches as drift warnings — never "fix" anything
from ClickUp's side; markdown is canonical.

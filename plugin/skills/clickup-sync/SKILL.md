---
name: clickup-sync
description: Re-sync taskout RC checkbox state into already-mapped ClickUp tasks and drain the pending-ops queue. Use when the user asks to sync ClickUp, OR proactively after a taskout maintenance run in a project whose .clickup-map.json has enabled true and the RC is already mapped.
---

# ClickUp Sync (re-mirror mapped RCs)

FIRST: Read `${CLAUDE_PLUGIN_ROOT}/docs/protocol.md`. It is the binding contract.

Arguments: `[rc-id] [output-dir]`. No rc-id → sync every RC under `rcs` in the
sidecar. Output dir defaults to the current working directory.

## Steps

1. **Gate.** Load `.clickup-map.json` from `<output-dir>/.captain-sdlc/` (legacy
   fallback: the output-dir root). Missing or `enabled: false` → report disabled, stop.
   RC named but not mapped → that's a push job; run the clickup-push flow and say so.
2. **Drain pendingOps first.** Oldest first, budget-gated per protocol. Re-export the
   affected RC before executing each op (ops store keys, not text). Remove an op only
   after its call succeeds. A `post-comment` op posts a verification artifact as a task
   comment (protocol § Verification comments).
3. **Per RC: export and diff.** Call `design_taskout_export`; key-diff against sidecar
   `items`:
   - **New keys** → bulk create under the mapped epic (new subsection → create its
     epic first). Reconciliation read before any create batch (protocol § Idempotency).
   - **`checked` changed** → group all flips by target status; one bulk-status-update
     per status group.
   - **Key gone but `state: "active"`** → close in place (one bulk-status-update with
     the `closed` status), flip mapping to `"retired"`. NEVER delete.
   - **Verification comments.** Any key moved to its `qa` / complete / `blocked` status
     this run — here, or via a drained op in step 2 — and holding a
     `.captain-sdlc/verifications/<key>.md` artifact → post the artifact as a task
     comment, then delete it (protocol § Verification comments). Budget/ledger per call;
     overflow → a `post-comment` op.
4. **Rename heuristic.** If one subsection shows both removals AND additions in the
   same run, list the pairs and ask: "renamed (remap key → existing task, 0 calls) or
   genuinely replaced (close + create)?" before spending any calls. A remap updates
   the sidecar key and the task's footer is left stale — note it for the next created
   task description, never spend a call just to rewrite a footer.
5. **Flay awareness.** If `.captain-sdlc/flay-state.json` exists and is live (not
   phase `done`), and the active task's RC is mapped with `statusMap.inProgress`
   set: queue one `bulk-status-update` op moving its mirrored task to in-progress
   (protocol § Flay awareness). Absent statusMap key → skip silently.
6. **Bookkeeping.** Update `checked`, `lastPushedAt`, `lastSyncAt` per protocol; write
   sidecar after each batch; ledger after every call.
7. **Report.** Per-RC drift summary (created / status-flipped / retired / remapped),
   pendingOps drained and remaining, calls spent, budget remaining, active flay if any.

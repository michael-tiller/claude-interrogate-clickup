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
   after its call succeeds. An `update-spec` op (or a legacy `post-comment` op from an
   older queue) writes a verification artifact into the task's description
   (protocol § Verification in the task body).
3. **Per RC: export and diff.** Call `design_taskout_export`; key-diff against sidecar
   `items`:
   - **New keys** → bulk create under the mapped epic (new subsection → create its
     epic first). Reconciliation read before any create batch (protocol § Idempotency).
   - **`checked` changed** → group all flips by target status; one bulk-status-update
     per status group.
   - **Key gone but `state: "active"`** → close in place (one bulk-status-update with
     the `closed` status), flip mapping to `"retired"`. NEVER delete.
   - **Verification → task body.** Any key moved to its `qa` / complete / `blocked`
     status this run — here, or via a drained op in step 2 — and holding a
     `.captain-sdlc/verifications/<key>.md` artifact → write the artifact into the
     task's DESCRIPTION, never a comment (comments scroll away; DOD/QA specs must stay
     visible): with `taskSpecs: true` it feeds the spec-block write below (same Get+
     Update, zero extra calls); otherwise it lands as a standalone
     `**Verification** _(spec v1)_` section above the key footer. Delete the artifact
     only after the `Update Task` succeeds (protocol § Verification in the task body).
     Overflow → an `update-spec` op.
   - **Per-task spec blocks** (only if sidecar `taskSpecs: true`). Spec work piggybacks
     on flips written this run (protocol § Per-task spec blocks): a key flipped to
     in-progress → draft/review its **Definition of Done**; flipped to qa/complete →
     write **Automated coverage** + **Human QA steps** (sourced verification-artifact →
     RC DoD → item text) and review the DOD. Renovate whatever the description holds
     into the current `spec v1` shape — carry prior content forward, never discard;
     preserve the `interrogate-key` footer exactly. 1 `Get Task` + 1 `Update Task` per
     touched task, ledgered and estimated up front; overflow → an `update-spec` op.
     Unattended runs: skip the in-progress write, batch all drafting at the end flip
     tagged `_(auto-drafted — review)_`.
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

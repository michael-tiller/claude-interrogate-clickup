# ClickUp Mirror Protocol

Canonical contract for the `clickup-push`, `clickup-sync`, and `clickup-status` skills.
Skills MUST follow this document. When this document and a skill's inline prose disagree,
this document wins.

## Principles

1. **Markdown is canonical; ClickUp is a mirror.** The taskout RC files under the
   roadmap directory are the single source of truth. Nothing ever syncs *from* ClickUp
   *to* markdown. There is no two-way sync and there never will be.
2. **No deletes, ever.** The ClickUp MCP server exposes a task-deletion tool; invoking
   it is forbidden. Items removed from markdown are mirrored by setting the list's
   closed-type status. Sidecar mapping entries are never removed either — they flip to
   `"state": "retired"`.
3. **Definition of Done items are never pushed as tasks.** DoD is the ship gate, not
   work items.
4. **Deterministic identity comes from core.** Item and epic keys are computed by the
   `design_taskout_export` tool on the claude-interrogate MCP server (requires
   claude-interrogate >= 0.1.8). Never re-derive, guess, or hand-compute a key.

## Hierarchy mapping

| Interrogate concept            | ClickUp container                                  |
| ------------------------------ | -------------------------------------------------- |
| Consuming project              | one **Folder** (recorded in sidecar `project`)     |
| RC (`M8_QUESTS`, `MRC1_LAUNCH`) | one **List** in that Folder, or an existing sprint List by ID |
| `### Targeted` subsection      | parent task ("epic") in the RC's List              |
| Checkbox item                  | subtask under its epic, status from checked state  |
| Blockers & Dependencies        | dependency link when the blocker maps to a known task key; otherwise folded into description text at creation time |

Sprints in ClickUp are Lists; an RC may target an existing sprint List by ID instead of
a created List. The ClickUp MCP server cannot create sprints — only plain Lists.

## Sidecar files

Both live in `.captain-sdlc/` under the consuming project's output directory — the
Captain SDLC state dir, alongside `flay-state.json`. Legacy projects may still have
them at the output-dir root: read from the root as a fallback, and migrate by moving
the files into `.captain-sdlc/` on the next write. Never maintain both copies.

### `.clickup-map.json` — committed to git

```json
{
  "version": 1,
  "enabled": true,
  "workspace": { "teamId": "9018xxxxx" },
  "project": { "spaceId": "9001", "folderId": "9002", "folderName": "MyGame" },
  "rcs": {
    "MRC1_LAUNCH": {
      "listId": "901807xxxxx",
      "listName": "Sprint 14 (6/8 - 6/21)",
      "listKind": "sprint",
      "interrogateKeyFieldId": "ebbbb7a4-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "fieldIds": {
        "tokenBudget": "cfc439d7-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "tokenBudgetOptions": { "Vibes ($0)": "9d9ca2b0-xxxx", "Dinner ($30)": "45237fb9-xxxx" },
        "discipline": "7de468ab-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "disciplineOptions": { "Eng": "xxxx", "Art": "xxxx" }
      },
      "statusMap": { "open": "to do", "done": "complete", "closed": "complete" },
      "epics": {
        "MRC1_LAUNCH#auth-hardening": { "taskId": "86cxxxxx", "heading": "Auth hardening" }
      },
      "items": {
        "MRC1_LAUNCH#auth-hardening#a1b2c3d4e5f6": {
          "taskId": "86cyyyyy",
          "epicKey": "MRC1_LAUNCH#auth-hardening",
          "text": "Rotate signing keys on deploy",
          "checked": false,
          "state": "active",
          "lastPushedAt": "2026-06-11T18:00:00Z",
          "fields": {
            "priority": "high",
            "timeEstimateMinutes": 120,
            "tokenBudget": "Dinner ($30)",
            "discipline": "Eng",
            "startedAt": "2026-06-13"
          }
        }
      },
      "lastSyncAt": "2026-06-11T18:05:00Z"
    }
  },
  "pendingOps": []
}
```

- `statusMap` core keys are `open`, `done`, `closed`. Two OPTIONAL keys —
  `inProgress` and `qa` — enable intermediate-state mirroring from the Seam 7
  release pass (claude-release-clickup forwards `Implements:`/`Needs-QA:` footer
  transitions as `bulk-status-update` pendingOps). Optional keys are additive: no
  sidecar `version` bump, and consumers that find them absent warn-and-skip
  intermediate mirroring rather than inventing a status. Configure via
  `/clickup-setup`.
- `interrogateKeyFieldId` caches the list's `interrogate-key` custom-field id
  (additive optional key, no `version` bump — discovered once per list via
  `Get Custom Fields`; see Idempotency for the dual-write rule).
- `fieldIds` caches the list's planning custom-field ids + dropdown option maps
  (Token Budget, Discipline) — discovered in the SAME `Get Custom Fields` call that
  finds `interrogateKeyFieldId` (no extra call). Additive optional key, no `version`
  bump. A field absent from the list → omit it and warn-and-skip that enrichment
  (mirrors the `interrogate-key` fallback). Resolve a dropdown's option UUID from its
  `…Options` (cached label→UUID) map at write time — NEVER match by label string
  (option labels may carry trailing spaces).
- `items[key].fields` are per-item **planning estimates** mirrored onto the ClickUp
  task: `priority` (urgent/high/normal/low → native `priority`), `timeEstimateMinutes`
  (→ native `time_estimate`), `tokenBudget` + `discipline` (dropdown labels → option
  UUIDs via `fieldIds`), and `startedAt` (→ native `start_date`, set on flay; see Flay
  awareness). Stored as human-readable labels (git-readable, like `text`/`checked`).
  Additive optional key, no `version` bump. **Estimates are authored once** — proposed
  by the model, confirmed by the user at push (or at first sync for an already-mapped
  RC) — then **sticky**: sync mirrors a value to ClickUp only when the STORED value
  changes, never re-prompting. An active item with no `fields` block = "needs initial
  estimate". Estimates are mirror metadata: they live HERE, never in the canonical
  roadmap markdown (Principle 1). Sprint Points and Tags are intentionally NOT
  mirrored (no MCP write path / out of scope).
- `taskSpecs: true` (OPTIONAL, additive, no `version` bump) enables per-task spec
  blocks (§ Per-task spec blocks). Absent or `false` → skills do no spec work and
  spend no spec calls. Configure via `/clickup-setup`.
- `enabled: false` short-circuits every skill: report "ClickUp sync is disabled for
  this project (.clickup-map.json enabled=false)" and stop. No ClickUp calls, no
  questions.
- Missing file entirely: only `clickup-push` may offer to initialize; declining writes
  `{ "version": 1, "enabled": false }` so the project is never asked again.
  `clickup-sync` and `clickup-status` treat a missing sidecar as disabled.
- `state` is `"active"` or `"retired"`. Retired entries keep their taskId forever.
- An epic entry MAY carry an additive optional `status` (the derived rollup cache —
  `complete`/`qa`/`in-progress`/`to-do`) so the release pass skips re-setting an epic
  whose computed status is unchanged; absent → treat as changed. No `version` bump.
  Epic status is DERIVED from item state (release-pass `epics[]` rollup), never authored.

### `pendingOps[]` — the durable queue

```json
{
  "op": "bulk-create-items",
  "rcId": "MRC1_LAUNCH",
  "epicKey": "MRC1_LAUNCH#auth-hardening",
  "itemKeys": ["MRC1_LAUNCH#auth-hardening#deadbeef0123"],
  "queuedAt": "2026-06-11T18:06:00Z",
  "reason": "budget-exhausted"
}
```

- Op vocabulary: `create-list`, `bulk-create-epics`, `bulk-create-items`,
  `bulk-status-update`, `add-dependency`, `update-spec` (legacy `post-comment` ops
  from ≤ v0.4.0 queues drain as `update-spec` body writes).
- `reason` is `"budget-exhausted"` or `"429"`.
- Ops store **keys, never text** — the drain step re-exports the RC so text is
  current-canonical at execution time. If a queued key no longer exists in the fresh
  export, drop that key from the op (the item was removed from markdown; the normal
  sync diff handles its retirement).
- Drain order: oldest first. Remove an op from the array only after its call succeeds.

### `.clickup-ledger.json` — gitignored in the consuming project

```json
{
  "version": 1,
  "budget": 300,
  "reserve": 30,
  "calls": [
    { "at": "2026-06-11T18:00:01Z", "tool": "create_bulk_tasks", "rcId": "MRC1_LAUNCH" }
  ]
}
```

- `budget` and `reserve` are user-editable knobs. Defaults: 300 / 30.
- Prune entries older than 25 hours on every write.
- Missing ledger: create it with defaults on first ClickUp call. (Multi-machine
  caveat: a fresh ledger can overspend; the reserve plus 429 handling is the backstop.)

## Flay awareness (advisory)

`.captain-sdlc/flay-state.json` (written by interrogate's flay harness, ≥ 0.1.9;
schema_version 1, single object) names the task currently being executed. Blades
read it ADVISORILY — never act destructively on it, never treat stale state
(phase `done`, old `updatedAt`) as live:

- **clickup-sync**: when the active task's RC is mapped AND its `statusMap` has the
  optional `inProgress` key, the sync may queue ONE `bulk-status-update` op moving
  that task's mirrored ClickUp task to in-progress. **On that same update, set the
  task's `start_date` to today and record `items[key].fields.startedAt`** — set-once:
  never overwrite an existing `startedAt`, so re-flaying keeps the original start. The
  start-date write rides the status update (zero extra calls). Normal budget rules
  apply. If `inProgress` is absent, skip silently — never invent a status.
- **clickup-status**: report the active task (key, phase, age) alongside drift.

## Verification in the task body

claude-release-clickup's task-footers writes a verification block to
`.captain-sdlc/verifications/<key>.md` whenever a commit carries a `Needs-QA:` or
`Completes:` footer — what was tried and its result, plus the QA steps to confirm it.
When clickup-sync flips that key to its `qa` or closed/`done` status — draining a qa
`bulk-status-update` op, or detecting a `Completes` checkbox flip — it writes the
artifact's contents into the mapped task's **description** (the body), then deletes
the artifact. DOD and verification specs must not live in a comment that scrolls away
under later discussion — the body is the durable, always-visible surface. *(Supersedes
the v0.1.3–v0.4.0 "verification comments" design; legacy queued `post-comment`
pendingOps drain as body writes.)*

- **With `taskSpecs: true`** the qa/complete spec-block write (§ Per-task spec blocks)
  IS the verification handoff — the artifact feeds **Automated coverage** + **Human QA
  steps**, zero extra calls beyond the spec write that flip already triggers.
- **With `taskSpecs` off/absent** the flip still writes the artifact into the
  description as a standalone `**Verification** _(spec v1)_` section (same placement
  rule: between item text and the `interrogate-key:` footer). Verification durability
  is not opt-in; only the in-progress DOD drafting is.
- One body write = 1 `Get Task` + 1 `Update Task` (descriptions are absent from bulk
  reads). Estimate both in the op-plan budget and ledger them like any call.
- Over budget or on a 429: queue an `update-spec` op (`rcId`, item `key`, `taskId`,
  trigger) to `pendingOps`, stop loudly, never partial-write.
- The artifact is the idempotency token: delete it only after the `Update Task`
  succeeds, so a re-run with no artifact writes nothing.
- The update MUST preserve the description's other content (item text, existing spec
  block content carried forward per the renovation rule, the key footer exactly) —
  clobbering loses human-reviewed prose.
- No artifact for a flipping key → nothing to write; never synthesize one. The mirror
  still never reads ClickUp back into markdown — canonical stays canonical.
- **Blocked (forward extension).** The same plumbing writes a "what we tried / why
  stalled" note on a flip to a blocked status. No footer verb mints a blocked
  transition today (Seam 7 has three verbs); wiring that trigger is an open decision —
  until it lands, this fires only on qa/complete.

## Per-task spec blocks (opt-in: sidecar `taskSpecs: true`)

Each task's description can carry a structured spec block — DOD plus the two
verification layers — written and renovated at **touch points** (status flips), never
as a bulk backfill campaign. The block is **derived prose**, same standing as the epic
DoD seeding: markdown + verification artifacts stay canonical; the block never syncs
back. Format `spec v1`:

```
**Definition of Done** _(spec v1)_
- <binary, observable criteria — what QA actually checks; no prose hedges>

**Automated coverage**
- <tests/smokes added for THIS task + evidence: suite, count, commit — e.g. "CorpseServiceTests 12/12, v2.63.0 50ebbf70">

**Human QA steps**
1. <numbered manual script for FUTURE touch passes — e.g. start game; spawn critter, kill it; 2x speed, wait ~Xs; check logs for the message>
```

Placement: between the item text and the `---` / `interrogate-key:` footer. The
`_(spec v1)_` marker on the first heading is the version sentinel renovation keys off.

**Touch-point triggers** (only when the flip itself is already being written — spec
work piggybacks on transitions, it never initiates calls):

| Flip                  | Spec work                                                       |
| --------------------- | --------------------------------------------------------------- |
| → in-progress         | Draft/review **Definition of Done** (scope knowledge is freshest at work start) |
| → qa / complete       | Write **Automated coverage** (from the verification artifact + named suites) and **Human QA steps** (numbered manual script); review DOD against final scope |

In **auto/unattended runs** (flay-auto, no human at the boundary): skip the
in-progress spec write and batch ALL spec drafting at the end flip (qa/complete),
tagged `_(auto-drafted — review)_` — one write instead of two, fewer ClickUp
interactions.

**Sourcing precedence** for drafted content: the key's verification artifact
(`.captain-sdlc/verifications/<key>.md`) → RC Definition of Done bullets that name the
item → drafted from the item text. Human QA steps describe player-visible verification
(launch, perform, observe), not test-runner invocations — those belong in Automated
coverage.

**Renovation rule (always renovatable).** On any spec-bearing touch, whatever the
description currently holds renovates into the current format: a bare description gets
a fresh block; hand-written legacy sections or an older `spec vN` block get parsed and
their content CARRIED FORWARD into the current shape (never discarded — prior human
prose becomes bullets in the matching section, unrecognized prose is preserved above
the block). This is also how the format itself evolves: bump the sentinel, ship the new
shape, and old tickets upgrade lazily as they're touched — rolling design, no backfill
pass.

**Costs and safety.** A spec write = 1 `Get Task` (descriptions are absent from bulk
reads) + 1 `Update Task`, both ledgered and included in the op-plan estimate; over
budget → queue an `update-spec` op (`rcId`, item `key`, `taskId`, trigger) to
`pendingOps`. The update MUST rewrite the description as item text + block + key
footer, preserving the footer exactly. **Rename-remap and any other description
rewrite MUST preserve an existing spec block** — clobbering it loses human-reviewed
content.

## Budget discipline

The ClickUp MCP server allows ~300 calls per **rolling 24 hours** on paid plans without
the AI add-on. This is a hard constraint, not advisory.

**Enforced, not just disciplined.** A plugin `PreToolUse` hook
(`plugin/hooks/hooks.json` → `lib/clickup-ledger-hook.mjs`) runs before every ClickUp
call: it prunes the 25h window, appends the ledger entry, and **denies** the call when
`calls.length >= budget - reserve`. So the steps below are how a skill stays *within*
the budget gracefully (estimate up front, queue overflow) — the hook is the backstop
that makes "every call is ledgered" and the ceiling true even if a run forgets. See
ADR 0001. The hook fails open on its own errors; never rely on that — keep estimating.

Before ANY sequence of ClickUp calls:

1. Read the ledger, prune entries older than 25h, compute `used = calls.length`.
2. `remaining = budget - used - reserve`.
3. **Estimate the full op plan's call count FIRST** — including one before-create
   reconciliation read per touched list (see Idempotency) and every bulk call. One bulk
   call = one ledger entry, regardless of how many tasks it carries.
4. If `estimate > remaining`: write the ENTIRE plan to `pendingOps`, then stop loudly —
   report used, remaining, what was queued, and roughly when the oldest ledger entries
   roll off. Do not start a batch you cannot finish.
5. Append a ledger entry after EVERY ClickUp call — success or failure, **read or
   write** — before making the next call. No interaction is exempt: reconciliation
   `Get Task` / list reads, `Get Custom Fields` discovery, `Get Workspace Hierarchy`,
   searches, every bulk create/update, dependency links, and verification
   body-write (`Get Task` + `Update Task`) calls all ledger. The `calls[]` example below shows a write, but reads
   count identically — an unledgered call corrupts the rolling-24h count for every
   machine sharing the budget.

On a 429 or any rate-limit error: ledger the failed call, write all remaining work to
`pendingOps` with reason `"429"`, stop loudly. **Never retry-loop.**

## Bulk preference

Never loop single-task create/update calls when a bulk tool covers the batch. At
session start, list the ClickUp server's actual tools and reconcile against this table
(fix this table via a repo PR if names drift; the docs-era names are):

| Purpose                    | Expected tool name (verify live) |
| -------------------------- | -------------------------------- |
| Workspace tree             | Get Workspace Hierarchy          |
| Create a List in a Folder  | Create List                      |
| Batch task creation        | Create Bulk Tasks                |
| Batch status/field updates | Update Bulk Tasks                |
| Dependency links           | Add dependency                   |
| Search                     | Search Workspace                 |
| Read one task              | Get Task                         |
| One body/spec write        | Get Task + Update Task (2 calls) |

One `bulk-create` per epic batch; one `bulk-status-update` per target status group.

## Idempotency and crash recovery

A bulk create can succeed and the session die before the sidecar write. Two mandatory
mechanisms:

1. **Machine-readable key, written twice on create (both ride the same call — zero
   extra spend).**

   **Primary: the `interrogate-key` custom field** (short_text), set via the create
   call's `custom_fields`. Discover the field id once per list (`Get Custom Fields`,
   1 call — counts against the budget estimate) and cache it in the sidecar as the
   RC's `interrogateKeyFieldId` (additive optional key, no `version` bump). If the
   list has no such field, warn the user to add it (the MCP server cannot create
   field definitions) and fall back to footer-only.

   **Secondary: the description footer.** Every created task's description still ends
   with exactly:

   ```
   ---
   interrogate-key: <key>
   ```

   Own line, after a `---` separator, nothing after it. Never freelance this format.
   The footer is kept because it is free at create time and readable by tools that
   omit custom fields — but descriptions are human-editable prose; when field and
   footer disagree, **the custom field wins**.

2. **Before-create reconciliation.** Before ANY create batch into a list, fetch that
   list's tasks using the cheapest available list/search tool the ClickUp server
   exposes for the target List (1 call — counts against the budget estimate).
   Caveat (verified live 2026-06-11): the current server's bulk list read returns
   neither descriptions nor custom-field values — so use the list read to spot
   suspect tasks (same name as a planned create, or any task in a list the sidecar
   says is empty), then `Get Task` each suspect (1 call each, budgeted) and read its
   `interrogate-key` field (footer as fallback). Matches are orphans from an
   interrupted run: adopt them into the sidecar (record their taskId), remove them
   from the create set, then proceed.

Write the sidecar after each completed batch — never once at the end of the run.

## Key caveats

- Keys are stable under whitespace and reordering changes, but **rewording an item
  produces a new key** (close-and-create on the ClickUp side unless the user confirms
  a rename remap during sync). A confirmed remap updates the sidecar key AND rewrites
  the task's `interrogate-key` custom field (1 call — the field is the primary
  identity, a stale field corrupts future reconciliation); the description footer is
  left stale — never spend a call just to rewrite a footer.
- Reordering duplicate-text items under one heading swaps their keys (inherent to the
  occurrence counter; rare and harmless — same text either way).

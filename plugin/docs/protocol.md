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

Both live in the consuming project's output directory (next to `roadmap.md`).

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
          "lastPushedAt": "2026-06-11T18:00:00Z"
        }
      },
      "lastSyncAt": "2026-06-11T18:05:00Z"
    }
  },
  "pendingOps": []
}
```

- `enabled: false` short-circuits every skill: report "ClickUp sync is disabled for
  this project (.clickup-map.json enabled=false)" and stop. No ClickUp calls, no
  questions.
- Missing file entirely: only `clickup-push` may offer to initialize; declining writes
  `{ "version": 1, "enabled": false }` so the project is never asked again.
  `clickup-sync` and `clickup-status` treat a missing sidecar as disabled.
- `state` is `"active"` or `"retired"`. Retired entries keep their taskId forever.

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
  `bulk-status-update`, `add-dependency`.
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

## Budget discipline

The ClickUp MCP server allows ~300 calls per **rolling 24 hours** on paid plans without
the AI add-on. This is a hard constraint, not advisory.

Before ANY sequence of ClickUp calls:

1. Read the ledger, prune entries older than 25h, compute `used = calls.length`.
2. `remaining = budget - used - reserve`.
3. **Estimate the full op plan's call count FIRST** — including one before-create
   reconciliation read per touched list (see Idempotency) and every bulk call. One bulk
   call = one ledger entry, regardless of how many tasks it carries.
4. If `estimate > remaining`: write the ENTIRE plan to `pendingOps`, then stop loudly —
   report used, remaining, what was queued, and roughly when the oldest ledger entries
   roll off. Do not start a batch you cannot finish.
5. Append a ledger entry after EVERY ClickUp call — success or failure — before making
   the next call.

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

One `bulk-create` per epic batch; one `bulk-status-update` per target status group.

## Idempotency and crash recovery

A bulk create can succeed and the session die before the sidecar write. Two mandatory
mechanisms:

1. **Machine-readable footer.** Every created task's description ends with exactly:

   ```
   ---
   interrogate-key: <key>
   ```

   Own line, after a `---` separator, nothing after it. Never freelance this format.

2. **Before-create reconciliation.** Before ANY create batch into a list, fetch that
   list's tasks using the cheapest available list/search tool the ClickUp server
   exposes for the target List (1 call — counts against the budget estimate). Scan
   descriptions for `interrogate-key:` footers matching keys in the planned create
   set. Matches are orphans from an interrupted run: adopt them into the sidecar
   (record their taskId), remove them from the create set, then proceed.

Write the sidecar after each completed batch — never once at the end of the run.

## Key caveats

- Keys are stable under whitespace and reordering changes, but **rewording an item
  produces a new key** (close-and-create on the ClickUp side unless the user confirms
  a rename remap during sync).
- Reordering duplicate-text items under one heading swaps their keys (inherent to the
  occurrence counter; rare and harmless — same text either way).

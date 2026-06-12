#!/usr/bin/env node
// Forced ledger + budget gate for ClickUp MCP calls.
//
// Declared as a PreToolUse hook in ../hooks/hooks.json for the ClickUp tool
// namespace (mcp__plugin_claude-interrogate-clickup_clickup__*). It runs BEFORE
// every such call, so no ClickUp interaction — read, write, or comment — can skip
// the rolling-24h ledger. This is the enforcement the protocol's "ledger after
// EVERY call" rule used to delegate to skill discipline (ADR 0001).
//
// PreToolUse (not PostToolUse) on purpose: appending the *attempt* captures calls
// that later fail (429s, errors) and calls denied downstream — over-counting is
// budget-safe, under-counting is not. The same pass hard-gates the budget: when the
// rolling window is spent, it denies the call so the skill must queue to pendingOps.
//
// Fail-open: any unexpected error allows the call (a crashing gate must never brick
// the mirror) but is logged loudly to stderr.
//
// Pure helpers are exported for ../lib/clickup-ledger-hook.test.mjs.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const PRUNE_MS = 25 * 60 * 60 * 1000; // 25h — matches protocol § Budget discipline
const DEFAULTS = { version: 1, budget: 300, reserve: 30, calls: [] };

/** Drop ledger entries older than 25h; normalize shape. */
export function prune(ledger, nowMs) {
  const cutoff = nowMs - PRUNE_MS;
  const calls = (ledger?.calls ?? []).filter((c) => {
    const t = Date.parse(c?.at);
    return Number.isFinite(t) && t >= cutoff;
  });
  return { ...DEFAULTS, ...ledger, calls };
}

/** True when no call may be spent: used >= budget - reserve. */
export function overBudget(ledger) {
  const budget = Number.isFinite(ledger?.budget) ? ledger.budget : DEFAULTS.budget;
  const reserve = Number.isFinite(ledger?.reserve) ? ledger.reserve : DEFAULTS.reserve;
  return (ledger?.calls?.length ?? 0) >= budget - reserve;
}

/** Append one call entry. */
export function appendCall(ledger, entry) {
  return { ...ledger, calls: [...(ledger?.calls ?? []), entry] };
}

/** Resolve the ledger path under a project cwd: canonical .captain-sdlc, legacy root fallback. */
export function ledgerPath(cwd) {
  const canonical = join(cwd, ".captain-sdlc", ".clickup-ledger.json");
  const legacy = join(cwd, ".clickup-ledger.json");
  if (!existsSync(canonical) && existsSync(legacy)) return legacy;
  return canonical;
}

function loadLedger(path) {
  if (!existsSync(path)) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(path, "utf8")) };
  } catch (err) {
    process.stderr.write(`clickup-ledger-hook: unreadable ledger ${path} (${err.message}); treating as empty\n`);
    return { ...DEFAULTS };
  }
}

function deny(reason) {
  // Claude Code structured hook output: a PreToolUse permissionDecision of "deny"
  // blocks the call and surfaces the reason to the model.
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  let event = {};
  try {
    const raw = await readStdin();
    if (raw.trim()) event = JSON.parse(raw);
  } catch (err) {
    process.stderr.write(`clickup-ledger-hook: bad hook payload (${err.message}); allowing\n`);
    process.exit(0); // fail-open
  }

  const cwd = event.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const tool = event.tool_name || "unknown";
  const path = ledgerPath(cwd);
  const now = Date.now();

  const ledger = prune(loadLedger(path), now);

  if (overBudget(ledger)) {
    const budget = Number.isFinite(ledger.budget) ? ledger.budget : DEFAULTS.budget;
    const reserve = Number.isFinite(ledger.reserve) ? ledger.reserve : DEFAULTS.reserve;
    deny(
      `ClickUp budget exhausted: ${ledger.calls.length} calls in the last 25h ` +
      `(budget ${budget}, reserve ${reserve}). Queue remaining work to pendingOps ` +
      `and stop — protocol § Budget discipline. Oldest entries roll off as the window slides.`,
    );
    return;
  }

  const next = appendCall(ledger, { at: new Date(now).toISOString(), tool });
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(next, null, 2) + "\n");
  } catch (err) {
    process.stderr.write(`clickup-ledger-hook: could not write ledger ${path} (${err.message}); allowing\n`);
  }
  process.exit(0); // allow
}

// Only run the CLI when invoked directly (not when imported by the test).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("clickup-ledger-hook.mjs")) {
  main().catch((err) => {
    process.stderr.write(`clickup-ledger-hook: ${err.stack || err}; allowing\n`);
    process.exit(0); // fail-open: never brick the mirror
  });
}

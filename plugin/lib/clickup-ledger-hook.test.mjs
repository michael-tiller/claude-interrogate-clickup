// Run: node --test plugin/lib/clickup-ledger-hook.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { prune, overBudget, appendCall, ledgerPath } from "./clickup-ledger-hook.mjs";

const SCRIPT = fileURLToPath(new URL("./clickup-ledger-hook.mjs", import.meta.url));
const HOUR = 60 * 60 * 1000;

test("prune drops entries older than 25h, keeps recent", () => {
  const now = Date.parse("2026-06-12T12:00:00Z");
  const ledger = {
    calls: [
      { at: new Date(now - 26 * HOUR).toISOString(), tool: "old" },
      { at: new Date(now - 1 * HOUR).toISOString(), tool: "fresh" },
    ],
  };
  const out = prune(ledger, now);
  assert.equal(out.calls.length, 1);
  assert.equal(out.calls[0].tool, "fresh");
});

test("prune drops unparseable timestamps (cannot prove they are in-window)", () => {
  const now = Date.parse("2026-06-12T12:00:00Z");
  const out = prune({ calls: [{ at: "not-a-date", tool: "x" }] }, now);
  assert.equal(out.calls.length, 0);
});

test("overBudget true exactly at budget - reserve, honoring custom knobs", () => {
  const mk = (n) => ({ budget: 10, reserve: 3, calls: Array(n).fill({ at: "x" }) });
  assert.equal(overBudget(mk(6)), false); // 6 < 7
  assert.equal(overBudget(mk(7)), true); //  7 >= 10 - 3
});

test("overBudget falls back to 300/30 defaults when knobs absent", () => {
  assert.equal(overBudget({ calls: Array(269).fill({ at: "x" }) }), false);
  assert.equal(overBudget({ calls: Array(270).fill({ at: "x" }) }), true);
});

test("appendCall is pure and additive", () => {
  const a = { calls: [] };
  const b = appendCall(a, { at: "x", tool: "t" });
  assert.equal(a.calls.length, 0);
  assert.equal(b.calls.length, 1);
});

test("ledgerPath prefers .captain-sdlc, falls back to legacy root only if it exists", () => {
  const dir = mkdtempSync(join(tmpdir(), "ledger-path-"));
  try {
    // Neither exists → canonical .captain-sdlc location.
    assert.ok(ledgerPath(dir).endsWith(join(".captain-sdlc", ".clickup-ledger.json")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- CLI: the actual forced-ledger behavior the hook delivers ---

function runHook(cwd) {
  const event = JSON.stringify({
    tool_name: "mcp__plugin_claude-interrogate-clickup_clickup__clickup_get_task",
    cwd,
  });
  return execFileSync("node", [SCRIPT], { input: event, encoding: "utf8" });
}

test("CLI appends an entry to the project ledger on an allowed call (forced ledgering)", () => {
  const dir = mkdtempSync(join(tmpdir(), "ledger-append-"));
  try {
    const out = runHook(dir);
    assert.equal(out.trim(), "", "an allowed call emits no decision JSON");
    const path = join(dir, ".captain-sdlc", ".clickup-ledger.json");
    assert.ok(existsSync(path), "ledger is created under .captain-sdlc");
    const ledger = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(ledger.calls.length, 1);
    assert.match(ledger.calls[0].tool, /clickup_get_task$/);
    // A second call increments — the count is the budget signal.
    runHook(dir);
    assert.equal(JSON.parse(readFileSync(path, "utf8")).calls.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI denies (and does NOT append) when the rolling window is spent", () => {
  const dir = mkdtempSync(join(tmpdir(), "ledger-deny-"));
  try {
    const now = new Date().toISOString();
    const spent = { version: 1, budget: 5, reserve: 1, calls: Array(4).fill({ at: now, tool: "x" }) };
    const path = join(dir, ".captain-sdlc", ".clickup-ledger.json");
    execFileSync("node", ["-e", `require("fs").mkdirSync(require("path").dirname(${JSON.stringify(path)}),{recursive:true});require("fs").writeFileSync(${JSON.stringify(path)},${JSON.stringify(JSON.stringify(spent))})`]);
    const out = runHook(dir);
    const decision = JSON.parse(out);
    assert.equal(decision.hookSpecificOutput.permissionDecision, "deny");
    assert.match(decision.hookSpecificOutput.permissionDecisionReason, /budget exhausted/i);
    // Denied call must NOT be ledgered (it never happens).
    assert.equal(JSON.parse(readFileSync(path, "utf8")).calls.length, 4);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

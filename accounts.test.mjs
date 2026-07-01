// accounts.test.mjs — multi-account registry + rotation acceptance.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadAccounts, applyAccount, pickAccount, advanceRR,
  parseLimit, noteResult, selectAccount, accountsStatus, fetchPlanQuotas,
} from "./accounts.mjs";

const CFG = {
  providers: {
    codex: {
      command: "codex", rotation: "round-robin", accountEnv: "CODEX_HOME",
      accounts: [{ id: "codex-a", configDir: "~/.codex-a" }, { id: "codex-b", configDir: "~/.codex-b" }],
    },
    openrouter: {
      command: null, apiKeyEnv: "OPENROUTER_API_KEY",
      accounts: [{ id: "or-1" }],
    },
    ollama: { command: "ollama" }, // no accounts -> excluded
  },
};

test("loadAccounts merges secrets by id and excludes provider with no accounts", () => {
  const reg = loadAccounts(CFG, { secrets: { openrouter: { accounts: [{ id: "or-1", apiKey: "sk-or-xxx" }] } } });
  assert.ok(reg.codex && reg.openrouter);
  assert.equal(reg.ollama, undefined);
  assert.equal(reg.openrouter.accounts[0].apiKey, "sk-or-xxx"); // secret merged
  assert.equal(reg.codex.accountEnv, "CODEX_HOME");
});

test("applyAccount sets apiKey env and login configDir env", () => {
  const e1 = applyAccount({ id: "or-1", apiKey: "sk-x" }, { apiKeyEnv: "OPENROUTER_API_KEY" }, {});
  assert.equal(e1.OPENROUTER_API_KEY, "sk-x");
  const e2 = applyAccount({ id: "codex-a", configDir: "/tmp/cdx-a" }, { accountEnv: "CODEX_HOME" }, {});
  assert.equal(e2.CODEX_HOME, "/tmp/cdx-a");
  const e3 = applyAccount({ id: "ag", apiKey: "tok", envKey: "ANTIGRAVITY_TOKEN" }, {}, {});
  assert.equal(e3.ANTIGRAVITY_TOKEN, "tok"); // per-account envKey override
});

test("round-robin spreads across accounts; advanceRR rotates", () => {
  const prov = CFG.providers.codex;
  const st = { rrIndex: 0, accounts: {} };
  const a = pickAccount(prov, st); advanceRR(st, 2);
  const b = pickAccount(prov, st); advanceRR(st, 2);
  const c = pickAccount(prov, st);
  assert.equal(a.id, "codex-a");
  assert.equal(b.id, "codex-b");
  assert.equal(c.id, "codex-a"); // wrapped
});

test("a cooling-down account is skipped (failover)", () => {
  const prov = { ...CFG.providers.codex, rotation: "failover" };
  const now = 1000;
  const st = { rrIndex: 0, accounts: { "codex-a": { cooldownUntil: now + 5000 } } };
  const pick = pickAccount(prov, st, { now });
  assert.equal(pick.id, "codex-b"); // a is cooling -> b
});

test("all accounts cooling down returns null (caller escalates)", () => {
  const prov = CFG.providers.codex; const now = 1000;
  const st = { accounts: { "codex-a": { cooldownUntil: now + 1 }, "codex-b": { cooldownUntil: now + 1 } } };
  assert.equal(pickAccount(prov, st, { now }), null);
});

test("rotationOverride pins a per-workload policy over the provider default", () => {
  // provider default = round-robin (spread); a cache-heavy role overrides to failover (sticky)
  const prov = CFG.providers.codex; // rotation: round-robin
  const st = { rrIndex: 1, accounts: {} };
  assert.equal(pickAccount(prov, st).id, "codex-b");                                  // round-robin honors rrIndex
  assert.equal(pickAccount(prov, st, { rotationOverride: "failover" }).id, "codex-a"); // sticky -> first live
});

test("least-used picks the account with fewest uses", () => {
  const prov = { ...CFG.providers.codex, rotation: "least-used" };
  const st = { accounts: { "codex-a": { uses: 5 }, "codex-b": { uses: 1 } } };
  assert.equal(pickAccount(prov, st).id, "codex-b");
});

test("parseLimit detects 429 and CLI usage-limit text with reset", () => {
  assert.equal(parseLimit("openrouter", { status: 429, resetMs: 1200000 }).limited, true);
  assert.equal(parseLimit("openrouter", { status: 429, resetMs: 1200000 }).resetMs, 1200000);
  const cdx = parseLimit("codex", { code: 1, text: "Error: usage limit reached. try again in 30m" });
  assert.equal(cdx.limited, true);
  assert.equal(cdx.resetMs, 30 * 60 * 1000);
  assert.equal(parseLimit("codex", { code: 0, text: "ok done" }).limited, false);
});

test("noteResult accumulates usage and sets cooldown on limit", () => {
  const st = { accounts: {} };
  noteResult(st, "codex-a", { cost: 0, tokens: 100, now: 1000 });
  noteResult(st, "codex-a", { tokens: 50, limited: true, resetMs: 5000, now: 2000 });
  assert.equal(st.accounts["codex-a"].uses, 2);
  assert.equal(st.accounts["codex-a"].tokens, 150);
  assert.equal(st.accounts["codex-a"].cooldownUntil, 7000); // 2000 + 5000
});

test("selectAccount end-to-end: rotates, persists, and cools down a limited account", () => {
  const dir = mkdtempSync(join(tmpdir(), "acct-"));
  const sp = join(dir, "state.json");
  const reg = loadAccounts(CFG);
  // dispatch 1 -> codex-a, mark it limited
  const s1 = selectAccount("codex", reg.codex, sp, { now: 1000 });
  assert.equal(s1.account.id, "codex-a");
  s1.note({ limited: true, resetMs: 100000, now: 1000 });
  // dispatch 2 -> codex-a is cooling, must pick codex-b
  const s2 = selectAccount("codex", reg.codex, sp, { now: 2000 });
  assert.equal(s2.account.id, "codex-b");
  s2.note({ tokens: 10, now: 2000 });
  rmSync(dir, { recursive: true, force: true });
});

test("accountsStatus reports per-account live/cooldown + usage (CLI + /api/accounts view)", () => {
  const dir = mkdtempSync(join(tmpdir(), "acct-st-"));
  const sp = join(dir, "state.json");
  writeFileSync(sp, JSON.stringify({ codex: { accounts: {
    "codex-a": { cooldownUntil: 9999, uses: 2, tokens: 100, cost: 0 },
    "codex-b": { uses: 1, tokens: 50 },
  } } }));
  const rows = accountsStatus(CFG, sp, { now: 1000 });
  const codex = rows.find((r) => r.provider === "codex");
  const a = codex.accounts.find((x) => x.id === "codex-a");
  const b = codex.accounts.find((x) => x.id === "codex-b");
  assert.equal(a.live, false); // cooling (9999 > 1000)
  assert.equal(a.uses, 2);
  assert.equal(b.live, true);
  assert.equal(codex.rotation, "round-robin");
  rmSync(dir, { recursive: true, force: true });
});

test("fetchPlanQuotas reads OpenRouter's real plan quota via /api/v1/key ($ usage/limit)", async () => {
  const cfg = { providers: { openrouter: {
    apiKeyEnv: "OPENROUTER_API_KEY",
    accounts: [{ id: "or-1", envKey: "OPENROUTER_API_KEY", apiKey: "sk-or-test" }],
  } } };
  let hitUrl = null, hitAuth = null;
  const fetchImpl = async (url, opts) => {
    hitUrl = url; hitAuth = opts.headers.Authorization;
    return { ok: true, json: async () => ({ data: { usage: 3.5, limit: 10, limit_remaining: 6.5 } }) };
  };
  const q = await fetchPlanQuotas(cfg, { secretsPath: null, fetchImpl });
  assert.match(hitUrl, /\/key$/);           // hits the key endpoint
  assert.equal(hitAuth, "Bearer sk-or-test"); // with the account's token
  const pq = q["openrouter/or-1"];
  assert.equal(pq.source, "api");
  assert.equal(pq.used, 3.5);
  assert.equal(pq.limit, 10);
  assert.equal(pq.remaining, 6.5);
});

test("fetchPlanQuotas: no key → no entry; provider with no quota API → not fetched", async () => {
  const cfg = { providers: {
    openrouter: { apiKeyEnv: "OPENROUTER_API_KEY", accounts: [{ id: "or-1", envKey: "OPENROUTER_API_KEY" }] },
    claude: { accountEnv: "CLAUDE_CONFIG_DIR", accounts: [{ id: "claude-1", configDir: "~/.claude-1" }] },
  } };
  const prev = process.env.OPENROUTER_API_KEY; delete process.env.OPENROUTER_API_KEY;
  let called = false;
  const q = await fetchPlanQuotas(cfg, { secretsPath: null, fetchImpl: async () => { called = true; return { ok: true, json: async () => ({}) }; } });
  if (prev !== undefined) process.env.OPENROUTER_API_KEY = prev;
  assert.equal(called, false);              // no key → never fetched
  assert.deepEqual(q, {});                  // claude has no quota API → absent
});

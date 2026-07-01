// accounts-admin.test.mjs — write-side (login / manage) acceptance.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  setAccountKey, resetCooldown, resetUsage,
  setProviderEnabled, setRotation, setUsageLimit, startLogin, clearAccount,
} from "./accounts-admin.mjs";

function tmp() { return mkdtempSync(join(tmpdir(), "acct-adm-")); }
const CFG = {
  providers: {
    codex: { command: "codex", enabled: false, rotation: "round-robin", accountEnv: "CODEX_HOME",
      accounts: [{ id: "codex-1", configDir: "~/.codex-1" }] },
    antigravity: { command: "agy", enabled: false, apiKeyEnv: "ANTIGRAVITY_TOKEN",
      accounts: [{ id: "ag-1", envKey: "ANTIGRAVITY_TOKEN" }] },
    openrouter: { apiKeyEnv: "OPENROUTER_API_KEY", accounts: [{ id: "or-1", envKey: "OPENROUTER_API_KEY" }] },
  },
};

test("setAccountKey writes secret into accounts.local.json and resolves the envKey", () => {
  const d = tmp();
  const cfgPath = join(d, "config.json"); writeFileSync(cfgPath, JSON.stringify(CFG));
  const secPath = join(d, "accounts.local.json");
  const r = setAccountKey({ provider: "antigravity", id: "ag-1", apiKey: "tok-xyz" }, { secretsPath: secPath, configPath: cfgPath });
  assert.equal(r.ok, true);
  assert.equal(r.envKey, "ANTIGRAVITY_TOKEN"); // resolved from account/provider
  const sec = JSON.parse(readFileSync(secPath, "utf8"));
  assert.equal(sec.antigravity.accounts[0].apiKey, "tok-xyz");
  assert.equal(sec.antigravity.accounts[0].id, "ag-1");
  // update in place (merge by id, no duplicate)
  setAccountKey({ provider: "antigravity", id: "ag-1", apiKey: "tok-new" }, { secretsPath: secPath, configPath: cfgPath });
  const sec2 = JSON.parse(readFileSync(secPath, "utf8"));
  assert.equal(sec2.antigravity.accounts.length, 1);
  assert.equal(sec2.antigravity.accounts[0].apiKey, "tok-new");
  rmSync(d, { recursive: true, force: true });
});

test("setAccountKey rejects bad id and missing key", () => {
  const d = tmp(); const secPath = join(d, "s.json");
  assert.throws(() => setAccountKey({ provider: "openrouter", id: "../evil", apiKey: "k" }, { secretsPath: secPath }));
  assert.throws(() => setAccountKey({ provider: "openrouter", id: "or-1" }, { secretsPath: secPath }));
  rmSync(d, { recursive: true, force: true });
});

test("resetCooldown clears cooldown; resetUsage zeroes counters", () => {
  const d = tmp(); const sp = join(d, "state.json");
  writeFileSync(sp, JSON.stringify({ codex: { accounts: { "codex-1": { uses: 9, cost: 1.5, tokens: 400, cooldownUntil: 99999, lastLimitAt: 5 } } } }));
  const r1 = resetCooldown({ provider: "codex", id: "codex-1" }, { statePath: sp });
  assert.equal(r1.account.cooldownUntil, 0);
  assert.equal(JSON.parse(readFileSync(sp, "utf8")).codex.accounts["codex-1"].cooldownUntil, 0);
  const r2 = resetUsage({ provider: "codex", id: "codex-1" }, { statePath: sp });
  assert.equal(r2.account.uses, 0);
  assert.equal(r2.account.tokens, 0);
  rmSync(d, { recursive: true, force: true });
});

test("clearAccount: login-dir deletes credential file; key removes token from secrets", () => {
  const d = tmp();
  const cfgPath = join(d, "config.json");
  const dir5 = join(d, "codexdir");
  writeFileSync(cfgPath, JSON.stringify({ providers: {
    codex: { accounts: [{ id: "codex-1", configDir: dir5 }] },
    openrouter: { apiKeyEnv: "OPENROUTER_API_KEY", accounts: [{ id: "or-1", envKey: "OPENROUTER_API_KEY" }] },
  } }));
  const secPath = join(d, "sec.json");
  // login-dir: write an auth.json then log out → file gone
  mkdirSync(dir5, { recursive: true });
  writeFileSync(join(dir5, "auth.json"), "{}");
  const r1 = clearAccount({ provider: "codex", id: "codex-1" }, { configPath: cfgPath, secretsPath: secPath });
  assert.equal(r1.loggedOut, true);
  assert.equal(existsSync(join(dir5, "auth.json")), false);
  // key: seed a token then clear → gone from secrets
  writeFileSync(secPath, JSON.stringify({ openrouter: { accounts: [{ id: "or-1", apiKey: "sk-or-x" }] } }));
  clearAccount({ provider: "openrouter", id: "or-1" }, { configPath: cfgPath, secretsPath: secPath });
  assert.equal(JSON.parse(readFileSync(secPath, "utf8")).openrouter, undefined);
  rmSync(d, { recursive: true, force: true });
});

test("setUsageLimit writes/clears the 5h/7d caps in config.json", () => {
  const d = tmp(); const cfgPath = join(d, "config.json");
  writeFileSync(cfgPath, JSON.stringify(CFG));
  let r = setUsageLimit({ provider: "codex", limit5h: 150, limit7d: 1000 }, { configPath: cfgPath });
  assert.equal(r.limit5h, 150); assert.equal(r.limit7d, 1000);
  assert.equal(JSON.parse(readFileSync(cfgPath, "utf8")).providers.codex.usage.limit5h, 150);
  // clearing 5h (empty) removes just that key; 0/negative treated as clear
  r = setUsageLimit({ provider: "codex", limit5h: "", limit7d: 500 }, { configPath: cfgPath });
  assert.equal(r.limit5h, null); assert.equal(r.limit7d, 500);
  rmSync(d, { recursive: true, force: true });
});

test("setProviderEnabled / setRotation edit config.json and preserve a BOM", () => {
  const d = tmp(); const cfgPath = join(d, "config.json");
  writeFileSync(cfgPath, "﻿" + JSON.stringify(CFG, null, 2)); // BOM like the real file
  setProviderEnabled({ provider: "codex", enabled: true }, { configPath: cfgPath });
  setRotation({ provider: "codex", rotation: "least-used" }, { configPath: cfgPath });
  const raw = readFileSync(cfgPath, "utf8");
  assert.equal(raw.charCodeAt(0), 0xfeff); // BOM survived
  const cfg = JSON.parse(raw.replace(/^﻿/, ""));
  assert.equal(cfg.providers.codex.enabled, true);
  assert.equal(cfg.providers.codex.rotation, "least-used");
  assert.throws(() => setRotation({ provider: "codex", rotation: "bogus" }, { configPath: cfgPath }));
  rmSync(d, { recursive: true, force: true });
});

test("startLogin: key-only provider returns a non-interactive hint (no spawn)", () => {
  const r = startLogin({ provider: "openrouter", id: "or-1" }, { config: CFG });
  assert.equal(r.interactive, false);
  assert.match(r.hint, /key-based/);
});

test("startLogin: antigravity has no CLI login (agy authenticates via the IDE keyring)", () => {
  // agy has no `auth login` subcommand — it must NOT try to spawn one (that hangs the interactive agent)
  const r = startLogin({ provider: "antigravity", id: "ag-1" }, { config: CFG });
  assert.equal(r.interactive, false);
  assert.match(r.hint, /key-based/);
});

test("startLogin: login-dir provider spawns the login with the right config-dir env", () => {
  let captured = null;
  const spawnFn = (cmd, args, o) => { captured = { cmd, args, env: o.env }; return { on() {}, unref() {} }; };
  const r = startLogin({ provider: "codex", id: "codex-1" }, { config: CFG, spawnFn });
  assert.equal(r.ok, true);
  assert.equal(r.interactive, true);
  // env carries the login dir; the descriptor's command is stable across platforms
  assert.ok(captured.env.CODEX_HOME && captured.env.CODEX_HOME.includes(".codex-1"));
  assert.match(r.command, /CODEX_HOME=~\/\.codex-1 codex login/);
  if (process.platform === "win32") {
    // opens a VISIBLE console so the OAuth URL shows + the browser opens
    assert.equal(captured.cmd, "cmd");
    assert.ok(captured.args.join(" ").includes("codex login"));
  } else {
    assert.equal(captured.cmd, "codex");
    assert.deepEqual(captured.args, ["login"]);
  }
});

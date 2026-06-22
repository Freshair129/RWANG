# GUIDE--ADDING-PROVIDER — วิธีเพิ่ม AI Provider ใหม่เข้า G-Orch

> **Spec:** [SPEC--PROVIDER-REGISTRY](SPEC--PROVIDER-REGISTRY.md)
> **ADR:** [ADR-O-005](ADR-O-005--provider-registry.md)

---

## สิ่งที่ต้องแก้: 2 ไฟล์

| ไฟล์ | ทำอะไร |
| --- | --- |
| `orchestration/config.json` | ประกาศ provider + ใส่ใน role preferred chains |
| `orchestration/providers.mjs` | เขียน executor function + register dispatch |

**ไม่ต้องแก้ engine.mjs** — engine dispatch ผ่าน `runProvider()` อัตโนมัติ.

---

## Step 1 — ประกาศ provider ใน config.json

เพิ่ม entry ใหม่ใน `providers`:

```jsonc
// config.json → providers
"myprovider": {
  "enabled": true,
  "capabilities": ["text_gen", "file_edit"],    // ประกาศซื่อสัตย์
  "transport": "http",                          // "http" | "subprocess"

  // สำหรับ http:
  "host": "https://api.myprovider.com/v1",
  "auth": { "envKey": "MYPROVIDER_API_KEY", "apiKey": "" },

  // สำหรับ subprocess:
  // "command": "myprovider",
  // "baseArgs": ["--flag"],
  // "extraArgs": []
}
```

### Capability tags ที่เลือกได้

| Tag | เมื่อไรถึงประกาศ |
| --- | --- |
| `text_gen` | ทุก provider **ต้อง** ประกาศ |
| `file_edit` | executor สร้าง/แก้ไฟล์บนดิสก์ได้ (CLI agent) |
| `shell_exec` | executor รัน shell ได้ |
| `code_review` | executor ตอบ verdict JSON ที่ Verify Gate parse ได้ |
| `streaming` | output ไหลสด (log tail ได้) |
| `vision` | รับ image input |
| `long_context` | context ≥32k |
| `sandbox` | isolated execution |

**กฎ:** ห้ามประกาศ capability ที่ executor ทำไม่ได้จริง — จะเกิด runtime failure
เมื่อ role ที่ requires capability นั้นถูก dispatch มา.

## Step 2 — ใส่ใน role preferred chains

เพิ่ม `myprovider:model` ใน `roles.{role}.preferred` ตำแหน่งที่ต้องการ:

```jsonc
// config.json → roles
"coder": {
  "requires": ["file_edit"],
  "preferred": [
    "claude:sonnet",
    "myprovider:default",     // ← เพิ่มตรงนี้ (ลำดับ = priority)
    "codex:o4-mini",
    "ollama:gemma4-rust-coder:latest"
  ]
}
```

**ตำแหน่งสำคัญ:** provider ที่อยู่ก่อนจะถูกเลือกก่อน (fallback chain).

## Step 3 — เขียน executor ใน providers.mjs

### 3a. เพิ่ม prefix ใน `KNOWN_PREFIXES`

```js
const KNOWN_PREFIXES = new Set([
  "claude", "ollama", "codex", "openrouter", "antigravity",
  "myprovider"    // ← เพิ่ม
]);
```

### 3b. เพิ่ม case ใน `runProvider()`

```js
export function runProvider(providerName, task, model, worker, prompt, config, paths, opts = {}) {
  switch (providerName) {
    // ... existing cases ...
    case "myprovider": return runMyProvider(task, model, worker, prompt, config, paths, opts);
    default: ...
  }
}
```

### 3c. เขียน executor function

#### Template: HTTP provider (OpenAI-compatible API)

```js
async function runMyProvider(t, model, worker, prompt, config, paths, opts) {
  if (!existsSync(paths.LOGS)) mkdirSync(paths.LOGS, { recursive: true });
  const logFile = join(paths.LOGS, `${t.id}.${worker}.log`);
  const ws = createWriteStream(logFile, { flags: "w" });
  const prov = config.providers.myprovider;
  const host = (prov.host || "https://api.myprovider.com/v1").replace(/\/$/, "");
  const apiKey = prov.auth?.apiKey || process.env[prov.auth?.envKey || "MYPROVIDER_API_KEY"];

  // header
  ws.write(`# ${t.id} · ${worker} · myprovider:${model} · started ${new Date().toISOString()}\n\n`);

  if (!apiKey) {
    ws.write(`# ⚠ no API key\n`); ws.end();
    return { ok: false, logFile, code: -1, provider: "myprovider", usage: {} };
  }

  let acc = "", inTok = 0, outTok = 0, ok = false, blocked = false;
  try {
    const resp = await fetch(`${host}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, stream: true, messages: [{ role: "user", content: prompt }] }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    // parse SSE stream
    const reader = resp.body.getReader(); const dec = new TextDecoder(); let buf = "";
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true }); let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const ln = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!ln.startsWith("data: ") || ln === "data: [DONE]") continue;
        let chunk; try { chunk = JSON.parse(ln.slice(6)); } catch { continue; }
        const delta = chunk.choices?.[0]?.delta?.content || "";
        if (delta) { ws.write(delta); acc += delta; }
        if (chunk.usage) { inTok = chunk.usage.prompt_tokens || 0; outTok = chunk.usage.completion_tokens || 0; }
      }
    }
    ok = true;
    if (/^[\s>*-]*BLOCKED:/m.test(acc)) { blocked = true; ws.write(`\n# ⚠ BLOCKED\n`); }
    ws.write(`\n\n# done · ${inTok} in / ${outTok} out\n`);
  } catch (e) {
    ws.write(`\n# error: ${e.message}\n`);
  }
  ws.end();
  return {
    ok: ok && !blocked && !!acc.trim(), blocked, logFile,
    code: ok ? 0 : 1, provider: "myprovider",
    usage: { cost: 0, inTok, outTok, cache: 0 },
  };
}
```

#### Template: Subprocess provider (CLI agent)

```js
function runMyProvider(t, model, worker, prompt, config, paths, opts) {
  return new Promise((res) => {
    if (!existsSync(paths.LOGS)) mkdirSync(paths.LOGS, { recursive: true });
    const logFile = join(paths.LOGS, `${t.id}.${worker}.log`);
    const prov = config.providers.myprovider;
    const ws = createWriteStream(logFile, { flags: "w" });
    ws.write(`# ${t.id} · ${worker} · myprovider:${model} · started ${new Date().toISOString()}\n\n`);

    const args = [...(prov.baseArgs || []), "--model", model, ...(prov.extraArgs || [])];
    const child = spawn(prov.command || "myprovider", args, {
      cwd: paths.ROOT, shell: true, env: childEnvFor("myprovider", config),
    });
    child.stdin.write(prompt); child.stdin.end();

    let stdout = "";
    child.stdout.on("data", (d) => { ws.write(d); stdout += d; });
    child.stderr.on("data", (d) => ws.write(d));
    child.on("close", (code) => {
      const blocked = /^[\s>*-]*BLOCKED:/m.test(stdout);
      ws.write(`\n# exit ${code}\n`); ws.end();
      res({
        ok: code === 0 && !blocked, blocked, logFile, code, provider: "myprovider",
        usage: { cost: 0, inTok: 0, outTok: 0, cache: 0 },
      });
    });
    child.on("error", (e) => {
      ws.write("\n# spawn error: " + e + "\n"); ws.end();
      res({ ok: false, logFile, code: -1, provider: "myprovider", usage: {} });
    });
  });
}
```

### 3d. เพิ่ม health check (optional)

```js
// ใน checkHealth():
case "myprovider": return checkMyProviderHealth(prov);

// function
async function checkMyProviderHealth(prov) {
  // HTTP: ping API
  // subprocess: spawn --version
}
```

## Step 4 — ทดสอบ

```bash
# 1. ตรวจ config parse
node -e "import('./engine.mjs').then(E => console.log(E.listProviders(E.CONFIG)))"

# 2. ตรวจ model parsing
node -e "import('./providers.mjs').then(m => console.log(m.parseModel('myprovider:mymodel')))"

# 3. ตรวจ role resolution
node -e "import('./engine.mjs').then(E => console.log(E.resolveForRole('coder', E.CONFIG)))"

# 4. ตรวจ health
node -e "import('./engine.mjs').then(E => E.checkHealth('myprovider', E.CONFIG).then(console.log))"

# 5. dry-run
node orchestrator.mjs run

# 6. dispatch จริง (1 task)
node orchestrator.mjs run --execute --max 1
```

## Step 5 — Prompt tuning

ถ้า provider ต้องการ prompt format พิเศษ:

1. **Text-only provider** → เพิ่มชื่อใน `TEXT_ONLY_PROVIDERS` set ใน `engine.mjs`:
   ```js
   const TEXT_ONLY_PROVIDERS = new Set(["ollama", "openrouter", "myprovider"]);
   ```
   จะได้ inline scaffold + small-model rules แทน doc paths.

2. **Full-agent provider** → ไม่ต้องแก้; ได้ doc paths เหมือน claude.

3. **ต้องการ prompt format เฉพาะ** → เพิ่ม branch ใน `buildPrompt()`:
   ```js
   if (provider === "myprovider") {
     // custom prompt format
   }
   ```

---

## ตัวอย่างจริง: เปิด OpenRouter

```jsonc
// config.json
"openrouter": {
  "enabled": true,                              // ← เปลี่ยนจาก false
  "auth": { "apiKey": "sk-or-v1-xxxxx" }        // ← ใส่ key
}
```

```bash
# set env var แทนก็ได้
export OPENROUTER_API_KEY="sk-or-v1-xxxxx"

# ตรวจ
node -e "import('./engine.mjs').then(E => E.checkHealth('openrouter', E.CONFIG).then(console.log))"
# { up: true }

# ตอนนี้ architect role จะ fallback ไป openrouter ถ้า claude ไม่ได้
```

---

## Checklist

- [ ] `config.json`: provider entry with `enabled`, `capabilities`, `transport`, `auth`
- [ ] `config.json`: provider:model ใน role `preferred` chains ที่เหมาะ
- [ ] `providers.mjs`: prefix ใน `KNOWN_PREFIXES`
- [ ] `providers.mjs`: case ใน `runProvider()` switch
- [ ] `providers.mjs`: executor function (return `ExecutorResult` shape)
- [ ] `providers.mjs`: health check (optional)
- [ ] `engine.mjs`: `TEXT_ONLY_PROVIDERS` ถ้าเป็น text-gen-only
- [ ] ทดสอบ: parse → resolve → health → dry-run → dispatch

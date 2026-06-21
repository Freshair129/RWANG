/**
 * PoC — GenesisDB N-API round-trip สำหรับ Local-Model Anti-Error Loop
 * พิสูจน์กลไกหลักของ SPEC--LOCAL-MODEL-ANTI-ERROR-LOOP ก่อน implement L0/L1:
 *   G2 (Remember): เก็บ "ความผิด" ที่ Verify Gate เคยตีกลับ เป็น node + embedding
 *   G3 (Retrieve): task ใหม่ที่ "คล้าย" ดึงความผิดนั้นกลับมาด้วย hybridSearch (semantic)
 *   G1 (Ground):   retrieveContext(tier, budget) คืน ContextPackage{tokenEstimate}
 *
 * รัน:  node orchestration/poc/genesis-roundtrip.mjs
 * ต้องมี: GenesisDB ที่ G:/GenesisBlock_Dev/GenesisBlock (binary คอมไพล์แล้ว) + Ollama + bge-m3:latest
 *
 * เป็น read-only ต่อ repo — เขียนเฉพาะ temp DB ใน os.tmpdir() แล้วลบทิ้ง
 */
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync, mkdtempSync } from "node:fs";

const require = createRequire(import.meta.url);
const GENESIS = "G:/GenesisBlock_Dev/GenesisBlock/index.js";
const OLLAMA = "http://127.0.0.1:11434";
const EMBED_MODEL = "bge-m3:latest";

const log = (...a) => console.log(...a);
const ok = (m) => log(`  \x1b[32m✓\x1b[0m ${m}`);
const info = (m) => log(`  \x1b[36m·\x1b[0m ${m}`);

// --- embedding ผ่าน Ollama bge-m3 (รองรับทั้ง /api/embeddings และ /api/embed) ---
async function embed(text) {
  const r = await fetch(`${OLLAMA}/api/embeddings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
  });
  if (!r.ok) throw new Error(`Ollama embed HTTP ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const v = j.embedding ?? (Array.isArray(j.embeddings) ? j.embeddings[0] : null);
  if (!Array.isArray(v)) throw new Error(`embedding shape ไม่รู้จัก: ${JSON.stringify(j).slice(0, 200)}`);
  return v;
}

async function main() {
  log("\n=== PoC: GenesisDB Anti-Error Loop round-trip ===\n");

  // [0] โหลด N-API binding
  log("[0] โหลด GenesisDB N-API binding (in-process, ไม่เปิด port → เลี่ยง :3000 ชน GSI)");
  const { GenesisDatabase, engineNameSync, schemaVersionSync } = require(GENESIS);
  ok(`engine=${engineNameSync()} schema=v${schemaVersionSync()}`);

  // [1] probe มิติ embedding ของ bge-m3
  log("\n[1] probe มิติ bge-m3");
  const probe = await embed("probe");
  const DIM = probe.length;
  ok(`bge-m3 = ${DIM} มิติ`);

  // [2] เปิด temp DB ด้วย vectorDim ตรงกับ bge-m3
  log("\n[2] เปิด GenesisDB (temp, in-process)");
  const dir = mkdtempSync(join(tmpdir(), "genesis-poc-"));
  const dbPath = join(dir, "anti-error.gdb");
  const db = GenesisDatabase.open({ path: dbPath, pageCacheMb: 64, readOnly: false, vectorDim: DIM });
  ok(`open ที่ ${dbPath} (vectorDim=${DIM})`);

  // [3] G2 — เก็บ "ความผิด" จริงจาก REPORT เป็น failure node + embedding
  log("\n[3] G2 Remember — เก็บความผิดที่ Verify Gate เคยตีกลับ");
  const failures = [
    { task: "G0.3 CI: clippy + eslint + tauri build",
      issue: "hallucinate GitHub Action 'actions/setup-rust@v3' ที่ไม่มีจริง",
      fix: "ใช้ 'dtolnay/rust-toolchain@stable' แทน" },
    { task: "G1.5 Vercel web build",
      issue: "ลืม prefix 'pnpm' หน้าคำสั่ง build ใน workflow",
      fix: "ใช้ 'pnpm build:web' ไม่ใช่ 'build:web' เปล่า ๆ" },
    { task: "G6.1 SQLite schema + write layer",
      issue: "เขียน mock RTCDataChannel ทุก property จนวนลูป (pattern degeneration)",
      fix: "ใช้ 'as unknown as T' ข้าม exhaustive typing ตาม GUIDE §3.2" },
  ];
  for (const f of failures) {
    const node = await db.addNode({
      labels: ["failure"],
      lang: "th",
      causedBy: "verify-gate",
      props: { task: f.task, issue: f.issue, fix: f.fix, severity: "critical", model: "ollama:gemma4-rust-coder" },
      embedding: await embed(`${f.task} :: ${f.issue}`),
    });
    ok(`เก็บ failure node ${node.id} — ${f.issue.slice(0, 48)}…`);
  }

  // [4] G3 — task ใหม่ที่ "คล้าย" ดึงความผิดกลับมาด้วย semantic search
  log("\n[4] G3 Retrieve — task ใหม่ (ยังไม่เคยทำ) ค้นความผิดที่คล้าย");
  const newTask = "G8.x: ตั้ง CI workflow ใหม่สำหรับ build Rust + Tauri บน Windows";
  info(`task ใหม่: "${newTask}"`);
  const hits = await db.hybridSearch({ queryVector: await embed(newTask), k: 2, alpha: 0.5, lang: "th" });
  if (!hits.length) throw new Error("hybridSearch ไม่คืนผล — round-trip ล้มเหลว");
  log("  → ความผิดที่ควร inject เป็น \x1b[33m❌ ห้ามทำ\x1b[0m ใน prompt รอบหน้า:");
  for (const h of hits) {
    const p = h.node.props;
    log(`     ❌ ${p.issue}\n        ✅ ${p.fix}  (จาก ${p.task})`);
  }
  const top = hits[0].node.props;
  if (/setup-rust/.test(top.issue)) ok("top-1 = ความผิด CI ที่เกี่ยวข้องจริง (semantic match ทำงาน)");
  else info(`top-1 = ${top.issue.slice(0, 60)} (ตรวจ relevance ด้วยตา)`);

  // [5] G1 — retrieveContext (GRL tiered context + token budget)
  log("\n[5] G1 Ground — retrieveContext(tier, budget) → ContextPackage");
  try {
    const ctx = await db.retrieveContext(hits[0].node.id, "H1", 4000, true);
    ok(`ContextPackage: nodes=${ctx.nodes?.length ?? 0} tokenEstimate=${ctx.tokenEstimate ?? "?"}`);
    info(`reasoningPath: ${(ctx.reasoningPath ?? "").slice(0, 80)}`);
  } catch (e) {
    info(`retrieveContext ยังไม่เต็มรูป (${e.message.slice(0, 60)}) — G1 เป็นเฟส L2 ไม่บล็อก L0/L1`);
  }

  // cleanup
  try { await db.saveState?.(); } catch {}
  rmSync(dir, { recursive: true, force: true });

  log("\n\x1b[32m=== PoC ผ่าน: G2 store + G3 retrieve round-trip ทำงานจริง ===\x1b[0m");
  log("→ พร้อมสร้าง L0 (failure write-only) แล้วต่อ L1 (inject ❌ past mistakes)\n");
}

main().catch((e) => {
  console.error(`\n\x1b[31m✗ PoC ล้มเหลว:\x1b[0m ${e.stack || e.message}`);
  process.exit(1);
});

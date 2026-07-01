// ollama-vram.test.mjs — serialized model loading (unload big models, keep <1B + embeds).
import { test } from "node:test";
import assert from "node:assert/strict";
import { paramB, isKeepResident, ensureVram } from "./ollama-vram.mjs";

test("paramB parses parameter_size in B and M", () => {
  assert.equal(paramB({ details: { parameter_size: "7.6B" } }), 7.6);
  assert.equal(paramB({ details: { parameter_size: "600M" } }), 0.6);
  assert.equal(paramB({ parameter_size: "1B" }), 1);
  assert.equal(paramB({}), null);
});

test("isKeepResident: embeddings/rerankers and <1B stay; big chat models don't", () => {
  assert.equal(isKeepResident({ name: "bge-m3:latest" }), true);            // embed
  assert.equal(isKeepResident({ name: "hf.co/x/bge-reranker-v2" }), true);  // reranker
  assert.equal(isKeepResident({ name: "nomic-embed-text:latest" }), true);
  assert.equal(isKeepResident({ name: "polaris-0.8b", details: { parameter_size: "0.8B" } }), true); // <1B
  assert.equal(isKeepResident({ name: "qwen3:latest", details: { parameter_size: "8B" } }), false);
  assert.equal(isKeepResident({ name: "llama3.2:1b", details: { parameter_size: "1.2B" } }), false); // 1.2B ≥ 1 → unload
  assert.equal(isKeepResident({ name: "custom-keep" }, ["custom-keep"]), true); // explicit pattern
});

test("ensureVram unloads other big models, keeps target + embeds + tiny", async () => {
  const ps = { models: [
    { name: "qwen3:latest", details: { parameter_size: "8B" } },        // target -> keep
    { name: "gemma-4-12b", details: { parameter_size: "12B" } },        // big other -> UNLOAD
    { name: "bge-m3:latest", details: { parameter_size: "567M" } },     // embed -> keep
    { name: "tiny-0.5b", details: { parameter_size: "0.5B" } },         // <1B -> keep
  ] };
  const posts = [];
  const fetchFn = async (url, opt) => {
    if (url.endsWith("/api/ps")) return { ok: true, json: async () => ps };
    posts.push(JSON.parse(opt.body));
    return { ok: true, json: async () => ({}) };
  };
  const { unloaded } = await ensureVram({ host: "http://127.0.0.1:11434", target: "qwen3:latest", fetchFn });
  assert.deepEqual(unloaded, ["gemma-4-12b"]);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].model, "gemma-4-12b");
  assert.equal(posts[0].keep_alive, 0); // immediate unload
});

test("ensureVram is best-effort: a failed /api/ps returns no-op, never throws", async () => {
  const r1 = await ensureVram({ fetchFn: async () => ({ ok: false }) });
  assert.deepEqual(r1.unloaded, []);
  const r2 = await ensureVram({ fetchFn: async () => { throw new Error("down"); } });
  assert.deepEqual(r2.unloaded, []);
});

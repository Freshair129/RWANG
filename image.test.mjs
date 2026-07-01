// image.test.mjs — image providers (OpenAI-compatible + A1111) with an injected fetch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSize, saveImageOutputs, openAIImage, a1111Image, imageBackendOf, runImage } from "./image.mjs";

const PNG_B64 = // 1x1 transparent PNG
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
function tmp() { return mkdtempSync(join(tmpdir(), "img-")); }
const okJson = (obj) => ({ ok: true, json: async () => obj, text: async () => "" });

test("parseSize parses WxH and falls back", () => {
  assert.deepEqual(parseSize("512x768"), { width: 512, height: 768, size: "512x768" });
  assert.equal(parseSize("bogus").size, "1024x1024");
});

test("imageBackendOf: explicit wins, localhost -> a1111, else openai-compatible", () => {
  assert.equal(imageBackendOf({ imageBackend: "a1111" }), "a1111");
  assert.equal(imageBackendOf({ host: "http://127.0.0.1:7860" }), "a1111");
  assert.equal(imageBackendOf({ host: "https://api.openai.com/v1" }), "openai-compatible");
});

test("openAIImage generations posts JSON and returns b64 outputs", async () => {
  let seen = null;
  const fetchFn = async (url, opt) => { seen = { url, opt }; return okJson({ data: [{ b64_json: PNG_B64 }] }); };
  const { outputs } = await openAIImage({ host: "https://api.openai.com/v1", apiKey: "sk-x", model: "gpt-image-1", prompt: "a logo", fetchFn });
  assert.match(seen.url, /\/images\/generations$/);
  assert.equal(JSON.parse(seen.opt.body).prompt, "a logo");
  assert.equal(outputs[0].b64, PNG_B64);
});

test("openAIImage with a reference image hits /images/edits (img2img, multipart)", async () => {
  const d = tmp(); const ref = join(d, "ref.png"); writeFileSync(ref, Buffer.from(PNG_B64, "base64"));
  let seen = null;
  const fetchFn = async (url, opt) => { seen = { url, opt }; return okJson({ data: [{ b64_json: PNG_B64 }] }); };
  const { outputs } = await openAIImage({ apiKey: "sk-x", model: "gpt-image-1", prompt: "edit it", refImage: ref, fetchFn });
  assert.match(seen.url, /\/images\/edits$/);
  assert.ok(seen.opt.body instanceof FormData, "edits uses multipart FormData");
  assert.equal(outputs[0].b64, PNG_B64);
  rmSync(d, { recursive: true, force: true });
});

test("a1111Image posts txt2img and maps images[] -> outputs", async () => {
  let seen = null;
  const fetchFn = async (url, opt) => { seen = { url, opt }; return okJson({ images: [PNG_B64], info: "{}" }); };
  const { outputs } = await a1111Image({ host: "http://127.0.0.1:7860", prompt: "icon", size: "512x512", fetchFn });
  assert.match(seen.url, /\/sdapi\/v1\/txt2img$/);
  assert.equal(JSON.parse(seen.opt.body).width, 512);
  assert.equal(outputs[0].b64, PNG_B64);
});

test("saveImageOutputs writes b64 and downloads url outputs", async () => {
  const d = tmp();
  const fetchFn = async () => ({ ok: true, arrayBuffer: async () => Buffer.from(PNG_B64, "base64") });
  const files = await saveImageOutputs([{ b64: PNG_B64 }, { url: "http://x/y.png" }], d, "logo", { fetchFn });
  assert.equal(files.length, 2);
  assert.ok(files.every((f) => existsSync(f)));
  rmSync(d, { recursive: true, force: true });
});

test("runImage (openai-compatible) saves assets and returns the file list", async () => {
  const root = tmp();
  const config = { providers: { "openai-image": { imageBackend: "openai-compatible", host: "https://api.openai.com/v1", apiKeyEnv: "OPENAI_API_KEY", model: "gpt-image-1", outDir: "assets" } } };
  const paths = { ROOT: root, LOGS: join(root, "logs") };
  const fetchFn = async () => okJson({ data: [{ b64_json: PNG_B64 }] });
  const r = await runImage({ id: "logo-1" }, "gpt-image-1", "w1", "a crisp minimal logo", config, paths,
    { providerName: "openai-image", account: { apiKey: "sk-x" }, fetchFn });
  assert.equal(r.ok, true);
  assert.equal(r.provider, "openai-image");
  assert.equal(r.files.length, 1);
  assert.ok(existsSync(r.files[0]));
  assert.ok(readdirSync(join(root, "assets")).length >= 1);
});

test("runImage fails cleanly with no API key (never throws)", async () => {
  const root = tmp();
  const config = { providers: { "openai-image": { imageBackend: "openai-compatible", apiKeyEnv: "NOPE_KEY" } } };
  const paths = { ROOT: root, LOGS: join(root, "logs") };
  const r = await runImage({ id: "x" }, "gpt-image-1", "w1", "p", config, paths, { providerName: "openai-image", fetchFn: async () => okJson({}) });
  assert.equal(r.ok, false);
  assert.equal(r.code, 1);
});

/**
 * GenesisDB Node Sidecar (tech_stack--genesisdb-sidecar)
 *
 * Loads the GenesisDB N-API binary in-process — no port opened, no :3000 clash with GSI.
 * Lifecycle: createSidecar(opts) → validate schema → open DB → return { addNode, hybridSearch, retrieveContext, close }
 *
 * Schema gate: on startup schemaVersionSync() must equal PINNED_SCHEMA_VERSION.
 * If the binary ships a breaking migration, bump PINNED_SCHEMA_VERSION after verifying the migration.
 *
 * Embeddings: Ollama bge-m3:latest (1024-dim). Every addNode call without a pre-computed
 * embedding vector calls Ollama; callers may pass `embedding` to skip the round-trip.
 */
import { createRequire } from "node:module";

// ── Pinned constants ────────────────────────────────────────────────────────
// Bump PINNED_SCHEMA_VERSION explicitly when GenesisDB ships a breaking migration.
export const PINNED_SCHEMA_VERSION = 1;
export const DEFAULT_BINARY = "G:/GenesisBlock_Dev/GenesisBlock/index.js";
export const DEFAULT_EMBED_MODEL = "bge-m3:latest";
export const DEFAULT_VECTOR_DIM = 1024;
export const DEFAULT_OLLAMA = "http://127.0.0.1:11434";

// ── Internal helpers ─────────────────────────────────────────────────────────
async function ollamaEmbed(text, ollamaHost, embedModel) {
  const r = await fetch(`${ollamaHost}/api/embeddings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: embedModel, prompt: text }),
  });
  if (!r.ok) {
    throw new Error(`Ollama embed HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  const j = await r.json();
  const v = j.embedding ?? (Array.isArray(j.embeddings) ? j.embeddings[0] : null);
  if (!Array.isArray(v)) {
    throw new Error(`genesis-sidecar: embed shape unknown: ${JSON.stringify(j).slice(0, 120)}`);
  }
  return v;
}

// ── Public API ───────────────────────────────────────────────────────────────
/**
 * Open a GenesisDB sidecar instance.
 *
 * @param {object} opts
 * @param {string}  [opts.bindingPath]  - Absolute path to win32-x64 N-API index.js
 * @param {string}   opts.dbPath        - Path for the GenesisDB database directory (required)
 * @param {number}  [opts.vectorDim]    - Vector dimension; must match embed model (default 1024)
 * @param {string}  [opts.embedModel]   - Ollama model name (default "bge-m3:latest")
 * @param {string}  [opts.ollamaHost]   - Ollama base URL (default "http://127.0.0.1:11434")
 * @param {number}  [opts.pageCacheMb]  - DB page cache in MB (default 64)
 * @param {number}  [opts.pinnedSchema] - Expected schema version; throws on mismatch (default PINNED_SCHEMA_VERSION)
 *
 * @returns {Promise<{engine: string, schema: number, addNode, hybridSearch, retrieveContext, close}>}
 *
 * @throws {Error} "GenesisDB schema mismatch" if binary schema ≠ pinnedSchema
 * @throws {Error} if dbPath is not provided
 */
export async function createSidecar({
  bindingPath = DEFAULT_BINARY,
  dbPath,
  vectorDim = DEFAULT_VECTOR_DIM,
  embedModel = DEFAULT_EMBED_MODEL,
  ollamaHost = DEFAULT_OLLAMA,
  pageCacheMb = 64,
  pinnedSchema = PINNED_SCHEMA_VERSION,
} = {}) {
  if (!dbPath) throw new Error("genesis-sidecar: dbPath is required");

  // Load N-API binding synchronously (CommonJS require — in-process, no socket/port)
  const require = createRequire(import.meta.url);
  let binding;
  try {
    binding = require(bindingPath);
  } catch (e) {
    throw new Error(`genesis-sidecar: failed to load binding at "${bindingPath}": ${e.message}`);
  }
  const { GenesisDatabase, engineNameSync, schemaVersionSync } = binding;

  // ── Schema gate ────────────────────────────────────────────────────────────
  const actualSchema = schemaVersionSync();
  if (actualSchema !== pinnedSchema) {
    throw new Error(
      `GenesisDB schema mismatch: binary reports v${actualSchema}, sidecar expects v${pinnedSchema}. ` +
      `Bump PINNED_SCHEMA_VERSION in genesis-sidecar.mjs after verifying the migration.`
    );
  }

  const engine = engineNameSync();

  // ── Open database ─────────────────────────────────────────────────────────
  const db = GenesisDatabase.open({
    path: dbPath,
    pageCacheMb,
    readOnly: false,
    vectorDim,
  });

  // ── Sidecar instance ───────────────────────────────────────────────────────
  return {
    /** Name of the GenesisDB storage engine (from binding). */
    engine,
    /** Verified schema version (equals pinnedSchema after the gate). */
    schema: actualSchema,

    /**
     * Add a node. Embedding is computed via Ollama bge-m3 from `text` unless
     * a pre-computed `embedding` array is supplied (saves an Ollama round-trip).
     *
     * @param {object} node
     * @param {string}   [node.id]        - Optional stable node ID
     * @param {string[]} [node.labels]    - Node type labels (e.g. ["failure"])
     * @param {string}   [node.lang]      - Language hint ("th" default)
     * @param {object}   [node.props]     - Arbitrary key-value properties
     * @param {string}   [node.text]      - Text to embed (used when no `embedding` provided)
     * @param {number[]} [node.embedding] - Pre-computed vector; skips Ollama call
     */
    async addNode({ id, labels = [], lang = "th", props = {}, text, embedding, ...rest }) {
      const vec = embedding ?? await ollamaEmbed(text ?? JSON.stringify(props), ollamaHost, embedModel);
      return db.addNode({ ...(id !== undefined ? { id } : {}), labels, lang, props, embedding: vec, ...rest });
    },

    /**
     * Hybrid (vector + lexical) search over the graph.
     *
     * @param {object} opts
     * @param {string}   [opts.queryText]   - Query text; Ollama embed called if no queryVector
     * @param {number[]} [opts.queryVector] - Pre-computed query vector; skips Ollama call
     * @param {number}   [opts.k]           - Number of results (default 5)
     * @param {number}   [opts.alpha]       - Vector weight 0–1 (default 0.5)
     * @param {string}   [opts.lang]        - Language filter (default "th")
     *
     * @returns {Promise<Array<{node: object, score: number}>>}
     */
    async hybridSearch({ queryText, queryVector, k = 5, alpha = 0.5, lang = "th" } = {}) {
      const vec = queryVector ?? await ollamaEmbed(queryText, ollamaHost, embedModel);
      return db.hybridSearch({ queryVector: vec, k, alpha, lang });
    },

    /**
     * GRL tiered context retrieval starting from an anchor node.
     *
     * @param {string}  nodeId  - Anchor node ID (typically from a hybridSearch hit)
     * @param {string}  tier    - H-context tier: "H0".."H5"
     * @param {number}  budget  - Token budget for the returned context package
     * @param {boolean} full    - Include full node content (default true)
     *
     * @returns {Promise<{nodes: object[], tokenEstimate: number, reasoningPath: string}>}
     */
    async retrieveContext(nodeId, tier = "H1", budget = 4000, full = true) {
      return db.retrieveContext(nodeId, tier, budget, full);
    },

    /** Flush pending writes and close cleanly. Best-effort: never throws. */
    async close() {
      try { await db.saveState?.(); } catch { /* best-effort */ }
    },
  };
}

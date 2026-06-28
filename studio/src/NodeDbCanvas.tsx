// NodeDbCanvas (feature--node-db-canvas) — drop atoms INTO GenesisDB and query them back.
// Uses the engine's /api/node (write) + /api/query-nodes (hybrid search) endpoints.
import { useState } from "react";
import { useStore } from "./store";

export default function NodeDbCanvas() {
  const atoms = useStore((s) => s.atoms);
  const order = useStore((s) => s.order);
  const [log, setLog] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<unknown>(null);

  const drop = async (id: string) => {
    const t = atoms[id];
    const r = await fetch("/api/node", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, type: t.type, title: t.title, body: t.accept || t.title }),
    });
    const j = await r.json().catch(() => ({}));
    setLog((l) => [`drop ${id} → ${j.ok ? "ok" : "fail " + (j.error || "")}`, ...l].slice(0, 14));
  };
  const query = async () => {
    const r = await fetch("/api/query-nodes", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ q, k: 8 }),
    });
    setResults(await r.json().catch(() => ({ error: "bad response" })));
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div>
        <div className="graph-legend">drop an atom INTO GenesisDB (POST /api/node)</div>
        <div style={{ maxHeight: "62vh", overflow: "auto" }}>
          {order.map((id) => (
            <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", borderBottom: "1px solid #1a2436" }}>
              <code style={{ fontSize: 11 }}>{id}</code>
              <button onClick={() => drop(id)}>drop →DB</button>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="graph-legend">query GenesisDB back (hybrid search)</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="semantic query…" style={{ flex: 1 }} />
          <button onClick={query}>search</button>
        </div>
        <pre style={{ fontSize: 11, maxHeight: "32vh", overflow: "auto", background: "#0b1220", padding: 8 }}>{results ? JSON.stringify(results, null, 2) : "(no query yet)"}</pre>
        <div className="graph-legend">log</div>
        <pre style={{ fontSize: 11 }}>{log.join("\n") || "(none)"}</pre>
      </div>
    </div>
  );
}

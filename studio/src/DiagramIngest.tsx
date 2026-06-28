// DiagramIngest (feature--diagram-ingest) — paste a mermaid flowchart, parse to draft atoms +
// depends_on edges, preview (the human-review gate). Commit-to-backlog (author atoms) is the
// next wiring step. Harvested concept from GoVibe SYSTEM-04 Diagram-to-Doc.
import { useMemo, useState } from "react";

const SAMPLE = `graph LR
  spec --> design
  design --> build
  build --> test
  test --> ship`;

function parseMermaid(src: string) {
  const nodes = new Set<string>();
  const edges: { from: string; to: string }[] = [];
  for (const line of src.split("\n")) {
    const m = line.match(/([A-Za-z0-9_-]+)\s*-->\s*([A-Za-z0-9_-]+)/);
    if (m) { nodes.add(m[1]); nodes.add(m[2]); edges.push({ from: m[1], to: m[2] }); }
  }
  return { nodes: [...nodes], edges };
}

export default function DiagramIngest() {
  const [src, setSrc] = useState(SAMPLE);
  const draft = useMemo(() => parseMermaid(src), [src]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div>
        <div className="graph-legend">paste a diagram (mermaid flowchart: <code>A --&gt; B</code>)</div>
        <textarea value={src} onChange={(e) => setSrc(e.target.value)} spellCheck={false}
          style={{ width: "100%", height: "62vh", fontFamily: "monospace", fontSize: 12, background: "#0b1220", color: "#cfe6ff" }} />
      </div>
      <div>
        <div className="graph-legend">draft preview · {draft.nodes.length} atoms · {draft.edges.length} edges · ⛔ review before commit</div>
        <strong>atoms</strong>
        <ul>{draft.nodes.map((n) => <li key={n}><code>{n}</code></li>)}</ul>
        <strong>depends_on</strong>
        <ul>{draft.edges.map((e, i) => <li key={i}><code>{e.to}</code> ← <code>{e.from}</code></li>)}</ul>
        <div className="graph-legend">commit-to-backlog (author atoms → atoms.gorch.json) = next wiring step</div>
      </div>
    </div>
  );
}

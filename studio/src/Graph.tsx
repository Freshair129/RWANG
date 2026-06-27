// Graph (feature--graph-editable, read-only v1) — wave-layered DAG; nodes=atoms, edges=deps.
// Edge EDITING (Obsidian-style) needs an engine dep-write API — a later increment.
import { useStore, type Task } from "./store";

const COL_W = 196, ROW_H = 52, PAD = 28, NODE_W = 168, NODE_H = 34;
const phaseColor = (p: string) => (p === "P0" ? "#64c7ff" : p === "P1" ? "#9be7ff" : p === "P2" ? "#7c8cff" : "#4a5d80");
const statusFill = (s: string) =>
  s === "done" ? "#11241c" : s === "failed" ? "#2a0f18" : (s === "running" || s === "claimed" || s === "reviewing") ? "#15294a" : "#0e1626";

export default function Graph() {
  const atoms = useStore((s) => s.atoms);
  const waves = useStore((s) => s.meta.waves) || [];

  const pos: Record<string, { x: number; y: number }> = {};
  waves.forEach((w, wi) => w.forEach((id, ri) => { pos[id] = { x: PAD + wi * COL_W, y: PAD + ri * ROW_H }; }));
  const maxRows = Math.max(1, ...waves.map((w) => w.length));
  const W = PAD * 2 + Math.max(1, waves.length) * COL_W;
  const H = PAD * 2 + maxRows * ROW_H;

  const edges: { a: { x: number; y: number }; b: { x: number; y: number } }[] = [];
  for (const id in atoms) {
    const t = atoms[id]; if (!pos[id]) continue;
    for (const d of t.deps || []) if (pos[d]) edges.push({ a: pos[d], b: pos[id] });
  }

  return (
    <div className="graph-wrap">
      <div className="graph-legend">waves (topological, left→right) · {waves.length} levels · {Object.keys(atoms).length} atoms · read-only</div>
      <div className="graph-scroll">
        <svg width={W} height={H} className="graph-svg">
          {edges.map((e, i) => {
            const x1 = e.a.x + NODE_W, y1 = e.a.y + NODE_H / 2, x2 = e.b.x, y2 = e.b.y + NODE_H / 2;
            const mx = (x1 + x2) / 2;
            return <path key={i} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} className="edge" />;
          })}
          {Object.entries(pos).map(([id, p]) => {
            const t: Task = atoms[id]; if (!t) return null;
            return (
              <g key={id} transform={`translate(${p.x},${p.y})`}>
                <rect width={NODE_W} height={NODE_H} rx={7} fill={statusFill(t.status)} stroke={phaseColor(t.phase)} strokeWidth={1.5} />
                <rect width={4} height={NODE_H} rx={2} fill={phaseColor(t.phase)} />
                <text x={11} y={14} className="g-id">{id}</text>
                <text x={11} y={26} className="g-sub">{t.phase} · {(t.model || "").split(":")[1] || t.role}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

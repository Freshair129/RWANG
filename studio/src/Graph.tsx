// Graph (feature--graph-editable) — wave-layered DAG; nodes=atoms, edges=deps.
// EDIT: drag a node's ◇ handle onto another node to add a dependency (target depends on source);
// click an edge to remove it. Persists via setDeps -> source atoms.gorch.json (acyclic-guarded, GKS-002).
import { useRef, useState } from "react";
import { useStore, cmd, type Task } from "./store";

const COL_W = 200, ROW_H = 58, PAD = 30, NODE_W = 170, NODE_H = 38;
const phaseColor = (p: string) => (p === "P0" ? "#64c7ff" : p === "P1" ? "#9be7ff" : p === "P2" ? "#7c8cff" : "#4a5d80");
const statusFill = (s: string) =>
  s === "done" ? "#11241c" : s === "failed" ? "#2a0f18" : (s === "running" || s === "claimed" || s === "reviewing") ? "#15294a" : "#0e1626";

export default function Graph() {
  const atoms = useStore((s) => s.atoms);
  const waves = useStore((s) => s.meta.waves) || [];
  const svgRef = useRef<SVGSVGElement>(null);
  const [wire, setWire] = useState<{ from: string; x: number; y: number } | null>(null);

  const pos: Record<string, { x: number; y: number }> = {};
  waves.forEach((w, wi) => w.forEach((id, ri) => { pos[id] = { x: PAD + wi * COL_W, y: PAD + ri * ROW_H }; }));
  const maxRows = Math.max(1, ...waves.map((w) => w.length));
  const W = PAD * 2 + Math.max(1, waves.length) * COL_W;
  const H = PAD * 2 + maxRows * ROW_H;

  const edges: { from: string; to: string; a: any; b: any }[] = [];
  for (const id in atoms) { const t = atoms[id]; if (!pos[id]) continue; for (const d of t.deps || []) if (pos[d]) edges.push({ from: d, to: id, a: pos[d], b: pos[id] }); }

  const svgXY = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const hit = (q: { x: number; y: number }) => {
    for (const id in pos) { const p = pos[id]; if (q.x >= p.x && q.x <= p.x + NODE_W && q.y >= p.y && q.y <= p.y + NODE_H) return id; }
    return null;
  };
  const startWire = (id: string, e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const p0 = svgXY(e); setWire({ from: id, x: p0.x, y: p0.y });
    const move = (ev: PointerEvent) => { const q = svgXY(ev); setWire((w) => (w ? { ...w, x: q.x, y: q.y } : null)); };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      const target = hit(svgXY(ev)); setWire(null);
      if (target && target !== id) { const t: Task = atoms[target]; cmd("setdeps", target, { deps: [...new Set([...(t.deps || []), id])] }); }
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const removeEdge = (from: string, to: string) => {
    if (!window.confirm(`Remove dependency:  ${to}  depends on  ${from} ?`)) return;
    const t: Task = atoms[to]; cmd("setdeps", to, { deps: (t.deps || []).filter((d) => d !== from) });
  };

  return (
    <div className="graph-wrap">
      <div className="graph-legend">drag a node's ◇ handle onto another to add a dependency · click an edge to remove · acyclic-guarded (GKS-002) · {edges.length} edges</div>
      <div className="graph-scroll">
        <svg ref={svgRef} width={W} height={H} className="graph-svg">
          {edges.map((e, i) => {
            const x1 = e.a.x + NODE_W, y1 = e.a.y + NODE_H / 2, x2 = e.b.x, y2 = e.b.y + NODE_H / 2, mx = (x1 + x2) / 2;
            const d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
            return (
              <g key={i} className="edge-g" onClick={() => removeEdge(e.from, e.to)}>
                <title>{e.to} depends on {e.from} — click to remove</title>
                <path d={d} className="edge-hit" />
                <path d={d} className="edge" />
              </g>
            );
          })}
          {wire && (() => { const p = pos[wire.from]; return <path d={`M${p.x + NODE_W},${p.y + NODE_H / 2} L${wire.x},${wire.y}`} className="wire" />; })()}
          {Object.entries(pos).map(([id, p]) => {
            const t: Task = atoms[id]; if (!t) return null;
            return (
              <g key={id} transform={`translate(${p.x},${p.y})`}>
                <rect width={NODE_W} height={NODE_H} rx={7} fill={statusFill(t.status)} stroke={phaseColor(t.phase)} strokeWidth={1.5} />
                <rect width={4} height={NODE_H} rx={2} fill={phaseColor(t.phase)} />
                <text x={12} y={16} className="g-id">{id}</text>
                <text x={12} y={29} className="g-sub">{t.phase} · {(t.model || "").split(":")[1] || t.role}</text>
                <circle cx={NODE_W} cy={NODE_H / 2} r={5.5} className="handle" onPointerDown={(e) => startWire(id, e)}>
                  <title>drag onto another node to add a dependency</title>
                </circle>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

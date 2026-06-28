// PipelineCanvas (feature--pipeline-canvas) — React Flow DAG builder.
// Nodes = atoms (wave-positioned), edges = depends_on. Draw an edge (handle→handle) to add a
// dependency (target depends on source); select an edge + Delete to remove. Persists via
// setDeps (acyclic-guarded, GKS-002). Pan/zoom/minimap from React Flow. Reuses the engine REST
// contract (cmd) + the wave layout (meta.waves) — supersedes the manual SVG Graph.
import { useMemo, useCallback } from "react";
import {
  ReactFlow, Background, Controls, MiniMap, Position,
  type Node, type Edge, type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useStore, cmd, type Task } from "./store";

const COL_W = 240, ROW_H = 76;
const phaseColor = (p: string) => (p === "P0" ? "#64c7ff" : p === "P1" ? "#9be7ff" : p === "P2" ? "#7c8cff" : "#4a5d80");
const statusBg = (s: string) =>
  s === "done" ? "#11241c" : s === "failed" ? "#2a0f18"
  : (s === "running" || s === "claimed" || s === "reviewing") ? "#15294a" : "#0e1626";

export default function PipelineCanvas() {
  const atoms = useStore((s) => s.atoms);
  const waves = useStore((s) => s.meta.waves) || [];

  const nodes = useMemo<Node[]>(() => {
    const out: Node[] = [];
    waves.forEach((w, wi) => w.forEach((id, ri) => {
      const t = atoms[id]; if (!t) return;
      out.push({
        id,
        position: { x: 40 + wi * COL_W, y: 40 + ri * ROW_H },
        data: { label: `${id}\n${t.phase} · ${(t.model || "").split(":")[1] || t.role}` },
        draggable: false,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        style: {
          width: 190, fontSize: 11, color: "#cfe6ff",
          background: statusBg(t.status), border: `1.5px solid ${phaseColor(t.phase)}`,
          borderRadius: 8, padding: 6, whiteSpace: "pre-line",
        },
      });
    }));
    return out;
  }, [atoms, waves]);

  const edges = useMemo<Edge[]>(() => {
    const out: Edge[] = [];
    for (const id in atoms) for (const d of atoms[id].deps || []) if (atoms[d]) {
      out.push({ id: `${d}->${id}`, source: d, target: id, style: { stroke: "#3a5478" } });
    }
    return out;
  }, [atoms]);

  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    const t: Task | undefined = atoms[c.target];
    cmd("setdeps", c.target, { deps: [...new Set([...(t?.deps || []), c.source])] });
  }, [atoms]);

  const onEdgesDelete = useCallback((eds: Edge[]) => {
    for (const e of eds) {
      const t: Task | undefined = atoms[e.target];
      if (t) cmd("setdeps", e.target, { deps: (t.deps || []).filter((d) => d !== e.source) });
    }
  }, [atoms]);

  return (
    <div className="canvas-wrap">
      <div className="graph-legend">
        React Flow · draw an edge (handle→handle) to add a dependency · select an edge + Delete to remove ·
        acyclic-guarded (GKS-002) · {edges.length} edges
      </div>
      <div style={{ height: "72vh", width: "100%" }}>
        <ReactFlow nodes={nodes} edges={edges} onConnect={onConnect} onEdgesDelete={onEdgesDelete} fitView nodesDraggable={false}>
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
    </div>
  );
}

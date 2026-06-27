import { useEffect, useState } from "react";
import Board from "./Board";
import Graph from "./Graph";
import Cockpit from "./Cockpit";
import Loadout from "./Loadout";
import { useStore, startPolling } from "./store";

const TABS: [string, string][] = [["board", "Board"], ["graph", "Graph"], ["cockpit", "Cockpit"], ["loadout", "Loadout"]];

export default function App() {
  const [tab, setTab] = useState("board");
  useEffect(() => { startPolling(1500); }, []);
  const p = useStore((s) => s.progress);
  const loading = useStore((s) => s.loading);
  const error = useStore((s) => s.error);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="logo">◈</span> G&#8209;Orchestra <span className="sub">Studio · v2</span></div>
        <nav className="tabs">
          {TABS.map(([k, label]) => (
            <button key={k} className={"tab" + (tab === k ? " active" : "")} onClick={() => setTab(k)}>{label}</button>
          ))}
        </nav>
        <div className="progress">
          <div className="bar"><div className="fill" style={{ width: `${p.pct}%` }} /></div>
          <span className="ptxt">{p.done}/{p.total} · {p.pct}%</span>
        </div>
        <div className="src">backlog: <code>gks/backlog.gorch.json</code></div>
      </header>

      {error ? (
        <div className="banner err">engine offline — start sidecar: <code>GORCH_BACKLOG=gks/backlog.gorch.json node server.mjs</code> ({error})</div>
      ) : null}

      {loading ? <div className="loading">loading snapshot…</div> : (
        <main className="surface">
          {tab === "board" && <Board />}
          {tab === "graph" && <Graph />}
          {tab === "cockpit" && <Cockpit />}
          {tab === "loadout" && <Loadout />}
        </main>
      )}
    </div>
  );
}

// Live Cockpit (feature--cockpit) — pool status + active agent tiles + usage gauges (vs tier cap).
import { useStore, type Task } from "./store";

const usd = (n: number) => "$" + (n || 0).toFixed(2);
const tok = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(n || 0));

function UsageCard({ label, u, cap }: { label: string; u: any; cap: number | null }) {
  u = u || {};
  const pct = cap ? Math.min(100, Math.round(((u.cost || 0) / cap) * 100)) : null;
  const models = Object.entries(u.byModel || {}) as [string, any][];
  return (
    <div className="ck-card">
      <div className="ck-card-h">{label}</div>
      <div className="ck-cost">{usd(u.cost)}{cap ? <span className="cap"> / {usd(cap)}</span> : <span className="cap nolim"> (no cap)</span>}</div>
      {pct != null && <div className="ck-bar"><div className={"ck-fill" + (pct >= 80 ? " warn" : "")} style={{ width: pct + "%" }} /></div>}
      <div className="ck-sub">{u.agents || 0} agents · in {tok(u.in)} · out {tok(u.out)} · cache {tok(u.cache)}</div>
      {models.length > 0 && (
        <div className="ck-models">
          {models.sort((a, b) => (b[1].cost || 0) - (a[1].cost || 0)).slice(0, 6).map(([m, v]) => (
            <div className="ck-model" key={m}><span className="m">{m}</span><span className="v">{v.agents}× · {usd(v.cost)}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Cockpit() {
  const order = useStore((s) => s.order);
  const atoms = useStore((s) => s.atoms);
  const meta = useStore((s) => s.meta);
  const pool = meta.pool || {};
  const usage = meta.usage || {};
  const lim = meta.usageLimits || {};
  const active: Task[] = order.map((id) => atoms[id]).filter((t) => ["claimed", "running", "reviewing"].includes(t.status));

  return (
    <div className="cockpit">
      <div className="ck-top">
        <div className={"ck-pool " + (pool.active ? "on" : "off")}>
          <div className="ck-card-h">Worker Pool · tier {lim.tier || "—"}</div>
          <div className="ck-pool-state">{pool.active ? "● RUNNING" : "○ idle"}</div>
          <div className="ck-sub">mode {pool.mode || "—"} · {pool.running || 0}/{pool.max || 0} slots{pool.stop ? " · stopping" : ""}</div>
          {(pool.capReason || lim.killSwitch) && <div className="ck-cap">⛔ {pool.capReason || "kill-switch on"}</div>}
        </div>
        <UsageCard label={`Session ≤${usage.sessionWindowH || 5}h`} u={usage.session} cap={lim.sessionUsd} />
        <UsageCard label={`Weekly ≤${usage.weekWindowD || 7}d`} u={usage.weekly} cap={lim.weeklyUsd} />
      </div>

      <div className="ck-tiles">
        <div className="ck-tiles-h">Active agents <span className="count">{active.length}</span></div>
        <div className="tiles">
          {active.length === 0 && <div className="empty">no agents running — pool idle. Dispatch from the Board to populate.</div>}
          {active.map((t) => (
            <div className={"tile s-" + t.status} key={t.id}>
              <div className="tile-h"><span className="dot" /> {t.status}</div>
              <div className="tile-id">{t.id}</div>
              <div className="tile-meta">{t.model?.split(":")[1] || t.model} · {t.role}{t.worker ? " · " + t.worker : ""}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

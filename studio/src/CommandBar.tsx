// Command bar (dispatch controls) — run/stop the pool, kill-switch, tier selector.
// Token-spending actions (run/auto) confirm first (NFR-O-004 / governance).
import { useStore, cmd } from "./store";

export default function CommandBar() {
  const pool: any = useStore((s) => s.meta.pool) || {};
  const lim: any = useStore((s) => s.meta.usageLimits) || {};
  const run = (mode: string) => {
    if (window.confirm(`Run pool in '${mode}' mode? This dispatches REAL agents and spends tokens.`)) cmd("run", "", { mode });
  };
  return (
    <div className="cmdbar">
      <button className="cb run" onClick={() => run("wave")} disabled={pool.active}>▶ Run wave</button>
      <button className="cb auto" onClick={() => run("auto")} disabled={pool.active}>⏩ Auto</button>
      <button className="cb stop" onClick={() => cmd("stop", "")} disabled={!pool.active}>■ Stop</button>
      <button className={"cb kill" + (lim.killSwitch ? " on" : "")} onClick={() => cmd("killswitch", "", { on: !lim.killSwitch })}>
        {lim.killSwitch ? "⛔ KILL-SWITCH ON" : "kill-switch"}
      </button>
      <label className="cb-tier">tier
        <select value={lim.tier || ""} onChange={(e) => cmd("settier", "", { tier: e.target.value })}>
          {(lim.tiers || []).map((t: string) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      {pool.capReason ? <span className="cb-cap">⛔ {pool.capReason}</span> : null}
      {pool.active ? <span className="cb-live">● pool live · {pool.running}/{pool.max}</span> : null}
    </div>
  );
}

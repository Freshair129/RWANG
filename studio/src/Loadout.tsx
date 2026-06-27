// Agent Loadout (feature--loadout) — the "inventory": per-role equipped gear (model chain + capability reqs)
// + the provider gear-pool. Read-only v1 (equipping/reordering writes config — a later increment).
import { useStore } from "./store";

const tierOf = (m: string) => (m ? m.split(":")[1] || m : m);

export default function Loadout() {
  const meta = useStore((s) => s.meta);
  const roles = meta.roles || {};
  const providers = meta.providers || [];

  return (
    <div className="loadout">
      <section className="lo-col">
        <div className="lo-h">Roles · equipped loadout</div>
        {Object.entries(roles).map(([name, r]: [string, any]) => (
          <div className="lo-role" key={name}>
            <div className="lo-role-h"><span className="rn">{name}</span><span className="req">{(r.requires || []).map((c: string) => <span className="cap" key={c}>{c}</span>)}</span></div>
            <div className="lo-desc">{r.description}</div>
            <div className="lo-slots">
              {(r.preferred || []).map((m: string, i: number) => (
                <div className={"slot" + (i === 0 ? " primary" : "")} key={m} title={m}>
                  <span className="slot-i">{i === 0 ? "★ hat" : "#" + (i + 1)}</span>
                  <span className="slot-m">{tierOf(m)}</span>
                  <span className="slot-p">{m.split(":")[0]}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="lo-col">
        <div className="lo-h">Providers · gear pool</div>
        {providers.map((p: any) => (
          <div className={"lo-prov" + (p.enabled ? " on" : " off")} key={p.name}>
            <div className="lo-prov-h"><span className="dot" /> <span className="pn">{p.name}</span><span className="tr">{p.transport}</span></div>
            <div className="caps">{(p.capabilities || []).map((c: string) => <span className="cap" key={c}>{c}</span>)}</div>
          </div>
        ))}
      </section>
    </div>
  );
}

// Development Progress — phase-grouped roadmap (overall % + per-phase bars + task cards w/ DoD).
// Modeled on the GoVibe roadmap board, in the G-Orchestra atom model.
import { useState } from "react";
import { useStore, type Task } from "./store";

const PHASES = [
  { key: "P0", label: "PHASE 0", theme: "Foundation" },
  { key: "P1", label: "PHASE 1", theme: "MVP Core" },
  { key: "P2", label: "PHASE 2", theme: "Knowledge & Graph" },
  { key: "P3", label: "PHASE 3", theme: "Productization" },
];
const isDone = (t: Task) => t.status === "done";
const isActive = (t: Task) => t.status === "claimed" || t.status === "running" || t.status === "reviewing";

export default function Progress() {
  const order = useStore((s) => s.order);
  const atoms = useStore((s) => s.atoms);
  const list = order.map((id) => atoms[id]);
  const total = list.length, done = list.filter(isDone).length;
  const running = list.filter(isActive).length;
  const ready = list.filter((t) => t.status === "todo" && t.ready).length;
  const byState = (st: string) => list.filter((t) => (t.state || "new") === st).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const [open, setOpen] = useState<Record<string, boolean>>({ P0: true, P1: true });

  return (
    <div className="prog">
      <div className="prog-head">
        <div>
          <div className="prog-title">Development Progress</div>
          <div className="prog-sub">G-Orchestra v2 build · {total} Genesis atoms · gks/backlog.gorch.json</div>
        </div>
        <div className="prog-pct">{pct}%</div>
      </div>
      <div className="prog-bar"><div className="prog-fill" style={{ width: pct + "%" }} /></div>

      <div className="prog-stats">
        <div className="pstat"><div className="n">{total}</div><div className="l">atoms</div></div>
        <div className="pstat ok"><div className="n">{done}</div><div className="l">done</div></div>
        <div className="pstat run"><div className="n">{running}</div><div className="l">running</div></div>
        <div className="pstat rdy"><div className="n">{ready}</div><div className="l">ready</div></div>
        <div className="pstat div"><div className="n">{byState("exists")}</div><div className="l">exists</div></div>
        <div className="pstat"><div className="n">{byState("extend")}</div><div className="l">extend</div></div>
        <div className="pstat"><div className="n">{byState("new")}</div><div className="l">new</div></div>
      </div>

      {PHASES.map((ph) => {
        const items = list.filter((t) => t.phase === ph.key);
        const d = items.filter(isDone).length;
        const p = items.length ? Math.round((d / items.length) * 100) : 0;
        const est = items.reduce((a, t) => a + (t.est || 0), 0);
        const isOpen = !!open[ph.key];
        return (
          <section className={"phase" + (isOpen ? " open" : "")} key={ph.key}>
            <header className="phase-h" onClick={() => setOpen((o) => ({ ...o, [ph.key]: !o[ph.key] }))}>
              <span className="phase-tag">{ph.label}</span>
              <span className="phase-name">{ph.theme}</span>
              <span className="phase-spacer" />
              <span className="phase-est">~{est} est</span>
              <span className="phase-pbar"><span className="pfill" style={{ width: p + "%" }} /></span>
              <span className="phase-pct">{p}%</span>
              <span className="phase-count">{d}/{items.length}</span>
              <span className="caret">{isOpen ? "▾" : "▸"}</span>
            </header>
            {isOpen && (
              <div className="phase-body">
                {items.map((t) => (
                  <article className={"pcard s-" + t.status} key={t.id}>
                    <div className="pcard-top">
                      <span className={"check" + (isDone(t) ? " on" : isActive(t) ? " run" : "")}>{isDone(t) ? "✓" : isActive(t) ? "◐" : "○"}</span>
                      <span className="pcard-id">{t.id}</span>
                      <span className={"st-badge st-" + (t.state || "new")}>{t.state || "new"}</span>
                      <span className="pcard-spacer" />
                      <span className={"status-pill ss-" + t.status}>{t.status}</span>
                    </div>
                    <div className="pcard-title">{(t.title || t.id).split(" — ")[0]}</div>
                    {t.accept ? <div className="pcard-dod"><span className="dod-l">DoD</span> {t.accept}</div> : null}
                    <div className="pcard-meta">
                      <span className="pill">{t.type}</span>
                      <span className="pill model">{(t.model || "").split(":")[1] || t.model || "—"}</span>
                      {t.moscow ? <span className={"pill mo mo-" + t.moscow}>{t.moscow}</span> : null}
                      <span className="pill">est {t.est || 0}</span>
                      {t.deps?.length ? <span className={"pill" + (t.depsDone ? " ok" : "")}>⛓ {t.deps.length}</span> : null}
                    </div>
                  </article>
                ))}
                {items.length === 0 && <div className="empty">no atoms in this phase</div>}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

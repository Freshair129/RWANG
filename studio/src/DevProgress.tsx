// DevProgress (Development Progress) — phase-grouped roadmap WHERE AGENTS CLAIM / ASSIGN /
// DISPATCH / RELEASE backlog tasks, with governance-gate confirm + expand-to-detail. Assign an
// agent/persona (config--persona-presets) via the dropdown OR by DRAGGING an agent chip onto a
// task card (ref③). Harvested UX from GoVibe Mission Control. Reuses useStore + cmd (store.ts).
// Engine /api/cmd: claim {worker} · assignowner {owner} · assign {model} · dispatch {worker} ·
// confirm/unconfirm · release · reset. Agents from GET /api/personas.
import { useState, useEffect } from "react";
import { useStore, cmd, type Task } from "./store";

const PHASES = [
  { key: "P0", label: "PHASE 0", theme: "Foundation" },
  { key: "P1", label: "PHASE 1", theme: "MVP Core" },
  { key: "P2", label: "PHASE 2", theme: "Knowledge & Graph" },
  { key: "P3", label: "PHASE 3", theme: "Productization" },
];

const ACTIVE = new Set(["claimed", "running", "reviewing"]);
const isDone = (t: Task) => t.status === "done";
const isActive = (t: Task) => ACTIVE.has(t.status);
const tier = (m?: string | null) => (m ? m.split(":")[1] || m : "—");

type Persona = { id: string; title?: string; role: string };
const ROLE_COLOR: Record<string, string> = { architect: "#64c7ff", coder: "#9be7ff", reviewer: "#31d0a0", worker: "#ffb86b", scout: "#b9a6ff" };
const initials = (s: string) => s.slice(0, 2).toUpperCase();
const ownerColor = (personas: Persona[], id?: string | null) => {
  const p = personas.find((x) => x.id === id);
  return (p && ROLE_COLOR[p.role]) || "#5f7191";
};

const DRAG_KEY = "text/persona";

export default function DevProgress() {
  const order = useStore((s) => s.order);
  const atoms = useStore((s) => s.atoms);
  const list = order.map((id) => atoms[id]).filter(Boolean) as Task[];

  const [personas, setPersonas] = useState<Persona[]>([]);
  useEffect(() => {
    fetch("/api/personas").then((r) => r.json()).then((p) => setPersonas(Array.isArray(p) ? p : [])).catch(() => {});
  }, []);

  const total = list.length;
  const done = list.filter(isDone).length;
  const running = list.filter(isActive).length;
  const ready = list.filter((t) => t.status === "todo" && t.ready).length;
  const gatedOpen = list.filter((t) => t.gated && !t.confirmed).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const [openPhase, setOpenPhase] = useState<Record<string, boolean>>({ P0: true, P1: true });
  const [openTask, setOpenTask] = useState<Record<string, boolean>>({});

  const assignOwner = (id: string, owner: string) => cmd("assignowner", id, { owner: owner || null });

  const exportBacklog = async () => {
    try {
      const snap = await (await fetch("/api/state")).json();
      const payload = { exportedAt: new Date().toISOString(), progress: snap.progress, counts: snap.counts, tasks: snap.tasks };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "gorch-backlog-" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".json";
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { window.alert("Export failed: " + (e as Error)?.message); }
  };

  const resetBoard = () => {
    if (window.confirm("Reset the board? Restores every atom to fresh state (todo, no worker, no owner).")) cmd("reset", "");
  };

  return (
    <div className="prog dev">
      <div className="prog-rmhead">
        <div className="rm-l">
          <div className="prog-title">Development Progress</div>
          <div className="prog-sub">G-Orchestra v2 build · {total} Genesis atoms · gks/backlog.gorch.json</div>
        </div>
        <div className="rm-chips">
          <div className="rm-chip"><div className="n">{total}</div><div className="l">atoms ทั้งหมด</div></div>
          <div className="rm-chip ok"><div className="n">{done}</div><div className="l">done / IMP แล้ว</div></div>
          <div className="rm-chip warn"><div className="n">{total - done}</div><div className="l">backlog เหลือ</div></div>
          {gatedOpen > 0 && <div className="rm-chip gate"><div className="n">{gatedOpen}</div><div className="l">gate รอ confirm</div></div>}
        </div>
        <div className="rm-actions">
          <button className="rm-btn" onClick={exportBacklog} title="download the live backlog snapshot as JSON">⤓ Export</button>
          <button className="rm-btn danger" onClick={resetBoard} title="restore every atom to fresh state">⟳ Reset Board</button>
        </div>
        <div className="prog-pct rm-pct">{pct}%</div>
      </div>

      <div className="prog-bar"><div className="prog-fill" style={{ width: pct + "%" }} /></div>

      {/* Agent palette — drag a chip onto any task card to assign it */}
      <div className="agent-palette">
        <span className="ap-label">Agents · ลากไปวางบน task เพื่อ assign</span>
        {personas.length === 0 && <span className="ap-empty">— no personas (start engine) —</span>}
        {personas.map((p) => (
          <div key={p.id} className="agent-chip" draggable
            onDragStart={(e) => { e.dataTransfer.setData(DRAG_KEY, p.id); e.dataTransfer.effectAllowed = "copy"; }}
            title={`${p.id} · ${p.role}${p.title ? " · " + p.title : ""}`}>
            <span className="avatar" style={{ background: ROLE_COLOR[p.role] || "#5f7191" }}>{initials(p.id)}</span>
            <span className="ap-id">{p.id}</span>
          </div>
        ))}
      </div>

      <div className="prog-stats">
        <div className="pstat"><div className="n">{total}</div><div className="l">total atoms</div></div>
        <div className="pstat ok"><div className="n">{done}</div><div className="l">done</div></div>
        <div className="pstat run"><div className="n">{running}</div><div className="l">active</div></div>
        <div className="pstat rdy"><div className="n">{ready}</div><div className="l">ready to claim</div></div>
        {gatedOpen > 0 && <div className="pstat gate"><div className="n">{gatedOpen}</div><div className="l">gated</div></div>}
      </div>

      {PHASES.map((phase) => {
        const items = list.filter((t) => t.phase === phase.key);
        const d = items.filter(isDone).length;
        const p = items.length ? Math.round((d / items.length) * 100) : 0;
        const est = items.reduce((a, t) => a + (t.est || 0), 0);
        const phaseOpen = !!openPhase[phase.key];
        return (
          <section className={"phase" + (phaseOpen ? " open" : "")} key={phase.key}>
            <header className="phase-h" onClick={() => setOpenPhase((o) => ({ ...o, [phase.key]: !o[phase.key] }))}>
              <span className="phase-tag">{phase.label}</span>
              <span className="phase-name">{phase.theme}</span>
              <span className="phase-spacer" />
              <span className="phase-est">~{est} est</span>
              <span className="phase-pbar"><span className="pfill" style={{ width: p + "%" }} /></span>
              <span className="phase-pct">{p}%</span>
              <span className="phase-count">{d}/{items.length}</span>
              <span className="caret">{phaseOpen ? "▾" : "▸"}</span>
            </header>
            {phaseOpen && (
              <div className="phase-body">
                {items.map((t) => (
                  <TaskRow key={t.id} t={t} atoms={atoms} personas={personas}
                    assignOwner={assignOwner}
                    expanded={!!openTask[t.id]} onToggle={() => setOpenTask((o) => ({ ...o, [t.id]: !o[t.id] }))} />
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

function TaskRow({ t, atoms, personas, assignOwner, expanded, onToggle }: {
  t: Task; atoms: Record<string, Task>; personas: Persona[];
  assignOwner: (id: string, owner: string) => void; expanded: boolean; onToggle: () => void;
}) {
  const [over, setOver] = useState(false);
  const blockedGate = !!t.gated && !t.confirmed;

  return (
    <article className={"pcard s-" + t.status + (over ? " drop-hover" : "")}
      onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_KEY)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
      onDragEnter={(e) => { if (e.dataTransfer.types.includes(DRAG_KEY)) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const pid = e.dataTransfer.getData(DRAG_KEY); if (pid) assignOwner(t.id, pid); }}>
      <div className="pcard-top">
        <span className={"check" + (isDone(t) ? " on" : isActive(t) ? " run" : "")}>{isDone(t) ? "✓" : isActive(t) ? "◐" : "○"}</span>
        <span className="pcard-id">{t.id}</span>
        <span className={"st-badge st-" + (t.state || "new")}>{t.state || "new"}</span>
        {t.gated ? <span className={"gate-pill" + (t.confirmed ? " ok" : "")}>{t.confirmed ? "confirmed" : "gated"}</span> : null}
        <span className="pcard-spacer" />
        {t.owner ? <span className="owner-av" style={{ background: ownerColor(personas, t.owner) }} title={"owner: " + t.owner}>{initials(t.owner)}</span> : null}
        <span className={"status-pill ss-" + t.status}>{t.status}</span>
      </div>
      <div className="pcard-title">{(t.title || t.id).split(" — ")[0]}</div>
      {t.accept ? <div className="pcard-dod"><span className="dod-l">DoD</span> {t.accept}</div> : null}
      <div className="pcard-meta">
        <span className="pill">{t.type}</span>
        <span className="pill model">{tier(t.model)}</span>
        {t.moscow ? <span className={"pill mo mo-" + t.moscow}>{t.moscow}</span> : null}
        <span className="pill">est {t.est || 0}</span>
        {t.deps?.length ? <span className={"pill deps" + (t.depsDone ? " ok" : "")}>⛓ {t.deps.length}</span> : null}
        {t.worker ? <span className="pill wk">@{t.worker}</span> : null}
      </div>

      <div className="pcard-ctl">
        <button className="ctl claim" disabled={!t.ready}
          title={t.ready ? "claim for worker 'studio'" : "not ready (status=" + t.status + ", depsDone=" + t.depsDone + ")"}
          onClick={() => cmd("claim", t.id, { worker: "studio" })}>{t.ready ? "claim" : "blocked"}</button>

        <select className="ctl assign-sel" value={t.owner ?? ""} title="assign an agent/persona (or drag a chip onto this card)"
          onChange={(e) => assignOwner(t.id, e.target.value)}>
          <option value="">— unassigned —</option>
          {personas.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.role}</option>)}
        </select>

        {t.gated && (
          <button className={"ctl gate-btn" + (t.confirmed ? " on" : "")}
            title={t.confirmed ? "un-confirm governance gate" : "confirm governance gate (required before dispatch)"}
            onClick={() => cmd(t.confirmed ? "unconfirm" : "confirm", t.id)}>{t.confirmed ? "✓ confirmed" : "⛔ confirm"}</button>
        )}

        <button className="ctl dispatch" disabled={!t.ready || blockedGate}
          title={blockedGate ? "blocked: confirm the governance gate first" : !t.ready ? "atom not ready" : "dispatch a REAL agent (spends tokens)"}
          onClick={() => { if (window.confirm("Dispatch a REAL agent for " + t.id + "? (spends tokens)")) cmd("dispatch", t.id, { worker: "studio" }); }}>▶ run</button>

        {isActive(t) && <button className="ctl release" title="release back to todo (clears worker + claim)" onClick={() => cmd("release", t.id)}>release</button>}

        <span className="ctl-spacer" />
        <button className={"ctl chev" + (expanded ? " open" : "")} aria-expanded={expanded}
          title={expanded ? "collapse detail" : "expand detail"} onClick={onToggle}>▸</button>
      </div>

      {expanded && <TaskDetail t={t} atoms={atoms} />}
    </article>
  );
}

function TaskDetail({ t, atoms }: { t: Task; atoms: Record<string, Task> }) {
  const cells: [string, string, string?][] = [
    ["State", t.state || "new", "st-" + (t.state || "new")],
    ["Status", t.status, "ss-" + t.status],
    ["Owner", t.owner || "—"],
    ["Role", t.role],
    ["Model", t.model || "—", "mono"],
    ["Override", t.modelOverride || "—", "mono"],
    ["Type", t.type],
    ["MoSCoW", t.moscow || "—"],
    ["Est", String(t.est ?? 0)],
    ["Attempts", String(t.attempts ?? 0)],
    ["Worker", t.worker || "—"],
    ["Gate", t.gated ? (t.confirmed ? "confirmed" : "needs-confirm") : "open", t.gated ? (t.confirmed ? "ok" : "block") : undefined],
  ];
  const log = [
    "[" + t.phase + "] " + t.id,
    "  status=" + t.status + " · ready=" + t.ready + " · depsDone=" + t.depsDone,
    "  owner=" + (t.owner || "—") + " · model=" + (t.model || "—") + (t.modelOverride ? " (override " + t.modelOverride + ")" : ""),
    ...(t.gated ? ["  gate=" + (t.confirmed ? "confirmed ✓" : "BLOCKING ⛔")] : []),
  ].join("\n");

  return (
    <div className="pcard-detail">
      <div className="dp-sec">
        <div className="dp-l">Dependencies</div>
        {t.deps?.length ? (
          <div className="dp-deps">
            {t.deps.map((d) => {
              const dep = atoms[d];
              return <span key={d} className={"dep-chip" + (dep?.status === "done" ? " ok" : " block")}><span className="dep-dot" /> {d}{dep ? " · " + dep.status : ""}</span>;
            })}
            <span className={"dep-badge" + (t.depsDone ? " ok" : "")}>{t.depsDone ? "Resolved" : "Blocking"}</span>
          </div>
        ) : <div className="dp-none">no dependencies — root atom</div>}
      </div>

      <div className="dp-sec">
        <div className="dp-grid">
          {cells.map(([k, v, cls]) => (
            <div className="dp-cell" key={k}><span className="dp-k">{k}</span><span className={"dp-v " + (cls || "")}>{v}</span></div>
          ))}
        </div>
      </div>

      <div className="dp-sec">
        <div className="dp-l">Definition of Done / Accept</div>
        <div className="dp-accept">{t.accept || "— no acceptance criteria recorded —"}</div>
      </div>

      <div className="dp-sec">
        <div className="dp-l">State log</div>
        <pre className="dp-log">{log}</pre>
      </div>
    </div>
  );
}

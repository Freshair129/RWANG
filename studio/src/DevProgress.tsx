// DevProgress (Development Progress) — phase-grouped roadmap WHERE AGENTS CLAIM / ASSIGN /
// DISPATCH / RELEASE backlog tasks. Assign a DACI agent/persona via the dropdown OR by DRAGGING
// an agent chip onto a card (ref③). Filter + group by owner, batch-assign a selection, and the
// DACI borrow guard disables claim/dispatch for review-only personas (RKOI/ATHER/GHOST = shared &).
// Reuses useStore + cmd. Engine /api/cmd: claim · assignowner · assign · dispatch · confirm · release · reset.
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

type Persona = { id: string; title?: string; role: string; borrow?: string };
const ROLE_COLOR: Record<string, string> = { architect: "#64c7ff", coder: "#9be7ff", reviewer: "#31d0a0", worker: "#ffb86b", scout: "#b9a6ff" };
const initials = (s: string) => s.slice(0, 2).toUpperCase();
const findP = (personas: Persona[], id?: string | null) => personas.find((x) => x.id === id);
const ownerColor = (personas: Persona[], id?: string | null) => { const p = findP(personas, id); return (p && ROLE_COLOR[p.role]) || "#5f7191"; };
const ownerBorrow = (personas: Persona[], id?: string | null) => findP(personas, id)?.borrow || null;

const DRAG_KEY = "text/persona";
const NONE = "__none__";

type Group = { key: string; label: string; sub: string };

export default function DevProgress() {
  const order = useStore((s) => s.order);
  const atoms = useStore((s) => s.atoms);
  const list = order.map((id) => atoms[id]).filter(Boolean) as Task[];

  const [personas, setPersonas] = useState<Persona[]>([]);
  useEffect(() => { fetch("/api/personas").then((r) => r.json()).then((p) => setPersonas(Array.isArray(p) ? p : [])).catch(() => {}); }, []);

  const [ownerFilter, setOwnerFilter] = useState("");        // "" = all · NONE = unassigned · personaId
  const [groupBy, setGroupBy] = useState<"phase" | "owner">("phase");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openG, setOpenG] = useState<Record<string, boolean>>({});
  const [openTask, setOpenTask] = useState<Record<string, boolean>>({});

  const total = list.length;
  const done = list.filter(isDone).length;
  const running = list.filter(isActive).length;
  const ready = list.filter((t) => t.status === "todo" && t.ready).length;
  const gatedOpen = list.filter((t) => t.gated && !t.confirmed).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const filtered = list.filter((t) => ownerFilter === "" ? true : ownerFilter === NONE ? !t.owner : t.owner === ownerFilter);

  // groups: by phase, or by owner (personas with tasks first, then unassigned)
  let groups: Group[];
  const itemsOf = (key: string) => groupBy === "phase" ? filtered.filter((t) => t.phase === key) : filtered.filter((t) => (t.owner || NONE) === key);
  if (groupBy === "phase") {
    groups = PHASES.map((p) => ({ key: p.key, label: p.label, sub: p.theme }));
  } else {
    const present = new Set(filtered.map((t) => t.owner || NONE));
    groups = personas.filter((p) => present.has(p.id)).map((p) => ({ key: p.id, label: p.id, sub: p.role + (p.borrow === "shared" ? " · review-only" : "") }));
    if (present.has(NONE)) groups.push({ key: NONE, label: "UNASSIGNED", sub: "no owner" });
  }

  const assignOwner = (id: string, owner: string) => cmd("assignowner", id, { owner: owner || null });
  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const batchAssign = (v: string) => { if (!v) return; const owner = v === NONE ? "" : v; for (const id of selected) cmd("assignowner", id, { owner: owner || null }); setSelected(new Set()); };

  const exportBacklog = async () => {
    try {
      const snap = await (await fetch("/api/state")).json();
      const payload = { exportedAt: new Date().toISOString(), progress: snap.progress, counts: snap.counts, tasks: snap.tasks };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "gorch-backlog-" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".json";
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { window.alert("Export failed: " + (e as Error)?.message); }
  };
  const resetBoard = () => { if (window.confirm("Reset the board? Restores every atom to fresh state.")) cmd("reset", ""); };

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
          <button className="rm-btn" onClick={exportBacklog} title="download the backlog snapshot as JSON">⤓ Export</button>
          <button className="rm-btn danger" onClick={resetBoard} title="restore every atom to fresh state">⟳ Reset Board</button>
        </div>
        <div className="prog-pct rm-pct">{pct}%</div>
      </div>

      <div className="prog-bar"><div className="prog-fill" style={{ width: pct + "%" }} /></div>

      <div className="agent-palette">
        <span className="ap-label">Agents · ลากไปวางบน task เพื่อ assign</span>
        {personas.length === 0 && <span className="ap-empty">— no personas (start engine) —</span>}
        {personas.map((p) => (
          <div key={p.id} className="agent-chip" draggable
            onDragStart={(e) => { e.dataTransfer.setData(DRAG_KEY, p.id); e.dataTransfer.effectAllowed = "copy"; }}
            title={`${p.id} · ${p.role}${p.borrow === "shared" ? " · review-only (&)" : ""}`}>
            <span className="avatar" style={{ background: ROLE_COLOR[p.role] || "#5f7191" }}>{initials(p.id)}</span>
            <span className="ap-id">{p.id}</span>
            {p.borrow === "shared" && <span className="ro-dot" title="review-only (shared &)">&amp;</span>}
          </div>
        ))}
      </div>

      <div className="dev-toolbar">
        <label className="tb-l">Owner</label>
        <select className="tb-sel" value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
          <option value="">all owners</option>
          <option value={NONE}>unassigned</option>
          {personas.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.role}</option>)}
        </select>
        <span className="tb-gap" />
        <label className="tb-l">Group</label>
        <div className="tb-toggle">
          <button className={groupBy === "phase" ? "on" : ""} onClick={() => setGroupBy("phase")}>Phase</button>
          <button className={groupBy === "owner" ? "on" : ""} onClick={() => setGroupBy("owner")}>Owner</button>
        </div>
        {selected.size > 0 && (
          <div className="batch-bar">
            <span className="bb-n">{selected.size} selected</span>
            <select className="tb-sel" defaultValue="" onChange={(e) => { batchAssign(e.target.value); e.currentTarget.value = ""; }}>
              <option value="">batch assign to…</option>
              <option value={NONE}>— unassign —</option>
              {personas.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.role}</option>)}
            </select>
            <button className="bb-clear" onClick={() => setSelected(new Set())}>clear</button>
          </div>
        )}
      </div>

      <div className="prog-stats">
        <div className="pstat"><div className="n">{total}</div><div className="l">total atoms</div></div>
        <div className="pstat ok"><div className="n">{done}</div><div className="l">done</div></div>
        <div className="pstat run"><div className="n">{running}</div><div className="l">active</div></div>
        <div className="pstat rdy"><div className="n">{ready}</div><div className="l">ready to claim</div></div>
        {gatedOpen > 0 && <div className="pstat gate"><div className="n">{gatedOpen}</div><div className="l">gated</div></div>}
      </div>

      {groups.map((g) => {
        const items = itemsOf(g.key);
        if (groupBy === "owner" && items.length === 0) return null;
        const d = items.filter(isDone).length;
        const p = items.length ? Math.round((d / items.length) * 100) : 0;
        const est = items.reduce((a, t) => a + (t.est || 0), 0);
        const gOpen = openG[g.key] ?? true;
        return (
          <section className={"phase" + (gOpen ? " open" : "")} key={g.key}>
            <header className="phase-h" onClick={() => setOpenG((o) => ({ ...o, [g.key]: !(o[g.key] ?? true) }))}>
              {groupBy === "owner" && g.key !== NONE
                ? <span className="phase-av" style={{ background: ownerColor(personas, g.key) }}>{initials(g.key)}</span>
                : <span className="phase-tag">{g.label}</span>}
              <span className="phase-name">{groupBy === "owner" ? g.label : g.sub}</span>
              {groupBy === "owner" && <span className="phase-sub">{g.sub}</span>}
              <span className="phase-spacer" />
              <span className="phase-est">~{est} est</span>
              <span className="phase-pbar"><span className="pfill" style={{ width: p + "%" }} /></span>
              <span className="phase-pct">{p}%</span>
              <span className="phase-count">{d}/{items.length}</span>
              <span className="caret">{gOpen ? "▾" : "▸"}</span>
            </header>
            {gOpen && (
              <div className="phase-body">
                {items.map((t) => (
                  <TaskRow key={t.id} t={t} atoms={atoms} personas={personas} assignOwner={assignOwner}
                    selected={selected.has(t.id)} onSelect={() => toggleSel(t.id)}
                    expanded={!!openTask[t.id]} onToggle={() => setOpenTask((o) => ({ ...o, [t.id]: !o[t.id] }))} />
                ))}
                {items.length === 0 && <div className="empty">no atoms</div>}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function TaskRow({ t, atoms, personas, assignOwner, selected, onSelect, expanded, onToggle }: {
  t: Task; atoms: Record<string, Task>; personas: Persona[];
  assignOwner: (id: string, owner: string) => void; selected: boolean; onSelect: () => void;
  expanded: boolean; onToggle: () => void;
}) {
  const [over, setOver] = useState(false);
  const reviewOnly = ownerBorrow(personas, t.owner) === "shared";
  const blockedGate = !!t.gated && !t.confirmed;

  return (
    <article className={"pcard s-" + t.status + (over ? " drop-hover" : "") + (selected ? " sel" : "")}
      onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_KEY)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
      onDragEnter={(e) => { if (e.dataTransfer.types.includes(DRAG_KEY)) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const pid = e.dataTransfer.getData(DRAG_KEY); if (pid) assignOwner(t.id, pid); }}>
      <div className="pcard-top">
        <input type="checkbox" className="pcard-sel" checked={selected} onChange={onSelect} title="select for batch assign" />
        <span className={"check" + (isDone(t) ? " on" : isActive(t) ? " run" : "")}>{isDone(t) ? "✓" : isActive(t) ? "◐" : "○"}</span>
        <span className="pcard-id">{t.id}</span>
        <span className={"st-badge st-" + (t.state || "new")}>{t.state || "new"}</span>
        {t.gated ? <span className={"gate-pill" + (t.confirmed ? " ok" : "")}>{t.confirmed ? "confirmed" : "gated"}</span> : null}
        <span className="pcard-spacer" />
        {t.owner ? <span className={"owner-av" + (reviewOnly ? " ro" : "")} style={{ background: ownerColor(personas, t.owner) }} title={"owner: " + t.owner + (reviewOnly ? " (review-only &)" : "")}>{initials(t.owner)}</span> : null}
        <span className={"status-pill ss-" + t.status}>{t.status}</span>
      </div>
      <div className="pcard-title">{(t.title || t.id).split(" — ")[0]}</div>
      {t.accept ? <div className="pcard-dod"><span className="dod-l">DoD</span> {t.accept}</div> : null}
      <div className="pcard-meta">
        <span className="pill">{t.type}</span>
        <span className="pill model">{tier(t.model)}</span>
        <span className={"pill perm perm-" + (t.perm || "safe")}>{t.perm === "full" ? "full" : "safe"}</span>
        {t.moscow ? <span className={"pill mo mo-" + t.moscow}>{t.moscow}</span> : null}
        <span className="pill">est {t.est || 0}</span>
        {t.deps?.length ? <span className={"pill deps" + (t.depsDone ? " ok" : "")}>⛓ {t.deps.length}</span> : null}
        {reviewOnly ? <span className="pill ro-pill">review-only &amp;</span> : null}
      </div>

      <div className="pcard-ctl">
        <button className="ctl claim" disabled={!t.ready || reviewOnly}
          title={reviewOnly ? "owner is review-only (DACI shared &) — cannot claim/&mut" : t.ready ? "claim for worker 'studio'" : "not ready"}
          onClick={() => cmd("claim", t.id, { worker: "studio" })}>{reviewOnly ? "review-only" : t.ready ? "claim" : "blocked"}</button>

        <select className="ctl assign-sel" value={t.owner ?? ""} title="assign an agent/persona (or drag a chip onto this card)"
          onChange={(e) => assignOwner(t.id, e.target.value)}>
          <option value="">— unassigned —</option>
          {personas.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.role}{p.borrow === "shared" ? " (&)" : ""}</option>)}
        </select>

        {t.gated && (
          <button className={"ctl gate-btn" + (t.confirmed ? " on" : "")}
            title={t.confirmed ? "un-confirm governance gate" : "confirm governance gate (required before dispatch)"}
            onClick={() => cmd(t.confirmed ? "unconfirm" : "confirm", t.id)}>{t.confirmed ? "✓ confirmed" : "⛔ confirm"}</button>
        )}

        <button className="ctl dispatch" disabled={!t.ready || blockedGate || reviewOnly}
          title={reviewOnly ? "owner is review-only (DACI) — cannot dispatch" : blockedGate ? "confirm the governance gate first" : !t.ready ? "atom not ready" : "dispatch a REAL agent (spends tokens)"}
          onClick={() => { if (window.confirm("Dispatch a REAL agent for " + t.id + "? (spends tokens)")) cmd("dispatch", t.id, { worker: "studio" }); }}>▶ run</button>

        {isActive(t) && <button className="ctl release" title="release back to todo" onClick={() => cmd("release", t.id)}>release</button>}

        <span className="ctl-spacer" />
        <button className={"ctl chev" + (expanded ? " open" : "")} aria-expanded={expanded}
          title={expanded ? "collapse detail" : "expand detail"} onClick={onToggle}>▸</button>
      </div>

      {expanded && <TaskDetail t={t} atoms={atoms} active={isActive(t)} />}
    </article>
  );
}

// LiveLog — streams the dispatched agent's real output (GET /api/log?id&offset, incremental).
function LiveLog({ id, active }: { id: string; active: boolean }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<string | null>(null);
  useEffect(() => {
    let offset = 0, stop = false;
    const poll = async () => {
      try {
        const d = await (await fetch(`/api/log?id=${encodeURIComponent(id)}&offset=${offset}`)).json();
        if (d.file) setFile(d.file);
        if (d.text) { setText((t) => (t + d.text).slice(-12000)); offset = d.offset ?? offset; }
        else if (d.size != null) offset = d.size;
      } catch { /* engine offline */ }
    };
    poll();
    const iv = setInterval(() => { if (!stop) poll(); }, active ? 1200 : 5000);
    return () => { stop = true; clearInterval(iv); };
  }, [id, active]);
  if (!file && !text) return <div className="dp-none">no agent log yet — dispatch (▶ run) to spawn a real agent</div>;
  return <pre className="dp-livelog">{text || "(waiting for agent output…)"}</pre>;
}

function TaskDetail({ t, atoms, active }: { t: Task; atoms: Record<string, Task>; active: boolean }) {
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
    ["Perm", t.perm === "full" ? "full (Bash ok)" : "safe (edits only)"],
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
      <div className="dp-sec">
        <div className="dp-l">Agent log {active ? <span className="live-dot">● live</span> : null}</div>
        <LiveLog id={t.id} active={active} />
      </div>
    </div>
  );
}

// Board surface (feature--board) — Jira/Trello/Linear columns over the AtomStore.
// Per Appendix-C B19: claimed/reviewing collapse into one "Running" column.
import { useStore, cmd, type Task } from "./store";

const COLS = [
  { key: "backlog", label: "Backlog" },
  { key: "ready", label: "Ready" },
  { key: "running", label: "Running" },
  { key: "rework", label: "Needs-rework" },
  { key: "done", label: "Done" },
  { key: "failed", label: "Failed" },
] as const;

function colOf(t: Task): string {
  if (t.status === "todo") return t.ready ? "ready" : "backlog";
  if (t.status === "claimed" || t.status === "running" || t.status === "reviewing") return "running";
  if (t.status === "needs-rework") return "rework";
  if (t.status === "done") return "done";
  if (t.status === "failed") return "failed";
  return "backlog";
}
const tier = (m: string) => (m ? m.split(":")[1] || m : "—");

export default function Board() {
  const order = useStore((s) => s.order);
  const atoms = useStore((s) => s.atoms);

  const byCol: Record<string, Task[]> = {};
  for (const id of order) { const t = atoms[id]; (byCol[colOf(t)] ||= []).push(t); }

  return (
    <div className="board">
      {COLS.map((c) => {
        const items = byCol[c.key] || [];
        return (
          <section className="col" key={c.key}>
            <header className="col-h"><span>{c.label}</span><span className="count">{items.length}</span></header>
            <div className="col-body">
              {items.map((t) => (
                <article className={"card ph-" + t.phase} key={t.id}>
                  <div className="card-top">
                    <span className="slug">{t.id}</span>
                    <span className={"badge ty-" + t.type}>{t.type}</span>
                  </div>
                  <div className="card-title">{(t.title || t.id).split(" — ")[0]}</div>
                  <div className="card-meta">
                    <span className="pill ph">{t.phase}</span>
                    <span className="pill model">{tier(t.model)}</span>
                    <span className="pill role">{t.role}</span>
                    {t.deps?.length ? <span className={"pill deps" + (t.depsDone ? " ok" : "")}>⛓ {t.deps.length}</span> : null}
                  </div>
                  {(c.key === "ready" || c.key === "backlog") && (
                    <button className="claim" disabled={!t.ready} onClick={() => cmd("claim", t.id, { worker: "studio" })}>
                      {t.ready ? "claim" : "blocked"}
                    </button>
                  )}
                </article>
              ))}
              {items.length === 0 && <div className="empty">—</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

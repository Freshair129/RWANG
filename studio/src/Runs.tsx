// Runs surface (A1-runs-view) — read-only Mission Control view over G:/Rwang/runs/*.
// List panel (GET /api/runs) + detail panel (GET /api/runs/:id) with a hash-chain audit badge.
// Self-contained: owns its own fetch/poll, independent of the AtomStore (which models the
// backlog, not orchestrator runs).
import { useEffect, useState } from "react";

type RunSummary = {
  runId: string;
  status: string | null;
  tasksPassed: number;
  tasksTotal: number;
  updatedAt: string | null;
  billedUsd: number;
};

type Attempt = { tier: string; model: string; result: string; verify_exit: number };
type RunTask = {
  id: string; description: string; tier: string; model: string; status: string;
  attempts: Attempt[]; cost_usd: number; tokens: { local: number; billed: number };
  verify_command: string; depends_on: string[]; updated_at: string;
};
type Phase = { name: string; status: string };
type Event = { ts: string; task: string; event: string; detail: string };
type ChainResult = {
  ok: boolean; events: number; hashed: number; chainTip: string | null;
  snapshotTip: string | null; errors: string[]; warnings: string[];
};
type RunDetail = {
  runId: string; spec: string; target_repo: string; autonomy: string; status: string;
  phases: Phase[]; tasks: RunTask[]; ledger: { local_tokens: number; billed_tokens: number; billed_usd: number };
  events: Event[]; chain: ChainResult;
};

const usd = (n: number) => "$" + (n || 0).toFixed(2);

function statusClass(status: string | null): string {
  const s = (status || "").toLowerCase();
  if (s === "done" || s === "pass" || s === "passed") return "ok";
  if (s === "failed" || s === "blocked") return "danger";
  if (s.startsWith("awaiting") || s.startsWith("phase_done")) return "warn";
  return "muted";
}

function StatusChip({ status }: { status: string | null }) {
  return <span className={"chip run-status " + statusClass(status)}>{status || "unknown"}</span>;
}

async function fetchRuns(): Promise<RunSummary[]> {
  const r = await fetch("/api/runs");
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

async function fetchRun(runId: string): Promise<RunDetail> {
  const r = await fetch("/api/runs/" + encodeURIComponent(runId));
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

function RunsList({ runs, selected, onSelect, error }: {
  runs: RunSummary[]; selected: string | null; onSelect: (id: string) => void; error: string | null;
}) {
  return (
    <div className="runs-list">
      <div className="runs-list-h">Runs <span className="count">{runs.length}</span></div>
      {error ? <div className="banner err">runs list unavailable ({error})</div> : null}
      <div className="runs-list-body">
        {runs.map((r) => (
          <button
            key={r.runId}
            className={"run-row" + (r.runId === selected ? " active" : "")}
            onClick={() => onSelect(r.runId)}
          >
            <div className="run-row-top">
              <span className="run-id">{r.runId}</span>
              <StatusChip status={r.status} />
            </div>
            <div className="run-row-meta">
              <span className="pill">{r.tasksPassed}/{r.tasksTotal} passed</span>
              <span className="pill">{usd(r.billedUsd)}</span>
              <span className="pill muted">{r.updatedAt || "—"}</span>
            </div>
          </button>
        ))}
        {runs.length === 0 && !error && <div className="empty">no runs yet</div>}
      </div>
    </div>
  );
}

function ChainBadge({ chain }: { chain: ChainResult | undefined }) {
  if (!chain) return null;
  if (chain.ok) {
    return <span className="chip audit ok">chain intact</span>;
  }
  const firstError = chain.errors?.[0] || "unknown chain error";
  return <span className="chip audit danger" title={firstError}>chain broken — {firstError}</span>;
}

function RunDetailPanel({ detail, error, loading }: { detail: RunDetail | null; error: string | null; loading: boolean }) {
  if (error) return <div className="banner err">run detail unavailable ({error})</div>;
  if (loading && !detail) return <div className="loading">loading run…</div>;
  if (!detail) return <div className="empty">select a run to inspect it</div>;

  return (
    <div className="run-detail">
      <div className="run-detail-h">
        <div className="run-detail-title">
          <span className="run-id big">{detail.runId}</span>
          <StatusChip status={detail.status} />
          <ChainBadge chain={detail.chain} />
        </div>
        <div className="run-detail-sub">
          <span>{detail.spec}</span>
          <span className="sep">·</span>
          <span>{detail.target_repo}</span>
          <span className="sep">·</span>
          <span>{detail.autonomy}</span>
          <span className="sep">·</span>
          <span>{usd(detail.ledger?.billed_usd)} billed</span>
        </div>
      </div>

      <section className="run-section">
        <h3>Phases</h3>
        <div className="run-phases">
          {(detail.phases || []).map((p) => (
            <span key={p.name} className={"pill phase-pill " + statusClass(p.status)}>{p.name}: {p.status}</span>
          ))}
          {(!detail.phases || detail.phases.length === 0) && <div className="empty">—</div>}
        </div>
      </section>

      <section className="run-section">
        <h3>Tasks</h3>
        <table className="run-table">
          <thead>
            <tr><th>id</th><th>tier</th><th>model</th><th>status</th><th>attempts</th><th>cost</th></tr>
          </thead>
          <tbody>
            {(detail.tasks || []).map((t) => (
              <tr key={t.id}>
                <td className="mono">{t.id}</td>
                <td>{t.tier}</td>
                <td className="mono">{t.model}</td>
                <td><span className={"chip small " + statusClass(t.status)}>{t.status}</span></td>
                <td>{t.attempts?.length || 0}</td>
                <td>{usd(t.cost_usd)}</td>
              </tr>
            ))}
            {(!detail.tasks || detail.tasks.length === 0) && (
              <tr><td colSpan={6} className="empty">—</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="run-section">
        <h3>Events (tail)</h3>
        <div className="run-events">
          {(detail.events || []).slice().reverse().map((e, i) => (
            <div className="run-event" key={i}>
              <span className="mono muted">{e.ts}</span>
              <span className="mono">{e.task}</span>
              <span className={"chip small " + statusClass(e.event)}>{e.event}</span>
              <span className="ev-detail">{e.detail}</span>
            </div>
          ))}
          {(!detail.events || detail.events.length === 0) && <div className="empty">—</div>}
        </div>
      </section>
    </div>
  );
}

export default function Runs() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadList = () => {
      fetchRuns()
        .then((r) => { if (!cancelled) { setRuns(r); setListError(null); } })
        .catch((e) => { if (!cancelled) setListError(String(e?.message || e)); });
    };
    loadList();
    const iv = setInterval(() => { if (!document.hidden) loadList(); }, 3000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    let cancelled = false;
    const loadDetail = () => {
      setDetailLoading(true);
      fetchRun(selected)
        .then((d) => { if (!cancelled) { setDetail(d); setDetailError(null); } })
        .catch((e) => { if (!cancelled) setDetailError(String(e?.message || e)); })
        .finally(() => { if (!cancelled) setDetailLoading(false); });
    };
    loadDetail();
    const iv = setInterval(() => { if (!document.hidden) loadDetail(); }, 3000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [selected]);

  return (
    <div className="runs-view">
      <RunsList runs={runs} selected={selected} onSelect={setSelected} error={listError} />
      <RunDetailPanel detail={detail} error={detailError} loading={detailLoading} />
    </div>
  );
}

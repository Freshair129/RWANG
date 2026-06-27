// MemoryOS (feature--memoryos) — reads the L0/L1 anti-error knowledge store (brain/failures.jsonl
// in file mode; GenesisDB graph+vector in genesisdb mode). The "render from DB" half of Node↔DB.
import { useEffect, useState } from "react";

export default function Memory() {
  const [data, setData] = useState<any>({ mode: "—", count: 0, rows: [] });
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/knowledge").then((r) => r.json()).then(setData).catch((e) => setErr(String(e?.message || e)));
  }, []);

  return (
    <div className="memory">
      <div className="mem-head">
        <div>
          <div className="mem-title">MemoryOS</div>
          <div className="mem-sub">anti-error knowledge · backend: <code>{data.mode}</code></div>
        </div>
        <div className="mem-count">{data.count}<span> outcomes</span></div>
      </div>
      <div className="mem-note">
        L0/L1 loop — failed / needs-rework outcomes are recorded here {data.mode === "genesisdb"
          ? "(GenesisDB graph+vector → per-agent semantic recall)"
          : "(flat-file brain/failures.jsonl → lexical recall)"} and injected as “❌ past mistakes” into future agent prompts.
      </div>
      {err ? <div className="banner err">knowledge endpoint: {err}</div> : null}
      <div className="mem-list">
        {(data.rows || []).map((r: any, i: number) => (
          <article className="mem-card" key={i}>
            <div className="mem-top">
              <span className={"sev sev-" + (r.severity || "na")}>{r.severity || "—"}</span>
              <span className="mem-task">{r.taskId || r.task || "?"}</span>
              <span className="mem-when">{r.at ? new Date(r.at).toISOString().slice(5, 16).replace("T", " ") : ""}</span>
            </div>
            <div className="mem-issue">{r.issue || r.detail || "(no detail)"}</div>
            {r.fix ? <div className="mem-fix">↳ {r.fix}</div> : null}
            <div className="mem-meta">
              {r.type ? <span className="pill">{r.type}</span> : null}
              {r.model ? <span className="pill model">{(r.model || "").split(":")[1] || r.model}</span> : null}
              {r.area ? <span className="pill">{r.area}</span> : null}
            </div>
          </article>
        ))}
        {(!data.rows || data.rows.length === 0) && <div className="empty">no recorded outcomes yet — this memory fills as agents hit (and fix) failures.</div>}
      </div>
    </div>
  );
}

// AtomStore — the normalized client store ("one object, six lenses", feature--atom-store).
// Every surface (Board/Cockpit/Graph/Loadout) reads the SAME atom row + meta from here.
import { useSyncExternalStore } from "react";

export type Task = {
  id: string; title: string; type: string; phase: string; role: string;
  model: string; status: string; deps: string[]; depsDone: boolean; ready: boolean;
  accept?: string; est?: number; worker?: string | null;
  state?: string; moscow?: string; rice?: any;
  // claim/assign/governance (DevProgress)
  gated?: boolean; confirmed?: boolean; modelOverride?: string | null;
  claimedAt?: number | null; attempts?: number; owner?: string | null;
};
export type Meta = {
  pool?: any; usage?: any; usageLimits?: any;
  providers?: any[]; roles?: Record<string, any>; modelOptions?: string[]; waves?: string[][];
};
type Snap = {
  atoms: Record<string, Task>;
  order: string[];
  progress: { pct: number; done: number; total: number };
  counts: Record<string, number>;
  meta: Meta;
  updatedAt?: number;
  loading: boolean;
  error: string | null;
};

let snap: Snap = { atoms: {}, order: [], progress: { pct: 0, done: 0, total: 0 }, counts: {}, meta: {}, loading: true, error: null };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function subscribe(f: () => void) { subs.add(f); return () => subs.delete(f); }
export function useStore<T>(sel: (s: Snap) => T): T {
  return useSyncExternalStore(subscribe, () => sel(snap), () => sel(snap));
}

export async function refresh() {
  try {
    const r = await fetch("/api/state");
    if (!r.ok) throw new Error("HTTP " + r.status);
    const s = await r.json();
    const atoms: Record<string, Task> = {};
    const order: string[] = [];
    for (const t of s.tasks || []) { atoms[t.id] = t; order.push(t.id); }
    const total = order.length;
    const done = s.counts?.done ?? 0;
    snap = {
      atoms, order,
      progress: { pct: total ? Math.round((done / total) * 100) : 0, done, total },
      counts: s.counts || {},
      meta: { pool: s.pool, usage: s.usage, usageLimits: s.usageLimits, providers: s.providers, roles: s.roles, modelOptions: s.modelOptions, waves: s.waves },
      updatedAt: s.updatedAt, loading: false, error: null,
    };
    emit();
  } catch (e: any) {
    snap = { ...snap, loading: false, error: String(e?.message || e) };
    emit();
  }
}

export async function cmd(action: string, id: string, extra: Record<string, any> = {}) {
  try {
    await fetch("/api/cmd", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, id, ...extra }) });
  } finally { refresh(); }
}

let started = false;
export function startPolling(ms = 1500) {
  if (started) return; started = true; refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, ms);
}

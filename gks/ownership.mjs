// gks/ownership.mjs — Ownership borrow-checker for atoms.
// Models Rust ownership semantics:
//   acquireExclusive  = &mut  (<=1 holder; MVCC: readers not blocked)
//   acquireShared     = &     (unlimited; never blocked by writer)
//   lease             = TTL-bound lifetime
//   move              = fencing-token transfer (stale holders rejected)
//
// Zero dependencies. Standalone unit-testable module — does NOT import engine.mjs.

const DEFAULT_EXCLUSIVE_TTL_MS = 30_000;  // 30 s
const DEFAULT_SHARED_TTL_MS    = 300_000; // 5 min

export class BorrowStore {
  // Map<atomId, { exclusive: Lease|null, readers: Map<holderId, Lease>, fenceCounter: number }>
  // Lease: { holder: string, fence: number, expiresAt: number|null }
  #store = new Map();
  #clock; // injectable: () => number (ms since epoch)

  constructor({ clock = () => Date.now() } = {}) {
    this.#clock = clock;
  }

  // ---- internal helpers ----

  #entry(atomId) {
    if (!this.#store.has(atomId)) {
      this.#store.set(atomId, { exclusive: null, readers: new Map(), fenceCounter: 0 });
    }
    return this.#store.get(atomId);
  }

  #tick(entry) { return ++entry.fenceCounter; }

  #expired(lease) {
    return lease.expiresAt !== null && this.#clock() > lease.expiresAt;
  }

  #expiresAt(ttlMs) {
    return ttlMs > 0 ? this.#clock() + ttlMs : null;
  }

  // ---- public API ----

  /**
   * Acquire exclusive ownership (&mut).
   * Fails if another non-expired exclusive holder exists.
   * Does NOT fail for shared readers (MVCC — readers snapshot last-stable).
   * @returns {{ ok: true, fence: number } | { ok: false, error: string }}
   */
  acquireExclusive(atomId, holderId, ttlMs = DEFAULT_EXCLUSIVE_TTL_MS) {
    if (!atomId || !holderId) return { ok: false, error: "atomId and holderId required" };
    const e = this.#entry(atomId);

    if (e.exclusive) {
      if (this.#expired(e.exclusive)) {
        e.exclusive = null; // evict stale
      } else if (e.exclusive.holder === holderId) {
        return { ok: false, error: `already holds exclusive: ${holderId} on ${atomId}` };
      } else {
        return { ok: false, error: `conflict: ${e.exclusive.holder} holds exclusive on ${atomId}` };
      }
    }

    const fence = this.#tick(e);
    e.exclusive = { holder: holderId, fence, expiresAt: this.#expiresAt(ttlMs) };
    return { ok: true, fence };
  }

  /**
   * Acquire shared read borrow (&).
   * Always succeeds — unlimited readers, never blocked by the writer (MVCC).
   * @returns {{ ok: true, fence: number } | { ok: false, error: string }}
   */
  acquireShared(atomId, readerId, ttlMs = DEFAULT_SHARED_TTL_MS) {
    if (!atomId || !readerId) return { ok: false, error: "atomId and readerId required" };
    const e = this.#entry(atomId);

    const existing = e.readers.get(readerId);
    if (existing && !this.#expired(existing)) {
      return { ok: false, error: `already holds shared borrow: ${readerId} on ${atomId}` };
    }

    const fence = this.#tick(e);
    e.readers.set(readerId, { holder: readerId, fence, expiresAt: this.#expiresAt(ttlMs) });
    return { ok: true, fence };
  }

  /**
   * Release a borrow (exclusive or shared). fence must match exactly.
   * Stale/wrong fence → rejected.
   * @returns {{ ok: true } | { ok: false, error: string }}
   */
  release(atomId, holderId, fence) {
    if (!atomId || !holderId) return { ok: false, error: "atomId and holderId required" };
    const e = this.#store.get(atomId);
    if (!e) return { ok: false, error: `no borrows registered on ${atomId}` };

    if (e.exclusive && e.exclusive.holder === holderId) {
      if (e.exclusive.fence !== fence) {
        return { ok: false, error: `stale fence: expected ${e.exclusive.fence}, got ${fence}` };
      }
      e.exclusive = null;
      return { ok: true };
    }

    const reader = e.readers.get(holderId);
    if (reader) {
      if (reader.fence !== fence) {
        return { ok: false, error: `stale fence: expected ${reader.fence}, got ${fence}` };
      }
      e.readers.delete(holderId);
      return { ok: true };
    }

    return { ok: false, error: `${holderId} does not hold a borrow on ${atomId}` };
  }

  /**
   * Move exclusive ownership to another holder (fencing-token transfer).
   * fromFence must match; a new fence is issued so the old token is immediately stale.
   * @returns {{ ok: true, fence: number } | { ok: false, error: string }}
   */
  move(atomId, fromHolder, fromFence, toHolder, ttlMs = DEFAULT_EXCLUSIVE_TTL_MS) {
    if (!atomId || !fromHolder || !toHolder) {
      return { ok: false, error: "atomId, fromHolder, and toHolder required" };
    }
    const e = this.#store.get(atomId);
    if (!e || !e.exclusive) {
      return { ok: false, error: `${fromHolder} does not hold exclusive on ${atomId}` };
    }

    if (this.#expired(e.exclusive)) {
      e.exclusive = null;
      return { ok: false, error: `lease expired for ${fromHolder} on ${atomId}` };
    }
    if (e.exclusive.holder !== fromHolder) {
      return { ok: false, error: `${fromHolder} does not hold exclusive on ${atomId}` };
    }
    if (e.exclusive.fence !== fromFence) {
      return { ok: false, error: `stale fence: expected ${e.exclusive.fence}, got ${fromFence}` };
    }

    const fence = this.#tick(e);
    e.exclusive = { holder: toHolder, fence, expiresAt: this.#expiresAt(ttlMs) };
    return { ok: true, fence };
  }

  /**
   * Evict all expired leases. Returns count of evicted records.
   */
  expireLeases() {
    let count = 0;
    for (const e of this.#store.values()) {
      if (e.exclusive && this.#expired(e.exclusive)) { e.exclusive = null; count++; }
      for (const [id, r] of e.readers) {
        if (this.#expired(r)) { e.readers.delete(id); count++; }
      }
    }
    return count;
  }

  /**
   * Inspect the current borrow state for an atom (does not evict).
   * @returns {{ exclusive: object|null, readers: object[] }}
   */
  inspect(atomId) {
    const e = this.#store.get(atomId);
    if (!e) return { exclusive: null, readers: [] };
    const now = this.#clock();
    const stamp = (lease) => ({
      holder: lease.holder,
      fence: lease.fence,
      expiresAt: lease.expiresAt,
      expired: lease.expiresAt !== null && now > lease.expiresAt,
    });
    return {
      exclusive: e.exclusive ? stamp(e.exclusive) : null,
      readers: [...e.readers.values()].map(stamp),
    };
  }

  /** Clear all state (test helper). */
  clear() { this.#store.clear(); }
}

// Default singleton for convenience
export const store = new BorrowStore();

// gks/ownership.test.mjs — unit tests for the ownership borrow-checker.
// Run: node --test orchestration/gks/ownership.test.mjs
// Requires Node >= 18 (node:test built-in).

import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { BorrowStore } from "./ownership.mjs";

// Controllable monotonic clock for lease-expiry tests
function fakeClock(start = 1_000_000) {
  let t = start;
  const fn = () => t;
  fn.advance = (ms) => { t += ms; };
  return fn;
}

// ---- Exclusive (claim = &mut) ----------------------------------------

describe("acquireExclusive", () => {
  test("unclaimed atom → granted", () => {
    const s = new BorrowStore();
    const r = s.acquireExclusive("atom:A", "agent-1");
    assert.equal(r.ok, true);
    assert.equal(typeof r.fence, "number");
  });

  test("two agents cannot exclusive-borrow the same atom (conflict rejected)", () => {
    const s = new BorrowStore();
    s.acquireExclusive("atom:A", "agent-1");
    const r = s.acquireExclusive("atom:A", "agent-2");
    assert.equal(r.ok, false);
    assert.match(r.error, /conflict/);
  });

  test("same agent double-claim is rejected", () => {
    const s = new BorrowStore();
    s.acquireExclusive("atom:A", "agent-1");
    const r = s.acquireExclusive("atom:A", "agent-1");
    assert.equal(r.ok, false);
  });

  test("exclusive on atom:A does not affect atom:B", () => {
    const s = new BorrowStore();
    s.acquireExclusive("atom:A", "agent-1");
    const r = s.acquireExclusive("atom:B", "agent-1");
    assert.equal(r.ok, true);
  });

  test("granted after holder releases", () => {
    const s = new BorrowStore();
    const { fence } = s.acquireExclusive("atom:A", "agent-1");
    s.release("atom:A", "agent-1", fence);
    const r = s.acquireExclusive("atom:A", "agent-2");
    assert.equal(r.ok, true);
  });
});

// ---- Shared (context read = &) ----------------------------------------

describe("acquireShared", () => {
  test("unlimited readers succeed simultaneously", () => {
    const s = new BorrowStore();
    for (let i = 0; i < 200; i++) {
      const r = s.acquireShared("atom:A", `reader-${i}`);
      assert.equal(r.ok, true, `reader-${i} blocked`);
    }
    assert.equal(s.inspect("atom:A").readers.length, 200);
  });

  test("readers never block the writer (MVCC — writer acquires while readers exist)", () => {
    const s = new BorrowStore();
    s.acquireShared("atom:A", "reader-1");
    s.acquireShared("atom:A", "reader-2");
    const r = s.acquireExclusive("atom:A", "writer-1");
    assert.equal(r.ok, true, "writer must not be blocked by readers");
  });

  test("writer does not block new readers", () => {
    const s = new BorrowStore();
    s.acquireExclusive("atom:A", "writer-1");
    assert.equal(s.acquireShared("atom:A", "reader-1").ok, true);
    assert.equal(s.acquireShared("atom:A", "reader-2").ok, true);
  });

  test("duplicate shared borrow by same reader is rejected", () => {
    const s = new BorrowStore();
    s.acquireShared("atom:A", "reader-1");
    const r = s.acquireShared("atom:A", "reader-1");
    assert.equal(r.ok, false);
  });
});

// ---- Release + stale-fence rejection ----------------------------------

describe("release", () => {
  test("correct fence → success, atom freed", () => {
    const s = new BorrowStore();
    const { fence } = s.acquireExclusive("atom:A", "agent-1");
    assert.equal(s.release("atom:A", "agent-1", fence).ok, true);
    assert.equal(s.inspect("atom:A").exclusive, null);
  });

  test("wrong fence on exclusive → stale-fence rejected", () => {
    const s = new BorrowStore();
    s.acquireExclusive("atom:A", "agent-1");
    const r = s.release("atom:A", "agent-1", 9999);
    assert.equal(r.ok, false);
    assert.match(r.error, /stale fence/);
  });

  test("wrong fence on shared borrow → stale-fence rejected", () => {
    const s = new BorrowStore();
    s.acquireShared("atom:A", "reader-1");
    const r = s.release("atom:A", "reader-1", 9999);
    assert.equal(r.ok, false);
    assert.match(r.error, /stale fence/);
  });

  test("non-holder release → rejected", () => {
    const s = new BorrowStore();
    s.acquireExclusive("atom:A", "agent-1");
    const r = s.release("atom:A", "agent-999", 1);
    assert.equal(r.ok, false);
  });

  test("correct shared fence → reader removed, others intact", () => {
    const s = new BorrowStore();
    const { fence: f1 } = s.acquireShared("atom:A", "reader-1");
    s.acquireShared("atom:A", "reader-2");
    assert.equal(s.release("atom:A", "reader-1", f1).ok, true);
    const { readers } = s.inspect("atom:A");
    assert.equal(readers.length, 1);
    assert.equal(readers[0].holder, "reader-2");
  });
});

// ---- Lease expiry -------------------------------------------------------

describe("lease expiry", () => {
  test("expired exclusive is evicted on next acquireExclusive", () => {
    const clock = fakeClock();
    const s = new BorrowStore({ clock });
    s.acquireExclusive("atom:A", "agent-1", 1000);
    clock.advance(1001);
    const r = s.acquireExclusive("atom:A", "agent-2");
    assert.equal(r.ok, true, "agent-2 should acquire after expiry");
  });

  test("expireLeases() evicts expired records and returns count", () => {
    const clock = fakeClock();
    const s = new BorrowStore({ clock });
    s.acquireExclusive("atom:A", "agent-1", 500);   // expires first
    s.acquireShared("atom:A", "reader-1", 500);      // expires first
    s.acquireShared("atom:A", "reader-2", 2000);     // survives
    clock.advance(600);
    assert.equal(s.expireLeases(), 2);
    const st = s.inspect("atom:A");
    assert.equal(st.exclusive, null);
    assert.equal(st.readers.length, 1);
    assert.equal(st.readers[0].holder, "reader-2");
  });

  test("expired holder cannot release after eviction (stale-fence / no-holder)", () => {
    const clock = fakeClock();
    const s = new BorrowStore({ clock });
    const { fence } = s.acquireExclusive("atom:A", "agent-1", 500);
    clock.advance(600);
    s.expireLeases();
    const r = s.release("atom:A", "agent-1", fence);
    assert.equal(r.ok, false);
  });

  test("zero ttlMs = no expiry (infinite lease)", () => {
    const clock = fakeClock();
    const s = new BorrowStore({ clock });
    s.acquireExclusive("atom:A", "agent-1", 0); // infinite
    clock.advance(99_999_999);
    assert.equal(s.expireLeases(), 0);
    assert.notEqual(s.inspect("atom:A").exclusive, null);
  });
});

// ---- Move (fencing token transfer) ------------------------------------

describe("move", () => {
  test("valid fence → ownership transferred, new fence issued", () => {
    const s = new BorrowStore();
    const { fence: f1 } = s.acquireExclusive("atom:A", "agent-1");
    const r = s.move("atom:A", "agent-1", f1, "agent-2");
    assert.equal(r.ok, true);
    assert.ok(r.fence > f1, "new fence must be higher");
    assert.equal(s.inspect("atom:A").exclusive?.holder, "agent-2");
  });

  test("stale fence on move → rejected", () => {
    const s = new BorrowStore();
    s.acquireExclusive("atom:A", "agent-1");
    const r = s.move("atom:A", "agent-1", 9999, "agent-2");
    assert.equal(r.ok, false);
    assert.match(r.error, /stale fence/);
  });

  test("original holder's old fence is invalid after move", () => {
    const s = new BorrowStore();
    const { fence: f1 } = s.acquireExclusive("atom:A", "agent-1");
    const { fence: f2 } = s.move("atom:A", "agent-1", f1, "agent-2");
    // agent-1 tries to release with old fence — must fail
    assert.equal(s.release("atom:A", "agent-1", f1).ok, false);
    // agent-2 releases with new fence — must succeed
    assert.equal(s.release("atom:A", "agent-2", f2).ok, true);
  });

  test("move from non-holder → rejected", () => {
    const s = new BorrowStore();
    s.acquireExclusive("atom:A", "agent-1");
    const r = s.move("atom:A", "agent-999", 1, "agent-2");
    assert.equal(r.ok, false);
  });

  test("move on expired lease → rejected, lease cleared", () => {
    const clock = fakeClock();
    const s = new BorrowStore({ clock });
    const { fence } = s.acquireExclusive("atom:A", "agent-1", 500);
    clock.advance(600);
    const r = s.move("atom:A", "agent-1", fence, "agent-2");
    assert.equal(r.ok, false);
    assert.match(r.error, /expired/);
    assert.equal(s.inspect("atom:A").exclusive, null);
  });
});

// ---- Singleton export --------------------------------------------------

describe("default singleton", () => {
  test("store export is a BorrowStore", async () => {
    const { store } = await import("./ownership.mjs");
    assert.ok(store instanceof BorrowStore);
    store.clear();
  });
});

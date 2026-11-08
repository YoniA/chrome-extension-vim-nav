'use strict';

// Deterministic replacement for setTimeout/clearTimeout inside the vm sandbox.
function createFakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map(); // id -> { fn, at }
  const cleared = [];

  const clock = {
    get now() {
      return now;
    },
    setTimeout(fn, ms = 0) {
      const id = nextId++;
      timers.set(id, { fn, at: now + ms, ms });
      return id;
    },
    clearTimeout(id) {
      cleared.push(id);
      timers.delete(id);
    },
    pendingCount() {
      return timers.size;
    },
    cleared,
    // Advance time, firing due timers in order.
    advance(ms) {
      const target = now + ms;
      for (;;) {
        let dueId = null;
        let due = null;
        for (const [id, t] of timers) {
          if (t.at <= target && (due === null || t.at < due.at)) {
            dueId = id;
            due = t;
          }
        }
        if (due === null) break;
        timers.delete(dueId);
        now = due.at;
        due.fn();
      }
      now = target;
    },
  };
  return clock;
}

module.exports = { createFakeClock };

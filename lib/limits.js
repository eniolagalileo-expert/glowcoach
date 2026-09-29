// A simple spending guard so a public demo can't drain the account's units.
// Per-visitor and global daily budgets, kept in memory. On serverless hosts
// memory is per instance, so this is a soft guard layered on top of the
// app's clearly labeled sample mode, not a billing system.

export function createBudget({ perVisitor = 80, global = 400, now = () => Date.now() } = {}) {
  let day = dayOf(now());
  let spentGlobal = 0;
  const spentBy = new Map();

  function dayOf(t) {
    return new Date(t).toISOString().slice(0, 10);
  }

  function roll() {
    const today = dayOf(now());
    if (today !== day) {
      day = today;
      spentGlobal = 0;
      spentBy.clear();
    }
  }

  // Reserve `units` for `visitor`; returns false if it would go over budget.
  function take(visitor, units) {
    roll();
    const mine = spentBy.get(visitor) ?? 0;
    if (mine + units > perVisitor || spentGlobal + units > global) return false;
    spentBy.set(visitor, mine + units);
    spentGlobal += units;
    return true;
  }

  // Give units back when a task fails to start (YouCam doesn't charge then).
  function refund(visitor, units) {
    roll();
    spentBy.set(visitor, Math.max(0, (spentBy.get(visitor) ?? 0) - units));
    spentGlobal = Math.max(0, spentGlobal - units);
  }

  return { take, refund };
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, parse, load, save, addScan, realScans, addToBag, setQty, bagTotal, progress } from '../public/js/store.js';

function memory() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}
const scores = (acne, pore) => [{ concern: 'acne', score: acne, mask: 'https://x' }, { concern: 'pore', score: pore }];

test('scans keep scores only, and survive saving', () => {
  const storage = memory();
  let state = addScan(emptyState(), scores(40, 60), { at: 1 });
  assert.deepEqual(state.scans[0], { at: 1, scores: [{ concern: 'acne', score: 40 }, { concern: 'pore', score: 60 }], sample: false });
  save(state, storage);
  assert.deepEqual(load(storage), state);
});

test('sample scans are excluded from progress', () => {
  let state = addScan(emptyState(), scores(40, 60), { at: 1, sample: true });
  state = addScan(state, scores(45, 62), { at: 2 });
  assert.equal(realScans(state).length, 1);
  assert.equal(progress(state), null);
  state = addScan(state, scores(55, 61), { at: 3 });
  assert.deepEqual(progress(state), [{ concern: 'acne', from: 45, to: 55, change: 10 }, { concern: 'pore', from: 62, to: 61, change: -1 }]);
});

test('bag adds once, changes quantity, removes at zero, and totals', () => {
  let state = addToBag(emptyState(), ['a', 'b', 'a']);
  assert.deepEqual(state.bag, [{ id: 'a', qty: 1 }, { id: 'b', qty: 1 }]);
  state = setQty(state, 'a', 3);
  assert.equal(bagTotal(state, (id) => ({ a: 10, b: 5 })[id]), 35);
  state = setQty(state, 'b', 0);
  assert.deepEqual(state.bag, [{ id: 'a', qty: 3 }]);
});

test('bad saved data is ignored', () => {
  assert.deepEqual(parse('{nope'), emptyState());
  assert.deepEqual(parse('{"scans":[{"at":"x"}],"bag":[{"id":"a","qty":0}]}'), emptyState());
  assert.deepEqual(load({ getItem() { throw new Error('blocked'); } }), emptyState());
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  glowScore, scoreBand, skinType, priorities, buildRoutine, colorDistance, undertone,
  matchFoundation, buildLooks, simulationTargets, CONCERN_LABELS,
} from '../public/js/coach.js';
import { SKINCARE, FOUNDATION, ALL_PRODUCTS, productById } from '../public/js/catalog.js';
import { buildTaskBody, SKIN_CONCERNS, SIMULATION_KEYS } from '../lib/tasks.js';

const oilyAcne = [
  { concern: 'acne', score: 38 }, { concern: 'pore', score: 52 }, { concern: 'oiliness', score: 41 },
  { concern: 'texture', score: 66 }, { concern: 'redness', score: 70 }, { concern: 'moisture', score: 72 },
  { concern: 'wrinkle', score: 88 }, { concern: 'dark_circle_v2', score: 75 },
];
const dryAging = [
  { concern: 'acne', score: 90 }, { concern: 'pore', score: 80 }, { concern: 'oiliness', score: 85 },
  { concern: 'texture', score: 62 }, { concern: 'redness', score: 70 }, { concern: 'moisture', score: 35 },
  { concern: 'wrinkle', score: 44 }, { concern: 'dark_circle_v2', score: 58 },
];

test('every skin-analysis concern has a friendly label', () => {
  for (const c of SKIN_CONCERNS) assert.ok(CONCERN_LABELS[c], c);
});

test('glow score and bands', () => {
  assert.equal(glowScore(oilyAcne), 63);
  assert.equal(glowScore([]), null);
  assert.deepEqual([85, 65, 45, 20].map(scoreBand), ['great', 'good', 'fair', 'focus']);
});

test('skin type comes from oil and hydration scores', () => {
  assert.equal(skinType(oilyAcne), 'oily');
  assert.equal(skinType(dryAging), 'dry');
  assert.equal(skinType([{ concern: 'oiliness', score: 40 }, { concern: 'moisture', score: 40 }]), 'combination');
  assert.equal(skinType([]), 'normal');
});

test('priorities are the lowest scores, nudged by goals', () => {
  assert.deepEqual(priorities(oilyAcne).map((p) => p.concern), ['acne', 'oiliness', 'pore']);
  assert.deepEqual(priorities(oilyAcne, ['youthful']).map((p) => p.concern), ['acne', 'oiliness', 'pore']);
  assert.deepEqual(priorities(dryAging).map((p) => p.concern), ['moisture', 'wrinkle', 'dark_circle_v2']);
  assert.deepEqual(priorities(dryAging, ['bright']).map((p) => p.concern), ['moisture', 'dark_circle_v2', 'wrinkle']);
});

test('an oily, breakout-prone routine targets acne and oil with suitable products', () => {
  const r = buildRoutine(oilyAcne, { budget: 1 });
  assert.equal(r.type, 'oily');
  assert.deepEqual(r.am.map((p) => p.step), ['cleanser', 'treatment', 'moisturizer', 'spf']);
  assert.deepEqual(r.pm.map((p) => p.step), ['cleanser', 'treatment', 'moisturizer']);
  assert.ok(r.products.every((p) => p.types.includes('oily')), 'all suit oily skin');
  assert.equal(r.am[0].id, 'cl-gel');
  assert.ok(r.am[0].why.includes('breakouts'));
  assert.equal(r.total, r.products.reduce((a, p) => a + p.price, 0));
  assert.equal(new Set(r.products.map((p) => p.id)).size, r.products.length);
});

test('a dry, lines-focused routine hydrates and adds an eye step when needed', () => {
  const r = buildRoutine(dryAging, { goals: ['bright'], budget: 3 });
  assert.equal(r.type, 'dry');
  assert.ok(r.products.some((p) => p.step === 'eye'));
  assert.ok(r.products.every((p) => p.types.includes('dry')));
  assert.ok(r.pm.some((p) => p.concerns.includes('wrinkle')));
});

test('budget steers product tiers', () => {
  const cheap = buildRoutine(dryAging, { budget: 1 });
  const lux = buildRoutine(dryAging, { budget: 3 });
  assert.ok(cheap.total < lux.total, `${cheap.total} < ${lux.total}`);
  assert.ok(cheap.products.every((p) => p.tier <= 2));
});

test('color distance and undertone', () => {
  assert.equal(colorDistance('#aabbcc', '#aabbcc'), 0);
  assert.ok(colorDistance('#000000', '#ffffff') > 90);
  assert.equal(undertone('#E2BC94'), 'warm');
  assert.equal(undertone('#F3D9C9'), 'cool');
});

test('foundation matching picks the nearest shade', () => {
  for (const shade of FOUNDATION) assert.equal(matchFoundation(shade.hex).id, shade.id);
  const best = matchFoundation('#b9947c');
  for (const shade of FOUNDATION) assert.ok(colorDistance('#b9947c', best.hex) <= colorDistance('#b9947c', shade.hex));
});

test('looks use the matched shade and build valid try-on requests', () => {
  const { foundation, looks } = buildLooks({ skin: '#CFA282', lip: '#B98272' });
  assert.equal(foundation.id, 'fd-3n');
  assert.deepEqual(looks.map((l) => l.id), ['natural', 'everyday', 'evening']);
  assert.equal(looks[0].lip.id, 'lp-nude');
  for (const look of looks) {
    const body = buildTaskBody('makeup-vto', 'F1', { look: look.request });
    assert.ok(body.effects.length >= 2);
    assert.equal(body.effects[0].palettes[0].color, foundation.hex);
  }
});

test('simulation targets map to valid skin-simulation keys', () => {
  const t = simulationTargets(priorities(oilyAcne));
  assert.deepEqual(t, { acne: 0.6, oiliness: 0.6, pores: 0.6 });
  for (const k of Object.keys(simulationTargets(priorities(dryAging, [], 8)))) assert.ok(SIMULATION_KEYS.includes(k), k);
  assert.deepEqual(Object.keys(buildTaskBody('skin-simulation', 'F1', t)).sort(), ['acne', 'oiliness', 'pores', 'src_file_id']);
});

test('catalog is well formed', () => {
  const ids = ALL_PRODUCTS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const p of SKINCARE) {
    assert.ok(p.concerns.every((c) => SKIN_CONCERNS.includes(c)), p.id);
    assert.ok(p.price > 0 && [1, 2, 3].includes(p.tier), p.id);
  }
  assert.equal(productById('se-bha').name, 'Pore Refine BHA Serum');
  assert.equal(productById('nope'), null);
});

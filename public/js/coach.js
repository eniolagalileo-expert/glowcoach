// GlowCoach's coaching logic: pure functions, no DOM, tested in Node.
// Turns YouCam skin scores (ui_score 1–100, higher = healthier) into
// priorities, a routine from the catalog, a matched makeup look, and
// skin-simulation targets.
import { SKINCARE, FOUNDATION, LIPS, BLUSH } from './catalog.js';

export const CONCERN_LABELS = {
  acne: 'Breakouts',
  wrinkle: 'Fine lines',
  pore: 'Pores',
  texture: 'Texture',
  redness: 'Redness',
  oiliness: 'Oil balance',
  moisture: 'Hydration',
  dark_circle_v2: 'Dark circles',
};

// Goals the person can pick; each boosts the concerns it relates to.
export const GOALS = {
  clear: { label: 'Clearer skin', concerns: ['acne', 'pore', 'oiliness'] },
  smooth: { label: 'Smoother texture', concerns: ['texture', 'pore'] },
  hydrate: { label: 'More hydration', concerns: ['moisture'] },
  calm: { label: 'Calmer, even tone', concerns: ['redness'] },
  youthful: { label: 'Softer fine lines', concerns: ['wrinkle'] },
  bright: { label: 'Brighter eyes', concerns: ['dark_circle_v2'] },
};

export const BUDGETS = { 1: 'Under $60', 2: 'Around $100', 3: 'Treat myself' };

// Skin-analysis concern → skin-simulation key.
const SIMULATION_KEY = {
  acne: 'acne', wrinkle: 'wrinkle', pore: 'pores', texture: 'texture',
  redness: 'redness', oiliness: 'oiliness', dark_circle_v2: 'dark_circle', moisture: 'radiance',
};

export function glowScore(scores) {
  if (!scores?.length) return null;
  return Math.round(scores.reduce((a, s) => a + s.score, 0) / scores.length);
}

export function scoreBand(score) {
  if (score >= 80) return 'great';
  if (score >= 60) return 'good';
  if (score >= 40) return 'fair';
  return 'focus';
}

export function skinType(scores) {
  const byConcern = Object.fromEntries((scores ?? []).map((s) => [s.concern, s.score]));
  const oil = byConcern.oiliness ?? 70;
  const moisture = byConcern.moisture ?? 70;
  if (oil < 55 && moisture < 55) return 'combination';
  if (oil < 55) return 'oily';
  if (moisture < 55) return 'dry';
  return 'normal';
}

// The concerns to work on first: lowest scores, nudged by chosen goals.
export function priorities(scores, goals = [], count = 3) {
  const boosted = new Set(goals.flatMap((g) => GOALS[g]?.concerns ?? []));
  return [...(scores ?? [])]
    .map((s) => ({ ...s, need: 100 - s.score + (boosted.has(s.concern) ? 15 : 0) }))
    .sort((a, b) => b.need - a.need || a.concern.localeCompare(b.concern))
    .slice(0, count)
    .map(({ concern, score }) => ({ concern, score, label: CONCERN_LABELS[concern] ?? concern }));
}

function pick(step, { focus, type, budget, exclude = new Set(), time }) {
  const candidates = SKINCARE.filter((p) => p.step === step && !exclude.has(p.id) && p.types.includes(type) && (!time || !p.time || p.time === time));
  const scored = candidates.map((p) => {
    const hits = p.concerns.filter((c) => focus.includes(c));
    const weight = hits.reduce((a, c) => a + (focus.length - focus.indexOf(c)), 0);
    const overBudget = p.tier > budget ? 100 : 0;
    return { p, hits, rank: weight * 10 - overBudget - Math.abs(p.tier - budget) };
  });
  scored.sort((a, b) => b.rank - a.rank || a.p.price - b.p.price);
  const best = scored[0];
  return best ? { product: best.p, targets: best.hits } : null;
}

function why(product, targets) {
  const names = targets.map((c) => CONCERN_LABELS[c].toLowerCase());
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
  return names.length ? `${product.ingredient} for ${list}` : `${product.ingredient} to support your routine`;
}

// A simple AM/PM routine: cleanse, treat, moisturize, protect.
export function buildRoutine(scores, { goals = [], budget = 2 } = {}) {
  const top = priorities(scores, goals, 3);
  const focus = top.map((t) => t.concern);
  const type = skinType(scores);
  const used = new Set();
  const take = (step, time) => {
    const choice = pick(step, { focus, type, budget, exclude: used, time });
    if (!choice) return null;
    used.add(choice.product.id);
    return { ...choice.product, why: why(choice.product, choice.targets), targets: choice.targets };
  };
  const cleanser = take('cleanser');
  const amTreat = take('treatment', 'am');
  const pmTreat = take('treatment', 'pm');
  const eye = focus.includes('dark_circle_v2') ? take('eye') : null;
  const moisturizer = take('moisturizer');
  const spf = take('spf');
  const am = [cleanser, amTreat, eye, moisturizer, spf].filter(Boolean);
  const pm = [cleanser, pmTreat, eye, moisturizer].filter(Boolean);
  const unique = [...new Map([...am, ...pm].map((p) => [p.id, p])).values()];
  return { type, focus: top, am, pm, products: unique, total: unique.reduce((a, p) => a + p.price, 0) };
}

// ---- Color matching ---------------------------------------------------------

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToLab([r, g, b]) {
  const lin = (c) => { c /= 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92; };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

export function colorDistance(a, b) {
  const [l1, a1, b1] = rgbToLab(hexToRgb(a));
  const [l2, a2, b2] = rgbToLab(hexToRgb(b));
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

// Warm, cool, or neutral: taken from the closest shade, because a skin's hue
// angle drifts with depth and a single cut-off misreads deep and light skin.
export function undertone(hex) {
  return matchFoundation(hex).undertone;
}

// Closest foundation shade to the detected skin color.
export function matchFoundation(skinHex) {
  return [...FOUNDATION].sort((x, y) => colorDistance(skinHex, x.hex) - colorDistance(skinHex, y.hex))[0];
}

// Three looks built around the matched shade and natural lip color.
export function buildLooks(tone) {
  const foundation = matchFoundation(tone.skin);
  const tint = undertone(tone.skin);
  const natural = tone.lip ? [...LIPS].sort((x, y) => colorDistance(tone.lip, x.hex) - colorDistance(tone.lip, y.hex))[0] : LIPS[0];
  const blushFor = tint === 'cool' ? BLUSH[1] : tint === 'warm' ? BLUSH[0] : BLUSH[3];
  const evening = LIPS.find((l) => l.family === (tint === 'cool' ? 'berry' : 'red'));
  const everyday = LIPS.find((l) => l.family === (tint === 'warm' ? 'coral' : 'rose'));
  const look = (id, name, lip, blush, intensity) => ({
    id, name, foundation, lip, blush,
    request: {
      foundation: { color: foundation.hex, colorIntensity: intensity.f, coverageIntensity: intensity.c, glowIntensity: 30 },
      lip: { color: lip.hex, texture: lip.texture, colorIntensity: intensity.l },
      ...(blush ? { blush: { color: blush.hex, colorIntensity: intensity.b } } : {}),
    },
  });
  return {
    foundation,
    undertone: tint,
    looks: [
      look('natural', 'Your natural', natural, null, { f: 35, c: 30, l: 45, b: 0 }),
      look('everyday', 'Everyday glow', everyday, blushFor, { f: 45, c: 40, l: 55, b: 30 }),
      look('evening', 'Evening', evening, BLUSH[2], { f: 55, c: 50, l: 75, b: 40 }),
    ],
  };
}

// What the skin simulation should show for this routine: the priority
// concerns at a realistic "about 8 weeks of consistent care" strength.
export function simulationTargets(focus, strength = 0.6) {
  const params = {};
  for (const { concern } of focus) {
    const key = SIMULATION_KEY[concern];
    if (key) params[key] = strength;
  }
  return params;
}

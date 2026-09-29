// What GlowCoach remembers on this device: past scan scores (for progress)
// and the shopping bag. Photos are never stored.

const KEY = 'glowcoach:v1';
const MAX_SCANS = 52;

export function emptyState() {
  return { scans: [], bag: [] };
}

export function parse(raw) {
  try {
    const data = JSON.parse(raw);
    const scans = Array.isArray(data?.scans)
      ? data.scans.filter((s) => Number.isFinite(s?.at) && Array.isArray(s.scores)).slice(-MAX_SCANS)
      : [];
    const bag = Array.isArray(data?.bag) ? data.bag.filter((b) => typeof b?.id === 'string' && Number.isInteger(b.qty) && b.qty > 0) : [];
    return { scans, bag };
  } catch {
    return emptyState();
  }
}

export function load(storage = globalThis.localStorage) {
  try { return parse(storage.getItem(KEY)); } catch { return emptyState(); }
}

export function save(state, storage = globalThis.localStorage) {
  try { storage.setItem(KEY, JSON.stringify(state)); return true; } catch { return false; }
}

// Only scores are kept, not mask images or photos.
export function addScan(state, scores, { at = Date.now(), sample = false } = {}) {
  const clean = scores.map(({ concern, score }) => ({ concern, score }));
  return { ...state, scans: [...state.scans, { at, scores: clean, sample }].slice(-MAX_SCANS) };
}

export function realScans(state) {
  return state.scans.filter((s) => !s.sample);
}

export function addToBag(state, ids) {
  const bag = [...state.bag];
  for (const id of ids) {
    const line = bag.find((b) => b.id === id);
    if (line) continue;
    bag.push({ id, qty: 1 });
  }
  return { ...state, bag };
}

export function setQty(state, id, qty) {
  const bag = state.bag.map((b) => (b.id === id ? { ...b, qty } : b)).filter((b) => b.qty > 0);
  return { ...state, bag };
}

export function bagTotal(state, priceOf) {
  return state.bag.reduce((sum, b) => sum + (priceOf(b.id) ?? 0) * b.qty, 0);
}

// Change in each concern between the first and latest real scans.
export function progress(state) {
  const scans = realScans(state);
  if (scans.length < 2) return null;
  const first = Object.fromEntries(scans[0].scores.map((s) => [s.concern, s.score]));
  const last = scans.at(-1).scores;
  return last.map((s) => ({ concern: s.concern, from: first[s.concern] ?? s.score, to: s.score, change: s.score - (first[s.concern] ?? s.score) }));
}

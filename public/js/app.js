// GlowCoach UI: screens, camera, the scan journey, try-on, goal preview,
// bag, and progress. Coaching rules live in coach.js; storage in store.js.
import { ApiError, getStatus, prepareImage, uploadPhoto, runTask } from './api.js';
import {
  CONCERN_LABELS, GOALS, BUDGETS, glowScore, scoreBand, buildRoutine, buildLooks, simulationTargets,
} from './coach.js';
import { productById, BRAND } from './catalog.js';
import * as store from './store.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const SCREENS = ['home', 'capture', 'goals', 'analyzing', 'results', 'plan', 'tryon', 'future', 'bag', 'progress'];
const NEEDS_SCAN = new Set(['results', 'plan', 'tryon', 'future']);
const STEP_LABEL = { cleanser: 'Cleanse', treatment: 'Treat', eye: 'Eyes', moisturizer: 'Hydrate', spf: 'SPF' };

const state = {
  live: false,
  sample: null, // recorded sample journey, if this deployment has one
  mode: null, // 'live' | 'sample'
  photo: null, // { blob, url, width, height }
  fileId: null,
  goals: new Set(),
  budget: 2,
  scores: null,
  tone: null,
  toneError: null,
  routine: null,
  looks: null,
  activeLook: null,
  tryon: {}, // look id -> image url
  future: null,
  activeMask: null,
};
let saved = store.load();
let stream = null;

const money = (n) => `$${n.toFixed(0)}`;
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---- Routing ----------------------------------------------------------------

function route() {
  let name = location.hash.slice(1) || 'home';
  if (!SCREENS.includes(name)) name = 'home';
  if (NEEDS_SCAN.has(name) && !state.scores) name = 'home';
  if ((name === 'goals' || name === 'analyzing') && !state.photo) name = 'capture';
  if (name !== 'capture') stopCamera();
  for (const s of $$('.screen')) s.hidden = s.dataset.screen !== name;
  $('#tabbar').hidden = !state.scores;
  for (const a of $$('#tabbar a')) {
    if (a.dataset.tab === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  const render = { home: renderHome, capture: renderCapture, goals: renderGoals, results: renderResults, plan: renderPlan, tryon: renderTryon, future: renderFuture, bag: renderBag, progress: renderProgress }[name];
  render?.();
  window.scrollTo(0, 0);
}

function go(name) {
  if (location.hash === `#${name}`) route();
  else location.hash = name;
}

// ---- Home -------------------------------------------------------------------

function renderHome() {
  $('#start-live').hidden = !state.live;
  $('#start-sample').hidden = !state.sample;
  const note = $('#live-note');
  note.hidden = state.live;
  note.textContent = state.sample
    ? 'Live scans are paused on this demo right now. You can explore the full journey with the sample photo.'
    : 'Live scans are paused on this demo right now. Please check back soon.';
}

function updateBadge() {
  const badge = $('#mode-badge');
  if (state.mode === 'sample' || (!state.mode && !state.live)) {
    badge.textContent = 'Sample';
    badge.className = 'badge';
  } else {
    badge.textContent = 'Live AI';
    badge.className = 'badge live';
  }
  badge.hidden = !state.live && !state.sample;
  for (const el of $$('.sample-banner')) el.hidden = state.mode !== 'sample';
}

// ---- Capture ----------------------------------------------------------------

function renderCapture() {
  state.mode = 'live';
  updateBadge();
  if (state.photo && !state.photo.blob) setPhoto(null); // leaving the sample photo behind
  $('#camera-start').hidden = !navigator.mediaDevices?.getUserMedia || Boolean(stream);
  showPreview(state.photo);
}

function showPreview(photo) {
  const img = $('#capture-preview');
  img.hidden = !photo;
  if (photo) img.src = photo.url;
  $('#camera-empty').hidden = Boolean(photo) || Boolean(stream);
  $('#capture-next').hidden = !photo;
  $('.face-guide').hidden = Boolean(photo);
}

function captureError(message) {
  const el = $('#capture-error');
  el.textContent = message ?? '';
  el.hidden = !message;
}

async function startCamera() {
  captureError(null);
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1440 }, height: { ideal: 1920 } }, audio: false });
  } catch {
    captureError('We couldn’t open your camera. You can choose a photo instead.');
    return;
  }
  const video = $('#camera-video');
  video.srcObject = stream;
  video.hidden = false;
  await video.play().catch(() => {});
  setPhoto(null);
  $('#camera-start').hidden = true;
  $('#camera-snap').hidden = false;
  $('#camera-empty').hidden = true;
}

function stopCamera() {
  if (stream) for (const track of stream.getTracks()) track.stop();
  stream = null;
  $('#camera-video').hidden = true;
  $('#camera-snap').hidden = true;
}

async function snap() {
  const video = $('#camera-video');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width, 0); // un-mirror so the photo matches reality
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0);
  const blob = await new Promise((resolve) => { canvas.toBlob(resolve, 'image/jpeg', 0.92); });
  stopCamera();
  $('#camera-start').hidden = false;
  await usePhoto(blob);
}

async function usePhoto(file) {
  captureError(null);
  try {
    setPhoto(await prepareImage(file));
  } catch (error) {
    setPhoto(null);
    captureError(error instanceof ApiError ? error.message : 'We couldn’t read that image. Try a JPG or PNG photo.');
  }
}

function setPhoto(photo) {
  if (state.photo?.blob && state.photo.url !== photo?.url) URL.revokeObjectURL(state.photo.url);
  state.photo = photo;
  state.fileId = null;
  showPreview(photo);
}

// ---- Goals ------------------------------------------------------------------

function renderGoals() {
  $('#goal-chips').innerHTML = Object.entries(GOALS).map(([id, g]) =>
    `<button type="button" class="chip" data-goal="${id}" aria-pressed="${state.goals.has(id)}">${escapeHtml(g.label)}</button>`).join('');
  $('#budget-options').innerHTML = Object.entries(BUDGETS).map(([id, label]) =>
    `<button type="button" role="radio" data-budget="${id}" aria-checked="${state.budget === Number(id)}">${escapeHtml(label)}</button>`).join('');
}

// ---- Analysis ---------------------------------------------------------------

function setStep(step, status) {
  const li = $(`#analyze-steps [data-step="${step}"]`);
  li.classList.remove('active', 'done', 'failed');
  if (status) li.classList.add(status);
}

function showAnalyzeError(message) {
  $('#analyze-error').hidden = false;
  $('#analyze-error-text').textContent = message;
  $('#analyze-error .use-sample').hidden = !state.sample;
  $('.scan-line').hidden = true;
}

async function analyze() {
  state.scores = null;
  state.tone = null;
  state.toneError = null;
  state.tryon = {};
  state.future = null;
  state.activeMask = null;
  state.activeLook = null;
  go('analyzing');
  $('#analyzing-photo').src = state.photo.url;
  $('#analyze-error').hidden = true;
  $('.scan-line').hidden = false;
  for (const step of ['upload', 'skin', 'tone', 'plan']) setStep(step, null);

  try {
    if (state.mode === 'sample') {
      state.scores = state.sample.scores;
      state.tone = state.sample.tone;
      for (const step of ['upload', 'skin', 'tone']) setStep(step, 'done');
    } else {
      setStep('upload', 'active');
      if (!state.fileId) state.fileId = await uploadPhoto(state.photo.blob);
      setStep('upload', 'done');
      setStep('skin', 'active');
      setStep('tone', 'active');
      const skin = runTask('skin-analysis', state.fileId).then((r) => { setStep('skin', 'done'); return r; });
      const tone = runTask('skin-tone-analysis', state.fileId).then(
        (r) => { setStep('tone', 'done'); return r; },
        (error) => { setStep('tone', 'failed'); state.toneError = error.message; return null; },
      );
      const [skinResult, toneResult] = await Promise.all([skin.catch((e) => { setStep('skin', 'failed'); throw e; }), tone]);
      state.scores = skinResult.scores;
      state.tone = toneResult?.tone ?? null;
    }
  } catch (error) {
    showAnalyzeError(error instanceof ApiError ? error.message : 'Something went wrong. Please try again.');
    return;
  }

  setStep('plan', 'active');
  buildPlan();
  commit(store.addScan(saved, state.scores, { sample: state.mode === 'sample' }));
  setStep('plan', 'done');
  go('results');
}

function buildPlan() {
  state.routine = buildRoutine(state.scores, { goals: [...state.goals], budget: state.budget });
  state.looks = state.tone?.skin ? buildLooks(state.tone) : null;
  state.activeLook = state.looks?.looks[0].id ?? null;
}

function startSample() {
  if (!state.sample) return;
  state.mode = 'sample';
  setPhoto({ url: state.sample.photo, width: state.sample.width, height: state.sample.height });
  updateBadge();
  go('goals');
}

// ---- Results ----------------------------------------------------------------

function concernRow(s, { button = true } = {}) {
  const band = scoreBand(s.score);
  const inner = `<span>${escapeHtml(CONCERN_LABELS[s.concern] ?? s.concern)}</span>
    <span><span class="band band-${band}">${band === 'focus' ? 'focus' : band}</span> <span class="val">${s.score}</span></span>
    <span class="bar"><i class="fill-${band}" style="width:${s.score}%"></i></span>`;
  if (!button) return `<li><div class="row">${inner}</div></li>`;
  return `<li><button type="button" data-concern="${s.concern}" aria-pressed="${state.activeMask === s.concern}" ${s.mask ? '' : 'data-nomask'}>${inner}</button></li>`;
}

function renderResults() {
  updateBadge();
  const score = glowScore(state.scores);
  const ring = $('#glow-ring');
  ring.style.setProperty('--p', score);
  ring.style.setProperty('--c', `var(--${scoreBand(score)})`);
  $('#glow-score').textContent = score;
  const type = state.routine.type;
  $('#skin-type-title').textContent = `${type[0].toUpperCase()}${type.slice(1)} skin`;
  const focus = state.routine.focus.map((f) => f.label.toLowerCase());
  $('#focus-summary').textContent = `Your routine will focus on ${focus.slice(0, -1).join(', ')} and ${focus.at(-1)}.`;
  $('#results-photo').src = state.photo.url;
  const sorted = [...state.scores].sort((a, b) => a.score - b.score);
  $('#concern-list').innerHTML = sorted.map((s) => concernRow(s)).join('');
  showMask(state.activeMask);
}

function showMask(concern) {
  state.activeMask = concern;
  const mask = state.scores?.find((s) => s.concern === concern)?.mask;
  const overlay = $('#mask-overlay');
  overlay.hidden = !mask;
  if (mask) overlay.src = mask;
  for (const b of $$('#concern-list button')) b.setAttribute('aria-pressed', String(b.dataset.concern === concern));
}

// ---- Plan -------------------------------------------------------------------

function productCard(p, { label, why } = {}) {
  const swatch = p.hex
    ? `<span class="swatch" style="background:${p.hex}"></span>`
    : `<span class="swatch">${escapeHtml(label ?? STEP_LABEL[p.step] ?? '')}</span>`;
  return `<li class="product">${swatch}
    <div><div class="name">${escapeHtml(p.name)}</div><div class="why">${escapeHtml(why ?? p.why ?? '')}</div></div>
    <div class="price">${money(p.price)}</div></li>`;
}

function renderPlan() {
  const r = state.routine;
  $('#plan-focus').textContent = `Built for ${r.type} skin, targeting ${r.focus.map((f) => f.label.toLowerCase()).join(', ')}. ${BRAND} sample products.`;
  $('#routine-am').innerHTML = r.am.map((p) => productCard(p)).join('');
  $('#routine-pm').innerHTML = r.pm.map((p) => productCard(p)).join('');
  $('#plan-count').textContent = r.products.length;
  $('#plan-total').textContent = money(r.total);
}

// ---- Try-on -----------------------------------------------------------------

function setupCompare(root, before, after) {
  root.hidden = false;
  $('.before', root).src = before;
  $('.after', root).src = after;
  const range = $('input', root);
  const update = () => root.style.setProperty('--split', `${range.value}%`);
  range.oninput = update;
  update();
}

function lookProducts(look) {
  return [look.foundation, look.lip, look.blush].filter(Boolean);
}

function renderTryon() {
  updateBadge();
  const card = $('#shade-card');
  const status = $('#tryon-status');
  status.className = 'status';
  if (!state.looks) {
    card.innerHTML = '<p>We couldn’t measure your skin tone from this photo, so shade matching isn’t available. Try a new scan in even, natural light.</p>';
    $('#look-tabs').innerHTML = '';
    $('#tryon-view').hidden = true;
    $('#look-products').innerHTML = '';
    status.textContent = state.toneError ?? '';
    return;
  }
  const { foundation, undertone } = state.looks;
  card.innerHTML = `<div class="dots"><span class="dot" style="background:${state.tone.skin}" title="Your skin"></span><span class="dot" style="background:${foundation.hex}" title="${escapeHtml(foundation.name)}"></span></div>
    <div><p>Your foundation match</p><strong>${escapeHtml(foundation.name)}</strong><p>${undertone[0].toUpperCase()}${undertone.slice(1)} undertone</p></div>`;
  $('#look-tabs').innerHTML = state.looks.looks.map((l) =>
    `<button type="button" role="tab" data-look="${l.id}" aria-selected="${l.id === state.activeLook}"><span class="lip" style="background:${l.lip.hex}"></span>${escapeHtml(l.name)}</button>`).join('');
  showLook(state.activeLook);
}

async function showLook(id) {
  state.activeLook = id;
  const look = state.looks.looks.find((l) => l.id === id);
  for (const b of $$('#look-tabs button')) b.setAttribute('aria-selected', String(b.dataset.look === id));
  const items = lookProducts(look);
  $('#look-products').innerHTML = `<ul class="routine">${items.map((p) => productCard(p, { why: p.step === 'foundation' ? 'Matched to your skin tone' : `${p.step === 'lip' ? 'Lip' : 'Blush'} for this look` })).join('')}</ul>
    <div class="total-bar"><span>This look · <strong>${money(items.reduce((a, p) => a + p.price, 0))}</strong></span>
    <button type="button" class="btn primary small" data-add-look="${id}">Add look to bag</button></div>`;
  const status = $('#tryon-status');
  const view = $('#tryon-view');
  status.className = 'status';
  if (state.tryon[id]) {
    setupCompare(view, state.photo.url, state.tryon[id]);
    status.textContent = 'Drag across the photo to compare.';
    return;
  }
  if (state.mode === 'sample') {
    const url = state.sample.tryon?.[id];
    if (url) { state.tryon[id] = url; setupCompare(view, state.photo.url, url); status.textContent = 'Drag across the photo to compare.'; }
    else { view.hidden = true; status.textContent = 'This look isn’t in the sample.'; }
    return;
  }
  view.hidden = true;
  status.textContent = `Applying ${look.name.toLowerCase()}…`;
  try {
    const result = await runTask('makeup-vto', state.fileId, { look: look.request });
    state.tryon[id] = result.image;
    if (state.activeLook === id && !$('[data-screen="tryon"]').hidden) {
      setupCompare(view, state.photo.url, result.image);
      status.textContent = 'Drag across the photo to compare.';
    }
  } catch (error) {
    if (state.activeLook !== id) return;
    status.className = 'status error';
    status.textContent = error.message;
  }
}

// ---- Future -----------------------------------------------------------------

function renderFuture() {
  updateBadge();
  const labels = state.routine.focus.map((f) => f.label.toLowerCase());
  $('#future-focus').textContent = `A preview of your skin with improved ${labels.join(', ')}: the concerns your routine targets.`;
  const view = $('#future-view');
  if (state.future) {
    setupCompare(view, state.photo.url, state.future);
    $('#future-run').hidden = true;
    $('#future-status').textContent = 'Drag across the photo to compare.';
  } else {
    view.hidden = true;
    $('#future-run').hidden = false;
    $('#future-status').textContent = '';
  }
}

async function runFuture() {
  const button = $('#future-run');
  const status = $('#future-status');
  status.className = 'status';
  if (state.mode === 'sample') {
    state.future = state.sample.future;
    renderFuture();
    return;
  }
  button.disabled = true;
  status.textContent = 'Simulating your goal skin…';
  try {
    const result = await runTask('skin-simulation', state.fileId, simulationTargets(state.routine.focus));
    state.future = result.image;
    renderFuture();
  } catch (error) {
    status.className = 'status error';
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

// ---- Bag --------------------------------------------------------------------

function updateBagCount() {
  const count = saved.bag.reduce((a, b) => a + b.qty, 0);
  const el = $('#bag-count');
  el.hidden = !count;
  el.textContent = count;
}

function commit(next) {
  saved = next;
  store.save(saved);
  updateBagCount();
}

function addToBag(ids, button) {
  commit(store.addToBag(saved, ids));
  $('#checkout-done').hidden = true;
  if (button) {
    const text = button.textContent;
    button.textContent = 'Added ✓';
    button.disabled = true;
    setTimeout(() => { button.textContent = text; button.disabled = false; }, 1600);
  }
}

function renderBag() {
  const lines = saved.bag.map((b) => ({ ...b, product: productById(b.id) })).filter((b) => b.product);
  $('#bag-lines').innerHTML = lines.map(({ id, qty, product }) => {
    const swatch = product.hex ? `<span class="swatch" style="background:${product.hex}"></span>` : `<span class="swatch">${escapeHtml(STEP_LABEL[product.step] ?? product.step)}</span>`;
    return `<li class="product">${swatch}
      <div><div class="name">${escapeHtml(product.name)}</div><div class="why">${money(product.price)} each</div></div>
      <div class="qty"><button type="button" data-qty="${id}" data-delta="-1" aria-label="One less ${escapeHtml(product.name)}">−</button><span>${qty}</span><button type="button" data-qty="${id}" data-delta="1" aria-label="One more ${escapeHtml(product.name)}">+</button></div></li>`;
  }).join('');
  const empty = lines.length === 0;
  $('#bag-empty').hidden = !empty || !$('#checkout-done').hidden;
  $('#bag-footer').hidden = empty;
  $('#bag-total').textContent = money(store.bagTotal(saved, (id) => productById(id)?.price));
}

// ---- Progress ---------------------------------------------------------------

function renderProgress() {
  const scans = store.realScans(saved);
  const chart = $('#progress-chart');
  const empty = $('#progress-empty');
  const changes = store.progress(saved);
  $('#progress-changes').innerHTML = changes
    ? changes.sort((a, b) => b.change - a.change).map((c) => {
      const sign = c.change > 0 ? `+${c.change}` : String(c.change);
      return `<li><div class="row"><span>${escapeHtml(CONCERN_LABELS[c.concern] ?? c.concern)}</span><span class="${c.change >= 0 ? 'up' : 'down'}">${c.from} → ${c.to} (${sign})</span></div></li>`;
    }).join('')
    : '';
  if (scans.length === 0) {
    chart.innerHTML = '';
    empty.textContent = 'Your live scans will appear here. Scan every week or two in similar light to see your routine at work. (Sample scans aren’t counted.)';
    return;
  }
  empty.textContent = scans.length === 1
    ? 'One scan so far. Scan again in a week or two, in similar light, to see what’s changing.'
    : `${scans.length} scans. Changes since your first scan:`;
  chart.innerHTML = glowChart(scans);
}

function glowChart(scans) {
  const W = 320; const H = 150; const pad = 26;
  const points = scans.map((s, i) => {
    const x = scans.length === 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (scans.length - 1);
    const score = glowScore(s.scores);
    return { x, y: H - pad - (score / 100) * (H - 2 * pad), score, at: s.at };
  });
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const day = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Glow score over time: ${points.map((p) => `${day(p.at)} ${p.score}`).join(', ')}">
    <line x1="${pad}" x2="${W - pad}" y1="${H - pad}" y2="${H - pad}" stroke="var(--line)"/>
    <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    ${points.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="5" fill="var(--accent)"/><text x="${p.x}" y="${p.y - 10}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--ink)">${p.score}</text>`).join('')}
    <text x="${points[0].x}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--muted)">${day(points[0].at)}</text>
    ${points.length > 1 ? `<text x="${points.at(-1).x}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--muted)">${day(points.at(-1).at)}</text>` : ''}
  </svg>`;
}

// ---- Events -----------------------------------------------------------------

function bindEvents() {
  window.addEventListener('hashchange', route);
  $('#start-sample').addEventListener('click', startSample);
  $('#analyze-error .use-sample').addEventListener('click', startSample);
  $('#camera-start').addEventListener('click', startCamera);
  $('#camera-snap').addEventListener('click', snap);
  $('#file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    stopCamera();
    await usePhoto(file);
  });
  $('#goal-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-goal]');
    if (!chip) return;
    const id = chip.dataset.goal;
    if (state.goals.has(id)) state.goals.delete(id); else state.goals.add(id);
    chip.setAttribute('aria-pressed', String(state.goals.has(id)));
  });
  $('#budget-options').addEventListener('click', (e) => {
    const option = e.target.closest('[data-budget]');
    if (!option) return;
    state.budget = Number(option.dataset.budget);
    for (const b of $$('#budget-options button')) b.setAttribute('aria-checked', String(b === option));
  });
  $('#analyze').addEventListener('click', analyze);
  $('#concern-list').addEventListener('click', (e) => {
    const button = e.target.closest('[data-concern]');
    if (!button) return;
    showMask(state.activeMask === button.dataset.concern ? null : button.dataset.concern);
  });
  $('#add-routine').addEventListener('click', (e) => addToBag(state.routine.products.map((p) => p.id), e.currentTarget));
  $('#look-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-look]');
    if (tab && tab.dataset.look !== state.activeLook) showLook(tab.dataset.look);
  });
  $('#look-products').addEventListener('click', (e) => {
    const button = e.target.closest('[data-add-look]');
    if (!button) return;
    const look = state.looks.looks.find((l) => l.id === button.dataset.addLook);
    addToBag(lookProducts(look).map((p) => p.id), button);
  });
  $('#future-run').addEventListener('click', runFuture);
  $('#bag-lines').addEventListener('click', (e) => {
    const button = e.target.closest('[data-qty]');
    if (!button) return;
    const line = saved.bag.find((b) => b.id === button.dataset.qty);
    commit(store.setQty(saved, line.id, line.qty + Number(button.dataset.delta)));
    renderBag();
  });
  $('#checkout').addEventListener('click', () => {
    commit({ ...saved, bag: [] });
    $('#checkout-done').hidden = false;
    renderBag();
  });
}

async function init() {
  bindEvents();
  updateBagCount();
  const [status, sample] = await Promise.all([
    getStatus().catch(() => ({ live: false })),
    fetch('sample/journey.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  state.live = Boolean(status.live);
  state.sample = sample;
  updateBadge();
  route();
}

init();

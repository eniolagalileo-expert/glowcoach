import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, YOUCAM_BASE } from '../lib/youcam.js';
import { buildTaskBody, normalizeResult, SKIN_CONCERNS, TaskInputError } from '../lib/tasks.js';
import { createBudget } from '../lib/limits.js';
import { upload, startTask, pollTask, status } from '../lib/handlers.js';

// A fake YouCam API that records calls.
function fakeYouCam({ taskStatus = 'success', results = {}, failCreate = null } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body });
    const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
    if (url === `${YOUCAM_BASE}/s2s/v2.0/file`) {
      const req = JSON.parse(init.body);
      return json(200, { status: 200, data: { files: [{ ...req.files[0], file_id: 'FILE123', requests: [{ method: 'PUT', url: 'https://s3.example/upload', headers: { 'Content-Type': req.files[0].content_type } }] }] } });
    }
    if (url === 'https://s3.example/upload') return { ok: true, status: 200, json: async () => ({}) };
    const m = url.match(/\/s2s\/v2\.0\/task\/([a-z-]+)(?:\/(.+))?$/);
    if (m && init.method === 'POST') {
      if (failCreate) return json(failCreate.status, { status: failCreate.status, error: 'nope', error_code: failCreate.code });
      return json(200, { status: 200, data: { task_id: `TASK-${m[1]}` } });
    }
    if (m && init.method === 'GET') return json(200, { status: 200, data: { task_status: taskStatus, results } });
    return json(404, { status: 404, error: 'not found' });
  };
  return { calls, fetchImpl };
}

const ENV = { YOUCAM_API_KEY: 'test-key' };
const IMAGE = Buffer.alloc(4000, 1).toString('base64');

test('upload registers the file, PUTs the bytes, and returns the file id', async () => {
  const api = fakeYouCam();
  const out = await upload({ body: { image: IMAGE, contentType: 'image/jpeg' }, env: ENV, fetchImpl: api.fetchImpl });
  assert.deepEqual(out, { status: 200, json: { fileId: 'FILE123' } });
  const register = api.calls[0];
  assert.equal(register.headers.Authorization, 'Bearer test-key');
  assert.deepEqual(JSON.parse(register.body).files[0], { content_type: 'image/jpeg', file_name: 'glowcoach-selfie.jpg', file_size: 4000 });
  assert.equal(api.calls[1].method, 'PUT');
  assert.equal(api.calls[1].body.length, 4000);
});

test('upload rejects missing or tiny images without calling YouCam', async () => {
  const api = fakeYouCam();
  assert.equal((await upload({ body: {}, env: ENV, fetchImpl: api.fetchImpl })).status, 400);
  assert.equal((await upload({ body: { image: 'abc' }, env: ENV, fetchImpl: api.fetchImpl })).status, 400);
  assert.equal(api.calls.length, 0);
});

test('without a key the API answers clearly and the app can fall back to samples', async () => {
  const out = await upload({ body: { image: IMAGE }, env: {}, fetchImpl: fakeYouCam().fetchImpl });
  assert.equal(out.status, 503);
  assert.equal(out.json.code, 'NoApiKey');
  assert.deepEqual(status({ env: {} }).json.live, false);
  assert.deepEqual(status({ env: ENV }).json.live, true);
});

test('skin analysis asks for the eight concerns with separate masks', () => {
  const body = buildTaskBody('skin-analysis', 'F1');
  assert.deepEqual(body, { src_file_id: 'F1', dst_actions: SKIN_CONCERNS, miniserver_args: { enable_mask_overlay: false }, format: 'json' });
  assert.equal(SKIN_CONCERNS.length, 8);
});

test('skin simulation keeps only known concerns, clamped to 0–1', () => {
  assert.deepEqual(buildTaskBody('skin-simulation', 'F1', { acne: 0.7, wrinkle: 3, pores: -1, evil: 1 }), { src_file_id: 'F1', acne: 0.7, wrinkle: 1 });
  assert.throws(() => buildTaskBody('skin-simulation', 'F1', {}), TaskInputError);
});

test('makeup look becomes valid foundation, lip, and blush effects', () => {
  const body = buildTaskBody('makeup-vto', 'F1', { look: { foundation: { color: '#C9A184' }, lip: { color: '#B5485D', texture: 'matte' }, blush: { color: '#E08A8A' } } });
  assert.equal(body.version, '1.0');
  assert.deepEqual(body.effects.map((e) => e.category), ['foundation', 'lip_color', 'blush']);
  assert.deepEqual(body.effects[0].palettes[0], { color: '#C9A184', colorIntensity: 45, glowIntensity: 30, coverageIntensity: 40 });
  assert.deepEqual(body.effects[1].shape, { name: 'original' });
  assert.deepEqual(body.effects[1].style, { type: 'full' });
  assert.equal(body.effects[1].palettes[0].texture, 'matte');
  assert.deepEqual(body.effects[2].pattern, { name: '1color1' });
  assert.throws(() => buildTaskBody('makeup-vto', 'F1', { look: { lip: { color: 'red' } } }), TaskInputError);
  assert.throws(() => buildTaskBody('makeup-vto', 'F1', { look: {} }), TaskInputError);
});

test('unknown tasks and bad file ids are refused', () => {
  assert.throws(() => buildTaskBody('face-swap', 'F1'), TaskInputError);
  assert.throws(() => buildTaskBody('skin-analysis', ''), TaskInputError);
});

test('startTask creates a task through the right endpoint', async () => {
  const api = fakeYouCam();
  const out = await startTask({ body: { kind: 'skin-analysis', fileId: 'F1' }, env: ENV, visitor: 'v-start', fetchImpl: api.fetchImpl });
  assert.deepEqual(out, { status: 200, json: { taskId: 'TASK-skin-analysis' } });
  assert.equal(api.calls[0].url, `${YOUCAM_BASE}/s2s/v2.0/task/skin-analysis`);
  assert.deepEqual(JSON.parse(api.calls[0].body).dst_actions, SKIN_CONCERNS);
});

test('startTask refuses unknown tasks without calling YouCam', async () => {
  const api = fakeYouCam();
  const out = await startTask({ body: { kind: 'text-to-video', fileId: 'F1' }, env: ENV, visitor: 'v', fetchImpl: api.fetchImpl });
  assert.equal(out.status, 400);
  assert.equal(api.calls.length, 0);
});

test('out-of-units errors are explained in plain words', async () => {
  const api = fakeYouCam({ failCreate: { status: 400, code: 'CreditInsufficiency' } });
  const out = await startTask({ body: { kind: 'makeup-vto', fileId: 'F1', params: { look: { lip: { color: '#AA3344' } } } }, env: ENV, visitor: 'v-credit', fetchImpl: api.fetchImpl });
  assert.equal(out.status, 400);
  assert.match(out.json.error, /used up its YouCam units/);
});

test('pollTask normalizes skin analysis scores and masks', async () => {
  const api = fakeYouCam({ results: { output: [{ type: 'acne', ui_score: 71, raw_score: 60.2, mask_urls: ['https://m/acne.png'] }, { type: 'pore', ui_score: 88, raw_score: 90 }] } });
  const out = await pollTask({ query: { kind: 'skin-analysis', id: 'T1' }, env: ENV, fetchImpl: api.fetchImpl });
  assert.deepEqual(out.json, { status: 'success', scores: [{ concern: 'acne', score: 71, raw: 60.2, mask: 'https://m/acne.png' }, { concern: 'pore', score: 88, raw: 90, mask: null }] });
});

test('normalizeResult handles running, error, tone, and image results', () => {
  assert.deepEqual(normalizeResult('makeup-vto', { task_status: 'running' }), { status: 'running' });
  assert.equal(normalizeResult('makeup-vto', { task_status: 'error', error: 'error_face_position_invalid' }).status, 'error');
  assert.deepEqual(normalizeResult('makeup-vto', { task_status: 'success', results: { url: 'https://r/1.jpg' } }), { status: 'success', image: 'https://r/1.jpg' });
  assert.deepEqual(normalizeResult('skin-tone-analysis', { task_status: 'success', results: { color: { skin_color: '#b9947c', lip_color: '#D23245', eye_color_name: 'Brown', hair_color_name: 'Black' } } }).tone, { skin: '#b9947c', lip: '#D23245', eye: 'Brown', hair: 'Black' });
});

test('the budget stops a visitor at the daily limit and refunds failed starts', () => {
  let t = Date.UTC(2026, 9, 1, 10);
  const budget = createBudget({ perVisitor: 30, global: 50, now: () => t });
  assert.equal(budget.take('a', 20), true);
  assert.equal(budget.take('a', 12), false);
  budget.refund('a', 20);
  assert.equal(budget.take('a', 12), true);
  assert.equal(budget.take('b', 30), true);
  assert.equal(budget.take('c', 12), false);
  t += 24 * 3600e3;
  assert.equal(budget.take('c', 12), true);
});

test('createClient refuses to run without a key', () => {
  assert.throws(() => createClient({ apiKey: '' }), /Missing YouCam API key/);
});

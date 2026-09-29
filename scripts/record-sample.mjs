// Records the "sample photo" journey once, from real YouCam API calls, so
// visitors can explore GlowCoach without spending units. Images are saved
// locally because YouCam result links expire after 2 hours.
// Usage: node scripts/record-sample.mjs   (reads YOUCAM_API_KEY from .env)
// Cost: about 41 units (analysis 12, tone 20, three looks 3, simulation 6).
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '../lib/youcam.js';
import { buildTaskBody, normalizeResult } from '../lib/tasks.js';
import { buildRoutine, buildLooks, simulationTargets } from '../public/js/coach.js';

const SAMPLE_URL = 'https://plugins-media.makeupar.com/strapi/assets/sample_Image_1_202b6bf6e6.jpg';
const OUT = new URL('../public/sample/', import.meta.url).pathname;

for (const line of fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8').split('\n') : []) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const client = createClient({ apiKey: process.env.YOUCAM_API_KEY });

async function download(url, name) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${name}`);
  fs.writeFileSync(path.join(OUT, name), Buffer.from(await response.arrayBuffer()));
  return `sample/${name}`;
}

async function run(kind, fileId, params) {
  const taskId = await client.createTask(kind, buildTaskBody(kind, fileId, params));
  for (let i = 0; i < 60; i += 1) {
    await new Promise((r) => { setTimeout(r, 2000); });
    const result = normalizeResult(kind, await client.getTask(kind, taskId));
    if (result.status === 'success') return result;
    if (result.status === 'error') throw new Error(`${kind}: ${result.error}`);
  }
  throw new Error(`${kind}: timed out`);
}

fs.mkdirSync(OUT, { recursive: true });
const photoBytes = Buffer.from(await (await fetch(SAMPLE_URL)).arrayBuffer());
fs.writeFileSync(path.join(OUT, 'selfie.jpg'), photoBytes);
const fileId = await client.uploadImage(photoBytes, 'image/jpeg');
console.log('uploaded');

const [skin, tone] = await Promise.all([run('skin-analysis', fileId), run('skin-tone-analysis', fileId)]);
console.log('analysis done');
const scores = [];
for (const s of skin.scores) {
  scores.push({ concern: s.concern, score: s.score, mask: s.mask ? await download(s.mask, `mask-${s.concern}.png`) : null });
}

const tryon = {};
for (const look of buildLooks(tone.tone).looks) {
  const result = await run('makeup-vto', fileId, { look: look.request });
  tryon[look.id] = await download(result.image, `look-${look.id}.jpg`);
}
console.log('looks done');
// Recorded with no goals and the default budget; the app labels it as a sample.
const routine = buildRoutine(scores, {});
const future = await download((await run('skin-simulation', fileId, simulationTargets(routine.focus))).image, 'future.jpg');

const journey = { photo: 'sample/selfie.jpg', width: 1080, height: 1437, scores, tone: tone.tone, tryon, future, recordedAt: new Date().toISOString() };
fs.writeFileSync(path.join(OUT, 'journey.json'), `${JSON.stringify(journey, null, 2)}\n`);
console.log('saved public/sample/journey.json');

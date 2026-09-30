// Adds any try-on looks missing from the recorded sample journey (1 unit
// each), reusing its recorded skin tone. Usage: node scripts/add-sample-looks.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '../lib/youcam.js';
import { buildTaskBody, normalizeResult } from '../lib/tasks.js';
import { buildLooks } from '../public/js/coach.js';

const OUT = new URL('../public/sample/', import.meta.url).pathname;
for (const line of fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8').split('\n') : []) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const client = createClient({ apiKey: process.env.YOUCAM_API_KEY });
const journey = JSON.parse(fs.readFileSync(path.join(OUT, 'journey.json'), 'utf8'));
const missing = buildLooks(journey.tone).looks.filter((l) => !journey.tryon?.[l.id]);
if (!missing.length) { console.log('all looks recorded'); process.exit(0); }

const fileId = await client.uploadImage(fs.readFileSync(path.join(OUT, 'selfie.jpg')), 'image/jpeg');
for (const look of missing) {
  const taskId = await client.createTask('makeup-vto', buildTaskBody('makeup-vto', fileId, { look: look.request }));
  let result;
  for (let i = 0; i < 60 && (!result || result.status === 'running'); i += 1) {
    await new Promise((r) => { setTimeout(r, 2000); });
    result = normalizeResult('makeup-vto', await client.getTask('makeup-vto', taskId));
  }
  if (result.status !== 'success') throw new Error(`${look.id}: ${result.error ?? 'timed out'}`);
  const bytes = Buffer.from(await (await fetch(result.image)).arrayBuffer());
  fs.writeFileSync(path.join(OUT, `look-${look.id}.jpg`), bytes);
  journey.tryon = { ...journey.tryon, [look.id]: `sample/look-${look.id}.jpg` };
  console.log('recorded', look.id);
}
fs.writeFileSync(path.join(OUT, 'journey.json'), `${JSON.stringify(journey, null, 2)}\n`);

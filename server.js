// Local development server: serves public/ and the same API handlers that
// run on Vercel. Reads YOUCAM_API_KEY from .env if present.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { status, upload, startTask, pollTask } from './lib/handlers.js';

const root = new URL('./public/', import.meta.url).pathname;
const env = { ...process.env };
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && m[2] && !env[m[1]]) env[m[1]] = m[2];
  }
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

function send(res, out) {
  res.writeHead(out.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(out.json));
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { return {}; }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/status') return send(res, status({ env }));
  if (url.pathname === '/api/upload' && req.method === 'POST') return send(res, await upload({ body: await readJson(req), env }));
  if (url.pathname === '/api/task') {
    if (req.method === 'POST') return send(res, await startTask({ body: await readJson(req), env, visitor: req.socket.remoteAddress }));
    return send(res, await pollTask({ query: Object.fromEntries(url.searchParams), env }));
  }
  let path = normalize(join(root, url.pathname));
  if (!path.startsWith(root)) { res.writeHead(403); return res.end(); }
  try {
    if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
});

const port = Number(process.env.PORT) || 8790;
server.listen(port, () => console.log(`GlowCoach on http://localhost:${port} (live AI: ${env.YOUCAM_API_KEY ? 'on' : 'off, sample mode only'})`));

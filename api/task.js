import { startTask, pollTask } from '../lib/handlers.js';

function visitorOf(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
}

export default async function handler(req, res) {
  const out = req.method === 'POST'
    ? await startTask({ body: req.body, env: process.env, visitor: visitorOf(req) })
    : await pollTask({ query: req.query, env: process.env });
  res.setHeader('Cache-Control', 'no-store');
  res.status(out.status).json(out.json);
}

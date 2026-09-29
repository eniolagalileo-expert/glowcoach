import { upload } from '../lib/handlers.js';

export const config = { api: { bodyParser: { sizeLimit: '8mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const out = await upload({ body: req.body, env: process.env });
  res.status(out.status).json(out.json);
}

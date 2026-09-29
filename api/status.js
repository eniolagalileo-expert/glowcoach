import { status } from '../lib/handlers.js';

export default function handler(req, res) {
  const out = status({ env: process.env });
  res.status(out.status).json(out.json);
}

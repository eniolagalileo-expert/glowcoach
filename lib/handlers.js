// Request handlers shared by the Vercel functions in api/ and the local dev
// server. Each takes plain inputs and returns { status, json }.
import { createClient, YouCamError } from './youcam.js';
import { buildTaskBody, normalizeResult, isKnownTask, TaskInputError, UNIT_COST } from './tasks.js';
import { createBudget } from './limits.js';

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const budget = createBudget();

function fail(error) {
  if (error instanceof TaskInputError) return { status: 400, json: { error: error.message, code: 'BadInput' } };
  if (error instanceof YouCamError) {
    const messages = {
      NoApiKey: 'The live AI is not configured on this server. Try the sample photo instead.',
      CreditInsufficiency: 'The demo has used up its YouCam units for now. Try the sample photo instead.',
      InvalidApiKey: 'The server’s YouCam key is not valid.',
    };
    return {
      status: error.status >= 400 && error.status < 600 ? error.status : 502,
      json: { error: messages[error.code] || error.message, code: error.code },
    };
  }
  return { status: 500, json: { error: 'Something went wrong', code: 'Internal' } };
}

export function status({ env }) {
  return { status: 200, json: { live: Boolean(env.YOUCAM_API_KEY), costs: UNIT_COST } };
}

// body: { image: base64 string (no data: prefix), contentType }
export async function upload({ body, env, fetchImpl }) {
  try {
    const contentType = body?.contentType === 'image/png' ? 'image/png' : 'image/jpeg';
    if (typeof body?.image !== 'string' || !body.image) throw new TaskInputError('Missing image');
    const bytes = Buffer.from(body.image, 'base64');
    if (bytes.length < 1000 || bytes.length > MAX_IMAGE_BYTES) throw new TaskInputError('The photo must be between 1 KB and 6 MB');
    const client = createClient({ apiKey: env.YOUCAM_API_KEY, fetchImpl });
    const fileId = await client.uploadImage(bytes, contentType);
    return { status: 200, json: { fileId } };
  } catch (error) {
    return fail(error);
  }
}

// body: { kind, fileId, params }
export async function startTask({ body, env, visitor, fetchImpl }) {
  const kind = body?.kind;
  if (!isKnownTask(kind)) return fail(new TaskInputError('Unknown task'));
  let reserved = false;
  try {
    const request = buildTaskBody(kind, body.fileId, body.params);
    const client = createClient({ apiKey: env.YOUCAM_API_KEY, fetchImpl });
    if (!budget.take(visitor, UNIT_COST[kind])) {
      return { status: 429, json: { error: 'You’ve reached today’s free live scans. Try the sample photo, or come back tomorrow.', code: 'Budget' } };
    }
    reserved = true;
    const taskId = await client.createTask(kind, request);
    return { status: 200, json: { taskId } };
  } catch (error) {
    if (reserved) budget.refund(visitor, UNIT_COST[kind]);
    return fail(error);
  }
}

// query: { kind, id }
export async function pollTask({ query, env, fetchImpl }) {
  if (!isKnownTask(query?.kind) || typeof query?.id !== 'string' || !query.id) return fail(new TaskInputError('Bad task'));
  try {
    const client = createClient({ apiKey: env.YOUCAM_API_KEY, fetchImpl });
    const data = await client.getTask(query.kind, query.id);
    return { status: 200, json: normalizeResult(query.kind, data) };
  } catch (error) {
    return fail(error);
  }
}

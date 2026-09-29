// Minimal server-side client for the YouCam API (Perfect Corp).
// Every call is server-to-server with the key from YOUCAM_API_KEY; the key
// never reaches the browser.

export const YOUCAM_BASE = 'https://yce-api-01.makeupar.com';

export class YouCamError extends Error {
  constructor(message, { status = 500, code = 'unknown' } = {}) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function createClient({ apiKey, fetchImpl = fetch, base = YOUCAM_BASE }) {
  if (!apiKey) throw new YouCamError('Missing YouCam API key', { status: 503, code: 'NoApiKey' });

  async function request(method, path, body) {
    let response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new YouCamError('Could not reach the YouCam API', { status: 502, code: 'NetworkError' });
    }
    let json = null;
    try { json = await response.json(); } catch { /* non-JSON error body */ }
    if (!response.ok || (json && json.status && json.status >= 400)) {
      throw new YouCamError(json?.error || `YouCam API error ${response.status}`, {
        status: response.status >= 400 ? response.status : json?.status ?? 500,
        code: json?.error_code || 'ApiError',
      });
    }
    return json?.data ?? json;
  }

  // Step 1: register the file, step 2: PUT the bytes to the pre-signed URL.
  async function uploadImage(bytes, contentType = 'image/jpeg') {
    const ext = contentType === 'image/png' ? 'png' : 'jpg';
    const data = await request('POST', '/s2s/v2.0/file', {
      files: [{ content_type: contentType, file_name: `glowcoach-selfie.${ext}`, file_size: bytes.length }],
    });
    const file = data?.files?.[0];
    const upload = file?.requests?.[0];
    if (!file?.file_id || !upload?.url) throw new YouCamError('Unexpected file API response', { code: 'BadFileResponse' });
    let put;
    try {
      put = await fetchImpl(upload.url, { method: upload.method || 'PUT', headers: upload.headers, body: bytes });
    } catch {
      throw new YouCamError('Could not upload the photo', { status: 502, code: 'UploadFailed' });
    }
    if (!put.ok) throw new YouCamError('Could not upload the photo', { status: 502, code: 'UploadFailed' });
    return file.file_id;
  }

  async function createTask(kind, body) {
    const data = await request('POST', `/s2s/v2.0/task/${kind}`, body);
    if (!data?.task_id) throw new YouCamError('No task id returned', { code: 'BadTaskResponse' });
    return data.task_id;
  }

  async function getTask(kind, taskId) {
    return request('GET', `/s2s/v2.0/task/${kind}/${encodeURIComponent(taskId)}`);
  }

  async function credits() {
    return request('GET', '/s2s/v1.0/client/credit');
  }

  return { uploadImage, createTask, getTask, credits };
}

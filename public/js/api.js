// Browser side of GlowCoach's API: resize the photo, upload it, run YouCam
// tasks through our server, and poll until they finish.

export class ApiError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

async function call(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new ApiError('Can’t reach GlowCoach. Check your connection.', 'Network');
  }
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(json.error || 'Something went wrong', json.code);
  return json;
}

export function getStatus() {
  return call('/api/status');
}

// Scale so the long side is at most 1600 px (the short side must stay >= 480
// for YouCam), and re-encode as JPEG to keep uploads small.
export async function prepareImage(file, { maxSide = 1600, minShort = 480 } = {}) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  if (Math.min(width, height) < minShort) {
    throw new ApiError('That photo is too small. Use one at least 480 pixels on its short side.', 'TooSmall');
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise((resolve) => { canvas.toBlob(resolve, 'image/jpeg', 0.9); });
  return { blob, width, height, url: URL.createObjectURL(blob) };
}

async function toBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export async function uploadPhoto(blob) {
  const { fileId } = await call('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: await toBase64(blob), contentType: 'image/jpeg' }),
  });
  return fileId;
}

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// Start a task and poll it. Polls quickly at first, then backs off.
export async function runTask(kind, fileId, params = {}, { timeoutMs = 90000 } = {}) {
  const { taskId } = await call('/api/task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, fileId, params }),
  });
  const started = Date.now();
  let delay = 1200;
  while (Date.now() - started < timeoutMs) {
    await wait(delay);
    const result = await call(`/api/task?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(taskId)}`);
    if (result.status === 'success') return result;
    if (result.status === 'error') throw new ApiError(friendlyTaskError(result.error), 'TaskFailed');
    delay = Math.min(delay * 1.4, 4000);
  }
  throw new ApiError('The AI is taking too long. Please try again.', 'Timeout');
}

// YouCam's photo errors, in plain words.
export function friendlyTaskError(code = '') {
  const map = {
    error_face_position_invalid: 'We couldn’t see your whole face. Face the camera, centered, with your face filling most of the photo.',
    error_face_position_too_small: 'Your face is too small in the photo. Move closer so it fills most of the frame.',
    error_src_face_too_small: 'Your face is too small in the photo. Move closer so it fills most of the frame.',
    error_face_position_out_of_boundary: 'Part of your face is cut off. Make sure your forehead and chin are in the photo.',
    error_src_face_out_of_bound: 'Part of your face is cut off. Make sure your forehead and chin are in the photo.',
    error_lighting_dark: 'The photo is too dark. Try again facing a window or soft light.',
    error_face_not_forward_facing: 'Look straight at the camera and try again.',
  };
  const key = Object.keys(map).find((k) => code.includes(k) || code.startsWith('error_face_angle') && k === 'error_face_not_forward_facing');
  return key ? map[key] : 'The AI couldn’t read this photo. Try a well-lit, front-facing selfie.';
}

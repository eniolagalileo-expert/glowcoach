// Which YouCam tasks GlowCoach may run, how their request bodies are built
// from a small set of browser inputs, and how results are normalized.
// Building bodies on the server keeps callers from spending units on
// arbitrary API calls.

export const SKIN_CONCERNS = ['acne', 'wrinkle', 'pore', 'texture', 'redness', 'oiliness', 'moisture', 'dark_circle_v2'];

// Skin-simulation concern names differ slightly from skin-analysis names.
export const SIMULATION_KEYS = ['wrinkle', 'radiance', 'oiliness', 'acne', 'eye_bags', 'dark_circle', 'spots', 'pores', 'texture', 'redness'];

const HEX = /^#[0-9a-fA-F]{6}$/;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const int = (n, lo = 0, hi = 100) => clamp(Math.round(Number(n) || 0), lo, hi);

// Approximate unit cost per task (from YouCam's docs), used for budgeting.
export const UNIT_COST = { 'skin-analysis': 12, 'skin-tone-analysis': 20, 'skin-simulation': 6, 'makeup-vto': 1 };

export class TaskInputError extends Error {}

function makeupEffects(look) {
  if (!look || typeof look !== 'object') throw new TaskInputError('Missing look');
  const effects = [];
  if (look.foundation) {
    if (!HEX.test(look.foundation.color)) throw new TaskInputError('Bad foundation color');
    effects.push({
      category: 'foundation',
      palettes: [{
        color: look.foundation.color,
        colorIntensity: int(look.foundation.colorIntensity ?? 45),
        glowIntensity: int(look.foundation.glowIntensity ?? 30),
        coverageIntensity: int(look.foundation.coverageIntensity ?? 40),
      }],
    });
  }
  if (look.lip) {
    if (!HEX.test(look.lip.color)) throw new TaskInputError('Bad lip color');
    const texture = ['matte', 'satin', 'sheer'].includes(look.lip.texture) ? look.lip.texture : 'satin';
    effects.push({
      category: 'lip_color',
      shape: { name: 'original' },
      style: { type: 'full' },
      palettes: [{ color: look.lip.color, texture, colorIntensity: int(look.lip.colorIntensity ?? 55) }],
    });
  }
  if (look.blush) {
    if (!HEX.test(look.blush.color)) throw new TaskInputError('Bad blush color');
    effects.push({
      category: 'blush',
      pattern: { name: '1color1' },
      palettes: [{ color: look.blush.color, texture: 'matte', colorIntensity: int(look.blush.colorIntensity ?? 35) }],
    });
  }
  if (effects.length === 0) throw new TaskInputError('Empty look');
  return effects;
}

export function buildTaskBody(kind, fileId, params = {}) {
  if (typeof fileId !== 'string' || !fileId || fileId.length > 300) throw new TaskInputError('Bad file id');
  switch (kind) {
    case 'skin-analysis':
      return { src_file_id: fileId, dst_actions: SKIN_CONCERNS, miniserver_args: { enable_mask_overlay: false }, format: 'json' };
    case 'skin-tone-analysis':
      return { src_file_id: fileId };
    case 'skin-simulation': {
      const body = { src_file_id: fileId };
      for (const key of SIMULATION_KEYS) {
        const v = Number(params[key]);
        if (v > 0) body[key] = Math.round(clamp(v, 0, 1) * 100) / 100;
      }
      if (Object.keys(body).length === 1) throw new TaskInputError('Choose at least one concern to simulate');
      return body;
    }
    case 'makeup-vto':
      return { src_file_id: fileId, effects: makeupEffects(params.look), version: '1.0' };
    default:
      throw new TaskInputError(`Unknown task ${kind}`);
  }
}

export function isKnownTask(kind) {
  return Object.hasOwn(UNIT_COST, kind);
}

// Normalize the different result shapes into what the app needs.
export function normalizeResult(kind, data) {
  const status = data?.task_status;
  if (status === 'error') return { status: 'error', error: data?.error || data?.failure_reason || 'The analysis failed' };
  if (status !== 'success') return { status: 'running' };
  const results = data.results ?? {};
  switch (kind) {
    case 'skin-analysis': {
      const output = Array.isArray(results.output) ? results.output : [];
      return {
        status: 'success',
        scores: output
          .filter((o) => typeof o?.type === 'string' && Number.isFinite(o.ui_score))
          .map((o) => ({ concern: o.type, score: o.ui_score, raw: o.raw_score, mask: o.mask_urls?.[0] ?? null })),
      };
    }
    case 'skin-tone-analysis': {
      const color = results.color ?? results;
      return {
        status: 'success',
        tone: {
          skin: color.skin_color ?? null,
          lip: color.lip_color ?? null,
          eye: color.eye_color_name ?? null,
          hair: color.hair_color_name ?? null,
        },
      };
    }
    case 'skin-simulation':
    case 'makeup-vto': {
      const url = results.url ?? (Array.isArray(results) ? results[0]?.url : null) ?? data.url ?? null;
      return url ? { status: 'success', image: url } : { status: 'error', error: 'No image returned' };
    }
    default:
      return { status: 'error', error: 'Unknown task' };
  }
}

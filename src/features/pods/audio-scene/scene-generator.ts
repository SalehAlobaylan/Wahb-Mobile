/** Version 1 is immutable. Keep the web copy and contract golden fixtures in sync. */
export const SCENE_VERSION = 1;
export const SCENE_FAMILIES = ['dawn', 'lagoon', 'orbit', 'ribbon'] as const;
export type SceneFamily = (typeof SCENE_FAMILIES)[number];
export const SCENE_PALETTES = {
  dawn: ['#40213c', '#a4474d', '#e39c56', '#ffe7a4'],
  lagoon: ['#163d3d', '#2c6965', '#729e8c', '#efd2a0'],
  orbit: ['#0d1835', '#192e59', '#405e83', '#d5edff'],
  ribbon: ['#33234e', '#705586', '#b67e92', '#d7e9d4'],
} as const;
export type SceneShape = {
  x: number;
  y: number;
  size: number;
  rotation: number;
  kind: 'disc' | 'ring' | 'band';
  opacity: number;
  periodMs: number;
};
export type SceneRecipe = {
  version: 1;
  seed: string;
  family: SceneFamily;
  motion: 'gentle' | 'restrained';
  shapes: readonly SceneShape[];
};
export type SceneIdentity = {
  id: string;
  parentId?: string;
  profile?: unknown;
};
const cache = new Map<string, SceneRecipe>();

function hash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) {
    result = Math.imul(result ^ value.charCodeAt(i), 16777619) >>> 0;
  }
  return result;
}
function randomStream(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rounded = (value: number) => Math.round(value * 10000) / 10000;

/** Decoration is optional: invalid profiles never invalidate playable media. */
export function validSceneProfile(value: unknown): {
  seed: string;
  family: SceneFamily;
  motion: 'gentle' | 'restrained';
} | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const p = value as Record<string, unknown>;
  try {
    const serialized = JSON.stringify(p);
    let bytes = 0;
    for (const char of serialized) {
      const code = char.codePointAt(0)!;
      bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
      if (bytes > 512) return null;
    }
  } catch {
    return null;
  }
  if (
    p.schema_version !== 1 ||
    p.generator_version !== 1 ||
    typeof p.seed !== 'string' ||
    !/^[0-9a-f]{8}$/.test(p.seed) ||
    !SCENE_FAMILIES.includes(p.family as SceneFamily) ||
    (p.motion !== 'gentle' && p.motion !== 'restrained')
  )
    return null;
  return { seed: p.seed, family: p.family as SceneFamily, motion: p.motion };
}

export function sceneRecipe({
  id,
  parentId,
  profile,
}: SceneIdentity): SceneRecipe {
  const approved = validSceneProfile(profile);
  const identity = id.trim().toLowerCase();
  const parent = parentId?.trim().toLowerCase() || identity;
  const seed =
    approved?.seed ??
    hash(`wahb:audio:v1:${identity}`).toString(16).padStart(8, '0');
  const family =
    approved?.family ?? SCENE_FAMILIES[hash(`wahb:palette:v1:${parent}`) % 4]!;
  const motion = approved?.motion ?? 'gentle';
  const key = `${seed}:${family}:${motion}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const random = randomStream(hash(`wahb:geometry:v1:${seed}`));
  const shapes = Array.from({ length: 4 }, (_, i): SceneShape => ({
    x: rounded(i % 2 ? 0.72 + random() * 0.25 : -0.15 + random() * 0.42),
    y: rounded(i < 2 ? -0.1 + random() * 0.28 : 0.7 + random() * 0.25),
    size: rounded(0.36 + random() * 0.42),
    rotation: rounded(random() * 70 - 35),
    kind: family === 'ribbon' ? 'band' : i % 2 ? 'ring' : 'disc',
    opacity: rounded(i === 0 ? 0.7 : 0.16 + random() * 0.24),
    periodMs: Math.round(12000 + random() * 12000),
  }));
  const recipe: SceneRecipe = Object.freeze({
    version: 1,
    seed,
    family,
    motion,
    shapes: Object.freeze(shapes.map((shape) => Object.freeze(shape))),
  });
  if (cache.size >= 64) cache.delete(cache.keys().next().value!);
  cache.set(key, recipe);
  return recipe;
}

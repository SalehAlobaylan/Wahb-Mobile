import { describe, expect, it } from '@jest/globals';
import fixtures from './scene-fixtures.json';
import { sceneRecipe, validSceneProfile } from './scene-generator';
import { sceneCanAnimate, type SceneMotionInput } from './scene-motion-policy';

describe('audio scene contract', () => {
  it('bounds optional profiles by UTF-8 bytes rather than character count', () => {
    expect(
      validSceneProfile({
        schema_version: 1,
        generator_version: 1,
        seed: '7d6a41b2',
        family: 'dawn',
        motion: 'gentle',
        note: '界'.repeat(160),
      }),
    ).toBeNull();
  });
  it.each(fixtures)(
    'preserves the v1 golden recipe $recipe.seed / $recipe.family',
    ({ input, recipe }) => {
      expect(sceneRecipe(input)).toEqual(recipe);
    },
  );
  it('retains family inheritance while giving siblings different geometry', () => {
    const first = sceneRecipe({ id: 'a', parentId: 'parent' });
    const second = sceneRecipe({ id: 'b', parentId: 'parent' });
    expect(first.family).toBe(second.family);
    expect(first.shapes).not.toEqual(second.shapes);
    for (let i = 0; i < 100; i++) sceneRecipe({ id: String(i) });
    expect(sceneRecipe({ id: 'a', parentId: 'parent' })).toEqual(first);
  });
  it.each([
    null,
    [],
    {},
    { schema_version: 2 },
    {
      schema_version: 1,
      generator_version: 1,
      seed: 'not hex',
      family: 'dawn',
      motion: 'gentle',
    },
  ])('falls back for invalid decoration %j', (profile) => {
    expect(validSceneProfile(profile)).toBeNull();
    expect(sceneRecipe({ id: 'a', profile })).toEqual(sceneRecipe({ id: 'a' }));
  });
  const playing: SceneMotionInput = {
    selected: true,
    current: true,
    focused: true,
    foreground: true,
    playing: true,
    buffering: false,
    reducedMotion: false,
    lowPowerMode: false,
    memoryPressure: false,
    interacting: false,
    covered: false,
  };
  it('animates only one focused, unconstrained playing surface', () => {
    expect(sceneCanAnimate(playing)).toBe(true);
    for (const key of Object.keys(playing) as (keyof SceneMotionInput)[]) {
      expect(sceneCanAnimate({ ...playing, [key]: !playing[key] })).toBe(false);
    }
  });
});

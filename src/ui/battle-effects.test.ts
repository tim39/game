import { expect, test } from 'vitest';
import { ELEMENTS } from '../core/battle/terms';
import { ASSETS } from '../systems/asset-manifest';
import { ELEMENT_EFFECTS, hitEffect } from './battle-effects';

test('a hit of an element looks like that element, from either side', () => {
  for (const element of ELEMENTS) {
    expect(hitEffect(element, 'party', 'physical')).toBe(ELEMENT_EFFECTS[element]);
    expect(hitEffect(element, 'enemies', 'magical')).toBe(ELEMENT_EFFECTS[element]);
  }
  // The pack has no wind effect, so it's tinted wisps.
  expect(ELEMENT_EFFECTS.wind).toEqual({ key: 'vfx.wind', tint: 0x9be8a4 });
});

test('a plain hit is a slash from the party, claws from an enemy, and a flash for magic', () => {
  expect(hitEffect(undefined, 'party', 'physical')).toEqual({ key: 'vfx.slash' });
  expect(hitEffect(undefined, 'enemies', 'physical')).toEqual({ key: 'vfx.claw' });
  expect(hitEffect(undefined, 'enemies', 'magical')).toBe(ELEMENT_EFFECTS.light);
});

test('every effect is a sprite sheet in the asset manifest', () => {
  for (const { key } of Object.values(ELEMENT_EFFECTS)) {
    expect(ASSETS[key].type).toBe('spritesheet');
  }
});

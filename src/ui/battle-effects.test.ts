import { expect, test } from 'vitest';
import { ELEMENTS } from '../core/battle/terms';
import { ASSETS } from '../systems/asset-manifest';
import {
  AILMENT_EFFECT,
  BATTLE_SOUNDS,
  BUFF_EFFECT,
  ELEMENT_EFFECTS,
  GUARD_EFFECT,
  HEAL_EFFECT,
  SMOKE_EFFECT,
  hitEffect,
  isHeavyHit,
} from './battle-effects';

test('a hit of an element looks like that element, from either side', () => {
  for (const element of ELEMENTS) {
    expect(hitEffect(element, 'party', 'physical')).toBe(ELEMENT_EFFECTS[element]);
    expect(hitEffect(element, 'enemies', 'magical')).toBe(ELEMENT_EFFECTS[element]);
  }
  // The pack has no wind effect, so it's tinted wisps.
  expect(ELEMENT_EFFECTS.wind).toEqual({ key: 'vfx.wind', tint: 0x9be8a4, sound: 'sfx.hit-wind' });
});

test('a plain hit is a slash from the party, claws from an enemy, and a flash for magic', () => {
  expect(hitEffect(undefined, 'party', 'physical')).toEqual({
    key: 'vfx.slash',
    sound: 'sfx.slash',
  });
  expect(hitEffect(undefined, 'enemies', 'physical')).toEqual({
    key: 'vfx.claw',
    sound: 'sfx.hit',
  });
  expect(hitEffect(undefined, 'enemies', 'magical')).toBe(ELEMENT_EFFECTS.light);
});

const EFFECTS = [
  ...Object.values(ELEMENT_EFFECTS),
  hitEffect(undefined, 'party', 'physical'),
  hitEffect(undefined, 'enemies', 'physical'),
  HEAL_EFFECT,
  BUFF_EFFECT,
  AILMENT_EFFECT,
  GUARD_EFFECT,
  SMOKE_EFFECT,
];

test('every effect is a sprite sheet in the asset manifest, and makes a sound there', () => {
  for (const { key, sound } of EFFECTS) {
    expect(ASSETS[key].type).toBe('spritesheet');
    expect(sound).toMatch(/^sfx\./);
    expect(ASSETS[sound].type).toBe('audio');
  }
  for (const sound of Object.values(BATTLE_SOUNDS)) expect(ASSETS[sound].type).toBe('audio');
});

test('each element sounds different, and so do a party member’s blow and an enemy’s', () => {
  const sounds = Object.values(ELEMENT_EFFECTS).map(({ sound }) => sound);
  expect(new Set(sounds).size).toBe(sounds.length);
  expect(hitEffect(undefined, 'party', 'physical').sound).not.toBe(
    hitEffect(undefined, 'enemies', 'physical').sound,
  );
  // Helpful statuses sparkle like healing, but sound like something else.
  expect(BUFF_EFFECT.key).toBe(HEAL_EFFECT.key);
  expect(BUFF_EFFECT.sound).not.toBe(HEAL_EFFECT.sound);
});

test('a hit lands heavily if it is critical, or takes a quarter of its target’s HP', () => {
  expect(isHeavyHit(10, 100, false)).toBe(false);
  expect(isHeavyHit(24, 100, false)).toBe(false);
  expect(isHeavyHit(25, 100, false)).toBe(true);
  expect(isHeavyHit(1, 100, true)).toBe(true);
});

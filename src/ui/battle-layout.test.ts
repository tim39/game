import { describe, expect, test } from 'vitest';
import { MAX_ENEMIES } from '../core/battle/battle';
import { MAX_PARTY_SIZE } from '../core/state';
import {
  BATTLE_HEIGHT,
  BATTLE_LAYOUT,
  BATTLE_WIDTH,
  enemySpots,
  partySpots,
} from './battle-layout';

const { banner, commands, status } = BATTLE_LAYOUT;
const counts = (most: number): number[] => Array.from({ length: most }, (_, index) => index + 1);

describe('the battle layout', () => {
  test('is the screen at 2×', () => {
    expect([BATTLE_WIDTH, BATTLE_HEIGHT]).toEqual([320, 180]);
  });

  test('puts the command window and the status panel side by side where the dialogue box goes', () => {
    expect(commands).toMatchObject({ x: 10, y: 116, height: 58 });
    expect(status.x).toBeGreaterThan(commands.x + commands.width);
    expect(status.x + status.width).toBe(310);
    expect(status).toMatchObject({ y: commands.y, height: commands.height });
  });

  test('stands everyone between the banner and the bottom panels, enemies left and party right', () => {
    // Feet, with room for a 16-pixel fighter above them and a shadow below.
    for (const count of counts(MAX_ENEMIES)) {
      for (const { x, y } of enemySpots(count)) {
        expect(x).toBeGreaterThanOrEqual(24);
        expect(x).toBeLessThanOrEqual(BATTLE_WIDTH / 2);
        expect(y - 16).toBeGreaterThan(banner.y + banner.height);
        expect(y + 2).toBeLessThan(status.y);
      }
    }
    for (const count of counts(MAX_PARTY_SIZE)) {
      for (const { x, y } of partySpots(count)) {
        expect(x - BATTLE_LAYOUT.stepForward).toBeGreaterThan(BATTLE_WIDTH * 0.66);
        expect(x).toBeLessThanOrEqual(BATTLE_WIDTH - 40);
        expect(y - 16).toBeGreaterThan(banner.y + banner.height);
        expect(y + 2).toBeLessThan(status.y);
      }
    }
  });

  test('keeps enemies apart, left to right, and a lone one in the middle', () => {
    expect(enemySpots(1)).toEqual([{ x: 88, y: 92 }]);
    for (const count of counts(MAX_ENEMIES).slice(1)) {
      const spots = enemySpots(count);
      expect(spots).toHaveLength(count);
      spots.slice(1).forEach((spot, index) => {
        expect(spot.x - (spots[index]?.x ?? 0)).toBeGreaterThanOrEqual(20);
      });
    }
  });

  test('stands the party in a column, top to bottom, every other one forward', () => {
    expect(partySpots(1)).toEqual([{ x: 258, y: 86 }]);
    expect(partySpots(2)).toEqual([
      { x: 258, y: 75 },
      { x: 246, y: 97 },
    ]);
    expect(partySpots(3).map(({ y }) => y)).toEqual([65, 86, 107]);
    expect(partySpots(4).map(({ y }) => y)).toEqual([65, 79, 93, 107]);
  });
});

import { describe, expect, test } from 'vitest';
import type { Aftermath, LevelUp } from '../core/battle/aftermath';
import type { GameState } from '../core/state';
import type { Stats } from '../core/stats';
import { VICTORY_LINES, lineText, victoryPages, type VictoryNames } from './victory-pages';

const NAMES: VictoryNames = {
  character: (id) => ({ rowan: 'Rowan', bram: 'Bram' })[id] ?? id,
  skill: (id) => ({ sweep: 'Sweep', focus: 'Focus', provoke: 'Provoke' })[id] ?? id,
  item: (id) => ({ potion: 'Potion', 'eye-drops': 'Eye Drops', ether: 'Ether' })[id] ?? id,
};

/** The game state doesn't matter to the pages. */
const STATE = {} as GameState;

const STATS: Stats = { hp: 100, mp: 20, atk: 20, def: 10, mag: 10, res: 10, spd: 10 };

const levelUp = (changes: Partial<LevelUp> = {}): LevelUp => ({
  id: 'rowan',
  from: 1,
  to: 2,
  before: STATS,
  after: { ...STATS, hp: 109, mp: 22, atk: 22, def: 11, mag: 11, res: 11, spd: 11 },
  skills: [],
  ...changes,
});

const after = (changes: Partial<Aftermath>): Aftermath => ({
  state: STATE,
  rewards: { exp: 12, gold: 8, items: {} },
  levelUps: [],
  ...changes,
});

/** Each page's lines as plain text, wrapped at 40 characters. */
const pagesOf = (aftermath: Aftermath, width = 40): string[][] =>
  victoryPages(aftermath, NAMES, width, (text) => text.length).map((page) =>
    page.lines.map(lineText),
  );

describe('victoryPages', () => {
  test('say what the battle gave: EXP, gold and the items that dropped', () => {
    const items = { potion: 2, 'eye-drops': 1 };
    expect(pagesOf(after({ rewards: { exp: 12, gold: 8, items } }))).toEqual([
      ['Gained 12 EXP.', 'Found 8 gold.', 'Found Potion x2 and Eye Drops.'],
    ]);
  });

  test('leave out what there’s none of, and have no page for a battle that gave nothing', () => {
    expect(pagesOf(after({ rewards: { exp: 5, gold: 0, items: {} } }))).toEqual([
      ['Gained 5 EXP.'],
    ]);
    expect(pagesOf(after({ rewards: { exp: 0, gold: 0, items: {} } }))).toEqual([]);
    expect(pagesOf(after({ rewards: null }))).toEqual([]);
  });

  test('give each level-up a page, with what it raised and the skills learned', () => {
    const pages = victoryPages(
      after({
        levelUps: [
          levelUp({ skills: ['sweep'] }),
          levelUp({ id: 'bram', from: 2, to: 4, after: { ...STATS, hp: 130, def: 14 } }),
        ],
      }),
      NAMES,
      40,
      (text) => text.length,
    );
    expect(pages.map((page) => page.levelUp)).toEqual([false, true, true]);
    expect(pages[1]?.lines).toEqual([
      { text: 'Rowan reached level 2!' },
      {
        gains: [
          { label: 'HP', amount: '+9' },
          { label: 'MP', amount: '+2' },
          { label: 'ATK', amount: '+2' },
          { label: 'DEF', amount: '+1' },
        ],
      },
      {
        gains: [
          { label: 'MAG', amount: '+1' },
          { label: 'RES', amount: '+1' },
          { label: 'SPD', amount: '+1' },
        ],
      },
      { text: 'Learned Sweep!' },
    ]);
    // Only the stats that went up, and no line for skills when none were learned.
    expect(pages[2]?.lines.map(lineText)).toEqual(['Bram reached level 4!', 'HP +30 DEF +4']);
  });

  test('wrap long lines, and go on to another page past the panel’s lines', () => {
    const skills = ['sweep', 'focus', 'provoke'];
    const pages = victoryPages(
      after({ rewards: null, levelUps: [levelUp({ skills })] }),
      NAMES,
      20,
      (text) => text.length,
    );
    expect(pages.map((page) => page.lines.map(lineText))).toEqual([
      ['Rowan reached level', '2!', 'HP +9 MP +2 ATK +2 DEF +1', 'MAG +1 RES +1 SPD +1'],
      ['Learned Sweep, Focus', 'and Provoke!'],
    ]);
    expect(pages.every((page) => page.lines.length <= VICTORY_LINES)).toBe(true);
    // The jingle plays as the level-up starts, not again as it goes on.
    expect(pages.map((page) => page.levelUp)).toEqual([true, false]);
  });
});

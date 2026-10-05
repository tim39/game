import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { CHARACTERS } from '../src/data/characters';
import { ENEMIES } from '../src/data/enemies';
import { ITEMS } from '../src/data/items';
import { SKILLS } from '../src/data/skills';
import { SPEAKERS } from '../src/data/speakers';
import { ASSETS } from '../src/systems/asset-manifest';
import { BATTLE_LAYOUT } from '../src/ui/battle-layout';
import { measureBodyFont, type MeasuredFont } from './font-metrics';
import { checkBattleText, checkText, type TextSources } from './text-checks';

/** Six pixels a character, with every character but curly quotes. */
const FONT: MeasuredFont = {
  width: (text) => text.length * 6,
  has: (char) => !'‘’“”'.includes(char),
};

const NOTHING: TextSources = {
  characters: {},
  skills: {},
  items: {},
  enemies: {},
  speakers: {},
};

test('passes names and descriptions in characters the font has', () => {
  expect(
    checkText(
      {
        characters: { rowan: { name: 'Rowan' } },
        skills: { sweep: { name: 'Sweep', description: "It's a wide swing." } },
        items: { potion: { name: 'Potion', description: 'Restores HP.' } },
        enemies: { wolf: { name: 'Wolf' } },
        speakers: { sign: { name: '' } },
      },
      FONT,
    ),
  ).toEqual([]);
});

test('reports names and descriptions with characters the font lacks', () => {
  expect(
    checkText(
      {
        ...NOTHING,
        skills: { sweep: { name: 'Sweep', description: 'It’s a “wide” swing.' } },
        items: { 'old-key': { name: 'Tamsin’s Key', description: 'Old.' } },
        enemies: { 'tide-wraith': { name: 'Tide “Wraith”' } },
        speakers: { tamsin: { name: 'Tamsin’' } },
      },
      FONT,
    ),
  ).toEqual([
    'Skill sweep: its description, "It’s a “wide” swing.", uses "’", "“", "”", which the font lacks',
    'Item old-key: its name, "Tamsin’s Key", uses "’", which the font lacks',
    'Enemy tide-wraith: its name, "Tide “Wraith”", uses "“", "”", which the font lacks',
    'Speaker tamsin: its name, "Tamsin’", uses "’", which the font lacks',
  ]);
});

// The same check as `npm run validate`, so it also runs with the unit tests.
test('the real names and descriptions are in characters the font has', () => {
  const font = measureBodyFont(
    readFileSync(join(import.meta.dirname, '../public', ASSETS['font.body'].url)),
  );
  expect(
    checkText(
      {
        characters: CHARACTERS,
        skills: SKILLS,
        items: ITEMS,
        enemies: ENEMIES,
        speakers: SPEAKERS,
      },
      font,
    ),
  ).toEqual([]);
});

test('reports names and descriptions too wide for the battle screen', () => {
  const room = { name: 30, listLabel: 48, help: 120 };
  expect(
    checkBattleText(
      {
        characters: { rowan: { name: 'Rowan' }, cassandra: { name: 'Cassandra' } },
        skills: {
          sweep: { name: 'Sweep', description: 'A wide swing.' },
          'flying-dragon-kick': { name: 'Flying Dragon', description: 'Up, up, and down again.' },
        },
        items: {
          potion: {
            name: 'Potion',
            description: 'Restores 50 HP to one ally.',
            kind: 'consumable',
          },
          // Equipment never shows in a battle list.
          'iron-sword': { name: 'Iron Sword of Old', description: 'Heavy.', kind: 'weapon' },
        },
      },
      FONT,
      room,
    ),
  ).toEqual([
    'Character cassandra: its name, "Cassandra", is 54 pixels wide; the battle status panel ' +
      'has room for 30',
    'Skill flying-dragon-kick: its name, "Flying Dragon", is 78 pixels wide; battle lists have ' +
      'room for 48',
    'Skill flying-dragon-kick: its description, "Up, up, and down again.", is 138 pixels wide; ' +
      'the battle help line has room for 120',
    'Item potion: its description, "Restores 50 HP to one ally.", is 162 pixels wide; the ' +
      'battle help line has room for 120',
  ]);
});

test('the real names and descriptions fit the battle screen, measured with the real font', () => {
  const font = measureBodyFont(
    readFileSync(join(import.meta.dirname, '../public', ASSETS['font.body'].url)),
  );
  expect(
    checkBattleText(
      { characters: CHARACTERS, skills: SKILLS, items: ITEMS },
      font,
      BATTLE_LAYOUT.room,
    ),
  ).toEqual([]);
});

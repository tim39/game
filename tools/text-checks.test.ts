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
import { MAPS } from '../src/data/maps';
import { OPTIONS_TEXT } from '../src/data/ui-text';
import { MENU_LAYOUT } from '../src/ui/main-menu-layout';
import { OPTIONS_LAYOUT } from '../src/ui/options-layout';
import { wrapText } from '../src/ui/text-wrap';
import { measureBodyFont, type MeasuredFont } from './font-metrics';
import { checkBattleText, checkMenuText, checkText, type TextSources } from './text-checks';

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
        enemies: {
          'tide-wraith': { name: 'Tide “Wraith”', phases: [{}, { banner: 'It’s angry!' }] },
        },
        speakers: { tamsin: { name: 'Tamsin’' } },
      },
      FONT,
    ),
  ).toEqual([
    'Skill sweep: its description, "It’s a “wide” swing.", uses "’", "“", "”", which the font lacks',
    'Item old-key: its name, "Tamsin’s Key", uses "’", which the font lacks',
    'Enemy tide-wraith: its name, "Tide “Wraith”", uses "“", "”", which the font lacks',
    'Enemy tide-wraith: its banner for phase 2, "It’s angry!", uses "’", which the font lacks',
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
        enemies: {
          kraken: {
            name: 'Kraken',
            phases: [{ banner: 'It rises!' }, {}, { banner: 'The sea itself rises up in a rage!' }],
          },
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
    'Enemy kraken: its banner for phase 3, "The sea itself rises up in a rage!", is 204 pixels ' +
      'wide; the battle banner has room for 120',
  ]);
});

test('the real names and descriptions fit the battle screen, measured with the real font', () => {
  const font = measureBodyFont(
    readFileSync(join(import.meta.dirname, '../public', ASSETS['font.body'].url)),
  );
  expect(
    checkBattleText(
      { characters: CHARACTERS, skills: SKILLS, items: ITEMS, enemies: ENEMIES },
      font,
      BATTLE_LAYOUT.room,
    ),
  ).toEqual([]);
});

test('reports names and descriptions too wide for the main menu', () => {
  const room = { name: 30, listLabel: 60, info: 60, infoLines: 3 };
  expect(
    checkMenuText(
      {
        characters: { rowan: { name: 'Rowan' }, cassandra: { name: 'Cassandra' } },
        skills: { sweep: { name: 'Sweep', description: 'A wide swing.' } },
        // Unlike in battle, equipment shows too: in Items, and on Equip.
        items: {
          potion: { name: 'Potion', description: 'Restores HP to one ally.' },
          'iron-sword': {
            name: 'Iron Sword of Old',
            description: 'Heavier than bronze, and a great deal keener.',
          },
        },
        maps: { saltmere: { name: 'Saltmere' }, cottage: { name: "Fisher's Cottage" } },
      },
      FONT,
      room,
    ),
  ).toEqual([
    'Character cassandra: its name, "Cassandra", is 54 pixels wide; the main menu\'s party rows ' +
      'have room for 30',
    'Item iron-sword: its name, "Iron Sword of Old", is 102 pixels wide; main menu lists have ' +
      'room for 60',
    'Item iron-sword: its description, "Heavier than bronze, and a great deal keener.", takes 6 ' +
      "lines of the main menu's info panel, which holds 3",
    'Map cottage: its name, "Fisher\'s Cottage", is 96 pixels wide; the main menu\'s info panel ' +
      'has room for 60',
  ]);
});

test('the real names, descriptions and places fit the main menu, measured with the real font', () => {
  const font = measureBodyFont(
    readFileSync(join(import.meta.dirname, '../public', ASSETS['font.body'].url)),
  );
  expect(
    checkMenuText({ characters: CHARACTERS, skills: SKILLS, items: ITEMS, maps: MAPS }, font, {
      ...MENU_LAYOUT.room,
      infoLines: MENU_LAYOUT.infoLines,
    }),
  ).toEqual([]);
});

test('the Options screen’s names, values and help fit it, measured with the real font', () => {
  const font = measureBodyFont(
    readFileSync(join(import.meta.dirname, '../public', ASSETS['font.body'].url)),
  );
  const { room } = OPTIONS_LAYOUT;
  const values = [
    ...Object.values(OPTIONS_TEXT.textSpeeds),
    ...Object.values(OPTIONS_TEXT.encounterRates),
    ...[1, 2, 3, 4].map(OPTIONS_TEXT.battleSpeed),
    OPTIONS_TEXT.on,
    OPTIONS_TEXT.off,
  ];
  const tooWide = [
    ...Object.values(OPTIONS_TEXT.rows).filter((label) => font.width(label) > room.label),
    ...values.filter((value) => font.width(value) > room.value),
  ];
  expect(tooWide).toEqual([]);
  const tooLong = Object.values(OPTIONS_TEXT.help).filter(
    (help) => wrapText(help, room.help, (text) => font.width(text)).length > room.helpLines,
  );
  expect(tooLong).toEqual([]);
});

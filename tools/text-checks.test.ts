import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { CHARACTERS } from '../src/data/characters';
import { ITEMS } from '../src/data/items';
import { SKILLS } from '../src/data/skills';
import { SPEAKERS } from '../src/data/speakers';
import { ASSETS } from '../src/systems/asset-manifest';
import { measureBodyFont, type MeasuredFont } from './font-metrics';
import { checkText, type TextSources } from './text-checks';

/** Six pixels a character, with every character but curly quotes. */
const FONT: MeasuredFont = {
  width: (text) => text.length * 6,
  has: (char) => !'‘’“”'.includes(char),
};

const NOTHING: TextSources = { characters: {}, skills: {}, items: {}, speakers: {} };

test('passes names and descriptions in characters the font has', () => {
  expect(
    checkText(
      {
        characters: { rowan: { name: 'Rowan' } },
        skills: { sweep: { name: 'Sweep', description: "It's a wide swing." } },
        items: { potion: { name: 'Potion', description: 'Restores HP.' } },
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
        speakers: { tamsin: { name: 'Tamsin’' } },
      },
      FONT,
    ),
  ).toEqual([
    'Skill sweep: its description, "It’s a “wide” swing.", uses "’", "“", "”", which the font lacks',
    'Item old-key: its name, "Tamsin’s Key", uses "’", which the font lacks',
    'Speaker tamsin: its name, "Tamsin’", uses "’", which the font lacks',
  ]);
});

// The same check as `npm run validate`, so it also runs with the unit tests.
test('the real names and descriptions are in characters the font has', () => {
  const font = measureBodyFont(
    readFileSync(join(import.meta.dirname, '../public', ASSETS['font.body'].url)),
  );
  expect(
    checkText({ characters: CHARACTERS, skills: SKILLS, items: ITEMS, speakers: SPEAKERS }, font),
  ).toEqual([]);
});

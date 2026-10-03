import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { defineEvent } from '../src/core/events';
import type { MapDef } from '../src/core/map/types';
import { EVENTS } from '../src/data/events';
import { MAPS } from '../src/data/maps';
import { SPEAKERS } from '../src/data/speakers';
import { ASSETS, type AssetEntry } from '../src/systems/asset-manifest';
import { checkEvents, type EventSources } from './event-checks';
import { measureBodyFont, type MeasuredFont } from './font-metrics';

/** Every character 4 pixels wide and a 1-pixel gap after each, except the curly apostrophe, which it lacks. */
const FONT: MeasuredFont = {
  width: (text) => Math.max(0, text.length * 5 - 1),
  has: (char) => char !== '’',
};

/** `count` words of 9 letters: 4 fit on a line of 236 pixels (beside a portrait), 5 on 280. */
const words = (count: number): string => Array.from({ length: count }, () => 'abcdefghi').join(' ');

const MANIFEST: Record<string, AssetEntry> = {
  'portrait.ada': { type: 'image', url: 'ada.png' },
  'tiles.grass': { type: 'spritesheet', url: 'grass.png', frameWidth: 16, frameHeight: 16 },
};

const hello = defineEvent(async (ev) => {
  await ev.say('ada', 'Hello.');
});

const map: MapDef = {
  id: 'a',
  name: 'A',
  terrain: '...',
  legend: { '.': 'grass' },
  objects: [
    { type: 'npc', id: 'ada', sprite: 'ada', at: [0, 0], facing: 'down', script: 'hello' },
    { type: 'npc', id: 'bo', sprite: 'bo', at: [1, 0], facing: 'down', script: 'missing' },
    { type: 'prefab', prefab: 'sign', at: [2, 0], script: 'also-missing' },
  ],
};

const check = (overrides: Partial<EventSources>): Promise<string[]> =>
  checkEvents({
    events: { hello },
    speakers: { ada: { name: 'Ada', portrait: 'portrait.ada' } },
    maps: {},
    manifest: MANIFEST,
    font: FONT,
    ...overrides,
  });

test('passes when every script, speaker and portrait exists', async () => {
  expect(await check({ maps: { a: { ...map, objects: map.objects?.slice(0, 1) } } })).toEqual([]);
});

test('reports scripts that maps run but do not exist', async () => {
  expect(await check({ maps: { a: map } })).toEqual([
    "Map a: npc bo runs missing, which isn't an event script",
    "Map a: the sign at (2, 0) runs also-missing, which isn't an event script",
  ]);
});

test('reports portraits that are not images in the manifest', async () => {
  const problems = await check({
    speakers: {
      ada: { name: 'Ada', portrait: 'portrait.ada' },
      bo: { name: 'Bo', portrait: 'portrait.bo' },
      cy: { name: 'Cy', portrait: 'tiles.grass' },
    },
  });
  expect(problems).toEqual([
    "Speaker bo: the portrait portrait.bo isn't an image in the asset manifest",
    "Speaker cy: the portrait tiles.grass isn't an image in the asset manifest",
  ]);
});

test('reports scripts that name speakers who do not exist, or that fail', async () => {
  const problems = await check({
    events: {
      hello,
      stranger: defineEvent(async (ev) => {
        await ev.say('nobody', 'Who said that?');
      }),
      broken: defineEvent(() => Promise.reject(new Error('it broke'))),
    },
  });
  expect(problems).toEqual([
    "Event stranger: there's no speaker called nobody",
    'Event broken: it broke',
  ]);
});

test('reports lines too long for the box, which is narrower beside a portrait', async () => {
  const problems = await check({
    speakers: { ada: { name: 'Ada', portrait: 'portrait.ada' }, sign: { name: '' } },
    events: {
      fits: defineEvent(async (ev) => {
        await ev.say('ada', words(12));
        await ev.say('sign', words(15));
      }),
      long: defineEvent(async (ev) => {
        await ev.say('ada', words(13));
        await ev.say('sign', words(16));
        // The same line again is only reported once.
        await ev.say('ada', words(13));
      }),
    },
  });
  // Two lines that start the same way, each reported.
  const tooLong = 'Event long: "abcdefghi abcdefghi abcdefghi…" needs 4 lines, but the box holds 3';
  expect(problems).toEqual([tooLong, tooLong]);
});

test('reports characters the font lacks', async () => {
  const problems = await check({
    events: {
      curly: defineEvent(async (ev) => {
        await ev.say('ada', 'It’s fine.');
        await ev.choice(['It’s not.', 'Fine.']);
      }),
    },
  });
  expect(problems).toEqual([
    'Event curly: "It’s fine." uses "’", which the font lacks',
    'Event curly: "It’s not." uses "’", which the font lacks',
  ]);
});

test('follows every path through the choices', async () => {
  const problems = await check({
    events: {
      branches: defineEvent(async (ev) => {
        const first = await ev.choice(['One', 'Two', 'Three']);
        if (first === 2) {
          const second = await ev.choice(['Four', 'Five']);
          if (second === 1) await ev.say('nobody', 'Only down here.');
        }
      }),
    },
  });
  expect(problems).toEqual(["Event branches: there's no speaker called nobody"]);
});

test('reports choices with too many or too few options, or ones too wide', async () => {
  const problems = await check({
    events: {
      choices: defineEvent(async (ev) => {
        await ev.choice(['A', 'B', 'C', 'D', 'E']);
        await ev.choice([]);
        await ev.choice(['x'.repeat(28), 'x'.repeat(29), ' ', 'Two\nlines']);
      }),
    },
  });
  expect(problems).toEqual([
    'Event choices: a choice offers 5 options; it can offer 1 to 4',
    'Event choices: a choice offers 0 options; it can offer 1 to 4',
    'Event choices: the choice "xxxxxxxxxxxxxxxxxxxxxxxxxxxxx" is 144 pixels wide; the most is 140',
    'Event choices: a choice offers an empty option',
    'Event choices: the choice "Two\nlines" has a line break',
  ]);
});

test('stops following a script that keeps asking in a loop', async () => {
  const problems = await check({
    events: {
      again: defineEvent(async (ev) => {
        while ((await ev.choice(['Again', 'Done'])) === 0) await ev.say('ada', 'Again!');
      }),
    },
  });
  expect(problems).toEqual([]);
});

// The same check as `npm run validate`, so it also runs with the unit tests.
test('the real event scripts, speakers and maps check out', async () => {
  const problems = await checkEvents({
    events: EVENTS,
    speakers: SPEAKERS,
    maps: MAPS,
    manifest: ASSETS,
    font: measureBodyFont(
      readFileSync(join(import.meta.dirname, '../public', ASSETS['font.body'].url)),
    ),
  });
  expect(problems).toEqual([]);
});

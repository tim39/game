import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import type { ChestText } from '../src/core/chest';
import { defineEvent } from '../src/core/events';
import type { MapDef } from '../src/core/map/types';
import { BACKDROPS } from '../src/data/backdrops';
import { CHARACTERS } from '../src/data/characters';
import { ENEMIES } from '../src/data/enemies';
import { EVENTS } from '../src/data/events';
import { ITEMS } from '../src/data/items';
import { MAPS } from '../src/data/maps';
import { SHOPS } from '../src/data/shops';
import { SPEAKERS } from '../src/data/speakers';
import { STORY } from '../src/data/story';
import { CHEST_TEXT } from '../src/data/ui-text';
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
  'bgm.town': { type: 'audio', urls: ['town.ogg', 'town.m4a'] },
  'sfx.ding': { type: 'audio', urls: ['ding.ogg', 'ding.m4a'] },
};

const hello = defineEvent(async (ev) => {
  await ev.say('ada', 'Hello.');
});

/** Chests that say what's inside, beside a portrait: there's no sign speaker in these tests. */
const CHEST_TEXT_ADA: ChestText = {
  speaker: 'ada',
  found: (contents) => {
    if ('gold' in contents) return `Found ${contents.gold} gold!`;
    if (contents.item === 'nothing') throw new Error("There's no item called nothing");
    return `Found ${contents.item}!`;
  },
  empty: 'Empty.',
};

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

const sources = (overrides: Partial<EventSources>): EventSources => ({
  events: { hello },
  speakers: { ada: { name: 'Ada', portrait: 'portrait.ada' } },
  maps: {},
  characters: { rowan: {}, bram: {} },
  items: { potion: { name: 'Potion' }, 'old-key': { name: 'Old Key' } },
  shops: { market: {} },
  enemies: { wolf: {}, kraken: { boss: true } },
  backdrops: { meadow: {} },
  manifest: MANIFEST,
  font: FONT,
  chestText: CHEST_TEXT_ADA,
  story: [{ flag: 'story.dawn' }],
  ...overrides,
});

const check = async (overrides: Partial<EventSources>): Promise<string[]> =>
  (await checkEvents(sources(overrides))).problems;

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

test('follows both ways a flag can be, but remembers what the script set itself', async () => {
  const problems = await check({
    events: {
      either: defineEvent(async (ev) => {
        if (ev.flag('test.beacon-out')) await ev.say('nobody', 'Only once the Beacon is out.');
      }),
      remembers: defineEvent(async (ev) => {
        ev.setFlag('test.told');
        if (!ev.flag('test.told')) await ev.say('nobody', 'Never said.');
        // Reading it again gives the same answer.
        if (ev.flag('test.other') !== ev.flag('test.other')) await ev.say('nobody', 'Never.');
      }),
    },
  });
  expect(problems).toEqual(["Event either: there's no speaker called nobody"]);
});

test('follows both ways the party can have an item or gold, so a checked take works', async () => {
  const problems = await check({
    events: {
      careful: defineEvent(async (ev) => {
        if (ev.hasItem('old-key')) {
          ev.takeItem('old-key');
          await ev.say('nobody', 'Only with the key.');
        }
        if (ev.gold() >= 10) ev.takeGold(10);
      }),
      careless: defineEvent((ev) => {
        ev.takeItem('old-key');
        return Promise.resolve();
      }),
      broke: defineEvent((ev) => {
        ev.takeGold(5);
        return Promise.resolve();
      }),
    },
  });
  expect(problems).toEqual([
    "Event careful: there's no speaker called nobody",
    "Event careless: Can't remove 1 old-key: the party has 0",
    "Event broke: Can't remove 5 gold: the party has 0",
  ]);
});

test('reports items that scripts check for, give or take but do not exist', async () => {
  const problems = await check({
    events: {
      pockets: defineEvent(async (ev) => {
        if (ev.hasItem('pebble')) ev.takeItem('pebble');
        ev.giveItem('potion');
        ev.giveItem('shell', 2);
        await ev.say('ada', 'Hello.');
      }),
    },
  });
  expect(problems).toEqual([
    "Event pockets: it checks for pebble, which isn't an item",
    "Event pockets: it gives shell, which isn't an item",
    "Event pockets: it takes pebble, which isn't an item",
  ]);
});

test('reports scripts that add someone to the party who is not a character', async () => {
  const problems = await check({
    events: {
      recruit: defineEvent((ev) => {
        ev.joinParty('bram');
        ev.joinParty('vesh');
        return Promise.resolve();
      }),
    },
  });
  expect(problems).toEqual(["Event recruit: it adds vesh to the party, which isn't a character"]);
});

test('checks the people a script moves, turns and sees off are on each map that runs it', async () => {
  const runner = (id: string, objects: MapDef['objects']): MapDef => ({ ...map, id, objects });
  const ada = { type: 'npc', id: 'ada', sprite: 'ada', at: [0, 0], facing: 'down' } as const;
  const problems = await check({
    maps: {
      a: runner('a', [{ ...ada, script: 'stroll' }]),
      b: runner('b', [{ type: 'enter', script: 'stroll' }]),
    },
    events: {
      hello,
      stroll: defineEvent(async (ev) => {
        await ev.move('ada', ['left', 'up']);
        await ev.face('player', 'ada');
        await ev.face('ada', 'down');
        await ev.move('player', ['north' as 'up']);
        await ev.leave('ada');
        await ev.face('ada', 'up');
        await ev.leave('player');
      }),
    },
  });
  expect(problems).toEqual([
    'Event stroll: it moves player "north", which isn\'t a way',
    'Event stroll: it turns ada, who has left',
    'Event stroll: it has the player leave, which only NPCs can; teleport them',
    "Event stroll: it moves ada, but there's no one called that on b",
    "Event stroll: it turns someone to face ada, but there's no one called that on b",
    "Event stroll: it turns ada, but there's no one called that on b",
    "Event stroll: it sees off ada, but there's no one called that on b",
  ]);
});

test('checks teleports go to spawns that exist, and who is about on the map after one', async () => {
  const problems = await check({
    maps: {
      a: {
        ...map,
        objects: [
          { type: 'spawn', id: 'door', at: [0, 0], facing: 'down' },
          { type: 'npc', id: 'ada', sprite: 'ada', at: [1, 0], facing: 'down', script: 'trip' },
        ],
      },
      b: { ...map, id: 'b', objects: [{ type: 'spawn', id: 'gate', at: [0, 0], facing: 'up' }] },
    },
    events: {
      trip: defineEvent(async (ev) => {
        await ev.face('ada', 'player');
        await ev.leave('ada');
        await ev.teleport('b', 'gate');
        await ev.face('ada', 'player');
        await ev.teleport('b', 'nowhere');
        await ev.teleport('c', 'gate');
      }),
    },
  });
  expect(problems).toEqual([
    "Event trip: it turns ada, but there's no one called that on b",
    "Event trip: it teleports to spawn nowhere on b, which isn't there",
    "Event trip: it teleports to spawn gate on c, which isn't there",
  ]);
});

test('reports where the scripts each map runs can take the player', async () => {
  const room = (id: string, objects: MapDef['objects']): MapDef => ({ ...map, id, objects });
  const gate = { type: 'spawn', id: 'gate', at: [0, 0], facing: 'up' } as const;
  const { teleports } = await checkEvents(
    sources({
      maps: {
        a: room('a', [gate, { type: 'enter', script: 'tour' }]),
        b: room('b', [gate, { type: 'touch', at: [1, 0], script: 'home' }]),
        c: room('c', [gate]),
        d: room('d', [gate]),
      },
      events: {
        // From a, to b if a flag is set, then on to c; or to d, but not to anywhere that isn't.
        tour: defineEvent(async (ev) => {
          if (ev.flag('test.left')) {
            await ev.teleport('b', 'gate');
            await ev.teleport('c', 'gate');
          } else await ev.teleport('d', 'gate');
          await ev.teleport('e', 'gate');
        }),
        home: defineEvent(async (ev) => {
          await ev.teleport('a', 'gate');
        }),
        // Nothing runs this one.
        lost: defineEvent(async (ev) => {
          await ev.teleport('c', 'gate');
        }),
      },
    }),
  );
  expect(teleports).toEqual(
    new Map([
      ['a', new Set(['d', 'b'])],
      ['b', new Set(['c', 'a'])],
    ]),
  );
});

test('checks waits and fades take a real length of time', async () => {
  const problems = await check({
    events: {
      timing: defineEvent(async (ev) => {
        await ev.wait(500);
        await ev.fadeOut();
        await ev.wait(-1);
        await ev.fadeIn(Number.NaN);
      }),
    },
  });
  expect(problems).toEqual([
    "Event timing: it would wait for -1 ms, which isn't a length of time",
    "Event timing: it would fade in for NaN ms, which isn't a length of time",
  ]);
});

test('reports music and sound effects that are not in the manifest', async () => {
  const problems = await check({
    events: {
      fine: defineEvent((ev) => {
        ev.bgm('bgm.town');
        ev.sfx('sfx.ding');
        ev.bgm(null);
        return Promise.resolve();
      }),
      off: defineEvent((ev) => {
        ev.bgm('bgm.nowhere');
        ev.bgm('sfx.ding');
        ev.sfx('sfx.thud');
        ev.sfx('tiles.grass');
        return Promise.resolve();
      }),
    },
  });
  expect(problems).toEqual([
    "Event off: it plays bgm.nowhere, which isn't music in the asset manifest",
    "Event off: it plays sfx.ding, which isn't music in the asset manifest",
    "Event off: it plays sfx.thud, which isn't a sound effect in the asset manifest",
    "Event off: it plays tiles.grass, which isn't a sound effect in the asset manifest",
  ]);
});

test('reports shops that do not exist, and jingles that are not sound effects', async () => {
  const problems = await check({
    events: {
      fine: defineEvent(async (ev) => {
        await ev.shop('market');
        await ev.jingle('sfx.ding');
      }),
      off: defineEvent(async (ev) => {
        await ev.shop('bazaar');
        await ev.jingle('bgm.town');
      }),
    },
  });
  expect(problems).toEqual([
    "Event off: it opens the shop bazaar, which isn't a shop",
    "Event off: it plays bgm.town, which isn't a sound effect in the asset manifest",
  ]);
});

test('follows a battle either way it can end, and checks who it is against and where', async () => {
  const problems = await check({
    events: {
      hunt: defineEvent(async (ev) => {
        if ((await ev.battle(['wolf', 'wolf'], 'meadow')) === 'fled') {
          await ev.say('nobody', 'Only after getting away.');
        }
      }),
      // Nobody gets away from a boss, so this line is never said.
      lair: defineEvent(async (ev) => {
        if ((await ev.battle(['kraken'], 'meadow')) === 'fled') await ev.say('nobody', 'Never.');
      }),
      wrong: defineEvent(async (ev) => {
        await ev.battle(['wolf', 'bear'], 'cave');
        await ev.battle([], 'meadow');
        await ev.battle(Array<string>(7).fill('wolf'), 'meadow');
      }),
    },
  });
  expect(problems).toEqual([
    "Event hunt: there's no speaker called nobody",
    "Event wrong: it fights bear, which isn't an enemy",
    "Event wrong: it fights in front of cave, which isn't a backdrop",
    'Event wrong: it fights 0 enemies; a battle has 1 to 6',
    'Event wrong: it fights 7 enemies; a battle has 1 to 6',
  ]);
});

test('reports scripts that triggers run but do not exist', async () => {
  const problems = await check({
    maps: {
      a: {
        ...map,
        objects: [
          { type: 'touch', at: [0, 0], script: 'gone' },
          { type: 'enter', script: 'gone-too' },
          { type: 'auto', script: 'gone-as-well', when: 'story.x' },
        ],
      },
    },
  });
  expect(problems).toEqual([
    "Map a: the touch at (0, 0) runs gone, which isn't an event script",
    "Map a: its enter trigger runs gone-too, which isn't an event script",
    "Map a: its auto trigger runs gone-as-well, which isn't an event script",
  ]);
});

test('runs every chest, which must say what it holds in a line that fits', async () => {
  const chests: MapDef = {
    ...map,
    objects: [
      { type: 'chest', at: [0, 0], flag: 'chest.a-01', item: 'potion' },
      { type: 'chest', at: [1, 0], flag: 'chest.a-02', gold: 5 },
      { type: 'chest', at: [2, 0], flag: 'chest.a-03', item: 'nothing' },
    ],
  };
  expect(await check({ maps: { a: chests } })).toEqual([
    "Map a: the chest at (2, 0): There's no item called nothing",
  ]);

  // Its words are measured like any line: here, beside a portrait.
  const wordy: ChestText = { ...CHEST_TEXT_ADA, empty: words(13) };
  const tooLong = '"abcdefghi abcdefghi abcdefghi…" needs 4 lines, but the box holds 3';
  expect(await check({ maps: { a: chests }, chestText: wordy })).toEqual([
    `Map a: the chest at (0, 0): ${tooLong}`,
    `Map a: the chest at (1, 0): ${tooLong}`,
    "Map a: the chest at (2, 0): There's no item called nothing",
    `Map a: the chest at (2, 0): ${tooLong}`,
  ]);
});

test('a script only reads and sets story flags that are the story’s points', async () => {
  const story = defineEvent(async (ev) => {
    if (ev.flag('story.dawn') && !ev.flag('story.dusk')) ev.setFlag('story.noon');
    ev.setFlag('errand.milk');
    await ev.say('ada', 'Hello.');
  });
  expect(await check({ events: { story } })).toEqual([
    "Event story: it reads story.dusk, which isn't one of the story's points",
    "Event story: it sets story.noon, which isn't one of the story's points",
  ]);
});

// The same check as `npm run validate`, so it also runs with the unit tests.
test('the real event scripts, speakers and maps check out', async () => {
  const { problems } = await checkEvents({
    events: EVENTS,
    speakers: SPEAKERS,
    maps: MAPS,
    characters: CHARACTERS,
    items: ITEMS,
    shops: SHOPS,
    enemies: ENEMIES,
    backdrops: BACKDROPS,
    manifest: ASSETS,
    font: measureBodyFont(
      readFileSync(join(import.meta.dirname, '../public', ASSETS['font.body'].url)),
    ),
    chestText: CHEST_TEXT,
    story: STORY,
  });
  expect(problems).toEqual([]);
});

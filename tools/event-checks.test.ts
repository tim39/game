import { expect, test } from 'vitest';
import { defineEvent } from '../src/core/events';
import type { MapDef } from '../src/core/map/types';
import { EVENTS } from '../src/data/events';
import { MAPS } from '../src/data/maps';
import { SPEAKERS } from '../src/data/speakers';
import { ASSETS, type AssetEntry } from '../src/systems/asset-manifest';
import { checkEvents, type EventSources } from './event-checks';

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

// The same check as `npm run validate`, so it also runs with the unit tests.
test('the real event scripts, speakers and maps check out', async () => {
  const problems = await checkEvents({
    events: EVENTS,
    speakers: SPEAKERS,
    maps: MAPS,
    manifest: ASSETS,
  });
  expect(problems).toEqual([]);
});

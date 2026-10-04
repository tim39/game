// `npm run validate`: checks the game's content against its schemas, the files on disk and itself,
// and exits non-zero on any problem (see Content data in docs/TECH.md).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXP_CURVE } from '../src/data/balance';
import { CHARACTERS } from '../src/data/characters';
import { ENEMIES } from '../src/data/enemies';
import { EVENTS } from '../src/data/events';
import { ITEMS } from '../src/data/items';
import { MAPS } from '../src/data/maps';
import { NEW_GAME } from '../src/data/new-game';
import { SKILLS } from '../src/data/skills';
import { SPEAKERS } from '../src/data/speakers';
import { MAP_CONTENT, PREFABS, TERRAINS } from '../src/data/terrain';
import { CHEST_TEXT } from '../src/data/ui-text';
import { ASSETS } from '../src/systems/asset-manifest';
import { checkAssets, pngSize } from './asset-checks';
import { checkCharacters, checkContent, checkNewGame } from './content-checks';
import { checkEvents } from './event-checks';
import { measureBodyFont } from './font-metrics';
import { checkMapNames, checkMaps, checkReachable } from './map-checks';
import { checkText } from './text-checks';

const ROOT = join(import.meta.dirname, '..');
const PUBLIC = join(ROOT, 'public');

function fail(problems: readonly string[], ...notes: string[]): never {
  console.error(`Validation failed:\n${problems.map((problem) => `  ${problem}`).join('\n')}`);
  for (const note of notes) console.error(note);
  process.exit(1);
}

const assetProblems = checkAssets({
  manifest: ASSETS,
  publicDir: PUBLIC,
  credits: readFileSync(join(ROOT, 'CREDITS.md'), 'utf8'),
});

// The schemas come first: the checks after them take the content's shape on trust.
const content = {
  characters: CHARACTERS,
  skills: SKILLS,
  items: ITEMS,
  enemies: ENEMIES,
  speakers: SPEAKERS,
  terrains: TERRAINS,
  prefabs: PREFABS,
  maps: MAPS,
  events: EVENTS,
  newGame: NEW_GAME,
};
const shapeProblems = checkContent(content);
if (shapeProblems.length > 0) {
  fail(
    [...assetProblems, ...shapeProblems],
    'The rest of the checks run once all the content matches its schemas.',
  );
}

const font = measureBodyFont(readFileSync(join(PUBLIC, ASSETS['font.body'].url)));
const events = await checkEvents({
  events: EVENTS,
  speakers: SPEAKERS,
  maps: MAPS,
  characters: CHARACTERS,
  items: ITEMS,
  manifest: ASSETS,
  font,
  chestText: CHEST_TEXT,
});
const problems = [
  ...assetProblems,
  ...checkMaps({
    maps: MAPS,
    content: MAP_CONTENT,
    manifest: ASSETS,
    imageSize: (url) => {
      try {
        return pngSize(readFileSync(join(PUBLIC, url)));
      } catch {
        return undefined;
      }
    },
  }),
  ...events.problems,
  ...checkMapNames(MAPS, font),
  ...checkNewGame({
    newGame: NEW_GAME,
    maps: MAPS,
    content: MAP_CONTENT,
    characters: CHARACTERS,
    items: ITEMS,
  }),
  ...checkReachable({ maps: MAPS, start: NEW_GAME.location.map, teleports: events.teleports }),
  ...checkCharacters({
    characters: CHARACTERS,
    skills: SKILLS,
    items: ITEMS,
    maxLevel: EXP_CURVE.maxLevel,
  }),
  ...checkText(
    { characters: CHARACTERS, skills: SKILLS, items: ITEMS, enemies: ENEMIES, speakers: SPEAKERS },
    font,
  ),
];
if (problems.length > 0) fail(problems);

/** `count` of something: `1 map`, `10 maps`. */
const some = (count: number, one: string, many = `${one}s`): string =>
  `${count} ${count === 1 ? one : many}`;
const size = (collection: object): number => Object.keys(collection).length;
const maps = size(MAPS);
const chests = Object.values(MAPS).flatMap((map) =>
  (map.objects ?? []).filter((object) => object.type === 'chest'),
).length;
console.log(
  `Content: ${some(size(CHARACTERS), 'character')}, ${some(size(SKILLS), 'skill')}, ` +
    `${some(size(ITEMS), 'item')}, ${some(size(ENEMIES), 'enemy', 'enemies')}, ` +
    `${some(size(SPEAKERS), 'speaker')}, ` +
    `${some(size(TERRAINS), 'terrain')}, ${some(size(PREFABS), 'prefab')}, ` +
    `${some(maps, 'map')}, ${some(size(EVENTS), 'event script')} and the new game all match ` +
    'their schemas.',
);
console.log(
  `Assets: all ${size(ASSETS)} manifest keys point at real files, and every file is credited.`,
);
console.log(
  `Maps: ${maps === 1 ? 'the 1 map compiles' : `all ${maps} maps compile`}, and every tile ` +
    'their terrains and prefabs use exists; every way out leads somewhere; their music exists; ' +
    'no two chests share a flag; their names fit the save menu; and every map but the test maps ' +
    `can be reached from ${NEW_GAME.location.map}, where a new game starts.`,
);
console.log(
  `Events: all ${size(EVENTS)} event scripts and ${some(chests, 'chest')} run down every path ` +
    'through their choices and flags; every script, speaker, portrait, person, spawn, item, ' +
    'character, music and sound they or the maps name exists; and every line and choice fits ' +
    'its box, in characters the font has.',
);
console.log(
  'New game: it starts on a cell the player can stand on, with characters and items that exist.',
);
console.log(
  'Party: everyone starts in gear that exists and that they can equip, and learns skills that ' +
    'exist, at levels there are. Every name and description is in characters the font has.',
);

// `npm run validate`: checks the game's content against its schemas, the files on disk and itself,
// and exits non-zero on any problem (see Content data in docs/TECH.md).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BACKDROPS } from '../src/data/backdrops';
import { AREAS, EXP_CURVE } from '../src/data/balance';
import { CHARACTERS } from '../src/data/characters';
import { ENCOUNTERS } from '../src/data/encounters';
import { ENEMIES } from '../src/data/enemies';
import { EVENTS } from '../src/data/events';
import { ITEMS } from '../src/data/items';
import { MAPS } from '../src/data/maps';
import { NEW_GAME } from '../src/data/new-game';
import { SHOPS } from '../src/data/shops';
import { SKILLS } from '../src/data/skills';
import { SPEAKERS } from '../src/data/speakers';
import { STORY } from '../src/data/story';
import { MAP_CONTENT, PREFABS, TERRAINS } from '../src/data/terrain';
import { CHEST_TEXT } from '../src/data/ui-text';
import { ASSETS } from '../src/systems/asset-manifest';
import { BATTLE_LAYOUT } from '../src/ui/battle-layout';
import { MENU_LAYOUT } from '../src/ui/main-menu-layout';
import { checkAssets, pngSize } from './asset-checks';
import {
  checkAreas,
  checkCharacters,
  checkContent,
  checkEncounters,
  checkEnemies,
  checkMapEncounters,
  checkNewGame,
  checkShops,
  checkStory,
} from './content-checks';
import { checkEvents } from './event-checks';
import { measureBodyFont, measureDisplayFont } from './font-metrics';
import {
  checkBackdrops,
  checkMapAreas,
  checkMapNames,
  checkMaps,
  checkReachable,
} from './map-checks';
import { checkBattleText, checkMenuText, checkText } from './text-checks';

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
  encounters: ENCOUNTERS,
  shops: SHOPS,
  speakers: SPEAKERS,
  terrains: TERRAINS,
  prefabs: PREFABS,
  maps: MAPS,
  backdrops: BACKDROPS,
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
const displayFont = measureDisplayFont(readFileSync(join(PUBLIC, ASSETS['font.display'].url)));
const events = await checkEvents({
  events: EVENTS,
  speakers: SPEAKERS,
  maps: MAPS,
  characters: CHARACTERS,
  items: ITEMS,
  shops: SHOPS,
  manifest: ASSETS,
  font,
  chestText: CHEST_TEXT,
  story: STORY,
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
  ...checkBackdrops(BACKDROPS, MAP_CONTENT),
  ...events.problems,
  ...checkMapNames(MAPS, font),
  ...checkMapAreas(MAPS, displayFont),
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
  ...checkEnemies({ enemies: ENEMIES, skills: SKILLS, items: ITEMS, manifest: ASSETS }),
  ...checkEncounters({ encounters: ENCOUNTERS, enemies: ENEMIES }),
  ...checkMapEncounters({ maps: MAPS, encounters: ENCOUNTERS, backdrops: BACKDROPS }),
  ...checkShops({ shops: SHOPS, items: ITEMS }),
  ...checkStory({ story: STORY, maps: MAPS, characters: CHARACTERS }),
  ...checkAreas({
    areas: AREAS,
    characters: CHARACTERS,
    items: ITEMS,
    enemies: ENEMIES,
    encounters: ENCOUNTERS,
    maxLevel: EXP_CURVE.maxLevel,
  }),
  ...checkText(
    { characters: CHARACTERS, skills: SKILLS, items: ITEMS, enemies: ENEMIES, speakers: SPEAKERS },
    font,
  ),
  ...checkBattleText(
    { characters: CHARACTERS, skills: SKILLS, items: ITEMS },
    font,
    BATTLE_LAYOUT.room,
  ),
  ...checkMenuText({ characters: CHARACTERS, skills: SKILLS, items: ITEMS, maps: MAPS }, font, {
    ...MENU_LAYOUT.room,
    infoLines: MENU_LAYOUT.infoLines,
  }),
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
    `${some(size(ENCOUNTERS), 'encounter table')}, ${some(size(SHOPS), 'shop')}, ` +
    `${some(size(SPEAKERS), 'speaker')}, ` +
    `${some(size(TERRAINS), 'terrain')}, ${some(size(PREFABS), 'prefab')}, ` +
    `${some(maps, 'map')}, ${some(size(BACKDROPS), 'backdrop')}, ` +
    `${some(size(EVENTS), 'event script')} and the new game all match ` +
    'their schemas.',
);
console.log(
  `Assets: all ${size(ASSETS)} manifest keys point at real files, and every file is credited.`,
);
console.log(
  `Maps: ${maps === 1 ? 'the 1 map compiles' : `all ${maps} maps compile`}, and every tile ` +
    'their terrains and prefabs use exists; every way out leads somewhere; their music, ' +
    'encounter tables and battle backdrops exist; ' +
    'no two chests share a flag; their names fit the save menu; every area they are part of ' +
    'is a map, and its name fits the area banner; and every map but the test maps ' +
    `can be reached from ${NEW_GAME.location.map}, where a new game starts. Every battle ` +
    'backdrop compiles, and fills the screen.',
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
    'exist, at levels there are.',
);
console.log("Shops: everything they sell exists, and isn't a key item.");
console.log(
  `Story: ${some(STORY.length, 'point')}, each with a story flag of its own; and every story ` +
    'flag a map, a script or a character names is one of them.',
);
console.log(
  'Enemies: each has a sprite to fight as, every skill they use exists, only actions aimed at ' +
    'one fighter pick a target, every item they drop exists, and ' +
    'every enemy an encounter table names exists. The areas the simulator plays name a party, ' +
    'gear, items, an encounter table and a boss that exist, at levels there are. ' +
    'Every name and description is in characters the font has, and fits the battle screen ' +
    'and the main menu.',
);

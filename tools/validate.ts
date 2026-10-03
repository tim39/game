// `npm run validate`: checks the game's content against the files on disk and against itself, and
// exits non-zero on any problem. So far that's the asset manifest, the maps and the event scripts;
// M3 adds schemas and cross-references for the rest of the content (see docs/TECH.md).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVENTS } from '../src/data/events';
import { MAPS } from '../src/data/maps';
import { SPEAKERS } from '../src/data/speakers';
import { MAP_CONTENT } from '../src/data/terrain';
import { ASSETS } from '../src/systems/asset-manifest';
import { checkAssets, pngSize } from './asset-checks';
import { checkEvents } from './event-checks';
import { measureBodyFont } from './font-metrics';
import { checkMaps } from './map-checks';

const ROOT = join(import.meta.dirname, '..');
const PUBLIC = join(ROOT, 'public');

const problems = [
  ...checkAssets({
    manifest: ASSETS,
    publicDir: PUBLIC,
    credits: readFileSync(join(ROOT, 'CREDITS.md'), 'utf8'),
  }),
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
  ...(await checkEvents({
    events: EVENTS,
    speakers: SPEAKERS,
    maps: MAPS,
    manifest: ASSETS,
    font: measureBodyFont(readFileSync(join(PUBLIC, ASSETS['font.body'].url))),
  })),
];

if (problems.length > 0) {
  console.error(`Validation failed:\n${problems.map((problem) => `  ${problem}`).join('\n')}`);
  process.exit(1);
}
const keys = Object.keys(ASSETS).length;
const maps = Object.keys(MAPS).length;
console.log(`Assets: all ${keys} manifest keys point at real files, and every file is credited.`);
console.log(
  `Maps: ${maps === 1 ? 'the 1 map compiles' : `all ${maps} maps compile`}, and every tile ` +
    'their terrains and prefabs use exists; every way out leads somewhere.',
);
console.log(
  `Events: all ${Object.keys(EVENTS).length} event scripts run down every path through their ` +
    'choices; every script, speaker and portrait they or the maps name exists; and every line ' +
    'and choice fits its box, in characters the font has.',
);

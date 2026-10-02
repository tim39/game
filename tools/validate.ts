// `npm run validate`: checks the game's content against the files on disk and against itself, and
// exits non-zero on any problem. So far that's the asset manifest and the maps; M3 adds schemas and
// cross-references for the rest of the content (see docs/TECH.md).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAPS } from '../src/data/maps';
import { MAP_CONTENT } from '../src/data/terrain';
import { ASSETS } from '../src/systems/asset-manifest';
import { checkAssets, pngSize } from './asset-checks';
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

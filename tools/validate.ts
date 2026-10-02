// `npm run validate`: checks the game's content against the files on disk, and exits non-zero on any
// problem. So far that's the asset manifest; M3 adds schemas and cross-references (see docs/TECH.md).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ASSETS } from '../src/systems/asset-manifest';
import { checkAssets } from './asset-checks';

const ROOT = join(import.meta.dirname, '..');

const problems = checkAssets({
  manifest: ASSETS,
  publicDir: join(ROOT, 'public'),
  credits: readFileSync(join(ROOT, 'CREDITS.md'), 'utf8'),
});

if (problems.length > 0) {
  console.error(`Validation failed:\n${problems.map((problem) => `  ${problem}`).join('\n')}`);
  process.exit(1);
}
const keys = Object.keys(ASSETS).length;
console.log(`Assets: all ${keys} manifest keys point at real files, and every file is credited.`);

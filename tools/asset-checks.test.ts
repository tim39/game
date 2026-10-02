import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { ASSETS, type AssetEntry } from '../src/systems/asset-manifest';
import { checkAssets, pngSize } from './asset-checks';

/** The start of a PNG: its signature and IHDR chunk header, which is all the checks read. */
function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  const view = new DataView(bytes.buffer);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  view.setUint32(8, 13);
  bytes.set(new TextEncoder().encode('IHDR'), 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

const image = (url: string): AssetEntry => ({ type: 'image', url });
const sheet = (url: string): AssetEntry => ({
  type: 'spritesheet',
  url,
  frameWidth: 16,
  frameHeight: 16,
});
/** CREDITS.md table rows for these files. */
const creditsFor = (...urls: string[]): string =>
  urls.map((url) => `| \`public/${url}\` | Something | pack/File.png | None |`).join('\n');

describe('checkAssets', () => {
  let publicDir = '';
  beforeEach(() => {
    publicDir = mkdtempSync(join(tmpdir(), 'asset-checks-'));
  });
  afterEach(() => rmSync(publicDir, { recursive: true, force: true }));

  function addFile(url: string, bytes: Uint8Array | string): void {
    const path = join(publicDir, url);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
  }

  const check = (manifest: Record<string, AssetEntry>, credits: string): string[] =>
    checkAssets({ manifest, publicDir, credits });

  test('passes when every key has a credited file and every file has a key', () => {
    addFile('assets/ui/box.png', pngHeader(300, 58));
    addFile('assets/sprites/hero.png', pngHeader(64, 112));
    const manifest = {
      'ui.box': image('assets/ui/box.png'),
      'sprite.hero': sheet('assets/sprites/hero.png'),
    };
    expect(check(manifest, creditsFor('assets/ui/box.png', 'assets/sprites/hero.png'))).toEqual([]);
  });

  test('reports a key whose file is missing', () => {
    const manifest = { 'sprite.hero': sheet('assets/sprites/hero.png') };
    expect(check(manifest, '')).toEqual([
      "sprite.hero: public/assets/sprites/hero.png doesn't exist",
    ]);
  });

  test('reports a file that is not a PNG', () => {
    addFile('assets/ui/box.png', 'GIF89a, not a PNG at all');
    const manifest = { 'ui.box': image('assets/ui/box.png') };
    expect(check(manifest, creditsFor('assets/ui/box.png'))).toEqual([
      "ui.box: public/assets/ui/box.png isn't a PNG",
    ]);
  });

  test('reports a sprite sheet that does not divide into its frames', () => {
    addFile('assets/tiles/floor.png', pngHeader(352, 417));
    const manifest = { 'tiles.floor': sheet('assets/tiles/floor.png') };
    expect(check(manifest, creditsFor('assets/tiles/floor.png'))).toEqual([
      "tiles.floor: public/assets/tiles/floor.png is 352×417, which doesn't divide into 16×16 frames",
    ]);
  });

  test('reports two keys that load the same file', () => {
    addFile('assets/sprites/hero.png', pngHeader(64, 112));
    const manifest = {
      'sprite.hero': sheet('assets/sprites/hero.png'),
      'sprite.villain': sheet('assets/sprites/hero.png'),
    };
    expect(check(manifest, creditsFor('assets/sprites/hero.png'))).toEqual([
      'sprite.villain: assets/sprites/hero.png is already loaded as sprite.hero',
    ]);
  });

  test('reports files that are missing from the manifest or the credits', () => {
    addFile('assets/ui/box.png', pngHeader(300, 58));
    addFile('assets/ui/unused.png', pngHeader(8, 8));
    const manifest = { 'ui.box': image('assets/ui/box.png') };
    expect(check(manifest, creditsFor('assets/ui/unused.png'))).toEqual([
      "public/assets/ui/box.png isn't credited in CREDITS.md",
      "public/assets/ui/unused.png isn't in the asset manifest",
    ]);
  });

  test('reports names that are not kebab-case, and ignores dotfiles', () => {
    addFile('assets/sprites/OldWoman.png', pngHeader(64, 32));
    addFile('assets/sprites/.DS_Store', 'Finder litter');
    const manifest = { 'sprite.tamsin': sheet('assets/sprites/OldWoman.png') };
    expect(check(manifest, creditsFor('assets/sprites/OldWoman.png'))).toEqual([
      'public/assets/sprites/OldWoman.png: use kebab-case names',
    ]);
  });
});

test('pngSize reads the size from a PNG header and rejects anything else', () => {
  expect(pngSize(pngHeader(64, 112))).toEqual({ width: 64, height: 112 });
  expect(pngSize(new TextEncoder().encode('not a png, but long enough to read'))).toBeUndefined();
  expect(pngSize(new Uint8Array(0))).toBeUndefined();
});

// The same check as `npm run validate`, so it also runs with the unit tests.
test('the real asset manifest matches public/ and CREDITS.md', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const credits = readFileSync(join(root, 'CREDITS.md'), 'utf8');
  expect(checkAssets({ manifest: ASSETS, publicDir: join(root, 'public'), credits })).toEqual([]);
});

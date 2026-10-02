import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import type { AssetEntry } from '../src/systems/asset-manifest';

export interface AssetSources {
  /** Logical key → entry, as in src/systems/asset-manifest.ts. */
  readonly manifest: Readonly<Record<string, AssetEntry>>;
  /** The folder entry URLs are relative to: public/. */
  readonly publicDir: string;
  /** The text of CREDITS.md. */
  readonly credits: string;
}

/** A path of kebab-case folders and a kebab-case file name. */
const KEBAB_PATH = /^([a-z0-9]+(-[a-z0-9]+)*\/)*[a-z0-9]+(-[a-z0-9]+)*\.[a-z0-9]+$/;

/**
 * Checks the asset manifest against the files in public/. Returns one line per problem, so an
 * empty list means everything is in order:
 * - every key points at a PNG that exists, and no two keys load the same file;
 * - sprite sheets divide evenly into their frames;
 * - every file in public/assets/ is in the manifest, credited in CREDITS.md, and kebab-case.
 */
export function checkAssets({ manifest, publicDir, credits }: AssetSources): string[] {
  const problems: string[] = [];
  const keyByUrl = new Map<string, string>();

  for (const [key, entry] of Object.entries(manifest)) {
    const sameFile = keyByUrl.get(entry.url);
    if (sameFile) problems.push(`${key}: ${entry.url} is already loaded as ${sameFile}`);
    keyByUrl.set(entry.url, key);

    const path = join(publicDir, entry.url);
    if (!existsSync(path)) {
      problems.push(`${key}: public/${entry.url} doesn't exist`);
      continue;
    }
    const size = pngSize(readFileSync(path));
    if (!size) {
      problems.push(`${key}: public/${entry.url} isn't a PNG`);
    } else if (
      entry.type === 'spritesheet' &&
      (size.width % entry.frameWidth !== 0 || size.height % entry.frameHeight !== 0)
    ) {
      problems.push(
        `${key}: public/${entry.url} is ${size.width}×${size.height}, which doesn't divide ` +
          `into ${entry.frameWidth}×${entry.frameHeight} frames`,
      );
    }
  }

  for (const file of listFiles(join(publicDir, 'assets'))) {
    const url = `assets/${file}`;
    if (!keyByUrl.has(url)) problems.push(`public/${url} isn't in the asset manifest`);
    if (!credits.includes(`\`public/${url}\``)) {
      problems.push(`public/${url} isn't credited in CREDITS.md`);
    }
    if (!KEBAB_PATH.test(file)) problems.push(`public/${url}: use kebab-case names`);
  }

  return problems;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Width and height from a PNG's header, or undefined if the bytes aren't a PNG. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  const isPng =
    bytes.length >= 24 &&
    PNG_SIGNATURE.every((byte, index) => bytes[index] === byte) &&
    new TextDecoder().decode(bytes.subarray(12, 16)) === 'IHDR';
  if (!isPng) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** Every file under `dir`, as /-separated paths relative to it. Skips dotfiles such as .DS_Store. */
function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((path) => path.split(sep).join('/'))
    .filter((path) => !path.split('/').some((part) => part.startsWith('.')))
    .filter((path) => statSync(join(dir, path)).isFile())
    .sort();
}

// Downloads each raw asset pack from this repo's GitHub Releases, checks its SHA-256 and unzips it
// to assets-src/<pack>/ (gitignored). Packs already in place are skipped, so it's safe to re-run.
// Needs curl (which honours HTTPS_PROXY in cloud sessions) and unzip. See "Assets" in docs/TECH.md.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

interface Pack {
  /** Folder under assets-src/ that the pack unzips to. */
  readonly name: string;
  readonly url: string;
  readonly sha256: string;
}

const RELEASES = 'https://github.com/tim39/game/releases/download';

const PACKS: readonly Pack[] = [
  {
    name: 'ninja-adventure',
    url: `${RELEASES}/ninja-adventure/Ninja.Adventure.-.Asset.Pack.zip`,
    sha256: '95a06f4fdcfd1882f061a45ff313b7c905dbe2de1e8512b281d7937df62a7b15',
  },
];

const ASSETS_SRC = join(import.meta.dirname, '..', 'assets-src');
const CURL_FLAGS = ['--fail', '--location', '--silent', '--show-error', '--retry', '3'];

const sha256 = (file: string): string =>
  createHash('sha256').update(readFileSync(file)).digest('hex');

function run(command: string, args: string[]): void {
  try {
    execFileSync(command, args, { stdio: 'inherit' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`${command} isn't installed, and fetch-assets needs it.`, { cause: error });
    }
    throw error;
  }
}

function fetchPack(pack: Pack): void {
  const dir = join(ASSETS_SRC, pack.name);
  const marker = join(dir, '.sha256');
  if (existsSync(marker) && readFileSync(marker, 'utf8').trim() === pack.sha256) {
    console.log(`${pack.name}: already in assets-src/${pack.name}/`);
    return;
  }

  const zip = join(ASSETS_SRC, `${pack.name}.zip`);
  if (!existsSync(zip) || sha256(zip) !== pack.sha256) {
    console.log(`${pack.name}: downloading ${pack.url}`);
    run('curl', [...CURL_FLAGS, '--output', zip, pack.url]);
    const actual = sha256(zip);
    if (actual !== pack.sha256) {
      rmSync(zip);
      throw new Error(
        `${pack.name}: the download's SHA-256 is ${actual}, not ${pack.sha256}. ` +
          'If the owner replaced the release file on purpose, update the hash in ' +
          'tools/fetch-assets.ts and docs/TECH.md; otherwise try again.',
      );
    }
  }

  console.log(`${pack.name}: unzipping`);
  const staging = `${dir}.partial`;
  rmSync(staging, { recursive: true, force: true });
  run('unzip', ['-q', zip, '-d', staging]);
  // Packs usually wrap everything in one top-level folder. Drop it, so paths start at the contents.
  const [first, ...rest] = readdirSync(staging, { withFileTypes: true });
  const contents = first?.isDirectory() && rest.length === 0 ? join(staging, first.name) : staging;
  rmSync(dir, { recursive: true, force: true });
  renameSync(contents, dir);
  rmSync(staging, { recursive: true, force: true });
  writeFileSync(marker, `${pack.sha256}\n`);
  rmSync(zip); // 94 MB, and the unzipped copy is all anything needs
  console.log(`${pack.name}: ready in assets-src/${pack.name}/`);
}

try {
  mkdirSync(ASSETS_SRC, { recursive: true });
  for (const pack of PACKS) fetchPack(pack);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

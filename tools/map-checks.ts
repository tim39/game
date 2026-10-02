import { compileMap } from '../src/core/map/compile';
import type { GridPoint, MapContent, MapDef } from '../src/core/map/types';
import type { AssetEntry } from '../src/systems/asset-manifest';

const TILE = 16;

export interface MapSources {
  readonly maps: Readonly<Record<string, MapDef>>;
  readonly content: MapContent;
  /** Logical key → entry, as in src/systems/asset-manifest.ts. */
  readonly manifest: Readonly<Record<string, AssetEntry>>;
  /** A sheet's size in pixels, or undefined if its file can't be read. */
  readonly imageSize: (url: string) => { width: number; height: number } | undefined;
}

/**
 * Checks the map content against the asset manifest and itself. Returns one line per problem:
 * - every tile a terrain or prefab uses is inside a 16×16 sprite sheet from the manifest;
 * - the terrains and prefabs that terrains refer to exist;
 * - every map compiles.
 */
export function checkMaps({ maps, content, manifest, imageSize }: MapSources): string[] {
  const problems: string[] = [];

  const checkTiles = (owner: string, sheet: string, tiles: readonly GridPoint[]): void => {
    const entry = manifest[sheet];
    if (entry?.type !== 'spritesheet' || entry.frameWidth !== TILE || entry.frameHeight !== TILE) {
      problems.push(`${owner}: ${sheet} isn't a 16×16 sprite sheet in the asset manifest`);
      return;
    }
    const size = imageSize(entry.url);
    if (!size) return; // checkAssets reports unreadable files
    const columns = size.width / TILE;
    const rows = size.height / TILE;
    for (const [col, row] of tiles) {
      if (col < 0 || row < 0 || col >= columns || row >= rows) {
        problems.push(`${owner}: there's no tile at [${col}, ${row}] in ${sheet}`);
      }
    }
  };

  for (const [id, terrain] of Object.entries(content.terrains)) {
    const owner = `Terrain ${id}`;
    switch (terrain.kind) {
      case 'fill':
        checkTiles(
          owner,
          terrain.sheet,
          terrain.tiles.map(([col, row]): GridPoint => [col, row]),
        );
        break;
      case 'blob': {
        const [left, top] = terrain.origin;
        const tiles = terrain.layout.map(([col, row]): GridPoint => [left + col, top + row]);
        checkTiles(owner, terrain.sheet, tiles);
        break;
      }
      case 'trees':
        if (content.terrains[terrain.ground]?.kind !== 'fill') {
          problems.push(`${owner}: its ground, ${terrain.ground}, isn't a fill terrain`);
        }
        for (const prefab of [...terrain.trees, terrain.filler]) {
          if (!content.prefabs[prefab]) problems.push(`${owner}: there's no prefab ${prefab}`);
        }
        break;
    }
  }

  for (const [id, prefab] of Object.entries(content.prefabs)) {
    const [left, top] = prefab.origin;
    const tiles = prefab.layout.flatMap((line, dy) =>
      [...line].flatMap((char, dx): GridPoint[] => (char === ' ' ? [] : [[left + dx, top + dy]])),
    );
    checkTiles(`Prefab ${id}`, prefab.sheet, tiles);
  }

  for (const map of Object.values(maps)) {
    try {
      compileMap(map, content);
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }

  return problems;
}

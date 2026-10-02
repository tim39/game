import { blobLookup, blobMask, type BlobLayout } from './autotile';
import type {
  FillTerrain,
  GridPoint,
  MapContent,
  MapDef,
  PrefabDef,
  TerrainDef,
  TileRef,
  TreesTerrain,
} from './types';

/** Drawn in this order: the ground, things on it (under characters), then things over characters. */
export const LAYERS = ['ground', 'base', 'overhead'] as const;
export type LayerName = (typeof LAYERS)[number];

/** A map ready to draw and walk on. Cell (x, y) is at index y × width + x in every array. */
export interface CompiledMap {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  /** What each layer draws in each cell, or null for nothing. */
  readonly layers: Readonly<Record<LayerName, readonly (TileRef | null)[]>>;
  /** True where characters can't stand. */
  readonly solid: readonly boolean[];
}

/** Can't step into (x, y): it's solid, or off the map. */
export function isBlocked(map: CompiledMap, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return true;
  return map.solid[y * map.width + x] ?? true;
}

/** The terrain rows of a map, without the blank lines and shared indentation around them. */
export function terrainRows(terrain: string): string[] {
  const lines = terrain.split('\n').map((line) => line.trimEnd());
  while (lines[0] === '') lines.shift();
  while (lines.at(-1) === '') lines.pop();
  const indent = Math.min(...lines.map((line) => line.length - line.trimStart().length));
  return lines.map((line) => line.slice(indent));
}

/** A well-mixed number for a cell, so variants look random but never change. */
export function cellHash(x: number, y: number, salt = 0): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(salt, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

const TREE_SALT = 1;
const PREFAB_CHARS = new Set(['#', '.', '^', ' ']);
const lookups = new WeakMap<BlobLayout, ReadonlyMap<number, readonly [number, number]>>();

/** Builds a map's layers and collision from its terrain and objects. Throws if anything doesn't fit. */
export function compileMap(def: MapDef, content: MapContent): CompiledMap {
  function fail(message: string): never {
    throw new Error(`Map ${def.id}: ${message}`);
  }

  const rows = terrainRows(def.terrain);
  const width = rows[0]?.length ?? 0;
  const height = rows.length;
  if (width === 0) fail('its terrain is empty');
  rows.forEach((row, y) => {
    if (row.length !== width) fail(`row ${y} is ${row.length} cells wide, not ${width}`);
  });

  const ids = rows.flatMap((row, y) =>
    [...row].map(
      (char, x) => def.legend[char] ?? fail(`"${char}" at (${x}, ${y}) isn't in its legend`),
    ),
  );
  const idAt = (x: number, y: number): string | undefined =>
    x < 0 || y < 0 || x >= width || y >= height ? undefined : ids[y * width + x];
  const terrainOf = (id: string): TerrainDef =>
    content.terrains[id] ?? fail(`its legend uses "${id}", which isn't a terrain`);
  const prefabOf = (id: string): PrefabDef => content.prefabs[id] ?? fail(`"${id}" isn't a prefab`);

  const layers: Record<LayerName, (TileRef | null)[]> = {
    ground: new Array<TileRef | null>(width * height).fill(null),
    base: new Array<TileRef | null>(width * height).fill(null),
    overhead: new Array<TileRef | null>(width * height).fill(null),
  };
  const solid = new Array<boolean>(width * height).fill(false);

  function fillTile(terrain: FillTerrain, x: number, y: number): TileRef {
    const total = terrain.tiles.reduce((sum, [, , weight = 1]) => sum + weight, 0);
    let pick = cellHash(x, y) % total;
    for (const [col, row, weight = 1] of terrain.tiles) {
      if (pick < weight) return { sheet: terrain.sheet, col, row };
      pick -= weight;
    }
    return fail(`a fill terrain at (${x}, ${y}) has no tiles`);
  }

  /** Draws a prefab with its top-left at `at`. Off-map tiles are an error unless `clip` is set. */
  function stamp(id: string, [left, top]: GridPoint, clip: boolean): void {
    const prefab = prefabOf(id);
    prefab.layout.forEach((line, dy) => {
      [...line].forEach((char, dx) => {
        if (!PREFAB_CHARS.has(char)) fail(`prefab ${id} uses "${char}" in its layout`);
        if (char === ' ') return;
        const x = left + dx;
        const y = top + dy;
        if (idAt(x, y) === undefined) {
          if (clip) return;
          fail(`prefab ${id} at (${left}, ${top}) runs off the map`);
        }
        const index = y * width + x;
        const layer = char === '^' ? layers.overhead : layers.base;
        if (layer[index]) fail(`two prefabs overlap at (${x}, ${y})`);
        const [col, row] = prefab.origin;
        layer[index] = { sheet: prefab.sheet, col: col + dx, row: row + dy };
        if (char === '#') solid[index] = true;
      });
    });
  }

  // The ground, cell by cell.
  ids.forEach((id, index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const terrain = terrainOf(id);
    switch (terrain.kind) {
      case 'fill':
        layers.ground[index] = fillTile(terrain, x, y);
        solid[index] = terrain.solid ?? false;
        break;
      case 'blob': {
        let lookup = lookups.get(terrain.layout);
        if (!lookup) lookups.set(terrain.layout, (lookup = blobLookup(terrain.layout)));
        // Off the map counts as more of the same, so areas run cleanly off the edge.
        const mask = blobMask((dx, dy) => (idAt(x + dx, y + dy) ?? id) === id);
        const tile = lookup.get(mask) ?? fail(`${id} has no tile for its shape at (${x}, ${y})`);
        const [col, row] = terrain.origin;
        layers.ground[index] = { sheet: terrain.sheet, col: col + tile[0], row: row + tile[1] };
        solid[index] = terrain.solid ?? false;
        break;
      }
      case 'trees': {
        const ground = terrainOf(terrain.ground);
        if (ground.kind !== 'fill') fail(`${id} must stand on a fill terrain`);
        layers.ground[index] = fillTile(ground, x, y);
        solid[index] = true;
        break;
      }
    }
  });

  // Trees, row by row: a 2-wide tree for every two cells of a run, a filler for an odd one out.
  const treeAt = (terrain: TreesTerrain, x: number, y: number): string =>
    terrain.trees[cellHash(x, y, TREE_SALT) % terrain.trees.length] ?? fail('trees need a tree');
  for (let y = 0; y < height; y++) {
    let x = 0;
    while (x < width) {
      const id = idAt(x, y) ?? fail(`no terrain at (${x}, ${y})`);
      const terrain = terrainOf(id);
      if (terrain.kind !== 'trees') {
        x++;
        continue;
      }
      let end = x;
      while (idAt(end, y) === id) end++;
      while (x < end) {
        const wide = end - x >= 2 ? 2 : 1;
        const prefab = wide === 2 ? treeAt(terrain, x, y) : terrain.filler;
        const { layout } = prefabOf(prefab);
        if (layout[0]?.length !== wide) fail(`${prefab} must be ${wide} wide to grow in ${id}`);
        stamp(prefab, [x, y - (layout.length - 1)], true);
        x += wide;
      }
    }
  }

  for (const object of def.objects ?? []) stamp(object.prefab, object.at, false);

  return { id: def.id, width, height, layers, solid };
}

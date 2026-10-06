import type { Chest } from '../chest';
import { badConditionTerms, conditionHolds, type Condition } from '../conditions';
import { isDirection, type Direction } from '../direction';
import { PLAYER } from '../events';
import { isId, isNamespacedId } from '../ids';
import type { NpcPlacement } from '../npc';
import type { GameState } from '../state';
import { blobLookup, blobMask, type BlobLayout } from './autotile';
import type {
  FillTerrain,
  GridPoint,
  MapContent,
  MapDef,
  MapEncounters,
  PrefabDef,
  Side,
  TerrainDef,
  TileRef,
  TreesTerrain,
  WarpTarget,
} from './types';

/** Drawn in this order: the ground, things on it (under characters), then things over characters. */
export const LAYERS = ['ground', 'base', 'overhead'] as const;
export type LayerName = (typeof LAYERS)[number];

/** Where arrivals appear on a map. */
export interface Spawn {
  readonly x: number;
  readonly y: number;
  readonly facing: Direction;
}

/** An event script that runs by itself, while its condition holds. */
export interface Trigger {
  readonly script: string;
  readonly when?: Condition;
}

/** A script that stepping onto a cell runs. */
export interface TouchTrigger extends Trigger {
  readonly x: number;
  readonly y: number;
}

/** A chest on the map, by its cell. */
export type ChestPlacement = Chest & { readonly x: number; readonly y: number };

/** A map ready to draw and walk on. Cell (x, y) is at index y × width + x in the per-cell arrays. */
export interface CompiledMap {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  /** What each layer draws in each cell, or null for nothing. */
  readonly layers: Readonly<Record<LayerName, readonly (TileRef | null)[]>>;
  /** True where characters can't stand. */
  readonly solid: readonly boolean[];
  /** Where stepping into each cell leads, if anywhere. */
  readonly warps: readonly (WarpTarget | null)[];
  /** Where walking off each edge leads, if anywhere. */
  readonly edges: Readonly<Partial<Record<Side, WarpTarget>>>;
  readonly spawns: Readonly<Record<string, Spawn>>;
  /** Everyone the map places, whether or not they're about (see `npcsAbout`). */
  readonly npcs: readonly NpcPlacement[];
  /** The event script that facing each cell and pressing Confirm runs, if any. */
  readonly scripts: readonly (string | null)[];
  /** Scripts that stepping onto a cell runs, in the order the map lists them. */
  readonly touches: readonly TouchTrigger[];
  /** Scripts that arriving on the map runs. */
  readonly enters: readonly Trigger[];
  /** Scripts that run as soon as their condition holds. */
  readonly autos: readonly Trigger[];
  /** Treasure chests, in the order the map lists them. Their cells are solid. */
  readonly chests: readonly ChestPlacement[];
  /** Its random battles, if it has any. */
  readonly encounters: MapEncounters | null;
}

/** The edge a cell just off the map is past, or null for a cell on the map. */
export function sideOf(map: CompiledMap, x: number, y: number): Side | null {
  if (x < 0) return 'west';
  if (x >= map.width) return 'east';
  if (y < 0) return 'north';
  if (y >= map.height) return 'south';
  return null;
}

/** Where stepping into (x, y) leads: a warp there, or the exit off that edge if it's off the map. */
export function exitAt(map: CompiledMap, x: number, y: number): WarpTarget | null {
  const side = sideOf(map, x, y);
  if (side) return map.edges[side] ?? null;
  return map.warps[y * map.width + x] ?? null;
}

/** The event script for examining (x, y), if any. NPCs carry their own. */
export function scriptAt(map: CompiledMap, x: number, y: number): string | null {
  if (sideOf(map, x, y)) return null;
  return map.scripts[y * map.width + x] ?? null;
}

/** The chest standing in (x, y), if any. */
export const chestAt = (map: CompiledMap, x: number, y: number): ChestPlacement | null =>
  map.chests.find((chest) => chest.x === x && chest.y === y) ?? null;

/** What stepping onto (x, y) sets off: the first touch trigger there whose condition holds. */
export function touchAt(
  map: CompiledMap,
  x: number,
  y: number,
  state: GameState,
): TouchTrigger | null {
  return (
    map.touches.find(
      (touch) => touch.x === x && touch.y === y && conditionHolds(touch.when, state),
    ) ?? null
  );
}

/** What arriving on the map sets off: the first enter trigger whose condition holds. */
export const enterTrigger = (map: CompiledMap, state: GameState): Trigger | null =>
  map.enters.find((enter) => conditionHolds(enter.when, state)) ?? null;

/** The people on the map as the player arrives on it: everyone whose condition holds. */
export const npcsAbout = (map: CompiledMap, state: GameState): NpcPlacement[] =>
  map.npcs.filter((npc) => conditionHolds(npc.when, state));

/**
 * The auto trigger to run now: the first whose condition holds, of those that haven't run since
 * the player arrived (`ran`).
 */
export const autoTrigger = (
  map: CompiledMap,
  state: GameState,
  ran: ReadonlySet<Trigger>,
): Trigger | null =>
  map.autos.find((auto) => !ran.has(auto) && conditionHolds(auto.when, state)) ?? null;

/** Can't step into (x, y): it's solid, or off an edge that leads nowhere. */
export function isBlocked(map: CompiledMap, x: number, y: number): boolean {
  const side = sideOf(map, x, y);
  if (side) return !map.edges[side];
  return map.solid[y * map.width + x] ?? true;
}

/** (x, y) is off an edge that leads nowhere: the one wall the debug menu's noclip doesn't open. */
export function isOutOfBounds(map: CompiledMap, x: number, y: number): boolean {
  const side = sideOf(map, x, y);
  return side !== null && !map.edges[side];
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
const PREFAB_CHARS = new Set(['#', '.', '^', '=', 'D', ' ']);
const lookups = new WeakMap<BlobLayout, ReadonlyMap<number, readonly [number, number]>>();

/** Builds a map's layers, collision and exits. Throws if anything doesn't fit. */
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
  const onMap = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height;
  const idAt = (x: number, y: number): string | undefined =>
    onMap(x, y) ? ids[y * width + x] : undefined;
  const terrainOf = (id: string): TerrainDef =>
    content.terrains[id] ?? fail(`its legend uses "${id}", which isn't a terrain`);
  const prefabOf = (id: string): PrefabDef => content.prefabs[id] ?? fail(`"${id}" isn't a prefab`);

  const cells = <T>(value: T): T[] => new Array<T>(width * height).fill(value);
  const layers: Record<LayerName, (TileRef | null)[]> = {
    ground: cells<TileRef | null>(null),
    base: cells<TileRef | null>(null),
    overhead: cells<TileRef | null>(null),
  };
  const solid = cells(false);
  const warps = cells<WarpTarget | null>(null);
  const spawns: Record<string, Spawn> = {};
  const npcs: NpcPlacement[] = [];
  const scripts = cells<string | null>(null);
  const touches: TouchTrigger[] = [];
  const enters: Trigger[] = [];
  const autos: Trigger[] = [];
  const chests: ChestPlacement[] = [];

  /** A trigger, checking its condition names flags. */
  function trigger(kind: string, script: string, when: Condition | undefined): Trigger {
    for (const term of when === undefined ? [] : badConditionTerms(when)) {
      fail(`the ${kind} running ${script} has "${term}" in its condition, which isn't a flag`);
    }
    return when === undefined ? { script } : { script, when };
  }

  function fillTile(terrain: FillTerrain, x: number, y: number): TileRef {
    const total = terrain.tiles.reduce((sum, [, , weight = 1]) => sum + weight, 0);
    let pick = cellHash(x, y) % total;
    for (const [col, row, weight = 1] of terrain.tiles) {
      if (pick < weight) return { sheet: terrain.sheet, col, row };
      pick -= weight;
    }
    return fail(`a fill terrain at (${x}, ${y}) has no tiles`);
  }

  function addWarp(x: number, y: number, to: WarpTarget): void {
    const index = y * width + x;
    if (warps[index]) fail(`two warps share (${x}, ${y})`);
    warps[index] = to;
  }

  /**
   * Draws a prefab with its top-left at `at`. Off-map tiles are an error unless `clip` is set.
   * With `to`, its doorway is walkable and leads there; without, the doorway is solid. With
   * `script`, examining any of its tiles under characters runs it.
   */
  function stamp(
    id: string,
    [left, top]: GridPoint,
    clip: boolean,
    to?: WarpTarget,
    script?: string,
  ): void {
    const prefab = prefabOf(id);
    const doorways = prefab.layout.join('').split('D').length - 1;
    if (doorways > 1) fail(`prefab ${id} has ${doorways} doorways; one at most`);
    if (to && doorways === 0)
      fail(`prefab ${id} at (${left}, ${top}) has no doorway to lead anywhere`);
    prefab.layout.forEach((line, dy) => {
      [...line].forEach((char, dx) => {
        if (!PREFAB_CHARS.has(char)) fail(`prefab ${id} uses "${char}" in its layout`);
        if (char === ' ') return;
        const x = left + dx;
        const y = top + dy;
        if (!onMap(x, y)) {
          if (clip) return;
          fail(`prefab ${id} at (${left}, ${top}) runs off the map`);
        }
        const index = y * width + x;
        const layer = char === '^' ? layers.overhead : layers.base;
        if (layer[index]) fail(`two prefabs overlap at (${x}, ${y})`);
        const [col, row] = prefab.origin;
        layer[index] = { sheet: prefab.sheet, col: col + dx, row: row + dy };
        if (char === '#') solid[index] = true;
        // A walkway (a pier, a bridge) can be walked on whatever is under it.
        if (char === '=') solid[index] = false;
        if (script && char !== '^') scripts[index] = script;
        if (char === 'D') {
          // A doorway cuts through whatever the terrain is: a door in a wall still opens.
          solid[index] = !to;
          if (to) addWarp(x, y, to);
        }
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

  for (const object of def.objects ?? []) {
    if (object.type === 'enter') {
      enters.push(trigger('enter', object.script, object.when));
      continue;
    }
    if (object.type === 'auto') {
      autos.push(trigger('auto', object.script, object.when));
      continue;
    }
    const [x, y] = object.at;
    switch (object.type) {
      case 'prefab':
        stamp(object.prefab, object.at, false, object.to, object.script);
        break;
      case 'warp':
        if (!onMap(x, y)) fail(`the warp at (${x}, ${y}) is off the map`);
        addWarp(x, y, object.to);
        break;
      case 'spawn':
        if (!onMap(x, y)) fail(`spawn ${object.id} at (${x}, ${y}) is off the map`);
        if (spawns[object.id]) fail(`two spawns are called ${object.id}`);
        spawns[object.id] = { x, y, facing: object.facing };
        break;
      case 'touch':
        if (!onMap(x, y)) fail(`the touch at (${x}, ${y}) is off the map`);
        touches.push({ x, y, ...trigger('touch', object.script, object.when) });
        break;
      case 'npc': {
        const wander = object.wander ?? 0;
        if (!onMap(x, y)) fail(`npc ${object.id} at (${x}, ${y}) is off the map`);
        if (object.id === PLAYER || isDirection(object.id)) {
          fail(`an npc can't be called ${object.id}: scripts use that word for something else`);
        }
        if (npcs.some((npc) => npc.id === object.id)) fail(`two npcs are called ${object.id}`);
        if (!Number.isInteger(wander) || wander < 0)
          fail(`npc ${object.id} can't wander ${wander}`);
        for (const term of object.when === undefined ? [] : badConditionTerms(object.when)) {
          fail(`npc ${object.id} has "${term}" in its condition, which isn't a flag`);
        }
        npcs.push({
          id: object.id,
          sprite: object.sprite,
          x,
          y,
          facing: object.facing,
          wander,
          ...(object.script ? { script: object.script } : {}),
          ...(object.when === undefined ? {} : { when: object.when }),
        });
        break;
      }
      case 'chest': {
        const at = `the chest at (${x}, ${y})`;
        const { flag } = object;
        if (!onMap(x, y)) fail(`${at} is off the map`);
        if (!isNamespacedId(flag) || !flag.startsWith('chest.')) {
          fail(`${at} has the flag "${flag}"; chest flags look like chest.${def.id}-01`);
        }
        if (chests.some((chest) => chest.flag === flag)) fail(`two chests have the flag ${flag}`);
        if ('item' in object && 'gold' in object) {
          fail(`${at} holds an item and gold; it can hold one or the other`);
        }
        if ('gold' in object) {
          if (!Number.isSafeInteger(object.gold) || object.gold < 1) {
            fail(`${at} can't hold ${object.gold} gold`);
          }
          chests.push({ x, y, flag, gold: object.gold });
        } else {
          if (!isId(object.item)) fail(`${at} holds "${object.item}", which isn't an item ID`);
          chests.push({ x, y, flag, item: object.item });
        }
        break;
      }
    }
  }

  // Nobody could arrive at, or step into, a solid cell.
  for (const [id, spawn] of Object.entries(spawns)) {
    if (solid[spawn.y * width + spawn.x]) fail(`spawn ${id} is on a solid cell`);
  }
  // NPCs start where nothing else stands, and can't block a way in or out.
  for (const npc of npcs) {
    const at = `npc ${npc.id} at (${npc.x}, ${npc.y})`;
    const index = npc.y * width + npc.x;
    if (solid[index]) fail(`${at} is on a solid cell`);
    if (warps[index]) fail(`${at} is in a way out`);
    const spawn = Object.entries(spawns).find(([, s]) => s.x === npc.x && s.y === npc.y);
    if (spawn) fail(`${at} is on spawn ${spawn[0]}`);
    if (npcs.some((other) => other !== npc && other.x === npc.x && other.y === npc.y)) {
      fail(`${at} shares its cell`);
    }
  }
  warps.forEach((warp, index) => {
    if (warp && solid[index])
      fail(`the warp at (${index % width}, ${Math.floor(index / width)}) is on a solid cell`);
  });
  // A touch is somewhere the player can stand, and not a way out, which would take them away first.
  for (const { x, y, script } of touches) {
    const index = y * width + x;
    if (solid[index]) fail(`the touch at (${x}, ${y}) running ${script} is on a solid cell`);
    if (warps[index]) fail(`the touch at (${x}, ${y}) running ${script} is in a way out`);
  }
  // A chest stands on open ground, in nobody's way and on nothing else that does something. Then
  // it's as solid as a wall.
  for (const chest of chests) {
    const at = `the chest at (${chest.x}, ${chest.y})`;
    const here = ({ x, y }: { x: number; y: number }): boolean => x === chest.x && y === chest.y;
    const index = chest.y * width + chest.x;
    const spawn = Object.entries(spawns).find(([, s]) => here(s));
    const npc = npcs.find(here);
    const script = scripts[index];
    if (solid[index]) fail(`${at} is on a solid cell`);
    if (warps[index]) fail(`${at} is in a way out`);
    if (spawn) fail(`${at} is on spawn ${spawn[0]}`);
    if (npc) fail(`${at} is where npc ${npc.id} starts`);
    if (touches.some(here)) fail(`${at} is on a touch`);
    if (script) fail(`${at} is on something that runs ${script}`);
    if (chests.some((other) => other !== chest && here(other))) fail(`${at} shares its cell`);
  }
  for (const { x, y } of chests) solid[y * width + x] = true;

  const edges = def.edges ?? {};
  return {
    id: def.id,
    width,
    height,
    layers,
    solid,
    warps,
    edges,
    spawns,
    npcs,
    scripts,
    touches,
    enters,
    autos,
    chests,
    encounters: def.encounters ?? null,
  };
}

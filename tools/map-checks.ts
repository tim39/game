import { compileBackdrop } from '../src/core/map/backdrop';
import { compileMap, mapFlags, type CompiledMap } from '../src/core/map/compile';
import type { GridPoint, MapContent, MapDef, WarpTarget } from '../src/core/map/types';
import type { BackdropDef } from '../src/core/schema';
import type { AssetEntry } from '../src/systems/asset-manifest';
import { AREA_BANNER } from '../src/ui/area-banner';
import { SAVE_MENU } from '../src/ui/save-menu-layout';
import type { MeasuredFont } from './font-metrics';

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
 * - every map compiles, however the flags its terrain and prefabs change with are set, and every
 *   warp, doorway and edge leads to a spawn that exists;
 * - every NPC's sprite is a 16×16 character sheet in the asset manifest;
 * - every map's music is music in the asset manifest;
 * - no two chests share a flag, on any map, so each opens by itself.
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

  // Each map as it starts, with none of its flags set, and every other way its flags can be.
  const compiled = new Map<string, CompiledMap>();
  const variants: CompiledMap[] = [];
  for (const map of Object.values(maps)) {
    const { music } = map;
    if (music !== undefined && (!music.startsWith('bgm.') || manifest[music]?.type !== 'audio')) {
      problems.push(`Map ${map.id}: its music, ${music}, isn't music in the asset manifest`);
    }
    const flags = mapFlags(map);
    if (flags.length > MAX_MAP_FLAGS) {
      problems.push(
        `Map ${map.id}: its terrain and prefabs change with ${flags.length} flags; the most is ${MAX_MAP_FLAGS}`,
      );
      continue;
    }
    for (const set of subsetsOf(flags)) {
      try {
        const variant = compileMap(map, content, (flag) => set.has(flag));
        if (set.size === 0) compiled.set(map.id, variant);
        else variants.push(variant);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        problems.push(flags.length === 0 ? message : `${message} (${described(flags, set)})`);
      }
    }
  }

  const checkTarget = (from: string, { map, spawn }: WarpTarget): void => {
    const target = compiled.get(map);
    if (!maps[map]) problems.push(`${from} leads to ${map}, which isn't a map`);
    else if (target && !target.spawns[spawn]) {
      problems.push(`${from} leads to spawn ${spawn} on ${map}, which has no such spawn`);
    }
  };
  for (const map of [...compiled.values(), ...variants]) {
    map.warps.forEach((warp, index) => {
      const at = `(${index % map.width}, ${Math.floor(index / map.width)})`;
      if (warp) checkTarget(`Map ${map.id}: the way out at ${at}`, warp);
    });
  }
  for (const map of compiled.values()) {
    for (const [side, edge] of Object.entries(map.edges)) {
      checkTarget(`Map ${map.id}: its ${side} edge`, edge);
    }
    for (const npc of map.npcs) {
      const sheet = manifest[`sprite.${npc.sprite}`];
      if (
        sheet?.type !== 'spritesheet' ||
        sheet.frameWidth !== TILE ||
        sheet.frameHeight !== TILE
      ) {
        problems.push(
          `Map ${map.id}: npc ${npc.id}'s sprite, sprite.${npc.sprite}, isn't a character sheet`,
        );
      }
    }
  }

  // The compiler keeps a map's chest flags apart; these are kept apart across maps.
  const chestFlags = new Map<string, string>();
  for (const map of compiled.values()) {
    for (const { x, y, flag } of map.chests) {
      const chest = `the chest at (${x}, ${y})`;
      const first = chestFlags.get(flag);
      if (first) problems.push(`Map ${map.id}: ${chest} has the flag ${flag}, as ${first} does`);
      else chestFlags.set(flag, `${chest} on ${map.id}`);
    }
  }

  // A way out in every variant of a map is checked in each; it's reported once.
  return [...new Set(problems)];
}

/**
 * The most flags a map's terrain and prefabs may change with: the checks compile it every way they
 * can be set, 2 to the power of how many there are.
 */
const MAX_MAP_FLAGS = 6;

/** Every way some flags can be set: as sets of those set, from none of them to all. */
function subsetsOf(flags: readonly string[]): ReadonlySet<string>[] {
  return Array.from(
    { length: 2 ** flags.length },
    (_, bits) => new Set(flags.filter((_flag, index) => (bits >> index) & 1)),
  );
}

/** How a map's flags were set, as a condition would say it: `tide.b1-low, !tide.b2-low`. */
const described = (flags: readonly string[], set: ReadonlySet<string>): string =>
  `with ${flags.map((flag) => (set.has(flag) ? flag : `!${flag}`)).join(', ')}`;

export interface ReachSources {
  readonly maps: Readonly<Record<string, MapDef>>;
  /** The map a new game starts on. */
  readonly start: string;
  /** Where scripts take the player from each map, as checkEvents reports. */
  readonly teleports: ReadonlyMap<string, ReadonlySet<string>>;
}

/** The test maps, which only the tests and the debug menu go to. */
const isTestMap = (id: string): boolean => id.startsWith('test-');

/**
 * Checks that every map can be reached from where a new game starts: through doorways, warps and
 * map edges, or by a script on a map teleporting the player. Returns one line per map that can't
 * be. The test maps (`test-*`) are left out.
 */
export function checkReachable({ maps, start, teleports }: ReachSources): string[] {
  // checkNewGame reports a start that isn't a map.
  if (!Object.hasOwn(maps, start)) return [];
  const reached = new Set([start]);
  const queue = [start];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    const map = maps[id];
    const next = [...(map ? waysOut(map) : []), ...(teleports.get(id) ?? [])];
    for (const there of next.filter((to) => Object.hasOwn(maps, to) && !reached.has(to))) {
      reached.add(there);
      queue.push(there);
    }
  }
  return Object.keys(maps)
    .filter((id) => !reached.has(id) && !isTestMap(id))
    .map((id) => `Map ${id} can't be reached from ${start}, where a new game starts`);
}

/** The maps a map's doorways, warps and edges lead to. */
function waysOut(map: MapDef): string[] {
  const exits = (map.objects ?? []).flatMap((object) =>
    (object.type === 'prefab' || object.type === 'warp') && object.to ? [object.to.map] : [],
  );
  const edges = Object.values(map.edges ?? {}).map((edge) => edge.map);
  return [...exits, ...edges];
}

/**
 * Checks that every map's name fits where the save menu shows where a game was saved, in
 * characters the body font has. Returns one line per problem.
 */
export function checkMapNames(
  maps: Readonly<Record<string, MapDef>>,
  font: MeasuredFont,
): string[] {
  return Object.values(maps).flatMap((map) => {
    const name = `Map ${map.id}: its name, "${map.name}",`;
    const missing = [...new Set([...map.name].filter((char) => !font.has(char)))];
    if (missing.length > 0) {
      return [
        `${name} uses ${missing.map((char) => `"${char}"`).join(', ')}, which the font lacks`,
      ];
    }
    const width = font.width(map.name);
    if (width <= SAVE_MENU.placeWidth) return [];
    return [`${name} is ${width} pixels wide; the save menu has room for ${SAVE_MENU.placeWidth}`];
  });
}

/**
 * Checks the maps' areas, which the area banner names: every map a map says it's part of exists
 * and is an area of its own, rather than part of another; and every area's name fits the banner,
 * in characters the display font has. Returns one line per problem.
 */
export function checkMapAreas(
  maps: Readonly<Record<string, MapDef>>,
  font: MeasuredFont,
): string[] {
  return Object.values(maps).flatMap((map) => {
    const { area } = map;
    if (area !== undefined) {
      const whose = `Map ${map.id}: its area, ${area},`;
      if (area === map.id) return [`${whose} is the map itself; leave the area out`];
      const named = Object.hasOwn(maps, area) ? maps[area] : undefined;
      if (!named) return [`${whose} isn't a map`];
      if (named.area !== undefined) {
        return [`${whose} is part of ${named.area}: name ${named.area} instead`];
      }
      return [];
    }
    const name = `Map ${map.id}: its name, "${map.name}",`;
    const missing = [...new Set([...map.name].filter((char) => !font.has(char)))];
    if (missing.length > 0) {
      const chars = missing.map((char) => `"${char}"`).join(', ');
      return [`${name} uses ${chars}, which the area banner's font lacks`];
    }
    const width = font.width(map.name);
    if (width <= AREA_BANNER.room) return [];
    return [`${name} is ${width} pixels wide; the area banner has room for ${AREA_BANNER.room}`];
  });
}

/**
 * Checks that every battle backdrop compiles, and fills the screen. Returns one line per problem.
 * The tiles their terrains and prefabs use are checked with the maps'.
 */
export function checkBackdrops(
  backdrops: Readonly<Record<string, BackdropDef>>,
  content: MapContent,
): string[] {
  return Object.entries(backdrops).flatMap(([id, backdrop]) => {
    try {
      compileBackdrop(id, backdrop, content);
      return [];
    } catch (error) {
      return [error instanceof Error ? error.message : String(error)];
    }
  });
}

import type { Chest } from '../chest';
import type { Condition } from '../conditions';
import type { Direction } from '../direction';
import type { BlobLayout } from './autotile';

/** A cell position, or a tile's position in a sheet: [x, y] or [col, row]. */
export type GridPoint = readonly [number, number];

/** A tile picture: the 16×16 frame at [col, row] of a sprite-sheet asset such as `tiles.water`. */
export interface TileRef {
  readonly sheet: string;
  readonly col: number;
  readonly row: number;
}

/** One look for a plain terrain: [col, row] in its sheet, and how often it appears (default 1). */
export type WeightedTile = readonly [col: number, row: number, weight?: number];

/** The same tile everywhere, or a mix of variants that's random-looking but fixed per cell. */
export interface FillTerrain {
  readonly kind: 'fill';
  readonly sheet: string;
  readonly tiles: readonly WeightedTile[];
  readonly solid?: boolean;
}

/** Edges and corners that follow the shape of the area: shorelines, path edges. */
export interface BlobTerrain {
  readonly kind: 'blob';
  readonly sheet: string;
  /** The block's top-left [col, row] in the sheet; `layout` is relative to it. */
  readonly origin: GridPoint;
  readonly layout: BlobLayout;
  readonly solid?: boolean;
}

/**
 * Trees standing on another terrain. Along each row, every two cells get a 2-wide tree whose
 * bottom row stands on them and whose canopy overhangs the row above; a run of odd length ends
 * in a 1-wide filler. Trees are solid; canopies are drawn over characters, who can walk under.
 */
export interface TreesTerrain {
  readonly kind: 'trees';
  /** A fill terrain, drawn under the trees. */
  readonly ground: string;
  /** 2-wide prefabs, one picked per tree. */
  readonly trees: readonly string[];
  /** A 1-wide prefab. */
  readonly filler: string;
}

export type TerrainDef = FillTerrain | BlobTerrain | TreesTerrain;

/** A structure drawn from a block of tiles: a tree, a house, the lighthouse. */
export interface PrefabDef {
  readonly sheet: string;
  /** The top-left [col, row] of its tiles in the sheet. */
  readonly origin: GridPoint;
  /**
   * One string per row of tiles, one character per tile:
   * `#` solid, drawn under characters; `.` walkable, drawn under characters;
   * `^` walkable, drawn over characters (treetops, roof tops); `=` walkable even over solid terrain,
   * drawn under characters (a pier over the sea, a bridge); a space for no tile;
   * `D` a doorway, drawn under characters: walkable and leading somewhere if the map gives the
   * prefab a `to`, solid otherwise. A prefab has at most one.
   */
  readonly layout: readonly string[];
}

/** Where a warp leads: a spawn point on another map (or this one). */
export interface WarpTarget {
  readonly map: string;
  readonly spawn: string;
}

/**
 * A prefab placed on a map, by its top-left cell. With `to`, its doorway leads there; with
 * `script`, facing any of its cells and pressing Confirm runs that event script (a sign, say).
 * With `when`, it's only there while that holds: the map changes as soon as it does.
 */
export interface PrefabObject {
  readonly type: 'prefab';
  readonly prefab: string;
  readonly at: GridPoint;
  readonly to?: WarpTarget;
  readonly script?: string;
  readonly when?: Condition;
}

/** A cell that takes whoever steps into it to `to`. Doorways are usually simpler. */
export interface WarpObject {
  readonly type: 'warp';
  readonly at: GridPoint;
  readonly to: WarpTarget;
}

/** Where arrivals appear, and which way they face. Warps elsewhere name it by `id`. */
export interface SpawnObject {
  readonly type: 'spawn';
  readonly id: string;
  readonly at: GridPoint;
  readonly facing: Direction;
}

/** Someone on the map (see src/core/npc.ts for how they move). */
export interface NpcObject {
  readonly type: 'npc';
  /** Unique on its map. */
  readonly id: string;
  /** A character sheet: `sprite.<sprite>` in the asset manifest, such as `tamsin`. */
  readonly sprite: string;
  readonly at: GridPoint;
  readonly facing: Direction;
  /** How far it may wander from `at`, in cells across or down. Without it, it stands still. */
  readonly wander?: number;
  /** The event script that runs when the player talks to it. */
  readonly script?: string;
  /**
   * Only there while `when` holds, as the player arrives on the map: people come and go with the
   * story. Without it, always there.
   */
  readonly when?: Condition;
}

/**
 * Stepping onto this cell runs `script`, while `when` holds (always, without it). A walk stops
 * there, as it does at a way out. Arriving there through a door or a teleport doesn't count.
 */
export interface TouchObject {
  readonly type: 'touch';
  readonly at: GridPoint;
  readonly script: string;
  readonly when?: Condition;
}

/** Arriving on the map runs `script`, if `when` holds. */
export interface EnterObject {
  readonly type: 'enter';
  readonly script: string;
  readonly when?: Condition;
}

/**
 * Runs `script` as soon as `when` holds, while the player is on the map and nothing else is
 * running. The script should change a flag so that `when` no longer holds: until it does, it runs
 * again each time the player comes back to the map.
 */
export interface AutoObject {
  readonly type: 'auto';
  readonly script: string;
  readonly when: Condition;
}

/**
 * A treasure chest, holding an `item` or some `gold`. Facing it and pressing Confirm opens it, once:
 * the party gets what's inside, and `flag` is set, which keeps it open (see src/core/chest.ts). It
 * blocks the way, like a wall.
 */
export type ChestObject = { readonly type: 'chest'; readonly at: GridPoint } & Chest;

export type MapObject =
  | PrefabObject
  | WarpObject
  | SpawnObject
  | NpcObject
  | TouchObject
  | EnterObject
  | AutoObject
  | ChestObject;

export const SIDES = ['north', 'south', 'east', 'west'] as const;
export type Side = (typeof SIDES)[number];

/**
 * A map's random battles (see Encounters in docs/DESIGN.md): the encounter table they're drawn
 * from, in src/data/encounters.ts, and the backdrop they're fought in front of, in
 * src/data/backdrops.ts.
 */
export interface MapEncounters {
  readonly table: string;
  readonly backdrop: string;
}

/**
 * A legend entry that changes with a condition: `terrain` while `when` holds, and `otherwise`
 * while it doesn't. The Tide Caves' shallows are sand at low tide and sea at high tide.
 */
export interface ConditionalTerrain {
  readonly when: Condition;
  readonly terrain: string;
  readonly otherwise: string;
}

/**
 * How a map looks and sounds once something has happened: while `when` holds, the music, shade
 * and mist it gives take the place of the map's own, and those it leaves out stay as they were.
 * Saltmere at dusk after the Kindling, and dark and misty once the Beacon is out.
 */
export interface MapMood {
  readonly when: Condition;
  /** The music arriving plays, `bgm.*` in the asset manifest, or null for silence. */
  readonly music?: string | null;
  /** The colour the map is multiplied by, or null for none (see `MapDef.shade`). */
  readonly shade?: number | null;
  /** Whether the Gloam's mist drifts over the map. */
  readonly mist?: boolean;
}

export interface MapDef {
  /** Kebab-case, like `saltmere` or `tide-caves-b1`. */
  readonly id: string;
  /** The place's name, as the menus and the save slots show it. */
  readonly name: string;
  /**
   * The map whose area this one is part of, by its ID, as a town's houses are part of the town.
   * Without it, the map is an area of its own. Arriving in another area shows its name in the area
   * banner, so going between maps in one area shows nothing.
   */
  readonly area?: string;
  /**
   * The music that plays on arriving, `bgm.*` in the asset manifest; without it, silence. A map
   * with the same music as the last carries on playing it, so a town's houses share its tune.
   */
  readonly music?: string;
  /**
   * One line per row of cells and one character per cell, each looked up in `legend`.
   * Blank lines at either end and the indentation shared by every line are ignored.
   */
  readonly terrain: string;
  /**
   * Terrain character → terrain ID; or a terrain that changes with a condition, which the map
   * changes to as soon as it does (see `ConditionalTerrain`).
   */
  readonly legend: Readonly<Record<string, string | ConditionalTerrain>>;
  readonly objects?: readonly MapObject[];
  /** Walking off an edge leads here. Without an entry, that edge is a wall. */
  readonly edges?: Readonly<Partial<Record<Side, WarpTarget>>>;
  /** Random battles while walking about the map. Without them, there are none. */
  readonly encounters?: MapEncounters;
  /**
   * A colour, as 0xRRGGBB, the whole map is multiplied by: a cave's gloom. Without it, the map
   * shows in its own colours.
   */
  readonly shade?: number;
  /** Whether the Gloam's mist drifts over the map. */
  readonly mist?: boolean;
  /**
   * How the map's music, shade and mist change as the story goes on: the first of these whose
   * condition holds has its say (see `MapMood`).
   */
  readonly moods?: readonly MapMood[];
}

/** The terrains and prefabs maps are built from. Passed in, so tests can use small fixtures. */
export interface MapContent {
  readonly terrains: Readonly<Record<string, TerrainDef>>;
  readonly prefabs: Readonly<Record<string, PrefabDef>>;
}

export const defineMap = (map: MapDef): MapDef => map;

export const defineTerrains = <T extends Record<string, TerrainDef>>(terrains: T): T => terrains;

export const definePrefabs = <T extends Record<string, PrefabDef>>(prefabs: T): T => prefabs;

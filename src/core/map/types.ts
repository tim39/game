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
   * `^` walkable, drawn over characters (treetops, roof tops); a space for no tile.
   */
  readonly layout: readonly string[];
}

/** A prefab placed on a map, by its top-left cell. */
export interface PrefabObject {
  readonly type: 'prefab';
  readonly prefab: string;
  readonly at: GridPoint;
}

export type MapObject = PrefabObject;

export interface MapDef {
  /** Kebab-case, like `saltmere` or `tide-caves-b1`. */
  readonly id: string;
  /** The place name, as the area banner shows it. */
  readonly name: string;
  /**
   * One line per row of cells and one character per cell, each looked up in `legend`.
   * Blank lines at either end and the indentation shared by every line are ignored.
   */
  readonly terrain: string;
  /** Terrain character → terrain ID. */
  readonly legend: Readonly<Record<string, string>>;
  readonly objects?: readonly MapObject[];
}

/** The terrains and prefabs maps are built from. Passed in, so tests can use small fixtures. */
export interface MapContent {
  readonly terrains: Readonly<Record<string, TerrainDef>>;
  readonly prefabs: Readonly<Record<string, PrefabDef>>;
}

export const defineMap = (map: MapDef): MapDef => map;

export const defineTerrains = <T extends Record<string, TerrainDef>>(terrains: T): T => terrains;

export const definePrefabs = <T extends Record<string, PrefabDef>>(prefabs: T): T => prefabs;

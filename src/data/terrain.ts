import type { BlobLayout } from '../core/map/autotile';
import { definePrefabs, defineTerrains, type MapContent } from '../core/map/types';

/**
 * The Ninja Adventure tilesets' 47-shape blob block: where each shape sits, relative to the block's
 * top-left, and which neighbours it joins up with (see Maps in docs/TECH.md). Grass shows around
 * every edge. The water and path blocks share this layout; only the path block has a tile for a
 * cell with no neighbours at all.
 */
const GRASS_EDGED_BLOB: BlobLayout = [
  [0, 0, 'E SE S'],
  [1, 0, 'E SE S SW W'],
  [2, 0, 'S SW W'],
  [3, 0, 'S'],
  [4, 0, 'E S'],
  [5, 0, 'E S SW W'],
  [6, 0, 'E SE S W'],
  [7, 0, 'S W'],
  [8, 0, 'E S W'],
  [9, 0, 'N E SE S W NW'],
  [0, 1, 'N NE E SE S'],
  [1, 1, 'N NE E SE S SW W NW'],
  [2, 1, 'N S SW W NW'],
  [3, 1, 'N S'],
  [4, 1, 'N NE E S'],
  [5, 1, 'N NE E S SW W NW'],
  [6, 1, 'N NE E SE S W NW'],
  [7, 1, 'N S W NW'],
  [8, 1, 'N NE E S W NW'],
  [9, 1, 'N NE E S SW W'],
  [0, 2, 'N NE E'],
  [1, 2, 'N NE E W NW'],
  [2, 2, 'N W NW'],
  [3, 2, 'N'],
  [4, 2, 'N E SE S'],
  [5, 2, 'N E SE S SW W NW'],
  [6, 2, 'N NE E SE S SW W'],
  [7, 2, 'N S SW W'],
  [8, 2, 'N E SE S SW W'],
  [9, 2, 'N E SE S W'],
  [10, 2, 'N E S SW W'],
  [0, 3, 'E'],
  [1, 3, 'E W'],
  [2, 3, 'W'],
  [4, 3, 'N E'],
  [5, 3, 'N E W NW'],
  [6, 3, 'N NE E W'],
  [7, 3, 'N W'],
  [8, 3, 'N E W'],
  [9, 3, 'N NE E S W'],
  [10, 3, 'N E S W NW'],
  [4, 4, 'N E S'],
  [5, 4, 'N E S SW W NW'],
  [6, 4, 'N NE E SE S W'],
  [7, 4, 'N S W'],
  [8, 4, 'N E S W'],
];

/**
 * The pack's simple room frame (TilesetWallSimple): walls one cell thick around a floor. It only has
 * the shapes a rectangle needs, its four corners and four sides, so its rooms are rectangles. Each
 * colour adds the plain dark tile for wall surrounded by wall, which sits in the sheet's row 5.
 */
const ROOM_WALL: BlobLayout = [
  [0, 0, 'N NE E S SW W NW'], // top-left corner: the room is to the south-east
  [3, 0, 'N NE E W NW'], // top side
  [4, 0, 'N NE E SE S W NW'], // top-right corner
  [0, 1, 'N S SW W NW'], // left side
  [4, 1, 'N NE E SE S'], // right side
  [0, 4, 'N E SE S SW W NW'], // bottom-left corner
  [3, 4, 'E SE S SW W'], // bottom side
  [4, 4, 'N NE E SE S SW W'], // bottom-right corner
];
const ALL_WALL = 'N NE E SE S SW W NW';

export const TERRAINS = defineTerrains({
  grass: {
    kind: 'fill',
    sheet: 'tiles.floor',
    // Mostly plain, with the odd tuft.
    tiles: [
      [0, 12, 24],
      [1, 12],
      [2, 12],
      [3, 12],
      [4, 12],
      [2, 11],
      [3, 11],
    ],
  },
  path: {
    kind: 'blob',
    sheet: 'tiles.floor',
    origin: [0, 7],
    layout: [...GRASS_EDGED_BLOB, [3, 3, '']],
  },
  // A lone cell of water has no tile, so ponds and channels need at least two cells.
  water: {
    kind: 'blob',
    sheet: 'tiles.water',
    origin: [0, 6],
    layout: GRASS_EDGED_BLOB,
    solid: true,
  },
  trees: { kind: 'trees', ground: 'grass', trees: ['tree', 'pine'], filler: 'bush' },

  // Indoors.
  'wood-floor': { kind: 'fill', sheet: 'tiles.interior-floor', tiles: [[1, 9]] },
  'stone-floor': { kind: 'fill', sheet: 'tiles.interior-floor', tiles: [[14, 13]] },
  'house-wall': {
    kind: 'blob',
    sheet: 'tiles.room-wall',
    origin: [0, 0],
    layout: [...ROOM_WALL, [0, 5, ALL_WALL]],
    solid: true,
  },
  'cellar-wall': {
    kind: 'blob',
    sheet: 'tiles.room-wall',
    origin: [0, 6],
    layout: [...ROOM_WALL, [0, -1, ALL_WALL]],
    solid: true,
  },
});

export const PREFABS = definePrefabs({
  tree: { sheet: 'tiles.nature', origin: [0, 0], layout: ['^^', '##'] },
  pine: { sheet: 'tiles.nature', origin: [2, 0], layout: ['^^', '##'] },
  bush: { sheet: 'tiles.nature', origin: [4, 11], layout: ['#'] },
  // The orange-roofed house; you can walk behind its roof.
  house: { sheet: 'tiles.house', origin: [0, 0], layout: ['^^^^', '####', '#D##'] },
  // One-tile ways in and out: a door for a wall, and stairs.
  door: { sheet: 'tiles.element', origin: [6, 13], layout: ['D'] },
  'stairs-down': { sheet: 'tiles.element', origin: [6, 11], layout: ['D'] },
  'stairs-up': { sheet: 'tiles.element', origin: [6, 12], layout: ['D'] },
});

export const MAP_CONTENT: MapContent = { terrains: TERRAINS, prefabs: PREFABS };

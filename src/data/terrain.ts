import type { BlobLayout } from '../core/map/autotile';
import { definePrefabs, defineTerrains, type MapContent } from '../core/map/types';

/**
 * The Ninja Adventure tilesets' 47-shape blob block: where each shape sits, relative to the block's
 * top-left, and which neighbours it joins up with (see Maps in docs/TECH.md). Grass, or for the sea
 * sand, shows around every edge. The grass-edged water, the sand-edged sea and the path blocks share
 * this layout; only the path block has a tile for a cell with no neighbours at all.
 */
const EDGED_BLOB: BlobLayout = [
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
    layout: [...EDGED_BLOB, [3, 3, '']],
  },
  // A lone cell of water has no tile, so ponds and channels need at least two cells.
  water: {
    kind: 'blob',
    sheet: 'tiles.water',
    origin: [0, 6],
    layout: EDGED_BLOB,
    solid: true,
  },
  trees: { kind: 'trees', ground: 'grass', trees: ['tree', 'pine'], filler: 'bush' },

  // By the sea: Saltmere stands on sand.
  sand: {
    kind: 'fill',
    sheet: 'tiles.floor',
    // Mostly plain, with the odd scuff or pebble.
    tiles: [
      [1, 1, 60],
      [0, 4, 2],
      [1, 4, 1],
    ],
  },
  // The sand-edged block shares the grass-edged water's layout, so its shores meet sand.
  sea: { kind: 'blob', sheet: 'tiles.water', origin: [0, 0], layout: EDGED_BLOB, solid: true },
  'sand-trees': { kind: 'trees', ground: 'sand', trees: ['tree', 'pine'], filler: 'bush' },

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
  // A wooden signboard, to read.
  sign: { sheet: 'tiles.element', origin: [0, 2], layout: ['#'] },

  // Saltmere. More houses, all with their door one cell in from the left.
  'house-beige': { sheet: 'tiles.house', origin: [4, 0], layout: ['^^^^', '####', '#D##'] },
  'house-pale': { sheet: 'tiles.house', origin: [8, 0], layout: ['^^^^', '####', '#D##'] },
  'house-red': { sheet: 'tiles.house', origin: [12, 0], layout: ['^^^^', '####', '#D##'] },
  // The pack has no lighthouse: this is its domed desert tower, recoloured (see CREDITS.md).
  lighthouse: {
    sheet: 'tiles.lighthouse',
    origin: [0, 0],
    layout: ['^^^', '^^^', '^^^', '###', '#D#'],
  },
  // A wooden platform out over the sea, and a fishing boat to tie up beside it.
  dock: { sheet: 'tiles.water', origin: [4, 12], layout: ['====', '====', '====', '===='] },
  boat: { sheet: 'tiles.boat', origin: [0, 0], layout: ['#####', '#####'] },
  palm: { sheet: 'tiles.desert', origin: [10, 10], layout: ['^^', '##'] },
  'palm-2': { sheet: 'tiles.desert', origin: [12, 10], layout: ['^^', '##'] },
  // The Kindling pyre: logs in a ring of stones. A lamp on a post, for Rowan to light.
  pyre: { sheet: 'tiles.camp', origin: [12, 5], layout: ['##', '##'] },
  lamp: { sheet: 'tiles.camp', origin: [6, 5], layout: ['^', '#'] },
  barrel: { sheet: 'tiles.house', origin: [18, 11], layout: ['#'] },
  'basket-fish': { sheet: 'tiles.house', origin: [16, 13], layout: ['#'] },
  'basket-greens': { sheet: 'tiles.house', origin: [17, 13], layout: ['#'] },
  'basket-fruit': { sheet: 'tiles.house', origin: [18, 13], layout: ['#'] },
  fence: { sheet: 'tiles.house', origin: [10, 5], layout: ['####'] },
  rock: { sheet: 'tiles.nature', origin: [13, 8], layout: ['##', '##'] },
  // The inn: a tavern hung with lanterns, its door one cell in from the right.
  inn: { sheet: 'tiles.house', origin: [19, 0], layout: ['^^^^', '####', '##D#'] },
  // The forge: a round stone smithy. A signboard with a sword on it, for outside.
  forge: { sheet: 'tiles.house', origin: [23, 0], layout: ['^^^', '###', '#D#'] },
  'sword-sign': { sheet: 'tiles.house', origin: [6, 4], layout: ['##'] },
  // The village's notice board, on its legs.
  'notice-board': { sheet: 'tiles.element', origin: [11, 1], layout: ['###'] },
  // A washing line: its posts, and the laundry hung between them.
  'line-post': { sheet: 'tiles.element', origin: [11, 2], layout: ['^', '#'] },
  'line-post-end': { sheet: 'tiles.element', origin: [13, 2], layout: ['^', '#'] },
  laundry: { sheet: 'tiles.element', origin: [14, 2], layout: ['^^', '##'] },
  // Fish drying on a rack, by the shore.
  'fish-rack': { sheet: 'tiles.camp', origin: [8, 3], layout: ['##', '##'] },

  // Indoors. Tall furniture stands against the back wall, its top over the wall.
  bed: { sheet: 'tiles.bed', origin: [5, 0], layout: ['#', '#'] },
  'bed-green': { sheet: 'tiles.bed', origin: [12, 0], layout: ['#', '#'] },
  rug: { sheet: 'tiles.bed', origin: [2, 6], layout: ['...', '...'] },
  table: { sheet: 'tiles.element', origin: [2, 10], layout: ['###'] },
  chair: { sheet: 'tiles.element', origin: [0, 9], layout: ['#'] },
  bookshelf: { sheet: 'tiles.element', origin: [3, 7], layout: ['#', '#'] },
  shelf: { sheet: 'tiles.element', origin: [4, 7], layout: ['#', '#'] },
  dresser: { sheet: 'tiles.element', origin: [6, 7], layout: ['##', '##'] },
  plant: { sheet: 'tiles.element', origin: [0, 7], layout: ['#', '#'] },
  pot: { sheet: 'tiles.element', origin: [2, 9], layout: ['#'] },
  oven: { sheet: 'tiles.house', origin: [29, 11], layout: ['##', '##'] },
  'bed-red': { sheet: 'tiles.bed', origin: [5, 3], layout: ['#', '#'] },
  'bed-blue': { sheet: 'tiles.bed', origin: [12, 3], layout: ['#', '#'] },
  // A round table cut from a stump, a stool and a log bench, for the inn.
  'round-table': { sheet: 'tiles.camp', origin: [1, 5], layout: ['##', '##'] },
  stool: { sheet: 'tiles.camp', origin: [3, 5], layout: ['#'] },
  bench: { sheet: 'tiles.camp', origin: [0, 7], layout: ['##'] },
  // An old sea chart, spread on the floor like a rug.
  'sea-chart': { sheet: 'tiles.camp', origin: [10, 5], layout: ['..', '..'] },
  // The smithy's: a clay kiln with its chimney, an anvil, a workbench with a saw on it, and
  // planks.
  kiln: { sheet: 'tiles.house', origin: [31, 12], layout: ['##', '##', '##'] },
  anvil: { sheet: 'tiles.house', origin: [29, 15], layout: ['#'] },
  workbench: { sheet: 'tiles.house', origin: [31, 15], layout: ['##'] },
  planks: { sheet: 'tiles.house', origin: [31, 16], layout: ['##'] },
  crate: { sheet: 'tiles.element', origin: [6, 0], layout: ['#'] },
  // The Tide Beacon's flame, at the top of the lighthouse.
  beacon: { sheet: 'tiles.dungeon', origin: [2, 2], layout: ['#'] },
  // A Light Shrine: a gold orb on a stone, which heals the party (see src/data/events/rest.ts).
  shrine: { sheet: 'tiles.dungeon', origin: [7, 2], layout: ['#'] },
});

export const MAP_CONTENT: MapContent = { terrains: TERRAINS, prefabs: PREFABS };

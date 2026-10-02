import Phaser from 'phaser';
import { LAYERS, type CompiledMap, type LayerName } from '../core/map/compile';

export const TILE = 16;

/** Field depths: the map's layers, with characters between the base and overhead layers. */
export const DEPTH = { ground: 0, base: 1, characters: 2, overhead: 3 } as const;

/**
 * Draws a compiled map as one tilemap layer per map layer. Each tile sheet the map uses becomes a
 * tileset with its own range of tile IDs, so any layer can mix sheets.
 */
export function createTilemap(
  scene: Phaser.Scene,
  map: CompiledMap,
): Record<LayerName, Phaser.Tilemaps.TilemapLayer> {
  const tilemap = scene.make.tilemap({
    width: map.width,
    height: map.height,
    tileWidth: TILE,
    tileHeight: TILE,
  });

  const sheets = new Set<string>();
  for (const name of LAYERS) for (const tile of map.layers[name]) if (tile) sheets.add(tile.sheet);
  const tilesets = new Map<string, Phaser.Tilemaps.Tileset>();
  let firstgid = 1;
  for (const sheet of sheets) {
    const tileset = tilemap.addTilesetImage(sheet, sheet, TILE, TILE, 0, 0, firstgid);
    if (!tileset) throw new Error(`Map ${map.id}: tile sheet ${sheet} isn't loaded`);
    tilesets.set(sheet, tileset);
    firstgid += tileset.total;
  }

  const build = (name: LayerName): Phaser.Tilemaps.TilemapLayer => {
    const layer = tilemap.createBlankLayer(name, [...tilesets.values()]);
    if (!layer) throw new Error(`Map ${map.id}: couldn't create its ${name} layer`);
    map.layers[name].forEach((tile, index) => {
      if (!tile) return;
      const tileset = tilesets.get(tile.sheet);
      if (!tileset || tile.col >= tileset.columns || tile.row >= tileset.rows) {
        throw new Error(`Map ${map.id}: no tile at [${tile.col}, ${tile.row}] of ${tile.sheet}`);
      }
      const gid = tileset.firstgid + tile.row * tileset.columns + tile.col;
      layer.putTileAt(gid, index % map.width, Math.floor(index / map.width), false);
    });
    return layer.setDepth(DEPTH[name]);
  };

  return { ground: build('ground'), base: build('base'), overhead: build('overhead') };
}

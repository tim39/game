import type { BackdropDef } from '../schema';
import { compileMap, type CompiledMap } from './compile';
import type { MapContent } from './types';

/**
 * What a battle is fought in front of (see Battle system in docs/DESIGN.md): a small map, drawn
 * behind everything. It fills the screen the battle is drawn on, 320×180 pixels, so it's 20 cells
 * across and 12 down, the last row half hidden.
 */
export const BACKDROP_SIZE = { width: 20, height: 12 } as const;

/**
 * Compiles a backdrop as the map compiler compiles a map. Throws an error naming the backdrop if it
 * doesn't compile, or isn't the screen's size.
 */
export function compileBackdrop(
  id: string,
  backdrop: BackdropDef,
  content: MapContent,
): CompiledMap {
  let map: CompiledMap;
  try {
    map = compileMap({ id, name: id, ...backdrop }, content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Backdrop ${id}: ${message.replace(`Map ${id}: `, '')}`, { cause: error });
  }
  const { width, height } = BACKDROP_SIZE;
  if (map.width !== width || map.height !== height) {
    throw new Error(
      `Backdrop ${id}: it's ${map.width}×${map.height} cells, not ${width}×${height}, the screen's size`,
    );
  }
  return map;
}

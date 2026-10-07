import type { BackdropDef, PictureDef } from '../schema';
import { compileMap, type CompiledMap } from './compile';
import type { MapContent } from './types';

/**
 * What a battle is fought in front of (see Battle system in docs/DESIGN.md): a small map, drawn
 * behind everything. It fills the screen the battle is drawn on, 320×180 pixels, so it's 20 cells
 * across and 12 down, the last row half hidden.
 */
export const BACKDROP_SIZE = { width: 20, height: 12 } as const;

/**
 * Compiles a backdrop as the map compiler compiles a map. Throws an error naming the backdrop (or
 * whatever `kind` of thing it is) if it doesn't compile, or isn't the screen's size.
 */
export function compileBackdrop(
  id: string,
  backdrop: BackdropDef,
  content: MapContent,
  kind = 'Backdrop',
): CompiledMap {
  let map: CompiledMap;
  try {
    map = compileMap({ id, name: id, ...backdrop }, content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${kind} ${id}: ${message.replace(`Map ${id}: `, '')}`, { cause: error });
  }
  const { width, height } = BACKDROP_SIZE;
  if (map.width !== width || map.height !== height) {
    throw new Error(
      `${kind} ${id}: it's ${map.width}×${map.height} cells, not ${width}×${height}, the screen's size`,
    );
  }
  return map;
}

/**
 * Compiles a picture (see src/data/pictures.ts), which is drawn as a backdrop is. Throws an error
 * naming the picture if it doesn't compile, isn't the screen's size, or has a light off it.
 */
export function compilePicture(id: string, picture: PictureDef, content: MapContent): CompiledMap {
  const { terrain, legend, objects, shade } = picture;
  const map = compileBackdrop(id, { terrain, legend, objects, shade }, content, 'Picture');
  picture.lights?.forEach(({ at: [x, y] }, index) => {
    if (x >= map.width || y >= map.height) {
      throw new Error(`Picture ${id}: lights[${index}] is at (${x}, ${y}), off the picture`);
    }
  });
  return map;
}

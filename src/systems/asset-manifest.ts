/**
 * Every file the game loads, under the logical key game code uses instead of a path.
 * The files live in public/assets/, and CREDITS.md says where each one came from.
 * `npm run validate` checks every entry against the files on disk (see Assets in docs/TECH.md).
 *
 * Plain data with no imports, so the tools in tools/ can read it as well as the game.
 */

/** One image: UI art, fonts, portraits. */
export interface ImageAsset {
  readonly type: 'image';
  /** Relative to public/. */
  readonly url: string;
}

/** An image cut into a grid of equal frames: tilesets and character sprite sheets. */
export interface SpriteSheetAsset {
  readonly type: 'spritesheet';
  /** Relative to public/. */
  readonly url: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
}

export type AssetEntry = ImageAsset | SpriteSheetAsset;

const TILE = 16;

const image = (path: string): ImageAsset => ({ type: 'image', url: `assets/${path}` });

/** Tilesets and character sheets both use 16×16 frames. */
const sheet = (path: string): SpriteSheetAsset => ({
  type: 'spritesheet',
  url: `assets/${path}`,
  frameWidth: TILE,
  frameHeight: TILE,
});

export const ASSETS = {
  // Fonts. src/ui/fonts.ts turns each image into a bitmap font with the same key.
  'font.body': image('fonts/font-8x8.png'),
  'font.display': image('fonts/font-8x10.png'),

  'ui.dialogue-box': image('ui/dialog-box.png'),
  'ui.dialogue-box-portrait': image('ui/dialog-box-portrait.png'),
  'ui.dialogue-box-plain': image('ui/dialog-box-plain.png'),

  // Tilesets
  'tiles.floor': sheet('tiles/floor.png'), // grass, sand, dirt paths
  'tiles.water': sheet('tiles/water.png'), // sea, shorelines, docks
  'tiles.nature': sheet('tiles/nature.png'), // trees, bushes, rocks, flowers
  'tiles.relief': sheet('tiles/relief.png'), // cliffs
  'tiles.house': sheet('tiles/house.png'), // house fronts, roofs, fences, stalls
  'tiles.element': sheet('tiles/element.png'), // props and furniture
  'tiles.floor-detail': sheet('tiles/floor-detail.png'), // grass tufts, flowers, leaves
  'tiles.interior-wall': sheet('tiles/interior-wall.png'),
  'tiles.interior-floor': sheet('tiles/interior-floor.png'),
  'tiles.room-wall': sheet('tiles/room-wall.png'), // simple rectangular rooms

  // Characters: one column per direction (down, up, left, right) and a row per pose. Most sheets
  // have 7 rows (walk 0–3, attack, jump, special); tamsin and child have just 2 walk rows.
  'sprite.rowan': sheet('sprites/hunter.png'),
  'sprite.bram': sheet('sprites/knight.png'),
  'sprite.tamsin': sheet('sprites/old-woman.png'),
  'sprite.villager': sheet('sprites/villager.png'),
  'sprite.villager-2': sheet('sprites/villager-2.png'),
  'sprite.villager-3': sheet('sprites/villager-3.png'),
  'sprite.villager-4': sheet('sprites/villager-4.png'),
  'sprite.villager-5': sheet('sprites/villager-5.png'),
  'sprite.woman': sheet('sprites/woman.png'),
  'sprite.old-man': sheet('sprites/old-man.png'),
  'sprite.old-man-3': sheet('sprites/old-man-3.png'),
  'sprite.child': sheet('sprites/child.png'),
  'sprite.shadow': image('sprites/shadow.png'), // drawn under characters

  // Dialogue portraits, 38×38
  'portrait.rowan': image('portraits/hunter.png'),
  'portrait.bram': image('portraits/knight.png'),
  'portrait.tamsin': image('portraits/old-woman.png'),
} as const satisfies Record<string, AssetEntry>;

export type AssetKey = keyof typeof ASSETS;

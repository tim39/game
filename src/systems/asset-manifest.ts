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

/**
 * A sound, as an Ogg Vorbis file and an AAC (.m4a) one for browsers without Ogg, such as older
 * Safari. Phaser loads the first the browser can play. Keys say what it's for: `bgm.*` is music,
 * which loops, and `sfx.*` a sound effect.
 */
export interface AudioAsset {
  readonly type: 'audio';
  /** Relative to public/: the .ogg, then the .m4a. */
  readonly urls: readonly [ogg: string, m4a: string];
}

export type AssetEntry = ImageAsset | SpriteSheetAsset | AudioAsset;

const TILE = 16;

const image = (path: string): ImageAsset => ({ type: 'image', url: `assets/${path}` });

const frames = (path: string, frameWidth: number, frameHeight: number): SpriteSheetAsset => ({
  type: 'spritesheet',
  url: `assets/${path}`,
  frameWidth,
  frameHeight,
});

/** Tilesets and character sheets both use 16×16 frames. */
const sheet = (path: string): SpriteSheetAsset => frames(path, TILE, TILE);

/** `path` without its extension: both the .ogg and the .m4a are there. */
const sound = (path: string): AudioAsset => ({
  type: 'audio',
  urls: [`assets/${path}.ogg`, `assets/${path}.m4a`],
});

export const ASSETS = {
  // Fonts. src/ui/fonts.ts turns each image into a bitmap font with the same key.
  'font.body': image('fonts/font-8x8.png'),
  'font.display': image('fonts/font-8x10.png'),

  'ui.dialogue-box': image('ui/dialog-box.png'),
  'ui.dialogue-box-portrait': image('ui/dialog-box-portrait.png'),
  'ui.dialogue-box-plain': image('ui/dialog-box-plain.png'),
  'ui.choice-box': image('ui/choice-box.png'),

  // Touch controls, which the page draws over the game on phones and tablets.
  'touch.dpad': frames('ui/touch-dpad.png', 17, 17), // idle, then pressed up, down, left, right
  'touch.buttons': frames('ui/touch-buttons.png', 16, 15), // A, A pressed, B, B pressed
  'touch.menu': image('ui/touch-menu.png'), // 26×9

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
  'tiles.desert': sheet('tiles/desert.png'), // beach plants, and desert buildings for later
  'tiles.camp': sheet('tiles/camp.png'), // fire pits, logs, barrels, crates
  'tiles.bed': sheet('tiles/bed.png'), // beds and rugs
  'tiles.dungeon': sheet('tiles/dungeon.png'), // orbs on pedestals, crystals
  'tiles.boat': sheet('tiles/boat.png'), // a fishing boat, 5×2 tiles
  'tiles.lighthouse': sheet('tiles/lighthouse.png'), // Saltmere's lighthouse, 3×5 tiles

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

  // Things on the map that change, drawn as sprites rather than tiles.
  'object.chest': frames('sprites/treasure-chest.png', 16, 14), // shut, then open

  // Enemies in battle, by enemy ID: each a strip of the frames it loops through, facing right,
  // towards the party. Bosses are bigger.
  'monster.wolf': frames('monsters/dog-black.png', 18, 17),
  'monster.cave-bat': sheet('monsters/blue-bat.png'),
  'monster.reef-snail': sheet('monsters/mollusc.png'),
  'monster.grotto-octopus': sheet('monsters/octopus-2.png'),
  'monster.drowned-wisp': sheet('monsters/spirit.png'),
  'monster.drowned-warden': frames('monsters/giant-blue-samurai.png', 96, 48),

  // Battle effects, played once over whoever an action reaches: a hit of each kind and element,
  // healing and helpful statuses, harmful ones, and Guard.
  'vfx.slash': frames('vfx/cut.png', 32, 32),
  'vfx.claw': frames('vfx/claw.png', 32, 32),
  'vfx.fire': frames('vfx/flam.png', 25, 30),
  'vfx.water': frames('vfx/water.png', 40, 33),
  'vfx.wind': frames('vfx/spirit.png', 32, 32), // white, tinted when drawn
  'vfx.earth': frames('vfx/rock.png', 30, 30),
  'vfx.light': frames('vfx/circle-spark.png', 32, 32),
  'vfx.gloam': frames('vfx/smoke.png', 32, 32), // grey, tinted when drawn
  'vfx.heal': frames('vfx/spark.png', 27, 35),
  'vfx.ailment': frames('vfx/aura.png', 25, 24),
  'vfx.guard': frames('vfx/shield-blue.png', 24, 26),

  // Dialogue portraits, 38×38
  'portrait.rowan': image('portraits/hunter.png'),
  'portrait.bram': image('portraits/knight.png'),
  'portrait.tamsin': image('portraits/old-woman.png'),

  // Music, which loops (see Draft soundtrack in DESIGN.md), and sound effects.
  'bgm.title': sound('bgm/intro'),
  'bgm.saltmere': sound('bgm/calm-village'),
  'sfx.chest': sound('sfx/secret-2'),
} as const satisfies Record<string, AssetEntry>;

export type AssetKey = keyof typeof ASSETS;

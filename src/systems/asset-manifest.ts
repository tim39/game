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
  /**
   * For a fighter's sheet whose frames are bigger than an icon: where in the first frame the
   * `ICON_SIZE` square their icon on the battle timeline is cut from sits, round their face. Left
   * out, it's across the middle, at their feet.
   */
  readonly icon?: { readonly x: number; readonly y: number };
}

/** A fighter's icon on the battle timeline is a square this big, cut from their sheet. */
export const ICON_SIZE = 16;

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

const frames = (
  path: string,
  frameWidth: number,
  frameHeight: number,
  icon?: SpriteSheetAsset['icon'],
): SpriteSheetAsset => ({
  type: 'spritesheet',
  url: `assets/${path}`,
  frameWidth,
  frameHeight,
  ...(icon ? { icon } : {}),
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
  'tiles.drowned-warden': sheet('tiles/drowned-warden.png'), // the boss, standing guard, 5×3 tiles
  'tiles.lamp': sheet('tiles/lamp.png'), // a lamp on its post, unlit and lit, 1×2 tiles each
  'tiles.pyre-burning': sheet('tiles/pyre-burning.png'), // the Kindling pyre, burning, 2×2 tiles

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
  'sprite.old-man-2': sheet('sprites/old-man-2.png'),
  'sprite.old-man-3': sheet('sprites/old-man-3.png'),
  'sprite.monk': sheet('sprites/monk.png'),
  'sprite.monk-2': sheet('sprites/monk-2.png'),
  'sprite.princess': sheet('sprites/princess.png'),
  'sprite.child': sheet('sprites/child.png'),
  'sprite.shadow': image('sprites/shadow.png'), // drawn under characters

  // The Gloam's mist, tiled over a map whose mood has it (see src/scenes/field.ts).
  'overlay.mist': image('vfx/fog.png'),

  // Things on the map that change, drawn as sprites rather than tiles.
  'object.chest': frames('sprites/treasure-chest.png', 16, 14), // shut, then open

  // Enemies in battle, by enemy ID: each a strip of the frames it loops through, facing right,
  // towards the party. Bosses are bigger, and say where their face is, for the timeline's icon.
  'monster.wolf': frames('monsters/dog-black.png', 18, 17),
  'monster.cave-bat': sheet('monsters/blue-bat.png'),
  'monster.reef-snail': sheet('monsters/mollusc.png'),
  'monster.grotto-octopus': sheet('monsters/octopus-2.png'),
  'monster.drowned-wisp': sheet('monsters/spirit.png'),
  'monster.tide-jelly': sheet('monsters/slime.png'),
  'monster.sea-snake': sheet('monsters/snake-3.png'),
  'monster.drowned-warden': frames('monsters/giant-blue-samurai.png', 96, 48, { x: 40, y: 8 }),

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

  // Dialogue portraits, 38×38: the party, then Saltmere's people, each matching their sprite, and
  // the Drowned Warden.
  'portrait.rowan': image('portraits/hunter.png'),
  'portrait.bram': image('portraits/knight.png'),
  'portrait.tamsin': image('portraits/old-woman.png'),
  'portrait.hob': image('portraits/old-man-3.png'),
  'portrait.nell': image('portraits/woman.png'),
  'portrait.corin': image('portraits/villager-3.png'),
  'portrait.pip': image('portraits/child.png'),
  'portrait.gwen': image('portraits/villager-4.png'),
  'portrait.aled': image('portraits/monk.png'),
  'portrait.hal': image('portraits/monk-2.png'),
  'portrait.ewan': image('portraits/old-man-2.png'),
  'portrait.rhona': image('portraits/princess.png'),
  'portrait.jory': image('portraits/villager-5.png'),
  'portrait.dai': image('portraits/villager-2.png'),
  'portrait.drowned-warden': image('portraits/giant-blue-samurai.png'),

  // Music, which loops (see Draft soundtrack in DESIGN.md), and sound effects.
  'bgm.title': sound('bgm/intro'),
  'bgm.saltmere': sound('bgm/calm-village'),
  'bgm.tide-caves': sound('bgm/aquatic'),
  'bgm.battle': sound('bgm/fight'),
  'bgm.boss': sound('bgm/tension'),
  'bgm.gloam': sound('bgm/lost-village'),
  'sfx.chest': sound('sfx/secret-2'),
  'sfx.victory': sound('sfx/success-3'),
  'sfx.level-up': sound('sfx/level-up-1'),
  'sfx.game-over': sound('sfx/game-over-3'),
  'sfx.rest': sound('sfx/secret-4'),
  'sfx.heal': sound('sfx/heal-2'),
  // A lamp being lit, and the Kindling's flame leaping up.
  'sfx.fire': sound('sfx/fire'),
  // The Tide Caves: a sluice lever cranking, and the sea rushing in or out.
  'sfx.lever': sound('sfx/impact'),
  'sfx.tide': sound('sfx/wave'),
  // Menus: the cursor moving, a choice made, going back, a choice that can't be made now, and
  // buying or selling in a shop.
  'sfx.cursor': sound('sfx/move-3'),
  'sfx.confirm': sound('sfx/accept-5'),
  'sfx.cancel': sound('sfx/move-4'),
  'sfx.buzzer': sound('sfx/menu-11'),
  'sfx.trade': sound('sfx/gold-1'),
} as const satisfies Record<string, AssetEntry>;

export type AssetKey = keyof typeof ASSETS;

import Phaser from 'phaser';
import { ASSETS, type AssetKey } from '../systems/asset-manifest';
import { GAME_HEIGHT, GAME_WIDTH } from '../systems/display';
import { input } from '../systems/input/game-input';
import { FONT } from '../ui/fonts';

const KEYS = Object.keys(ASSETS) as AssetKey[];
/** Everything drawn: images and sprite sheets. */
const PICTURES = KEYS.filter((key) => ASSETS[key].type !== 'audio');
const SOUNDS = KEYS.filter((key) => ASSETS[key].type === 'audio');
const CHARACTERS = KEYS.filter(
  (key) => key.startsWith('sprite.') && ASSETS[key].type === 'spritesheet',
);
const PORTRAITS = KEYS.filter((key) => key.startsWith('portrait.'));

const SCALE = 2; // the world's scale
const COLUMN_WIDTH = 156; // four characters to a row
const ROW_HEIGHT = 56;
const PORTRAIT_WIDTH = 92; // six portraits to a row
const PORTRAIT_ROW = 96;
const PORTRAITS_PER_ROW = 6;
/** The strip along the bottom, which the hint sits in, over whatever scrolls under it. */
const FOOTER = 28;
const GRASS = 0x4f7a43; // so dark outlines show up
const BACKDROP = 0x14101c;
const TEXT = 0xe8e0f5;
const DIM = 0x8a7fa3;

/**
 * Debug only: every character sheet facing down, up, left and right, then the portraits, all at
 * the world's scale, to check curated art in the engine. Open it with
 * `__game.startScene('asset-gallery')`; Up and Down scroll, and Cancel goes back to the title.
 */
export class AssetGalleryScene extends Phaser.Scene {
  /** How far down it can scroll, to show the last row above the hint. */
  private maxScroll = 0;

  constructor() {
    super('asset-gallery');
  }

  create(): void {
    this.add.bitmapText(16, 10, FONT.body, 'Asset gallery').setScale(SCALE).setTint(TEXT);

    CHARACTERS.forEach((key, index) => {
      const x = 16 + (index % 4) * COLUMN_WIDTH;
      const y = 36 + Math.floor(index / 4) * ROW_HEIGHT;
      this.add.rectangle(x, y, 128, 32, GRASS).setOrigin(0);
      // Frames 0–3 are the first row: down, up, left, right.
      for (let frame = 0; frame < 4; frame++) {
        this.add
          .image(x + frame * 32, y, key, frame)
          .setOrigin(0)
          .setScale(SCALE);
      }
      this.add.bitmapText(x, y + 35, FONT.body, key.slice('sprite.'.length)).setTint(DIM);
    });

    const portraitsY = 36 + Math.ceil(CHARACTERS.length / 4) * ROW_HEIGHT + 6;
    PORTRAITS.forEach((key, index) => {
      const x = 16 + (index % PORTRAITS_PER_ROW) * PORTRAIT_WIDTH;
      const y = portraitsY + Math.floor(index / PORTRAITS_PER_ROW) * PORTRAIT_ROW;
      this.add.image(x, y, key).setOrigin(0).setScale(SCALE);
      const label = key.slice('portrait.'.length);
      this.add.bitmapText(x, y + 79, FONT.body, label).setTint(DIM);
    });
    const bottom = portraitsY + Math.ceil(PORTRAITS.length / PORTRAITS_PER_ROW) * PORTRAIT_ROW;
    this.maxScroll = Math.max(0, bottom + FOOTER - GAME_HEIGHT);

    // The hint stays put along the bottom as the rest scrolls.
    this.add
      .rectangle(0, GAME_HEIGHT - FOOTER, GAME_WIDTH, FOOTER, BACKDROP)
      .setOrigin(0)
      .setScrollFactor(0);
    this.add
      .bitmapText(16, GAME_HEIGHT - 20, FONT.body, 'Up, Down: scroll   Cancel: back to the title')
      .setTint(DIM)
      .setScrollFactor(0);
  }

  override update(): void {
    if (input.pressed('cancel')) this.scene.start('title');
    const camera = this.cameras.main;
    const step = input.pressedOrRepeated('down') ? 1 : input.pressedOrRepeated('up') ? -1 : 0;
    if (step !== 0) {
      camera.scrollY = Phaser.Math.Clamp(camera.scrollY + step * ROW_HEIGHT, 0, this.maxScroll);
    }
  }

  /** Read by `window.__game.inspect('asset-gallery')`: how every manifest key loaded. */
  debugInfo(): Record<string, unknown> {
    const textures = PICTURES.map((key) => {
      const texture = this.textures.get(key);
      const { width, height } = texture.getSourceImage();
      return {
        key,
        loaded: this.textures.exists(key),
        width,
        height,
        frames: texture.getFrameNames().length,
      };
    });
    const sounds = SOUNDS.map((key) => ({ key, loaded: this.cache.audio.exists(key) }));
    const camera = this.cameras.main;
    return {
      characters: CHARACTERS,
      portraits: PORTRAITS,
      textures,
      sounds,
      scroll: camera.scrollY,
      maxScroll: this.maxScroll,
    };
  }
}

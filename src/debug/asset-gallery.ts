import Phaser from 'phaser';
import { ASSETS, type AssetKey } from '../systems/asset-manifest';
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
const GRASS = 0x4f7a43; // so dark outlines show up
const TEXT = 0xe8e0f5;
const DIM = 0x8a7fa3;

/**
 * Debug only: every character sheet facing down, up, left and right, then the portraits, all at
 * the world's scale, to check curated art in the engine. Open it with
 * `__game.startScene('asset-gallery')`; Cancel goes back to the title.
 */
export class AssetGalleryScene extends Phaser.Scene {
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
      const x = 16 + index * 92;
      this.add.image(x, portraitsY, key).setOrigin(0).setScale(SCALE);
      const label = key.slice('portrait.'.length);
      this.add.bitmapText(x, portraitsY + 79, FONT.body, label).setTint(DIM);
    });

    this.add.bitmapText(16, 340, FONT.body, 'Cancel: back to the title').setTint(DIM);
  }

  override update(): void {
    if (input.pressed('cancel')) this.scene.start('title');
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
    return { characters: CHARACTERS, portraits: PORTRAITS, textures, sounds };
  }
}

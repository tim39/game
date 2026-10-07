import Phaser from 'phaser';
import { PICTURE_FADE_MS } from '../data/balance';
import { GAME_HEIGHT, GAME_WIDTH } from '../systems/display';
import { drawPicture, type DrawnPicture } from '../ui/picture';

export const PICTURE_SCENE = 'picture';

/** Drawn at the world's scale, 2×, as the field and its backdrops are. */
const SCALE = 2;

/** A frame longer than this (say, after the tab was hidden) counts as this long. */
const MAX_FRAME_MS = 100;

/**
 * Pictures over the field, as a script's `picture` shows them (see Event scripts in docs/TECH.md):
 * the intro's illustrations. It's an overlay, registered after the field and before the dialogue
 * box, so lines said show over a picture. A picture fades in over what's under it, by the camera's
 * alpha, and away again the same way.
 */
export class PictureScene extends Phaser.Scene {
  private picture?: DrawnPicture;

  constructor() {
    super(PICTURE_SCENE);
  }

  create(): void {
    this.picture = undefined;
    this.cameras.main
      .setZoom(SCALE)
      .centerOn(GAME_WIDTH / SCALE / 2, GAME_HEIGHT / SCALE / 2)
      .setAlpha(0);
  }

  override update(_time: number, delta: number): void {
    this.picture?.update(Math.min(delta, MAX_FRAME_MS));
  }

  /** The picture showing, if any. */
  get showing(): string | null {
    return this.picture?.id ?? null;
  }

  /**
   * Fades in a picture, from src/data/pictures.ts: over what's under it, or if one is showing
   * already, once that has faded away. Resolves once it's in.
   */
  async show(id: string): Promise<void> {
    if (this.picture) await this.fade(0);
    this.picture?.destroy();
    this.picture = drawPicture(this, id);
    await this.fade(1);
  }

  /** Fades the picture away, and resolves once it's gone. */
  async hide(): Promise<void> {
    if (!this.picture) return;
    await this.fade(0);
    this.picture.destroy();
    this.picture = undefined;
  }

  /** Takes the picture away at once, as a fresh start on the field leaves its script behind. */
  clear(): void {
    this.tweens.killAll();
    this.cameras.main.setAlpha(0);
    this.picture?.destroy();
    this.picture = undefined;
  }

  /** Read by `window.__game.inspect('picture')` in dev and test builds. */
  debugInfo(): Record<string, unknown> {
    return { picture: this.showing, alpha: this.cameras.main.alpha };
  }

  /** Fades the whole picture to `alpha`, over the picture fade's length. */
  private fade(alpha: number): Promise<void> {
    return new Promise((done) => {
      this.tweens.add({
        targets: this.cameras.main,
        alpha,
        duration: PICTURE_FADE_MS,
        onComplete: () => done(),
      });
    });
  }
}

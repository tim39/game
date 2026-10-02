import Phaser from 'phaser';

/** First scene. Anything the loading screen itself needs gets loaded here; for now that's nothing. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    this.scene.start('preload');
  }
}

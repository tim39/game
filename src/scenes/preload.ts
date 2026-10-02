import Phaser from 'phaser';

const BAR_WIDTH = 240;
const BAR_HEIGHT = 6;

/** Loads the assets for the title screen and beyond, with a progress bar. */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('preload');
  }

  preload(): void {
    const x = Math.round((this.scale.width - BAR_WIDTH) / 2);
    const y = Math.round(this.scale.height / 2);

    const frame = this.add.graphics();
    frame.lineStyle(1, 0x8a7fa3);
    frame.strokeRect(x - 2.5, y - 2.5, BAR_WIDTH + 5, BAR_HEIGHT + 5);

    const fill = this.add.graphics();
    this.load.on(Phaser.Loader.Events.PROGRESS, (progress: number) => {
      fill.clear();
      fill.fillStyle(0xf5c46b);
      fill.fillRect(x, y, Math.round(BAR_WIDTH * progress), BAR_HEIGHT);
    });
  }

  create(): void {
    this.scene.start('title');
  }
}

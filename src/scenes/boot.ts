import Phaser from 'phaser';

/** Placeholder first scene. M0's scaling task replaces it with the real Boot → Preload → Title chain. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    const { centerX, centerY } = this.cameras.main;

    const ember = this.add.circle(centerX, centerY - 56, 10, 0xffa040);
    this.tweens.add({
      targets: ember,
      scale: 1.35,
      alpha: 0.6,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.add
      .text(centerX, centerY, 'The Fifth Flame', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: '#f5c46b',
      })
      .setOrigin(0.5);

    this.add
      .text(centerX, centerY + 36, `Phaser ${Phaser.VERSION}`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#8a7fa3',
      })
      .setOrigin(0.5);
  }
}

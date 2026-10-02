import Phaser from 'phaser';

interface MenuItem {
  readonly label: string;
  readonly enabled: boolean;
}

const MENU: readonly MenuItem[] = [
  { label: 'New Game', enabled: true },
  { label: 'Continue', enabled: false },
  { label: 'Options', enabled: false },
];

const GOLD = '#f5c46b';
const TEXT = '#e8e0f5';
const DIM = '#5a5270';
const MENU_TOP = 196;
const MENU_SPACING = 22;

/** Placeholder title screen. M0's input and font tasks make the menu move and the text crisp. */
export class TitleScene extends Phaser.Scene {
  private selected = 0;
  private cursor?: Phaser.GameObjects.Graphics;

  constructor() {
    super('title');
  }

  create(): void {
    const centerX = this.scale.width / 2;

    const ember = this.add.circle(centerX, 64, 8, 0xffa040);
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
      .text(centerX, 116, 'The Fifth Flame', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: GOLD,
      })
      .setOrigin(0.5);

    MENU.forEach((item, index) => {
      this.add
        .text(centerX - 40, MENU_TOP + index * MENU_SPACING, item.label, {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: item.enabled ? TEXT : DIM,
        })
        .setOrigin(0, 0.5);
    });

    this.cursor = this.add.graphics();
    this.drawCursor();
  }

  private drawCursor(): void {
    if (!this.cursor) return;
    const x = this.scale.width / 2 - 56;
    const y = MENU_TOP + this.selected * MENU_SPACING;
    this.cursor.clear();
    this.cursor.fillStyle(0xf5c46b);
    this.cursor.fillTriangle(x, y - 5, x, y + 5, x + 6, y);
  }
}

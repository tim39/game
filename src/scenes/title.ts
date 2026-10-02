import Phaser from 'phaser';
import { input } from '../systems/input/game-input';
import { FONT } from '../ui/fonts';

interface MenuItem {
  readonly label: string;
  readonly enabled: boolean;
}

const MENU: readonly MenuItem[] = [
  { label: 'New Game', enabled: true },
  { label: 'Continue', enabled: false },
  { label: 'Options', enabled: false },
];

const GOLD = 0xf5c46b;
const TEXT = 0xe8e0f5;
const DIM = 0x5a5270;
const MENU_X = 264;
const MENU_TOP = 192;
const MENU_SPACING = 24;

/** Placeholder title screen until the real one arrives with the vertical slice (M6). */
export class TitleScene extends Phaser.Scene {
  private selected = 0;
  private cursorMoves = 0;
  private cursor?: Phaser.GameObjects.Graphics;

  constructor() {
    super('title');
  }

  create(): void {
    const centerX = this.scale.width / 2;
    this.selected = 0;
    this.cursorMoves = 0;

    const ember = this.add.circle(centerX, 56, 8, 0xffa040);
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
      .bitmapText(centerX, 104, FONT.display, 'The Fifth Flame')
      .setScale(4)
      .setOrigin(0.5)
      .setTint(GOLD);

    MENU.forEach((item, index) => {
      this.add
        .bitmapText(MENU_X, MENU_TOP + index * MENU_SPACING, FONT.body, item.label)
        .setScale(2)
        .setOrigin(0, 0.5)
        .setTint(item.enabled ? TEXT : DIM);
    });

    this.add
      .bitmapText(centerX, 330, FONT.body, 'Z, Enter or tap to choose')
      .setScale(2)
      .setOrigin(0.5)
      .setTint(DIM);

    this.cursor = this.add.graphics();
    this.drawCursor();
  }

  override update(): void {
    // Confirm first, so a press that lands in the same frame as a move picks what was on screen.
    if (input.pressed('confirm')) this.choose();
    if (input.pressedOrRepeated('down')) this.moveCursor(1);
    if (input.pressedOrRepeated('up')) this.moveCursor(-1);
  }

  /** Read by `window.__game.inspect('title')` in dev and test builds. */
  debugInfo(): Record<string, unknown> {
    return { selected: MENU[this.selected]?.label, cursorMoves: this.cursorMoves };
  }

  private moveCursor(step: number): void {
    this.selected = (this.selected + step + MENU.length) % MENU.length;
    this.cursorMoves += 1;
    this.drawCursor();
  }

  private choose(): void {
    if (!MENU[this.selected]?.enabled) return;
    // No real opening yet: New Game previews the dialogue box, then walks onto the test map.
    this.scene.start('dialogue-sample');
  }

  private drawCursor(): void {
    if (!this.cursor) return;
    const x = MENU_X - 20;
    const y = MENU_TOP + this.selected * MENU_SPACING;
    this.cursor.clear();
    this.cursor.fillStyle(GOLD);
    this.cursor.fillTriangle(x, y - 6, x, y + 6, x + 8, y);
  }
}

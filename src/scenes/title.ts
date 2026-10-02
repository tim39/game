import Phaser from 'phaser';
import { input } from '../systems/input/game-input';

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

/** Placeholder title screen. M0's font task makes the text crisp. */
export class TitleScene extends Phaser.Scene {
  private selected = 0;
  private cursorMoves = 0;
  private cursor?: Phaser.GameObjects.Graphics;
  private notice?: Phaser.GameObjects.Text;

  constructor() {
    super('title');
  }

  create(): void {
    const centerX = this.scale.width / 2;
    this.selected = 0;
    this.cursorMoves = 0;

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

    this.notice = this.add
      .text(centerX, MENU_TOP + MENU.length * MENU_SPACING + 24, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: GOLD,
      })
      .setOrigin(0.5);

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
    return {
      selected: MENU[this.selected]?.label,
      cursorMoves: this.cursorMoves,
      notice: this.notice?.text ?? '',
    };
  }

  private moveCursor(step: number): void {
    this.selected = (this.selected + step + MENU.length) % MENU.length;
    this.cursorMoves += 1;
    this.drawCursor();
  }

  private choose(): void {
    if (!MENU[this.selected]?.enabled) return;
    // There's no game to start yet; M1 replaces this with the opening.
    this.notice?.setText('The adventure begins in milestone M1.');
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

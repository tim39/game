import Phaser from 'phaser';
import { UI_TEXT } from '../data/ui-text';
import { audio } from '../systems/audio';
import { input } from '../systems/input/game-input';
import { touchMode } from '../systems/input/touch-controls';
import { saveSlots } from '../systems/saves';
import { loadGame, startNewGame } from '../systems/session';
import { FONT } from '../ui/fonts';
import type { FieldStart } from './field';
import { OPTIONS_SCENE, type OptionsStart } from './options';
import { SAVE_MENU_SCENE, type SaveMenuStart } from './save-menu';

interface MenuItem {
  readonly id: 'new-game' | 'continue' | 'options';
  readonly label: string;
  readonly enabled: boolean;
}

/** Continue is there once there's a save to carry on from. */
const menuItems = (canContinue: boolean): readonly MenuItem[] => [
  { id: 'new-game', label: 'New Game', enabled: true },
  { id: 'continue', label: 'Continue', enabled: canContinue },
  { id: 'options', label: 'Options', enabled: true },
];

const GOLD = 0xf5c46b;
const TEXT = 0xe8e0f5;
const DIM = 0x5a5270;
const MENU_X = 264;
const MENU_TOP = 192;
const MENU_SPACING = 24;
const MUSIC = 'bgm.title';

/** Placeholder title screen until the real one arrives with the vertical slice (M6). */
export class TitleScene extends Phaser.Scene {
  private menu: readonly MenuItem[] = menuItems(false);
  private selected = 0;
  private cursorMoves = 0;
  private cursor?: Phaser.GameObjects.Graphics;
  private hint?: Phaser.GameObjects.BitmapText;

  constructor() {
    super('title');
  }

  create(): void {
    const centerX = this.scale.width / 2;
    // With a save to continue from, the cursor starts on Continue.
    const canContinue = saveSlots.hasAny();
    this.menu = menuItems(canContinue);
    this.selected = canContinue ? 1 : 0;
    this.cursorMoves = 0;
    // It starts with the player's first key press or touch, which browsers wait for.
    audio.playMusic(MUSIC);

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

    this.menu.forEach((item, index) => {
      this.add
        .bitmapText(MENU_X, MENU_TOP + index * MENU_SPACING, FONT.body, item.label)
        .setScale(2)
        .setOrigin(0, 0.5)
        .setTint(item.enabled ? TEXT : DIM);
    });

    this.hint = this.add
      .bitmapText(centerX, 330, FONT.body, '')
      .setScale(2)
      .setOrigin(0.5)
      .setTint(DIM);
    this.showHint();

    this.cursor = this.add.graphics();
    this.drawCursor();
  }

  override update(): void {
    // A laptop with a touchscreen can switch to touch mode at any moment.
    this.showHint();
    // Confirm first, so a press that lands in the same frame as a move picks what was on screen.
    if (input.pressed('confirm')) this.choose();
    if (input.pressedOrRepeated('down')) this.moveCursor(1);
    if (input.pressedOrRepeated('up')) this.moveCursor(-1);
  }

  /** Read by `window.__game.inspect('title')` in dev and test builds. */
  debugInfo(): Record<string, unknown> {
    return {
      selected: this.menu[this.selected]?.label,
      items: this.menu.map(({ label, enabled }) => ({ label, enabled })),
      cursorMoves: this.cursorMoves,
      hint: this.hint?.text,
    };
  }

  private moveCursor(step: number): void {
    this.selected = (this.selected + step + this.menu.length) % this.menu.length;
    this.cursorMoves += 1;
    this.drawCursor();
  }

  private choose(): void {
    const item = this.menu[this.selected];
    if (!item?.enabled) return;
    if (item.id === 'continue') {
      this.continueGame();
      return;
    }
    if (item.id === 'options') {
      this.scene.pause();
      this.scene.launch(OPTIONS_SCENE, {
        onClose: () => this.scene.resume(),
      } satisfies OptionsStart);
      return;
    }
    // No real opening yet: New Game previews the dialogue box, then puts the player in Saltmere.
    startNewGame();
    this.scene.start('dialogue-sample');
  }

  /** Opens the save menu to pick a save, and carries on from it where it was saved. */
  private continueGame(): void {
    this.scene.pause();
    this.scene.launch(SAVE_MENU_SCENE, {
      mode: 'load',
      onClose: () => this.scene.resume(),
      onLoad: (state) => {
        loadGame(state);
        this.scene.start('field', state.location satisfies FieldStart);
      },
    } satisfies SaveMenuStart);
  }

  /** How to choose: with keys, or with the touch controls' A button. */
  private showHint(): void {
    const text = touchMode() ? UI_TEXT.chooseWithTouch : UI_TEXT.chooseWithKeys;
    if (this.hint && this.hint.text !== text) this.hint.setText(text);
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

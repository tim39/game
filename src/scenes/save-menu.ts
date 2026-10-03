import Phaser from 'phaser';
import type { GameState } from '../core/state';
import { MAPS } from '../data/maps';
import { SAVE_MENU_TEXT } from '../data/ui-text';
import { GAME_HEIGHT, GAME_WIDTH } from '../systems/display';
import { input } from '../systems/input/game-input';
import { touchMode } from '../systems/input/touch-controls';
import { saveSlots } from '../systems/saves';
import { session } from '../systems/session';
import { drawChoiceBox, nineSlice, type DrawnChoices } from '../ui/dialogue-box';
import { choiceBoxOnScreen } from '../ui/dialogue-layout';
import { FONT } from '../ui/fonts';
import {
  canChoose,
  openSaveMenu,
  saveFailed,
  saved,
  stepSaveMenu,
  type MenuSlot,
  type SaveMenu,
  type SaveMenuMode,
} from '../ui/save-menu-flow';
import { SAVE_MENU, SAVE_MENU_SCALE as SCALE, panelTop } from '../ui/save-menu-layout';
import { formatPlayTime, formatSavedAt } from '../ui/save-slot-text';

export const SAVE_MENU_SCENE = 'save-menu';

/**
 * How the save menu opens, over a scene that pauses until it closes:
 * `scene.launch(SAVE_MENU_SCENE, start)`.
 */
export interface SaveMenuStart {
  readonly mode: SaveMenuMode;
  /** Called as it closes without loading anything. */
  readonly onClose: () => void;
  /** To load: called with the game picked, as it closes. */
  readonly onLoad?: (state: GameState) => void;
}

const INK = 0x0b001e; // as in the dialogue box
const FADED_INK = 0x786c8c; // a slot that can't be chosen
const BACKDROP = 0x14101c;
const GOLD = 0xf5c46b;
const TEXT = 0xe8e0f5;
/** How much the slots not under the cursor show of the dark behind them. */
const UNSELECTED = 0.75;

/** What a slot shows, besides its name and the party. */
interface SlotLines {
  readonly place?: string;
  readonly level?: string;
  readonly playTime?: string;
  readonly savedAt?: string;
  /** For a slot with no save to show: empty, or one that can't be loaded. */
  readonly note?: string;
}

/**
 * The save menu, over the field or the title screen: the autosave and the three slots, each with
 * where the game was saved, who's in the party, how long it's been played and when it was saved.
 * Saving, Confirm saves the game in the slot under the cursor (asking first if that would save over
 * another); loading, it loads the save there. Cancel, or Menu, goes back. src/ui/save-menu-flow.ts
 * decides what happens; this draws it.
 */
export class SaveMenuScene extends Phaser.Scene {
  private start?: SaveMenuStart;
  private menu?: SaveMenu;
  private panels: Phaser.GameObjects.Container[] = [];
  private cursor?: Phaser.GameObjects.Graphics;
  private bottomLine?: Phaser.GameObjects.BitmapText;
  /** The Yes and No asked before saving over a slot. */
  private question?: DrawnChoices;

  constructor() {
    super(SAVE_MENU_SCENE);
  }

  create(start: SaveMenuStart): void {
    this.start = start;
    const menu = openSaveMenu(start.mode, saveSlots.readAll());
    this.menu = menu;
    // Over whatever opened it, which carries on drawing underneath.
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, BACKDROP).setOrigin(0);
    const title = SAVE_MENU_TEXT.title[start.mode];
    this.add
      .bitmapText(SAVE_MENU.title.x * SCALE, SAVE_MENU.title.y * SCALE, FONT.body, title)
      .setScale(SCALE)
      .setTint(GOLD);
    this.panels = menu.slots.map((entry, index) => this.drawSlot(menu, entry, index));
    // ▶, like the choice box's, over the panels.
    this.cursor = this.add.graphics().fillStyle(INK).fillTriangle(0, 0, 0, 10, 6, 5).setDepth(1);
    this.bottomLine = this.add
      .bitmapText(GAME_WIDTH / 2, SAVE_MENU.hintY * SCALE, FONT.body, '')
      .setScale(SCALE)
      .setOrigin(0.5, 0);
    this.question = undefined;
    this.render();
    // Closed, it has nothing to show or report.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.menu = undefined;
    });
  }

  override update(): void {
    const { menu, start } = this;
    if (!menu || !start) return;
    const move = input.pressedOrRepeated('down') ? 1 : input.pressedOrRepeated('up') ? -1 : 0;
    const step = stepSaveMenu(menu, {
      move,
      confirm: input.pressed('confirm'),
      cancel: input.pressed('cancel') || input.pressed('menu'),
    });
    this.menu = step.menu;
    switch (step.action) {
      case 'save':
        this.save();
        break;
      case 'load':
        this.loadPicked();
        return;
      case 'close':
        this.close(start.onClose);
        return;
      case null:
        break;
    }
    this.render();
  }

  /** Read by `window.__game.inspect('save-menu')` in dev and test builds: empty once it's closed. */
  debugInfo(): Record<string, unknown> {
    const { menu } = this;
    if (!menu) return {};
    const entry = menu.slots[menu.cursor];
    return {
      mode: menu.mode,
      cursor: menu.cursor,
      selected: entry ? SAVE_MENU_TEXT.slot(entry.slot) : null,
      overwrite:
        menu.overwrite === null ? null : [SAVE_MENU_TEXT.yes, SAVE_MENU_TEXT.no][menu.overwrite],
      bottomLine: this.bottomLine?.text,
      slots: menu.slots.map((slot) => ({
        slot: slot.slot,
        label: SAVE_MENU_TEXT.slot(slot.slot),
        enabled: canChoose(menu.mode, slot),
        kind: slot.contents.kind,
        party: slot.contents.kind === 'saved' ? slot.contents.save.state.party : [],
        ...slotLines(slot),
      })),
    };
  }

  /** Saves the game being played in the slot under the cursor, and shows it there. */
  private save(): void {
    const { menu } = this;
    const entry = menu?.slots[menu.cursor];
    if (!menu || !entry) return;
    try {
      saveSlots.write(entry.slot, session.state, new Date());
      this.menu = saved(menu, saveSlots.read(entry.slot));
    } catch (error) {
      console.warn("Couldn't save:", error);
      this.menu = saveFailed(menu);
    }
    this.panels[menu.cursor]?.destroy();
    const now = this.menu.slots[menu.cursor] ?? entry;
    this.panels[menu.cursor] = this.drawSlot(this.menu, now, menu.cursor);
  }

  /** Closes, and hands the save under the cursor to whoever opened the menu. */
  private loadPicked(): void {
    const entry = this.menu?.slots[this.menu.cursor];
    if (entry?.contents.kind !== 'saved') return;
    const { state } = entry.contents.save;
    this.close(() => this.start?.onLoad?.(state));
  }

  /**
   * Closes the menu. Scene changes wait for the next frame, so the scene underneath doesn't carry
   * on until then, and never sees the press that closed it.
   */
  private close(then: () => void): void {
    this.menu = undefined;
    this.scene.stop();
    then();
  }

  private render(): void {
    const { menu, cursor, bottomLine } = this;
    if (!menu || !cursor || !bottomLine) return;
    // The slot under the cursor stands out, even where a thumb or a touch control covers the ▶.
    this.panels.forEach((panel, index) => panel.setAlpha(index === menu.cursor ? 1 : UNSELECTED));
    cursor.setPosition(
      (SAVE_MENU.panel.x + SAVE_MENU.cursorX) * SCALE,
      (panelTop(menu.cursor) + SAVE_MENU.middleY + 1) * SCALE,
    );
    if (menu.overwrite !== null && !this.question) this.question = this.drawQuestion(menu.cursor);
    if (menu.overwrite === null && this.question) {
      this.question.container.destroy();
      this.question = undefined;
    }
    this.question?.pointAt(menu.overwrite ?? 0);
    const { text, tint } = this.bottomText(menu);
    bottomLine.setText(text).setTint(tint);
  }

  /** What the line at the bottom says: a question, what just happened, or what the buttons do. */
  private bottomText(menu: SaveMenu): { text: string; tint: number } {
    const entry = menu.slots[menu.cursor];
    const slot = entry ? SAVE_MENU_TEXT.slot(entry.slot) : '';
    if (menu.overwrite !== null) return { text: SAVE_MENU_TEXT.overwrite(slot), tint: GOLD };
    if (menu.notice === 'saved') return { text: SAVE_MENU_TEXT.saved(slot), tint: GOLD };
    if (menu.notice === 'failed') return { text: SAVE_MENU_TEXT.failed, tint: GOLD };
    const hints = touchMode() ? SAVE_MENU_TEXT.hint.touch : SAVE_MENU_TEXT.hint.keys;
    return { text: hints[menu.mode], tint: TEXT };
  }

  /** A slot's panel: its name, then the party, where, the leader's level, play time and when. */
  private drawSlot(menu: SaveMenu, entry: MenuSlot, index: number): Phaser.GameObjects.Container {
    const { panel, labelX, placeX, rightX, middleY, partyX, spriteSize } = SAVE_MENU;
    const container = this.add.container(panel.x * SCALE, panelTop(index) * SCALE);
    container.add(nineSlice(this, 'ui.choice-box', 0, 0, panel.width, panel.height, panel.frame));

    const enabled = canChoose(menu.mode, entry);
    const lines = slotLines(entry);
    const [first, second] = SAVE_MENU.lineY;
    const texts: [x: number, y: number, text: string | undefined, rightAligned?: boolean][] = [
      [labelX, middleY, SAVE_MENU_TEXT.slot(entry.slot)],
      [placeX, middleY, lines.note],
      [placeX, first, lines.place],
      [placeX, second, lines.level],
      [rightX, first, lines.playTime, true],
      [rightX, second, lines.savedAt, true],
    ];
    for (const [x, y, text, rightAligned = false] of texts) {
      if (text === undefined) continue;
      container.add(
        this.add
          .bitmapText(x * SCALE, y * SCALE, FONT.body, text)
          .setScale(SCALE)
          .setTint(enabled ? INK : FADED_INK)
          .setOrigin(rightAligned ? 1 : 0, 0),
      );
    }

    // Who's in the party, as they look on the field, facing out of the screen.
    if (entry.contents.kind === 'saved') {
      const top = ((panel.height - spriteSize) / 2) * SCALE;
      entry.contents.save.state.party.forEach((id, position) => {
        const key = `sprite.${id}`;
        if (!this.textures.exists(key)) return;
        const x = (partyX + position * spriteSize) * SCALE;
        container.add(
          this.add
            .image(x, top, key, 0)
            .setOrigin(0)
            .setScale(SCALE)
            .setAlpha(enabled ? 1 : 0.5),
        );
      });
    }
    return container;
  }

  /** Yes and No, beside the slot's panel at its right: under it, or over the last one. */
  private drawQuestion(index: number): DrawnChoices {
    const options = [SAVE_MENU_TEXT.yes, SAVE_MENU_TEXT.no];
    const choices = drawChoiceBox(this, options);
    const { width, height } = choiceBoxOnScreen(Math.max(...choices.widths), options.length);
    const { panel } = SAVE_MENU;
    const right = (panel.x + panel.width) * SCALE;
    const below = index < (this.menu?.slots.length ?? 0) - 1;
    const y = below
      ? (panelTop(index) + panel.height - 2) * SCALE
      : (panelTop(index) + 2) * SCALE - height;
    choices.container.setPosition(right - width, y).setDepth(2);
    return choices;
  }
}

/** What a slot shows: where the game was saved and so on, or why there's nothing to show. */
function slotLines({ contents }: MenuSlot): SlotLines {
  switch (contents.kind) {
    case 'empty':
      return { note: SAVE_MENU_TEXT.empty };
    case 'unreadable':
      return { note: contents.problem === 'newer' ? SAVE_MENU_TEXT.newer : SAVE_MENU_TEXT.damaged };
    case 'saved': {
      const { state, savedAt } = contents.save;
      const leader = state.party[0];
      const level = leader === undefined ? undefined : state.members[leader]?.level;
      return {
        place: MAPS[state.location.map]?.name ?? state.location.map,
        level: level === undefined ? undefined : SAVE_MENU_TEXT.level(level),
        playTime: formatPlayTime(state.playTimeMs),
        savedAt: formatSavedAt(savedAt, SAVE_MENU_TEXT.months),
      };
    }
  }
}

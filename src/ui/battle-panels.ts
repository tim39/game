import Phaser from 'phaser';
import type { FighterId, FighterStatus } from '../core/battle/fighter';
import { BATTLE_TEXT } from '../data/ui-text';
import { BATTLE_LAYOUT, type Box } from './battle-layout';
import { LIST_COLUMNS, LIST_ROWS, ROOT_COMMANDS, type BattleMenu } from './battle-menu';
import type { BattleView, FighterView } from './battle-view';
import { FONT } from './fonts';
import { lineText, type VictoryPage } from './victory-pages';

/**
 * Colours on the pack's cream panels: ink, as in the dialogue box; faded ink for what can't be
 * chosen; the frame's brown for labels and for whoever's turn it is; and the HP gauge's.
 */
const INK = 0x0b001e;
const FADED_INK = 0x9a8c9e;
const BROWN = 0x965340;
const GAUGE_BACK = 0xd3865f;
const GAUGE = 0x3f9d5a;
const GAUGE_LOW = 0xd8463a;
/** Statuses that help show in green, and those that hurt in purple. */
const HELPFUL = 0x2f7d4f;
const HARMFUL = 0x8e2f73;

const { frame, inset, lineHeight, cursor: CURSOR, listColumn, gainColumns } = BATTLE_LAYOUT;
/** How many statuses a party member's line has room for. */
const TAGS = 2;

/** The statuses that do their fighter good. */
const GOOD: ReadonlySet<FighterStatus> = new Set([
  'regen',
  'haste',
  'atk-up',
  'def-up',
  'mag-up',
  'res-up',
  'guard',
]);
export const isHelpful = (status: FighterStatus): boolean => GOOD.has(status);

/** A party member's line in the status panel. */
interface StatusLine {
  readonly name: Phaser.GameObjects.BitmapText;
  readonly hpLabel: Phaser.GameObjects.BitmapText;
  readonly hp: Phaser.GameObjects.BitmapText;
  readonly mpLabel: Phaser.GameObjects.BitmapText;
  readonly mp: Phaser.GameObjects.BitmapText;
  readonly tags: readonly Phaser.GameObjects.BitmapText[];
}

/** A skill or item in the list: its name, and its cost or count. */
interface ListLine {
  readonly label: Phaser.GameObjects.BitmapText;
  readonly detail: Phaser.GameObjects.BitmapText;
}

/**
 * The battle's windows: the banner along the top, the command window, and the party's status, which
 * a skill or item list takes the place of while one is open, and the victory panel, which takes the
 * place of both once the battle is won. Drawn on the battle's own pixels (see
 * src/ui/battle-layout.ts), over the field, in the pack's choice box, like the save menu's slots.
 */
export class BattlePanels {
  private readonly bannerPanel: Phaser.GameObjects.Container;
  private readonly bannerText: Phaser.GameObjects.BitmapText;
  private readonly commandPanel: Phaser.GameObjects.Container;
  private readonly commandLabels: Phaser.GameObjects.BitmapText[];
  private readonly statusPanel: Phaser.GameObjects.Container;
  private readonly statusLines: StatusLine[] = [];
  private readonly gauges: Phaser.GameObjects.Graphics;
  private readonly listPanel: Phaser.GameObjects.Container;
  private readonly listLines: ListLine[];
  private readonly listArrows: Phaser.GameObjects.Graphics;
  private readonly cursor: Phaser.GameObjects.Graphics;
  /** The ▼ in the banner that says Confirm goes on. */
  private readonly promptMark: Phaser.GameObjects.Graphics;
  private readonly victoryPanel: Phaser.GameObjects.Container;
  /** Text for the victory panel's pages, made as they need it. */
  private readonly victoryTexts: Phaser.GameObjects.BitmapText[] = [];
  /** The ▼ in the victory panel, which takes the place of the banner's while it shows. */
  private readonly victoryMark: Phaser.GameObjects.Graphics;
  private victoryPage: VictoryPage | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth: number,
  ) {
    const { banner, commands, status } = BATTLE_LAYOUT;
    this.bannerPanel = this.panel(banner);
    this.bannerText = this.text(banner.width / 2, banner.height / 2 - 4).setOrigin(0.5, 0);
    this.promptMark = this.downMark(banner.width - frame - 8, banner.height / 2 - 1);
    this.bannerPanel.add([this.bannerText, this.promptMark]).setVisible(false);

    this.commandPanel = this.panel(commands);
    this.commandLabels = ROOT_COMMANDS.map(({ id, at }) => {
      const label = this.text(...commandSpot(at), BATTLE_TEXT.commands[id]);
      this.commandPanel.add(label);
      return label;
    });
    this.commandPanel.setVisible(false);

    this.statusPanel = this.panel(status);
    this.gauges = scene.add.graphics();
    this.statusPanel.add(this.gauges);

    this.listPanel = this.panel(status);
    this.listLines = Array.from({ length: LIST_COLUMNS * LIST_ROWS }, (_, index) => {
      const [x, y] = listSpot(index);
      const line = { label: this.text(x, y), detail: this.text(x, y).setOrigin(1, 0) };
      line.detail.setX(x - CURSOR + listColumn.detailRight);
      this.listPanel.add([line.label, line.detail]);
      return line;
    });
    this.listArrows = scene.add.graphics();
    this.listPanel.add(this.listArrows).setVisible(false);

    const { victory } = BATTLE_LAYOUT;
    this.victoryPanel = this.panel(victory);
    this.victoryMark = this.downMark(victory.width - frame - 8, victory.height - frame - 6);
    this.victoryPanel.add(this.victoryMark).setVisible(false);

    // ▶, like the choice box's, over the windows.
    this.cursor = scene.add
      .graphics()
      .fillStyle(INK)
      .fillTriangle(0, 0, 0, 5, 3, 2.5)
      .setDepth(depth + 1)
      .setVisible(false);
  }

  /** Shows a message in the banner, or with null, hides it. */
  banner(text: string | null): void {
    this.bannerPanel.setVisible(text !== null);
    if (text !== null && this.bannerText.text !== text) this.bannerText.setText(text);
  }

  /**
   * Shows or hides the bobbing ▼ that says Confirm goes on: in the victory panel while it shows,
   * and otherwise in the banner.
   */
  prompt(visible: boolean): void {
    const victory = this.victoryPage !== null;
    this.promptMark.setVisible(visible && !victory);
    this.victoryMark.setVisible(visible && victory);
  }

  /**
   * Shows a page of the victory panel, in the command window's and the status panel's place, or
   * with null puts it away. Its text is in ink; in a row of stat gains, each stat's name is in
   * brown, as in the status panel, with what it went up by after it.
   */
  showVictory(page: VictoryPage | null): void {
    this.victoryPage = page;
    this.victoryPanel.setVisible(page !== null);
    this.statusPanel.setVisible(page === null);
    for (const text of this.victoryTexts) text.setVisible(false);
    if (!page) return;
    let used = 0;
    const next = (x: number, y: number, text: string, tint: number): void => {
      let shown = this.victoryTexts[used];
      if (!shown) {
        shown = this.text(0, 0);
        this.victoryTexts.push(shown);
        this.victoryPanel.add(shown);
      }
      shown.setPosition(x, y).setText(text).setTint(tint).setVisible(true);
      used++;
    };
    const left = frame + inset.x;
    page.lines.forEach((line, row) => {
      const y = frame + inset.y + row * lineHeight;
      if ('text' in line) {
        next(left, y, line.text, INK);
        return;
      }
      line.gains.forEach(({ label, amount }, column) => {
        const x = left + column * gainColumns.width;
        next(x, y, label, BROWN);
        next(x + gainColumns.amount, y, amount, INK);
      });
    });
  }

  /** The victory panel's lines as shown, for the debug info: none while it's away. */
  victoryText(): string[] {
    return this.victoryPage?.lines.map(lineText) ?? [];
  }

  /** What the banner says, if it's showing. */
  get bannerShown(): string | null {
    return this.bannerPanel.visible ? this.bannerText.text : null;
  }

  /**
   * Shows the party's HP, MP and statuses: a line each, with whoever's turn it is picked out, and
   * HP gauges that turn red when low.
   */
  showStatus(view: BattleView, active: FighterId | null): void {
    const party = view.filter((fighter) => fighter.side === 'party');
    while (this.statusLines.length < party.length) this.statusLines.push(this.statusLine());
    this.gauges.clear();
    party.forEach((fighter, row) => {
      const line = this.statusLines[row];
      if (line) this.drawStatusLine(line, row, fighter, fighter.id === active);
    });
  }

  /**
   * Shows the menu: the command window with the cursor on a command, or a skill or item list in
   * the status panel's place. With null, or while aiming, only what's under it shows.
   */
  showMenu(menu: BattleMenu | null): void {
    const page = menu?.page ?? null;
    const aimingFrom = menu?.aiming?.from ?? null;
    this.commandPanel.setVisible(menu !== null);
    const listPage = page === 'skills' || page === 'items' ? page : null;
    this.listPanel.setVisible(listPage !== null);
    this.statusPanel.setVisible(listPage === null);
    this.cursor.setVisible(menu !== null && page !== 'target');
    if (!menu) return;

    menu.commands.forEach((entry, index) => {
      this.commandLabels[index]?.setTint(entry.enabled ? INK : FADED_INK);
    });
    if (page === 'commands' || (page === 'target' && aimingFrom === 'commands')) {
      const at = ROOT_COMMANDS[menu.cursor.commands]?.at;
      if (at) this.pointAt(BATTLE_LAYOUT.commands, ...commandSpot(at));
    }
    if (!listPage) return;
    const entries = menu[listPage];
    const top = menu.top[listPage];
    this.listLines.forEach(({ label, detail }, index) => {
      const entry = entries[top * LIST_COLUMNS + index];
      label.setText(entry?.label ?? '').setTint(entry?.enabled ? INK : FADED_INK);
      detail.setText(entry?.detail ?? '').setTint(entry?.enabled ? INK : FADED_INK);
    });
    const shown = menu.cursor[listPage] - top * LIST_COLUMNS;
    this.pointAt(BATTLE_LAYOUT.status, ...listSpot(shown));
    // Arrows at the right when there's more above or below.
    const rows = Math.ceil(entries.length / LIST_COLUMNS);
    const { width, height } = BATTLE_LAYOUT.status;
    const x = width - frame - 3;
    this.listArrows.clear().fillStyle(BROWN);
    if (top > 0) this.listArrows.fillTriangle(x - 2, frame + 4, x + 2, frame + 4, x, frame + 1);
    if (top + LIST_ROWS < rows) {
      const y = height - frame - 4;
      this.listArrows.fillTriangle(x - 2, y, x + 2, y, x, y + 3);
    }
  }

  /** The party's lines as drawn, for the debug info. */
  statusText(): string[] {
    return this.statusLines
      .filter((line) => line.name.visible)
      .map((line) =>
        [line.name, line.hpLabel, line.hp, line.mpLabel, line.mp, ...line.tags]
          .map((text) => text.text)
          .filter((text) => text !== '')
          .join(' '),
      );
  }

  private drawStatusLine(line: StatusLine, row: number, fighter: FighterView, active: boolean) {
    const { name, hpLabel, hpRight, mpLabel, mpRight, tags } = BATTLE_LAYOUT.statusColumns;
    const left = frame + inset.x;
    const y = frame + inset.y + row * lineHeight;
    const down = fighter.hp === 0;
    line.name
      .setPosition(left + name, y)
      .setText(fighter.name)
      .setTint(down ? FADED_INK : active ? BROWN : INK);
    line.hpLabel
      .setPosition(left + hpLabel, y)
      .setText(BATTLE_TEXT.hp)
      .setTint(BROWN);
    line.hp
      .setPosition(left + hpRight, y)
      .setText(`${fighter.hp}/${fighter.maxHp}`)
      .setTint(down ? FADED_INK : INK);
    line.mpLabel
      .setPosition(left + mpLabel, y)
      .setText(BATTLE_TEXT.mp)
      .setTint(BROWN);
    line.mp
      .setPosition(left + mpRight, y)
      .setText(String(fighter.mp))
      .setTint(down ? FADED_INK : INK);
    const shown = fighter.statuses.slice(0, TAGS);
    let x = left + tags;
    line.tags.forEach((tag, index) => {
      const status = shown[index];
      const more = index === TAGS - 1 && fighter.statuses.length > TAGS ? '+' : '';
      tag.setPosition(x, y);
      if (status === undefined) {
        tag.setText('');
        return;
      }
      tag
        .setText(BATTLE_TEXT.statuses[status].tag + more)
        .setTint(isHelpful(status) ? HELPFUL : HARMFUL);
      x += tag.width + 3;
    });

    // The HP gauge, under the HP.
    const gaugeX = left + hpLabel;
    const gaugeWidth = hpRight - hpLabel;
    const share = fighter.maxHp > 0 ? fighter.hp / fighter.maxHp : 0;
    const filled = fighter.hp > 0 ? Math.max(1, Math.round(gaugeWidth * share)) : 0;
    this.gauges
      .fillStyle(GAUGE_BACK)
      .fillRect(gaugeX, y + 9, gaugeWidth, 1)
      .fillStyle(share <= 0.25 ? GAUGE_LOW : GAUGE)
      .fillRect(gaugeX, y + 9, filled, 1);
  }

  private statusLine(): StatusLine {
    const line = {
      name: this.text(0, 0),
      hpLabel: this.text(0, 0),
      hp: this.text(0, 0).setOrigin(1, 0),
      mpLabel: this.text(0, 0),
      mp: this.text(0, 0).setOrigin(1, 0),
      tags: Array.from({ length: TAGS }, () => this.text(0, 0)),
    };
    this.statusPanel.add([line.name, line.hpLabel, line.hp, line.mpLabel, line.mp, ...line.tags]);
    return line;
  }

  /** A ▼ bobbing at a spot in a panel, hidden until `prompt` shows it. */
  private downMark(x: number, y: number): Phaser.GameObjects.Graphics {
    const mark = this.scene.add.graphics().fillStyle(INK).fillTriangle(0, 0, 5, 0, 2.5, 3);
    mark.setPosition(x, y).setVisible(false);
    this.scene.tweens.add({ targets: mark, y: y + 1.5, duration: 400, yoyo: true, repeat: -1 });
    return mark;
  }

  /** Puts the ▶ before a spot in a panel, level with the middle of the letters. */
  private pointAt(panel: Box, x: number, y: number): void {
    this.cursor.setPosition(panel.x + x - 5, panel.y + y + 1.5);
  }

  /** A window: the choice box, nine-sliced to fill `box`, which things are put in. */
  private panel(box: Box): Phaser.GameObjects.Container {
    const back = this.scene.add
      .nineslice(
        0,
        0,
        'ui.choice-box',
        undefined,
        box.width,
        box.height,
        frame,
        frame,
        frame,
        frame,
      )
      .setOrigin(0);
    return this.scene.add.container(box.x, box.y, [back]).setDepth(this.depth);
  }

  private text(x: number, y: number, text = ''): Phaser.GameObjects.BitmapText {
    return this.scene.add.bitmapText(x, y, FONT.body, text).setTint(INK);
  }
}

/** Where a command's label goes in the command window, with room for the ▶ before it. */
function commandSpot(at: { readonly col: number; readonly row: number }): [number, number] {
  const x = frame + inset.x + CURSOR + at.col * BATTLE_LAYOUT.secondCommand;
  const y = frame + inset.y + at.row * lineHeight;
  return [x, y];
}

/** Where the `index`th line in view of a skill or item list goes, with room for the ▶ before it. */
function listSpot(index: number): [number, number] {
  const col = index % LIST_COLUMNS;
  const row = Math.floor(index / LIST_COLUMNS);
  return [frame + inset.x + CURSOR + col * listColumn.width, frame + inset.y + row * lineHeight];
}

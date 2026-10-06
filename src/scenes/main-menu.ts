import Phaser from 'phaser';
import { DIRECTIONS } from '../core/direction';
import { SLOTS } from '../core/equipment';
import { castSkill, useItem } from '../core/field-use';
import { memberStats } from '../core/party';
import { equip, unequip, type CharacterId } from '../core/state';
import type { Stat, Stats } from '../core/stats';
import { BATTLE_TUNING, EXP_CURVE } from '../data/balance';
import { DB } from '../data/db';
import { MAPS } from '../data/maps';
import { BATTLE_TEXT, MENU_TEXT } from '../data/ui-text';
import { input } from '../systems/input/game-input';
import { session } from '../systems/session';
import type { Box } from '../ui/battle-layout';
import { FONT, textMeasurer } from '../ui/fonts';
import {
  LIST_ROWS,
  aimedAt,
  aimsAtAll,
  entriesOf,
  gearComparison,
  openMainMenu,
  partySummary,
  settleMainMenu,
  shownPage,
  statusSkills,
  stepMainMenu,
  summaryOf,
  type MainMenu,
  type MemberSummary,
  type MenuAction,
  type MenuEntry,
  type MenuWorld,
  type OpenPage,
} from '../ui/main-menu-flow';
import { MENU_HEIGHT, MENU_LAYOUT, MENU_SCALE, MENU_WIDTH } from '../ui/main-menu-layout';
import { formatPlayTime } from '../ui/save-slot-text';
import { wrapText } from '../ui/text-wrap';
import { OPTIONS_SCENE, type OptionsStart } from './options';
import { SAVE_MENU_SCENE, type SaveMenuStart } from './save-menu';

export const MAIN_MENU_SCENE = 'main-menu';

/** How the main menu opens over the field, which pauses until it closes. */
export interface MainMenuStart {
  /** Called as it closes. */
  readonly onClose: () => void;
}

/** Colours on the pack's cream panels, as in battle: ink, faded ink, the frame's brown. */
const INK = 0x0b001e;
const FADED_INK = 0x9a8c9e;
const BROWN = 0x965340;
const BACKDROP = 0x14101c;
const GAUGE_BACK = 0xd3865f;
const GAUGE = 0x3f9d5a;
const GAUGE_LOW = 0xd8463a;
/** A stat a change of gear raises, and one it lowers. */
const BETTER = 0x2f7d4f;
const WORSE = 0xc0392b;
/** A KO'd member's portrait, greyed out. */
const DOWN = 0x8a7fa3;

/** The stats on Equip and Status: two columns of four, the most HP and MP first. */
const STAT_COLUMNS: readonly (readonly Stat[])[] = [
  ['hp', 'mp', 'atk', 'def'],
  ['mag', 'res', 'spd'],
];

const { frame, content, lineHeight, cursor: CURSOR, member: ROW, memberColumns: COL } = MENU_LAYOUT;

/** What the panels show, for the debug info. */
interface Shown {
  party: string[];
  list: string[];
  info: string[];
  stats: string[];
}

/**
 * The main menu, over the field (see Screens in docs/DESIGN.md): Items, Skills, Equip, Status,
 * Options and Save, beside the party at a glance, with the gold, the play time and where the party
 * is. src/ui/main-menu-flow.ts decides what happens; this draws it, a page at a time, in the pack's
 * cream panels, and does what's chosen to the game: using items and casting skills
 * (src/core/field-use.ts) and changing gear. Options and Save open their screens over it.
 */
export class MainMenuScene extends Phaser.Scene {
  private start?: MainMenuStart;
  private menu?: MainMenu;
  /** Everything that changes as the pages do, made afresh each time. */
  private page?: Phaser.GameObjects.Container;
  private shown: Shown = { party: [], list: [], info: [], stats: [] };
  private widthOf: (text: string) => number = (text) => text.length;

  constructor() {
    super(MAIN_MENU_SCENE);
  }

  create(start: MainMenuStart): void {
    this.start = start;
    this.menu = openMainMenu();
    this.widthOf = textMeasurer(this, FONT.body);
    this.cameras.main.setZoom(MENU_SCALE).centerOn(MENU_WIDTH / 2, MENU_HEIGHT / 2);
    this.add.rectangle(0, 0, MENU_WIDTH, MENU_HEIGHT, BACKDROP).setOrigin(0);
    for (const box of [MENU_LAYOUT.main, MENU_LAYOUT.commands, MENU_LAYOUT.info]) this.panel(box);
    this.page = this.add.container(0, 0);
    this.render();
    // Closed, it has nothing to show or report.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.menu = undefined;
    });
  }

  override update(): void {
    const { menu } = this;
    if (!menu) return;
    const step = stepMainMenu(
      menu,
      {
        move: DIRECTIONS.find((direction) => input.pressedOrRepeated(direction)) ?? null,
        confirm: input.pressed('confirm'),
        cancel: input.pressed('cancel'),
        menu: input.pressed('menu'),
      },
      this.world(),
    );
    this.menu = step.menu;
    if (step.action) this.act(step.action);
    if (this.menu && (step.menu !== menu || step.action)) this.render();
  }

  /** Read by `window.__game.inspect('main-menu')` in dev and test builds: empty once it's closed. */
  debugInfo(): Record<string, unknown> {
    const { menu } = this;
    if (!menu) return {};
    const world = this.world();
    const open = shownPage(menu);
    const entries = entriesOf(open.page, world);
    return {
      page: open.page,
      cursor: open.cursor,
      top: open.top,
      selected: entries[open.cursor]?.label ?? null,
      entries: entries.map(({ label, detail, enabled }) => ({ label, detail, enabled })),
      aimed: aimedAt(menu, world),
      ...this.shown,
    };
  }

  // Doing what's chosen.

  private world(): MenuWorld {
    return { state: session.state, db: DB, curve: EXP_CURVE };
  }

  private act(action: MenuAction): void {
    const { state } = session;
    switch (action.type) {
      case 'use':
        session.state = useItem(state, action.item, action.on, DB);
        break;
      case 'cast':
        session.state = castSkill(state, action.member, action.skill, action.on, DB, BATTLE_TUNING);
        break;
      case 'equip':
        session.state = equip(state, action.member, action.item, DB);
        break;
      case 'unequip':
        session.state = unequip(state, action.member, action.slot);
        break;
      case 'options':
        this.openOver(OPTIONS_SCENE, { onClose: () => this.scene.resume() } satisfies OptionsStart);
        return;
      case 'save':
        this.openOver(SAVE_MENU_SCENE, {
          mode: 'save',
          onClose: () => this.scene.resume(),
        } satisfies SaveMenuStart);
        return;
      case 'close':
        this.close();
        return;
    }
    if (this.menu) this.menu = settleMainMenu(this.menu, this.world());
  }

  /** Opens the save menu or the Options screen over this one, which waits until it closes. */
  private openOver(scene: string, start: SaveMenuStart | OptionsStart): void {
    this.scene.pause();
    this.scene.launch(scene, start);
  }

  /**
   * Closes the menu. Scene changes wait for the next frame, so the field doesn't carry on until
   * then, and never sees the press that closed it.
   */
  private close(): void {
    this.menu = undefined;
    this.scene.stop();
    this.start?.onClose();
  }

  // Drawing.

  /** Draws the page showing, and the commands and the info panel beside it. */
  private render(): void {
    const { menu, page } = this;
    if (!menu || !page) return;
    page.removeAll(true);
    this.shown = { party: [], list: [], info: [], stats: [] };
    const world = this.world();
    const open = shownPage(menu);
    const entries = entriesOf(open.page, world);
    this.drawCommands(menu, world);
    switch (open.page.kind) {
      case 'commands':
        this.drawParty(world, [], []);
        this.drawInfo(this.whereabouts());
        return;
      case 'items':
        this.drawList(open, entries, MENU_LAYOUT.listTop.alone, LIST_ROWS.items);
        this.drawInfo(this.helpOf(entries[open.cursor]));
        return;
      case 'item-on':
      case 'skill-on':
      case 'whose': {
        const enabled = entries.flatMap((entry, index) => {
          const id = world.state.party[index];
          return entry.enabled && id !== undefined ? [id] : [];
        });
        this.drawParty(world, aimedAt(menu, world), enabled);
        this.drawInfo([this.question(open, world)]);
        return;
      }
      case 'skills':
        this.drawMember(summaryOf(world, open.page.member), 0);
        this.drawList(open, entries, MENU_LAYOUT.listTop.underMember, LIST_ROWS.skills);
        this.drawInfo(this.helpOf(entries[open.cursor]));
        return;
      case 'equip':
      case 'gear': {
        const { member } = open.page;
        this.drawMember(summaryOf(world, member), 0);
        const rows = open.page.kind === 'gear' ? LIST_ROWS.gear : SLOTS.length;
        this.drawList(open, entries, MENU_LAYOUT.listTop.underMember, rows);
        const comparison = gearComparison(menu, world);
        const now = comparison?.now ?? memberStats(world.state, member, DB);
        this.drawStats(MENU_LAYOUT.stats.top.equip, now, comparison?.after);
        this.drawInfo(this.helpOf(entries[open.cursor]));
        return;
      }
      case 'status':
        this.drawStatus(world, open.page.member);
        return;
    }
  }

  /** The commands, the ▶ on the one under the cursor while they're the page showing. */
  private drawCommands(menu: MainMenu, world: MenuWorld): void {
    const { commands } = MENU_LAYOUT;
    const [root] = menu.pages;
    const onCommands = menu.pages.length === 1;
    entriesOf({ kind: 'commands' }, world).forEach((entry, index) => {
      const y = content.y + index * lineHeight;
      const chosen = !onCommands && index === root?.cursor;
      const tint = !entry.enabled ? FADED_INK : chosen ? BROWN : INK;
      this.text(commands, content.x + CURSOR, y, entry.label, tint);
    });
    if (onCommands && root) this.pointAt(commands, content.x, content.y + root.cursor * lineHeight);
  }

  /**
   * The party at a glance, a row each. While choosing someone, a ▶ points at those aimed at, whose
   * names are in brown, which shows even where a touch control covers the ▶ on a phone; and those
   * it can't be used on are faded.
   */
  private drawParty(world: MenuWorld, aimed: readonly CharacterId[], able: readonly CharacterId[]) {
    const choosing = aimed.length > 0;
    partySummary(world).forEach((summary, row) => {
      const faded = choosing && !able.includes(summary.id);
      this.drawMember(summary, row, faded, aimed.includes(summary.id));
      if (aimed.includes(summary.id)) {
        this.pointAt(
          MENU_LAYOUT.main,
          content.x,
          ROW.top + row * ROW.height + ROW.portrait / 2 - 4,
        );
      }
    });
  }

  /**
   * A member's row: their portrait, their name and level, HP (with a gauge) and MP, and the EXP
   * to their next level. The KO'd are greyed out, those something can't be used on faded, and
   * the name of someone `picked` out is in brown.
   */
  private drawMember(summary: MemberSummary, row: number, faded = false, picked = false): void {
    const { main } = MENU_LAYOUT;
    const top = ROW.top + row * ROW.height;
    const down = summary.hp === 0;
    const key = `portrait.${summary.id}`;
    if (this.textures.exists(key)) {
      const portrait = this.add.image(main.x + content.x + CURSOR, main.y + top, key).setOrigin(0);
      if (down || faded) portrait.setTint(DOWN);
      this.page?.add(portrait);
    }
    const ink = down || faded ? FADED_INK : INK;
    const label = faded ? FADED_INK : BROWN;
    const x = ROW.textX;
    const [first = 0, second = 0, third = 0] = ROW.lines.map((line) => top + line);
    this.text(main, x + COL.name, first, summary.name, picked ? BROWN : ink);
    this.text(main, x + COL.levelRight, first, MENU_TEXT.level(summary.level), ink, 1);
    this.text(main, x + COL.hpLabel, second, MENU_TEXT.hp, label);
    this.text(main, x + COL.hpRight, second, `${summary.hp}/${summary.maxHp}`, ink, 1);
    this.text(main, x + COL.mpLabel, second, MENU_TEXT.mp, label);
    this.text(main, x + COL.mpRight, second, `${summary.mp}/${summary.maxMp}`, ink, 1);
    this.text(main, x + COL.hpLabel, third, MENU_TEXT.next, label);
    const next = summary.next === null ? MENU_TEXT.maxed : String(summary.next);
    this.text(main, x + COL.hpRight, third, next, ink, 1);
    // The HP gauge, under the HP, red at a quarter.
    const share = summary.maxHp > 0 ? summary.hp / summary.maxHp : 0;
    const width = COL.hpRight - COL.hpLabel;
    const filled = summary.hp > 0 ? Math.max(1, Math.round(width * share)) : 0;
    const gauge = this.add
      .graphics()
      .fillStyle(GAUGE_BACK)
      .fillRect(main.x + x, main.y + second + 9, width, 1)
      .fillStyle(share <= 0.25 ? GAUGE_LOW : GAUGE)
      .fillRect(main.x + x, main.y + second + 9, filled, 1);
    this.page?.add(gauge);
    this.shown.party.push(
      [
        summary.name,
        MENU_TEXT.level(summary.level),
        `${MENU_TEXT.hp} ${summary.hp}/${summary.maxHp}`,
        `${MENU_TEXT.mp} ${summary.mp}/${summary.maxMp}`,
        `${MENU_TEXT.next} ${next}`,
      ].join(' '),
    );
  }

  /**
   * A list in the main panel: a line each, from `top`, `rows` at a time, with the ▶ on the line
   * under the cursor, arrows where there's more, and what can't be chosen faded.
   */
  private drawList(open: OpenPage, entries: readonly MenuEntry[], top: number, rows: number) {
    const { main } = MENU_LAYOUT;
    const right = main.width - content.x;
    entries.slice(open.top, open.top + rows).forEach((entry, row) => {
      const y = top + row * lineHeight;
      const tint = entry.enabled ? INK : FADED_INK;
      this.text(main, content.x + CURSOR, y, entry.label, tint);
      this.text(main, right, y, entry.detail, tint, 1);
      this.shown.list.push(entry.detail === '' ? entry.label : `${entry.label} ${entry.detail}`);
    });
    if (entries.length > 0) {
      this.pointAt(main, content.x, top + (open.cursor - open.top) * lineHeight);
    }
    const arrows = this.add.graphics().fillStyle(BROWN);
    const x = main.x + main.width - frame - 3;
    if (open.top > 0)
      arrows.fillTriangle(x - 2, main.y + top - 1, x + 2, main.y + top - 1, x, main.y + top - 4);
    if (open.top + rows < entries.length) {
      const y = main.y + top + rows * lineHeight - 3;
      arrows.fillTriangle(x - 2, y, x + 2, y, x, y + 3);
    }
    this.page?.add(arrows);
  }

  /**
   * Stats in two columns: each stat's name, and how much of it there is; with `after`, what a
   * change of gear would make it, with an arrow up or down where it changes.
   */
  private drawStats(top: number, now: Stats, after?: Stats): void {
    const { main } = MENU_LAYOUT;
    const { column, nowRight, arrow, afterRight } = MENU_LAYOUT.stats;
    const arrows = this.add.graphics();
    STAT_COLUMNS.forEach((stats, col) =>
      stats.forEach((stat, row) => {
        const x = content.x + col * column;
        const y = top + row * lineHeight;
        this.text(main, x, y, BATTLE_TEXT.stats[stat], BROWN);
        this.text(main, x + nowRight, y, String(now[stat]), INK, 1);
        let line = `${BATTLE_TEXT.stats[stat]} ${now[stat]}`;
        if (after) {
          const changed = after[stat] - now[stat];
          const tint = changed > 0 ? BETTER : changed < 0 ? WORSE : INK;
          this.text(main, x + afterRight, y, String(after[stat]), tint, 1);
          const ax = main.x + x + arrow;
          const ay = main.y + y + 1;
          if (changed > 0)
            arrows.fillStyle(BETTER).fillTriangle(ax, ay + 5, ax + 4, ay + 5, ax + 2, ay + 1);
          if (changed < 0)
            arrows.fillStyle(WORSE).fillTriangle(ax, ay + 1, ax + 4, ay + 1, ax + 2, ay + 5);
          line += ` ${after[stat]}`;
        }
        this.shown.stats.push(line);
      }),
    );
    this.page?.add(arrows);
  }

  /** All about one member: their row, EXP, stats and gear, and their skills beside them. */
  private drawStatus(world: MenuWorld, member: CharacterId): void {
    const { main } = MENU_LAYOUT;
    const { state } = world;
    this.drawMember(summaryOf(world, member), 0);
    const exp = state.members[member]?.exp ?? 0;
    this.text(main, content.x, MENU_LAYOUT.status.exp, MENU_TEXT.exp, BROWN);
    this.text(
      main,
      content.x + MENU_LAYOUT.stats.nowRight,
      MENU_LAYOUT.status.exp,
      String(exp),
      INK,
      1,
    );
    this.drawStats(MENU_LAYOUT.stats.top.status, memberStats(state, member, DB));
    SLOTS.forEach((slot, row) => {
      const y = MENU_LAYOUT.status.equipment + row * lineHeight;
      const worn = state.members[member]?.equipment[slot];
      const name = worn === undefined ? MENU_TEXT.nothing : (own(DB.items, worn)?.name ?? worn);
      this.text(main, content.x, y, MENU_TEXT.slots[slot], BROWN);
      this.text(main, content.x + MENU_LAYOUT.status.itemX, y, name, INK);
      this.shown.list.push(`${MENU_TEXT.slots[slot]} ${name}`);
    });
    // Under their heading, as many skills as there are lines for.
    const skills = statusSkills(world, member, MENU_LAYOUT.infoLines - 1);
    this.drawInfo([MENU_TEXT.skills, ...skills], true);
  }

  /** Lines in the info panel, wrapped to fit it; with `heading`, the first in brown. */
  private drawInfo(lines: readonly string[], heading = false): void {
    const { info } = MENU_LAYOUT;
    const wrapped = lines.flatMap((line) => wrapText(line, MENU_LAYOUT.room.info, this.widthOf));
    wrapped.slice(0, MENU_LAYOUT.infoLines).forEach((line, row) => {
      const tint = heading && row === 0 ? BROWN : INK;
      this.text(info, content.x, content.y + row * lineHeight, line, tint);
    });
    this.shown.info = wrapped;
  }

  /** The gold, the play time, and where the party is. */
  private whereabouts(): string[] {
    const { state } = session;
    return [
      MENU_TEXT.gold(state.gold),
      formatPlayTime(state.playTimeMs),
      MAPS[state.location.map]?.name ?? state.location.map,
    ];
  }

  /** What's asked while choosing someone: whose page to look at, or whom to use something on. */
  private question(open: OpenPage, world: MenuWorld): string {
    const { page } = open;
    if (page.kind === 'whose') return MENU_TEXT.ask.whose[page.command];
    let name: string;
    if (page.kind === 'item-on') name = own(DB.items, page.item)?.name ?? page.item;
    else if (page.kind === 'skill-on') name = own(DB.skills, page.skill)?.name ?? page.skill;
    else return '';
    return aimsAtAll(page, world) ? MENU_TEXT.ask.onAll(name) : MENU_TEXT.ask.on(name);
  }

  private helpOf(entry: MenuEntry | undefined): string[] {
    return entry?.help ? [entry.help] : [];
  }

  // Small helpers.

  /** A window: the choice box, nine-sliced to fill `box`. */
  private panel(box: Box): void {
    this.add
      .nineslice(
        box.x,
        box.y,
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
  }

  /** Text in a panel, at (x, y) from its top-left; right-aligned there with `originX` 1. */
  private text(box: Box, x: number, y: number, text: string, tint: number, originX = 0) {
    const shown = this.add.bitmapText(box.x + x, box.y + y, FONT.body, text).setTint(tint);
    shown.setOrigin(originX, 0);
    this.page?.add(shown);
    return shown;
  }

  /** The ▶, like the choice box's, before a spot in a panel. */
  private pointAt(box: Box, x: number, y: number): void {
    const mark = this.add
      .graphics()
      .fillStyle(INK)
      .fillTriangle(0, 0, 0, 5, 3, 2.5)
      .setPosition(box.x + x, box.y + y + 1.5);
    this.page?.add(mark);
  }
}

/** A record's own value for a key: never one inherited from Object, like `constructor`. */
const own = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;

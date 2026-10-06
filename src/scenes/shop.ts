import Phaser from 'phaser';
import { DIRECTIONS } from '../core/direction';
import { buy, sell } from '../core/shop';
import { DB } from '../data/db';
import { SHOPS } from '../data/shops';
import { BATTLE_TEXT, MENU_TEXT, SHOP_TEXT } from '../data/ui-text';
import { sheetRows } from '../systems/character-frames';
import { input } from '../systems/input/game-input';
import { session } from '../systems/session';
import type { Box } from '../ui/battle-layout';
import { FONT, textMeasurer } from '../ui/fonts';
import { MENU_HEIGHT, MENU_SCALE, MENU_WIDTH } from '../ui/main-menu-layout';
import {
  SHOP_ROWS,
  carriedOf,
  entriesOf,
  gearFits,
  itemOf,
  openShop,
  settleShop,
  shownPage,
  stepShop,
  totalOf,
  type MemberFit,
  type OpenPage,
  type ShopAction,
  type ShopMenu,
  type ShopWorld,
} from '../ui/shop-flow';
import { SHOP_LAYOUT } from '../ui/shop-layout';
import { wrapText } from '../ui/text-wrap';

export const SHOP_SCENE = 'shop';

/** How a shop opens, over the field, which waits for it: which shop, and what to do on leaving. */
export interface ShopStart {
  /** Its ID in src/data/shops.ts. */
  readonly shop: string;
  /** Called as the player leaves. */
  readonly onClose: () => void;
}

/** Colours on the pack's cream panels, as in the main menu. */
const INK = 0x0b001e;
const FADED_INK = 0x9a8c9e;
const BROWN = 0x965340;
const BACKDROP = 0x14101c;
const BETTER = 0x2f7d4f;
const WORSE = 0xc0392b;
/** Someone who couldn't wear the gear under the cursor, greyed out. */
const CANT = 0x8a7fa3;
/** Those who could wear it walk on the spot, a step every so often. */
const WALK_STEP_MS = 160;
/** A character sheet's walk cycle, facing down: the first column of its first four rows. */
const WALK_ROWS = 4;
const COLUMNS = 4;

const { frame, content, lineHeight, cursor: CURSOR, party: PARTY } = SHOP_LAYOUT;

/** What the panels show, for the debug info. */
interface Shown {
  list: string[];
  info: string[];
  party: string[];
}

/**
 * A shop, over the field (see Screens in docs/DESIGN.md): Buy, Sell and Leave beside a list of
 * what's for sale, or what the party could sell, with the gold, how many the party has of the item
 * under the cursor and what it does. Along the bottom, the party: who could wear a piece of gear,
 * walking on the spot, and how it would change their stats. src/ui/shop-flow.ts decides what
 * happens; this draws it in the main menu's cream panels, and buys and sells with
 * src/core/shop.ts.
 */
export class ShopScene extends Phaser.Scene {
  private start?: ShopStart;
  private menu?: ShopMenu;
  /** Everything that changes as the pages do, made afresh each time. */
  private page?: Phaser.GameObjects.Container;
  private walkers: { image: Phaser.GameObjects.Image; rows: number }[] = [];
  private shown: Shown = { list: [], info: [], party: [] };
  private widthOf: (text: string) => number = (text) => text.length;

  constructor() {
    super(SHOP_SCENE);
  }

  create(start: ShopStart): void {
    this.start = start;
    this.menu = openShop();
    this.widthOf = textMeasurer(this, FONT.body);
    this.cameras.main.setZoom(MENU_SCALE).centerOn(MENU_WIDTH / 2, MENU_HEIGHT / 2);
    this.add.rectangle(0, 0, MENU_WIDTH, MENU_HEIGHT, BACKDROP).setOrigin(0);
    for (const box of [SHOP_LAYOUT.main, SHOP_LAYOUT.commands, SHOP_LAYOUT.info]) this.panel(box);
    const { main } = SHOP_LAYOUT;
    this.add
      .rectangle(main.x + content.x, main.y + SHOP_LAYOUT.divider, main.width - 2 * content.x, 1)
      .setOrigin(0)
      .setFillStyle(BROWN, 0.5);
    this.page = this.add.container(0, 0);
    this.render();
    // Closed, it has nothing to show or report.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.menu = undefined;
      this.walkers = [];
    });
  }

  override update(time: number): void {
    const { menu } = this;
    if (!menu) return;
    const step = stepShop(
      menu,
      {
        move: DIRECTIONS.find((direction) => input.pressedOrRepeated(direction)) ?? null,
        confirm: input.pressed('confirm'),
        // Menu goes back too, as it does in the save menu.
        cancel: input.pressed('cancel') || input.pressed('menu'),
      },
      this.world(),
    );
    this.menu = step.menu;
    if (step.action) this.act(step.action);
    if (this.menu && (step.menu !== menu || step.action)) this.render();
    const row = Math.floor(time / WALK_STEP_MS);
    for (const { image, rows } of this.walkers) {
      image.setFrame((row % Math.min(rows, WALK_ROWS)) * COLUMNS);
    }
  }

  /** Read by `window.__game.inspect('shop')` in dev and test builds: empty once it's closed. */
  debugInfo(): Record<string, unknown> {
    const { menu } = this;
    if (!menu) return {};
    const world = this.world();
    const open = shownPage(menu);
    const entries = entriesOf(open.page, world);
    return {
      shop: this.start?.shop ?? null,
      page: open.page,
      cursor: open.cursor,
      top: open.top,
      selected: entries[open.cursor]?.label ?? null,
      entries: entries.map(({ label, detail, enabled }) => ({ label, detail, enabled })),
      item: itemOf(menu, world),
      ...this.shown,
    };
  }

  // Doing what's chosen.

  private world(): ShopWorld {
    const shop = this.start ? own(SHOPS, this.start.shop) : undefined;
    return { state: session.state, db: DB, stock: shop?.items ?? [] };
  }

  private act(action: ShopAction): void {
    switch (action.type) {
      case 'buy':
        session.state = buy(session.state, action.item, action.count, DB);
        break;
      case 'sell':
        session.state = sell(session.state, action.item, action.count, DB);
        break;
      case 'leave':
        this.close();
        return;
    }
    if (this.menu) this.menu = settleShop(this.menu, this.world());
  }

  /**
   * Leaves the shop. Scene changes wait for the next frame, so the field doesn't carry on until
   * then, and never sees the press that closed it.
   */
  private close(): void {
    this.menu = undefined;
    this.walkers = [];
    this.scene.stop();
    this.start?.onClose();
  }

  // Drawing.

  /** Draws the commands, the list, the party and the info panel as they stand. */
  private render(): void {
    const { menu, page } = this;
    if (!menu || !page) return;
    page.removeAll(true);
    this.walkers = [];
    this.shown = { list: [], info: [], party: [] };
    const world = this.world();
    const open = shownPage(menu);
    this.drawCommands(menu, world);
    // How many shows over the list it came from, with the cursor still on the item.
    const list = open.page.kind === 'how-many' ? menu.pages.at(-2) : open;
    if (list && list.page.kind !== 'commands') this.drawList(list, world, open === list);
    const item = itemOf(menu, world);
    this.drawParty(world, item === null ? null : gearFits(world, item));
    this.drawInfo(open, world, item);
  }

  /** The commands, the ▶ on the one under the cursor while they're the page showing. */
  private drawCommands(menu: ShopMenu, world: ShopWorld): void {
    const { commands } = SHOP_LAYOUT;
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
   * What's for sale, or what the party could sell, at the top of the big panel: a line each with
   * its price, `SHOP_ROWS` at a time, arrows where there's more, and what can't be chosen faded.
   * The ▶ shows while it's the page taking input.
   */
  private drawList(open: OpenPage, world: ShopWorld, pointing: boolean): void {
    const { main } = SHOP_LAYOUT;
    const entries = entriesOf(open.page, world);
    const right = main.width - content.x;
    entries.slice(open.top, open.top + SHOP_ROWS).forEach((entry, row) => {
      const y = content.y + row * lineHeight;
      const under = open.top + row === open.cursor;
      const tint = !entry.enabled ? FADED_INK : !pointing && under ? BROWN : INK;
      this.text(main, content.x + CURSOR, y, entry.label, tint);
      this.text(main, right, y, entry.detail, tint, 1);
      this.shown.list.push(`${entry.label} ${entry.detail}`);
    });
    if (pointing && entries.length > 0) {
      this.pointAt(main, content.x, content.y + (open.cursor - open.top) * lineHeight);
    }
    const arrows = this.add.graphics().fillStyle(BROWN);
    const x = main.x + main.width - frame - 3;
    const top = main.y + content.y;
    if (open.top > 0) arrows.fillTriangle(x - 2, top - 1, x + 2, top - 1, x, top - 4);
    if (open.top + SHOP_ROWS < entries.length) {
      const y = top + SHOP_ROWS * lineHeight - 3;
      arrows.fillTriangle(x - 2, y, x + 2, y, x, y + 3);
    }
    this.page?.add(arrows);
  }

  /**
   * The party along the bottom of the big panel, a column each. For a piece of gear, those who
   * could wear it walk on the spot, with how it would change their stats under them; the rest
   * are greyed out.
   */
  private drawParty(world: ShopWorld, fits: readonly MemberFit[] | null): void {
    const { main } = SHOP_LAYOUT;
    const column = (main.width - 2 * content.x) / Math.max(1, world.state.party.length);
    world.state.party.forEach((member, index) => {
      const middle = Math.round(content.x + (index + 0.5) * column);
      const fit = fits?.[index];
      const key = `sprite.${member}`;
      if (this.textures.exists(key)) {
        const image = this.add.image(main.x + middle, main.y + PARTY.top, key, 0).setOrigin(0.5, 0);
        if (fit && !fit.fits) image.setTint(CANT);
        if (fit?.fits) {
          this.walkers.push({ image, rows: sheetRows(this.textures.get(key).frameTotal - 1) });
        }
        this.page?.add(image);
      }
      const lines = fit ? this.fitLines(fit) : [];
      lines.slice(0, PARTY.lines).forEach(({ text, tint }, line) => {
        const y = PARTY.top + PARTY.sprite + PARTY.gap + line * PARTY.lineHeight;
        this.text(main, middle, y, text, tint, 0.5);
      });
      this.shown.party.push([member, ...lines.map(({ text }) => text)].join(' '));
    });
  }

  /** What to say under someone about a piece of gear: how it would change them, if they could wear it. */
  private fitLines(fit: MemberFit): { text: string; tint: number }[] {
    if (!fit.fits) return [];
    if (fit.wearing) return [{ text: SHOP_TEXT.wearing, tint: BROWN }];
    if (fit.changes.length === 0) return [{ text: SHOP_TEXT.same, tint: FADED_INK }];
    return fit.changes.map(({ stat, by }) => ({
      text: SHOP_TEXT.change(BATTLE_TEXT.stats[stat], by),
      tint: by > 0 ? BETTER : WORSE,
    }));
  }

  /**
   * The gold; then for an item, how many the party has and wears, and what it does. Choosing how
   * many to buy or sell, the count and what it comes to go at the bottom of the panel, where the
   * touch controls leave it clear on a 16:9 phone.
   */
  private drawInfo(open: OpenPage, world: ShopWorld, item: string | null): void {
    type Line = { text: string; tint: number; centred?: boolean };
    const { info } = SHOP_LAYOUT;
    const top: Line[] = [{ text: MENU_TEXT.gold(world.state.gold), tint: INK }];
    const bottom: Line[] = [];
    const def = item === null ? undefined : own(world.db.items, item);
    if (item !== null && def) {
      const { held, worn } = carriedOf(world, item);
      top.push({ text: SHOP_TEXT.have(held), tint: BROWN });
      if (worn > 0) top.push({ text: SHOP_TEXT.worn(worn), tint: BROWN });
      const { page } = open;
      if (page.kind === 'how-many') {
        bottom.push(
          { text: SHOP_TEXT.howMany[page.deal], tint: INK },
          // The count sits in the middle, between its arrows.
          { text: String(page.count), tint: INK, centred: true },
          { text: SHOP_TEXT.total(totalOf(page, world)), tint: INK },
        );
      } else {
        for (const line of wrapText(def.description, this.roomInInfo(), this.widthOf)) {
          top.push({ text: line, tint: INK });
        }
      }
    }
    const from = SHOP_LAYOUT.infoLines - bottom.length;
    if (bottom.length > 0) this.drawCount(from + 1);
    const rows = top.slice(0, from).map((line, row) => ({ line, row }));
    rows.push(...bottom.map((line, index) => ({ line, row: from + index })));
    for (const { line, row } of rows) {
      const y = content.y + row * lineHeight;
      if (line.centred) this.text(info, info.width / 2, y, line.text, line.tint, 0.5);
      else this.text(info, content.x, y, line.text, line.tint);
    }
    this.shown.info = [...top, ...bottom].map(({ text }) => text);
  }

  /** The arrows either side of how many: Left and Right change it by one, Up and Down by ten. */
  private drawCount(row: number): void {
    const { info } = SHOP_LAYOUT;
    const y = info.y + content.y + row * lineHeight + 1;
    const left = info.x + content.x + 6;
    const right = info.x + info.width - content.x - 6;
    const arrows = this.add
      .graphics()
      .fillStyle(INK)
      .fillTriangle(left, y + 2.5, left + 3, y, left + 3, y + 5)
      .fillTriangle(right, y + 2.5, right - 3, y, right - 3, y + 5);
    this.page?.add(arrows);
  }

  private roomInInfo(): number {
    return SHOP_LAYOUT.info.width - 2 * content.x;
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

  /** Text in a panel, at (x, y) from its top-left; `originX` 1 right-aligns it there, 0.5 centres it. */
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

/** One line on a page of the debug menu. */
export interface DebugItem {
  readonly label: string;
  /** Shown dimmer on the right: a map's ID, where a spawn is. */
  readonly detail?: string;
  /** A switch's state, shown on the right as ON or OFF. */
  readonly on?: boolean;
  /**
   * What choosing it does: returns a page to open, or does something (flips a switch, warps) and
   * returns nothing. Without it the line is dim and can't be chosen.
   */
  readonly choose?: () => DebugPage | void;
}

/** A page of the debug menu. Its items are built afresh for every look, so switches stay current. */
export interface DebugPage {
  readonly title: string;
  items(): readonly DebugItem[];
}

/** What the open page shows, and where the cursor is on it. */
export interface DebugMenuView {
  readonly title: string;
  readonly items: readonly DebugItem[];
  readonly cursor: number;
  /** The first item in view. */
  readonly top: number;
  /** What happened, said at the bottom until the next move: a file was exported, say. */
  readonly notice: string | null;
}

interface OpenPage {
  readonly page: DebugPage;
  cursor: number;
  top: number;
}

/**
 * The debug menu without the drawing: the open page, the pages it was opened from, and the cursor
 * on each. The cursor wraps round, and a page longer than `rows` scrolls to keep it in view.
 */
export class DebugMenu {
  private current: OpenPage;
  private readonly under: OpenPage[] = [];
  private said: string | null = null;

  constructor(
    root: DebugPage,
    private readonly rows: number,
  ) {
    this.current = { page: root, cursor: 0, top: 0 };
  }

  view(): DebugMenuView {
    const { page, cursor, top } = this.current;
    return { title: page.title, items: page.items(), cursor, top, notice: this.said };
  }

  /** What the menu is saying, if anything, without building the page's items. */
  get notice(): string | null {
    return this.said;
  }

  /** Says something at the bottom, until the cursor next moves or something is chosen. */
  notify(notice: string): void {
    this.said = notice;
  }

  /** Moves the cursor `step` items down (or up, if negative), wrapping round the ends. */
  move(step: number): void {
    this.said = null;
    const count = this.current.page.items().length;
    if (count === 0) return;
    const open = this.current;
    open.cursor = (((open.cursor + step) % count) + count) % count;
    if (open.cursor < open.top) open.top = open.cursor;
    if (open.cursor >= open.top + this.rows) open.top = open.cursor - this.rows + 1;
  }

  /** Chooses the item under the cursor: opens its page, or does what it does. */
  choose(): void {
    this.said = null;
    const item = this.current.page.items()[this.current.cursor];
    const next = item?.choose?.();
    if (!next) return;
    this.under.push(this.current);
    this.current = { page: next, cursor: 0, top: 0 };
  }

  /** Goes back to the page before, as it was left. False on the first page, which has none. */
  back(): boolean {
    this.said = null;
    const previous = this.under.pop();
    if (!previous) return false;
    this.current = previous;
    return true;
  }
}

import type { SaveSlot, SlotContents } from '../systems/saves';

/** Saving the game in a slot, or loading one to carry on from. */
export type SaveMenuMode = 'save' | 'load';

/** A slot, and what's in it. */
export interface MenuSlot {
  readonly slot: SaveSlot;
  readonly contents: SlotContents;
}

/**
 * The save menu without the drawing: the slots, the cursor, and the Yes/No question asked before
 * saving over a slot that holds something. See src/scenes/save-menu.ts.
 */
export interface SaveMenu {
  readonly mode: SaveMenuMode;
  readonly slots: readonly MenuSlot[];
  readonly cursor: number;
  /** While asking whether to save over the slot under the cursor: 0 on Yes, 1 on No. */
  readonly overwrite: 0 | 1 | null;
  /** How the last save went, said at the bottom until the cursor moves. */
  readonly notice: 'saved' | 'failed' | null;
}

/** One frame's input: `move` is -1 for up, 1 for down. Cancel is Cancel or Menu. */
export interface SaveMenuInput {
  readonly move: -1 | 0 | 1;
  readonly confirm: boolean;
  readonly cancel: boolean;
}

/** What the scene should do now: save in or load the slot under the cursor, or close. */
export type SaveMenuAction = 'save' | 'load' | 'close' | null;

/**
 * Opens the menu on the slot the player most likely wants: to load, the latest save; to save, the
 * slot they last saved in, or slot 1.
 */
export function openSaveMenu(mode: SaveMenuMode, slots: readonly MenuSlot[]): SaveMenu {
  const choosable = slots.flatMap((entry, index) => (canChoose(mode, entry) ? [index] : []));
  const latest = choosable
    .filter((index) => slots[index]?.contents.kind === 'saved')
    .reduce<number | null>((best, index) => {
      if (best === null) return index;
      return savedAt(slots[index]) > savedAt(slots[best]) ? index : best;
    }, null);
  return { mode, slots, cursor: latest ?? choosable[0] ?? 0, overwrite: null, notice: null };
}

/** Whether a slot can be chosen: any but the autosave to save in, and only a save to load. */
export const canChoose = (mode: SaveMenuMode, { slot, contents }: MenuSlot): boolean =>
  mode === 'save' ? slot !== 'autosave' : contents.kind === 'saved';

export function stepSaveMenu(
  menu: SaveMenu,
  input: SaveMenuInput,
): { menu: SaveMenu; action: SaveMenuAction } {
  const { move, confirm, cancel } = input;
  // Confirm first, so a press in the same frame as a move picks what was on screen.
  if (menu.overwrite !== null) {
    if (confirm) {
      return { menu: { ...menu, overwrite: null }, action: menu.overwrite === 0 ? 'save' : null };
    }
    if (cancel) return { menu: { ...menu, overwrite: null }, action: null };
    if (move !== 0)
      return { menu: { ...menu, overwrite: menu.overwrite === 0 ? 1 : 0 }, action: null };
    return { menu, action: null };
  }
  if (confirm) {
    const entry = menu.slots[menu.cursor];
    if (!entry || !canChoose(menu.mode, entry)) return { menu, action: null };
    if (menu.mode === 'load') return { menu, action: 'load' };
    if (entry.contents.kind === 'empty') return { menu, action: 'save' };
    return { menu: { ...menu, overwrite: 0, notice: null }, action: null };
  }
  if (cancel) return { menu, action: 'close' };
  if (move !== 0 && menu.slots.length > 0) {
    const count = menu.slots.length;
    const cursor = (menu.cursor + move + count) % count;
    return { menu: { ...menu, cursor, notice: null }, action: null };
  }
  return { menu, action: null };
}

/** After saving in the slot under the cursor: shows what's there now, and says so. */
export function saved(menu: SaveMenu, contents: SlotContents): SaveMenu {
  const slots = menu.slots.map((entry, index) =>
    index === menu.cursor ? { ...entry, contents } : entry,
  );
  return { ...menu, slots, notice: 'saved' };
}

/** After a save that the browser wouldn't keep. */
export const saveFailed = (menu: SaveMenu): SaveMenu => ({ ...menu, notice: 'failed' });

/** When a slot's save was made, as a number to compare, or -Infinity for no save. */
function savedAt(entry: MenuSlot | undefined): number {
  return entry?.contents.kind === 'saved' ? Date.parse(entry.contents.save.savedAt) : -Infinity;
}

import { terrainRows } from '../core/map/compile';
import type { MapDef } from '../core/map/types';
import { SaveError, createSave, parseSave, serializeSave, type SaveFile } from '../core/save';
import type { GameState } from '../core/state';
import { MAPS } from '../data/maps';

/** The autosave, which every map change writes, and the three slots the player saves in. */
export const SAVE_SLOTS = ['autosave', 1, 2, 3] as const;
export type SaveSlot = (typeof SAVE_SLOTS)[number];

/** What's in a slot. */
export type SlotContents =
  | { readonly kind: 'empty' }
  | { readonly kind: 'saved'; readonly save: SaveFile }
  /**
   * Something that can't be loaded: it's damaged, a newer version of the game saved it, or it's
   * somewhere this version of the game doesn't have. `error` says exactly what's wrong.
   */
  | { readonly kind: 'unreadable'; readonly problem: SaveError['problem']; readonly error: string };

/** The part of the Web Storage API saves use, so tests can stand in for localStorage. */
export type SaveStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Where a slot's save is kept in localStorage: `fifth-flame:save:autosave`, `fifth-flame:save:1`. */
export const slotKey = (slot: SaveSlot): string => `fifth-flame:save:${slot}`;

const EMPTY: SlotContents = { kind: 'empty' };

/**
 * The save slots, kept in the browser's localStorage. See "Game state and saves" in docs/TECH.md.
 * Reading never throws: a slot holds a save, nothing, or something that can't be loaded. Writing
 * throws if the browser won't keep it, except for the autosave, which only warns.
 */
export class SaveSlots {
  constructor(
    /** The storage, or null where the browser won't let the game have any. */
    private readonly storage: () => SaveStorage | null,
    private readonly maps: Readonly<Record<string, MapDef>> = MAPS,
  ) {}

  read(slot: SaveSlot): SlotContents {
    const text = this.storedText(slot);
    if (text === null) return EMPTY;
    try {
      return { kind: 'saved', save: this.loadable(parseSave(text)) };
    } catch (error) {
      const problem = error instanceof SaveError ? error.problem : 'damaged';
      return { kind: 'unreadable', problem, error: String(error) };
    }
  }

  /** Every slot, autosave first, and what it holds. */
  readAll(): { readonly slot: SaveSlot; readonly contents: SlotContents }[] {
    return SAVE_SLOTS.map((slot) => ({ slot, contents: this.read(slot) }));
  }

  /** Whether any slot holds anything, which Continue on the title screen lists. */
  hasAny(): boolean {
    return SAVE_SLOTS.some((slot) => this.storedText(slot) !== null);
  }

  /** The slot with the most recent save that can be loaded, if any. */
  latest(slots: readonly SaveSlot[] = SAVE_SLOTS): SaveSlot | null {
    let latest: { slot: SaveSlot; time: number } | null = null;
    for (const slot of slots) {
      const contents = this.read(slot);
      if (contents.kind !== 'saved') continue;
      const time = Date.parse(contents.save.savedAt);
      if (!latest || time > latest.time) latest = { slot, time };
    }
    return latest?.slot ?? null;
  }

  /** Saves the game in a slot, at `now`. Throws if the browser won't keep it. */
  write(slot: SaveSlot, state: GameState, now: Date): SaveFile {
    const save = createSave(state, now.toISOString());
    this.store(slot, save);
    return save;
  }

  /** Saves the game in the autosave slot, or warns that it couldn't; the game carries on either way. */
  autosave(state: GameState, now: Date): boolean {
    try {
      this.write('autosave', state, now);
      return true;
    } catch (error) {
      console.warn("Couldn't autosave:", error);
      return false;
    }
  }

  /**
   * A slot's save as a file to export, indented for people to read, or null if the slot's empty.
   * It's what the slot holds, whatever that is, so a damaged save can be looked at too.
   */
  exportText(slot: SaveSlot): string | null {
    const text = this.storedText(slot);
    if (text === null) return null;
    try {
      return `${JSON.stringify(JSON.parse(text), null, 2)}\n`;
    } catch {
      return text;
    }
  }

  /**
   * Puts an exported save in a slot, brought up to date. Throws a SaveError if it can't be loaded,
   * which leaves the slot as it was, or another error if the browser won't keep it.
   */
  importText(slot: SaveSlot, text: string): SaveFile {
    const save = this.loadable(parseSave(text));
    this.store(slot, save);
    return save;
  }

  private store(slot: SaveSlot, save: SaveFile): void {
    const storage = this.storage();
    if (!storage) throw new Error("This browser won't let the game keep saves");
    storage.setItem(slotKey(slot), serializeSave(save));
  }

  private storedText(slot: SaveSlot): string | null {
    try {
      return this.storage()?.getItem(slotKey(slot)) ?? null;
    } catch {
      return null;
    }
  }

  /** The save, if it's on a map this version of the game has, on a cell inside it. */
  private loadable(save: SaveFile): SaveFile {
    const { map, x, y } = save.state.location;
    const def = Object.hasOwn(this.maps, map) ? this.maps[map] : undefined;
    if (!def) throw new SaveError('damaged', `There's no map called ${map}`);
    const rows = terrainRows(def.terrain);
    if (y >= rows.length || x >= (rows[0]?.length ?? 0)) {
      throw new SaveError('damaged', `(${x}, ${y}) isn't on ${map}`);
    }
    return save;
  }
}

/** localStorage, or null where the browser won't let the game have it (some privacy settings). */
function browserStorage(): SaveStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The game's save slots, in this browser's localStorage. */
export const saveSlots = new SaveSlots(browserStorage);

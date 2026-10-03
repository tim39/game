import { afterEach, describe, expect, test, vi } from 'vitest';
import { SAVE_VERSION, SaveError, createSave, serializeSave } from '../core/save';
import { addItem, createGameState, setLocation, type GameState } from '../core/state';
import { SAVE_SLOTS, SaveSlots, slotKey, type SaveStorage, type SlotContents } from './saves';

/** localStorage, as far as saves go. */
class FakeStorage implements SaveStorage {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

const NOON = new Date('2026-10-03T12:00:00.000Z');
const LATER = new Date('2026-10-03T15:30:00.000Z');

const game = (): GameState =>
  addItem(
    createGameState({
      location: { map: 'test-shore', x: 4, y: 5, facing: 'down' },
      party: ['rowan'],
    }),
    'potion',
  );

/** What's wrong with what's in a slot. */
const errorIn = (contents: SlotContents): string =>
  contents.kind === 'unreadable' ? contents.error : `Nothing: the slot is ${contents.kind}`;

function slotsWith(storage = new FakeStorage()): { slots: SaveSlots; storage: FakeStorage } {
  return { slots: new SaveSlots(() => storage), storage };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('save slots', () => {
  test('are the autosave and three more, each under its own key', () => {
    expect(SAVE_SLOTS).toEqual(['autosave', 1, 2, 3]);
    expect(SAVE_SLOTS.map(slotKey)).toEqual([
      'fifth-flame:save:autosave',
      'fifth-flame:save:1',
      'fifth-flame:save:2',
      'fifth-flame:save:3',
    ]);
  });

  test('start empty', () => {
    const { slots } = slotsWith();
    expect(slots.readAll()).toEqual(
      SAVE_SLOTS.map((slot) => ({ slot, contents: { kind: 'empty' } })),
    );
    expect(slots.hasAny()).toBe(false);
    expect(slots.latest()).toBeNull();
  });

  test('keep what is saved in them, and when', () => {
    const { slots, storage } = slotsWith();
    const save = slots.write(2, game(), NOON);
    expect(save).toEqual({ version: SAVE_VERSION, savedAt: NOON.toISOString(), state: game() });
    expect(storage.getItem('fifth-flame:save:2')).toBe(serializeSave(save));
    expect(slots.read(2)).toEqual({ kind: 'saved', save });
    expect(slots.read(1)).toEqual({ kind: 'empty' });
    expect(slots.hasAny()).toBe(true);
  });

  test('know which holds the latest save that can be loaded', () => {
    const { slots, storage } = slotsWith();
    slots.write(3, game(), NOON);
    slots.write('autosave', game(), LATER);
    expect(slots.latest()).toBe('autosave');
    expect(slots.latest([1, 2, 3])).toBe(3);
    storage.setItem(slotKey(1), serializeSave(createSave(game(), '2027-01-01T00:00:00.000Z')));
    storage.setItem(slotKey(2), 'not a save');
    expect(slots.latest()).toBe(1);
  });

  test('hold something that can’t be loaded, and say why', () => {
    const { slots, storage } = slotsWith();
    storage.setItem(slotKey(1), '{"version":1,"savedAt":"2026-10-03T12:00:00.000Z"');
    const newer = { ...createSave(game(), NOON.toISOString()), version: 99 };
    storage.setItem(slotKey(2), serializeSave(newer));
    expect(slots.read(1)).toMatchObject({ kind: 'unreadable', problem: 'damaged' });
    expect(slots.read(2)).toMatchObject({ kind: 'unreadable', problem: 'newer' });
    expect(errorIn(slots.read(2))).toContain('version 99');
    expect(slots.hasAny()).toBe(true);
    expect(slots.latest()).toBeNull();
  });

  test('can’t load a game somewhere this version doesn’t have', () => {
    const { slots, storage } = slotsWith();
    const nowhere = setLocation(game(), { map: 'atlantis', x: 1, y: 1, facing: 'up' });
    // The test shore is 40 cells across and 24 down.
    const offShore = setLocation(game(), { map: 'test-shore', x: 40, y: 3, facing: 'up' });
    const belowShore = setLocation(game(), { map: 'test-shore', x: 3, y: 24, facing: 'up' });
    const corner = setLocation(game(), { map: 'test-shore', x: 39, y: 23, facing: 'up' });
    storage.setItem(slotKey(1), serializeSave(createSave(nowhere, NOON.toISOString())));
    storage.setItem(slotKey(2), serializeSave(createSave(offShore, NOON.toISOString())));
    storage.setItem(slotKey(3), serializeSave(createSave(belowShore, NOON.toISOString())));
    storage.setItem(slotKey('autosave'), serializeSave(createSave(corner, NOON.toISOString())));
    expect(slots.read(1)).toMatchObject({ kind: 'unreadable', problem: 'damaged' });
    expect(errorIn(slots.read(1))).toContain("There's no map called atlantis");
    expect(errorIn(slots.read(2))).toContain("(40, 3) isn't on test-shore");
    expect(errorIn(slots.read(3))).toContain("(3, 24) isn't on test-shore");
    expect(slots.read('autosave')).toMatchObject({ kind: 'saved' });
  });

  test('autosave quietly, and warn if they can’t', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { slots } = slotsWith();
    expect(slots.autosave(game(), NOON)).toBe(true);
    expect(slots.read('autosave')).toMatchObject({ kind: 'saved', save: { state: game() } });
    expect(warn).not.toHaveBeenCalled();

    const full = new FakeStorage();
    full.setItem = () => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    };
    expect(slotsWith(full).slots.autosave(game(), NOON)).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe('a browser that won’t keep saves', () => {
  test('has empty slots, and saving in one fails', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const slots = new SaveSlots(() => null);
    expect(slots.read(1)).toEqual({ kind: 'empty' });
    expect(slots.hasAny()).toBe(false);
    expect(() => slots.write(1, game(), NOON)).toThrow("won't let the game keep saves");
    expect(slots.autosave(game(), NOON)).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
  });

  test('that turns down a read has nothing in its slots', () => {
    const storage = new FakeStorage();
    storage.getItem = () => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };
    expect(new SaveSlots(() => storage).read('autosave')).toEqual({ kind: 'empty' });
  });
});

describe('exporting and importing', () => {
  test('exports what a slot holds, indented, or nothing from an empty slot', () => {
    const { slots, storage } = slotsWith();
    const save = slots.write(1, game(), NOON);
    expect(slots.exportText(1)).toBe(serializeSave(save, true));
    expect(slots.exportText(2)).toBeNull();
    // Even a damaged save, so it can be looked at.
    storage.setItem(slotKey(3), '{"version": 1, "sav');
    expect(slots.exportText(3)).toBe('{"version": 1, "sav');
  });

  test('imports a save into a slot, keeping when it was saved', () => {
    const { slots, storage } = slotsWith();
    const exported = serializeSave(createSave(game(), NOON.toISOString()), true);
    const save = slots.importText(3, exported);
    expect(save).toEqual(createSave(game(), NOON.toISOString()));
    expect(slots.read(3)).toEqual({ kind: 'saved', save });
    expect(storage.getItem(slotKey(3))).toBe(serializeSave(save));
  });

  test('turns down a file that can’t be loaded, and leaves the slot as it was', () => {
    const { slots } = slotsWith();
    const save = slots.write(1, game(), NOON);
    const nowhere = setLocation(game(), { map: 'atlantis', x: 1, y: 1, facing: 'up' });
    for (const text of [
      'hello',
      serializeSave({ ...save, version: SAVE_VERSION + 1 }),
      serializeSave(createSave(nowhere, NOON.toISOString())),
    ]) {
      expect(() => slots.importText(1, text)).toThrow(SaveError);
    }
    expect(slots.read(1)).toEqual({ kind: 'saved', save });
  });
});

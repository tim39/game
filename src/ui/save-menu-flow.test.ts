import { describe, expect, test } from 'vitest';
import { createSave } from '../core/save';
import { createGameState } from '../core/state';
import type { SlotContents } from '../systems/saves';
import {
  canChoose,
  openSaveMenu,
  saveFailed,
  saved,
  stepSaveMenu,
  type MenuSlot,
  type SaveMenu,
  type SaveMenuInput,
} from './save-menu-flow';

const STATE = createGameState({
  location: { map: 'test-shore', x: 4, y: 5, facing: 'down' },
  party: ['rowan'],
});
const savedAt = (time: string): SlotContents => ({
  kind: 'saved',
  save: createSave(STATE, `2026-10-03T${time}:00.000Z`),
});
const EMPTY: SlotContents = { kind: 'empty' };
const DAMAGED: SlotContents = { kind: 'unreadable', problem: 'damaged', error: 'It isn’t JSON' };

/** The four slots, holding what's given, autosave first. */
const slots = (...contents: [SlotContents, SlotContents, SlotContents, SlotContents]): MenuSlot[] =>
  (['autosave', 1, 2, 3] as const).map((slot, index) => ({
    slot,
    contents: contents[index] ?? EMPTY,
  }));

const NONE: SaveMenuInput = { move: 0, confirm: false, cancel: false };
const DOWN: SaveMenuInput = { ...NONE, move: 1 };
const UP: SaveMenuInput = { ...NONE, move: -1 };
const CONFIRM: SaveMenuInput = { ...NONE, confirm: true };
const CANCEL: SaveMenuInput = { ...NONE, cancel: true };

/** Steps the menu through inputs, and gives back where it ended up and what it asked for last. */
function play(menu: SaveMenu, ...inputs: SaveMenuInput[]) {
  let action: ReturnType<typeof stepSaveMenu>['action'] = null;
  for (const input of inputs) ({ menu, action } = stepSaveMenu(menu, input));
  return { menu, action };
}

describe('opening the save menu', () => {
  test('to load, starts on the latest save', () => {
    const all = slots(savedAt('12:00'), savedAt('15:30'), EMPTY, savedAt('09:00'));
    expect(openSaveMenu('load', all)).toEqual({
      mode: 'load',
      slots: all,
      cursor: 1,
      overwrite: null,
      notice: null,
    });
    expect(
      openSaveMenu('load', slots(savedAt('16:00'), savedAt('15:30'), EMPTY, EMPTY)).cursor,
    ).toBe(0);
  });

  test('to save, starts on the slot saved in last, or slot 1', () => {
    // The autosave can't be saved in, however new it is.
    expect(
      openSaveMenu('save', slots(savedAt('18:00'), EMPTY, savedAt('10:00'), EMPTY)).cursor,
    ).toBe(2);
    expect(openSaveMenu('save', slots(savedAt('18:00'), EMPTY, EMPTY, EMPTY)).cursor).toBe(1);
  });

  test('to load with nothing to load, starts at the top', () => {
    expect(openSaveMenu('load', slots(EMPTY, DAMAGED, EMPTY, EMPTY)).cursor).toBe(0);
  });
});

test('slots can be chosen to save in, except the autosave, and to load if they hold a save', () => {
  const all = slots(savedAt('12:00'), EMPTY, DAMAGED, savedAt('13:00'));
  expect(all.map((entry) => canChoose('save', entry))).toEqual([false, true, true, true]);
  expect(all.map((entry) => canChoose('load', entry))).toEqual([true, false, false, true]);
});

describe('the cursor', () => {
  test('moves up and down, round from the bottom to the top', () => {
    const menu = openSaveMenu('load', slots(EMPTY, EMPTY, EMPTY, EMPTY));
    expect(play(menu, DOWN).menu.cursor).toBe(1);
    expect(play(menu, DOWN, DOWN, DOWN, DOWN).menu.cursor).toBe(0);
    expect(play(menu, UP).menu.cursor).toBe(3);
  });

  test('goes over slots that can’t be chosen, which do nothing', () => {
    const menu = openSaveMenu('load', slots(EMPTY, DAMAGED, savedAt('10:00'), EMPTY));
    const onDamaged = play(menu, UP);
    expect(onDamaged.menu.cursor).toBe(1);
    expect(play(onDamaged.menu, CONFIRM)).toEqual({ menu: onDamaged.menu, action: null });
  });
});

describe('loading', () => {
  test('loads the save under the cursor', () => {
    const menu = openSaveMenu('load', slots(savedAt('12:00'), EMPTY, EMPTY, EMPTY));
    expect(play(menu, CONFIRM).action).toBe('load');
  });

  test('Cancel closes the menu', () => {
    const menu = openSaveMenu('load', slots(savedAt('12:00'), EMPTY, EMPTY, EMPTY));
    expect(play(menu, CANCEL).action).toBe('close');
  });
});

describe('saving', () => {
  test('in an empty slot saves straight away, and says so', () => {
    const menu = openSaveMenu('save', slots(EMPTY, EMPTY, EMPTY, EMPTY));
    const { menu: after, action } = play(menu, CONFIRM);
    expect(action).toBe('save');
    const done = saved(after, savedAt('12:00'));
    expect(done.notice).toBe('saved');
    expect(done.slots[1]?.contents).toEqual(savedAt('12:00'));
    // Until the cursor moves.
    expect(play(done, DOWN).menu.notice).toBeNull();
  });

  test('over a save asks first, with the cursor on Yes', () => {
    const menu = openSaveMenu('save', slots(EMPTY, savedAt('10:00'), EMPTY, EMPTY));
    const asking = play(menu, CONFIRM);
    expect(asking).toMatchObject({ menu: { overwrite: 0 }, action: null });
    expect(play(asking.menu, CONFIRM)).toMatchObject({ menu: { overwrite: null }, action: 'save' });
  });

  test('over a save that can’t be loaded asks first too', () => {
    const menu = openSaveMenu('save', slots(EMPTY, DAMAGED, EMPTY, EMPTY));
    expect(play(menu, CONFIRM).menu.overwrite).toBe(0);
  });

  test('No, or Cancel, saves nothing and goes back to the slots', () => {
    const asking = play(
      openSaveMenu('save', slots(EMPTY, savedAt('10:00'), EMPTY, EMPTY)),
      CONFIRM,
    );
    // Up and Down go between Yes and No, round either way.
    expect(play(asking.menu, DOWN).menu.overwrite).toBe(1);
    expect(play(asking.menu, UP).menu.overwrite).toBe(1);
    expect(play(asking.menu, DOWN, DOWN).menu.overwrite).toBe(0);
    expect(play(asking.menu, DOWN, CONFIRM)).toMatchObject({
      menu: { overwrite: null, cursor: 1 },
      action: null,
    });
    expect(play(asking.menu, CANCEL)).toMatchObject({ menu: { overwrite: null }, action: null });
    // The cursor stays on the slot while it asks.
    expect(play(asking.menu, DOWN).menu.cursor).toBe(1);
  });

  test('that fails says so', () => {
    const menu = openSaveMenu('save', slots(EMPTY, EMPTY, EMPTY, EMPTY));
    expect(saveFailed(play(menu, CONFIRM).menu).notice).toBe('failed');
  });

  test('not in the autosave slot', () => {
    const menu = play(openSaveMenu('save', slots(savedAt('12:00'), EMPTY, EMPTY, EMPTY)), UP).menu;
    expect(menu.cursor).toBe(0);
    expect(play(menu, CONFIRM).action).toBeNull();
  });

  test('Cancel closes the menu', () => {
    expect(play(openSaveMenu('save', slots(EMPTY, EMPTY, EMPTY, EMPTY)), CANCEL).action).toBe(
      'close',
    );
  });
});

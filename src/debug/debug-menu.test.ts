import { describe, expect, test } from 'vitest';
import { DebugMenu, type DebugItem, type DebugPage } from './debug-menu';

const page = (title: string, items: DebugItem[]): DebugPage => ({ title, items: () => items });

/** A page of `count` plain items, called "<title> 0", "<title> 1" and so on. */
const numbered = (title: string, count: number): DebugPage =>
  page(
    title,
    Array.from({ length: count }, (_, index) => ({ label: `${title} ${index}`, choose: () => {} })),
  );

const where = (menu: DebugMenu) => {
  const { title, cursor, top } = menu.view();
  return { title, cursor, top };
};

describe('the cursor', () => {
  test('starts on the first item and wraps round both ends', () => {
    const menu = new DebugMenu(numbered('Root', 3), 10);
    expect(where(menu)).toEqual({ title: 'Root', cursor: 0, top: 0 });
    menu.move(1);
    menu.move(1);
    expect(menu.view().cursor).toBe(2);
    menu.move(1);
    expect(menu.view().cursor).toBe(0);
    menu.move(-1);
    expect(menu.view().cursor).toBe(2);
  });

  test('scrolls a long page to stay in view', () => {
    const menu = new DebugMenu(numbered('Maps', 10), 4);
    for (let step = 0; step < 4; step++) menu.move(1);
    expect(where(menu)).toMatchObject({ cursor: 4, top: 1 });
    menu.move(-1);
    menu.move(-1);
    expect(where(menu)).toMatchObject({ cursor: 2, top: 1 });
    menu.move(-1);
    menu.move(-1);
    expect(where(menu)).toMatchObject({ cursor: 0, top: 0 });

    // Wrapping round from the top shows the last rows, and back again shows the first.
    menu.move(-1);
    expect(where(menu)).toMatchObject({ cursor: 9, top: 6 });
    menu.move(1);
    expect(where(menu)).toMatchObject({ cursor: 0, top: 0 });
  });

  test('does nothing on an empty page', () => {
    const menu = new DebugMenu(page('Empty', []), 4);
    menu.move(1);
    menu.choose();
    expect(where(menu)).toEqual({ title: 'Empty', cursor: 0, top: 0 });
  });
});

describe('choosing', () => {
  test('opens an item’s page at its top, and back returns to the cursor as it was', () => {
    const maps = numbered('Maps', 3);
    const menu = new DebugMenu(
      page('Root', [{ label: 'A' }, { label: 'Maps', choose: () => maps }]),
      4,
    );
    menu.move(1);
    menu.choose();
    expect(where(menu)).toEqual({ title: 'Maps', cursor: 0, top: 0 });
    menu.move(2);

    expect(menu.back()).toBe(true);
    expect(where(menu)).toEqual({ title: 'Root', cursor: 1, top: 0 });
    // The first page has nothing behind it: whoever shows the menu closes it instead.
    expect(menu.back()).toBe(false);
    expect(where(menu)).toEqual({ title: 'Root', cursor: 1, top: 0 });

    // A page opened again starts afresh.
    menu.choose();
    expect(where(menu)).toEqual({ title: 'Maps', cursor: 0, top: 0 });
  });

  test('runs an action and stays put, showing what it changed', () => {
    let on = false;
    const root: DebugPage = {
      title: 'Root',
      items: () => [{ label: 'Noclip', on, choose: () => void (on = !on) }],
    };
    const menu = new DebugMenu(root, 4);
    expect(menu.view().items[0]?.on).toBe(false);
    menu.choose();
    expect(on).toBe(true);
    expect(where(menu)).toEqual({ title: 'Root', cursor: 0, top: 0 });
    expect(menu.view().items[0]?.on).toBe(true);
  });

  test('ignores an item that has nothing to do', () => {
    const menu = new DebugMenu(page('Root', [{ label: 'Nowhere', detail: 'no spawns' }]), 4);
    menu.choose();
    expect(where(menu)).toEqual({ title: 'Root', cursor: 0, top: 0 });
  });
});

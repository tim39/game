import { expect, test } from 'vitest';
import { defineMap, type MapDef } from '../core/map/types';
import { MAPS } from '../data/maps';
import type { DebugSwitches } from '../systems/debug-switches';
import type { SaveSlot } from '../systems/saves';
import { DebugMenu } from './debug-menu';
import { debugRootPage, type DebugMenuContext, type DebugSlot } from './debug-pages';

const room = (id: string, name: string, spawns: [string, number, number][]): MapDef =>
  defineMap({
    id,
    name,
    terrain: '...',
    legend: { '.': 'grass' },
    objects: spawns.map(([spawn, x, y]) => ({
      type: 'spawn' as const,
      id: spawn,
      at: [x, y] as const,
      facing: 'down' as const,
    })),
  });

/** The slots as the saves stand-in has them: slot 1 holds a save, slot 3 a damaged one. */
const SLOTS: readonly DebugSlot[] = [
  { slot: 'autosave', label: 'Autosave', detail: 'empty', empty: true },
  { slot: 1, label: 'Slot 1', detail: 'Saltmere, 0:12:34', empty: false },
  { slot: 2, label: 'Slot 2', detail: 'empty', empty: true },
  { slot: 3, label: 'Slot 3', detail: 'damaged', empty: false },
];

function setUp(maps: Record<string, MapDef>) {
  const switches: DebugSwitches = { noclip: false, showCollision: false };
  const warps: [string, string][] = [];
  const exported: SaveSlot[] = [];
  /** Imports waiting for a file, which report how they went once it's picked. */
  const importing: [SaveSlot, (notice: string) => void][] = [];
  const context: DebugMenuContext = {
    maps,
    switches,
    warp: (map, spawn) => void warps.push([map, spawn]),
    saves: {
      slots: () => SLOTS,
      exportSlot: (slot) => {
        exported.push(slot);
        return `Exported slot ${slot}.`;
      },
      importInto: (slot, report) => void importing.push([slot, report]),
    },
    notify: (notice) => menu.notify(notice),
  };
  const menu = new DebugMenu(debugRootPage(context), 10);
  return { menu, switches, warps, exported, importing };
}

const lines = (menu: DebugMenu) =>
  menu.view().items.map(({ label, detail, on, choose }) => ({
    label,
    detail,
    on,
    enabled: choose !== undefined,
  }));

test('the first page warps, and flips noclip and the collision view', () => {
  const { menu, switches } = setUp({});
  expect(menu.view().title).toBe('Debug');
  expect(lines(menu)).toEqual([
    { label: 'Warp to a map', detail: undefined, on: undefined, enabled: true },
    { label: 'Noclip', detail: undefined, on: false, enabled: true },
    { label: 'Show collision', detail: undefined, on: false, enabled: true },
    { label: 'Export a save', detail: undefined, on: undefined, enabled: true },
    { label: 'Import a save', detail: undefined, on: undefined, enabled: true },
  ]);

  menu.move(1);
  menu.choose();
  expect(switches).toEqual({ noclip: true, showCollision: false });
  expect(lines(menu)[1]?.on).toBe(true);
  menu.move(1);
  menu.choose();
  menu.choose();
  menu.choose();
  expect(switches).toEqual({ noclip: true, showCollision: true });
  expect(lines(menu)[2]?.on).toBe(true);
});

test('warping picks a map, then one of its spawns', () => {
  const shore = room('shore', 'Shore', [
    ['house', 1, 0],
    ['east', 2, 0],
  ]);
  const { menu, warps } = setUp({ shore, cave: room('cave', 'Cave', [['stairs', 0, 0]]) });
  menu.choose();
  expect(menu.view().title).toBe('Warp to');
  expect(lines(menu).map(({ label, detail }) => [label, detail])).toEqual([
    ['Shore', 'shore'],
    ['Cave', 'cave'],
  ]);

  menu.choose();
  expect(menu.view().title).toBe('Shore');
  expect(lines(menu).map(({ label, detail }) => [label, detail])).toEqual([
    ['house', '1, 0'],
    ['east', '2, 0'],
  ]);
  menu.move(1);
  menu.choose();
  expect(warps).toEqual([['shore', 'east']]);
});

test('a map with no spawns is listed, but can’t be warped to', () => {
  const { menu, warps } = setUp({ void: room('void', 'The Void', []) });
  menu.choose();
  expect(lines(menu)).toEqual([
    { label: 'The Void', detail: 'void: no spawns', on: undefined, enabled: false },
  ]);
  menu.choose();
  expect(menu.view().title).toBe('Warp to');
  expect(warps).toEqual([]);
});

test('every real map can be warped to', () => {
  const { menu } = setUp({ ...MAPS });
  menu.choose();
  const maps = lines(menu);
  expect(maps.map(({ detail }) => detail)).toEqual(Object.keys(MAPS));
  expect(maps.every(({ enabled }) => enabled)).toBe(true);
});

test('a slot with something in it can be exported, and says it was', () => {
  const { menu, exported } = setUp({});
  menu.move(3);
  menu.choose();
  expect(menu.view().title).toBe('Export');
  expect(lines(menu).map(({ label, detail, enabled }) => [label, detail, enabled])).toEqual([
    ['Autosave', 'empty', false],
    ['Slot 1', 'Saltmere, 0:12:34', true],
    ['Slot 2', 'empty', false],
    // Damaged, but it can still be looked at.
    ['Slot 3', 'damaged', true],
  ]);
  menu.choose();
  expect(exported).toEqual([]);
  menu.move(1);
  menu.choose();
  expect(exported).toEqual([1]);
  expect(menu.view()).toMatchObject({ title: 'Export', notice: 'Exported slot 1.' });
  // Until the cursor moves.
  menu.move(1);
  expect(menu.view().notice).toBeNull();
});

test('a save file can be imported into any slot, and says how that went once it has', () => {
  const { menu, importing } = setUp({});
  menu.move(4);
  menu.choose();
  expect(menu.view().title).toBe('Import into');
  expect(lines(menu).map(({ label, enabled }) => [label, enabled])).toEqual([
    ['Autosave', true],
    ['Slot 1', true],
    ['Slot 2', true],
    ['Slot 3', true],
  ]);
  menu.move(2);
  menu.choose();
  // Nothing to say until a file has been picked.
  expect(importing.map(([slot]) => slot)).toEqual([2]);
  expect(menu.view().notice).toBeNull();
  importing[0]?.[1]('Imported into Slot 2.');
  expect(menu.view()).toMatchObject({ title: 'Import into', notice: 'Imported into Slot 2.' });
});

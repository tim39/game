import { expect, test } from 'vitest';
import { defineMap, type MapDef } from '../core/map/types';
import { MAPS } from '../data/maps';
import type { DebugSwitches } from '../systems/debug-switches';
import { DebugMenu } from './debug-menu';
import { debugRootPage, type DebugMenuContext } from './debug-pages';

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

function setUp(maps: Record<string, MapDef>) {
  const switches: DebugSwitches = { noclip: false, showCollision: false };
  const warps: [string, string][] = [];
  const context: DebugMenuContext = {
    maps,
    switches,
    warp: (map, spawn) => void warps.push([map, spawn]),
  };
  return { menu: new DebugMenu(debugRootPage(context), 10), switches, warps };
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

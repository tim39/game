import { expect, test } from 'vitest';
import { defineMap, type MapDef } from '../core/map/types';
import { MAPS } from '../data/maps';
import type { EncounterRate } from '../core/encounters';
import type { DebugSwitches } from '../systems/debug-switches';
import type { SaveSlot } from '../systems/saves';
import { DebugMenu } from './debug-menu';
import {
  debugBattles,
  debugRootPage,
  type DebugBattle,
  type DebugMenuContext,
  type DebugSlot,
} from './debug-pages';

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

const BATTLES: readonly DebugBattle[] = [
  { label: 'Wolf x2', detail: 'pair', enemies: ['wolf', 'wolf'], backdrop: 'meadow' },
  { label: 'Warden', detail: 'boss', enemies: ['warden'], backdrop: 'shore' },
];

function setUp(maps: Record<string, MapDef>) {
  const switches: DebugSwitches = { noclip: false, showCollision: false };
  const settings = { encounterRate: 'normal' as const satisfies EncounterRate as EncounterRate };
  const warps: [string, string][] = [];
  const battles: DebugBattle[] = [];
  const party = ['rowan'];
  const exported: SaveSlot[] = [];
  /** Imports waiting for a file, which report how they went once it's picked. */
  const importing: [SaveSlot, (notice: string) => void][] = [];
  const context: DebugMenuContext = {
    maps,
    switches,
    settings,
    warp: (map, spawn) => void warps.push([map, spawn]),
    battles: BATTLES,
    battle: (battle) => void battles.push(battle),
    recruits: () =>
      [
        ['rowan', 'Rowan'],
        ['bram', 'Bram'],
      ].map(([id = '', name = '']) => ({ id, name, joined: party.includes(id) })),
    join: (id) => void party.push(id),
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
  return { menu, switches, settings, warps, battles, party, exported, importing };
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
    { label: 'Start a battle', detail: undefined, on: undefined, enabled: true },
    { label: 'Join the party', detail: undefined, on: undefined, enabled: true },
    { label: 'Noclip', detail: undefined, on: false, enabled: true },
    { label: 'Show collision', detail: undefined, on: false, enabled: true },
    { label: 'Encounter rate', detail: 'Normal', on: undefined, enabled: true },
    { label: 'Export a save', detail: undefined, on: undefined, enabled: true },
    { label: 'Import a save', detail: undefined, on: undefined, enabled: true },
  ]);

  menu.move(3);
  menu.choose();
  expect(switches).toEqual({ noclip: true, showCollision: false });
  expect(lines(menu)[3]?.on).toBe(true);
  menu.move(1);
  menu.choose();
  menu.choose();
  menu.choose();
  expect(switches).toEqual({ noclip: true, showCollision: true });
  expect(lines(menu)[4]?.on).toBe(true);
});

test('the encounter rate goes round Off, Low, Normal and High', () => {
  const { menu, settings } = setUp({});
  menu.move(5);
  const rates: string[] = [];
  for (let press = 0; press < 4; press++) {
    menu.choose();
    rates.push(`${settings.encounterRate} ${lines(menu)[5]?.detail ?? ''}`);
  }
  expect(rates).toEqual(['high High', 'off Off', 'low Low', 'normal Normal']);
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
  menu.move(6);
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
  menu.move(7);
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

test('a battle can be started against any of them', () => {
  const { menu, battles } = setUp({});
  menu.move(1);
  menu.choose();
  expect(menu.view().title).toBe('Start a battle');
  expect(lines(menu).map(({ label, detail, enabled }) => [label, detail, enabled])).toEqual([
    ['Wolf x2', 'pair', true],
    ['Warden', 'boss', true],
  ]);
  menu.move(1);
  menu.choose();
  expect(battles).toEqual([BATTLES[1]]);
});

test('the battles are each encounter group, each boss, and each other enemy in a pair', () => {
  const battles = debugBattles({
    enemies: {
      bat: { name: 'Bat' },
      snail: { name: 'Snail' },
      warden: { name: 'Warden', boss: true },
    },
    encounters: { cave: { groups: [{ enemies: ['bat', 'bat', 'snail', 'bat'] }] } },
    bosses: [{ enemies: ['warden'], table: 'cave' }],
    backdrop: (table) => (table === 'cave' ? 'shore' : 'meadow'),
  });
  expect(battles).toEqual([
    {
      label: 'Bat x3, Snail',
      detail: 'cave',
      enemies: ['bat', 'bat', 'snail', 'bat'],
      backdrop: 'shore',
    },
    { label: 'Warden', detail: 'boss', enemies: ['warden'], backdrop: 'shore' },
    { label: 'Bat x2', detail: 'pair', enemies: ['bat', 'bat'], backdrop: 'meadow' },
    { label: 'Snail x2', detail: 'pair', enemies: ['snail', 'snail'], backdrop: 'meadow' },
  ]);
});

test('someone not in the party yet can join it', () => {
  const { menu, party } = setUp({});
  menu.move(2);
  menu.choose();
  expect(menu.view().title).toBe('Join the party');
  expect(lines(menu).map(({ label, detail, enabled }) => [label, detail, enabled])).toEqual([
    ['Rowan', 'in the party', false],
    ['Bram', 'bram', true],
  ]);
  menu.move(1);
  menu.choose();
  expect(party).toEqual(['rowan', 'bram']);
  expect(lines(menu)[1]).toMatchObject({ detail: 'in the party', enabled: false });
});

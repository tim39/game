import { expect, test } from 'vitest';
import { DB as BATTLE_DB, gameWith } from '../core/battle/fixtures';
import type { GameDb } from '../core/db';
import type { EncounterRate } from '../core/encounters';
import type { ExpCurve } from '../core/levels';
import { defineMap, type MapDef } from '../core/map/types';
import { setVitals, type GameState } from '../core/state';
import { MAPS } from '../data/maps';
import type { DebugSwitches } from '../systems/debug-switches';
import type { SaveSlot } from '../systems/saves';
import { DebugMenu } from './debug-menu';
import {
  debugBattles,
  debugRootPage,
  putOn,
  type DebugBattle,
  type DebugBattlePlan,
  type DebugMenuContext,
  type DebugSlot,
} from './debug-pages';

/** The battle engine's test content, with armor and an accessory to wear too. */
const DB: GameDb = {
  ...BATTLE_DB,
  items: {
    ...BATTLE_DB.items,
    'leather-vest': {
      name: 'Leather Vest',
      description: 'Light armor.',
      kind: 'armor',
      armor: 'light',
      price: 50,
      stats: { def: 3 },
    },
    'plate-mail': {
      name: 'Plate Mail',
      description: 'Heavy armor, which nobody here wears.',
      kind: 'armor',
      armor: 'heavy',
      price: 300,
      stats: { def: 9, spd: -1 },
    },
    'swift-ring': {
      name: 'Swift Ring',
      description: 'An accessory.',
      kind: 'accessory',
      price: 200,
      stats: { spd: 2 },
    },
  },
};

const CURVE: ExpCurve = { maxLevel: 5, scale: 10, power: 2 };

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
  { label: 'Wolf x2', detail: 'north-road', enemies: ['wolf', 'wolf'], backdrop: 'meadow' },
  { label: 'Warden', detail: 'boss', enemies: ['warden'], backdrop: 'shore' },
];

function setUp(maps: Record<string, MapDef> = {}) {
  const switches: DebugSwitches = { noclip: false, showCollision: false };
  const settings = { battleSpeed: 1, encounterRate: 'normal' as EncounterRate };
  const warps: [string, string][] = [];
  const battles: DebugBattle[] = [];
  const party = ['rowan'];
  const exported: SaveSlot[] = [];
  /** Imports waiting for a file, which report how they went once it's picked. */
  const importing: [SaveSlot, (notice: string) => void][] = [];
  const game = { state: gameWith(['rowan', 'bram'], { potion: 2 }) };
  const plan: DebugBattlePlan = { enemies: [], backdrop: 'meadow', start: null };
  const context: DebugMenuContext = {
    maps,
    switches,
    settings,
    game: {
      get: () => game.state,
      set: (state: GameState) => {
        game.state = state;
      },
    },
    db: DB,
    curve: CURVE,
    warp: (map, spawn) => void warps.push([map, spawn]),
    battles: BATTLES,
    plan,
    backdrops: ['meadow', 'shore'],
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
  return { menu, switches, settings, warps, battles, party, exported, importing, game, plan };
}

/** Moves the cursor to the item called `label` on the open page, and chooses it. */
function choose(menu: DebugMenu, label: string): void {
  const { items, cursor } = menu.view();
  const index = items.findIndex((item) => item.label === label);
  expect(index, `${label} is on ${menu.view().title}`).toBeGreaterThanOrEqual(0);
  menu.move(index - cursor);
  menu.choose();
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
    { label: 'Party', detail: undefined, on: undefined, enabled: true },
    { label: 'Noclip', detail: undefined, on: false, enabled: true },
    { label: 'Show collision', detail: undefined, on: false, enabled: true },
    { label: 'Battle speed', detail: '1x', on: undefined, enabled: true },
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
  menu.move(6);
  const rates: string[] = [];
  for (let press = 0; press < 4; press++) {
    menu.choose();
    rates.push(`${settings.encounterRate} ${lines(menu)[6]?.detail ?? ''}`);
  }
  expect(rates).toEqual(['high High', 'off Off', 'low Low', 'normal Normal']);
});

test('the battle speed goes round 1x, 2x, 3x and 4x', () => {
  const { menu, settings } = setUp({});
  menu.move(5);
  const speeds: string[] = [];
  for (let press = 0; press < 4; press++) {
    menu.choose();
    speeds.push(`${settings.battleSpeed} ${lines(menu)[5]?.detail ?? ''}`);
  }
  expect(speeds).toEqual(['2 2x', '3 3x', '4 4x', '1 1x']);
  // A speed set some other way goes back to 1x.
  settings.battleSpeed = 1.5;
  expect(lines(menu)[5]?.detail).toBe('1.5x');
  menu.choose();
  expect(settings.battleSpeed).toBe(1);
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
  menu.move(7);
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
  menu.move(8);
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

test('a ready-made battle can be started against any of them', () => {
  const { menu, battles } = setUp({});
  choose(menu, 'Start a battle');
  expect(menu.view().title).toBe('Start a battle');
  expect(lines(menu).map(({ label, detail, enabled }) => [label, detail, enabled])).toEqual([
    ['Build a battle', undefined, true],
    ['Wolf x2', 'north-road', true],
    ['Warden', 'boss', true],
  ]);
  choose(menu, 'Warden');
  expect(battles).toEqual([BATTLES[1]]);
});

test('the ready-made battles are each encounter group and each boss', () => {
  const battles = debugBattles({
    enemies: { bat: { name: 'Bat' }, snail: { name: 'Snail' }, warden: { name: 'Warden' } },
    encounters: {
      cave: { groups: [{ enemies: ['bat', 'bat', 'snail', 'bat'] }, { enemies: ['snail'] }] },
    },
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
    { label: 'Snail', detail: 'cave', enemies: ['snail'], backdrop: 'shore' },
    { label: 'Warden', detail: 'boss', enemies: ['warden'], backdrop: 'shore' },
  ]);
});

test('a battle can be built against up to six of anyone, with a backdrop and a first turn', () => {
  const { menu, battles, plan } = setUp({});
  choose(menu, 'Start a battle');
  choose(menu, 'Build a battle');
  expect(menu.view().title).toBe('Build a battle');
  // Nobody to fight yet.
  expect(lines(menu).map(({ label, detail, enabled }) => [label, detail, enabled])).toEqual([
    ['Fight', 'no one yet', false],
    ['Backdrop', 'meadow', true],
    ['First turn', 'Either side', true],
    ['Add an enemy', '0 of 6', true],
  ]);

  // Every enemy there is can be added, again and again; each says so.
  choose(menu, 'Add an enemy');
  expect(lines(menu).map(({ label, detail }) => [label, detail])).toEqual([
    ['Wolf', 'wolf'],
    ['Slime', 'slime'],
    ['Drowned Warden', 'warden, boss'],
  ]);
  menu.choose();
  menu.choose();
  expect(menu.view().notice).toBe('Added Wolf: 2 of 6.');
  choose(menu, 'Slime');
  expect(plan.enemies).toEqual(['wolf', 'wolf', 'slime']);
  menu.back();

  // Those in it are listed left to right, and choosing one takes it out.
  expect(
    lines(menu)
      .slice(3)
      .map(({ label, detail }) => [label, detail]),
  ).toEqual([
    ['Add an enemy', '3 of 6'],
    ['Wolf', 'take out'],
    ['Wolf', 'take out'],
    ['Slime', 'take out'],
  ]);
  // From Add an enemy, down to the first Wolf.
  menu.move(1);
  menu.choose();
  expect(plan.enemies).toEqual(['wolf', 'slime']);

  // The backdrops and first turns go round.
  choose(menu, 'Backdrop');
  expect(lines(menu)[1]?.detail).toBe('shore');
  choose(menu, 'First turn');
  choose(menu, 'First turn');
  expect(lines(menu)[2]?.detail).toBe('The enemies');

  choose(menu, 'Fight');
  expect(lines(menu)[0]).toMatchObject({ detail: 'Wolf, Slime', enabled: true });
  expect(battles).toEqual([
    {
      label: 'Wolf, Slime',
      detail: 'built',
      enemies: ['wolf', 'slime'],
      backdrop: 'shore',
      start: 'ambush',
    },
  ]);
  // The battle started has its own list of enemies, so changing the plan doesn't change it.
  plan.enemies.push('warden');
  expect(battles[0]?.enemies).toEqual(['wolf', 'slime']);
});

test('a built battle holds six at most, and either side can get the jump, or neither', () => {
  const { menu, battles, plan } = setUp({});
  choose(menu, 'Start a battle');
  choose(menu, 'Build a battle');
  choose(menu, 'Add an enemy');
  for (let added = 0; added < 6; added++) menu.choose();
  expect(plan.enemies).toHaveLength(6);
  // Full: nobody else can be added.
  expect(lines(menu).every(({ enabled }) => !enabled)).toBe(true);
  menu.choose();
  expect(plan.enemies).toHaveLength(6);
  menu.back();
  expect(lines(menu)[3]).toMatchObject({ label: 'Add an enemy', detail: '6 of 6', enabled: false });

  const firstTurns: string[] = [];
  for (let press = 0; press < 3; press++) {
    choose(menu, 'First turn');
    firstTurns.push(`${String(plan.start)} ${lines(menu)[2]?.detail ?? ''}`);
  }
  expect(firstTurns).toEqual(['preemptive The party', 'ambush The enemies', 'null Either side']);
  choose(menu, 'Fight');
  expect(battles[0]).not.toHaveProperty('start');
});

test('the party page lists each member with their level, and rests the party', () => {
  const { menu, game } = setUp({});
  game.state = setVitals(game.state, 'bram', { hp: 0, mp: 2 }, { hp: 150, mp: 10 });
  choose(menu, 'Party');
  expect(menu.view().title).toBe('Party');
  expect(lines(menu).map(({ label, detail, enabled }) => [label, detail, enabled])).toEqual([
    ['Rowan', 'Lv 1', true],
    ['Bram', 'Lv 1', true],
    ['Join the party', undefined, true],
    ['Give an item', undefined, true],
    ['Give gold', '0 gold', true],
    ['Rest', 'full HP and MP', true],
  ]);
  choose(menu, 'Rest');
  expect(game.state.members.bram).toEqual({ level: 1, exp: 0, equipment: {} });
  expect(menu.view().notice).toBe('Everyone is back to full HP and MP.');
  choose(menu, 'Give gold');
  expect(game.state.gold).toBe(1000);
  expect(menu.view().notice).toBe('Gave the party 1000 gold.');
  expect(lines(menu).find(({ label }) => label === 'Give gold')?.detail).toBe('1000 gold');
});

test('a member can be put at any level, with the EXP it takes', () => {
  const { menu, game } = setUp({});
  choose(menu, 'Party');
  choose(menu, 'Bram');
  expect(menu.view().title).toBe('Bram');
  choose(menu, 'Level');
  expect(menu.view().title).toBe("Bram's level");
  expect(lines(menu).map(({ label, detail, enabled }) => [label, detail, enabled])).toEqual([
    ['Level 1', 'now', false],
    ['Level 2', '10 EXP', true],
    ['Level 3', '40 EXP', true],
    ['Level 4', '90 EXP', true],
    ['Level 5', '160 EXP', true],
  ]);
  choose(menu, 'Level 4');
  expect(game.state.members.bram).toMatchObject({ level: 4, exp: 90 });
  expect(lines(menu)[3]).toMatchObject({ detail: 'now', enabled: false });
  // And back down.
  choose(menu, 'Level 2');
  expect(game.state.members.bram).toMatchObject({ level: 2, exp: 10 });
  menu.back();
  expect(lines(menu)[0]).toMatchObject({ label: 'Level', detail: '2' });
  menu.back();
  expect(lines(menu)[1]).toMatchObject({ label: 'Bram', detail: 'Lv 2' });
  expect(game.state.members.rowan).toMatchObject({ level: 1, exp: 0 });
});

test('a member can wear anything that fits them, out of thin air, or nothing', () => {
  const { menu, game } = setUp({});
  choose(menu, 'Party');
  choose(menu, 'Rowan');
  expect(lines(menu).map(({ label, detail }) => [label, detail])).toEqual([
    ['Level', '1'],
    ['Weapon', 'nothing'],
    ['Armor', 'nothing'],
    ['Accessory', 'nothing'],
  ]);

  // Rowan wears swords, and light armor: not Plate Mail.
  choose(menu, 'Weapon');
  expect(menu.view().title).toBe("Rowan's weapon");
  expect(lines(menu).map(({ label, detail, enabled }) => [label, detail, enabled])).toEqual([
    ['Flame Sword', 'ATK +5', true],
    ['Nothing', 'worn', false],
  ]);
  choose(menu, 'Flame Sword');
  expect(game.state.members.rowan?.equipment).toEqual({ weapon: 'flame-sword' });
  expect(game.state.inventory).toEqual({ potion: 2 });
  expect(lines(menu)[0]).toMatchObject({ detail: 'worn', enabled: false });
  menu.back();
  choose(menu, 'Armor');
  expect(lines(menu).map(({ label, detail }) => [label, detail])).toEqual([
    ['Leather Vest', 'DEF +3'],
    ['Nothing', 'worn'],
  ]);
  choose(menu, 'Leather Vest');
  menu.back();
  choose(menu, 'Accessory');
  expect(lines(menu).map(({ label, detail }) => [label, detail])).toEqual([
    ['Swift Ring', 'SPD +2'],
    ['Nothing', 'worn'],
  ]);
  choose(menu, 'Swift Ring');
  menu.back();
  expect(lines(menu).map(({ label, detail }) => [label, detail])).toEqual([
    ['Level', '1'],
    ['Weapon', 'Flame Sword'],
    ['Armor', 'Leather Vest'],
    ['Accessory', 'Swift Ring'],
  ]);

  // Taking it off puts it in the inventory, as it does.
  choose(menu, 'Weapon');
  choose(menu, 'Nothing');
  expect(game.state.members.rowan?.equipment).toEqual({
    armor: 'leather-vest',
    accessory: 'swift-ring',
  });
  expect(game.state.inventory).toEqual({ potion: 2, 'flame-sword': 1 });
});

test('gear put on someone replaces what they had, which goes into the inventory', () => {
  let state = putOn(gameWith(['rowan'], {}), 'rowan', 'leather-vest', DB);
  state = putOn(state, 'rowan', 'leather-vest', DB);
  expect(state.members.rowan?.equipment).toEqual({ armor: 'leather-vest' });
  expect(state.inventory).toEqual({ 'leather-vest': 1 });
  expect(() => putOn(state, 'rowan', 'plate-mail', DB)).toThrow("Rowan can't equip Plate Mail");
});

test('any item can be given to the party, one at a time', () => {
  const { menu, game } = setUp({});
  choose(menu, 'Party');
  choose(menu, 'Give an item');
  expect(menu.view().title).toBe('Give an item');
  const items = lines(menu);
  expect(items.map(({ label }) => label)).toEqual(Object.values(DB.items).map(({ name }) => name));
  expect(items[0]).toMatchObject({ label: 'Potion', detail: 'x2', enabled: true });
  expect(items[1]).toMatchObject({ label: 'Ether', detail: undefined, enabled: true });
  menu.choose();
  menu.move(1);
  menu.choose();
  expect(game.state.inventory).toEqual({ potion: 3, ether: 1 });
  expect(
    lines(menu)
      .slice(0, 2)
      .map(({ detail }) => detail),
  ).toEqual(['x3', 'x1']);
});

test('someone not in the party yet can join it', () => {
  const { menu, party } = setUp({});
  choose(menu, 'Party');
  choose(menu, 'Join the party');
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

import { describe, expect, test } from 'vitest';
import { DB, TUNING, gameWith } from './battle/fixtures';
import {
  castSkill,
  castableOutsideBattle,
  itemTargets,
  skillTargets,
  useItem,
  worksOutsideBattle,
} from './field-use';
import { memberVitals } from './party';
import { setVitals, type GameState, type Vitals } from './state';

/** Rowan, Bram and Liora (100, 150 and 80 HP; MAG 10, 5 and 20), with some of every item. */
const start = (): GameState =>
  gameWith(['rowan', 'bram', 'liora'], { potion: 3, ether: 1, feather: 1, 'fire-bomb': 1 });

/** Sets a member's HP and MP, as a battle might leave them. */
function hurt(state: GameState, id: string, set: Partial<Vitals>): GameState {
  const { now, most } = memberVitals(state, id, DB);
  return setVitals(state, id, { ...now, ...set }, most);
}

const vitals = (state: GameState, id: string): Vitals => memberVitals(state, id, DB).now;

describe('items outside battle', () => {
  test('only those that restore HP or MP, or revive, work outside battle', () => {
    const works = Object.entries(DB.items)
      .filter(([, item]) => worksOutsideBattle(item))
      .map(([id]) => id);
    expect(works).toEqual(['potion', 'ether', 'feather']);
  });

  test('can be used on those they would help, and are used up', () => {
    let state = start();
    // Everyone is at their most: a Potion would do nothing for anyone.
    expect(itemTargets(state, 'potion', DB)).toEqual({ all: false, members: [] });
    state = hurt(state, 'rowan', { hp: 30 });
    expect(itemTargets(state, 'potion', DB)).toEqual({ all: false, members: ['rowan'] });
    state = useItem(state, 'potion', ['rowan'], DB);
    expect(vitals(state, 'rowan').hp).toBe(80);
    expect(state.inventory.potion).toBe(2);
    // No more than their most, and then they're full again.
    state = useItem(state, 'potion', ['rowan'], DB);
    expect(state.members.rowan).not.toHaveProperty('hp');
    expect(state.inventory.potion).toBe(1);
  });

  test('restore MP, and get the KO’d back up, and only them', () => {
    let state = hurt(hurt(start(), 'liora', { mp: 10 }), 'bram', { hp: 0 });
    expect(itemTargets(state, 'ether', DB).members).toEqual(['liora']);
    expect(vitals(useItem(state, 'ether', ['liora'], DB), 'liora').mp).toBe(20);
    // A Potion can't help someone KO'd; a Feather can't help anyone else.
    state = hurt(state, 'rowan', { hp: 50 });
    expect(itemTargets(state, 'potion', DB).members).toEqual(['rowan']);
    expect(itemTargets(state, 'feather', DB).members).toEqual(['bram']);
    state = useItem(state, 'feather', ['bram'], DB);
    // A quarter of 150, rounded down.
    expect(vitals(state, 'bram').hp).toBe(37);
    expect(state.inventory).not.toHaveProperty('feather');
  });

  test('can’t be used on someone they’d do nothing for, or without one to use', () => {
    const state = hurt(start(), 'rowan', { hp: 30 });
    expect(() => useItem(state, 'potion', ['bram'], DB)).toThrow(
      'Potion would do nothing for bram',
    );
    expect(() => useItem(state, 'potion', ['rowan', 'rowan'], DB)).toThrow(RangeError);
    expect(() => useItem(state, 'potion', [], DB)).toThrow(RangeError);
    expect(() => useItem(state, 'fire-bomb', ['rowan'], DB)).toThrow(
      "Fire Bomb can't be used outside battle",
    );
    expect(() => useItem(state, 'smoke', ['rowan'], DB)).toThrow(RangeError);
    // The party has no Antidote, and it would do nothing outside battle anyway.
    expect(itemTargets(state, 'antidote', DB)).toEqual({ all: false, members: [] });
    // The last Potion gone, there's none to use.
    const last = gameWith(['rowan'], { potion: 1 });
    const none = useItem(hurt(last, 'rowan', { hp: 1 }), 'potion', ['rowan'], DB);
    expect(itemTargets(hurt(none, 'rowan', { hp: 1 }), 'potion', DB).members).toEqual([]);
  });
});

describe('skills outside battle', () => {
  test('only healing and reviving work outside battle', () => {
    const works = Object.entries(DB.skills)
      .filter(([, skill]) => castableOutsideBattle(skill))
      .map(([id]) => id);
    expect(works).toEqual(['heal', 'mend-all', 'raise', 'rebirth', 'mend']);
  });

  test('healing goes by the caster’s MAG, without variance, and costs MP', () => {
    let state = hurt(start(), 'rowan', { hp: 30 });
    expect(skillTargets(state, 'liora', 'heal', DB)).toEqual({ all: false, members: ['rowan'] });
    state = castSkill(state, 'liora', 'heal', ['rowan'], DB, TUNING);
    // Power 1 × MAG 20 × 2.
    expect(vitals(state, 'rowan').hp).toBe(70);
    expect(vitals(state, 'liora').mp).toBe(46);
    // Rowan's MAG is 10.
    state = castSkill(state, 'rowan', 'heal', ['rowan'], DB, TUNING);
    expect(vitals(state, 'rowan')).toEqual({ hp: 90, mp: 16 });
  });

  test('aimed at everyone, heals all it helps at once', () => {
    const state = hurt(hurt(start(), 'rowan', { hp: 50 }), 'bram', { hp: 100 });
    expect(skillTargets(state, 'liora', 'mend-all', DB)).toEqual({
      all: true,
      members: ['rowan', 'bram'],
    });
    const after = castSkill(state, 'liora', 'mend-all', ['rowan', 'bram'], DB, TUNING);
    // Power 0.5 × MAG 20 × 2 each.
    expect([vitals(after, 'rowan').hp, vitals(after, 'bram').hp]).toEqual([70, 120]);
    expect(vitals(after, 'liora').mp).toBe(42);
    expect(() => castSkill(state, 'liora', 'mend-all', ['rowan'], DB, TUNING)).toThrow(
      'Mend All is used on everyone it helps, rowan, bram, not rowan',
    );
  });

  test('revival only reaches the KO’d', () => {
    let state = hurt(hurt(start(), 'bram', { hp: 0 }), 'rowan', { hp: 0 });
    expect(skillTargets(state, 'liora', 'raise', DB).members).toEqual(['rowan', 'bram']);
    expect(skillTargets(state, 'liora', 'heal', DB).members).toEqual([]);
    state = castSkill(state, 'liora', 'rebirth', ['rowan', 'bram'], DB, TUNING);
    expect([vitals(state, 'rowan').hp, vitals(state, 'bram').hp]).toEqual([25, 37]);
  });

  test('can’t be cast by someone KO’d or short of MP, or on someone it wouldn’t help', () => {
    let state = hurt(start(), 'rowan', { hp: 30 });
    expect(skillTargets(hurt(state, 'liora', { mp: 3 }), 'liora', 'heal', DB).members).toEqual([]);
    expect(skillTargets(hurt(state, 'liora', { hp: 0 }), 'liora', 'heal', DB).members).toEqual([]);
    expect(() => castSkill(state, 'liora', 'heal', ['bram'], DB, TUNING)).toThrow(
      'Heal would do nothing for bram',
    );
    expect(() => castSkill(state, 'liora', 'slash', ['rowan'], DB, TUNING)).toThrow(
      "Slash can't be cast outside battle",
    );
    // A skill that paid its MP and healed its caster.
    state = hurt(state, 'liora', { hp: 10, mp: 4 });
    state = castSkill(state, 'liora', 'heal', ['liora'], DB, TUNING);
    expect(vitals(state, 'liora')).toEqual({ hp: 50, mp: 0 });
  });
});

test('no use changes the state it’s given', () => {
  const before = hurt(hurt(start(), 'rowan', { hp: 30 }), 'bram', { hp: 0 });
  const frozen = JSON.stringify(before);
  useItem(before, 'potion', ['rowan'], DB);
  useItem(before, 'feather', ['bram'], DB);
  castSkill(before, 'liora', 'heal', ['rowan'], DB, TUNING);
  expect(JSON.stringify(before)).toBe(frozen);
});

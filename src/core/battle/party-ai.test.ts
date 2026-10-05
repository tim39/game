import { describe, expect, test } from 'vitest';
import { Rng } from '../rng';
import { startBattle, type BattleSetup, type BattleState } from './battle';
import type { Fighter, FighterId } from './fighter';
import { DB, TUNING, gameWith } from './fixtures';
import { choosePartyAction } from './party-ai';
import { giveStatus, knockedOut } from './statuses';

// The test party knows every test skill (see fixtures.ts). In a preemptive strike, Rowan goes first.

function battle(
  enemies: readonly string[],
  start: BattleSetup['start'] = 'preemptive',
): BattleState {
  return startBattle({ enemies, start }, gameWith(), DB, TUNING, Rng.fromSeed(1));
}

const changed = (
  fight: BattleState,
  id: FighterId,
  change: (fighter: Fighter) => Fighter,
): BattleState => ({
  ...fight,
  fighters: fight.fighters.map((fighter) => (fighter.id === id ? change(fighter) : fighter)),
});

const withHp = (fight: BattleState, id: FighterId, hp: number): BattleState =>
  changed(fight, id, (fighter) => ({ ...fighter, hp }));

const withMp = (fight: BattleState, id: FighterId, mp: number): BattleState =>
  changed(fight, id, (fighter) => ({ ...fighter, mp }));

describe('choosePartyAction', () => {
  test('attacks the enemy with the least HP', () => {
    const wolves = battle(['wolf', 'wolf']);
    expect(choosePartyAction(wolves)).toEqual({ type: 'attack', target: 'wolf-a' });
    expect(choosePartyAction(withHp(wolves, 'wolf-b', 20))).toEqual({
      type: 'attack',
      target: 'wolf-b',
    });
  });

  test('uses a skill on every enemy when there are three or more', () => {
    expect(choosePartyAction(battle(['wolf', 'slime', 'wolf']))).toEqual({
      type: 'skill',
      skill: 'sweep',
    });
  });

  test('hits a weakness the party knows of with a skill', () => {
    const wolf = battle(['wolf']);
    expect(choosePartyAction(wolf).type).toBe('attack');
    // Tide Edge is water, which the Wolf resists; Fire is what it's weak to.
    expect(choosePartyAction({ ...wolf, known: { wolf: ['fire', 'water'] } })).toEqual({
      type: 'skill',
      skill: 'fire',
      target: 'wolf-a',
    });
  });

  test('keeps back the MP its healing takes', () => {
    // Mend All, the dearest healing the test party knows, takes 8 MP, and Fire 4.
    const known = { ...battle(['wolf']), known: { wolf: ['fire' as const] } };
    expect(choosePartyAction(withMp(known, 'rowan', 12))).toMatchObject({ skill: 'fire' });
    expect(choosePartyAction(withMp(known, 'rowan', 11)).type).toBe('attack');
  });

  test('heals the worst hurt below half their HP, all of them when more than one is', () => {
    const hurt = withHp(battle(['wolf']), 'bram', 70);
    expect(choosePartyAction(hurt)).toEqual({ type: 'skill', skill: 'heal', target: 'bram' });
    expect(choosePartyAction(withHp(hurt, 'rowan', 30))).toEqual({
      type: 'skill',
      skill: 'mend-all',
    });
    // Without the MP for it, a Potion does.
    expect(choosePartyAction(withMp(hurt, 'rowan', 0))).toEqual({
      type: 'item',
      item: 'potion',
      target: 'bram',
    });
    expect(choosePartyAction(withHp(battle(['wolf']), 'bram', 80)).type).toBe('attack');
  });

  test('heals the worst hurt for their HP first, and before it hits a weakness', () => {
    // Without the MP for Mend All, Heal goes to Bram, at 40% of his HP, not Liora, at 45% of hers.
    const both = withMp(withHp(withHp(battle(['wolf']), 'bram', 60), 'liora', 36), 'rowan', 5);
    expect(choosePartyAction(both)).toEqual({ type: 'skill', skill: 'heal', target: 'bram' });
    const known = { ...withHp(battle(['wolf']), 'bram', 70), known: { wolf: ['fire' as const] } };
    expect(choosePartyAction(known)).toEqual({ type: 'skill', skill: 'heal', target: 'bram' });
  });

  test('gets a KO’d ally back up first', () => {
    const fallen = changed(battle(['wolf']), 'bram', knockedOut);
    expect(choosePartyAction(fallen)).toEqual({ type: 'skill', skill: 'raise', target: 'bram' });
    expect(choosePartyAction(withMp(fallen, 'rowan', 0))).toEqual({
      type: 'item',
      item: 'feather',
      target: 'bram',
    });
  });

  test('guards against a telegraphed attack coming its way, once it’s hurt', () => {
    const coming = changed(battle(['warden']), 'warden-a', (warden) => ({
      ...warden,
      telegraph: { skill: 'crush', target: 'rowan' },
    }));
    expect(choosePartyAction(withHp(coming, 'rowan', 60))).toEqual({ type: 'guard' });
    expect(choosePartyAction(withHp(coming, 'rowan', 80)).type).toBe('attack');
    // Not when it's coming at someone else; and before hitting a weakness.
    const atBram = changed(coming, 'warden-a', (warden) => ({
      ...warden,
      telegraph: { skill: 'crush', target: 'bram' },
    }));
    expect(choosePartyAction(withHp(atBram, 'rowan', 60)).type).toBe('attack');
    const known = { ...withHp(coming, 'rowan', 60), known: { warden: ['fire' as const] } };
    expect(choosePartyAction(known)).toEqual({ type: 'guard' });
    // Tidal Wave would hit everyone.
    const wave = changed(coming, 'warden-a', (warden) => ({
      ...warden,
      telegraph: { skill: 'tidal-wave' },
    }));
    expect(choosePartyAction(withHp(wave, 'rowan', 60))).toEqual({ type: 'guard' });
  });

  test('aims where Provoke says', () => {
    const provoked = changed(
      battle(['wolf', 'wolf']),
      'rowan',
      (rowan) => giveStatus(rowan, 'provoke', 'wolf-b', TUNING).fighter,
    );
    expect(choosePartyAction(provoked)).toEqual({ type: 'attack', target: 'wolf-b' });
  });

  test('is only for the party', () => {
    expect(() => choosePartyAction(battle(['wolf'], 'ambush'))).toThrow(
      "It's Wolf's turn, not the party's",
    );
  });
});

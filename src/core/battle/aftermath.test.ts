import { describe, expect, test } from 'vitest';
import type { GameDb } from '../db';
import type { ExpCurve } from '../levels';
import { memberVitals } from '../party';
import { Rng } from '../rng';
import { setVitals, type GameState } from '../state';
import type { Action } from './actions';
import { battleAftermath, rollRewards } from './aftermath';
import { applyAction, startBattle, type BattleState } from './battle';
import type { FighterId } from './fighter';
import { DB, ROWAN, TUNING, gameWith } from './fixtures';
import { ELEMENTS } from './terms';

/** Levels 1 to 5 take 0, 10, 40, 90 and 160 EXP in all. */
const CURVE: ExpCurve = { maxLevel: 5, scale: 10, power: 2 };

/**
 * The test content, with Rowan growing as they level: 10 more HP, 1 more MP and DEF and RES, and 2
 * more ATK a level, and no more MAG or SPD. They know Slash from the start, learn Sweep at level 2
 * and Fire at level 3. The Slime gives 3 EXP and 2 gold; the Warden 100 EXP and 150 gold, and
 * always drops a Feather and an Ether.
 */
const DB_GROWING: GameDb = {
  ...DB,
  characters: {
    ...DB.characters,
    rowan: {
      ...ROWAN,
      stats: {
        hp: [100, 390],
        mp: [20, 49],
        atk: [20, 78],
        def: [10, 39],
        mag: [10, 10],
        res: [10, 39],
        spd: [10, 10],
      },
      skills: [
        { skill: 'slash', level: 1 },
        { skill: 'sweep', level: 2 },
        { skill: 'fire', level: 3 },
      ],
    },
  },
};

const MOST = {
  rowan: { hp: 100, mp: 20 },
  bram: { hp: 150, mp: 10 },
  liora: { hp: 80, mp: 50 },
} as const;

/** The test party, with Rowan hurt and low on MP, and Bram KO'd, carrying `inventory`. */
function battered(inventory?: Readonly<Record<string, number>>): GameState {
  let game = gameWith(undefined, inventory);
  game = setVitals(game, 'rowan', { hp: 40, mp: 5 }, MOST.rowan);
  return setVitals(game, 'bram', { hp: 0, mp: 10 }, MOST.bram);
}

/** A battle with the party getting the jump on `enemies`, each down to 1 HP. */
function against(enemies: readonly string[], game: GameState): BattleState {
  const fight = startBattle(
    { enemies, start: 'preemptive' },
    game,
    DB_GROWING,
    TUNING,
    Rng.fromSeed(1),
  );
  return {
    ...fight,
    fighters: fight.fighters.map((f) => (f.side === 'enemies' ? { ...f, hp: 1 } : f)),
  };
}

/** Takes `actions` in turn, and returns the battle after them. */
function play(from: BattleState, ...actions: readonly Action[]): BattleState {
  const rng = Rng.fromSeed(1);
  return actions.reduce((battle, action) => applyAction(battle, action, rng).battle, from);
}

const attack = (target: FighterId): Action => ({ type: 'attack', target });

/**
 * A battle won against a Slime and the Warden: Rowan drinks a Potion, Liora burns the Warden with
 * Fire, and Rowan finishes the Slime. Bram was KO'd all along.
 */
function won(): { game: GameState; battle: BattleState } {
  const game = battered();
  const battle = play(
    against(['slime', 'warden'], game),
    { type: 'item', item: 'potion', target: 'rowan' },
    { type: 'skill', skill: 'fire', target: 'warden-a' },
    attack('slime-a'),
  );
  return { game, battle };
}
const aftermath = (game: GameState, ended: BattleState, seed = 1) =>
  battleAftermath(game, ended, DB_GROWING, CURVE, Rng.fromSeed(seed));

describe('rollRewards', () => {
  test('are every enemy’s EXP and gold, and the drops that come up', () => {
    const { battle } = won();
    expect(rollRewards(battle, Rng.fromSeed(1))).toEqual({
      exp: 103,
      gold: 152,
      items: { feather: 1, ether: 1 },
    });
  });

  test('drop each item about as often as its chance, one roll for each enemy', () => {
    // Each Wolf drops a Potion half the time.
    const wolves = against(['wolf', 'wolf'], gameWith());
    const counts = Array.from({ length: 400 }, (_, seed) => {
      return rollRewards(wolves, Rng.fromSeed(seed)).items.potion ?? 0;
    });
    expect(new Set(counts)).toEqual(new Set([0, 1, 2]));
    const potions = counts.reduce((sum, count) => sum + count, 0);
    expect(potions / 800).toBeGreaterThan(0.43);
    expect(potions / 800).toBeLessThan(0.57);
  });

  test('come out the same from the same seed', () => {
    const wolves = against(['wolf', 'wolf', 'wolf'], gameWith());
    for (let seed = 0; seed < 20; seed++) {
      expect(rollRewards(wolves, Rng.fromSeed(seed))).toEqual(
        rollRewards(wolves, Rng.fromSeed(seed)),
      );
    }
  });
});

describe('battleAftermath', () => {
  test('after a win, keeps what the battle left and adds the rewards', () => {
    const { game, battle } = won();
    expect(battle.outcome).toBe('victory');
    const { state, rewards } = aftermath(game, battle);
    expect(rewards).toEqual({ exp: 103, gold: 152, items: { feather: 1, ether: 1 } });
    // The Potion Rowan drank is gone, and the drops are in.
    expect(state.inventory).toEqual({ potion: 2, feather: 2, 'fire-bomb': 2, ether: 1 });
    expect(state.gold).toBe(game.gold + 152);
    expect(state.knownReactions).toEqual(battle.known);
    expect(state.knownReactions).toMatchObject({ warden: ['fire'] });
  });

  test('after a win, everyone keeps the HP and MP they have, and the KO’d get up with 1 HP', () => {
    const { game, battle } = won();
    const { state } = aftermath(game, battle);
    // Rowan was at 40 and drank a Potion; Liora spent 4 MP on Fire; Bram was down all along.
    expect(memberVitals(state, 'rowan', DB_GROWING).now).toEqual({ hp: 90, mp: 5 });
    expect(memberVitals(state, 'bram', DB_GROWING).now).toEqual({ hp: 1, mp: 10 });
    expect(memberVitals(state, 'liora', DB_GROWING).now).toEqual({ hp: 80, mp: 46 });
    // Full is kept as nothing, so Liora's HP stays full as their most goes up.
    expect(state.members.liora).not.toHaveProperty('hp');
  });

  test('after a win, everyone gets all the EXP, KO’d or not, and levels up as far as it goes', () => {
    const { game, battle } = won();
    const { state, levelUps } = aftermath(game, battle);
    for (const id of ['rowan', 'bram', 'liora']) {
      expect(state.members[id]).toMatchObject({ level: 4, exp: 103 });
    }
    expect(levelUps.map(({ id, from, to }) => ({ id, from, to }))).toEqual([
      { id: 'rowan', from: 1, to: 4 },
      { id: 'bram', from: 1, to: 4 },
      { id: 'liora', from: 1, to: 4 },
    ]);
    // Three levels for Rowan: 30 HP, 3 MP, 6 ATK, 3 DEF and RES, and both skills on the way.
    expect(levelUps[0]).toEqual({
      id: 'rowan',
      from: 1,
      to: 4,
      before: { hp: 100, mp: 20, atk: 20, def: 10, mag: 10, res: 10, spd: 10 },
      after: { hp: 130, mp: 23, atk: 26, def: 13, mag: 10, res: 13, spd: 10 },
      skills: ['sweep', 'fire'],
    });
    // The rest of the test party's stats don't grow, and they know every skill from the start.
    expect(levelUps[1]).toMatchObject({ skills: [] });
    expect(levelUps[1]?.after).toEqual(levelUps[1]?.before);
    // Rowan is as hurt as they were, out of more.
    expect(memberVitals(state, 'rowan', DB_GROWING)).toEqual({
      now: { hp: 90, mp: 5 },
      most: { hp: 130, mp: 23 },
    });
  });

  test('lists only those who level up', () => {
    // 3 EXP from the Slime alone isn't enough for anyone.
    const game = battered();
    const ended = play(against(['slime'], game), attack('slime-a'));
    const { state, rewards, levelUps } = aftermath(game, ended);
    expect(rewards).toEqual({ exp: 3, gold: 2, items: {} });
    expect(levelUps).toEqual([]);
    expect(state.members.rowan).toMatchObject({ level: 1, exp: 3 });
  });

  test('after fleeing, keeps what the battle left, KO’d and all, but gives nothing', () => {
    const game = battered({ potion: 3, smoke: 1 });
    const fled = play(
      against(['slime'], game),
      { type: 'item', item: 'potion', target: 'rowan' },
      { type: 'skill', skill: 'insight', target: 'slime-a' },
      { type: 'item', item: 'smoke' },
    );
    expect(fled.outcome).toBe('fled');
    const { state, rewards, levelUps } = aftermath(game, fled);
    expect(rewards).toBeNull();
    expect(levelUps).toEqual([]);
    expect(state.inventory).toEqual({ potion: 2 });
    expect(state.knownReactions).toEqual({ slime: ELEMENTS });
    expect(state.gold).toBe(game.gold);
    // Insight cost Liora 2 MP.
    expect(state.members.rowan).toMatchObject({ level: 1, exp: 0, hp: 90, mp: 5 });
    expect(state.members.liora).toMatchObject({ mp: 48 });
    expect(memberVitals(state, 'bram', DB_GROWING).now).toEqual({ hp: 0, mp: 10 });
  });

  test('after a defeat, leaves the game as it was before the battle', () => {
    const game = battered();
    const lost = { ...against(['slime'], game), outcome: 'defeat' as const, active: null };
    expect(aftermath(game, lost)).toEqual({ state: game, rewards: null, levelUps: [] });
    expect(aftermath(game, lost).state).toBe(game);
  });

  test('is only for a battle that’s over', () => {
    const game = battered();
    expect(() => aftermath(game, against(['slime'], game))).toThrow("The battle isn't over yet");
  });
});

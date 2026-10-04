import { describe, expect, test } from 'vitest';
import type { GameDb } from '../db';
import { Rng } from '../rng';
import type { EnemyDef } from '../schema';
import type { Action } from './actions';
import { chooseEnemyAction } from './ai';
import {
  activeFighter,
  applyAction,
  checkAction,
  fighterOf,
  previewTurnOrder,
  startBattle,
  type BattleSetup,
  type BattleState,
} from './battle';
import type { BattleEvent } from './events';
import type { Fighter, FighterId } from './fighter';
import { DB, TUNING, gameWith } from './fixtures';
import { giveStatus, knockedOut } from './statuses';
import type { Status, TargetRule } from './terms';

// The test party is Rowan (HP 100, ATK 20), Bram (HP 150, ATK 15) and Liora (HP 80, ATK 8), who
// all know every test skill (see fixtures.ts). Their foe is made for each test.

const FOE: EnemyDef = {
  name: 'Foe',
  stats: { hp: 100, mp: 20, atk: 10, def: 5, mag: 5, res: 5, spd: 10 },
};

/** A battle against foes that act as `foe` says: in an ambush, so the first goes first. */
function against(
  foe: Partial<EnemyDef>,
  { count = 1, start = 'ambush' }: { count?: number; start?: BattleSetup['start'] } = {},
): BattleState {
  const db: GameDb = { ...DB, enemies: { ...DB.enemies, foe: { ...FOE, ...foe } } };
  const enemies = Array<string>(count).fill('foe');
  return startBattle({ enemies, start }, gameWith(), db, TUNING, Rng.fromSeed(1));
}

const choose = (battle: BattleState, seed = 1): Action =>
  chooseEnemyAction(battle, Rng.fromSeed(seed));

/** Takes `actions` in turn, and returns the battle after them and everything that happened. */
function play(
  from: BattleState,
  ...actions: readonly Action[]
): { battle: BattleState; events: BattleEvent[] } {
  const rng = Rng.fromSeed(1);
  let battle = from;
  const events: BattleEvent[] = [];
  for (const action of actions) {
    const result = applyAction(battle, action, rng);
    battle = result.battle;
    events.push(...result.events);
  }
  return { battle, events };
}

const after = (from: BattleState, ...actions: readonly Action[]): BattleState =>
  play(from, ...actions).battle;

const changed = (
  battle: BattleState,
  id: FighterId,
  change: (fighter: Fighter) => Fighter,
): BattleState => ({
  ...battle,
  fighters: battle.fighters.map((fighter) => (fighter.id === id ? change(fighter) : fighter)),
});

const withHp = (battle: BattleState, id: FighterId, hp: number): BattleState =>
  changed(battle, id, (fighter) => ({ ...fighter, hp }));

const withStatus = (battle: BattleState, id: FighterId, status: Status, from = 'rowan') =>
  changed(battle, id, (fighter) => giveStatus(fighter, status, from, TUNING).fighter);

/** The battle as if it were `id`'s turn: for asking the AI what it would do then. */
const turnOf = (battle: BattleState, id: FighterId): BattleState => ({ ...battle, active: id });

const attack = (target: FighterId): Action => ({ type: 'attack', target });
const GUARD: Action = { type: 'guard' };
const targetOf = (action: Action): FighterId | undefined =>
  'target' in action ? action.target : undefined;
const of = fighterOf;

/** The share of `count` seeds for which `happens` is true. */
function shareOf(count: number, happens: (rng: Rng) => boolean): number {
  let times = 0;
  for (let seed = 0; seed < count; seed++) if (happens(Rng.fromSeed(seed))) times++;
  return times / count;
}

describe('chooseEnemyAction', () => {
  test('attacks someone, for an enemy without actions', () => {
    const action = choose(against({}));
    expect(action.type).toBe('attack');
    expect(['rowan', 'bram', 'liora']).toContain(targetOf(action));
  });

  test('picks from the enemy’s actions at random, by weight', () => {
    const fight = against({ actions: [{ type: 'attack', weight: 3 }, { type: 'guard' }] });
    const guards = shareOf(400, (rng) => chooseEnemyAction(fight, rng).type === 'guard');
    expect(guards).toBeGreaterThan(0.19);
    expect(guards).toBeLessThan(0.31);
  });

  test('passes over actions it can’t take: without the MP, Silenced, or with nobody to aim at', () => {
    // Crush costs 5 MP.
    const crushing = against({ actions: [{ type: 'skill', skill: 'crush' }] });
    expect(choose(crushing).type).toBe('skill');
    expect(choose(changed(crushing, 'foe-a', (foe) => ({ ...foe, mp: 4 }))).type).toBe('attack');
    // Fire is magic.
    const fire = withStatus(
      against({ actions: [{ type: 'skill', skill: 'fire' }] }),
      'foe-a',
      'silence',
    );
    expect(choose(fire).type).toBe('attack');
    // Raise only works on a fallen ally, and it has none.
    expect(choose(against({ actions: [{ type: 'skill', skill: 'raise' }] })).type).toBe('attack');
  });

  test('takes an action only while its conditions hold: HP below a share', () => {
    const fight = against({ actions: [{ type: 'guard', when: { hpBelow: 0.5 } }] });
    expect(choose(fight).type).toBe('attack');
    expect(choose(withHp(fight, 'foe-a', 50)).type).toBe('attack');
    expect(choose(withHp(fight, 'foe-a', 49)).type).toBe('guard');
  });

  test('takes an action only while its conditions hold: every Nth turn of the enemy’s', () => {
    const fight = against({ actions: [{ type: 'guard', when: { every: 3 } }] });
    // The turn under way is the one after those it's had.
    const types = [0, 1, 2, 3, 4, 5].map(
      (turns) => choose(changed(fight, 'foe-a', (foe) => ({ ...foe, turns }))).type,
    );
    expect(types).toEqual(['attack', 'attack', 'guard', 'attack', 'attack', 'guard']);
  });

  test('takes an action only while its conditions hold: once a battle, for a skill', () => {
    const fight = against({ actions: [{ type: 'skill', skill: 'howl', when: { once: true } }] });
    const howl = choose(fight);
    expect(howl).toEqual({ type: 'skill', skill: 'howl' });
    const howled = after(fight, howl);
    expect(of(howled, 'foe-a').skillsUsed).toEqual(['howl']);
    expect(choose(turnOf(howled, 'foe-a')).type).toBe('attack');
  });

  test('takes an action only while its conditions hold: fewer allies standing', () => {
    const fight = against({ actions: [{ type: 'guard', when: { alliesBelow: 2 } }] }, { count: 2 });
    expect(choose(fight).type).toBe('attack');
    expect(choose(changed(fight, 'foe-b', knockedOut)).type).toBe('guard');
  });

  test('aims a skill aimed at a whole side at nobody in particular', () => {
    const fight = against({ actions: [{ type: 'skill', skill: 'tidal-wave' }] });
    expect(choose(fight)).toEqual({ type: 'skill', skill: 'tidal-wave' });
  });
});

describe('target rules', () => {
  const fight = (target: TargetRule): BattleState =>
    against({ actions: [{ type: 'attack', target }] });

  test('random: anyone it could aim at', () => {
    const hit = new Set(
      Array.from({ length: 30 }, (_, seed) => targetOf(choose(fight('random'), seed))),
    );
    expect([...hit].sort()).toEqual(['bram', 'liora', 'rowan']);
  });

  test('lowest-hp: whoever has the least HP for their most, then the least HP', () => {
    // Unhurt, Liora has the least HP; at 60 of 150, Bram has the least for his most.
    expect(targetOf(choose(fight('lowest-hp')))).toBe('liora');
    expect(targetOf(choose(withHp(fight('lowest-hp'), 'bram', 60)))).toBe('bram');
    // Bram's 100 of 150 is less for his most than Liora's 70 of 80, though it's more HP.
    const both = withHp(withHp(fight('lowest-hp'), 'bram', 100), 'liora', 70);
    expect(targetOf(choose(both))).toBe('bram');
  });

  test('highest-atk: whoever has the most ATK, buffs and all', () => {
    expect(targetOf(choose(fight('highest-atk')))).toBe('rowan');
    // Down, Rowan's 20 is 15; Up, Bram's 15 is 18.
    const swapped = withStatus(
      withStatus(fight('highest-atk'), 'rowan', 'atk-down'),
      'bram',
      'atk-up',
    );
    expect(targetOf(choose(swapped))).toBe('bram');
  });

  test('healer: someone who knows a healing skill, or anyone if nobody does', () => {
    // Everyone in the test party knows Heal, until they're made to forget it.
    const forgetting = (battle: BattleState, id: FighterId) =>
      changed(battle, id, (fighter) => ({ ...fighter, skills: ['slash'] }));
    const lioras = forgetting(forgetting(fight('healer'), 'rowan'), 'bram');
    expect(targetOf(choose(lioras))).toBe('liora');
    const nobody = forgetting(lioras, 'liora');
    const hit = new Set(Array.from({ length: 30 }, (_, seed) => targetOf(choose(nobody, seed))));
    expect(hit.size).toBe(3);
  });

  test('all give way to Provoke', () => {
    for (const rule of ['random', 'lowest-hp', 'highest-atk', 'healer'] as const) {
      const provoked = withStatus(fight(rule), 'foe-a', 'provoke', 'bram');
      expect(targetOf(choose(provoked))).toBe('bram');
    }
  });
});

describe('phases', () => {
  const PHASED: Partial<EnemyDef> = {
    actions: [{ type: 'attack' }],
    phases: [
      { below: 0.5, actions: [{ type: 'guard' }] },
      { below: 0.2, actions: [{ type: 'skill', skill: 'howl' }] },
    ],
  };
  // Rowan goes first, and his Attack does 20² / (20 + 5) = 16 to the foe.
  const fight = against(PHASED, { start: 'preemptive' });

  test('begin when a boss’s HP falls below their share, and change what it does', () => {
    expect(choose(turnOf(fight, 'foe-a')).type).toBe('attack');
    const { battle: hurt, events } = play(withHp(fight, 'foe-a', 60), attack('foe-a'));
    expect(events).toContainEqual({ type: 'phase', fighter: 'foe-a', phase: 1 });
    expect(of(hurt, 'foe-a')).toMatchObject({ hp: 44, phase: 1 });
    expect(choose(turnOf(hurt, 'foe-a')).type).toBe('guard');
  });

  test('never go back, though the boss is healed', () => {
    const hurt = after(withHp(fight, 'foe-a', 60), attack('foe-a'));
    expect(choose(turnOf(withHp(hurt, 'foe-a', 100), 'foe-a')).type).toBe('guard');
  });

  test('can be skipped through, to the last the HP is below', () => {
    const { battle: hurt, events } = play(withHp(fight, 'foe-a', 30), attack('foe-a'));
    expect(events.filter((event) => event.type === 'phase')).toEqual([
      { type: 'phase', fighter: 'foe-a', phase: 2 },
    ]);
    expect(choose(turnOf(hurt, 'foe-a'))).toEqual({ type: 'skill', skill: 'howl' });
  });

  test('don’t begin for a KO', () => {
    const events = play(withHp(fight, 'foe-a', 10), attack('foe-a')).events;
    expect(events.filter((event) => event.type === 'phase')).toEqual([]);
  });
});

describe('telegraphs', () => {
  const TELEGRAPHING: Partial<EnemyDef> = {
    stats: { ...FOE.stats, hp: 999 },
    actions: [
      { type: 'skill', skill: 'crush', target: 'lowest-hp', telegraph: true, when: { once: true } },
    ],
  };

  test('announce a skill on one turn, at its target, and use it on the next', () => {
    const fight = against(TELEGRAPHING);
    const announce = choose(fight);
    expect(announce).toEqual({ type: 'telegraph', skill: 'crush', target: 'liora' });
    const { battle: told, events } = play(fight, announce);
    // Nothing happens yet, and Crush's MP isn't spent.
    expect(events[0]).toEqual({
      type: 'action',
      actor: 'foe-a',
      action: announce,
      targets: ['liora'],
    });
    expect(events.slice(1).map((event) => event.type)).toEqual(['turn']);
    expect(of(told, 'foe-a')).toMatchObject({
      mp: 20,
      telegraph: { skill: 'crush', target: 'liora' },
    });
    // The party has a turn each, then Crush comes.
    let next = told;
    while (next.active !== 'foe-a') next = after(next, GUARD);
    const crush = choose(next);
    expect(crush).toEqual({ type: 'skill', skill: 'crush', target: 'liora' });
    const { battle: crushed, events: hit } = play(next, crush);
    expect(hit).toContainEqual(expect.objectContaining({ type: 'damage', target: 'liora' }));
    expect(of(crushed, 'foe-a')).toMatchObject({ mp: 15, telegraph: null, skillsUsed: ['crush'] });
  });

  test('come at someone else if the target has fallen', () => {
    const told = after(against(TELEGRAPHING), {
      type: 'telegraph',
      skill: 'crush',
      target: 'liora',
    });
    const action = choose(turnOf(changed(told, 'liora', knockedOut), 'foe-a'));
    expect(action).toMatchObject({ type: 'skill', skill: 'crush' });
    expect(['rowan', 'bram']).toContain(targetOf(action));
  });

  test('give way to something else if the skill can’t be used by then', () => {
    const told = after(against(TELEGRAPHING), {
      type: 'telegraph',
      skill: 'crush',
      target: 'liora',
    });
    const drained = changed(told, 'foe-a', (foe) => ({ ...foe, mp: 0 }));
    expect(choose(turnOf(drained, 'foe-a')).type).toBe('attack');
  });

  test('show on the timeline: the skill’s rank sets when the enemy’s next turn comes', () => {
    const told = after(against(TELEGRAPHING), {
      type: 'telegraph',
      skill: 'crush',
      target: 'liora',
    });
    // From here, the party attacks, and the foe uses Crush (Slow), then attacks.
    let next = told;
    const played: FighterId[] = [];
    while (played.length < 10) {
      const actor = activeFighter(next);
      const action = actor.side === 'enemies' ? choose(next) : attack('foe-a');
      next = after(next, action);
      played.push(next.active ?? '');
    }
    expect(previewTurnOrder(told)).toEqual(played);
    const untold = changed(told, 'foe-a', (foe) => ({ ...foe, telegraph: null }));
    expect(previewTurnOrder(untold)).not.toEqual(played);
  });

  test('are only for enemies', () => {
    const fight = against({}, { start: 'preemptive' });
    expect(checkAction(fight, { type: 'telegraph', skill: 'crush', target: 'foe-a' })).toBe(
      "Rowan can't telegraph",
    );
    expect(() => choose(fight)).toThrow("It's Rowan's turn, not an enemy's");
  });
});

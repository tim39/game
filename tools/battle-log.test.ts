import { expect, test } from 'vitest';
import { applyAction, startBattle, type BattleState } from '../src/core/battle/battle';
import type { BattleEvent } from '../src/core/battle/events';
import { DB, TUNING, gameWith } from '../src/core/battle/fixtures';
import { Rng } from '../src/core/rng';
import { battleLog, type Step } from './battle-log';

// The test party and enemies from src/core/battle/fixtures.ts, with nothing left to chance. In a
// preemptive strike against a Wolf, Rowan goes first.
const START = startBattle(
  { enemies: ['wolf'], start: 'preemptive' },
  gameWith(),
  DB,
  TUNING,
  Rng.fromSeed(1),
);

/** The battle after each action, as steps. */
function steps(from: BattleState, ...actions: Parameters<typeof applyAction>[1][]): Step[] {
  const rng = Rng.fromSeed(1);
  let battle = from;
  return actions.map((action) => {
    const step = applyAction(battle, action, rng);
    battle = step.battle;
    return step;
  });
}

/** What a step of these events says, on the battle as it started. */
const said = (...events: BattleEvent[]): string[] =>
  battleLog(START, [{ events, battle: START }]).slice(0, -1);

test('tells a battle a line to a turn, and how it ended', () => {
  const weak = {
    ...START,
    fighters: START.fighters.map((f) => (f.id === 'wolf-a' ? { ...f, hp: 20 } : f)),
  };
  expect(
    battleLog(
      weak,
      steps(weak, { type: 'attack', target: 'wolf-a' }, { type: 'attack', target: 'wolf-a' }),
    ),
  ).toEqual([
    'Turn 1. Rowan attacks Wolf. Wolf takes 15: 5/60.',
    'Turn 2. Liora attacks Wolf. Wolf takes 5: 0/60. Wolf falls.',
    'Won. Rowan 100/100, Bram 150/150, Liora 80/80.',
  ]);
});

test('says what each kind of action is', () => {
  const action = (actionOf: Extract<BattleEvent, { type: 'action' }>['action']): BattleEvent => ({
    type: 'action',
    actor: 'rowan',
    action: actionOf,
    targets: [],
  });
  expect(
    said(
      action({ type: 'skill', skill: 'heal', target: 'bram' }),
      action({ type: 'skill', skill: 'sweep' }),
      action({ type: 'item', item: 'potion', target: 'liora' }),
      action({ type: 'guard' }),
      action({ type: 'flee' }),
      action({ type: 'telegraph', skill: 'crush', target: 'bram' }),
    ),
  ).toEqual([
    'Turn 1. Rowan uses Heal on Bram. Rowan uses Sweep. Rowan uses Potion on Liora. Rowan guards. ' +
      'Rowan tries to flee. Rowan readies Crush at Bram!',
  ]);
});

test('says what happens to the fighters', () => {
  expect(
    said(
      { type: 'damage', target: 'wolf-a', amount: 25, hp: 35, element: 'fire', reaction: 'weak' },
      { type: 'damage', target: 'rowan', amount: 9, hp: 91, critical: true },
      { type: 'damage', target: 'rowan', amount: 8, hp: 83, cause: 'poison' },
      { type: 'heal', target: 'rowan', amount: 8, hp: 91, cause: 'regen' },
      { type: 'heal', target: 'wolf-a', amount: 17, hp: 52, cause: 'absorb' },
      { type: 'mp', target: 'rowan', amount: -3, mp: 17 },
      { type: 'mp', target: 'rowan', amount: 10, mp: 20 },
      { type: 'miss', target: 'wolf-a' },
      { type: 'stagger', target: 'wolf-a', push: 11 },
      { type: 'delay', target: 'wolf-a', push: 22 },
      { type: 'ko', target: 'bram' },
      { type: 'revive', target: 'bram', hp: 37 },
      { type: 'phase', fighter: 'wolf-a', phase: 1 },
      { type: 'asleep', fighter: 'wolf-a' },
      { type: 'flee', escaped: false },
      { type: 'flee', escaped: true },
    ),
  ).toEqual([
    'Turn 1. Wolf takes 25 (weak): 35/60. Rowan takes 9, a critical hit: 91/100. ' +
      'Rowan takes 8 from poison: 83/100. Rowan recovers 8 HP from Regen: 91/100. ' +
      'Wolf recovers 17 HP, absorbing it: 52/60. Rowan recovers 10 MP. It misses Wolf. ' +
      'Wolf staggers back. Wolf is knocked back. Bram falls. Bram gets back up: 37/150. ' +
      "Wolf changes! Wolf is asleep. But they can't get away. The party gets away.",
  ]);
});

test('says how statuses come and go, and what the party learns', () => {
  expect(
    said(
      { type: 'status-added', target: 'wolf-a', status: 'poison' },
      { type: 'status-added', target: 'rowan', status: 'atk-up', turns: 3 },
      { type: 'status-added', target: 'rowan', status: 'guard' },
      { type: 'status-removed', target: 'rowan', status: 'atk-up', reason: 'expired' },
      { type: 'status-removed', target: 'rowan', status: 'guard', reason: 'expired' },
      { type: 'status-removed', target: 'wolf-a', status: 'poison', reason: 'cured' },
      { type: 'status-removed', target: 'wolf-a', status: 'sleep', reason: 'woke' },
      { type: 'status-removed', target: 'wolf-a', status: 'haste', reason: 'replaced' },
      { type: 'status-resisted', target: 'wolf-a', status: 'sleep' },
      { type: 'reveal', target: 'wolf-a', elements: ['fire'] },
      { type: 'reveal', target: 'wolf-a', elements: ['wind', 'light'] },
    ),
  ).toEqual([
    "Turn 1. Wolf is poisoned. Rowan gets ATK Up. Rowan's ATK Up wears off. " +
      'Wolf is cured of Poison. Wolf wakes up. Wolf resists Sleep. ' +
      'The party learns: Wolf is weak to fire. The party learns: Wolf takes wind, light normally.',
  ]);
});

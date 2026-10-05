import { describe, expect, test } from 'vitest';
import type { Action, Command } from '../core/battle/actions';
import { chooseEnemyAction } from '../core/battle/ai';
import {
  activeFighter,
  applyAction,
  checkAction,
  checkCommand,
  startBattle,
  targetChoices,
  type BattleState,
} from '../core/battle/battle';
import type { BattleEvent } from '../core/battle/events';
import { DB, TUNING, gameWith } from '../core/battle/fixtures';
import { Rng } from '../core/rng';
import { applyEvent, fighterView, viewOf, type BattleView } from './battle-view';

const battleWith = (enemies: readonly string[]): BattleState =>
  startBattle({ enemies }, gameWith(), DB, TUNING, Rng.fromSeed(1));

/** The view after `events`, from the battle as it was. */
const played = (battle: BattleState, events: readonly BattleEvent[]): BattleView =>
  events.reduce(applyEvent, viewOf(battle));

describe('viewOf', () => {
  test('shows everyone as they are: HP and MP out of their most, and their statuses', () => {
    const view = viewOf(battleWith(['wolf', 'wolf']));
    expect(view.map((fighter) => fighter.name)).toEqual([
      'Rowan',
      'Bram',
      'Liora',
      'Wolf A',
      'Wolf B',
    ]);
    expect(fighterView(view, 'wolf-b')).toEqual({
      id: 'wolf-b',
      side: 'enemies',
      name: 'Wolf B',
      hp: 60,
      maxHp: 60,
      mp: 10,
      maxMp: 10,
      statuses: [],
      telegraph: null,
      phase: 0,
    });
  });
});

describe('applyEvent', () => {
  const view = viewOf(battleWith(['wolf']));
  const rowan = (after: BattleView) => fighterView(after, 'rowan');

  test('a hit, healing and reviving set HP; spending MP sets MP', () => {
    const hurt = applyEvent(view, { type: 'damage', target: 'rowan', amount: 30, hp: 70 });
    expect(rowan(hurt).hp).toBe(70);
    const healed = applyEvent(hurt, { type: 'heal', target: 'rowan', amount: 20, hp: 90 });
    expect(rowan(healed).hp).toBe(90);
    const spent = applyEvent(healed, { type: 'mp', target: 'rowan', amount: -3, mp: 17 });
    expect(rowan(spent)).toMatchObject({ hp: 90, mp: 17 });
  });

  test('statuses come and go, and a status given again keeps its place', () => {
    const steps: BattleEvent[] = [
      { type: 'status-added', target: 'rowan', status: 'poison' },
      { type: 'status-added', target: 'rowan', status: 'atk-up', turns: 3 },
      { type: 'status-added', target: 'rowan', status: 'poison' },
      { type: 'status-added', target: 'rowan', status: 'guard' },
      { type: 'status-removed', target: 'rowan', status: 'poison', reason: 'cured' },
    ];
    expect(rowan(steps.reduce(applyEvent, view)).statuses).toEqual(['atk-up', 'guard']);
  });

  test('a KO takes every status and telegraph away, and reviving brings HP back', () => {
    const steps: BattleEvent[] = [
      { type: 'status-added', target: 'rowan', status: 'regen', turns: 3 },
      { type: 'damage', target: 'rowan', amount: 100, hp: 0 },
      { type: 'ko', target: 'rowan' },
    ];
    const down = steps.reduce(applyEvent, view);
    expect(rowan(down)).toMatchObject({ hp: 0, statuses: [] });
    expect(rowan(applyEvent(down, { type: 'revive', target: 'rowan', hp: 25 })).hp).toBe(25);
  });

  test('a telegraph shows until its fighter next acts', () => {
    const readied = applyEvent(view, {
      type: 'action',
      actor: 'wolf-a',
      action: { type: 'telegraph', skill: 'bite', target: 'bram' },
      targets: ['bram'],
    });
    expect(fighterView(readied, 'wolf-a').telegraph).toEqual({ skill: 'bite', target: 'bram' });
    const bitten = applyEvent(readied, {
      type: 'action',
      actor: 'wolf-a',
      action: { type: 'skill', skill: 'bite', target: 'bram' },
      targets: ['bram'],
    });
    expect(fighterView(bitten, 'wolf-a').telegraph).toBeNull();
  });

  test('a boss changes phase', () => {
    const warden = viewOf(battleWith(['warden']));
    const changed = applyEvent(warden, { type: 'phase', fighter: 'warden-a', phase: 1 });
    expect(fighterView(changed, 'warden-a').phase).toBe(1);
  });

  test('throws for an event about someone who isn’t in the battle', () => {
    expect(() => applyEvent(view, { type: 'ko', target: 'cass' })).toThrow(
      "There's nobody called cass in this battle",
    );
  });
});

/** Everything the fighter whose turn it is could do now, aimed every way it could be. */
function choices(battle: BattleState): Action[] {
  const actor = activeFighter(battle);
  const commands: Command[] = [
    { type: 'attack' },
    { type: 'guard' },
    { type: 'flee' },
    ...actor.skills.map((skill): Command => ({ type: 'skill', skill })),
    ...Object.keys(battle.inventory).map((item): Command => ({ type: 'item', item })),
  ];
  return commands.flatMap((command) => {
    if (checkCommand(battle, command) !== undefined) return [];
    const targets = targetChoices(battle, command);
    const actions: Action[] =
      targets.length === 0
        ? [command as Action]
        : targets.map((target) => ({ ...command, target }) as Action);
    return actions.filter((action) => checkAction(battle, action) === undefined);
  });
}

/** What the screen shows of a fighter, with their statuses in a set order, to compare. */
const shown = (view: BattleView) =>
  view.map((fighter) => ({ ...fighter, statuses: [...fighter.statuses].sort() }));

test('after every action, the events played bring the screen up to the battle', () => {
  const inventory = { potion: 2, ether: 1, feather: 2, antidote: 1, 'fire-bomb': 2, smoke: 1 };
  const enemies = ['wolf', 'slime', 'warden'] as const;
  let steps = 0;
  for (let seed = 0; seed < 150; seed++) {
    const rng = Rng.fromSeed(seed);
    const picks = Rng.fromSeed(`view ${seed}`);
    const foes = Array.from({ length: picks.int(1, 4) }, () => picks.pick(enemies));
    let battle = startBattle({ enemies: foes }, gameWith(undefined, inventory), DB, TUNING, rng);
    while (battle.active !== null && steps < 100_000) {
      const enemy = activeFighter(battle).side === 'enemies';
      const action = enemy ? chooseEnemyAction(battle, picks) : picks.pick(choices(battle));
      const { battle: after, events } = applyAction(battle, action, rng);
      expect(shown(played(battle, events))).toEqual(shown(viewOf(after)));
      battle = after;
      steps++;
    }
    expect(battle.active).toBeNull();
  }
  // Enough turns for the comparison to count for something.
  expect(steps).toBeGreaterThan(3000);
});

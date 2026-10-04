import { expect, test } from 'vitest';
import { Rng } from '../rng';
import type { Action, Command } from './actions';
import { chooseEnemyAction } from './ai';
import {
  activeFighter,
  applyAction,
  checkAction,
  checkCommand,
  previewTurnOrder,
  startBattle,
  targetChoices,
  type BattleState,
} from './battle';
import type { BattleEvent } from './events';
import { isKo, type Side } from './fighter';
import { DB, TUNING, gameWith } from './fixtures';
import type { BattleTuning } from './tuning';

// Hundreds of battles, played by picking at random from everything the fighter whose turn it is
// could do, or with the enemies doing as their AI says. After every action, the battle must still
// keep the rules, and the preview must have shown the turns that came.

/** The test tuning, with chance put back: the variance, critical hits and random first turns. */
const CHANCY: BattleTuning = {
  ...TUNING,
  startCt: [0.4, 1],
  variance: [0.9, 1.1],
  critChance: 0.05,
};

const ENEMIES = ['wolf', 'slime', 'warden'] as const;
const INVENTORY = { potion: 2, ether: 1, feather: 2, antidote: 1, 'fire-bomb': 2, smoke: 1 };

/** Everything the fighter whose turn it is could do now, aimed every way it could be. */
function choices(battle: BattleState): Action[] {
  const actor = activeFighter(battle);
  const commands: Command[] = [
    { type: 'attack' },
    { type: 'guard' },
    { type: 'flee' },
    ...actor.skills.map((skill): Command => ({ type: 'skill', skill })),
    ...actor.skills.map((skill): Command => ({ type: 'telegraph', skill })),
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

/** What's wrong with a battle and the events that led to it: nothing, if it keeps the rules. */
function problemsWith(battle: BattleState, events: readonly BattleEvent[]): string[] {
  const problems: string[] = [];
  for (const fighter of battle.fighters) {
    const { id, hp, mp, ct, stats, statuses } = fighter;
    if (!Number.isInteger(hp) || hp < 0 || hp > stats.hp) problems.push(`${id} has ${hp} HP`);
    if (!Number.isInteger(mp) || mp < 0 || mp > stats.mp) problems.push(`${id} has ${mp} MP`);
    if (!Number.isInteger(ct) || ct < 0) problems.push(`${id} has CT ${ct}`);
    if (isKo(fighter) && Object.keys(statuses).length > 0) {
      problems.push(`${id} is KO'd with statuses`);
    }
    if (isKo(fighter) && fighter.telegraph !== null) problems.push(`${id} is KO'd, telegraphing`);
    if (statuses.haste && statuses.slow) problems.push(`${id} is Hasted and Slowed`);
    for (const [status, state] of Object.entries(statuses)) {
      if (state.turns !== undefined && state.turns < 0) {
        problems.push(`${id} has ${status} for ${state.turns} turns`);
      }
    }
  }
  for (const [item, count] of Object.entries(battle.inventory)) {
    if (!Number.isInteger(count) || count < 1) problems.push(`The party has ${count} ${item}`);
  }
  const standing = (side: Side): boolean =>
    battle.fighters.some((fighter) => fighter.side === side && !isKo(fighter));
  const active = battle.fighters.find((fighter) => fighter.id === battle.active);
  switch (battle.outcome) {
    case 'ongoing':
      if (!active || isKo(active) || active.ct !== 0) problems.push(`${battle.active} can't act`);
      if (!standing('party') || !standing('enemies')) problems.push('A side is down');
      break;
    case 'victory':
      if (standing('enemies')) problems.push('Won with enemies standing');
      break;
    case 'defeat':
      if (standing('party') || !standing('enemies')) problems.push('Lost with the party standing');
      break;
    case 'fled':
      break;
  }
  if (battle.outcome !== 'ongoing' && battle.active !== null) problems.push('Over, but not done');
  const ids = new Set(battle.fighters.map((fighter) => fighter.id));
  for (const event of events) {
    const who = 'target' in event ? event.target : 'fighter' in event ? event.fighter : undefined;
    if (who !== undefined && !ids.has(who)) problems.push(`An event names ${who}`);
  }
  return problems;
}

/**
 * Whether the preview was bound to be right about a turn: it takes the action as landing in full,
 * and can't know who'll miss, resist or fall, sleep through their turn, or show a weakness first.
 */
const asPreviewed = (events: readonly BattleEvent[]): boolean =>
  !events.some((event) =>
    ['miss', 'status-resisted', 'ko', 'asleep', 'reveal'].includes(event.type),
  );

/**
 * Plays battles from seeds, the party picking at random from what they could do, and the enemies
 * too, or as their AI says. Returns what went wrong, how many battles ended, and how many turns
 * the preview was bound to be right about.
 */
function playBattles(
  battles: number,
  enemiesBy: 'chance' | 'ai',
): { problems: string[]; ended: number; previewed: number } {
  const problems: string[] = [];
  let ended = 0;
  let previewed = 0;
  for (let seed = 0; seed < battles; seed++) {
    const rng = Rng.fromSeed(seed);
    const picks = Rng.fromSeed(`picks ${seed}`);
    const enemies = Array.from({ length: picks.int(1, 4) }, () => picks.pick(ENEMIES));
    const start = picks.pick([undefined, 'preemptive', 'ambush'] as const);
    const setup = start === undefined ? { enemies } : { enemies, start };
    let battle = startBattle(setup, gameWith(undefined, INVENTORY), DB, CHANCY, rng);
    problems.push(
      ...problemsWith(battle, []).map((problem) => `${seed}, at the start: ${problem}`),
    );
    for (let step = 0; step < 2000 && battle.active !== null; step++) {
      const say = (problem: string) => `${seed}, turn ${battle.turn}: ${problem}`;
      const ai = enemiesBy === 'ai' && activeFighter(battle).side === 'enemies';
      const action = ai ? chooseEnemyAction(battle, picks) : picks.pick(choices(battle));
      const wrong = checkAction(battle, action);
      if (wrong !== undefined) {
        problems.push(say(`the AI chose ${JSON.stringify(action)}: ${wrong}`));
        break;
      }
      const preview = previewTurnOrder(battle, action);
      const result = applyAction(battle, action, rng);
      problems.push(...problemsWith(result.battle, result.events).map(say));
      if (result.battle.active !== null && asPreviewed(result.events)) {
        previewed++;
        // The next turn is the one the preview put first, and the rest follow as it said.
        const rest = previewTurnOrder(result.battle, undefined, preview.length - 1);
        if (result.battle.active !== preview[0] || rest.join() !== preview.slice(1).join()) {
          problems.push(say(`${JSON.stringify(action)} went against the preview`));
        }
      }
      battle = result.battle;
    }
    if (battle.active === null) ended++;
  }
  return { problems, ended, previewed };
}

test('battles played at random keep the rules, end, and go as the preview shows', () => {
  const { problems, ended, previewed } = playBattles(250, 'chance');
  expect(problems.slice(0, 10)).toEqual([]);
  expect(ended).toBe(250);
  // Most turns go as previewed, so the comparison counts for something.
  expect(previewed).toBeGreaterThan(2500);
});

test('battles against enemies that follow their AI do too, and the AI only does what it can', () => {
  const { problems, ended, previewed } = playBattles(250, 'ai');
  expect(problems.slice(0, 10)).toEqual([]);
  expect(ended).toBe(250);
  expect(previewed).toBeGreaterThan(2500);
});

import { describe, expect, test } from 'vitest';
import type { Action, Command } from '../core/battle/actions';
import { chooseEnemyAction } from '../core/battle/ai';
import {
  activeFighter,
  applyAction,
  checkAction,
  checkCommand,
  previewTurnOrder,
  startBattle,
  targetChoices,
  type BattleSetup,
  type BattleState,
} from '../core/battle/battle';
import { isKo, type Fighter, type FighterId } from '../core/battle/fighter';
import { DB, TUNING, gameWith } from '../core/battle/fixtures';
import { giveStatus, knockedOut } from '../core/battle/statuses';
import { Rng } from '../core/rng';
import type { GameState } from '../core/state';
import {
  TIMELINE_TURNS,
  changedSlots,
  iconWindow,
  letterOf,
  playTimeline,
  slotOrigins,
  timelineOf,
  type Timeline,
} from './battle-timeline';

// The test party is Rowan (Normal delay 50), Bram (67) and Liora (56); the Wolf's is 45 and the
// Warden's 50 (see src/core/battle/fixtures.ts). Everyone's first turn comes after exactly their
// Normal delay.

function battle(
  enemies: readonly string[],
  start?: BattleSetup['start'],
  game: GameState = gameWith(),
): BattleState {
  const setup = start === undefined ? { enemies } : { enemies, start };
  return startBattle(setup, game, DB, TUNING, Rng.fromSeed(1));
}

/** A battle with one fighter changed: for situations that would take long to play into. */
const changed = (
  fight: BattleState,
  id: FighterId,
  change: (fighter: Fighter) => Fighter,
): BattleState => ({
  ...fight,
  fighters: fight.fighters.map((fighter) => (fighter.id === id ? change(fighter) : fighter)),
});

const ids = (timeline: Timeline): FighterId[] => timeline.map((slot) => slot.id);
const marked = (timeline: Timeline): number[] =>
  timeline.flatMap((slot, index) => (slot.telegraph ? [index] : []));

const attack = (target: FighterId): Action => ({ type: 'attack', target });
const skill = (skill: string, target: FighterId): Action => ({ type: 'skill', skill, target });

describe('timelineOf', () => {
  test('shows whose turn it is, then whose the next ten are', () => {
    const fight = battle(['warden']);
    const timeline = timelineOf(fight);
    expect(timeline).toHaveLength(1 + TIMELINE_TURNS);
    expect(ids(timeline)).toEqual(['rowan', ...previewTurnOrder(fight)]);
    expect(ids(timelineOf(fight, undefined, 3))).toEqual(['rowan', 'warden-a', 'liora', 'bram']);
    expect(marked(timeline)).toEqual([]);
  });

  test('previews the action the fighter whose turn it is would take', () => {
    const fight = battle(['wolf'], 'preemptive');
    for (const action of [skill('heavy-blow', 'wolf-a'), skill('jab', 'wolf-a')]) {
      expect(ids(timelineOf(fight, action))).toEqual(['rowan', ...previewTurnOrder(fight, action)]);
    }
    // Heavy Blow is Very Slow, and Jab Quick.
    const nextOf = (action: Action) => ids(timelineOf(fight, action)).indexOf('rowan', 1);
    expect(nextOf(skill('heavy-blow', 'wolf-a'))).toBeGreaterThan(nextOf(attack('wolf-a')));
    expect(nextOf(skill('jab', 'wolf-a'))).toBeLessThan(nextOf(attack('wolf-a')));
  });

  test('marks the turn a telegraphed skill comes on: the next of whoever readied it', () => {
    const readied = changed(battle(['warden']), 'warden-a', (warden) => ({
      ...warden,
      telegraph: { skill: 'crush', target: 'rowan' },
    }));
    const timeline = timelineOf(readied);
    expect(timeline[1]?.id).toBe('warden-a');
    expect(marked(timeline)).toEqual([1]);
  });

  test('marks this turn, when it’s theirs, and their next when they ready one now', () => {
    const theirs = battle(['warden'], 'ambush');
    expect(theirs.active).toBe('warden-a');
    const readied = changed(theirs, 'warden-a', (warden) => ({
      ...warden,
      telegraph: { skill: 'crush', target: 'rowan' },
    }));
    expect(marked(timelineOf(readied, skill('crush', 'rowan')))).toEqual([0]);

    const telegraph: Action = { type: 'telegraph', skill: 'crush', target: 'rowan' };
    const timeline = timelineOf(theirs, telegraph);
    expect(marked(timeline)).toEqual([ids(timeline).indexOf('warden-a', 1)]);
  });

  test('is empty once the battle is over', () => {
    const won = applyAction(
      changed(battle(['wolf'], 'preemptive'), 'wolf-a', (wolf) => ({ ...wolf, hp: 1 })),
      attack('wolf-a'),
      Rng.fromSeed(1),
    ).battle;
    expect(timelineOf(won)).toEqual([]);
  });
});

describe('changedSlots', () => {
  test('picks out the turns that aren’t the same fighter’s as before', () => {
    const fight = battle(['warden']);
    const bashed = timelineOf(fight, skill('bash', 'warden-a'));
    // Bash pushes the Warden back behind Liora and Bram.
    expect(ids(bashed).slice(0, 4)).toEqual(['rowan', 'liora', 'bram', 'warden-a']);
    expect(changedSlots(timelineOf(fight), bashed).slice(0, 5)).toEqual([
      false,
      true,
      true,
      true,
      false,
    ]);
    expect(changedSlots(timelineOf(fight), timelineOf(fight))).not.toContain(true);
  });
});

describe('slotOrigins', () => {
  test('follows each fighter’s turns in order as the timeline changes', () => {
    expect(
      slotOrigins(['r', 'w', 'l', 'b', 'r', 'w'], ['r', 'l', 'b', 'w', 'r', 'w'], false),
    ).toEqual([0, 2, 3, 1, 4, 5]);
  });

  test('takes the first turn away when one has gone by', () => {
    // Rowan's next turn moves up into the place his last one left.
    expect(slotOrigins(['r', 'w', 'r', 'l'], ['w', 'r', 'l', 'w'], true)).toEqual([1, 2, 3, null]);
    expect(slotOrigins(['r', 'r', 'w'], ['r', 'w'], true)).toEqual([1, 2]);
  });

  test('has nothing for turns that are new', () => {
    expect(slotOrigins([], ['r'], false)).toEqual([null]);
    expect(slotOrigins(['r', 'w'], ['r', 'b', 'w', 'r'], false)).toEqual([0, null, 1, null]);
  });
});

describe('playTimeline', () => {
  /** Takes `action`, and has the timeline play it out. */
  function played(before: BattleState, action: Action) {
    const result = applyAction(before, action, Rng.fromSeed(1));
    return { ...result, plan: playTimeline(before, action, result) };
  }

  test('shows the action as foreseen, then the battle as it stands once the next turn starts', () => {
    const before = battle(['warden']);
    const action = skill('bash', 'warden-a');
    const { battle: after, events, plan } = played(before, action);
    expect(events.map(({ type }) => type)).toEqual(['action', 'mp', 'damage', 'delay', 'turn']);
    expect(plan).toEqual([
      { timeline: timelineOf(before, action), advanced: false },
      null,
      null,
      null,
      { timeline: timelineOf(after), advanced: true },
    ]);
  });

  test('pushes back a target staggered on a weakness the preview couldn’t foresee', () => {
    const before = changed(battle(['wolf', 'wolf'], 'preemptive'), 'wolf-a', (wolf) => ({
      ...wolf,
      hp: 999,
    }));
    const fire = skill('fire', 'wolf-a');
    const { events, plan } = played(before, fire);
    const stagger = events.findIndex(({ type }) => type === 'stagger');
    expect(stagger).toBeGreaterThan(0);
    const foreseen = plan[0]?.timeline ?? [];
    const staggered = plan[stagger]?.timeline ?? [];
    expect(ids(foreseen)).toEqual(ids(timelineOf(before, fire)));
    // As the preview would have shown it, had the party known the Wolf is weak to Fire.
    expect(staggered).toEqual(timelineOf({ ...before, known: { wolf: ['fire'] } }, fire));
    expect(ids(staggered).indexOf('wolf-a')).toBeGreaterThan(ids(foreseen).indexOf('wolf-a'));
    expect(plan[stagger]?.advanced).toBe(false);
  });

  test('takes the KO’d off the timeline, and fills it up from further on', () => {
    const before = changed(battle(['wolf', 'wolf'], 'preemptive'), 'wolf-a', (wolf) => ({
      ...wolf,
      hp: 1,
    }));
    const { events, plan } = played(before, attack('wolf-a'));
    const ko = events.findIndex(({ type }) => type === 'ko');
    const timeline = plan[ko]?.timeline ?? [];
    expect(timeline).toHaveLength(1 + TIMELINE_TURNS);
    expect(ids(timeline)[0]).toBe('rowan');
    expect(ids(timeline).slice(1)).not.toContain('wolf-a');
    expect(ids(timeline).slice(1)).toContain('wolf-b');
  });

  test('takes a turn away for each that goes by, even a sleeper’s', () => {
    const before = changed(
      battle(['wolf'], 'preemptive'),
      'liora',
      (liora) => giveStatus(liora, 'sleep', 'wolf-a', TUNING).fighter,
    );
    const { battle: after, events, plan } = played(before, attack('wolf-a'));
    expect(events.filter(({ type }) => type === 'turn')).toEqual([
      { type: 'turn', fighter: 'liora' },
      { type: 'turn', fighter: 'bram' },
    ]);
    const turns = events.flatMap((event, index) => (event.type === 'turn' ? [plan[index]] : []));
    // Liora's turn passes her by, as foreseen; then Bram's brings the battle as it stands.
    const foreseen = timelineOf(before, attack('wolf-a'), 2 * TIMELINE_TURNS);
    expect(ids(foreseen).slice(0, 3)).toEqual(['rowan', 'liora', 'bram']);
    expect(turns[0]).toEqual({ timeline: foreseen.slice(1, 2 + TIMELINE_TURNS), advanced: true });
    expect(turns[1]).toEqual({ timeline: timelineOf(after), advanced: true });
  });

  test('lets turns go by once the battle is over', () => {
    // Rowan is poisoned with 1 HP left, and alone: his next turn finishes him.
    const alone = changed(battle(['wolf'], 'preemptive'), 'bram', knockedOut);
    const poisoned = changed(changed(alone, 'liora', knockedOut), 'rowan', (rowan) => ({
      ...giveStatus(rowan, 'poison', 'wolf-a', TUNING).fighter,
      hp: 1,
    }));
    const { battle: after, events, plan } = played(poisoned, { type: 'guard' });
    expect(after.outcome).toBe('defeat');
    const turn = events.findIndex(({ type }) => type === 'turn');
    expect(plan[turn]?.advanced).toBe(true);
    expect(plan[turn]?.timeline[0]?.id).toBe('rowan');
    // He's down, so his turns to come leave the timeline; this one passes him by.
    const ko = events.findIndex(({ type }) => type === 'ko');
    expect(ko).toBeGreaterThan(turn);
    const timeline = ids(plan[ko]?.timeline ?? []);
    expect(timeline[0]).toBe('rowan');
    expect(timeline.slice(1)).not.toContain('rowan');
  });
});

/** Everything the fighter whose turn it is could do now, aimed every way it could be. */
function choices(fight: BattleState): Action[] {
  const actor = activeFighter(fight);
  const commands: Command[] = [
    { type: 'attack' },
    { type: 'guard' },
    { type: 'flee' },
    ...actor.skills.map((each): Command => ({ type: 'skill', skill: each })),
    ...Object.keys(fight.inventory).map((item): Command => ({ type: 'item', item })),
  ];
  return commands.flatMap((command) => {
    if (checkCommand(fight, command) !== undefined) return [];
    const targets = targetChoices(fight, command);
    const actions: Action[] =
      targets.length === 0
        ? [command as Action]
        : targets.map((target) => ({ ...command, target }) as Action);
    return actions.filter((action) => checkAction(fight, action) === undefined);
  });
}

test('in battles played at random, the timeline keeps up with every turn', () => {
  const inventory = { potion: 2, ether: 1, feather: 2, antidote: 1, 'fire-bomb': 2, smoke: 1 };
  const enemies = ['wolf', 'slime', 'warden'] as const;
  let actions = 0;
  for (let seed = 0; seed < 120; seed++) {
    const rng = Rng.fromSeed(seed);
    const picks = Rng.fromSeed(`timeline ${seed}`);
    const foes = Array.from({ length: picks.int(1, 4) }, () => picks.pick(enemies));
    let fight = startBattle({ enemies: foes }, gameWith(undefined, inventory), DB, TUNING, rng);
    while (fight.active !== null && actions < 100_000) {
      const enemy = activeFighter(fight).side === 'enemies';
      const action = enemy ? chooseEnemyAction(fight, picks) : picks.pick(choices(fight));
      const result = applyAction(fight, action, rng);
      const plan = playTimeline(fight, action, result);
      expect(plan).toHaveLength(result.events.length);
      let last: Timeline = [];
      result.events.forEach((event, index) => {
        const change = plan[index];
        if (!change) return;
        last = change.timeline;
        expect(change.timeline.length).toBeLessThanOrEqual(1 + TIMELINE_TURNS);
        // Each turn that starts is the first on the timeline.
        if (event.type === 'turn') expect(change.timeline[0]?.id).toBe(event.fighter);
        expect(change.advanced).toBe(event.type === 'turn');
      });
      const after = result.battle;
      if (after.active !== null) expect(last).toEqual(timelineOf(after));
      // Nobody KO'd has a turn coming.
      const down = new Set(after.fighters.filter(isKo).map((fighter) => fighter.id));
      expect(ids(last.slice(1)).filter((id) => down.has(id))).toEqual([]);
      fight = after;
      actions++;
    }
    expect(fight.active).toBeNull();
  }
  // Enough turns for the comparison to count for something.
  expect(actions).toBeGreaterThan(2000);
});

describe('letterOf', () => {
  test('tells enemies of a kind apart, and leaves those alone and the party unlettered', () => {
    const fight = battle(['wolf', 'slime', 'wolf']);
    expect(['wolf-a', 'wolf-b', 'slime-a', 'rowan'].map((id) => letterOf(fight, id))).toEqual([
      'A',
      'B',
      '',
      '',
    ]);
  });
});

describe('iconWindow', () => {
  test('is all of a frame the size of an icon', () => {
    expect(iconWindow({ width: 16, height: 16 }, 16)).toEqual({
      x: 0,
      y: 0,
      width: 16,
      height: 16,
    });
  });

  test('takes the middle of a wider frame and the bottom of a taller one, where fighters stand', () => {
    expect(iconWindow({ width: 18, height: 17 }, 16)).toEqual({
      x: 1,
      y: 1,
      width: 16,
      height: 16,
    });
    expect(iconWindow({ width: 96, height: 48 }, 16)).toEqual({
      x: 40,
      y: 32,
      width: 16,
      height: 16,
    });
  });

  test('is where a sheet says its fighter’s face is', () => {
    expect(iconWindow({ width: 96, height: 48 }, 16, { x: 40, y: 8 })).toEqual({
      x: 40,
      y: 8,
      width: 16,
      height: 16,
    });
  });
});

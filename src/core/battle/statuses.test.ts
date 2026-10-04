import { describe, expect, test } from 'vitest';
import type { Fighter } from './fighter';
import { SKILLS, TUNING } from './fixtures';
import {
  OPPOSITES,
  atTurnEnd,
  atTurnStart,
  buffsOf,
  cureStatuses,
  giveStatus,
  isImmune,
  isMagic,
  knockedOut,
  speedOf,
  statusTurns,
  tickAmount,
  woken,
} from './statuses';
import { STATUSES } from './terms';

const WOLF: Fighter = {
  id: 'wolf-a',
  side: 'enemies',
  kind: 'wolf',
  name: 'Wolf',
  slot: 0,
  stats: { hp: 60, mp: 10, atk: 12, def: 6, mag: 4, res: 4, spd: 12 },
  hp: 60,
  mp: 10,
  ct: 100,
  statuses: {},
  staggered: false,
  reactions: {},
  boss: false,
  skills: [],
  turns: 0,
};

const BOSS: Fighter = { ...WOLF, id: 'warden-a', kind: 'warden', boss: true };

/** A fighter given a status by Rowan. */
const given = (fighter: Fighter, status: Parameters<typeof giveStatus>[1]): Fighter =>
  giveStatus(fighter, status, 'rowan', TUNING).fighter;

describe('statusTurns', () => {
  test('is how many of their turns each status lasts: Poison until it is cured', () => {
    expect(statusTurns('haste', false, TUNING)).toBe(3);
    expect(statusTurns('atk-up', false, TUNING)).toBe(3);
    expect(statusTurns('provoke', false, TUNING)).toBe(2);
    expect(statusTurns('poison', false, TUNING)).toBeUndefined();
  });

  test('is half as long, rounded up, for Slow on a boss', () => {
    expect(statusTurns('slow', true, TUNING)).toBe(2);
    expect(statusTurns('haste', true, TUNING)).toBe(3);
  });
});

describe('giveStatus', () => {
  test('gives a status for its turns, and says so', () => {
    const { fighter, events } = giveStatus(WOLF, 'blind', 'rowan', TUNING);
    expect(fighter.statuses).toEqual({ blind: { turns: 3 } });
    expect(events).toEqual([{ type: 'status-added', target: 'wolf-a', status: 'blind', turns: 3 }]);
    expect(giveStatus(WOLF, 'poison', 'rowan', TUNING)).toEqual({
      fighter: { ...WOLF, statuses: { poison: {} } },
      events: [{ type: 'status-added', target: 'wolf-a', status: 'poison' }],
    });
  });

  test('starts the count over when given again: nothing stacks', () => {
    const worn = { ...WOLF, statuses: { blind: { turns: 1 } } };
    expect(given(worn, 'blind').statuses).toEqual({ blind: { turns: 3 } });
  });

  test('takes away its opposite, so a stat is up, down or neither', () => {
    const { fighter, events } = giveStatus(given(WOLF, 'atk-down'), 'atk-up', 'rowan', TUNING);
    expect(fighter.statuses).toEqual({ 'atk-up': { turns: 3 } });
    expect(events).toEqual([
      { type: 'status-removed', target: 'wolf-a', status: 'atk-down', reason: 'replaced' },
      { type: 'status-added', target: 'wolf-a', status: 'atk-up', turns: 3 },
    ]);
    for (const [status, opposite] of Object.entries(OPPOSITES)) {
      expect(OPPOSITES[opposite]).toBe(status);
    }
  });

  test('remembers who provoked them', () => {
    expect(giveStatus(WOLF, 'provoke', 'bram', TUNING).fighter.statuses).toEqual({
      provoke: { turns: 2, from: 'bram' },
    });
  });

  test('shortens the wait for their turn at once for Haste, and lengthens it for Slow', () => {
    expect(given(WOLF, 'haste').ct).toBe(60);
    expect(given(WOLF, 'slow').ct).toBe(160);
    // Haste in place of Slow: 160 × 0.6 / 1.6.
    expect(given(given(WOLF, 'slow'), 'haste').ct).toBe(60);
    // Haste again changes nothing.
    expect(given(given(WOLF, 'haste'), 'haste').ct).toBe(60);
    expect(given(WOLF, 'atk-up').ct).toBe(100);
  });

  test('gives a boss Slow for half as long', () => {
    expect(given(BOSS, 'slow').statuses).toEqual({ slow: { turns: 2 } });
  });
});

describe('cureStatuses', () => {
  test('takes away the statuses named that they have, and says which', () => {
    const sick = given(given(given(WOLF, 'poison'), 'blind'), 'atk-up');
    const { fighter, events } = cureStatuses(sick, ['poison', 'silence', 'blind'], TUNING);
    expect(fighter.statuses).toEqual({ 'atk-up': { turns: 3 } });
    expect(events).toEqual([
      { type: 'status-removed', target: 'wolf-a', status: 'poison', reason: 'cured' },
      { type: 'status-removed', target: 'wolf-a', status: 'blind', reason: 'cured' },
    ]);
  });

  test('gives back the time Slow took', () => {
    expect(cureStatuses(given(WOLF, 'slow'), ['slow'], TUNING).fighter.ct).toBe(100);
  });
});

describe('woken', () => {
  test('wakes a sleeping fighter', () => {
    expect(woken(given(WOLF, 'sleep'))).toEqual({
      fighter: WOLF,
      events: [{ type: 'status-removed', target: 'wolf-a', status: 'sleep', reason: 'woke' }],
    });
    expect(woken(WOLF)).toEqual({ fighter: WOLF, events: [] });
  });
});

describe('a status’s turns', () => {
  /** A whole turn of theirs: the start, then the end. */
  const turn = (fighter: Fighter): Fighter => atTurnEnd(atTurnStart(fighter).fighter).fighter;

  test('run out over that many of the fighter’s own turns', () => {
    let wolf = given(WOLF, 'blind');
    for (let count = 1; count <= 3; count++) {
      // It's there for the whole turn: at its start and still at its end.
      wolf = atTurnStart(wolf).fighter;
      expect(wolf.statuses.blind).toEqual({ turns: 3 - count });
      const { fighter, events } = atTurnEnd(wolf);
      wolf = fighter;
      if (count < 3) expect(events).toEqual([]);
      else {
        expect(events).toEqual([
          { type: 'status-removed', target: 'wolf-a', status: 'blind', reason: 'expired' },
        ]);
      }
    }
    expect(wolf.statuses).toEqual({});
  });

  test('count from the next turn, when given during the fighter’s own', () => {
    // Given part way through a turn of theirs, it outlasts that turn's end, then three more.
    let wolf = given(atTurnStart(WOLF).fighter, 'atk-up');
    wolf = atTurnEnd(wolf).fighter;
    for (let count = 0; count < 3; count++) {
      expect(wolf.statuses['atk-up']).toBeDefined();
      wolf = turn(wolf);
    }
    expect(wolf.statuses).toEqual({});
  });

  test('never run out for Poison', () => {
    let wolf = given(WOLF, 'poison');
    for (let count = 0; count < 10; count++) wolf = turn(wolf);
    expect(wolf.statuses).toEqual({ poison: {} });
  });
});

describe('atTurnStart', () => {
  test('ends Guard, and lets the fighter be staggered again', () => {
    const guarding = { ...WOLF, staggered: true, statuses: { guard: {}, poison: {} } };
    expect(atTurnStart(guarding)).toEqual({
      fighter: { ...WOLF, statuses: { poison: {} } },
      events: [{ type: 'status-removed', target: 'wolf-a', status: 'guard', reason: 'expired' }],
    });
  });
});

describe('what statuses change', () => {
  test('Up and Down raise and lower stats', () => {
    const statuses = { 'atk-up': { turns: 3 }, 'def-down': { turns: 1 }, haste: { turns: 2 } };
    expect(buffsOf(statuses)).toEqual({ atk: 'up', def: 'down' });
    expect(buffsOf({})).toEqual({});
  });

  test('Haste and Slow change how long actions take', () => {
    expect(speedOf({ haste: { turns: 3 } }, TUNING)).toBe(0.6);
    expect(speedOf({ slow: { turns: 3 } }, TUNING)).toBe(1.6);
    expect(speedOf({ blind: { turns: 3 } }, TUNING)).toBe(1);
  });

  test('a boss can’t be put to sleep, but anything else can take', () => {
    expect(isImmune(BOSS, 'sleep')).toBe(true);
    for (const status of STATUSES) {
      expect(isImmune(WOLF, status)).toBe(false);
      if (status !== 'sleep') expect(isImmune(BOSS, status)).toBe(false);
    }
  });

  test('Silence stops magical and healing skills', () => {
    expect(
      [SKILLS.fire, SKILLS.heal, SKILLS.slash, SKILLS.haste].map(
        (skill) => skill && isMagic(skill),
      ),
    ).toEqual([true, true, false, false]);
  });

  test('Poison and Regen take and give a share of max HP, rounded down, and at least 1', () => {
    expect(tickAmount(100, 0.08)).toBe(8);
    expect(tickAmount(60, 0.08)).toBe(4);
    expect(tickAmount(10, 0.08)).toBe(1);
  });

  test('a KO takes every status away, and the fighter off the timeline', () => {
    const hurt = { ...WOLF, hp: 3, staggered: true, statuses: { poison: {}, guard: {} } };
    expect(knockedOut(hurt)).toEqual({ ...WOLF, hp: 0, ct: 0 });
  });
});

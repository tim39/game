import { describe, expect, test } from 'vitest';
import { battleAftermath } from '../src/core/battle/aftermath';
import { DB as TEST_DB, TUNING } from '../src/core/battle/fixtures';
import { encounterCountdown, rollEncounter, type EncounterTuning } from '../src/core/encounters';
import { memberVitals } from '../src/core/party';
import { Rng } from '../src/core/rng';
import type { EncounterTable } from '../src/core/schema';
import { setVitals, type GameState } from '../src/core/state';
import { AREAS, EXP_CURVE, type AreaBalance, type SimTargets } from '../src/data/balance';
import { DB } from '../src/data/db';
import {
  battleProblems,
  bossProblems,
  formatArea,
  groupName,
  partyAt,
  patchUp,
  playBattle,
  simulate,
  simulateArea,
  simulateWalks,
  walkArea,
  walkProblems,
  type AreaRun,
  type Row,
  type WalkSummary,
} from './simulate';

// The test content from src/core/battle/fixtures.ts: Rowan, Bram and Liora, whose stats are the
// same at every level and who know every skill (Heal among them), against Wolves (60 HP), Slimes
// (40 HP) and the Warden (500 HP, a boss).

const TARGETS: SimTargets = {
  battles: { won: 0.95, rounds: [3, 6] },
  boss: { won: [0.6, 0.85] },
  walk: { fell: 0.05 },
};
const ENCOUNTERS: Readonly<Record<string, EncounterTable>> = {
  test: { groups: [{ enemies: ['slime'] }, { enemies: ['wolf', 'wolf'], weight: 3 }] },
};
/** A random battle every 10 steps exactly, with nobody getting the jump. */
const EVERY_TEN: EncounterTuning = {
  steps: [10, 10],
  rates: { off: 0, low: 0.5, normal: 1, high: 2 },
  preemptive: 0,
  ambush: 0,
};
const AREA: AreaBalance = {
  name: 'the test caves',
  party: ['rowan', 'bram'],
  encounters: 'test',
  boss: ['warden'],
  // Three battles on the way: at the 10th, 20th and 30th steps.
  steps: 35,
  arrival: { level: 1, items: {} },
  // With the Flame Sword, Rowan's Attack is fire, which the Warden is weak to.
  atBoss: { level: 1, gear: { rowan: ['flame-sword'] }, items: { potion: 2 } },
};
const CONTENT = {
  db: TEST_DB,
  encounters: ENCOUNTERS,
  tuning: TUNING,
  encounterTuning: EVERY_TEN,
  curve: EXP_CURVE,
  targets: TARGETS,
};
/** The test caves, walked in with a couple of Potions. */
const STOCKED: AreaBalance = { ...AREA, arrival: { level: 1, items: { potion: 2 } } };
/** The test content, with nothing on the way but a Slime nobody could beat. */
const SLIME = TEST_DB.enemies.slime!;
const DOOMED = {
  ...CONTENT,
  db: {
    ...TEST_DB,
    enemies: {
      ...TEST_DB.enemies,
      slime: { ...SLIME, stats: { ...SLIME.stats, hp: 9999, atk: 999 } },
    },
  },
  encounters: { test: { groups: [{ enemies: ['slime'] }] } },
};

describe('partyAt', () => {
  test('makes a game with the party at a level, in its gear, with its items', () => {
    const game = partyAt(
      ['rowan', 'bram'],
      { level: 5, gear: { rowan: ['iron-sword'] }, items: { potion: 4 } },
      DB,
      EXP_CURVE,
    );
    expect(game.party).toEqual(['rowan', 'bram']);
    expect(game.members.rowan).toMatchObject({
      level: 5,
      equipment: { weapon: 'iron-sword', armor: 'travel-clothes' },
    });
    expect(game.members.bram).toMatchObject({ level: 5 });
    // The sword it replaced goes into the inventory, as equipping does.
    expect(game.inventory).toEqual({ potion: 4, 'bronze-sword': 1 });
  });
});

describe('playBattle', () => {
  const game = partyAt(['rowan', 'bram'], AREA.arrival, TEST_DB, EXP_CURVE);

  test('plays a battle to its end, the same way from the same seed', () => {
    const played = playBattle({ enemies: ['wolf', 'wolf'] }, game, CONTENT, 'seed');
    expect(played.battle.outcome).toBe('victory');
    expect(played.steps.at(-1)?.battle).toBe(played.battle);
    expect(playBattle({ enemies: ['wolf', 'wolf'] }, game, CONTENT, 'seed')).toEqual(played);
  });

  test('counts the party’s turns', () => {
    const { start, steps, partyTurns } = playBattle({ enemies: ['slime'] }, game, CONTENT, 1);
    const turns = [
      start.active,
      ...steps.flatMap(({ events }) =>
        events.flatMap((event) => (event.type === 'turn' ? [event.fighter] : [])),
      ),
    ];
    expect(partyTurns).toBe(turns.filter((id) => id === 'rowan' || id === 'bram').length);
    expect(partyTurns).toBeGreaterThan(0);
  });
});

describe('simulate', () => {
  const game = partyAt(['rowan', 'bram'], AREA.arrival, TEST_DB, EXP_CURVE);

  test('sums up battles: how many were won, in how many rounds, with how much HP left', () => {
    const summary = simulate({ enemies: ['slime'] }, game, CONTENT, 20, 'slimes');
    expect(summary.battles).toBe(20);
    expect(summary.won).toBe(1);
    expect(summary.rounds).toBeGreaterThan(0);
    expect(summary.hpLeft).toBeGreaterThan(0.9);
    expect(summary.hpLeft).toBeLessThanOrEqual(1);
  });

  test('averages the rounds and the HP left over the battles won, not those lost', () => {
    // A Warden the party beats some of the time.
    const warden = TEST_DB.enemies.warden!;
    const stats = { ...warden.stats, hp: 200, atk: 35 };
    const close = { db: { ...TEST_DB, enemies: { warden: { ...warden, stats } } }, tuning: TUNING };
    const played = Array.from({ length: 20 }, (_, index) =>
      playBattle({ enemies: ['warden'] }, game, close, `close ${index}`),
    );
    const won = played.filter(({ battle }) => battle.outcome === 'victory');
    expect(won.length).toBeGreaterThan(0);
    expect(won.length).toBeLessThan(20);
    const average = (numbers: number[]): number =>
      numbers.reduce((sum, number) => sum + number, 0) / numbers.length;
    const hpLeft = ({ battle }: (typeof won)[number]): number => {
      const party = battle.fighters.filter((fighter) => fighter.side === 'party');
      const hp = party.reduce((sum, fighter) => sum + fighter.hp, 0);
      return hp / party.reduce((sum, fighter) => sum + fighter.stats.hp, 0);
    };
    const summary = simulate({ enemies: ['warden'] }, game, close, 20, 'close');
    expect(summary.won).toBe(won.length / 20);
    expect(summary.rounds).toBeCloseTo(average(won.map(({ partyTurns }) => partyTurns / 2)), 10);
    expect(summary.hpLeft).toBeCloseTo(average(won.map(hpLeft)), 10);
  });

  test('has no rounds or HP left to speak of when nothing is won', () => {
    const outmatched = { ...CONTENT, tuning: { ...TUNING, maxDamage: 1 } };
    const summary = simulate({ enemies: ['warden'] }, game, outmatched, 3, 'hopeless');
    expect(summary).toMatchObject({ battles: 3, won: 0 });
    expect(summary.rounds).toBeNaN();
    expect(summary.hpLeft).toBeNaN();
  });
});

describe('simulateArea', () => {
  test('plays each group in the encounter table and the boss, and says what misses the targets', () => {
    const { rows } = simulateArea(AREA, CONTENT, 20);
    expect(rows.map(({ name, chance, boss }) => ({ name, chance, boss }))).toEqual([
      { name: 'Slime', chance: 0.25, boss: false },
      { name: 'Wolf ×2', chance: 0.75, boss: false },
      { name: 'Drowned Warden', chance: undefined, boss: true },
    ]);
    // The test party makes short work of a Slime, and with the Flame Sword, of the Warden too.
    const [slime, , warden] = rows;
    expect(warden?.summary.won).toBe(1);
    expect(slime?.problems).toEqual([
      `took ${slime?.summary.rounds.toFixed(1)} rounds, and should take 3 to 6`,
    ]);
    expect(warden?.problems).toEqual([
      `won ${Math.round((warden?.summary.won ?? 0) * 100)}% of the time, and should be 60% to 85%`,
    ]);
  });

  test('plays its battles with the party as it arrives, and its boss as the party reaches it', () => {
    const arrival = partyAt(AREA.party, AREA.arrival, TEST_DB, EXP_CURVE);
    const atBoss = partyAt(AREA.party, AREA.atBoss, TEST_DB, EXP_CURVE);
    // Each from seeds of its own, so the report is the same every time.
    expect(simulateArea(AREA, CONTENT, 5).rows.map(({ summary }) => summary)).toEqual([
      simulate({ enemies: ['slime'] }, arrival, CONTENT, 5, 'the test caves 0'),
      simulate({ enemies: ['wolf', 'wolf'] }, arrival, CONTENT, 5, 'the test caves 1'),
      simulate({ enemies: ['warden'] }, atBoss, CONTENT, 5, 'the test caves boss'),
    ]);
  });

  test('turns down an area whose encounter table there isn’t', () => {
    expect(() => simulateArea({ ...AREA, encounters: 'nowhere' }, CONTENT, 1)).toThrow(
      "There's no encounter table called nowhere",
    );
  });
});

test('battleProblems wants normal battles won more often than the target, in its rounds', () => {
  const summary = { battles: 200, won: 0.96, rounds: 3, hpLeft: 0.5 };
  expect(battleProblems(summary, TARGETS)).toEqual([]);
  expect(battleProblems({ ...summary, rounds: 6 }, TARGETS)).toEqual([]);
  expect(battleProblems({ ...summary, won: 0.95, rounds: 6.1 }, TARGETS)).toEqual([
    'won 95% of the time, and should be over 95%',
    'took 6.1 rounds, and should take 3 to 6',
  ]);
  expect(battleProblems({ ...summary, rounds: 2.9 }, TARGETS)).toEqual([
    'took 2.9 rounds, and should take 3 to 6',
  ]);
});

test('bossProblems wants the boss beaten within its targets, both ends included', () => {
  const summary = { battles: 200, won: 0.6, rounds: 12, hpLeft: 0.2 };
  expect(bossProblems(summary, TARGETS)).toEqual([]);
  expect(bossProblems({ ...summary, won: 0.85 }, TARGETS)).toEqual([]);
  expect(bossProblems({ ...summary, won: 0.59 }, TARGETS)).toEqual([
    'won 59% of the time, and should be 60% to 85%',
  ]);
  expect(bossProblems({ ...summary, won: 0.86 }, TARGETS)).toEqual([
    'won 86% of the time, and should be 60% to 85%',
  ]);
});

describe('walkArea', () => {
  const arrival = partyAt(AREA.party, AREA.arrival, TEST_DB, EXP_CURVE);

  test('fights a battle each time the countdown runs out, and keeps what each leaves', () => {
    // One battle, drawn as the field draws it, played from a seed of its own, then patched up.
    const rng = Rng.fromSeed('walk');
    encounterCountdown(rng, EVERY_TEN);
    const setup = rollEncounter(ENCOUNTERS.test!, rng, EVERY_TEN);
    encounterCountdown(rng, EVERY_TEN);
    const { battle } = playBattle(setup, arrival, CONTENT, 'walk 0');
    const after = battleAftermath(arrival, battle, TEST_DB, EXP_CURVE, rng);
    expect(walkArea({ ...AREA, steps: 10 }, CONTENT, 'walk')).toEqual({
      game: patchUp(after.state, CONTENT),
      battles: 1,
      found: after.rewards?.items,
      fell: false,
    });
  });

  test('walks every step of the way, the same way from the same seed', () => {
    const walk = walkArea(AREA, CONTENT, 'walk');
    expect(walk).toMatchObject({ battles: 3, fell: false });
    expect(walkArea(AREA, CONTENT, 'walk')).toEqual(walk);
    // Everyone gains every battle's EXP: three of a Slime's 3 or two Wolves' 12.
    const { rowan, bram } = walk.game.members;
    expect(rowan?.exp).toBe(bram?.exp);
    expect([9, 18, 27, 36]).toContain(rowan?.exp);
    expect(walk.game.gold).toBeGreaterThan(0);
    // Short of the first battle, nothing happens.
    expect(walkArea({ ...AREA, steps: 9 }, CONTENT, 'walk')).toEqual({
      game: arrival,
      battles: 0,
      found: {},
      fell: false,
    });
  });

  test('ends where the party falls, leaving the game as it was before that battle', () => {
    expect(walkArea(AREA, DOOMED, 'doomed')).toEqual({
      game: arrival,
      battles: 1,
      found: {},
      fell: true,
    });
  });
});

describe('patchUp', () => {
  /** The test party with Rowan on `rowan` HP and Bram on `bram`, and that much MP each. */
  function hurt(rowan: number, bram: number, mp: number, items = { potion: 2 }): GameState {
    let game = partyAt(['rowan', 'bram'], { level: 1, items }, TEST_DB, EXP_CURVE);
    for (const [id, hp] of [
      ['rowan', rowan],
      ['bram', bram],
    ] as const) {
      game = setVitals(game, id, { hp, mp }, memberVitals(game, id, TEST_DB).most);
    }
    return game;
  }
  const vitals = (game: GameState, id: string) => memberVitals(game, id, TEST_DB).now;

  test('leaves the party be while nobody is below half their HP', () => {
    const game = hurt(50, 75, 10);
    expect(patchUp(game, CONTENT)).toBe(game);
  });

  test('heals the worst hurt first, with a healing skill while anyone has the MP for one', () => {
    // Rowan (30 of 100) is worse than Bram (60 of 150): Rowan's Heal gives 20, to half, then
    // another goes to Bram. Rowan heals first, as first in the party to know it.
    const healed = patchUp(hurt(30, 60, 10), CONTENT);
    expect(vitals(healed, 'rowan')).toEqual({ hp: 50, mp: 2 });
    expect(vitals(healed, 'bram')).toEqual({ hp: 80, mp: 10 });
    expect(healed.inventory).toEqual({ potion: 2 });
  });

  test('falls back on Potions, and stops when there’s nothing left to heal with', () => {
    const potions = patchUp(hurt(30, 60, 0), CONTENT);
    expect(vitals(potions, 'rowan').hp).toBe(80);
    expect(vitals(potions, 'bram').hp).toBe(110);
    expect(potions.inventory).toEqual({});
    const stuck = hurt(30, 60, 0, { potion: 1 });
    const once = patchUp(stuck, CONTENT);
    expect(vitals(once, 'rowan').hp).toBe(80);
    expect(vitals(once, 'bram').hp).toBe(60);
  });
});

describe('simulateWalks', () => {
  test('sums walks up, each from a seed of its own', () => {
    const walks = [0, 1, 2, 3].map((index) =>
      walkArea(STOCKED, CONTENT, `the test caves walk ${index}`),
    );
    const average = (numbers: number[]): number =>
      numbers.reduce((sum, number) => sum + number, 0) / numbers.length;
    const summary = simulateWalks(STOCKED, CONTENT, 4);
    expect(summary).toMatchObject({ walks: 4, fell: 0, battles: 3 });
    expect(summary.exp).toBeCloseTo(average(walks.map(({ game }) => game.members.rowan?.exp ?? 0)));
    expect(summary.gold).toBeCloseTo(average(walks.map(({ game }) => game.gold)));
    expect(Object.values(summary.levels).reduce((sum, share) => sum + share, 0)).toBeCloseTo(1);
    const potions = walks.map(
      ({ game, found }) => 2 + (found.potion ?? 0) - (game.inventory.potion ?? 0),
    );
    expect(summary.used.potion ?? 0).toBeCloseTo(average(potions));
  });

  test('sums up only the walks that reached the boss', () => {
    expect(simulateWalks(STOCKED, DOOMED, 2)).toEqual({
      walks: 2,
      fell: 1,
      battles: 1,
      exp: Number.NaN,
      levels: {},
      gold: Number.NaN,
      used: {},
    });
  });
});

test('walkProblems wants few walks to fall, and the party at the boss’s level when it gets there', () => {
  const walk: WalkSummary = {
    walks: 200,
    fell: 0.05,
    battles: 3,
    exp: 12,
    levels: { 2: 1 },
    gold: 20,
    used: {},
  };
  // Level 2 takes 12 EXP, and level 3 takes 68.
  const area = { ...AREA, atBoss: { ...AREA.atBoss, level: 2 } };
  expect(walkProblems(walk, area, CONTENT)).toEqual([]);
  expect(walkProblems({ ...walk, exp: 67.9 }, area, CONTENT)).toEqual([]);
  expect(walkProblems({ ...walk, fell: 0.06, exp: 11.9 }, area, CONTENT)).toEqual([
    'The party fell on the way to the boss in 6% of walks, and should in no more than 5%',
    'The party reached the boss with 11 EXP on average, and should with 12 to 67, for level 2',
  ]);
  expect(walkProblems({ ...walk, exp: 68 }, area, CONTENT)).toEqual([
    'The party reached the boss with 68 EXP on average, and should with 12 to 67, for level 2',
  ]);
  // With nobody getting there, falling is the problem.
  expect(walkProblems({ ...walk, fell: 1, exp: Number.NaN }, area, CONTENT)).toEqual([
    'The party fell on the way to the boss in 100% of walks, and should in no more than 5%',
  ]);
  // There's no level past the last.
  const last = { ...AREA, atBoss: { ...AREA.atBoss, level: EXP_CURVE.maxLevel } };
  expect(walkProblems({ ...walk, exp: 1e6 }, last, CONTENT)).toEqual([]);
});

test('simulateArea walks the main path as many times as it plays each battle', () => {
  expect(simulateArea(AREA, CONTENT, 3).walk).toEqual({
    summary: simulateWalks(AREA, CONTENT, 3),
    problems: walkProblems(simulateWalks(AREA, CONTENT, 3), AREA, CONTENT),
  });
});

test('formatArea lays the rows out as a table, then the walk, with what misses the targets after', () => {
  const summary = { battles: 200, won: 1, rounds: 4.25, hpLeft: 0.8 };
  const rows: Row[] = [
    { name: 'Slime', chance: 0.25, boss: false, summary, problems: [] },
    {
      name: 'Wolf ×2',
      chance: 0.75,
      boss: false,
      summary: { ...summary, won: 0.9 },
      problems: ['won 90% of the time, and should be over 95%'],
    },
    {
      name: 'Drowned Warden',
      boss: true,
      summary: { ...summary, won: 0.7, rounds: 12 },
      problems: [],
    },
  ];
  const walk: WalkSummary = {
    walks: 200,
    fell: 0.02,
    battles: 3,
    exp: 30.4,
    levels: { 3: 0.75, 2: 0.25 },
    gold: 21.6,
    // Too little of a Feather to speak of.
    used: { potion: 1.2, feather: 0.01 },
  };
  const level =
    'The party reached the boss with 30 EXP on average, and should with 0 to 11, for level 1';
  const run: AreaRun = { rows, walk: { summary: walk, problems: [level] } };
  expect(formatArea(AREA, run, TEST_DB)).toEqual([
    'The test caves: Rowan and Bram at level 1 for its battles, and 1 for its boss. 200 battles each.',
    '',
    '  Battle                             Chance    Won  Rounds  HP left',
    '  Slime                                 25%   100%     4.3      80%',
    '  Wolf ×2                               75%    90%     4.3      80%  ✗',
    '  Drowned Warden (boss)                        70%    12.0      80%',
    '',
    '  The way to the boss, 35 steps, walked 200 times: 3.0 battles, and the party fell in 2%.',
    '  It got there at level 2 (25%) or 3 (75%), with 30 EXP and 22 gold on average.',
    '  On the way it used up Potion ×1.2, on average.',
    '',
    '  ✗ Wolf ×2 won 90% of the time, and should be over 95%.',
    `  ✗ ${level}.`,
  ]);
  const fine = { rows: rows.slice(0, 1), walk: { summary: { ...walk, used: {} }, problems: [] } };
  expect(formatArea(AREA, fine, TEST_DB).slice(-3)).toEqual([
    '  It used up nothing on the way.',
    '',
    '  All within the targets.',
  ]);
  const lost = { ...walk, fell: 1, exp: Number.NaN, levels: {}, gold: Number.NaN, used: {} };
  expect(formatArea(AREA, { rows, walk: { summary: lost, problems: [] } }, TEST_DB)).toContain(
    '  It never got there.',
  );
});

test('groupName counts each kind of enemy', () => {
  expect(groupName(['wolf', 'slime', 'wolf'], TEST_DB)).toBe('Wolf ×2 + Slime');
  expect(groupName(['warden'], TEST_DB)).toBe('Drowned Warden');
});

// The real areas are checked by `npm run validate` (checkAreas); how they play is for `npm run sim`.
test('every real area can be played', () => {
  for (const area of Object.values(AREAS)) {
    expect(() => partyAt(area.party, area.atBoss, DB, EXP_CURVE)).not.toThrow();
  }
});

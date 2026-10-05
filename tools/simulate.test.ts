import { describe, expect, test } from 'vitest';
import { DB as TEST_DB, TUNING } from '../src/core/battle/fixtures';
import type { EncounterTable } from '../src/core/schema';
import { AREAS, EXP_CURVE, type AreaBalance, type SimTargets } from '../src/data/balance';
import { DB } from '../src/data/db';
import {
  battleProblems,
  bossProblems,
  formatArea,
  groupName,
  partyAt,
  playBattle,
  simulate,
  simulateArea,
  type Row,
} from './simulate';

// The test content from src/core/battle/fixtures.ts: Rowan, Bram and Liora, whose stats are the
// same at every level, against Wolves (60 HP), Slimes (40 HP) and the Warden (500 HP, a boss).

const TARGETS: SimTargets = { battles: { won: 0.95, rounds: [3, 6] }, boss: { won: [0.6, 0.85] } };
const ENCOUNTERS: Readonly<Record<string, EncounterTable>> = {
  test: { groups: [{ enemies: ['slime'] }, { enemies: ['wolf', 'wolf'], weight: 3 }] },
};
const AREA: AreaBalance = {
  name: 'the test caves',
  party: ['rowan', 'bram'],
  encounters: 'test',
  boss: ['warden'],
  arrival: { level: 1, items: {} },
  // With the Flame Sword, Rowan's Attack is fire, which the Warden is weak to.
  atBoss: { level: 1, gear: { rowan: ['flame-sword'] }, items: { potion: 2 } },
};
const CONTENT = {
  db: TEST_DB,
  encounters: ENCOUNTERS,
  tuning: TUNING,
  curve: EXP_CURVE,
  targets: TARGETS,
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
    const rows = simulateArea(AREA, CONTENT, 20);
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
    expect(simulateArea(AREA, CONTENT, 5).map(({ summary }) => summary)).toEqual([
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

test('formatArea lays the rows out as a table, with what misses the targets after it', () => {
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
  expect(formatArea(AREA, rows, TEST_DB)).toEqual([
    'The test caves: Rowan and Bram at level 1 for its battles, and 1 for its boss. 200 battles each.',
    '',
    '  Battle                             Chance    Won  Rounds  HP left',
    '  Slime                                 25%   100%     4.3      80%',
    '  Wolf ×2                               75%    90%     4.3      80%  ✗',
    '  Drowned Warden (boss)                        70%    12.0      80%',
    '',
    '  ✗ Wolf ×2 won 90% of the time, and should be over 95%.',
  ]);
  expect(formatArea(AREA, rows.slice(0, 1), TEST_DB).at(-1)).toBe('  All within the targets.');
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

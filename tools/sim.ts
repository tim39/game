// `npm run sim`: the battle simulator (see Battle engine in docs/TECH.md). It plays every area's
// battles with the party and the enemies following their AI, walks each area's main path battle
// after battle, and reports how they went against the targets in docs/DESIGN.md, exiting 1 if any
// are outside them. With --log, it plays one battle and tells it turn by turn instead.
import { parseArgs } from 'node:util';
import {
  AREAS,
  BATTLE_TUNING,
  ENCOUNTER_TUNING,
  EXP_CURVE,
  SIM_TARGETS,
} from '../src/data/balance';
import { DB } from '../src/data/db';
import { ENCOUNTERS } from '../src/data/encounters';
import { battleLog } from './battle-log';
import { formatArea, groupName, partyAt, playBattle, simulateArea } from './simulate';

const HELP = `npm run sim                     Plays every area's battles, and walks its way to the boss,
                                and says how they went.
npm run sim -- --battles 500    ...this many of each, and walks, not 200.
npm run sim -- --log wolf,wolf  Plays one battle against these enemies, turn by turn, with the
                                first area's party as they arrive there.
  --boss                        ...against the area's boss, with the party as they reach it.
  --area tide-caves             ...with this area's party.
  --level 3                     ...with the party at this level.
  --seed 7                      ...from this seed, not 1.`;

const { values } = parseArgs({
  options: {
    battles: { type: 'string', default: '200' },
    log: { type: 'string' },
    boss: { type: 'boolean', default: false },
    area: { type: 'string' },
    level: { type: 'string' },
    seed: { type: 'string', default: '1' },
    help: { type: 'boolean', default: false },
  },
});

const content = {
  db: DB,
  encounters: ENCOUNTERS,
  tuning: BATTLE_TUNING,
  encounterTuning: ENCOUNTER_TUNING,
  curve: EXP_CURVE,
  targets: SIM_TARGETS,
};

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** A whole number from an option, or the end of the run. */
function whole(text: string, option: string): number {
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number < 1)
    fail(`--${option} takes a whole number of 1 or more, not ${text}`);
  return number;
}

if (values.help) {
  console.log(HELP);
} else if (values.log !== undefined || values.boss) {
  const id = values.area ?? Object.keys(AREAS)[0] ?? '';
  const area = AREAS[id] ?? fail(`There's no area called ${id}`);
  const enemies = values.boss ? area.boss : (values.log ?? '').split(',').filter(Boolean);
  const checkpoint = values.boss ? area.atBoss : area.arrival;
  const level = values.level === undefined ? checkpoint.level : whole(values.level, 'level');
  const seed = /^\d+$/.test(values.seed) ? Number(values.seed) : values.seed;
  try {
    const game = partyAt(area.party, { ...checkpoint, level }, DB, EXP_CURVE);
    const played = playBattle({ enemies }, game, content, seed);
    const party = area.party.map((member) => DB.characters[member]?.name ?? member).join(' and ');
    console.log(`${party}, level ${level}, against ${groupName(enemies, DB)}. Seed ${seed}.\n`);
    console.log(battleLog(played.start, played.steps).join('\n'));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
} else {
  const battles = whole(values.battles, 'battles');
  let problems = 0;
  for (const area of Object.values(AREAS)) {
    const run = simulateArea(area, content, battles);
    problems += run.rows.reduce((sum, row) => sum + row.problems.length, 0);
    problems += run.walk.problems.length;
    console.log(formatArea(area, run, DB).join('\n'));
  }
  console.log(
    `\nThe targets (Levels in docs/DESIGN.md): normal battles won over ` +
      `${SIM_TARGETS.battles.won * 100}% of the time in ${SIM_TARGETS.battles.rounds.join(' to ')} ` +
      `rounds, and bosses beaten ${SIM_TARGETS.boss.won.map((share) => share * 100).join('% to ')}% ` +
      'of the time, by a party following its AI. A round is a turn for each party member. Walking ' +
      'its main path at the Normal encounter rate, battle after battle, the party reaches the boss ' +
      `at its level, and falls on the way in no more than ${SIM_TARGETS.walk.fell * 100}% of walks.`,
  );
  if (problems > 0) process.exit(1);
}

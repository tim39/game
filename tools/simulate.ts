import { chooseEnemyAction } from '../src/core/battle/ai';
import {
  activeFighter,
  applyAction,
  startBattle,
  type BattleSetup,
  type BattleState,
} from '../src/core/battle/battle';
import { choosePartyAction } from '../src/core/battle/party-ai';
import type { BattleTuning } from '../src/core/battle/tuning';
import type { GameDb } from '../src/core/db';
import { expToReach, type ExpCurve } from '../src/core/levels';
import { startGame } from '../src/core/party';
import { Rng } from '../src/core/rng';
import type { EncounterTable } from '../src/core/schema';
import { addItem, equip, gainExp, type GameState } from '../src/core/state';
import type { AreaBalance, PartyCheckpoint, SimTargets } from '../src/data/balance';
import type { Step } from './battle-log';

/**
 * The battle simulator behind `npm run sim` (see Battle engine in docs/TECH.md): it plays battles
 * to their end with the party and the enemies following their AI, and sums them up against the
 * targets in docs/DESIGN.md.
 */

/** A battle that goes on this long is stuck, which is a bug. */
const MOST_TURNS = 1000;

/** What the content and tuning the simulator plays with. */
export interface SimContent {
  readonly db: GameDb;
  readonly encounters: Readonly<Record<string, EncounterTable>>;
  readonly tuning: BattleTuning;
  readonly curve: ExpCurve;
  readonly targets: SimTargets;
}

/** A game with `party` at a checkpoint: at its level, in its gear, carrying its items. */
export function partyAt(
  party: readonly string[],
  checkpoint: PartyCheckpoint,
  db: GameDb,
  curve: ExpCurve,
): GameState {
  const location = { map: 'sim', x: 0, y: 0, facing: 'down' } as const;
  let game = startGame({ location, party, inventory: checkpoint.items }, db);
  for (const id of party) game = gainExp(game, id, expToReach(checkpoint.level, curve), curve);
  for (const [id, gear] of Object.entries(checkpoint.gear ?? {})) {
    for (const item of gear) game = equip(addItem(game, item), id, item, db);
  }
  return game;
}

/** A battle played to its end. */
export interface Played {
  readonly start: BattleState;
  readonly steps: readonly Step[];
  readonly battle: BattleState;
  /** The party's turns, of every turn the battle took. */
  readonly partyTurns: number;
}

/** Plays a battle to its end, with both sides following their AI, from a seed. */
export function playBattle(
  setup: BattleSetup,
  game: GameState,
  content: Pick<SimContent, 'db' | 'tuning'>,
  seed: number | string,
): Played {
  const rng = Rng.fromSeed(seed);
  const start = startBattle(setup, game, content.db, content.tuning, rng);
  const isParty = (id: string | null): boolean => game.party.some((member) => member === id);
  let battle = start;
  let partyTurns = isParty(start.active) ? 1 : 0;
  const steps: Step[] = [];
  while (battle.active !== null) {
    if (battle.turn > MOST_TURNS) {
      throw new Error(`A battle against ${setup.enemies.join(', ')} went past ${MOST_TURNS} turns`);
    }
    const actor = activeFighter(battle);
    const action =
      actor.side === 'party' ? choosePartyAction(battle) : chooseEnemyAction(battle, rng);
    const result = applyAction(battle, action, rng);
    for (const event of result.events) {
      if (event.type === 'turn' && isParty(event.fighter)) partyTurns++;
    }
    steps.push(result);
    battle = result.battle;
  }
  return { start, steps, battle, partyTurns };
}

/** How a group of battles went. */
export interface Summary {
  readonly battles: number;
  /** The share of them won. */
  readonly won: number;
  /** How many rounds the battles won took, on average: a round is a turn for each party member. */
  readonly rounds: number;
  /** The share of the party's HP left after the battles won, on average. */
  readonly hpLeft: number;
}

/** Plays `battles` battles from seeds starting `seeds`, and sums them up. */
export function simulate(
  setup: BattleSetup,
  game: GameState,
  content: Pick<SimContent, 'db' | 'tuning'>,
  battles: number,
  seeds: string,
): Summary {
  let won = 0;
  let rounds = 0;
  let hpLeft = 0;
  for (let index = 0; index < battles; index++) {
    const { battle, partyTurns } = playBattle(setup, game, content, `${seeds} ${index}`);
    if (battle.outcome !== 'victory') continue;
    won++;
    rounds += partyTurns / game.party.length;
    const party = battle.fighters.filter((fighter) => fighter.side === 'party');
    const hp = party.reduce((sum, fighter) => sum + fighter.hp, 0);
    hpLeft += hp / party.reduce((sum, fighter) => sum + fighter.stats.hp, 0);
  }
  return {
    battles,
    won: won / battles,
    rounds: won === 0 ? Number.NaN : rounds / won,
    hpLeft: won === 0 ? Number.NaN : hpLeft / won,
  };
}

/** One of an area's battles, how it went, and anything outside the targets. */
export interface Row {
  readonly name: string;
  /** How likely the encounter table makes it, for normal battles. */
  readonly chance?: number;
  readonly boss: boolean;
  readonly summary: Summary;
  readonly problems: readonly string[];
}

/**
 * Plays an area's battles: each group in its encounter table with the party as they arrive, and
 * its boss with the party as they reach it.
 */
export function simulateArea(area: AreaBalance, content: SimContent, battles: number): Row[] {
  const { db, encounters, targets, curve } = content;
  const table = encounters[area.encounters];
  if (!table) throw new RangeError(`There's no encounter table called ${area.encounters}`);
  const arrival = partyAt(area.party, area.arrival, db, curve);
  const total = table.groups.reduce((sum, group) => sum + (group.weight ?? 1), 0);
  const rows = table.groups.map((group, index): Row => {
    const summary = simulate(
      { enemies: group.enemies },
      arrival,
      content,
      battles,
      `${area.name} ${index}`,
    );
    return {
      name: groupName(group.enemies, db),
      chance: (group.weight ?? 1) / total,
      boss: false,
      summary,
      problems: battleProblems(summary, targets),
    };
  });
  const atBoss = partyAt(area.party, area.atBoss, db, curve);
  const summary = simulate({ enemies: area.boss }, atBoss, content, battles, `${area.name} boss`);
  const boss = { name: groupName(area.boss, db), boss: true, summary };
  return [...rows, { ...boss, problems: bossProblems(summary, targets) }];
}

/** What's outside the targets about a normal battle: won more than so often, in so many rounds. */
export function battleProblems(summary: Summary, targets: SimTargets): string[] {
  const problems: string[] = [];
  const { won, rounds } = targets.battles;
  if (summary.won <= won) {
    problems.push(`won ${percent(summary.won)} of the time, and should be over ${percent(won)}`);
  }
  if (summary.rounds < rounds[0] || summary.rounds > rounds[1]) {
    problems.push(
      `took ${summary.rounds.toFixed(1)} rounds, and should take ${rounds[0]} to ${rounds[1]}`,
    );
  }
  return problems;
}

/** What's outside the targets about a boss: beaten so often, but no more. */
export function bossProblems(summary: Summary, targets: SimTargets): string[] {
  const [least, most] = targets.boss.won;
  if (summary.won >= least && summary.won <= most) return [];
  return [
    `won ${percent(summary.won)} of the time, and should be ${percent(least)} to ${percent(most)}`,
  ];
}

/** A group of enemies by name: `Cave Bat ×2 + Reef Snail`. */
export function groupName(enemies: readonly string[], db: GameDb): string {
  const counts = new Map<string, number>();
  for (const id of enemies) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts]
    .map(([id, count]) => {
      const name = db.enemies[id]?.name ?? id;
      return count > 1 ? `${name} ×${count}` : name;
    })
    .join(' + ');
}

const percent = (share: number): string => `${Math.round(share * 100)}%`;

/** An area's rows as a table, with what's outside the targets after it. */
export function formatArea(area: AreaBalance, rows: readonly Row[], db: GameDb): string[] {
  const party = area.party.map((id) => db.characters[id]?.name ?? id);
  const who = `${party.slice(0, -1).join(', ')}${party.length > 1 ? ' and ' : ''}${party.at(-1)}`;
  const battles = rows[0]?.summary.battles ?? 0;
  const lines = [
    `${capitalised(area.name)}: ${who} at level ${area.arrival.level} for its battles, and ` +
      `${area.atBoss.level} for its boss. ${battles} battles each.`,
    '',
    `  ${'Battle'.padEnd(34)}${'Chance'.padStart(7)}${'Won'.padStart(7)}${'Rounds'.padStart(8)}` +
      `${'HP left'.padStart(9)}`,
  ];
  for (const row of rows) {
    const { summary } = row;
    const name = row.boss ? `${row.name} (boss)` : row.name;
    const chance = row.chance === undefined ? '' : percent(row.chance);
    const rounds = Number.isNaN(summary.rounds) ? '-' : summary.rounds.toFixed(1);
    const hpLeft = Number.isNaN(summary.hpLeft) ? '-' : percent(summary.hpLeft);
    const flag = row.problems.length > 0 ? '  ✗' : '';
    lines.push(
      `  ${name.padEnd(34)}${chance.padStart(7)}${percent(summary.won).padStart(7)}` +
        `${rounds.padStart(8)}${hpLeft.padStart(9)}${flag}`,
    );
  }
  lines.push('');
  const problems = rows.flatMap((row) => row.problems.map((problem) => `${row.name} ${problem}.`));
  if (problems.length === 0) lines.push('  All within the targets.');
  else lines.push(...problems.map((problem) => `  ✗ ${problem}`));
  return lines;
}

const capitalised = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

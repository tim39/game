import { battleAftermath } from '../src/core/battle/aftermath';
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
import {
  countStep,
  encounterCountdown,
  rollEncounter,
  type EncounterTuning,
} from '../src/core/encounters';
import { castSkill, itemTargets, skillTargets, useItem } from '../src/core/field-use';
import { expToReach, type ExpCurve } from '../src/core/levels';
import { knownSkills, memberVitals, startGame } from '../src/core/party';
import { Rng } from '../src/core/rng';
import type { EncounterTable } from '../src/core/schema';
import {
  addItem,
  equip,
  gainExp,
  itemCount,
  type CharacterId,
  type GameState,
} from '../src/core/state';
import type { AreaBalance, PartyCheckpoint, SimTargets } from '../src/data/balance';
import type { Step } from './battle-log';

/**
 * The battle simulator behind `npm run sim` (see Battle engine in docs/TECH.md): it plays battles
 * to their end with the party and the enemies following their AI, walks each area's main path
 * battle after battle, and sums them up against the targets in docs/DESIGN.md.
 */

/** A battle that goes on this long is stuck, which is a bug. */
const MOST_TURNS = 1000;

/** Between battles, as in them (src/core/battle/party-ai.ts), the party heals anyone below this. */
const HURT = 0.5;

/** What the content and tuning the simulator plays with. */
export interface SimContent {
  readonly db: GameDb;
  readonly encounters: Readonly<Record<string, EncounterTable>>;
  readonly tuning: BattleTuning;
  /** How often random battles come, for walking an area. */
  readonly encounterTuning: EncounterTuning;
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

/** How an area played: each of its battles, and the walks along its main path. */
export interface AreaRun {
  readonly rows: readonly Row[];
  readonly walk: { readonly summary: WalkSummary; readonly problems: readonly string[] };
}

/**
 * Plays an area: each group in its encounter table with the party as they arrive, and its boss
 * with the party as they reach it, `battles` times each; and walks its main path as many times.
 */
export function simulateArea(area: AreaBalance, content: SimContent, battles: number): AreaRun {
  const rows = simulateBattles(area, content, battles);
  const summary = simulateWalks(area, content, battles);
  return { rows, walk: { summary, problems: walkProblems(summary, area, content) } };
}

/** The area's encounter table, which must exist. */
function tableOf(area: AreaBalance, content: SimContent): EncounterTable {
  const table = content.encounters[area.encounters];
  if (!table) throw new RangeError(`There's no encounter table called ${area.encounters}`);
  return table;
}

/** Plays each group in the area's encounter table, and its boss. */
function simulateBattles(area: AreaBalance, content: SimContent, battles: number): Row[] {
  const { db, targets, curve } = content;
  const table = tableOf(area, content);
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

/** A walk along an area's main path, as it went. */
export interface Walk {
  /** The game as the walk left it: at the boss, or where the party fell. */
  readonly game: GameState;
  /** How many battles came on the way. */
  readonly battles: number;
  /** The items the enemies dropped on the way, by ID. */
  readonly found: Readonly<Record<string, number>>;
  /** Whether the party lost one of them, which ends the walk there. */
  readonly fell: boolean;
}

/**
 * Walks an area's main path from the party as they arrive, a step at a time at the Normal
 * encounter rate, as the field counts them: fighting each random battle that comes, with both
 * sides following their AI, and keeping what it leaves (HP and MP, items used, EXP, gold and
 * drops). Between battles, the party heals anyone below half their HP (`patchUp`). The battles'
 * groups and the countdown between them are drawn as the field draws them, from the walk's seed,
 * and each battle is played from a seed of its own.
 */
export function walkArea(area: AreaBalance, content: SimContent, seed: string): Walk {
  const { db, curve, encounterTuning } = content;
  const table = tableOf(area, content);
  const rng = Rng.fromSeed(seed);
  let game = partyAt(area.party, area.arrival, db, curve);
  let countdown = encounterCountdown(rng, encounterTuning);
  let battles = 0;
  const found: Record<string, number> = {};
  for (let step = 0; step < area.steps; step++) {
    countdown = countStep(countdown, 'normal', encounterTuning);
    if (countdown > 0) continue;
    const setup = rollEncounter(table, rng, encounterTuning);
    countdown = encounterCountdown(rng, encounterTuning);
    const { battle } = playBattle(setup, game, content, `${seed} ${battles}`);
    battles++;
    if (battle.outcome === 'defeat') return { game, battles, found, fell: true };
    const { state, rewards } = battleAftermath(game, battle, db, curve, rng);
    for (const [item, count] of Object.entries(rewards?.items ?? {})) {
      found[item] = (found[item] ?? 0) + count;
    }
    game = patchUp(state, content);
  }
  return { game, battles, found, fell: false };
}

/**
 * Heals the party between battles as it does in them: anyone below half their HP, the worst hurt
 * first, gets a healing skill from whoever has one and the MP for it, or else an item that
 * restores HP, for as long as there's any to give (see Levels in docs/DESIGN.md).
 */
export function patchUp(
  game: GameState,
  { db, tuning }: Pick<SimContent, 'db' | 'tuning'>,
): GameState {
  for (;;) {
    const worst = game.party
      .map((id) => ({ id, share: hpShare(game, id, db) }))
      .filter(({ share }) => share < HURT)
      .sort((a, b) => a.share - b.share)
      .at(0)?.id;
    const healed = worst === undefined ? undefined : heal(game, worst, db, tuning);
    if (healed === undefined) return game;
    game = healed;
  }
}

/** A member's HP, as a share of their most. */
function hpShare(game: GameState, id: CharacterId, db: GameDb): number {
  const { now, most } = memberVitals(game, id, db);
  return now.hp / most.hp;
}

/** The game once `id` is healed by the first healing skill or HP item that helps them, if any. */
function heal(
  game: GameState,
  id: CharacterId,
  db: GameDb,
  tuning: BattleTuning,
): GameState | undefined {
  for (const caster of game.party) {
    for (const skill of knownSkills(game, caster, db)) {
      if (db.skills[skill]?.kind !== 'healing') continue;
      const { all, members } = skillTargets(game, caster, skill, db);
      if (members.includes(id)) {
        return castSkill(game, caster, skill, all ? members : [id], db, tuning);
      }
    }
  }
  for (const item of Object.keys(game.inventory)) {
    const def = db.items[item];
    const restoresHp =
      def?.kind === 'consumable' &&
      def.effects.some((effect) => effect.type === 'restore' && effect.hp !== undefined);
    if (!restoresHp) continue;
    const { all, members } = itemTargets(game, item, db);
    if (members.includes(id)) return useItem(game, item, all ? members : [id], db);
  }
  return undefined;
}

/** How walks along an area's main path went. */
export interface WalkSummary {
  readonly walks: number;
  /** The share of them in which the party fell on the way. */
  readonly fell: number;
  /** How many battles came on the way, on average. */
  readonly battles: number;
  /**
   * Of the walks that reached the boss: the party's EXP there on average, the share of the party
   * at each level, by level, and the gold its battles gave, on average.
   */
  readonly exp: number;
  readonly levels: Readonly<Record<number, number>>;
  readonly gold: number;
  /** How many of each item the party used up on the way there, on average, by ID. */
  readonly used: Readonly<Record<string, number>>;
}

/** Walks an area's main path `walks` times, each from a seed of its own, and sums them up. */
export function simulateWalks(area: AreaBalance, content: SimContent, walks: number): WalkSummary {
  const start = partyAt(area.party, area.arrival, content.db, content.curve);
  let fell = 0;
  let battles = 0;
  let exp = 0;
  let gold = 0;
  const levels: Record<number, number> = {};
  const used: Record<string, number> = {};
  for (let index = 0; index < walks; index++) {
    const walk = walkArea(area, content, `${area.name} walk ${index}`);
    battles += walk.battles;
    if (walk.fell) {
      fell++;
      continue;
    }
    gold += walk.game.gold - start.gold;
    for (const id of walk.game.party) {
      const member = walk.game.members[id];
      if (!member) continue;
      exp += member.exp / walk.game.party.length;
      levels[member.level] = (levels[member.level] ?? 0) + 1 / walk.game.party.length;
    }
    for (const item of new Set([...Object.keys(start.inventory), ...Object.keys(walk.found)])) {
      const gone = itemCount(start, item) + (walk.found[item] ?? 0) - itemCount(walk.game, item);
      if (gone > 0) used[item] = (used[item] ?? 0) + gone;
    }
  }
  const got = walks - fell;
  const average = (record: Record<string | number, number>): Record<string, number> =>
    Object.fromEntries(Object.entries(record).map(([key, sum]) => [key, sum / got]));
  return {
    walks,
    fell: fell / walks,
    battles: battles / walks,
    exp: got === 0 ? Number.NaN : exp / got,
    levels: got === 0 ? {} : average(levels),
    gold: got === 0 ? Number.NaN : gold / got,
    used: got === 0 ? {} : average(used),
  };
}

/**
 * What's outside the targets about walking an area's main path: the party falls on the way no
 * more than so often, and reaches the boss with the EXP for the boss's target level, on average,
 * and not the next one's. With nobody reaching it, falling is the problem.
 */
export function walkProblems(
  summary: WalkSummary,
  area: AreaBalance,
  { targets, curve }: Pick<SimContent, 'targets' | 'curve'>,
): string[] {
  const problems: string[] = [];
  if (summary.fell > targets.walk.fell) {
    problems.push(
      `The party fell on the way to the boss in ${percent(summary.fell)} of walks, and should in ` +
        `no more than ${percent(targets.walk.fell)}`,
    );
  }
  const { level } = area.atBoss;
  const least = expToReach(level, curve);
  const next = level < curve.maxLevel ? expToReach(level + 1, curve) : Number.POSITIVE_INFINITY;
  if (!Number.isNaN(summary.exp) && (summary.exp < least || summary.exp >= next)) {
    const range =
      next === Number.POSITIVE_INFINITY ? `${least} or more` : `${least} to ${next - 1}`;
    // Rounded down, so it's never inside the range it misses.
    problems.push(
      `The party reached the boss with ${Math.floor(summary.exp)} EXP on average, and should ` +
        `with ${range}, for level ${level}`,
    );
  }
  return problems;
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

/**
 * An area's rows as a table, then how walking its main path went, with what's outside the targets
 * after them.
 */
export function formatArea(area: AreaBalance, { rows, walk }: AreaRun, db: GameDb): string[] {
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
  lines.push('', ...walkLines(area, walk.summary, db), '');
  const problems = [
    ...rows.flatMap((row) => row.problems.map((problem) => `${row.name} ${problem}.`)),
    ...walk.problems.map((problem) => `${problem}.`),
  ];
  if (problems.length === 0) lines.push('  All within the targets.');
  else lines.push(...problems.map((problem) => `  ✗ ${problem}`));
  return lines;
}

/** How walking an area's main path went, in words. */
function walkLines(area: AreaBalance, summary: WalkSummary, db: GameDb): string[] {
  const lines = [
    `  The way to the boss, ${area.steps} steps, walked ${summary.walks} times: ` +
      `${summary.battles.toFixed(1)} battles, and the party fell in ${percent(summary.fell)}.`,
  ];
  const levels = Object.entries(summary.levels)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([level, share]) => `${level} (${percent(share)})`);
  if (levels.length === 0) return [...lines, '  It never got there.'];
  const used = Object.entries(summary.used)
    .filter(([, count]) => count >= 0.05)
    .map(([item, count]) => `${db.items[item]?.name ?? item} ×${count.toFixed(1)}`);
  return [
    ...lines,
    `  It got there at level ${levels.slice(0, -1).join(', ')}${levels.length > 1 ? ' or ' : ''}` +
      `${levels.at(-1)}, with ${Math.round(summary.exp)} EXP and ${Math.round(summary.gold)} ` +
      'gold on average.',
    used.length === 0
      ? '  It used up nothing on the way.'
      : `  On the way it used up ${used.join(', ')}, on average.`,
  ];
}

const capitalised = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

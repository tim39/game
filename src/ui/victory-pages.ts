import type { Aftermath, LevelUp, Rewards } from '../core/battle/aftermath';
import { STATS } from '../core/stats';
import { BATTLE_TEXT } from '../data/ui-text';
import { wrapText } from './text-wrap';

/**
 * The victory panel's pages, after a battle won (see Winning and losing in docs/DESIGN.md): what
 * the party gained, then a page for each member who levelled up, with what it raised their stats
 * by and the skills they learned. Confirm turns each page. Pure, so the tests can read them.
 */

/** A stat a level-up raised, as shown: its short name, and by how much. */
export interface Gain {
  readonly label: string;
  readonly amount: string;
}

/** A line on a page: text, or a row of stat gains, in columns. */
export type VictoryLine = { readonly text: string } | { readonly gains: readonly Gain[] };

export interface VictoryPage {
  readonly lines: readonly VictoryLine[];
  /** A page that starts someone's level-up, which a jingle plays for. */
  readonly levelUp: boolean;
}

/** The most lines the panel shows at once: a page with more goes on over the next. */
export const VICTORY_LINES = 4;

/** How many stat gains go in a row. */
export const GAINS_PER_ROW = 4;

/** Names for the IDs an aftermath has: of characters, skills and items. */
export interface VictoryNames {
  readonly character: (id: string) => string;
  readonly skill: (id: string) => string;
  readonly item: (id: string) => string;
}

/**
 * The pages for a battle won: the EXP, gold and items it gave, then each level-up in battle order,
 * leaving out what there's none of. Text wraps at `maxWidth`, as `widthOf` measures it.
 */
export function victoryPages(
  { rewards, levelUps }: Aftermath,
  names: VictoryNames,
  maxWidth: number,
  widthOf: (text: string) => number,
): VictoryPage[] {
  const text = (line: string): VictoryLine[] =>
    wrapText(line, maxWidth, widthOf).map((wrapped) => ({ text: wrapped }));
  const pages: VictoryPage[] = [];
  const add = (lines: readonly VictoryLine[], levelUp: boolean): void => {
    for (let start = 0; start < lines.length; start += VICTORY_LINES) {
      const page = lines.slice(start, start + VICTORY_LINES);
      pages.push({ lines: page, levelUp: levelUp && start === 0 });
    }
  };
  if (rewards) add(spoilsOf(rewards, names).flatMap(text), false);
  for (const levelUp of levelUps) {
    const { won } = BATTLE_TEXT;
    const skills = levelUp.skills.map(names.skill);
    add(
      [
        ...text(won.levelUp(names.character(levelUp.id), levelUp.to)),
        ...gainRows(levelUp),
        ...(skills.length > 0 ? text(won.learned(skills)) : []),
      ],
      true,
    );
  }
  return pages;
}

/** What a page says, as plain text: a row of gains as its labels and amounts. */
export const lineText = (line: VictoryLine): string =>
  'text' in line
    ? line.text
    : line.gains.map(({ label, amount }) => `${label} ${amount}`).join(' ');

/** The lines saying what a battle gave, before they're wrapped. */
function spoilsOf({ exp, gold, items }: Rewards, names: VictoryNames): string[] {
  const { won } = BATTLE_TEXT;
  const found = Object.entries(items).map(([item, count]) =>
    count > 1 ? won.several(names.item(item), count) : names.item(item),
  );
  return [
    ...(exp > 0 ? [won.exp(exp)] : []),
    ...(gold > 0 ? [won.gold(gold)] : []),
    ...(found.length > 0 ? [won.items(found)] : []),
  ];
}

/** The stats a level-up raised, in the usual order, `GAINS_PER_ROW` to a row. */
function gainRows({ before, after }: LevelUp): VictoryLine[] {
  const gains = STATS.filter((stat) => after[stat] > before[stat]).map((stat) => ({
    label: BATTLE_TEXT.stats[stat],
    amount: BATTLE_TEXT.won.gain(after[stat] - before[stat]),
  }));
  const rows: VictoryLine[] = [];
  for (let start = 0; start < gains.length; start += GAINS_PER_ROW) {
    rows.push({ gains: gains.slice(start, start + GAINS_PER_ROW) });
  }
  return rows;
}

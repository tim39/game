import { isNamespacedId } from './ids';
import { hasFlag, type GameState } from './state';

/**
 * When something applies, going by flags: a flag that must be set, like `story.beacon-out`, or one
 * that mustn't be, `!story.beacon-out`. A list holds when all of it does.
 */
export type Condition = string | readonly string[];

const termsOf = (condition: Condition): readonly string[] =>
  typeof condition === 'string' ? [condition] : condition;

/** Whether a condition holds for this state. No condition at all always holds. */
export const conditionHolds = (condition: Condition | undefined, state: GameState): boolean =>
  conditionHoldsFor(condition, (flag) => hasFlag(state, flag));

/**
 * Whether a condition holds, given which flags are set (`isSet`). No condition at all always
 * holds.
 */
export function conditionHoldsFor(
  condition: Condition | undefined,
  isSet: (flag: string) => boolean,
): boolean {
  if (condition === undefined) return true;
  return termsOf(condition).every((term) =>
    term.startsWith('!') ? !isSet(term.slice(1)) : isSet(term),
  );
}

/** The terms of a condition that aren't a flag name, or one with a `!` before it. */
export function badConditionTerms(condition: Condition): string[] {
  return termsOf(condition).filter((term) => !isNamespacedId(term.replace(/^!/, '')));
}

/** The flags a condition looks at. */
export const conditionFlags = (condition: Condition): string[] =>
  termsOf(condition).map((term) => term.replace(/^!/, ''));

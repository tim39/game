/**
 * Levels and EXP: how much EXP each level takes (see Levels in docs/DESIGN.md). The curve is
 * tuning, so it's passed in: EXP_CURVE in src/data/balance.ts.
 */
export interface ExpCurve {
  /** The highest level there is. */
  readonly maxLevel: number;
  /** Reaching level L takes `scale × (L − 1)^power` EXP in all, rounded: none for level 1. */
  readonly scale: number;
  readonly power: number;
}

/** The EXP it takes in all to reach a level: 0 for level 1. */
export function expToReach(level: number, curve: ExpCurve): number {
  if (!Number.isSafeInteger(level) || level < 1 || level > curve.maxLevel) {
    throw new RangeError(`Levels go from 1 to ${curve.maxLevel}, so there's no level ${level}`);
  }
  return Math.round(curve.scale * (level - 1) ** curve.power);
}

/** The level that much EXP brings a character to: the highest it has the EXP for. */
export function levelForExp(exp: number, curve: ExpCurve): number {
  if (!Number.isSafeInteger(exp) || exp < 0) {
    throw new RangeError(`EXP is a whole number from 0 up, not ${exp}`);
  }
  let level = 1;
  while (level < curve.maxLevel && exp >= expToReach(level + 1, curve)) level++;
  return level;
}

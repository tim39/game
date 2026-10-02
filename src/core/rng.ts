/**
 * Seeded random numbers for everything that involves chance: battles, encounters, drops.
 * The same seed gives the same sequence on every machine, so battles, the simulator and tests
 * reproduce exactly. The algorithm is sfc32 (128-bit state), seeded through splitmix32.
 */

/** The whole generator state: plain numbers, so it can go into saves and battle snapshots. */
export type RngState = readonly [number, number, number, number];

export interface Weighted<T> {
  readonly weight: number;
  readonly value: T;
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  private constructor(state: RngState) {
    this.a = state[0] | 0;
    this.b = state[1] | 0;
    this.c = state[2] | 0;
    this.d = state[3] | 0;
  }

  /** A new generator. String seeds are hashed, so `Rng.fromSeed('tide-caves-boss')` works too. */
  static fromSeed(seed: number | string): Rng {
    let s = typeof seed === 'number' ? seed | 0 : hashString(seed);
    const splitmix32 = (): number => {
      s = (s + 0x9e3779b9) | 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
      return (z ^ (z >>> 16)) | 0;
    };
    const rng = new Rng([splitmix32(), splitmix32(), splitmix32(), splitmix32()]);
    for (let i = 0; i < 12; i++) rng.nextUint32();
    return rng;
  }

  /** Resumes a generator exactly where `state()` left it. */
  static fromState(state: RngState): Rng {
    return new Rng(state);
  }

  state(): RngState {
    return [this.a, this.b, this.c, this.d];
  }

  /** A whole number from 0 to 2³² − 1. */
  nextUint32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** A number from 0 (inclusive) to 1 (exclusive). */
  next(): number {
    return this.nextUint32() / 4294967296;
  }

  /** A whole number from `min` to `max`, both inclusive. */
  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`int(${min}, ${max}) needs whole numbers with min <= max`);
    }
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** A number from `min` (inclusive) to `max` (exclusive). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** True with probability `p`, from 0 (never) to 1 (always). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** One item, every item equally likely. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('pick() needs at least one item');
    return items[this.int(0, items.length - 1)] as T;
  }

  /** One value, chosen in proportion to its weight. Zero-weight entries are never chosen. */
  weighted<T>(entries: readonly Weighted<T>[]): T {
    let total = 0;
    for (const { weight } of entries) {
      if (!Number.isFinite(weight) || weight < 0) {
        throw new RangeError(`weighted() got an invalid weight: ${weight}`);
      }
      total += weight;
    }
    if (total === 0) throw new RangeError('weighted() needs at least one positive weight');

    let roll = this.next() * total;
    let last: T | undefined;
    for (const { weight, value } of entries) {
      if (weight === 0) continue;
      if (roll < weight) return value;
      roll -= weight;
      last = value;
    }
    // Only reachable through floating-point rounding on the final subtraction.
    return last as T;
  }

  /** A shuffled copy; the input is left alone. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  }
}

/** FNV-1a: turns a string seed into 32 bits. */
function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0;
}

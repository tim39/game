/**
 * "Blob" autotiling: a cell's picture depends on which of its 8 neighbours share its terrain, so
 * water gets shorelines and paths get grassy edges. A corner only counts when both sides next to
 * it do, which leaves 47 distinct shapes.
 */

/** One bit per neighbour, clockwise from north. */
export const NEIGHBOUR_BITS = { N: 1, NE: 2, E: 4, SE: 8, S: 16, SW: 32, W: 64, NW: 128 } as const;
export type Neighbour = keyof typeof NEIGHBOUR_BITS;

const OFFSETS: Readonly<Record<Neighbour, readonly [dx: number, dy: number]>> = {
  N: [0, -1],
  NE: [1, -1],
  E: [1, 0],
  SE: [1, 1],
  S: [0, 1],
  SW: [-1, 1],
  W: [-1, 0],
  NW: [-1, -1],
};

const SIDES = ['N', 'E', 'S', 'W'] as const;

/** Each corner, and the two sides it needs. */
const CORNERS = [
  ['NE', 'N', 'E'],
  ['SE', 'S', 'E'],
  ['SW', 'S', 'W'],
  ['NW', 'N', 'W'],
] as const;

/** The blob mask of a cell, given whether its neighbour at (dx, dy) shares its terrain. */
export function blobMask(isSame: (dx: number, dy: number) => boolean): number {
  let mask = 0;
  for (const side of SIDES) {
    if (isSame(...OFFSETS[side])) mask |= NEIGHBOUR_BITS[side];
  }
  for (const [corner, a, b] of CORNERS) {
    const sides = NEIGHBOUR_BITS[a] | NEIGHBOUR_BITS[b];
    if ((mask & sides) === sides && isSame(...OFFSETS[corner])) mask |= NEIGHBOUR_BITS[corner];
  }
  return mask;
}

const isNeighbour = (name: string): name is Neighbour => Object.hasOwn(NEIGHBOUR_BITS, name);

/**
 * The mask for a list of neighbours such as `'N E NE'`, or `''` for none. Throws on unknown
 * names, and on a corner listed without both of its sides, since `blobMask` never produces that.
 */
export function parseNeighbours(text: string): number {
  let mask = 0;
  for (const name of text.split(' ').filter(Boolean)) {
    if (!isNeighbour(name)) throw new Error(`"${name}" isn't a neighbour (N, NE, E, … NW)`);
    mask |= NEIGHBOUR_BITS[name];
  }
  for (const [corner, a, b] of CORNERS) {
    const sides = NEIGHBOUR_BITS[a] | NEIGHBOUR_BITS[b];
    if (mask & NEIGHBOUR_BITS[corner] && (mask & sides) !== sides) {
      throw new Error(`"${text}" has ${corner} without both ${a} and ${b}`);
    }
  }
  return mask;
}

/** Where each shape sits in a block of tiles: its [col, row] and the neighbours it joins up with. */
export type BlobLayout = readonly (readonly [col: number, row: number, neighbours: string])[];

/** Mask → [col, row] within the block. Throws if two tiles claim the same shape. */
export function blobLookup(layout: BlobLayout): ReadonlyMap<number, readonly [number, number]> {
  const lookup = new Map<number, readonly [number, number]>();
  for (const [col, row, neighbours] of layout) {
    const mask = parseNeighbours(neighbours);
    const taken = lookup.get(mask);
    if (taken) {
      throw new Error(`[${col}, ${row}] and [${taken.join(', ')}] both claim "${neighbours}"`);
    }
    lookup.set(mask, [col, row]);
  }
  return lookup;
}

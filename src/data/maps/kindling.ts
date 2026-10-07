import type { Direction } from '../../core/direction';
import type { GridPoint, MapObject } from '../../core/map/types';

/**
 * Saltmere on Kindling day (see STORY.md): the lamps Rowan lights, each with a flag of its own,
 * set once it's lit; the pyre, which burns from the Kindling on; and the village gathered round it.
 * Not a map, so src/data/maps/index.ts leaves it out.
 */

/**
 * The lamps, by number from 1: four round the pyre in the square, one by Tamsin's door, one on the
 * way down to the dock, and one on the lighthouse path.
 */
export const LAMPS: readonly GridPoint[] = [
  [17, 9],
  [24, 9],
  [17, 14],
  [24, 14],
  [10, 5],
  [14, 19],
  [36, 13],
];

/** A lamp's flag, set once Rowan has lit it: `saltmere.lamp-1` for the first. */
export const lampFlag = (lamp: number): string => `saltmere.lamp-${lamp}`;

/**
 * Set once every lamp is lit. From then on they all are, whatever their own flags say, as when the
 * debug menu jumps the story past it.
 */
export const ALL_LIT = 'story.lamps-lit';

/**
 * Every lamp, unlit until its flag is set (or they all are), each running its own script:
 * `saltmere/lamp1`.
 */
export const lamps = (): MapObject[] =>
  LAMPS.flatMap((at, index): MapObject[] => {
    const flag = lampFlag(index + 1);
    const script = `saltmere/lamp${index + 1}`;
    return [
      { type: 'prefab', prefab: 'lamp', at, script, when: [`!${flag}`, `!${ALL_LIT}`] },
      { type: 'prefab', prefab: 'lamp-lit', at, script, when: flag },
      { type: 'prefab', prefab: 'lamp-lit', at, script, when: [`!${flag}`, ALL_LIT] },
    ];
  });

/** Set as Tamsin lights the pyre: that's the Kindling. The pyre burns from then on. */
export const KINDLED = 'story.kindling';

/** The Kindling pyre at `at`, which `script` examining it runs: stacked, then burning. */
export const pyre = (at: GridPoint, script: string): MapObject[] => [
  { type: 'prefab', prefab: 'pyre', at, script, when: `!${KINDLED}` },
  { type: 'prefab', prefab: 'pyre-burning', at, script, when: KINDLED },
];

/**
 * Set while the village is gathered round the pyre for the Kindling: those who come are there on
 * arriving, and not wherever else they'd be.
 */
export const GATHERED = 'saltmere.kindling-gathered';

/** Someone at the Kindling, round the pyre, only there while the village is gathered. */
export const atKindling = (
  id: string,
  sprite: string,
  at: GridPoint,
  facing: Direction,
): MapObject => ({ type: 'npc', id, sprite, at, facing, when: GATHERED });

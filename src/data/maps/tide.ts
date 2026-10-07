import type { ConditionalTerrain, GridPoint, MapObject } from '../../core/map/types';

/**
 * The Tide Caves' gimmick (see STORY.md): sluice levers turn the tide on each floor, which floods
 * shallows and floats rafts while it's in, and drains them while it's out. Each floor's tide is a
 * flag of its own, set while the tide is out; at first, it's in. These build the pieces the
 * floors' maps are made of. Not a map, so src/data/maps/index.ts leaves it out.
 */

/** The caves' gloom, which their floors and their battles' backdrop are shaded with: a cool grey. */
export const CAVE_SHADE = 0x98a4c0;

/** Set once the door to the Beacon chamber, on the last floor, has been pushed open. */
export const CHAMBER_DOOR_OPEN = 'tide-caves.door-open';

/** A floor's tide: the flag set while it's out, like `tide.b1-out`. */
export const tideOut = (floor: string): string => `tide.${floor}-out`;

/** Shallows, in a map's legend: sand while the tide is out, and the sea while it's in. */
export const shallows = (tide: string): ConditionalTerrain => ({
  when: tide,
  terrain: 'sand',
  otherwise: 'sea',
});

/**
 * A sluice lever at `at`, which runs `script`: its light is blue while the tide is in, and red
 * while it's out.
 */
export const lever = (at: GridPoint, tide: string, script: string): MapObject[] => [
  { type: 'prefab', prefab: 'tide-lever-in', at, script, when: `!${tide}` },
  { type: 'prefab', prefab: 'tide-lever-out', at, script, when: tide },
];

/**
 * Rafts over the sea from `at`, `length` of them across (or down, with `down`), floating level
 * with the rock to walk on while the tide is in. Each end is drawn as one, and a single raft alone.
 */
export function rafts([x, y]: GridPoint, length: number, tide: string, down = false): MapObject[] {
  const [first, middle, last] = down
    ? ['raft-top', 'raft-down', 'raft-bottom']
    : ['raft-left', 'raft-across', 'raft-right'];
  return Array.from({ length }, (_, index) => ({
    type: 'prefab',
    prefab: length === 1 ? 'raft' : index === 0 ? first : index === length - 1 ? last : middle,
    at: down ? [x, y + index] : [x + index, y],
    when: `!${tide}`,
  }));
}

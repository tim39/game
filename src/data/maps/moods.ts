import type { MapMood } from '../../core/map/types';

/**
 * How Saltmere and the road out of it look and sound as Act 1's first day goes on (see MapMood):
 * night falls with the Kindling, and once the Beacon is out, the Gloam's mist rolls in, violet-grey,
 * to its own music. Not a map, so src/data/maps/index.ts leaves it out.
 */

/** Dusk, as the village gathers for the Kindling: a warm, low sun. */
export const DUSK_SHADE = 0xf0b090;

/** Night, after the Kindling: a cool, dark blue. */
export const NIGHT_SHADE = 0x8890c0;

/** The Gloam: its desaturated violet-grey, as on the Game Over screen and the party when it's down. */
export const GLOAM_SHADE = 0x8a7fa3;

/** The Gloam's music: the pack's Lost Village. */
const GLOAM_MUSIC = 'bgm.gloam';

/** Out of doors: night after the Kindling, and the Gloam once the Beacon is out. */
export const OUTDOOR_MOODS: readonly MapMood[] = [
  { when: 'story.beacon-out', music: GLOAM_MUSIC, shade: GLOAM_SHADE, mist: true },
  { when: 'story.kindling', shade: NIGHT_SHADE },
];

/** Indoors, where the lamps are lit, the night doesn't show; but the Gloam's music carries in. */
export const INDOOR_MOODS: readonly MapMood[] = [{ when: 'story.beacon-out', music: GLOAM_MUSIC }];

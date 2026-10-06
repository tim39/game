/** A point the main story reaches: its flag, set once it has, and what the debug menu calls it. */
export interface StoryPoint {
  readonly flag: string;
  readonly name: string;
}

/**
 * The main story so far, in the order it happens (see Plot in docs/STORY.md), each point a flag
 * that's set once the story has reached it, and stays set. Cutscenes set them (the opening, the
 * Beacon going out, its chamber), people say new things and come and go as they're set, and the
 * debug menu's Story page jumps to any of them. `story.` flags are these and only these: anything
 * else, like a chest or a side errand, has a namespace of its own, and `npm run validate` checks
 * that every `story.` flag the content names is listed here.
 */
export const STORY: readonly StoryPoint[] = [
  // Act 1. Kindling day in Saltmere: Tamsin sends Rowan out to light the village's lamps.
  { flag: 'story.lamp-duty', name: 'Lamp duty' },
  // Every lamp is lit for the festival.
  { flag: 'story.lamps-lit', name: 'Lamps lit' },
  // Bram, a Warden knight, comes to inspect the Tide Beacon.
  { flag: 'story.bram-arrived', name: 'Bram arrives' },
  // The Kindling: everyone gives the Beacon a memory, and Rowan forgets the one given.
  { flag: 'story.kindling', name: 'The Kindling' },
  // That night the Beacon goes dark, the Gloam rolls in and the Hollowed attack.
  { flag: 'story.beacon-out', name: 'Beacon out' },
  // Under the lighthouse, past the Drowned Warden, the dead Beacon's last spark leaps into Rowan.
  { flag: 'story.tide-spark', name: 'Tide spark' },
];

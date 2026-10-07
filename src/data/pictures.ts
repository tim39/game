import type { PictureDef } from '../core/schema';
import { DUSK_SHADE } from './maps/moods';

/**
 * Pictures, by ID: what the title screen shows, and the intro's illustrations. Each is drawn as a
 * battle backdrop is, a small map of the field's terrains and prefabs that fills the screen, 20
 * cells across and 12 down, the last row half hidden (see src/core/map/backdrop.ts); and over it,
 * maybe a shade, the Gloam's mist, and lights that glow, one of them a lighthouse's turning beam.
 */

/** Deep in the night: darker than the evening after the Kindling. */
const DEEP_NIGHT = 0x5a68a0;

/** The Tide Beacon's light, a warm gold, and the lit windows under it. */
const BEACON_LIGHT = 0xffd98a;
const WINDOW_LIGHT = 0xffb050;

/** The dark round the four Beacons, the Gloam's at its deepest, and a fire's and a lamp's light. */
const DARK = 0x404a78;
const DEEP_GLOAM = 0x4c4468;
const FIRE_LIGHT = 0xffa040;
const LAMP_LIGHT = 0xffd070;

export const PICTURES: Readonly<Record<string, PictureDef>> = {
  // The title screen: Saltmere's lighthouse out on its point, at night, the Tide Beacon burning at
  // the top and its beam sweeping round over the sea, and a boat out late.
  title: {
    terrain: `
      ~~~~~~~~~~~~~~~~~~~~
      ~~~~~~~~~~~~~~~~~~~~
      ~~~~~~~~~~~~~~~~~~~~
      ~~~~~~~~~~~~~~~.....
      ~~~~~~~~~~~~~~......
      ~~~~~~~~~~~~~.......
      ~~~~~~~~~~~~........
      ~~~~~~~~~~~~........
      ~~~~~~~~~~~.........
      ~~~~~~~~~~..........
      ~~~~~~~~~...........
      ~~~~~~~~~TTTTTTTTTTT
    `,
    legend: { '~': 'sea', '.': 'sand', T: 'sand-trees' },
    objects: [
      { type: 'prefab', prefab: 'lighthouse', at: [16, 3] },
      { type: 'prefab', prefab: 'palm', at: [12, 8] },
      { type: 'prefab', prefab: 'palm-2', at: [18, 8] },
      { type: 'prefab', prefab: 'rock', at: [14, 9] },
      { type: 'prefab', prefab: 'boat', at: [2, 8] },
    ],
    shade: DEEP_NIGHT,
    lights: [
      { at: [17, 3], color: BEACON_LIGHT, radius: 2.5, beam: true },
      { at: [16, 5], color: WINDOW_LIGHT, radius: 0.5 },
      { at: [18, 5], color: WINDOW_LIGHT, radius: 0.5 },
    ],
  },

  // The intro (src/data/events/saltmere.ts, the opening), its pictures above the narration, which
  // covers their last few rows.

  // Aurel's four Beacons, Tide, Gale, Stone and Ember, burning in the dark.
  beacons: {
    terrain: `
      ::::::::::::::::::::
      ::::::::::::::::::::
      ::::::::::::::::::::
      ::++++++++++++++++::
      ::++++++++++++++++::
      ::++++++++++++++++::
      ::::::::::::::::::::
      ::::::::::::::::::::
      ::::::::::::::::::::
      ::::::::::::::::::::
      ::::::::::::::::::::
      ::::::::::::::::::::
    `,
    legend: { ':': 'stone-floor', '+': 'dais' },
    objects: [
      { type: 'prefab', prefab: 'orb-tide', at: [3, 4] },
      { type: 'prefab', prefab: 'orb-gale', at: [7, 4] },
      { type: 'prefab', prefab: 'orb-stone', at: [12, 4] },
      { type: 'prefab', prefab: 'orb-ember', at: [16, 4] },
    ],
    shade: DARK,
    lights: [
      { at: [3, 4], color: 0x60b0ff, radius: 2.5 },
      { at: [7, 4], color: 0xe8f0ff, radius: 2.5 },
      { at: [12, 4], color: 0xffb040, radius: 2.5 },
      { at: [16, 4], color: 0xff6040, radius: 2.5 },
    ],
  },

  // The Gloam: a wood, a path into it, and a lamp that has gone out, lost in the mist.
  gloam: {
    terrain: `
      TTTTTTTTTTTTTTTTTTTT
      TTTTTTTTTTTTTTTTTTTT
      TTTTTT......TTTTTTTT
      TTTT...........TTTTT
      TT.......PP.......TT
      .......PPPPP........
      .....PPP...PPP......
      ...PPP.......PPPP...
      ..PP............PP..
      ....................
      ....................
      TTTTTTTTTTTTTTTTTTTT
    `,
    legend: { T: 'trees', '.': 'grass', P: 'path' },
    objects: [{ type: 'prefab', prefab: 'lamp', at: [12, 3] }],
    shade: DEEP_GLOAM,
    mist: true,
  },

  // The Kindling: a village's pyre burning at dusk, its lamps lit round it.
  kindling: {
    terrain: `
      ....................
      ....................
      ....................
      ....................
      ....................
      ....................
      ....................
      ....................
      ....................
      ....................
      ....................
      ....................
    `,
    legend: { '.': 'sand' },
    objects: [
      { type: 'prefab', prefab: 'house', at: [1, 0] },
      { type: 'prefab', prefab: 'inn', at: [15, 0] },
      { type: 'prefab', prefab: 'pyre-burning', at: [9, 3] },
      { type: 'prefab', prefab: 'lamp-lit', at: [6, 2] },
      { type: 'prefab', prefab: 'lamp-lit', at: [13, 2] },
      { type: 'prefab', prefab: 'lamp-lit', at: [6, 5] },
      { type: 'prefab', prefab: 'lamp-lit', at: [13, 5] },
      { type: 'prefab', prefab: 'palm', at: [2, 5] },
    ],
    shade: DUSK_SHADE,
    lights: [
      { at: [9, 3], color: FIRE_LIGHT, radius: 2.5 },
      { at: [10, 3], color: FIRE_LIGHT, radius: 1.5 },
      { at: [6, 2], color: LAMP_LIGHT, radius: 0.75 },
      { at: [13, 2], color: LAMP_LIGHT, radius: 0.75 },
      { at: [6, 5], color: LAMP_LIGHT, radius: 0.75 },
      { at: [13, 5], color: LAMP_LIGHT, radius: 0.75 },
    ],
  },
};

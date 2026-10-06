import { defineMap } from '../../core/map/types';
import { CAVE_SHADE, lever, rafts, shallows, tideOut } from './tide';

const TIDE = tideOut('b1');

/**
 * The Tide Caves' first floor, down the stairs from the lighthouse: a Light Shrine by the way in,
 * and shallows that cut the cavern in two while the tide is in. The lever beside them lets it out,
 * which teaches the floor's trick; past them, a lever lets it back in, floating rafts out to an
 * island with a chest on it. The stairs down are in the far corner.
 */
export default defineMap({
  id: 'tide-caves-b1',
  name: 'Tide Caves B1',
  music: 'bgm.tide-caves',
  terrain: `
    ############################
    #............ss............#
    #............ss...~~~~~~~~.#
    #............ss...~~~~~~~~.#
    #............ss...~~~..~~~.#
    #............ss...~~~..~~~.#
    #............ss...~~~~~~~~.#
    #............ss...~~~~~~~~.#
    #............ss...~~~~~~~~.#
    #..~~~.......ss............#
    #..~~~.......ss............#
    #............ss............#
    #............ss............#
    #............ss............#
    #.......~~~~~ss............#
    #.......~~~~~ss............#
    #.......~~~~~ss............#
    ############################
  `,
  legend: { '#': 'cave-wall', '.': 'sand', '~': 'sea', s: shallows(TIDE) },
  objects: [
    // Up to the lighthouse, and the shrine by the way in.
    {
      type: 'prefab',
      prefab: 'cave-stairs-up',
      at: [3, 1],
      to: { map: 'saltmere-lighthouse', spawn: 'caves' },
    },
    { type: 'spawn', id: 'stairs', at: [3, 2], facing: 'down' },
    { type: 'prefab', prefab: 'shrine', at: [6, 1], script: 'tide-caves/shrine' },
    // A lever each side of the shallows, and rafts out to the island while the tide is in.
    ...lever([11, 5], TIDE, 'tide-caves/lever-b1'),
    ...lever([16, 12], TIDE, 'tide-caves/lever-b1'),
    ...rafts([22, 6], 3, TIDE, true),
    // Down to the second floor.
    {
      type: 'prefab',
      prefab: 'cave-stairs-down',
      at: [25, 16],
      to: { map: 'tide-caves-b2', spawn: 'stairs' },
    },
    { type: 'spawn', id: 'down', at: [25, 15], facing: 'up' },
    // Treasure: on the island, in the far corner, and by the tide pool.
    { type: 'chest', at: [21, 4], flag: 'chest.tide-caves-b1-01', gold: 60 },
    { type: 'chest', at: [26, 1], flag: 'chest.tide-caves-b1-02', item: 'potion' },
    { type: 'chest', at: [1, 11], flag: 'chest.tide-caves-b1-03', item: 'eye-drops' },
    { type: 'prefab', prefab: 'cave-rock', at: [7, 3] },
    { type: 'prefab', prefab: 'blue-rock', at: [22, 13] },
    { type: 'prefab', prefab: 'stone', at: [2, 6] },
    { type: 'prefab', prefab: 'stone', at: [25, 10] },
  ],
  encounters: { table: 'tide-caves', backdrop: 'tide-caves' },
  shade: CAVE_SHADE,
});

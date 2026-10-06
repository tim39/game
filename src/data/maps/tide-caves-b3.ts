import { defineMap } from '../../core/map/types';
import { CAVE_SHADE, lever, rafts, shallows, tideOut } from './tide';

const TIDE = tideOut('b3');

/**
 * The Tide Caves' third and deepest floor: rafts across a deep channel while the tide is in, then
 * shallows to wade once it's out, to a Light Shrine and the sealed door to the Beacon chamber,
 * where the Drowned Warden waits (the boss comes with M6's next task). An island in the pool by
 * the door has a chest, for those who let the tide back in.
 */
export default defineMap({
  id: 'tide-caves-b3',
  name: 'Tide Caves B3',
  music: 'bgm.tide-caves',
  terrain: `
    ################################
    #.......~~........ss...........#
    #.......~~........ss...........#
    #.......~~..~~~...ss...........#
    #.......~~..~~~...ss...........#
    #.......~~..~~~...ss...........#
    #.......~~........ss...........#
    #.......~~........ss...........#
    #.......~~........ss...........#
    #.......~~........ss..~~~~~~~~.#
    #.......~~........ss..~~~~~~~~.#
    #.......~~........ss..~~~..~~~.#
    #.~~~...~~........ss..~~~..~~~.#
    #.~~~...~~........ss..~~~~~~~~.#
    #.~~~...~~..~~~~..ss..~~~~~~~~.#
    #.......~~..~~~~..ss..~~~~~~~~.#
    #.......~~..~~~~..ss...........#
    #.......~~........ss...........#
    #.......~~........ss...........#
    ################################
  `,
  legend: { '#': 'cave-wall', '.': 'sand', '~': 'sea', s: shallows(TIDE) },
  objects: [
    {
      type: 'prefab',
      prefab: 'cave-stairs-up',
      at: [2, 1],
      to: { map: 'tide-caves-b2', spawn: 'down' },
    },
    { type: 'spawn', id: 'stairs', at: [2, 2], facing: 'down' },
    ...lever([6, 4], TIDE, 'tide-caves/lever-b3'),
    ...rafts([8, 10], 2, TIDE),
    ...lever([15, 9], TIDE, 'tide-caves/lever-b3'),
    ...lever([21, 4], TIDE, 'tide-caves/lever-b3'),
    ...rafts([25, 9], 2, TIDE, true),
    // The last Light Shrine, and the door to the Beacon chamber, sealed for now.
    { type: 'prefab', prefab: 'shrine', at: [24, 1], script: 'tide-caves/shrine' },
    { type: 'prefab', prefab: 'cave-door', at: [27, 0], script: 'tide-caves/warden-door' },
    { type: 'chest', at: [26, 12], flag: 'chest.tide-caves-b3-01', gold: 100 },
    { type: 'chest', at: [11, 1], flag: 'chest.tide-caves-b3-02', item: 'potion' },
    { type: 'chest', at: [1, 18], flag: 'chest.tide-caves-b3-03', item: 'fire-bomb' },
    { type: 'prefab', prefab: 'cave-rock', at: [4, 8] },
    { type: 'prefab', prefab: 'blue-rock', at: [14, 7] },
    { type: 'prefab', prefab: 'stone', at: [29, 17] },
    { type: 'prefab', prefab: 'stone', at: [10, 17] },
  ],
  encounters: { table: 'tide-caves', backdrop: 'tide-caves' },
  shade: CAVE_SHADE,
});

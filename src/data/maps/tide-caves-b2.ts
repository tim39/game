import { defineMap } from '../../core/map/types';
import { CAVE_SHADE, lever, rafts, shallows, tideOut } from './tide';

const TIDE = tideOut('b2');

/**
 * The Tide Caves' second floor. From the way in, rafts cross a deep channel to an island while the
 * tide is in; from the island, the tide has to go out to wade the shallows to the north-east; and
 * from there, back in, to raft across to the south, where the Iron Sword and the stairs down are.
 * There's a lever on every shore, so the tide can always be turned to go back.
 */
export default defineMap({
  id: 'tide-caves-b2',
  name: 'Tide Caves B2',
  music: 'bgm.tide-caves',
  terrain: `
    ################################
    #........~~.......ss...........#
    #........~~.......ss......~~~..#
    #........~~.......ss......~~~..#
    #........~~.......ss......~~~..#
    #........~~.......ss...........#
    #........~~.......ss...........#
    #........~~.......ss...........#
    #........~~.......ss...........#
    #........~~.......ss...........#
    #........~~.......ss...........#
    #........~~~~~~~~~~~~~~~~~~~~~~#
    #........~~~~~~~~~~~~~~~~~~~~~~#
    #.~~~....~~....................#
    #.~~~....~~....................#
    #.~~~....~~....................#
    #........~~...~~~~.............#
    #........~~...~~~~.............#
    #........~~...~~~~.............#
    #........~~....................#
    #........~~....................#
    ################################
  `,
  legend: { '#': 'cave-wall', '.': 'sand', '~': 'sea', s: shallows(TIDE) },
  objects: [
    {
      type: 'prefab',
      prefab: 'cave-stairs-up',
      at: [2, 1],
      to: { map: 'tide-caves-b1', spawn: 'down' },
    },
    { type: 'spawn', id: 'stairs', at: [2, 2], facing: 'down' },
    // The way in, the island, the north-east, and their levers; rafts from the way in to the
    // island, and from the north-east to the south.
    ...lever([6, 4], TIDE, 'tide-caves/lever-b2'),
    ...rafts([9, 6], 2, TIDE),
    ...lever([14, 4], TIDE, 'tide-caves/lever-b2'),
    ...lever([23, 7], TIDE, 'tide-caves/lever-b2'),
    ...rafts([25, 11], 2, TIDE, true),
    {
      type: 'prefab',
      prefab: 'cave-stairs-down',
      at: [29, 20],
      to: { map: 'tide-caves-b3', spawn: 'stairs' },
    },
    { type: 'spawn', id: 'down', at: [29, 19], facing: 'up' },
    // Treasure: the Iron Sword in the south, and supplies on the way to it.
    { type: 'chest', at: [11, 20], flag: 'chest.tide-caves-b2-01', item: 'iron-sword' },
    { type: 'chest', at: [30, 1], flag: 'chest.tide-caves-b2-02', item: 'ether' },
    { type: 'chest', at: [1, 20], flag: 'chest.tide-caves-b2-03', item: 'antidote' },
    { type: 'prefab', prefab: 'cave-rock', at: [4, 8] },
    { type: 'prefab', prefab: 'blue-rock', at: [21, 15] },
    { type: 'prefab', prefab: 'stone', at: [12, 8] },
    { type: 'prefab', prefab: 'stone', at: [28, 7] },
  ],
  encounters: { table: 'tide-caves', backdrop: 'tide-caves' },
  shade: CAVE_SHADE,
});

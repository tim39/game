import { defineMap } from '../../core/map/types';

/**
 * Hal's forge, in Saltmere: the kiln, the anvil and the workbench, and Hal, who mends anchors and
 * hooks and sells the odd blade and vest.
 */
export default defineMap({
  id: 'saltmere-forge',
  name: "Hal's Forge",
  area: 'saltmere',
  music: 'bgm.saltmere',
  terrain: `
    ##########
    #........#
    #........#
    #........#
    #........#
    #........#
    ##########
  `,
  legend: { '#': 'cellar-wall', '.': 'stone-floor' },
  objects: [
    { type: 'prefab', prefab: 'door', at: [4, 6], to: { map: 'saltmere', spawn: 'forge' } },
    { type: 'spawn', id: 'door', at: [4, 5], facing: 'up' },
    // The kiln against the back wall, the sign hung beside it, and the anvil.
    { type: 'prefab', prefab: 'kiln', at: [1, 0], script: 'saltmere/kiln' },
    { type: 'prefab', prefab: 'sword-sign', at: [4, 0] },
    { type: 'prefab', prefab: 'anvil', at: [4, 2], script: 'saltmere/anvil' },
    { type: 'prefab', prefab: 'workbench', at: [7, 1] },
    { type: 'prefab', prefab: 'planks', at: [7, 4] },
    { type: 'prefab', prefab: 'crate', at: [8, 5] },
    { type: 'prefab', prefab: 'barrel', at: [1, 5] },
    {
      type: 'npc',
      id: 'hal',
      sprite: 'monk-2',
      at: [5, 2],
      facing: 'down',
      script: 'saltmere/hal',
    },
  ],
});

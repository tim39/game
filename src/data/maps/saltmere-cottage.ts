import { defineMap } from '../../core/map/types';

/** The fisher's cottage in Saltmere: a family's beds, a table, and the day's catch. A draft. */
export default defineMap({
  id: 'saltmere-cottage',
  name: "Fisher's Cottage",
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
  legend: { '#': 'house-wall', '.': 'wood-floor' },
  objects: [
    { type: 'prefab', prefab: 'door', at: [4, 6], to: { map: 'saltmere', spawn: 'cottage' } },
    { type: 'spawn', id: 'door', at: [4, 5], facing: 'up' },
    { type: 'prefab', prefab: 'dresser', at: [1, 0] },
    { type: 'prefab', prefab: 'bed', at: [6, 1] },
    { type: 'prefab', prefab: 'bed', at: [7, 1] },
    { type: 'prefab', prefab: 'oven', at: [3, 0] },
    { type: 'prefab', prefab: 'table', at: [2, 3] },
    { type: 'prefab', prefab: 'basket-fish', at: [1, 5] },
    { type: 'prefab', prefab: 'barrel', at: [8, 5] },
    { type: 'prefab', prefab: 'rug', at: [5, 3] },
    {
      type: 'npc',
      id: 'fishwife',
      sprite: 'woman',
      at: [6, 4],
      facing: 'left',
      wander: 1,
      script: 'saltmere/fishwife',
    },
  ],
});

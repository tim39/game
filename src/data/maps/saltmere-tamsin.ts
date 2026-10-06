import { defineMap } from '../../core/map/types';

/**
 * Tamsin's house in Saltmere, where Rowan lives: two beds, Rowan's to rest in, a table, the oven,
 * shelves, and a chest with a Potion in it. A draft.
 */
export default defineMap({
  id: 'saltmere-tamsin',
  name: "Tamsin's House",
  area: 'saltmere',
  music: 'bgm.saltmere',
  terrain: `
    ###########
    #.........#
    #.........#
    #.........#
    #.........#
    #.........#
    #.........#
    ###########
  `,
  legend: { '#': 'house-wall', '.': 'wood-floor' },
  objects: [
    { type: 'prefab', prefab: 'door', at: [5, 7], to: { map: 'saltmere', spawn: 'tamsin' } },
    { type: 'spawn', id: 'door', at: [5, 6], facing: 'up' },
    // Rowan's bed, where the party can rest, and Tamsin's; then shelves and the oven along the
    // back wall.
    { type: 'prefab', prefab: 'bed', at: [1, 1], script: 'saltmere/rowans-bed' },
    { type: 'prefab', prefab: 'bed-green', at: [3, 1] },
    { type: 'prefab', prefab: 'bookshelf', at: [5, 0] },
    { type: 'prefab', prefab: 'shelf', at: [6, 0] },
    { type: 'prefab', prefab: 'oven', at: [8, 0] },
    { type: 'prefab', prefab: 'table', at: [4, 4] },
    { type: 'prefab', prefab: 'chair', at: [3, 4] },
    { type: 'prefab', prefab: 'chair', at: [7, 4] },
    { type: 'prefab', prefab: 'plant', at: [9, 5] },
    { type: 'prefab', prefab: 'pot', at: [1, 6] },
    // At the foot of Rowan's bed.
    { type: 'chest', at: [1, 3], flag: 'chest.saltmere-tamsin-01', item: 'potion' },
    {
      type: 'npc',
      id: 'tamsin',
      sprite: 'tamsin',
      at: [8, 3],
      facing: 'down',
      script: 'saltmere/tamsin',
    },
  ],
});

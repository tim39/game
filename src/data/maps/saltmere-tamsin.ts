import { defineMap } from '../../core/map/types';
import { INDOOR_MOODS } from './moods';

/**
 * Tamsin's house in Saltmere, where Rowan lives: two beds, Rowan's to rest in, a table, the oven,
 * Tamsin's books and her shelf of lamp oil, and a chest with a Potion in it.
 */
export default defineMap({
  id: 'saltmere-tamsin',
  name: "Tamsin's House",
  area: 'saltmere',
  music: 'bgm.saltmere',
  moods: INDOOR_MOODS,
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
    // Between the beds, where a new game starts and Rowan wakes the night the Beacon goes out.
    { type: 'spawn', id: 'bed', at: [2, 2], facing: 'down' },
    // Kindling day begins: Tamsin puts Rowan on lamp duty.
    { type: 'enter', script: 'saltmere/opening', when: '!story.lamp-duty' },
    // Rowan's bed, where the party can rest, and Tamsin's; then shelves and the oven along the
    // back wall.
    { type: 'prefab', prefab: 'bed', at: [1, 1], script: 'saltmere/rowans-bed' },
    { type: 'prefab', prefab: 'bed-green', at: [3, 1], script: 'saltmere/tamsins-bed' },
    { type: 'prefab', prefab: 'bookshelf', at: [5, 0], script: 'saltmere/tamsins-books' },
    { type: 'prefab', prefab: 'shelf', at: [6, 0], script: 'saltmere/lamp-oil' },
    { type: 'prefab', prefab: 'oven', at: [8, 0], script: 'saltmere/tamsins-oven' },
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

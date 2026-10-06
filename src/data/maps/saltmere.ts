import { defineMap } from '../../core/map/types';

/**
 * Saltmere, the fishing village where the game begins (see STORY.md): the houses around the square
 * with its Kindling pyre, the lamps Rowan lights, Corin's stall, the dock, and the lighthouse out on
 * its point. Every house can be entered: Tamsin's, the fisher's cottage, Hal's forge, the inn,
 * Rhona's and Ewan's. The road north leads out to the North Road.
 */
export default defineMap({
  id: 'saltmere',
  name: 'Saltmere',
  music: 'bgm.saltmere',
  terrain: `
    TTTTTTTTTTTTTTTTTTTT..TTTTTTTTTTTTTTTTTTTTTT
    TTTTTTTTTTTTTTTTTTTT..TTTTTTTTTTTTTTTTTTTTTT
    TT..................................TTTTTTTT
    TT..................................TTTTTTTT
    TT..................................TTTTTTTT
    TT....................................TTTTTT
    TT....................................TTTTTT
    TT....................................TTTTTT
    TT..........................................
    TT........................................~~
    TT......................................~~~~
    TT.....................................~~~~~
    TT......................................~~~~
    TT........................................~~
    TT..........................................
    TT..........................................
    TT..........................................
    TT..........................................
    TT..........................................
    TT..........................................
    TT..............................~~~~........
    ...............................~~~~~~.......
    ..........................~~~~~~~~~~~.......
    ~~~~~~......~~~~~~~~~~~~~~~~~~~~~~~~~.......
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  `,
  legend: { T: 'sand-trees', '.': 'sand', '~': 'sea' },
  objects: [
    // Tamsin's house, where Rowan lives, and the fisher's cottage.
    { type: 'prefab', prefab: 'house', at: [6, 3], to: { map: 'saltmere-tamsin', spawn: 'door' } },
    { type: 'spawn', id: 'tamsin', at: [7, 6], facing: 'down' },
    {
      type: 'prefab',
      prefab: 'house-pale',
      at: [27, 3],
      to: { map: 'saltmere-cottage', spawn: 'door' },
    },
    { type: 'spawn', id: 'cottage', at: [28, 6], facing: 'down' },
    // Hal's forge, with its sign.
    { type: 'prefab', prefab: 'forge', at: [13, 3], to: { map: 'saltmere-forge', spawn: 'door' } },
    { type: 'spawn', id: 'forge', at: [14, 6], facing: 'down' },
    { type: 'prefab', prefab: 'sword-sign', at: [16, 5], script: 'saltmere/forge-sign' },
    // The inn, the Gull's Rest, and its sign.
    { type: 'prefab', prefab: 'inn', at: [31, 9], to: { map: 'saltmere-inn', spawn: 'door' } },
    { type: 'spawn', id: 'inn', at: [33, 12], facing: 'down' },
    { type: 'prefab', prefab: 'sign', at: [35, 11], script: 'saltmere/inn-sign' },
    // Rhona and Pip's house, and old Ewan's.
    {
      type: 'prefab',
      prefab: 'house-beige',
      at: [5, 13],
      to: { map: 'saltmere-rhona', spawn: 'door' },
    },
    { type: 'spawn', id: 'rhona', at: [6, 16], facing: 'down' },
    { type: 'prefab', prefab: 'house', at: [26, 14], to: { map: 'saltmere-ewan', spawn: 'door' } },
    { type: 'spawn', id: 'ewan', at: [27, 17], facing: 'down' },

    // The square, with the Kindling pyre, the lamps Rowan lights and the notice board.
    { type: 'prefab', prefab: 'pyre', at: [20, 11] },
    { type: 'prefab', prefab: 'lamp', at: [17, 9] },
    { type: 'prefab', prefab: 'lamp', at: [24, 9] },
    { type: 'prefab', prefab: 'lamp', at: [17, 14] },
    { type: 'prefab', prefab: 'lamp', at: [24, 14] },
    { type: 'prefab', prefab: 'lamp', at: [10, 5] },
    { type: 'prefab', prefab: 'lamp', at: [14, 19] },
    { type: 'prefab', prefab: 'lamp', at: [36, 13] },
    { type: 'prefab', prefab: 'notice-board', at: [26, 11], script: 'saltmere/notice-board' },

    // Corin's market stall: talk to Corin across the baskets. Barrels by the houses, and washing
    // hung out by the cottage.
    { type: 'prefab', prefab: 'basket-fish', at: [11, 9], script: 'saltmere/corin' },
    { type: 'prefab', prefab: 'basket-greens', at: [12, 9], script: 'saltmere/corin' },
    { type: 'prefab', prefab: 'basket-fruit', at: [13, 9], script: 'saltmere/corin' },
    { type: 'prefab', prefab: 'barrel', at: [11, 4] },
    { type: 'prefab', prefab: 'barrel', at: [26, 5] },
    { type: 'prefab', prefab: 'barrel', at: [9, 15] },
    { type: 'prefab', prefab: 'line-post', at: [32, 4] },
    { type: 'prefab', prefab: 'laundry', at: [33, 4] },
    { type: 'prefab', prefab: 'line-post-end', at: [35, 4] },

    // The shore: the dock, with a boat tied up beside it, fish drying, palms and a rock.
    { type: 'prefab', prefab: 'dock', at: [15, 22] },
    { type: 'prefab', prefab: 'boat', at: [19, 24] },
    { type: 'prefab', prefab: 'fish-rack', at: [6, 20] },
    { type: 'prefab', prefab: 'palm', at: [3, 19] },
    { type: 'prefab', prefab: 'palm-2', at: [10, 20] },
    { type: 'prefab', prefab: 'palm', at: [23, 19] },
    { type: 'prefab', prefab: 'rock', at: [29, 19] },

    // The lighthouse, out on its point.
    {
      type: 'prefab',
      prefab: 'lighthouse',
      at: [39, 16],
      to: { map: 'saltmere-lighthouse', spawn: 'door' },
    },
    { type: 'spawn', id: 'lighthouse', at: [40, 21], facing: 'down' },
    { type: 'prefab', prefab: 'sign', at: [37, 14], script: 'saltmere/lighthouse-sign' },

    // A signpost where the road north leaves the village.
    { type: 'prefab', prefab: 'sign', at: [22, 2], script: 'saltmere/road-sign' },
    { type: 'spawn', id: 'north-road', at: [20, 2], facing: 'down' },

    // Treasure: by the rock on the beach, in the corner by the woods, and at the beach's far end.
    { type: 'chest', at: [31, 20], flag: 'chest.saltmere-01', gold: 30 },
    { type: 'chest', at: [35, 2], flag: 'chest.saltmere-02', item: 'fire-bomb' },
    { type: 'chest', at: [1, 22], flag: 'chest.saltmere-03', item: 'ether' },

    // Villagers, busy with the Kindling. Once the Beacon is out, Hob and Pip are indoors.
    {
      type: 'npc',
      id: 'hob',
      sprite: 'old-man-3',
      at: [16, 24],
      facing: 'down',
      script: 'saltmere/hob',
      when: '!story.beacon-out',
    },
    {
      type: 'npc',
      id: 'corin',
      sprite: 'villager-3',
      at: [12, 8],
      facing: 'down',
      script: 'saltmere/corin',
    },
    {
      type: 'npc',
      id: 'pip',
      sprite: 'child',
      at: [19, 15],
      facing: 'up',
      wander: 3,
      script: 'saltmere/pip',
      when: '!story.beacon-out',
    },
    {
      type: 'npc',
      id: 'jory',
      sprite: 'villager-5',
      at: [22, 12],
      facing: 'left',
      script: 'saltmere/jory',
    },
    {
      type: 'npc',
      id: 'dai',
      sprite: 'villager-2',
      at: [8, 21],
      facing: 'left',
      script: 'saltmere/dai',
    },
  ],
  edges: { north: { map: 'north-road', spawn: 'south' } },
});

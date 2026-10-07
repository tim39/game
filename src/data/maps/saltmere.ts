import { defineMap } from '../../core/map/types';
import { GATHERED, atKindling, lamps, pyre } from './kindling';
import { DUSK_SHADE, OUTDOOR_MOODS } from './moods';

/**
 * Saltmere, the fishing village where the game begins (see STORY.md): the houses around the square
 * with its Kindling pyre, the lamps Rowan lights, Corin's stall, the dock, and the lighthouse out on
 * its point. Every house can be entered: Tamsin's, the fisher's cottage, Hal's forge, the inn,
 * Rhona's and Ewan's. The road north leads out to the North Road. Kindling day plays out here: Bram
 * walks in once the lamps are lit, the village gathers round the pyre at dusk, and that night the
 * Gloam rolls in (src/data/events/saltmere.ts).
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

    // The square, with the Kindling pyre, the lamps Rowan lights and the notice board, and where
    // the player stands as Bram arrives, and at the Kindling.
    ...pyre([20, 11], 'saltmere/pyre'),
    ...lamps(),
    { type: 'prefab', prefab: 'notice-board', at: [26, 11], script: 'saltmere/notice-board' },
    { type: 'spawn', id: 'square', at: [21, 9], facing: 'up' },
    { type: 'spawn', id: 'kindling', at: [21, 13], facing: 'up' },

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

    // Villagers, busy with the Kindling. Once the Beacon is out, Hob and Pip are indoors; and at the
    // Kindling itself, they and Dai are at the pyre (below).
    {
      type: 'npc',
      id: 'hob',
      sprite: 'old-man-3',
      at: [16, 24],
      facing: 'down',
      script: 'saltmere/hob',
      when: ['!story.beacon-out', `!${GATHERED}`],
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
      when: ['!story.beacon-out', `!${GATHERED}`],
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
      when: `!${GATHERED}`,
    },

    // Bram: walking in off the North Road once the lamps are lit, then looking at the lighthouse
    // until the Kindling, and the night the Beacon goes out, in the square, until joining the party.
    {
      type: 'npc',
      id: 'bram',
      sprite: 'bram',
      at: [21, 1],
      facing: 'down',
      when: ['story.lamps-lit', '!story.bram-arrived'],
    },
    {
      type: 'npc',
      id: 'bram-visiting',
      sprite: 'bram',
      at: [38, 15],
      facing: 'right',
      script: 'saltmere/bram',
      when: ['story.bram-arrived', '!story.kindling', `!${GATHERED}`],
    },
    {
      type: 'npc',
      id: 'bram-night',
      sprite: 'bram',
      at: [21, 7],
      facing: 'up',
      when: ['story.beacon-out', '!story.bram-joined'],
    },
    {
      type: 'auto',
      script: 'saltmere/bram-arrives',
      when: ['story.lamps-lit', '!story.bram-arrived'],
    },
    { type: 'auto', script: 'saltmere/mist', when: ['story.beacon-out', '!story.bram-joined'] },

    // The Kindling: the village round the pyre, Jory among them where he always is.
    atKindling('tamsin', 'tamsin', [19, 11], 'right'),
    atKindling('pip-kindling', 'child', [19, 12], 'right'),
    atKindling('rhona', 'princess', [18, 12], 'right'),
    atKindling('hob-kindling', 'old-man-3', [20, 10], 'down'),
    atKindling('nell', 'woman', [21, 10], 'down'),
    atKindling('gwen', 'villager-4', [22, 10], 'down'),
    atKindling('bram-kindling', 'bram', [22, 11], 'left'),
    atKindling('aled', 'monk', [20, 13], 'up'),
    atKindling('dai-kindling', 'villager-2', [23, 13], 'left'),
  ],
  edges: { north: { map: 'north-road', spawn: 'south' } },
  // Dusk falls as the village gathers for the Kindling, and night once it's over.
  moods: [{ when: GATHERED, shade: DUSK_SHADE }, ...OUTDOOR_MOODS],
});

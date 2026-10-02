import { defineMap } from '../../core/map/types';

/**
 * A map for trying out the field: shorelines, path edges, trees to walk behind, room enough (two
 * screens each way) for the camera to follow the player, a house to go into, and a path off the
 * east edge to the test meadow.
 */
export default defineMap({
  id: 'test-shore',
  name: 'Test Shore',
  terrain: `
    TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
    TT....................................TT
    TT..TTT....~~~~.......................TT
    TT........~~~~~~......................TT
    TT.,,,,,,..~~~~~.....,,,,,,,,,,,......TT
    TT.,....,...~~~......,.........,......TT
    TT.,....,....~.......,.........,......TT
    TT.,..TT,,,,,~~...,,,,.TTTTTT..,..TT..TT
    TT.,........~~~~.......TTTTTT..,......TT
    TT.,,,......~~~~.......TTTTTT..,......TT
    TT.,.........~~................,......TT
    TT.,...........................,.TTT..TT
    TT.,....TT.....................,......TT
    TT.,...........................,......TT
    TT.,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
    TT....................................TT
    TT...~~~~.................~~~.........TT
    TT..~~~~~~..............~~~~~~........TT
    TT..~~~~~~....TT........~~~~~~.....TT.TT
    TT.......................~~~~~~.......TT
    TT....TT...................~..........TT
    TT.................TT......~..........TT
    TT....................................TT
    TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
  `,
  legend: { T: 'trees', '.': 'grass', ',': 'path', '~': 'water' },
  objects: [
    { type: 'prefab', prefab: 'house', at: [17, 1], to: { map: 'test-house', spawn: 'door' } },
    { type: 'prefab', prefab: 'sign', at: [8, 3], script: 'test/sign' },
    { type: 'spawn', id: 'house', at: [18, 4], facing: 'down' },
    // Two cells in from the edge, clear of the treetops overhanging the path.
    { type: 'spawn', id: 'east', at: [37, 14], facing: 'left' },
    // People: two who stand still, three who wander.
    {
      type: 'npc',
      id: 'tamsin',
      sprite: 'tamsin',
      at: [10, 8],
      facing: 'down',
      script: 'test/tamsin',
    },
    {
      type: 'npc',
      id: 'fisher',
      sprite: 'old-man-3',
      at: [16, 9],
      facing: 'left',
      script: 'test/fisher',
    },
    { type: 'npc', id: 'stroller', sprite: 'villager-4', at: [6, 11], facing: 'down', wander: 2 },
    { type: 'npc', id: 'neighbour', sprite: 'woman', at: [22, 2], facing: 'left', wander: 2 },
    { type: 'npc', id: 'kid', sprite: 'child', at: [26, 12], facing: 'up', wander: 3 },
  ],
  edges: { east: { map: 'test-meadow', spawn: 'west' } },
});

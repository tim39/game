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
    { type: 'spawn', id: 'house', at: [18, 4], facing: 'down' },
    // Two cells in from the edge, clear of the treetops overhanging the path.
    { type: 'spawn', id: 'east', at: [37, 14], facing: 'left' },
  ],
  edges: { east: { map: 'test-meadow', spawn: 'west' } },
});

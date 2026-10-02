import { defineMap } from '../../core/map/types';

/**
 * A map for trying out the field: shorelines, path edges, trees to walk behind, and room enough
 * (two screens each way) for the camera to follow the player and stop at the edges.
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
    TT.,,,,,,,,,,,,,,,,,,,,,,,,,,,,,......TT
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
});

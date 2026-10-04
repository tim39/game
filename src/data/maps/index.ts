import { recordById } from '../../core/ids';
import type { MapDef } from '../../core/map/types';
import saltmere from './saltmere';
import saltmereCottage from './saltmere-cottage';
import saltmereLighthouse from './saltmere-lighthouse';
import saltmereLighthouseTop from './saltmere-lighthouse-top';
import saltmereTamsin from './saltmere-tamsin';
import testCellar from './test-cellar';
import testHouse from './test-house';
import testMeadow from './test-meadow';
import testShore from './test-shore';
import testSquare from './test-square';

/** Every map, by ID. Two with the same ID are an error, rather than one replacing the other. */
export const MAPS: Readonly<Record<string, MapDef>> = recordById(
  'map',
  [
    saltmere,
    saltmereTamsin,
    saltmereCottage,
    saltmereLighthouse,
    saltmereLighthouseTop,
    testShore,
    testHouse,
    testCellar,
    testMeadow,
    testSquare,
  ].map((map) => [map.id, map] as const),
);

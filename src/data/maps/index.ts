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

/** Every map, by ID. */
export const MAPS: Readonly<Record<string, MapDef>> = Object.fromEntries(
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
  ].map((map) => [map.id, map]),
);

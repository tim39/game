import { recordById } from '../../core/ids';
import type { MapDef } from '../../core/map/types';
import northRoad from './north-road';
import saltmere from './saltmere';
import saltmereCottage from './saltmere-cottage';
import saltmereEwan from './saltmere-ewan';
import saltmereForge from './saltmere-forge';
import saltmereInn from './saltmere-inn';
import saltmereLighthouse from './saltmere-lighthouse';
import saltmereLighthouseTop from './saltmere-lighthouse-top';
import saltmereRhona from './saltmere-rhona';
import saltmereTamsin from './saltmere-tamsin';
import testCellar from './test-cellar';
import tideCavesB1 from './tide-caves-b1';
import tideCavesB2 from './tide-caves-b2';
import tideCavesB3 from './tide-caves-b3';
import tideCavesBeacon from './tide-caves-beacon';
import testHouse from './test-house';
import testMarket from './test-market';
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
    saltmereForge,
    saltmereInn,
    saltmereRhona,
    saltmereEwan,
    saltmereLighthouse,
    saltmereLighthouseTop,
    northRoad,
    tideCavesB1,
    tideCavesB2,
    tideCavesB3,
    tideCavesBeacon,
    testShore,
    testHouse,
    testCellar,
    testMeadow,
    testSquare,
    testMarket,
  ].map((map) => [map.id, map] as const),
);

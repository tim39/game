import type { Speaker } from '../core/schema';

/** Who speaks in the dialogue box, by the ID event scripts' `say` names them by. */
export const SPEAKERS: Readonly<Record<string, Speaker>> = {
  tamsin: { name: 'Tamsin', portrait: 'portrait.tamsin' },
  // Saltmere's people.
  hob: { name: 'Hob', portrait: 'portrait.hob' },
  nell: { name: 'Nell', portrait: 'portrait.nell' },
  corin: { name: 'Corin', portrait: 'portrait.corin' },
  pip: { name: 'Pip', portrait: 'portrait.pip' },
  rhona: { name: 'Rhona', portrait: 'portrait.rhona' },
  gwen: { name: 'Gwen', portrait: 'portrait.gwen' },
  aled: { name: 'Aled', portrait: 'portrait.aled' },
  hal: { name: 'Hal', portrait: 'portrait.hal' },
  ewan: { name: 'Ewan', portrait: 'portrait.ewan' },
  jory: { name: 'Jory', portrait: 'portrait.jory' },
  dai: { name: 'Dai', portrait: 'portrait.dai' },
  // The Tide Caves' boss, a Hollowed knight, who still mutters what it was.
  'drowned-warden': { name: 'Drowned Warden', portrait: 'portrait.drowned-warden' },
  // Anyone else, on the test maps.
  villager: { name: 'Villager' },
  // Signs and notices: no name.
  sign: { name: '' },
};

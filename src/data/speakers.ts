import type { Speaker } from '../core/schema';

/** Who speaks in the dialogue box, by the ID event scripts' `say` names them by. */
export const SPEAKERS: Readonly<Record<string, Speaker>> = {
  tamsin: { name: 'Tamsin', portrait: 'portrait.tamsin' },
  villager: { name: 'Villager' },
  // Signs and notices: no name.
  sign: { name: '' },
};

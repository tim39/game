/** Who speaks in the dialogue box: the name in its tab, and a portrait if they have one. */
export interface Speaker {
  readonly name: string;
  /** An image key from the asset manifest. */
  readonly portrait?: string;
}

export const SPEAKERS: Readonly<Record<string, Speaker>> = {
  tamsin: { name: 'Tamsin', portrait: 'portrait.tamsin' },
  villager: { name: 'Villager' },
  // Signs and notices: no name.
  sign: { name: '' },
};

import type { EventContext } from '../../core/events';
import { REST_FADE_MS } from '../balance';

/**
 * Resting, for the scripts that put the party back on its feet (see Field in docs/DESIGN.md):
 * Rowan's bed, inns and Light Shrines. These aren't scripts themselves, so src/data/events/index.ts
 * doesn't list them.
 */

/** The jingle a night's rest ends with, and the sound a Light Shrine heals with. */
export const MORNING_JINGLE = 'sfx.rest';
export const SHRINE_SOUND = 'sfx.heal';

/**
 * A night's rest: the screen fades out, the party is healed, the morning jingle plays with the
 * music paused, and the screen fades back in.
 */
export async function rest(ev: EventContext): Promise<void> {
  await ev.fadeOut(REST_FADE_MS);
  ev.heal();
  await ev.jingle(MORNING_JINGLE);
  await ev.fadeIn(REST_FADE_MS);
}

/**
 * An inn, kept by `innkeeper`: a night for `price` gold (a price from INN_PRICES in balance.ts).
 * Staying pays and rests the party; short of the gold, the innkeeper says so. Resolves with whether
 * the party stayed.
 */
export async function inn(ev: EventContext, innkeeper: string, price: number): Promise<boolean> {
  await ev.say(innkeeper, `A room for the night is ${price} gold. Will you stay?`);
  if ((await ev.choice(['Stay the night', 'Not now'])) !== 0) {
    await ev.say(innkeeper, 'Come back any time.');
    return false;
  }
  if (ev.gold() < price) {
    await ev.say(innkeeper, "Oh dear, you're a little short.");
    return false;
  }
  ev.takeGold(price);
  await rest(ev);
  await ev.say(innkeeper, 'Good morning! Safe travels.');
  return true;
}

/** A Light Shrine: its light heals the party, at once and for nothing. */
export async function lightShrine(ev: EventContext): Promise<void> {
  ev.sfx(SHRINE_SOUND);
  ev.heal();
  await ev.say('sign', "The shrine's warm light washes over the party. Everyone is restored.");
}

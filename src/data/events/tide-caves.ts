import type { EventContext } from '../../core/events';
import { defineEvent } from '../../core/events';
import { TIDE_FADE_MS } from '../balance';
import { tideOut } from '../maps/tide';
import { lightShrine } from './rest';

// The Tide Caves, under the lighthouse: sluice levers that turn each floor's tide (see
// src/data/maps/tide.ts), its Light Shrines, and the door to the Beacon chamber.

/**
 * A lever cranking over, and the sea rushing in or out, as a lever turns the tide. Not exported:
 * everything this file exports is an event script.
 */
const LEVER_SOUND = 'sfx.lever';
const TIDE_SOUND = 'sfx.tide';

/**
 * A sluice lever, which turns the tide on its floor: it says which way the tide is, and pulled,
 * cranks over; the screen goes black while the sea rushes in or out, and comes back with the floor
 * flooded or drained.
 */
async function pullLever(ev: EventContext, tide: string): Promise<void> {
  const out = ev.flag(tide);
  await ev.say(
    'sign',
    out
      ? 'A sluice lever on a post, its light burning red. The tide is out.'
      : 'A sluice lever on a post, its light burning blue. The tide is in.',
  );
  if ((await ev.choice(['Pull it', 'Leave it'])) !== 0) return;
  ev.sfx(LEVER_SOUND);
  await ev.fadeOut(TIDE_FADE_MS.fade);
  ev.setFlag(tide, !out);
  ev.sfx(TIDE_SOUND);
  await ev.wait(TIDE_FADE_MS.hold);
  await ev.fadeIn(TIDE_FADE_MS.fade);
  await ev.say(
    'sign',
    out
      ? 'Gates groan shut deep in the rock, and the sea rushes back in.'
      : 'Gates grind open deep in the rock, and the water drains away.',
  );
}

export const leverB1 = defineEvent(async (ev) => {
  await pullLever(ev, tideOut('b1'));
});

export const leverB2 = defineEvent(async (ev) => {
  await pullLever(ev, tideOut('b2'));
});

export const leverB3 = defineEvent(async (ev) => {
  await pullLever(ev, tideOut('b3'));
});

export const shrine = defineEvent(async (ev) => {
  await lightShrine(ev);
});

export const wardenDoor = defineEvent(async (ev) => {
  await ev.say(
    'sign',
    "A heavy door, green with age and carved with the Wardens' flame. Cold seeps from under it. It won't budge.",
  );
});

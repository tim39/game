import type { EventContext } from '../../core/events';
import { defineEvent } from '../../core/events';
import { TIDE_FADE_MS } from '../balance';
import { CHAMBER_DOOR_OPEN, tideOut } from '../maps/tide';
import { lightShrine } from './rest';

// The Tide Caves, under the lighthouse: sluice levers that turn each floor's tide (see
// src/data/maps/tide.ts), its Light Shrines, the door to the Beacon chamber, and its boss, the
// Drowned Warden, who guards the dead Beacon there.

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

/** The door to the Beacon chamber, until it's pushed open; then it leads there. */
export const wardenDoor = defineEvent(async (ev) => {
  await ev.say(
    'sign',
    "A heavy door, green with age and carved with the Wardens' flame. Cold seeps from under it.",
  );
  if ((await ev.choice(['Push it open', 'Leave it'])) !== 0) return;
  ev.setFlag(CHAMBER_DOOR_OPEN);
  await ev.say(
    'sign',
    'Rowan sets a shoulder to the door. Stone grinds on stone, and it swings open.',
  );
});

/**
 * The Drowned Warden, standing across the causeway in the Beacon chamber: examined, it stirs, and
 * the fight begins. Beaten (there's no getting away from a boss), it crumbles while the screen is
 * still black from the battle, so the causeway is clear when it comes back.
 */
export const warden = defineEvent(async (ev) => {
  await ev.say(
    'sign',
    'A knight in barnacled armor stands before the dead Beacon, still as stone. Seawater runs from its visor.',
  );
  await ev.say('drowned-warden', '...Keep the flame... Feed the flame...');
  await ev.battle(['drowned-warden'], 'beacon-chamber');
  ev.setFlag('story.warden-beaten');
  await ev.say(
    'sign',
    'The Drowned Warden falls to its knees, and crumbles away into rust and seawater.',
  );
  await ev.fadeIn();
});

/** The Tide Beacon, dead, on its dais at the top of the chamber. */
export const beacon = defineEvent(async (ev) => {
  await ev.say('sign', "The Beacon's bowl is cold and dark, and full of black ash.");
});

import { defineEvent } from '../../core/events';
import { rest } from './rest';

// Saltmere on Kindling day. Draft lines, to be rewritten with the opening and when the village is
// fully populated (both M6).

export const tamsin = defineEvent(async (ev) => {
  await ev.say(
    'tamsin',
    "Kindling's tonight, Rowan, and the lamps won't light themselves. Off you go!",
  );
  const pick = await ev.choice(['On my way!', 'Five more minutes?']);
  ev.setFlag('story.lamp-duty');
  if (pick === 0) {
    await ev.say('tamsin', "That's my lamplighter. Back by dusk, mind: the Kindling won't wait.");
  } else {
    await ev.say(
      'tamsin',
      'Five more minutes and the whole village is lighting candles in the dark. Go!',
    );
  }
});

export const fishwife = defineEvent(async (ev) => {
  await ev.say(
    'villager',
    "Mind the floor, it's just been swept. The whole village is getting spotless for the Kindling.",
  );
});

export const fisher = defineEvent(async (ev) => {
  await ev.say(
    'villager',
    "Sea's flat as a plate. The Beacon always keeps it calm for the Kindling.",
  );
});

// The market stall sells supplies for the road north too (src/data/shops.ts).
export const vendor = defineEvent(async (ev) => {
  await ev.say('villager', 'Fish, greens, plums! Potions and bombs for the road, too.');
  await ev.shop('saltmere-market');
  await ev.say('villager', 'Happy Kindling!');
});

export const kid = defineEvent(async (ev) => {
  if (ev.flag('story.lamp-duty')) {
    await ev.say(
      'villager',
      "Tamsin's got you on lamp duty? Do the ones round the pyre first. They're the prettiest!",
    );
  }
  await ev.say(
    'villager',
    "Everyone gives the Beacon a memory at the Kindling. I'm giving it the taste of honey cake!",
  );
});

// Rowan's bed, in Tamsin's house: a night's rest puts the party back on their feet, as an inn's
// does, for nothing. It's home.
export const rowansBed = defineEvent(async (ev) => {
  await ev.say('sign', "Rowan's bed, still unmade. A rest would do the party good.");
  if ((await ev.choice(['Rest a while', 'Not now'])) !== 0) return;
  await rest(ev);
  await ev.say('sign', 'Rested, and ready to go again.');
});

export const lighthouseSign = defineEvent(async (ev) => {
  await ev.say('sign', 'THE LIGHTHOUSE. The Tide Beacon burns here. Keep the flame.');
});

export const roadSign = defineEvent(async (ev) => {
  await ev.say('sign', 'THE NORTH ROAD. To Wardenhold, and the rest of Aurel.');
});

export const caveStairs = defineEvent(async (ev) => {
  await ev.say(
    'sign',
    'Stairs down into the sea caves under the lighthouse. It is pitch dark down there.',
  );
});

export const beacon = defineEvent(async (ev) => {
  await ev.say('sign', 'The Tide Beacon burns, bright and steady. Its warmth fills the room.');
});

import { defineEvent } from '../../core/events';

// Saltmere on Kindling day. Draft lines, to be rewritten with the opening (M2) and when the village
// is fully populated (M6).

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

export const vendor = defineEvent(async (ev) => {
  await ev.say('villager', 'Fish, greens, plums! Get them before the Kindling crowd does.');
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

export const lighthouseSign = defineEvent(async (ev) => {
  await ev.say('sign', 'THE LIGHTHOUSE. The Tide Beacon burns here. Keep the flame.');
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

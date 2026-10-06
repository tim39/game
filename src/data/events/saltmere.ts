import type { EventContext } from '../../core/events';
import { defineEvent } from '../../core/events';
import { INN_PRICES } from '../balance';
import { inn, rest } from './rest';

// Saltmere's people, and what there is to look at, from Kindling day until Rowan comes back up
// from under the lighthouse. Everyone says something new at each turn of the story (the points in
// src/data/story.ts), and the cutscenes that move it on come with the opening (M6).

/**
 * How far the story has got, as Saltmere sees it: the morning of the Kindling, the evening after
 * it, the night the Beacon goes out (and the Tide Caves after it), and once Rowan is back up with
 * the Beacon's last spark.
 */
type Stage = 'morning' | 'evening' | 'night' | 'after';

/** The stage the story is at. It asks about the latest first, so at most four questions. */
function stageOf(ev: EventContext): Stage {
  if (ev.flag('story.tide-spark')) return 'after';
  if (ev.flag('story.beacon-out')) return 'night';
  if (ev.flag('story.kindling')) return 'evening';
  return 'morning';
}

/** Has `speaker` say the line for the stage the story is at. */
async function sayFor(
  ev: EventContext,
  speaker: string,
  lines: Readonly<Record<Stage, string>>,
): Promise<void> {
  await ev.say(speaker, lines[stageOf(ev)]);
}

// Tamsin's house: Tamsin, Rowan's bed and Tamsin's things.

export const tamsin = defineEvent(async (ev) => {
  const stage = stageOf(ev);
  if (stage === 'morning') {
    if (!ev.flag('story.lamp-duty')) {
      await ev.say(
        'tamsin',
        "Kindling's tonight, Rowan, and the lamps won't light themselves. Off you go!",
      );
      const pick = await ev.choice(['On my way!', 'Five more minutes?']);
      ev.setFlag('story.lamp-duty');
      if (pick === 0) {
        await ev.say(
          'tamsin',
          "That's my lamplighter. Back by dusk, mind: the Kindling won't wait.",
        );
      } else {
        await ev.say(
          'tamsin',
          'Five more minutes and the whole village is lighting candles in the dark. Go!',
        );
      }
    } else if (ev.flag('story.bram-arrived')) {
      await ev.say(
        'tamsin',
        'A Warden knight, all the way from Wardenhold to look at our Beacon. In my day they sent a letter.',
      );
    } else if (ev.flag('story.lamps-lit')) {
      await ev.say(
        'tamsin',
        "Every lamp lit, and not one singed eyebrow. I'll make a lamplighter of you yet.",
      );
    } else {
      await ev.say(
        'tamsin',
        'Every lamp in the village, mind, not just the ones round the square. Dusk comes quicker than you think.',
      );
    }
    return;
  }
  if (stage === 'evening') {
    await ev.say('tamsin', 'Well? What did you give the Beacon?');
    if ((await ev.choice(["I can't remember.", "That's a secret."])) === 0) {
      await ev.say(
        'tamsin',
        "Can't remember? Then it took it. That's how you know it was a good one.",
      );
    } else {
      await ev.say(
        'tamsin',
        "Keep it, then. Though come morning you won't remember it either. Nobody ever does.",
      );
    }
    return;
  }
  if (stage === 'night') {
    await ev.say(
      'tamsin',
      "Sixty years I've lived under that light, and never once seen it dark. Whatever's down there, you come back up.",
    );
    await ev.say('tamsin', 'Your bed is made, if you want a rest before you go.');
    return;
  }
  await ev.say(
    'tamsin',
    "You came back. With a light in you, too. Don't look at me like that: I've lit enough lamps to know one.",
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

export const tamsinsBed = defineEvent(async (ev) => {
  await ev.say('sign', "Tamsin's bed, made so tight a coin would bounce off it.");
});

export const tamsinsBooks = defineEvent(async (ev) => {
  await ev.say(
    'sign',
    "A primer on the four Beacons: Tide, Gale, Stone and Ember. Every creature has an element it can't abide, it says. Find it, and strike with it.",
  );
});

export const lampOil = defineEvent(async (ev) => {
  await ev.say(
    'sign',
    "Lamp oil, wicks and a tinderbox, each in its place. Tamsin's shelf is tidier than Tamsin.",
  );
});

export const tamsinsOven = defineEvent(async (ev) => {
  await sayFor(ev, 'sign', {
    morning:
      'A honey cake for the Kindling, cooling. It smells wonderful. Tamsin would know if you touched it.',
    evening:
      'The oven is cooling. There is one crumb of honey cake left, and it has your name on it.',
    night: 'The oven is cold. Nobody has had the heart to bake.',
    after: "Something is baking again. Tamsin says it's for whoever's going to Wardenhold.",
  });
});

// The fisher's cottage: Hob, who is out on the dock by day, and his daughter Nell.

export const hob = defineEvent(async (ev) => {
  await sayFor(ev, 'hob', {
    morning: "Sea's flat as a plate. The Beacon always keeps it calm for the Kindling.",
    evening:
      "Gave the Beacon the smell of tar on my first boat. Or so Nell tells me. Can't say I miss it.",
    night:
      "Nell won't let me near the dock with that mist in. Says I'll walk off the end. She's not wrong.",
    after:
      'You went down under the lighthouse and came back up? Then Nell owes me a fish. I said you would.',
  });
});

export const nell = defineEvent(async (ev) => {
  await sayFor(ev, 'nell', {
    morning:
      "Mind the floor, it's just been swept. The whole village is getting spotless for the Kindling.",
    evening:
      'Jory came over at the pyre to ask me something. Then he talked about the weather. Twice.',
    night:
      "The mist came in under the door. It's cold, but not like weather. Like a room someone's just left.",
    after: "Jory came by to see we were safe. Stayed for supper. Didn't mention the weather once.",
  });
});

// Corin's stall in the square: talk to Corin across the baskets.

export const corin = defineEvent(async (ev) => {
  const stage = stageOf(ev);
  const hello: Record<Stage, string> = {
    morning: 'Fish, greens, plums! Potions and bombs for the road, too.',
    evening: 'Still open! Folk get peckish after the Kindling. All that remembering, I expect.',
    night:
      'Going down under the lighthouse? Take bombs: wind for anything with wings, earth for anything with a shell.',
    after: 'Back in one piece! Stock up before the road. Wardenhold prices will make you weep.',
  };
  const goodbye: Record<Stage, string> = {
    morning: 'Happy Kindling!',
    evening: 'Sleep well!',
    night: 'Come back up, mind. Good customers are hard to find.',
    after: 'Safe roads!',
  };
  await ev.say('corin', hello[stage]);
  await ev.shop('saltmere-market');
  await ev.say('corin', goodbye[stage]);
});

// Out in the village.

export const pip = defineEvent(async (ev) => {
  const stage = stageOf(ev);
  if (stage === 'morning') {
    if (ev.flag('story.bram-arrived')) {
      await ev.say(
        'pip',
        "Did you see the knight? With a real axe! Mum says I'm not to ask to hold it. I'm going to ask.",
      );
      return;
    }
    if (ev.flag('story.lamp-duty') && !ev.flag('story.lamps-lit')) {
      await ev.say(
        'pip',
        "Tamsin's got you on lamp duty? Do the ones round the pyre first. They're the prettiest!",
      );
    }
    await ev.say(
      'pip',
      "Everyone gives the Beacon a memory at the Kindling. I'm giving it the taste of honey cake!",
    );
    return;
  }
  const later: Record<Exclude<Stage, 'morning'>, string> = {
    evening:
      "I gave the Beacon the taste of honey cake. Now I really want some, but I can't think why.",
    night:
      "Mum says the mist can't get in if the door's shut. I'm keeping it shut with my foot, to be sure.",
    after:
      'Is it true you fought a monster under the lighthouse? Was it big? Was it bigger than Hal?',
  };
  await ev.say('pip', later[stage]);
});

export const jory = defineEvent(async (ev) => {
  const stage = stageOf(ev);
  if (stage === 'morning' && ev.flag('story.bram-arrived')) {
    await ev.say(
      'jory',
      "That knight's axe is bigger than my whole boat. I'm going to be very polite.",
    );
    return;
  }
  await sayFor(ev, 'jory', {
    morning:
      "Stacking the pyre: every log just so, or it smokes. Nell's coming tonight. Not that I've asked her.",
    evening:
      'I asked her! Well. I asked if she thought it might rain. She said no. So that is a start.',
    night:
      "I'm keeping the pyre burning. If the Beacon can't light the way tonight, we'll give it a hand.",
    after: "Supper at Nell's last night! Didn't mention the weather once. I'm learning.",
  });
});

export const dai = defineEvent(async (ev) => {
  await sayFor(ev, 'dai', {
    morning:
      "Kindling. Bah. Folk giving memories away like they've got spares. I'll be keeping mine, thanks.",
    evening: 'I gave it the taste of bad ale, in the end. Let the Beacon chew on that.',
    night: "Don't look at me. I gave it my worst memory, not my best. Maybe it's sulking.",
    after: 'Back already? Most who go down there come back with nothing but wet boots. Huh.',
  });
});

// Rhona's house: Rhona, and Pip once the Beacon is out.

export const rhona = defineEvent(async (ev) => {
  await sayFor(ev, 'rhona', {
    morning:
      "Have you seen Pip? He was meant to be fetching water. I expect he's found something better, like the pyre.",
    evening: 'Pip says it was the best Kindling ever. He says that every year, the little goose.',
    night:
      "Thank you for looking in on us. I'll sleep easier knowing the lamplighter's keeping watch.",
    after:
      "Pip's telling everyone you fought a monster as big as the lighthouse. Please tell me it wasn't.",
  });
});

export const pipsBed = defineEvent(async (ev) => {
  await ev.say('sign', "Pip's bed. There's a wooden sword under the pillow.");
});

// The Gull's Rest, the inn: Gwen, who keeps it, and the pilgrim Aled.

export const gwen = defineEvent(async (ev) => {
  await sayFor(ev, 'gwen', {
    morning: "Welcome to the Gull's Rest! Sick of Tamsin's snoring? I won't tell her you said so.",
    evening: 'After a Kindling, folk sleep like stones. Every year. Funny, that.',
    night:
      "Nobody's sleeping tonight, mist or no mist. But a bed's a bed, and you look like you need one.",
    after:
      "You're back! I'd give you the room for nothing, but then I'd have to give everyone one.",
  });
  await inn(ev, 'gwen', INN_PRICES.saltmere);
});

export const innBed = defineEvent(async (ev) => {
  await ev.say('sign', "A guest's bed, crisp and clean. Gwen lets them by the night.");
});

export const aled = defineEvent(async (ev) => {
  await sayFor(ev, 'aled', {
    morning:
      'I walked three weeks to make my offering here. The sea gave my family everything. A memory is the least I owe it.',
    evening:
      "It's done. I gave the Beacon something precious, I'm sure of it. I'm sure it was precious.",
    night:
      "I came to give the Beacon a memory, and now it's gone dark. You don't suppose... No. No, that's foolish.",
    after:
      "I'll start for home tomorrow. I have a feeling I've forgotten something here. It'll come back to me.",
  });
});

// Hal's forge.

export const hal = defineEvent(async (ev) => {
  const stage = stageOf(ev);
  const hello: Record<Stage, string> = {
    morning:
      "Mostly I mend anchors and hooks. But a blade's a blade, and a vest's a vest. Have a look.",
    evening:
      'The Kindling always makes me want to forge something. Then I remember what time it is.',
    night:
      "Going down there? Then you want something between you and whatever's waiting. Have a look.",
    after:
      "Back in one piece! The vest held, then. Or you dodged. Either way, I'll take the credit.",
  };
  await ev.say('hal', hello[stage]);
  await ev.shop('saltmere-forge');
  await ev.say('hal', 'Mind the edge.');
});

export const kiln = defineEvent(async (ev) => {
  await ev.say('sign', 'The kiln roars. Even standing back, your eyebrows can feel it.');
});

export const anvil = defineEvent(async (ev) => {
  await ev.say('sign', "Hal's anvil, worn smooth in the middle by years of hammering.");
});

export const forgeSign = defineEvent(async (ev) => {
  await ev.say('sign', "HAL'S FORGE. Anchors, hooks and blades. Mending done while you wait.");
});

// Ewan's house: an old sailor who knows the caves under the lighthouse.

export const ewan = defineEvent(async (ev) => {
  await sayFor(ev, 'ewan', {
    morning:
      "Kindling again? Feels like we only just had one. There's caves under that lighthouse, you know. Deep ones.",
    evening:
      "I gave the Beacon a storm I sailed through at twenty. Can't recall a thing about it. Must've been a big one.",
    night:
      'The caves under the lighthouse fill and drain with the tide. If your way is under water, find a way to let it out.',
    after:
      "You've the look of someone who's been to the bottom of the sea and back. Took me a week to dry out.",
  });
});

export const ewansBooks = defineEvent(async (ev) => {
  await ev.say(
    'sign',
    "Ewan's logbooks from forty years at sea. Most entries say 'Fish.' Some say 'More fish.'",
  );
});

export const seaChart = defineEvent(async (ev) => {
  await ev.say(
    'sign',
    "An old sea chart of the coast. Someone has inked in the caves under the lighthouse, and beside them: TIDE COMES IN. DON'T.",
  );
});

// Signs and the notice board.

export const innSign = defineEvent(async (ev) => {
  await ev.say('sign', "THE GULL'S REST. Beds by the night. No gulls.");
});

export const noticeBoard = defineEvent(async (ev) => {
  await sayFor(ev, 'sign', {
    morning:
      'KINDLING TONIGHT AT DUSK, BY THE PYRE. Bring a memory for the Beacon. Small ones will do.',
    evening: 'KINDLING TONIGHT AT DUSK, BY THE PYRE. Someone has written underneath: WHAT A NIGHT!',
    night: 'A new notice, pinned over the old one: STAY INDOORS. KEEP YOUR LAMPS LIT.',
    after:
      "STAY INDOORS. KEEP YOUR LAMPS LIT. Underneath, in a child's hand: ROWAN WENT DOWN AND CAME BACK!",
  });
});

export const lighthouseSign = defineEvent(async (ev) => {
  await ev.say('sign', 'THE LIGHTHOUSE. The Tide Beacon burns here. Keep the flame.');
});

export const roadSign = defineEvent(async (ev) => {
  await ev.say('sign', 'THE NORTH ROAD. To Wardenhold, and the rest of Aurel.');
});

// The lighthouse.

export const caveStairs = defineEvent(async (ev) => {
  await ev.say(
    'sign',
    'Stairs down into the sea caves under the lighthouse. It is pitch dark down there.',
  );
});

export const beacon = defineEvent(async (ev) => {
  await sayFor(ev, 'sign', {
    morning: 'The Tide Beacon burns, bright and steady. Its warmth fills the room.',
    evening:
      'The Tide Beacon burns brighter than ever, fed by the Kindling. Its warmth fills the room.',
    night: 'The Beacon is dark, and the lamp room is cold. It smells of ash.',
    after: 'The Beacon is dark, and the lamp room is cold. It smells of ash.',
  });
});

import { defineEvent } from '../../core/events';

// The test maps' lines: enough to try talking and reading. Saltmere's real dialogue replaces them.

export const tamsin = defineEvent(async (ev) => {
  await ev.say(
    'tamsin',
    "Kindling's tonight, Rowan, and the lamps won't light themselves. Off you go!",
  );
});

export const fisher = defineEvent(async (ev) => {
  await ev.say('villager', 'Not a bite all morning. I think the fish are having the day off.');
  const pick = await ev.choice(['Try more bait?', 'Try another spot?', 'Give up for today?']);
  if (pick === 0) await ev.say('villager', 'More bait just means fatter fish ignoring me.');
  if (pick === 1) await ev.say('villager', "I've tried them all. This one's the least rude.");
  if (pick === 2) await ev.say('villager', 'Give up? And go home to my own cooking? Never.');
});

export const host = defineEvent(async (ev) => {
  await ev.say('villager', 'Come in, come in. Mind the cellar stairs.');
  await ev.say('villager', "There's nothing down there but cobwebs and a draught.");
});

export const sign = defineEvent(async (ev) => {
  await ev.say('sign', 'TEST SHORE. A house to the east, a meadow down the long path.');
});

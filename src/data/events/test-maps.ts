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
});

export const host = defineEvent(async (ev) => {
  await ev.say('villager', 'Come in, come in. Mind the cellar stairs.');
  await ev.say('villager', "There's nothing down there but cobwebs and a draught.");
});

export const sign = defineEvent(async (ev) => {
  await ev.say('sign', 'TEST SHORE. A house to the east, a meadow down the long path.');
});

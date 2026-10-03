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

/** The test meadow's music box: a script's sound effect, and its music, which plays till you leave. */
export const musicBox = defineEvent(async (ev) => {
  ev.sfx('sfx.chest');
  ev.bgm('bgm.title');
  await ev.say('sign', 'A music box. It plays the title tune until you leave the meadow.');
});

// The test square, for trying out event scripts and what sets them off.

export const square = defineEvent(async (ev) => {
  ev.setFlag('test.square-seen');
  await ev.say(
    'sign',
    'TEST SQUARE. A place for trying out event scripts. Say hello to the guide.',
  );
});

export const stone = defineEvent(async (ev) => {
  if (ev.flag('test.stone-found')) {
    await ev.say('sign', 'The loose stone wobbles again.');
    return;
  }
  ev.setFlag('test.stone-found');
  ev.giveItem('pebble');
  await ev.say('sign', 'A loose stone wobbles underfoot. You pocket a pebble from under it.');
});

export const guide = defineEvent(async (ev) => {
  if (!ev.flag('test.guide-done')) {
    await ev.say('villager', 'Watch this: I walk wherever a script tells me to.');
    await ev.move('guide', ['right', 'right', 'down']);
    await ev.face('guide', 'player');
    await ev.wait(300);
    await ev.say('villager', 'And I can send you somewhere else. Close your eyes...');
    await ev.fadeOut();
    await ev.teleport('test-square', 'corner');
    await ev.fadeIn();
    ev.setFlag('test.guide-done');
    return;
  }
  await ev.say('villager', 'Back to where you started?');
  if ((await ev.choice(['Yes, please.', 'No, thanks.'])) === 0) {
    await ev.teleport('test-square', 'start');
  }
});

export const cheer = defineEvent(async (ev) => {
  ev.setFlag('test.cheered');
  await ev.face('guide', 'player');
  await ev.say('villager', 'Ta-da! I said that all by myself, as soon as a flag was set.');
});

/** Walks the guide into the trees, which fails: the test that a blocked step stops the script. */
export const bump = defineEvent(async (ev) => {
  await ev.move('guide', ['up', 'up', 'up']);
});

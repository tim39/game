import { expect, test, type Page } from '@playwright/test';
import type { Direction } from '../../src/core/direction';
import type { GameState } from '../../src/core/state';
import type {} from '../../src/debug/api';
import { LAMPS, lampFlag } from '../../src/data/maps/kindling';
import { DUSK_SHADE, GLOAM_SHADE, NIGHT_SHADE } from '../../src/data/maps/moods';
import { NEW_GAME } from '../../src/data/new-game';
import { STORY } from '../../src/data/story';
import type { AudioInfo } from '../../src/systems/audio';

// Kindling day, the first day of the game (see STORY.md), as it plays from the title screen: the
// opening, the lamps, Bram arriving, the Kindling at dusk, and the night the Beacon goes out, when
// Bram joins the fight in the mist. The day ends under the lighthouse, in boss.spec.

// Cutscenes, and a battle, take a while to play out.
test.describe.configure({ timeout: 90_000 });

interface BattleInfo {
  backdrop: string;
  shade: number | null;
  outcome: string;
  choosing: boolean;
  waiting: boolean;
  fighters: { id: string; side: string }[];
}

interface NpcInfo {
  id: string;
  x: number;
  y: number;
}

/** Lets the game run a couple of frames, so whatever input just changed has been read. */
const nextFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

const field = (page: Page) => page.evaluate(() => window.__game?.inspect('field'));
const dialogue = (page: Page) => page.evaluate(() => window.__game?.inspect('dialogue'));
const battle = async (page: Page): Promise<BattleInfo> =>
  (await page.evaluate(() => window.__game?.inspect('battle'))) as unknown as BattleInfo;
const audio = async (page: Page): Promise<AudioInfo> =>
  (await page.evaluate(() => window.__game?.audio())) as AudioInfo;
const state = async (page: Page): Promise<GameState> =>
  (await page.evaluate(() => window.__game?.state())) as GameState;
/** Who's about on the map, and where. */
const npcs = async (page: Page): Promise<NpcInfo[]> => (await field(page))?.npcs as NpcInfo[];
const people = async (page: Page): Promise<string[]> => (await npcs(page)).map(({ id }) => id);
const at = async (page: Page, id: string): Promise<[number, number] | undefined> => {
  const npc = (await npcs(page)).find((other) => other.id === id);
  return npc && [npc.x, npc.y];
};

async function press(page: Page, ...keys: string[]): Promise<void> {
  for (const key of keys) {
    await page.keyboard.press(key);
    await nextFrames(page);
  }
}

/** Collects console errors and page errors, to check none happened. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function toTitle(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
}

/** Waits until the player is standing on `map`, with the fade in over. */
async function arrivedOn(page: Page, map: string): Promise<void> {
  await page.waitForFunction((id) => {
    const info = window.__game?.inspect('field');
    return info?.map === id && info.fading === false && info.moving === false;
  }, map);
}

/**
 * Starts on `map` at (x, y), facing `facing`, with the story as far as `story` (a story point's
 * flag, and every one before it), no random battles, and battles at 4×.
 */
async function startOn(
  page: Page,
  [map, x, y, facing]: readonly [string, number, number, Direction],
  story?: string,
): Promise<void> {
  await toTitle(page);
  const reached = STORY.findIndex(({ flag }) => flag === story);
  const flags = STORY.slice(0, reached + 1).map(({ flag }) => flag);
  await page.evaluate((flags) => {
    for (const flag of flags) window.__game?.setFlag(flag);
    window.__game?.encounters({ rate: 'off', seed: 1 });
    window.__game?.battleSpeed(4);
  }, flags);
  await page.evaluate((start) => window.__game?.warp(...start), [map, x, y, facing] as const);
  await arrivedOn(page, map);
}

/** Steps one cell (or turns, if the way is blocked) and waits for the step to end. */
async function step(page: Page, key: string, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
    await nextFrames(page);
    await page.waitForFunction(() => window.__game?.inspect('field')?.moving === false);
  }
}

/** Waits for the dialogue box to show `text` in full. */
async function untilSaid(page: Page, text: string): Promise<void> {
  await page.waitForFunction((line) => {
    const info = window.__game?.inspect('dialogue');
    return info?.text === line && info.prompt === true;
  }, text);
}

/** Reads each line in turn, Confirm going on from each once it's shown in full. */
async function readLines(page: Page, ...lines: string[]): Promise<void> {
  for (const line of lines) {
    await untilSaid(page, line);
    await press(page, 'KeyZ');
  }
}

/** Confirm goes on from the line to its choices; this picks the one at `index` (0 is the first). */
async function pick(page: Page, index: number): Promise<void> {
  await press(page, 'KeyZ');
  await page.waitForFunction(
    () => ((window.__game?.inspect('dialogue')?.choices as string[] | undefined)?.length ?? 0) > 0,
  );
  for (let move = 0; move < index; move++) await press(page, 'ArrowDown');
  await press(page, 'KeyZ');
}

/** Reads the last line, and waits for the field to carry on. */
async function closeOn(page: Page, text: string): Promise<void> {
  await untilSaid(page, text);
  await press(page, 'KeyZ');
  await page.waitForFunction(() => window.__game?.inspect('field')?.running === false);
}

/** Waits until the field is back: no script running, and the screen faded back in. */
async function fieldBack(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const info = window.__game?.inspect('field');
    return info?.running === false && info.dark === false && info.fading === false;
  });
}

/** Waits until the battle waits for the player: to choose, or to see how it ended. */
async function waitForPlayer(page: Page): Promise<BattleInfo> {
  await page.waitForFunction(
    () => {
      const info = window.__game?.inspect('battle');
      return info?.choosing === true || info?.waiting === true;
    },
    undefined,
    { timeout: 60_000 },
  );
  return battle(page);
}

/** Attacks the first enemy every turn until the battle is over. */
async function attackUntilOver(page: Page): Promise<BattleInfo> {
  for (let turn = 0; turn < 100; turn++) {
    const info = await waitForPlayer(page);
    if (info.waiting) return info;
    await press(page, 'KeyZ', 'KeyZ');
  }
  throw new Error('The battle went on too long');
}

/** Turns the victory panel's pages until the battle has gone. */
async function throughVictory(page: Page): Promise<void> {
  for (let shown = 0; shown < 12; shown++) {
    if (!(await page.evaluate(() => window.__game?.activeScenes().includes('battle')))) return;
    await press(page, 'KeyZ');
  }
  throw new Error('The victory panel went on too long');
}

test('New Game opens on the morning of the Kindling, and Tamsin puts Rowan on lamp duty', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await toTitle(page);
  await page.keyboard.press('Enter');

  // The intro, a picture at a time, over black, to the title's music.
  const intro = [
    [
      'beacons',
      'Aurel lives in the light of four great Beacons: Tide, Gale, Stone and Ember, kept burning by the Order of Wardens.',
    ],
    [
      'gloam',
      'Beyond their glow lies the Gloam, a grey mist that eats memory. Those lost in it forget who they are, and become the Hollowed.',
    ],
    [
      'kindling',
      'Once a year, at the Kindling, every town gives its Beacon a small memory in thanks: a song, a smell, a favorite day.',
    ],
  ] as const;
  for (const [picture, line] of intro) {
    await untilSaid(page, line);
    expect(await field(page)).toMatchObject({
      map: 'saltmere-tamsin',
      dark: true,
      running: true,
      picture,
    });
    expect(await page.evaluate(() => window.__game?.inspect('picture')?.alpha)).toBe(1);
    expect((await audio(page)).music).toBe('bgm.title');
    await page.screenshot({ path: `test-results/screenshots/kindling-day-intro-${picture}.png` });
    await press(page, 'KeyZ');
  }

  // Then, the picture gone, where and when, as Saltmere's music comes in.
  await untilSaid(
    page,
    'Saltmere: a fishing village on the coast of Aurel, under the light of the Tide Beacon.',
  );
  expect(await field(page)).toMatchObject({ dark: true, running: true, picture: null });
  expect((await audio(page)).music).toBe('bgm.saltmere');
  await page.screenshot({ path: 'test-results/screenshots/kindling-day-opening.png' });
  await press(page, 'KeyZ');
  await untilSaid(page, 'It is the morning of the Kindling.');
  await press(page, 'KeyZ');

  // The screen comes up on Rowan, up by the bed, and Tamsin comes over.
  await untilSaid(
    page,
    "Up already? Good. Kindling's tonight, Rowan, and the lamps won't light themselves.",
  );
  const { x, y } = NEW_GAME.location;
  expect(await field(page)).toMatchObject({ dark: false, x, y, facing: 'down' });
  expect(await at(page, 'tamsin')).toEqual([x, y + 1]);
  expect(await dialogue(page)).toMatchObject({ name: 'Tamsin', portrait: 'portrait.tamsin' });
  await page.screenshot({ path: 'test-results/screenshots/kindling-day-tamsin.png' });

  // Five more minutes? Not today.
  await pick(page, 1);
  await untilSaid(
    page,
    'Five more minutes and the whole village is lighting candles in the dark. Up!',
  );
  expect((await state(page)).flags).toEqual({ 'story.lamp-duty': true });
  await press(page, 'KeyZ');
  await untilSaid(
    page,
    'Seven lamps: four round the pyre in the square, one by our door, one by the dock and one on the lighthouse path.',
  );
  await press(page, 'KeyZ');
  await closeOn(page, "Back by dusk, mind. The Kindling won't wait.");

  // Then the banner names the place, and Saltmere's music plays.
  expect(await field(page)).toMatchObject({ banner: 'Saltmere', dark: false });
  expect((await audio(page)).music).toBe('bgm.saltmere');

  // Tamsin has stepped aside, out of the only way from between the beds, and Rowan can go out:
  // down past the table, and out of the door.
  expect(await at(page, 'tamsin')).toEqual([x + 1, y + 1]);
  await page.screenshot({ path: 'test-results/screenshots/kindling-day-way-out.png' });
  await step(page, 'ArrowDown', 3);
  await step(page, 'ArrowRight', 3);
  await step(page, 'ArrowDown', 2);
  await arrivedOn(page, 'saltmere');
  expect(errors).toEqual([]);
});

test('the seven lamps, lit one by one, and then Bram walks in off the North Road', async ({
  page,
}) => {
  const errors = watchErrors(page);
  // The first lamp, from below its post. Before Tamsin says so, it's only a lamp.
  const [first] = LAMPS;
  if (!first) throw new Error('No lamps');
  await startOn(page, ['saltmere', first[0], first[1] + 2, 'up']);
  await press(page, 'KeyZ');
  await closeOn(page, 'A lamp on its post, trimmed and ready for dusk.');
  await page.screenshot({ path: 'test-results/screenshots/kindling-day-lamp-unlit.png' });
  expect((await state(page)).flags).toEqual({});

  // On lamp duty, every lamp in turn, counting down to the last.
  await page.evaluate(() => window.__game?.setFlag('story.lamp-duty'));
  const left = ['Six', 'Five', 'Four', 'Three', 'Two', 'One'];
  for (const [index, [lampX, lampY]] of LAMPS.entries()) {
    await page.evaluate(([x, y]) => window.__game?.warp('saltmere', x, y, 'up'), [
      lampX,
      lampY + 2,
    ] as const);
    await arrivedOn(page, 'saltmere');
    await press(page, 'KeyZ');
    const remaining = left[index];
    if (remaining) {
      await closeOn(page, `The wick catches, and the lamp glows warm. ${remaining} more to light.`);
    } else {
      await untilSaid(
        page,
        "The wick catches. That's every lamp in Saltmere lit, and the sun not yet down!",
      );
    }
    expect((await audio(page)).sounds).toContain('sfx.fire');
    expect((await state(page)).flags).toHaveProperty([lampFlag(index + 1)], true);
    if (index === 0) {
      await page.screenshot({ path: 'test-results/screenshots/kindling-day-lamp-lit.png' });
    }
  }
  expect((await state(page)).flags).toHaveProperty(['story.lamps-lit'], true);

  // With the last lit, someone comes down the North Road, into the square.
  await press(page, 'KeyZ');
  await readLines(page, 'Footsteps on the North Road: someone is coming down into the village.');
  await untilSaid(page, "Well met. That's a fine bit of lamplighting. Would you be Tamsin?");
  expect(await dialogue(page)).toMatchObject({ name: 'Bram', portrait: 'portrait.bram' });
  expect(await field(page)).toMatchObject({ map: 'saltmere', x: 21, y: 9, facing: 'up' });
  expect(await at(page, 'bram')).toEqual([21, 8]);
  await page.screenshot({ path: 'test-results/screenshots/kindling-day-bram.png' });
  await pick(page, 1);
  await readLines(
    page,
    'Ha! Not a day over fifty. I am Bram, a knight of the Order of Wardens, out of Wardenhold.',
    'The Order sends one of us to look in on each Beacon before the Kindling. This year, the Tide Beacon drew me.',
    "That's its lighthouse, out on the point? I'll pay the Beacon my respects, and see you at the Kindling.",
  );

  // Off Bram goes, east towards the lighthouse, out of sight, and gone from the square.
  await page.waitForFunction(() => window.__game?.inspect('field')?.running === false);
  expect(await people(page)).not.toContain('bram');
  expect((await state(page)).flags).toHaveProperty(['story.bram-arrived'], true);

  // Bram looks out at the lighthouse until the Kindling.
  await page.evaluate(() => window.__game?.warp('saltmere', 39, 15, 'left'));
  await arrivedOn(page, 'saltmere');
  expect(await at(page, 'bram-visiting')).toEqual([38, 15]);
  await press(page, 'KeyZ');
  await closeOn(
    page,
    "Your Beacon burns as steady as any I've inspected. I'll stay for the Kindling, if Saltmere will have me.",
  );
  expect(errors).toEqual([]);
});

test('the Kindling: Saltmere gathers round the pyre at dusk, and Rowan gives the flame a memory', async ({
  page,
}) => {
  const errors = watchErrors(page);
  // With every lamp lit and Bram arrived: as the story has it, the lamps all burn, whether or not
  // they were lit one by one.
  const [lamp] = LAMPS;
  if (!lamp) throw new Error('No lamps');
  await startOn(page, ['saltmere', lamp[0], lamp[1] + 2, 'up'], 'story.bram-arrived');
  await press(page, 'KeyZ');
  await closeOn(page, 'The lamp burns warm and bright, though the sun is still up.');

  // Below the pyre.
  await page.evaluate(() => window.__game?.warp('saltmere', 20, 13, 'up'));
  await arrivedOn(page, 'saltmere');
  expect(await people(page)).toEqual(['hob', 'corin', 'pip', 'jory', 'dai', 'bram-visiting']);
  await press(page, 'KeyZ');
  await untilSaid(page, 'The Kindling pyre, stacked and ready, and the sun is going down.');
  await pick(page, 0);
  await readLines(page, 'The sun goes down over the sea, and all Saltmere gathers round the pyre.');

  // At dusk, with the village round the pyre: Tamsin lights it.
  await untilSaid(
    page,
    "Sixty Kindlings I've seen, and the Tide Beacon has kept our sea calm and our nights bright through every one.",
  );
  expect(await field(page)).toMatchObject({ x: 21, y: 13, facing: 'up', shade: DUSK_SHADE });
  expect(await people(page)).toEqual([
    'corin',
    'jory',
    'tamsin',
    'pip-kindling',
    'rhona',
    'hob-kindling',
    'nell',
    'gwen',
    'bram-kindling',
    'aled',
    'dai-kindling',
  ]);
  await readLines(
    page,
    "Sixty Kindlings I've seen, and the Tide Beacon has kept our sea calm and our nights bright through every one.",
    'Tonight we give a little back: a memory each, into the flame. Small ones will do. The Beacon is not greedy.',
  );

  // A memory each, into the flame.
  await untilSaid(page, 'The smell of tar on my first boat.');
  expect((await state(page)).flags).toHaveProperty(['story.kindling'], true);
  expect((await audio(page)).sounds).toContain('sfx.fire');
  await readLines(
    page,
    'The smell of tar on my first boat.',
    'The taste of honey cake!',
    'I walked three weeks to give you this. Keep the sea kind.',
    'The taste of bad ale. Chew on that.',
    "Wardens don't often get to give. An old marching song, then. It's had a good run.",
  );
  await untilSaid(page, 'Your turn, Rowan. Hold it in your mind, and give it to the flame.');
  await page.screenshot({ path: 'test-results/screenshots/kindling-day-kindling.png' });

  // Tamsin's honey cake.
  await pick(page, 2);
  await untilSaid(
    page,
    'Rowan holds the memory up to the flame. The fire leaps up white, bright as day, and settles.',
  );
  expect((await state(page)).vars).toEqual({ 'saltmere.rowans-memory': 3 });
  await readLines(
    page,
    'Rowan holds the memory up to the flame. The fire leaps up white, bright as day, and settles.',
    'Rowan reaches back for it, to keep a little... and finds nothing there at all.',
    "Gone? Good. That's how you know the Beacon took it.",
    "Now: there's fish on the fire and a fiddle by the inn. Happy Kindling, everyone!",
    'The Kindling goes on late into the night.',
  );

  // Night, by the pyre still burning, with everyone gone home.
  await fieldBack(page);
  expect(await field(page)).toMatchObject({ x: 21, y: 13, shade: NIGHT_SHADE });
  expect(await people(page)).toEqual(['hob', 'corin', 'pip', 'jory', 'dai']);
  expect((await state(page)).flags).toHaveProperty(['story.kindling'], true);
  expect((await state(page)).flags).not.toHaveProperty(['saltmere.kindling-gathered']);
  await page.screenshot({ path: 'test-results/screenshots/kindling-day-night.png' });
  expect(errors).toEqual([]);
});

test('the night the Beacon goes out: Tamsin wakes Rowan, and Bram joins the fight in the mist', async ({
  page,
}) => {
  const errors = watchErrors(page);
  // Beside Rowan's bed, the evening after the Kindling.
  await startOn(page, ['saltmere-tamsin', 2, 2, 'left'], 'story.kindling');
  await press(page, 'KeyZ');
  await untilSaid(page, "Rowan's bed. After a day like this, it looks very inviting.");
  await pick(page, 0);
  await untilSaid(page, 'Rowan sleeps, and dreams of nothing at all.');
  expect(await field(page)).toMatchObject({ dark: true });
  await press(page, 'KeyZ');
  await untilSaid(
    page,
    'Deep in the night, Rowan wakes to a cold that was never there before. The window is black. The Beacon is out.',
  );
  expect((await state(page)).flags).toHaveProperty(['story.beacon-out'], true);
  await press(page, 'KeyZ');

  // Tamsin, at Rowan's bedside.
  await untilSaid(
    page,
    "Rowan! The Beacon's gone dark, and there's a mist coming in off the sea like nothing I've ever seen.",
  );
  expect(await field(page)).toMatchObject({ x: 2, y: 2, dark: false });
  expect(await at(page, 'tamsin')).toEqual([2, 3]);
  await press(page, 'KeyZ');
  await untilSaid(page, 'Listen... Is that shouting, in the square?');
  await pick(page, 1);
  await readLines(page, "Where would I go? Go on, and take care. I'll keep the lamp lit.");

  // Out of doors, the Gloam: violet-grey, misty, and to music of its own.
  await untilSaid(
    page,
    'Mist fills the village, thick and cold, and the lamps are small and dim in it. From the square comes the ring of steel.',
  );
  expect(await field(page)).toMatchObject({
    map: 'saltmere',
    x: 7,
    y: 6,
    shade: GLOAM_SHADE,
    mist: true,
  });
  expect((await audio(page)).music).toBe('bgm.gloam');
  await page.screenshot({ path: 'test-results/screenshots/kindling-day-mist.png' });
  await press(page, 'KeyZ');

  // Bram, in the square.
  await untilSaid(page, 'Lamplighter! Over here, and keep your head down!');
  expect(await field(page)).toMatchObject({ x: 21, y: 9 });
  expect(await at(page, 'bram-night')).toEqual([21, 7]);
  await press(page, 'KeyZ');
  await untilSaid(
    page,
    'Things came out of the mist when the Beacon died. Shapes, cold as the deep sea. They will be back.',
  );
  expect(await field(page)).toMatchObject({ x: 21, y: 8 });
  await readLines(
    page,
    'Things came out of the mist when the Beacon died. Shapes, cold as the deep sea. They will be back.',
    'Bram hands Rowan a Fire Bomb.',
    "Fire's the bane of anything that comes out of the mist. Hit them where it hurts, and they stagger.",
    'And watch the line along the top: it shows who moves next. My Shield Bash knocks them back down it.',
  );
  await untilSaid(page, 'Bram joins the party!');
  expect(await state(page)).toMatchObject({
    party: ['rowan', 'bram'],
    inventory: { 'fire-bomb': 1 },
  });
  // Far stronger than they need to be, so the fight is a quick one.
  await page.evaluate(() => window.__game?.setLevel(30));
  await readLines(page, 'Bram joins the party!', 'Here they come!');

  // Two Drowned Wisps, fought on the shore in the Gloam.
  const fight = await waitForPlayer(page);
  expect(fight).toMatchObject({ backdrop: 'shore', shade: GLOAM_SHADE, outcome: 'ongoing' });
  expect(fight.fighters.map(({ id }) => id).sort()).toEqual([
    'bram',
    'drowned-wisp-a',
    'drowned-wisp-b',
    'rowan',
  ]);
  await page.screenshot({ path: 'test-results/screenshots/kindling-day-battle.png' });
  expect(await attackUntilOver(page)).toMatchObject({ outcome: 'victory' });
  await throughVictory(page);

  // Won, with the screen still black: Bram says what they were.
  await untilSaid(
    page,
    'Those were people, once, the Order says. The Hollowed: lost in the Gloam, until nothing was left but cold.',
  );
  expect(await field(page)).toMatchObject({ dark: true, running: true });
  await readLines(
    page,
    'Those were people, once, the Order says. The Hollowed: lost in the Gloam, until nothing was left but cold.',
    "The Beacon's dark, and they came with the mist. Whatever's wrong, it's in that lighthouse.",
    'You know the way, lamplighter. Lead on.',
  );

  // Bram is in the party now, not in the square.
  await fieldBack(page);
  expect(await field(page)).toMatchObject({ map: 'saltmere', x: 21, y: 9, shade: GLOAM_SHADE });
  expect(await people(page)).not.toContain('bram-night');
  expect((await state(page)).flags).toHaveProperty(['story.bram-joined'], true);
  await page.screenshot({ path: 'test-results/screenshots/kindling-day-gloam.png' });
  expect(errors).toEqual([]);
});

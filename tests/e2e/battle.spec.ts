import { expect, test, type Page } from '@playwright/test';
import type {} from '../../src/debug/api';
import type { DebugBattleOptions } from '../../src/debug/api';
import { ITEMS } from '../../src/data/items';

// Battles take a while to play out, even at 4×, more so with other tests running beside them.
test.describe.configure({ timeout: 60_000 });

interface FighterInfo {
  id: string;
  side: 'party' | 'enemies';
  name: string;
  hp: number;
  maxHp: number;
  statuses: string[];
  telegraph: { skill: string; target?: string } | null;
  x: number;
  y: number;
  home: { x: number; y: number };
  visible: boolean;
}

interface BattleInfo {
  backdrop: string;
  outcome: string;
  result: string | null;
  active: string | null;
  choosing: boolean;
  waiting: boolean;
  page: string | null;
  selected: string | null;
  commands: { label: string; enabled: boolean }[];
  list: { label: string; detail: string; enabled: boolean }[];
  aimed: string[];
  banner: string | null;
  timeline: { id: string; telegraph: boolean; changed: boolean }[];
  victory: string[];
  status: string[];
  popped: string[];
  fighters: FighterInfo[];
}

/** Lets the game run a couple of frames, so whatever input just changed has been read. */
const nextFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

const info = async (page: Page): Promise<BattleInfo> =>
  (await page.evaluate(() => window.__game?.inspect('battle'))) as unknown as BattleInfo;

/** Whose turns the timeline shows: whose it is now, then the next ten. */
const turns = (battle: BattleInfo): string[] => battle.timeline.map(({ id }) => id);

/** Where a fighter's next turn is on the timeline, after this one. */
const nextTurn = (battle: BattleInfo, id: string): number => turns(battle).indexOf(id, 1);

/** The turns the timeline highlights, as the preview changed them. */
const changed = (battle: BattleInfo): number[] =>
  battle.timeline.flatMap((slot, index) => (slot.changed ? [index] : []));

const fighter = (battle: BattleInfo, id: string): FighterInfo => {
  const found = battle.fighters.find((each) => each.id === id);
  if (!found) throw new Error(`${id} isn't in the battle`);
  return found;
};

async function press(page: Page, ...keys: string[]): Promise<void> {
  for (const key of keys) {
    await page.keyboard.press(key);
    await nextFrames(page);
  }
}

/** Waits until the menu is waiting for the player, or the battle for Confirm, once it's over. */
async function waitForPlayer(page: Page): Promise<BattleInfo> {
  await page.waitForFunction(
    () => {
      const battle = window.__game?.inspect('battle');
      return battle?.choosing === true || battle?.waiting === true;
    },
    undefined,
    { timeout: 30_000 },
  );
  return info(page);
}

/**
 * Starts a battle from the title screen, with Bram in the party beside Rowan and the party
 * carrying `items`, and waits for the first choice. It plays out at the debug menu's 4× speed, so
 * the tests aren't kept waiting. Collects any console errors.
 */
async function startBattle(
  page: Page,
  enemies: string[],
  options: DebugBattleOptions & { items?: Record<string, number> } = {},
): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
  const { items = {}, ...battle } = options;
  await page.evaluate(
    ([items, enemies, battle]) => {
      window.__game?.battleSpeed(4);
      window.__game?.join('bram');
      for (const [item, count] of Object.entries(items)) window.__game?.give(item, count);
      window.__game?.battle(enemies, battle);
    },
    [items, enemies, { seed: 1, ...battle }] as const,
  );
  await waitForPlayer(page);
  return errors;
}

/**
 * Attacks the first enemy standing every turn, until the battle waits for Confirm at its end, or
 * `until` says to stop, on a turn of the party's.
 */
async function attackUntilOver(page: Page, until?: (battle: BattleInfo) => boolean) {
  for (let turn = 0; turn < 60; turn++) {
    const battle = await waitForPlayer(page);
    if (battle.waiting || until?.(battle)) return battle;
    await press(page, 'KeyZ', 'KeyZ');
  }
  throw new Error('The battle went on too long');
}

test('a battle has the enemies on the left, the party on the right, and the command menu', async ({
  page,
}) => {
  const errors = await startBattle(page, ['wolf', 'wolf']);
  const battle = await info(page);
  expect(battle).toMatchObject({
    backdrop: 'meadow',
    outcome: 'ongoing',
    active: 'rowan',
    page: 'commands',
    selected: 'Attack',
    banner: null,
  });
  // Rowan knows no skills yet, and the party has no items.
  expect(battle.commands).toEqual([
    { label: 'Attack', enabled: true },
    { label: 'Skill', enabled: false },
    { label: 'Item', enabled: false },
    { label: 'Guard', enabled: true },
    { label: 'Flee', enabled: true },
  ]);
  expect(battle.status).toEqual(['Rowan HP 60/60 MP 12', 'Bram HP 85/85 MP 6']);
  const [rowan, bram, wolfA, wolfB] = battle.fighters;
  expect(battle.fighters.map(({ name }) => name)).toEqual(['Rowan', 'Bram', 'Wolf A', 'Wolf B']);
  for (const enemy of [wolfA, wolfB]) expect(enemy?.x).toBeLessThan(160);
  for (const member of [rowan, bram]) expect(member?.x).toBeGreaterThan(200);
  // Whoever's turn it is steps forward.
  expect(rowan?.x).toBeLessThan(rowan?.home.x ?? 0);
  expect(bram?.x).toBe(bram?.home.x);
  // The timeline: Rowan's turn, then the next ten, everyone's. Attack changes nothing in it.
  expect(battle.timeline).toHaveLength(11);
  expect(turns(battle)[0]).toBe('rowan');
  expect(new Set(turns(battle))).toEqual(new Set(['rowan', 'bram', 'wolf-a', 'wolf-b']));
  expect(changed(battle)).toEqual([]);
  await page.screenshot({ path: 'test-results/screenshots/battle-commands.png' });
  expect(errors).toEqual([]);
});

test('Attack aims at an enemy, Cancel goes back, and the hit lands', async ({ page }) => {
  const errors = await startBattle(page, ['wolf', 'wolf']);
  await press(page, 'KeyZ');
  expect(await info(page)).toMatchObject({ page: 'target', aimed: ['wolf-a'], banner: 'Wolf A' });
  await press(page, 'ArrowRight');
  expect(await info(page)).toMatchObject({ aimed: ['wolf-b'], banner: 'Wolf B' });
  await page.screenshot({ path: 'test-results/screenshots/battle-target.png' });

  await press(page, 'KeyX');
  expect(await info(page)).toMatchObject({ page: 'commands', selected: 'Attack', aimed: [] });
  await press(page, 'KeyZ', 'ArrowRight', 'KeyZ');
  // The menu closes as the attack plays out.
  expect(await info(page)).toMatchObject({ choosing: false, page: null });
  const after = await waitForPlayer(page);
  const wolfB = fighter(after, 'wolf-b');
  expect(wolfB.hp).toBeLessThan(wolfB.maxHp);
  // The first thing to pop up is the damage, over Wolf B.
  expect(after.popped[0]).toBe(String(wolfB.maxHp - wolfB.hp));
  expect(fighter(after, 'wolf-a').hp).toBe(30);
  expect(errors).toEqual([]);
});

test('items say what they do, and a Fire Bomb hits a wolf where it’s weak', async ({ page }) => {
  const errors = await startBattle(page, ['wolf', 'wolf'], {
    items: { potion: 2, 'fire-bomb': 1 },
  });
  await press(page, 'ArrowDown', 'ArrowDown', 'KeyZ');
  const items = await info(page);
  expect(items).toMatchObject({ page: 'items', selected: 'Potion' });
  expect(items.list).toEqual([
    { label: 'Potion', detail: '2', enabled: true },
    { label: 'Fire Bomb', detail: '1', enabled: true },
  ]);
  expect(items.banner).toBe(ITEMS.potion?.description);
  await press(page, 'ArrowRight');
  expect(await info(page)).toMatchObject({
    selected: 'Fire Bomb',
    banner: ITEMS['fire-bomb']?.description,
  });
  await page.screenshot({ path: 'test-results/screenshots/battle-items.png' });

  await press(page, 'KeyZ', 'KeyZ');
  const after = await waitForPlayer(page);
  // 40 damage, half again for a weakness: more than a wolf has.
  expect(after.popped.slice(0, 2)).toEqual(['Weak', '60']);
  expect(fighter(after, 'wolf-a')).toMatchObject({ hp: 0, visible: false });
  expect(errors).toEqual([]);
});

test('a battle won says so, and Confirm goes through the victory panel back to the field', async ({
  page,
}) => {
  const errors = await startBattle(page, ['wolf', 'wolf']);
  const won = await attackUntilOver(page);
  expect(won).toMatchObject({ outcome: 'victory', result: 'victory', banner: 'Victory!' });
  expect(won.fighters.filter(({ side, hp }) => side === 'enemies' && hp > 0)).toEqual([]);
  // There are no more turns to come.
  expect(won.timeline).toEqual([]);
  expect(won.victory[0]).toBe('Gained 12 EXP.');
  await page.screenshot({ path: 'test-results/screenshots/battle-victory.png' });

  // The rewards, then Rowan's level-up and Bram's.
  for (let shown = 0; shown < 3; shown++) {
    expect((await waitForPlayer(page)).waiting).toBe(true);
    await press(page, 'KeyZ');
  }
  await page.waitForFunction(() => window.__game?.activeScenes().join() === 'field');
  expect(await page.evaluate(() => window.__game?.inspect('battle'))).toEqual({});
  expect(errors).toEqual([]);
});

test('the party can flee, and the battle ends on its own', async ({ page }) => {
  // With this seed, the first try gets away.
  const errors = await startBattle(page, ['cave-bat', 'cave-bat', 'cave-bat'], {
    backdrop: 'shore',
  });
  await press(page, 'ArrowUp', 'ArrowRight');
  expect((await info(page)).selected).toBe('Flee');
  await press(page, 'KeyZ');
  await page.waitForFunction(
    () => window.__game?.inspect('battle')?.banner === 'The party got away!',
  );
  await page.screenshot({ path: 'test-results/screenshots/battle-flee.png' });
  await page.waitForFunction(() => window.__game?.activeScenes().join() === 'field');
  expect(errors).toEqual([]);
});

test('the boss can’t be fled from, telegraphs Undertow, and a fallen ally can be revived', async ({
  page,
}) => {
  const errors = await startBattle(page, ['drowned-warden'], {
    backdrop: 'shore',
    items: { 'ember-feather': 1 },
  });
  expect((await info(page)).commands.find(({ label }) => label === 'Flee')?.enabled).toBe(false);
  await page.screenshot({ path: 'test-results/screenshots/battle-boss.png' });

  // With this seed, the Warden has knocked Rowan out by the time it telegraphs, on Bram's turn.
  const readied = await attackUntilOver(
    page,
    (battle) => fighter(battle, 'drowned-warden-a').telegraph !== null,
  );
  expect(fighter(readied, 'drowned-warden-a').telegraph).toEqual({ skill: 'undertow' });
  expect(readied).toMatchObject({ active: 'bram', page: 'commands' });
  expect(fighter(readied, 'rowan').hp).toBe(0);
  // The timeline marks the Warden's next turn, when Undertow comes, and Rowan is off it.
  expect(readied.timeline.filter(({ telegraph }) => telegraph)).toEqual([
    { id: 'drowned-warden-a', telegraph: true, changed: false },
  ]);
  expect(readied.timeline.findIndex(({ telegraph }) => telegraph)).toBe(
    nextTurn(readied, 'drowned-warden-a'),
  );
  expect(turns(readied)).not.toContain('rowan');
  await page.screenshot({ path: 'test-results/screenshots/battle-telegraph.png' });

  // An Ember Feather can only be used on whoever's down.
  await press(page, 'ArrowDown', 'ArrowDown', 'KeyZ');
  expect((await info(page)).list).toEqual([{ label: 'Ember Feather', detail: '1', enabled: true }]);
  await press(page, 'KeyZ');
  const reviving = await info(page);
  expect(reviving).toMatchObject({ page: 'target', aimed: ['rowan'], banner: 'Rowan' });
  // The preview has him back in line.
  expect(turns(reviving)).toContain('rowan');
  await press(page, 'KeyZ');
  await page.waitForFunction(() =>
    (window.__game?.inspect('battle')?.popped as string[]).includes('Back up!'),
  );
  // A quarter of Rowan's HP.
  expect(fighter(await info(page), 'rowan').hp).toBe(15);
  expect(errors).toEqual([]);
});

test('the timeline previews each choice, highlighting the turns it changes', async ({ page }) => {
  const errors = await startBattle(page, ['wolf', 'wolf']);
  const attack = await info(page);
  await press(page, 'ArrowUp');
  const guard = await info(page);
  expect(guard.selected).toBe('Guard');
  // Guard is quick, so Rowan's next turn comes sooner, and the turns that change light up.
  expect(nextTurn(guard, 'rowan')).toBeLessThan(nextTurn(attack, 'rowan'));
  expect(changed(guard)).toContain(nextTurn(guard, 'rowan'));
  expect(guard.timeline[0]).toEqual({ id: 'rowan', telegraph: false, changed: false });
  await page.screenshot({ path: 'test-results/screenshots/battle-timeline-preview.png' });

  // Back on Attack, the preview goes back too.
  await press(page, 'ArrowDown');
  expect((await info(page)).timeline).toEqual(attack.timeline);

  // Guarding, the timeline moves on, and the next turn of the party's starts it.
  await press(page, 'ArrowUp', 'KeyZ');
  const next = await waitForPlayer(page);
  expect(turns(next)[0]).toBe(next.active);
  expect(next.timeline).toHaveLength(11);
  expect(changed(next)).toEqual([]);
  expect(errors).toEqual([]);
});

test('Shield Bash shows its target pushed back on the timeline', async ({ page }) => {
  const errors = await startBattle(page, ['wolf', 'wolf']);
  // Rowan guards until it's Bram's turn.
  let battle = await info(page);
  while (battle.active !== 'bram') {
    await press(page, 'ArrowUp', 'KeyZ');
    battle = await waitForPlayer(page);
  }
  const before = battle;
  await press(page, 'ArrowDown', 'KeyZ');
  const bash = await info(page);
  expect(bash).toMatchObject({ page: 'skills', selected: 'Shield Bash' });
  // Aimed at Wolf A to begin with, it pushes the Wolf's turns back.
  expect(changed(bash)).not.toEqual([]);
  await press(page, 'KeyZ', 'ArrowRight');
  const atWolfB = await info(page);
  expect(atWolfB).toMatchObject({ page: 'target', aimed: ['wolf-b'] });
  expect(nextTurn(atWolfB, 'wolf-b')).toBeGreaterThan(nextTurn(before, 'wolf-b'));
  expect(changed(atWolfB)).toContain(nextTurn(atWolfB, 'wolf-b'));
  await page.screenshot({ path: 'test-results/screenshots/battle-timeline-delay.png' });

  await press(page, 'KeyZ');
  await page.waitForFunction(() =>
    (window.__game?.inspect('battle')?.popped as string[]).includes('Delay'),
  );
  expect(errors).toEqual([]);
});

test('the timeline shows a stagger only on a weakness the party knows', async ({ page }) => {
  const errors = await startBattle(page, ['reef-snail', 'reef-snail'], {
    backdrop: 'shore',
    items: { 'earth-bomb': 2 },
  });
  // The party doesn't know Reef Snails are weak to Earth, so an Earth Bomb shows no more than
  // any quick action would: Guard, say.
  await press(page, 'ArrowUp');
  const guard = await info(page);
  await press(page, 'ArrowUp', 'KeyZ');
  const bomb = await info(page);
  expect(bomb).toMatchObject({ page: 'items', selected: 'Earth Bomb' });
  expect(bomb.timeline).toEqual(guard.timeline);

  // Throwing it finds the weakness out, and Reef Snail A's turn is pushed back.
  await press(page, 'KeyZ', 'KeyZ');
  const after = await waitForPlayer(page);
  expect(after.popped.slice(0, 3)).toEqual(['Weak', '60', 'Stagger!']);
  expect(after.active).toBe('bram');
  expect(nextTurn(after, 'reef-snail-a')).toBeGreaterThan(nextTurn(after, 'rowan'));

  // Now Bram's Earth Bomb shows Reef Snail B staggered back too. (Snail A has been staggered
  // since its last turn, so can't be again.)
  await press(page, 'ArrowUp');
  const guarding = await info(page);
  await press(page, 'ArrowUp', 'KeyZ', 'KeyZ', 'ArrowRight');
  const atSnailB = await info(page);
  expect(atSnailB).toMatchObject({ page: 'target', aimed: ['reef-snail-b'] });
  expect(nextTurn(atSnailB, 'reef-snail-b')).toBeGreaterThan(nextTurn(guarding, 'reef-snail-b'));
  expect(changed(atSnailB)).toContain(nextTurn(atSnailB, 'reef-snail-b'));
  await page.screenshot({ path: 'test-results/screenshots/battle-timeline-stagger.png' });
  expect(errors).toEqual([]);
});

test('the debug menu starts a battle over the field, and joins Bram to the party', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
  await page.evaluate(() => {
    window.__game?.battleSpeed(4);
    window.__game?.warp('test-shore', 10, 7, 'down');
  });
  await page.waitForFunction(() => window.__game?.inspect('field')?.fading === false);

  const menu = () => page.evaluate(() => window.__game?.inspect('debug-menu'));
  const choose = async (label: string) => {
    const { items, cursor } = (await menu()) as { items: { label: string }[]; cursor: number };
    const index = items.findIndex((item) => item.label === label);
    expect(index, `${label} is on the page`).toBeGreaterThanOrEqual(0);
    for (let move = 0; move < (index - cursor + items.length) % items.length; move++) {
      await press(page, 'ArrowDown');
    }
    await press(page, 'KeyZ');
  };
  await page.keyboard.press('Backquote');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('debug-menu') ?? false);
  await choose('Party');
  await choose('Join the party');
  await choose('Bram');
  expect(await page.evaluate(() => window.__game?.state().party)).toEqual(['rowan', 'bram']);
  await press(page, 'KeyX', 'KeyX');
  await choose('Start a battle');
  await choose('Cave Bat x3');
  await waitForPlayer(page);
  expect(await page.evaluate(() => window.__game?.activeScenes())).toEqual(['battle']);
  const battle = await info(page);
  // In front of the caves' cavern, where Cave Bats are met.
  expect(battle.backdrop).toBe('tide-caves');
  expect(battle.fighters.map(({ name }) => name)).toEqual([
    'Rowan',
    'Bram',
    'Cave Bat A',
    'Cave Bat B',
    'Cave Bat C',
  ]);
  expect(errors).toEqual([]);
});

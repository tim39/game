import { describe, expect, test } from 'vitest';
import { startGame } from '../party';
import { Rng } from '../rng';
import { addItem, equip, learnReactions, setVitals, type GameState } from '../state';
import type { Action } from './actions';
import {
  MAX_ENEMIES,
  activeFighter,
  applyAction,
  checkAction,
  checkCommand,
  fighterOf,
  fleeChance,
  previewTurnOrder,
  startBattle,
  targetChoices,
  type BattleSetup,
  type BattleState,
} from './battle';
import type { BattleEvent } from './events';
import type { Fighter, FighterId } from './fighter';
import { DB, ROWAN, SKILLS, TUNING, gameWith } from './fixtures';
import { giveStatus, knockedOut } from './statuses';
import { ELEMENTS, type Status } from './terms';
import type { BattleTuning } from './tuning';

// The test party is Rowan (Normal delay 50), Bram (67) and Liora (56); the Wolf's is 45 and the
// Warden's 50 (see fixtures.ts). With the test tuning, everyone's first turn comes after exactly
// their Normal delay, and damage is left to nothing but Blind.

interface Options {
  readonly start?: BattleSetup['start'];
  readonly game?: GameState;
  readonly tuning?: BattleTuning;
  readonly seed?: number;
}

/** A battle between the test party and `enemies`. */
function battle(enemies: readonly string[], options: Options = {}): BattleState {
  const { start, game = gameWith(), tuning = TUNING, seed = 1 } = options;
  const setup = start === undefined ? { enemies } : { enemies, start };
  return startBattle(setup, game, DB, tuning, Rng.fromSeed(seed));
}

/** Takes `actions` in turn, and returns the battle after them and everything that happened. */
function play(
  from: BattleState,
  ...actions: readonly Action[]
): { battle: BattleState; events: BattleEvent[] } {
  const rng = Rng.fromSeed(1);
  let battle = from;
  const events: BattleEvent[] = [];
  for (const action of actions) {
    const result = applyAction(battle, action, rng);
    battle = result.battle;
    events.push(...result.events);
  }
  return { battle, events };
}

const after = (from: BattleState, ...actions: readonly Action[]): BattleState =>
  play(from, ...actions).battle;

const eventsOf = (from: BattleState, ...actions: readonly Action[]): BattleEvent[] =>
  play(from, ...actions).events;

/** A battle with one fighter changed: for situations that would take long to play into. */
const changed = (
  battle: BattleState,
  id: FighterId,
  change: (fighter: Fighter) => Fighter,
): BattleState => ({
  ...battle,
  fighters: battle.fighters.map((fighter) => (fighter.id === id ? change(fighter) : fighter)),
});

const withStatus = (battle: BattleState, id: FighterId, status: Status): BattleState =>
  changed(battle, id, (fighter) => giveStatus(fighter, status, 'rowan', TUNING).fighter);

const withHp = (battle: BattleState, id: FighterId, hp: number): BattleState =>
  changed(battle, id, (fighter) => ({ ...fighter, hp }));

/** A fighter who won't go down in a test that has to last. */
const sturdy = (battle: BattleState, id: FighterId): BattleState =>
  changed(battle, id, (fighter) => ({ ...fighter, hp: 999, stats: { ...fighter.stats, hp: 999 } }));

const attack = (target: FighterId): Action => ({ type: 'attack', target });
const skill = (skill: string, target?: FighterId): Action =>
  target === undefined ? { type: 'skill', skill } : { type: 'skill', skill, target };
const use = (item: string, target?: FighterId): Action =>
  target === undefined ? { type: 'item', item } : { type: 'item', item, target };
const GUARD: Action = { type: 'guard' };
const FLEE: Action = { type: 'flee' };

const of = fighterOf;

/** Everyone's CT, by ID. */
const cts = (battle: BattleState): Record<string, number> =>
  Object.fromEntries(battle.fighters.map((fighter) => [fighter.id, fighter.ct]));

/** The share of `count` seeds for which `happens` is true. */
function shareOf(count: number, happens: (rng: Rng) => boolean): number {
  let times = 0;
  for (let seed = 0; seed < count; seed++) if (happens(Rng.fromSeed(seed))) times++;
  return times / count;
}

describe('startBattle', () => {
  test('lines up the party in battle order, then the enemies, lettered when they share a name', () => {
    const fighters = battle(['wolf', 'slime', 'wolf']).fighters.map(({ id, name, side, slot }) => ({
      id,
      name,
      side,
      slot,
    }));
    expect(fighters).toEqual([
      { id: 'rowan', name: 'Rowan', side: 'party', slot: 0 },
      { id: 'bram', name: 'Bram', side: 'party', slot: 1 },
      { id: 'liora', name: 'Liora', side: 'party', slot: 2 },
      { id: 'wolf-a', name: 'Wolf A', side: 'enemies', slot: 0 },
      { id: 'slime-a', name: 'Slime', side: 'enemies', slot: 1 },
      { id: 'wolf-b', name: 'Wolf B', side: 'enemies', slot: 2 },
    ]);
  });

  test('gives the party their stats with equipment, their skills and their weapon’s element', () => {
    const game = equip(addItem(gameWith(), 'flame-sword'), 'rowan', 'flame-sword', DB);
    const fight = battle(['wolf'], { game });
    expect(of(fight, 'rowan')).toMatchObject({
      kind: 'rowan',
      stats: { hp: 100, mp: 20, atk: 25, def: 10, mag: 10, res: 10, spd: 10 },
      hp: 100,
      mp: 20,
      statuses: {},
      reactions: {},
      boss: false,
      attackElement: 'fire',
      skills: Object.keys(SKILLS),
      turns: 0,
    });
    expect(of(fight, 'bram').attackElement).toBeUndefined();
    expect(fight.inventory).toEqual(game.inventory);
  });

  test('gives the enemies theirs, and their reactions to elements', () => {
    expect(of(battle(['wolf']), 'wolf-a')).toMatchObject({
      kind: 'wolf',
      stats: { hp: 60, mp: 10, atk: 12, def: 6, mag: 4, res: 4, spd: 12 },
      hp: 60,
      mp: 10,
      reactions: { fire: 'weak', water: 'resist', earth: 'immune', gloam: 'absorb' },
      boss: false,
    });
    expect(battle(['wolf']).boss).toBe(false);
    expect(battle(['wolf', 'warden']).boss).toBe(true);
  });

  test('gives the party the HP and MP they have, and leaves anyone at 0 KO’d', () => {
    let game = setVitals(gameWith(), 'rowan', { hp: 40, mp: 5 }, { hp: 100, mp: 20 });
    game = setVitals(game, 'bram', { hp: 0, mp: 10 }, { hp: 150, mp: 10 });
    const fight = battle(['wolf'], { game });
    expect(of(fight, 'rowan')).toMatchObject({ stats: { hp: 100, mp: 20 }, hp: 40, mp: 5 });
    expect(of(fight, 'bram')).toMatchObject({ hp: 0, mp: 10, ct: 0 });
    expect(of(fight, 'liora')).toMatchObject({ hp: 80, mp: 50 });
    // Bram waits to be revived, off the timeline, and the others' first turns come as ever.
    expect(previewTurnOrder(fight, undefined, 4)).not.toContain('bram');
    expect(cts(fight)).toEqual({ rowan: 5, bram: 0, liora: 11, 'wolf-a': 0 });
    const first = battle(['wolf'], { game, start: 'preemptive' });
    expect(targetChoices(first, { type: 'item', item: 'feather' })).toEqual(['bram']);
    const all = setVitals(
      setVitals(game, 'rowan', { hp: 0, mp: 0 }, { hp: 100, mp: 20 }),
      'liora',
      { hp: 0, mp: 0 },
      { hp: 80, mp: 50 },
    );
    expect(() => battle(['wolf'], { game: all })).toThrow(
      'A battle needs someone in the party standing',
    );
  });

  test('knows what the party has learned of how enemies take elements', () => {
    const game = learnReactions(gameWith(), { wolf: ['fire'] });
    const fight = battle(['wolf'], { game, start: 'preemptive' });
    expect(fight.known).toEqual({ wolf: ['fire'] });
    // So the preview shows Fire staggering the Wolf from the first turn.
    const fire = skill('fire', 'wolf-a');
    expect(previewTurnOrder(fight, fire)).not.toEqual(previewTurnOrder(fight));
  });

  test('starts the first turn: the lowest CT goes, and that much time passes for everyone', () => {
    // Everyone's first turn comes after their Normal delay: 50, 67, 56 and 45.
    const fight = battle(['wolf']);
    expect(fight).toMatchObject({ active: 'wolf-a', outcome: 'ongoing', turn: 1, known: {} });
    expect(cts(fight)).toEqual({ rowan: 5, bram: 22, liora: 11, 'wolf-a': 0 });
  });

  test('times everyone’s first turn by their Normal delay and a random 0.4 to 1', () => {
    const tuning: BattleTuning = { ...TUNING, startCt: [0.4, 1] };
    const firsts = new Set<FighterId | null>();
    for (let seed = 0; seed < 30; seed++) {
      const rolls = Rng.fromSeed(seed);
      const due = [50, 67, 56, 45].map((normal) => Math.round(normal * rolls.range(0.4, 1)));
      const elapsed = Math.min(...due);
      const fight = battle(['wolf'], { tuning, seed });
      expect(Object.values(cts(fight))).toEqual(due.map((ct) => ct - elapsed));
      firsts.add(fight.active);
    }
    expect(firsts.size).toBeGreaterThan(1);
  });

  test('lets the party go first in a preemptive strike, and the enemies in an ambush', () => {
    const preemptive = battle(['wolf'], { start: 'preemptive' });
    expect(preemptive.active).toBe('rowan');
    expect(cts(preemptive)).toEqual({ rowan: 0, bram: 0, liora: 0, 'wolf-a': 45 });
    const ambush = battle(['wolf'], { start: 'ambush' });
    expect(ambush.active).toBe('wolf-a');
    expect(cts(ambush)).toEqual({ rowan: 50, bram: 67, liora: 56, 'wolf-a': 0 });
  });

  test('turns down a battle it can’t start', () => {
    expect(() => battle([])).toThrow('A battle has 1 to 6 enemies, not 0');
    expect(() => battle(Array<string>(MAX_ENEMIES + 1).fill('wolf'))).toThrow('not 7');
    expect(() => battle(['dragon'])).toThrow("There's no enemy called dragon");
    expect(() => battle(['wolf'], { game: gameWith([]) })).toThrow(
      'A battle needs someone in the party',
    );
    // A character whose ID is the one the Wolf would get.
    const db = { ...DB, characters: { ...DB.characters, 'wolf-a': ROWAN } };
    const location = { map: 'test-shore', x: 4, y: 5, facing: 'down' } as const;
    const game = startGame({ location, party: ['wolf-a'] }, db);
    expect(() => startBattle({ enemies: ['wolf'] }, game, db, TUNING, Rng.fromSeed(1))).toThrow(
      'Two fighters would both be wolf-a',
    );
  });
});

describe('turns', () => {
  test('pass in CT order: each action sets its user’s CT to its delay', () => {
    const { battle: next, events } = play(battle(['wolf']), attack('rowan'));
    // The Wolf's Attack takes its Normal delay, 45. Rowan is due in 5, so 5 passes for everyone.
    expect(next).toMatchObject({ active: 'rowan', turn: 2 });
    expect(cts(next)).toEqual({ rowan: 0, bram: 17, liora: 6, 'wolf-a': 40 });
    expect(events).toEqual([
      { type: 'action', actor: 'wolf-a', action: attack('rowan'), targets: ['rowan'] },
      { type: 'damage', target: 'rowan', amount: 7, hp: 93 },
      { type: 'turn', fighter: 'rowan' },
    ]);
    expect(of(next, 'wolf-a').turns).toBe(1);
  });

  test('take as long as the action’s rank: Quick, Normal, Slow or Very Slow', () => {
    // Rowan goes first, then Liora straight after, so his CT is the whole delay.
    const fight = battle(['wolf'], { start: 'preemptive' });
    const delayOf = (action: Action): number => of(after(fight, action), 'rowan').ct;
    expect(delayOf(skill('jab', 'wolf-a'))).toBe(35);
    expect(delayOf(attack('wolf-a'))).toBe(50);
    expect(delayOf(skill('slash', 'wolf-a'))).toBe(50);
    expect(delayOf(skill('mend-all'))).toBe(70);
    expect(delayOf(skill('heavy-blow', 'wolf-a'))).toBe(100);
    expect(delayOf(GUARD)).toBe(35);
    expect(delayOf(use('potion', 'rowan'))).toBe(35);
  });

  test('go to the higher SPD when due at once, then to the party, then to the left', () => {
    let fight = battle(['wolf'], { start: 'preemptive' });
    const order = [fight.active];
    for (let turn = 0; turn < 2; turn++) {
      fight = after(fight, GUARD);
      order.push(fight.active);
    }
    expect(order).toEqual(['rowan', 'liora', 'bram']);
    // Rowan and the Warden both have SPD 10 and come due at 50.
    expect(battle(['warden'], { game: gameWith(['rowan']) }).active).toBe('rowan');
    // Two Wolves come due at 45.
    const wolves = battle(['wolf', 'wolf'], { game: gameWith(['bram']) });
    expect(wolves.active).toBe('wolf-a');
    expect(after(wolves, attack('bram')).active).toBe('wolf-b');
  });
});

describe('previewTurnOrder', () => {
  /** An Attack on the first fighter standing on the other side with the most HP. */
  function normalAction(fight: BattleState): Action {
    const actor = activeFighter(fight);
    const [target] = fight.fighters
      .filter((fighter) => fighter.side !== actor.side && fighter.hp > 0)
      .sort((a, b) => b.hp - a.hp);
    return attack(target?.id ?? '');
  }

  /** Who really has the next `count` turns, if `first` is taken now and Attacks after that. */
  function playedOrder(from: BattleState, first: Action | undefined, count = 10): FighterId[] {
    let fight = from;
    const order: FighterId[] = [];
    while (order.length < count) {
      fight = after(fight, order.length === 0 && first ? first : normalAction(fight));
      if (fight.active === null) break;
      order.push(fight.active);
    }
    return order;
  }

  test('lists the next turns after this one, if everyone takes Normal actions', () => {
    const fight = battle(['warden']);
    expect(fight.active).toBe('rowan');
    expect(previewTurnOrder(fight)).toEqual([
      'warden-a',
      'liora',
      'bram',
      'rowan',
      'warden-a',
      'liora',
      'bram',
      'rowan',
      'warden-a',
      'liora',
    ]);
    expect(previewTurnOrder(fight)).toEqual(playedOrder(fight, undefined));
    expect(previewTurnOrder(fight, undefined, 3)).toEqual(['warden-a', 'liora', 'bram']);
  });

  test('shows a slow action pushing its user back, and a quick one bringing them forward', () => {
    // Rowan is up, Liora and Bram are due straight after him, and the Wolf in 45.
    const fight = sturdy(battle(['wolf'], { start: 'preemptive' }), 'wolf-a');
    const heavy = skill('heavy-blow', 'wolf-a');
    const jab = skill('jab', 'wolf-a');
    expect(previewTurnOrder(fight, heavy)).toEqual(playedOrder(fight, heavy));
    expect(previewTurnOrder(fight, jab)).toEqual(playedOrder(fight, jab));
    // A Normal action makes him wait 50, so he's fourth, after the Wolf; Heavy Blow makes it 100,
    // and he's seventh; Jab makes it 35, and he's third, before the Wolf.
    expect(previewTurnOrder(fight).indexOf('rowan')).toBe(3);
    expect(previewTurnOrder(fight, heavy).indexOf('rowan')).toBe(6);
    expect(previewTurnOrder(fight, jab).indexOf('rowan')).toBe(2);
  });

  test('shows Delay pushing its target back', () => {
    const fight = battle(['warden']);
    const bash = skill('bash', 'warden-a');
    expect(previewTurnOrder(fight, bash)).toEqual(playedOrder(fight, bash));
    expect(previewTurnOrder(fight, bash).slice(0, 3)).toEqual(['liora', 'bram', 'warden-a']);
  });

  test('shows Haste pulling an ally forward and Slow pushing an enemy back, while they last', () => {
    const fight = battle(['warden']);
    for (const action of [
      skill('haste', 'liora'),
      skill('haste', 'rowan'),
      skill('slow', 'warden-a'),
    ]) {
      expect(previewTurnOrder(fight, action, 16)).toEqual(playedOrder(fight, action, 16));
      expect(previewTurnOrder(fight, action, 16)).not.toEqual(
        previewTurnOrder(fight, undefined, 16),
      );
    }
  });

  test('shows a stagger only on a weakness the party knows', () => {
    const fight = sturdy(battle(['wolf'], { start: 'preemptive' }), 'wolf-a');
    const fire = skill('fire', 'wolf-a');
    // Fire is Normal, and the party doesn't know the Wolf is weak to it: the preview gives nothing
    // away, though the stagger comes all the same.
    expect(previewTurnOrder(fight, fire)).toEqual(previewTurnOrder(fight));
    expect(playedOrder(fight, fire)).not.toEqual(previewTurnOrder(fight));
    const known = { ...fight, known: { wolf: ['fire' as const] } };
    expect(previewTurnOrder(known, fire)).toEqual(playedOrder(known, fire));
  });

  test('brings a revived ally back into line', () => {
    const fight = changed(battle(['warden']), 'bram', knockedOut);
    expect(previewTurnOrder(fight)).not.toContain('bram');
    const feather = use('feather', 'bram');
    expect(previewTurnOrder(fight, feather)).toContain('bram');
    expect(previewTurnOrder(fight, feather)).toEqual(playedOrder(fight, feather));
  });

  test('leaves the battle as it was', () => {
    const fight = battle(['warden']);
    const copy = structuredClone(fight);
    previewTurnOrder(fight, skill('haste', 'liora'));
    previewTurnOrder(fight, skill('bash', 'warden-a'));
    expect(fight).toEqual(copy);
  });

  test('turns down an action that can’t be taken, and has nothing once the battle is over', () => {
    const fight = battle(['warden']);
    expect(() => previewTurnOrder(fight, attack('liora'))).toThrow(
      "Rowan can't aim Attack at Liora",
    );
    const won = after(
      withHp(battle(['wolf'], { start: 'preemptive' }), 'wolf-a', 1),
      attack('wolf-a'),
    );
    expect(previewTurnOrder(won)).toEqual([]);
  });
});

describe('damage', () => {
  test('is power × ATK² / (ATK + DEF) for Attack and physical skills', () => {
    const fight = battle(['wolf'], { start: 'preemptive' });
    // 20² / (20 + 6) = 15.4.
    expect(eventsOf(fight, attack('wolf-a'))).toEqual([
      { type: 'action', actor: 'rowan', action: attack('wolf-a'), targets: ['wolf-a'] },
      { type: 'damage', target: 'wolf-a', amount: 15, hp: 45 },
      { type: 'turn', fighter: 'liora' },
    ]);
    // Slash's power is 1.5, and costs 3 MP.
    expect(eventsOf(fight, skill('slash', 'wolf-a'))).toEqual([
      { type: 'action', actor: 'rowan', action: skill('slash', 'wolf-a'), targets: ['wolf-a'] },
      { type: 'mp', target: 'rowan', amount: -3, mp: 17 },
      { type: 'damage', target: 'wolf-a', amount: 23, hp: 37 },
      { type: 'turn', fighter: 'liora' },
    ]);
  });

  test('is power × MAG² / (MAG + RES) for magical skills', () => {
    // Liora's Fire: 20² / (20 + 4) = 16.7, and the Wolf's weak to fire, so × 1.5.
    const fight = after(battle(['wolf'], { start: 'preemptive' }), GUARD);
    const events = eventsOf(fight, skill('fire', 'wolf-a'));
    expect(events).toContainEqual({
      type: 'damage',
      target: 'wolf-a',
      amount: 25,
      hp: 35,
      element: 'fire',
      reaction: 'weak',
    });
  });

  test('hits everyone on a side, for a skill aimed at all of them', () => {
    const fight = battle(['wolf', 'slime', 'wolf'], { start: 'preemptive' });
    const { battle: next, events } = play(fight, skill('sweep'));
    expect(events.filter((event) => event.type === 'damage')).toEqual([
      { type: 'damage', target: 'wolf-a', amount: 8, hp: 52 },
      { type: 'damage', target: 'slime-a', amount: 8, hp: 32 },
      { type: 'damage', target: 'wolf-b', amount: 8, hp: 52 },
    ]);
    expect(events[0]).toMatchObject({ targets: ['wolf-a', 'slime-a', 'wolf-b'] });
    expect(of(next, 'rowan').mp).toBe(16);
  });

  test('takes the weapon’s element for Attack', () => {
    const game = equip(addItem(gameWith(), 'flame-sword'), 'rowan', 'flame-sword', DB);
    // 25² / (25 + 6) × 1.5 = 30.2.
    expect(
      eventsOf(battle(['wolf'], { game, start: 'preemptive' }), attack('wolf-a')),
    ).toContainEqual({
      type: 'damage',
      target: 'wolf-a',
      amount: 30,
      hp: 30,
      element: 'fire',
      reaction: 'weak',
    });
  });

  test('is halved by a resistance, nothing to an immunity, and heals one who absorbs it', () => {
    const fight = battle(['wolf'], { start: 'preemptive' });
    // Tide Edge is water, which the Wolf resists: 15.4 × 0.5.
    expect(eventsOf(fight, skill('tide-edge', 'wolf-a'))).toContainEqual({
      type: 'damage',
      target: 'wolf-a',
      amount: 8,
      hp: 52,
      element: 'water',
      reaction: 'resist',
    });
    // Liora's Quake is earth, which it's immune to.
    const lioras = after(fight, GUARD);
    expect(eventsOf(lioras, skill('quake'))).toContainEqual({
      type: 'damage',
      target: 'wolf-a',
      amount: 0,
      hp: 60,
      element: 'earth',
      reaction: 'immune',
    });
    // Her Gloom is gloam, which it absorbs: it heals by the 17 it would have taken.
    const hurt = withHp(lioras, 'wolf-a', 30);
    expect(eventsOf(hurt, skill('gloom', 'wolf-a'))).toContainEqual({
      type: 'heal',
      target: 'wolf-a',
      amount: 17,
      hp: 47,
      cause: 'absorb',
    });
    expect(of(after(withHp(lioras, 'wolf-a', 55), skill('gloom', 'wolf-a')), 'wolf-a').hp).toBe(60);
  });

  test('is half again on a critical hit, which only physical hits can be', () => {
    const tuning: BattleTuning = { ...TUNING, critChance: 1 };
    const fight = battle(['wolf'], { start: 'preemptive', tuning });
    expect(eventsOf(fight, attack('wolf-a'))).toContainEqual({
      type: 'damage',
      target: 'wolf-a',
      amount: 23,
      hp: 37,
      critical: true,
    });
    expect(eventsOf(after(fight, GUARD), skill('fire', 'wolf-a'))).toContainEqual({
      type: 'damage',
      target: 'wolf-a',
      amount: 25,
      hp: 35,
      element: 'fire',
      reaction: 'weak',
    });
  });

  test('varies by up to a tenth either way', () => {
    const tuning: BattleTuning = { ...TUNING, variance: [0.9, 1.1] };
    const fight = battle(['wolf'], { start: 'preemptive', tuning });
    const amounts = new Set<number>();
    for (let seed = 0; seed < 200; seed++) {
      const { events } = applyAction(fight, attack('wolf-a'), Rng.fromSeed(seed));
      for (const event of events) if (event.type === 'damage') amounts.add(event.amount);
    }
    // 15.4 × 0.9 = 13.8, and 15.4 × 1.1 = 16.9.
    expect([...amounts].sort((a, b) => a - b)).toEqual([14, 15, 16, 17]);
  });

  test('is halved by Guard until the guarder’s next turn', () => {
    const fight = battle(['wolf'], { start: 'preemptive' });
    expect(eventsOf(fight, GUARD)).toEqual([
      { type: 'action', actor: 'rowan', action: GUARD, targets: ['rowan'] },
      { type: 'status-added', target: 'rowan', status: 'guard' },
      { type: 'turn', fighter: 'liora' },
    ]);
    // The Wolf's 6.5 against Rowan, halved; then Rowan's turn comes, and his Guard ends.
    const guarding = changed(battle(['wolf']), 'rowan', (rowan) => ({
      ...rowan,
      statuses: { guard: {} },
    }));
    expect(eventsOf(guarding, attack('rowan'))).toEqual([
      { type: 'action', actor: 'wolf-a', action: attack('rowan'), targets: ['rowan'] },
      { type: 'damage', target: 'rowan', amount: 3, hp: 97 },
      { type: 'turn', fighter: 'rowan' },
      { type: 'status-removed', target: 'rowan', status: 'guard', reason: 'expired' },
    ]);
  });

  test('is at least 1 and at most 9,999', () => {
    const weak = changed(battle(['wolf'], { start: 'preemptive' }), 'rowan', (rowan) => ({
      ...rowan,
      stats: { ...rowan.stats, atk: 1 },
    }));
    expect(eventsOf(weak, attack('wolf-a'))).toContainEqual({
      type: 'damage',
      target: 'wolf-a',
      amount: 1,
      hp: 59,
    });
    const strong = changed(weak, 'rowan', (rowan) => ({
      ...rowan,
      stats: { ...rowan.stats, atk: 100_000 },
    }));
    expect(eventsOf(strong, attack('wolf-a'))).toContainEqual({
      type: 'damage',
      target: 'wolf-a',
      amount: 9999,
      hp: 0,
    });
  });
});

describe('healing', () => {
  test('is power × MAG × 2, up to the target’s most HP', () => {
    const fight = after(withHp(battle(['wolf'], { start: 'preemptive' }), 'rowan', 30), GUARD);
    // Liora's Heal: 1 × 20 × 2.
    expect(eventsOf(fight, skill('heal', 'rowan'))).toEqual([
      { type: 'action', actor: 'liora', action: skill('heal', 'rowan'), targets: ['rowan'] },
      { type: 'mp', target: 'liora', amount: -4, mp: 46 },
      { type: 'heal', target: 'rowan', amount: 40, hp: 70 },
      { type: 'turn', fighter: 'bram' },
    ]);
    expect(of(after(withHp(fight, 'rowan', 90), skill('heal', 'rowan')), 'rowan').hp).toBe(100);
    // Mend All heals everyone standing for half as much.
    const events = eventsOf(fight, skill('mend-all'));
    expect(events.filter((event) => event.type === 'heal')).toEqual([
      { type: 'heal', target: 'rowan', amount: 20, hp: 50 },
      { type: 'heal', target: 'bram', amount: 20, hp: 150 },
      { type: 'heal', target: 'liora', amount: 20, hp: 80 },
    ]);
  });
});

describe('Stagger', () => {
  test('pushes back a fighter hit on a weakness by a quarter of their Normal delay', () => {
    // The Wolf's Normal delay is 45: it was due in 45, and is now due in 56.
    const fight = sturdy(battle(['wolf'], { start: 'preemptive' }), 'wolf-a');
    const { battle: next, events } = play(fight, skill('fire', 'wolf-a'));
    expect(events).toContainEqual({ type: 'stagger', target: 'wolf-a', push: 11 });
    expect(of(next, 'wolf-a')).toMatchObject({ ct: 56, staggered: true });
  });

  test('happens once between the target’s turns', () => {
    const fight = sturdy(battle(['wolf'], { start: 'preemptive' }), 'wolf-a');
    const twice = play(fight, skill('fire', 'wolf-a'), skill('fire', 'wolf-a'));
    expect(twice.events.filter((event) => event.type === 'stagger')).toHaveLength(1);
    // Once the Wolf's turn comes, it can be staggered again.
    let wolfs = twice.battle;
    while (wolfs.active !== 'wolf-a') wolfs = after(wolfs, GUARD);
    expect(of(wolfs, 'wolf-a').staggered).toBe(false);
    const { events } = play(wolfs, attack('bram'), skill('fire', 'wolf-a'));
    expect(events).toContainEqual({ type: 'stagger', target: 'wolf-a', push: 11 });
  });

  test('pushes a boss back half as far', () => {
    // The Warden's Normal delay is 50: a quarter of it, halved, is 6.25.
    const fight = battle(['warden'], { start: 'preemptive' });
    expect(eventsOf(fight, skill('fire', 'warden-a'))).toContainEqual({
      type: 'stagger',
      target: 'warden-a',
      push: 6,
    });
  });

  test('doesn’t happen to a fighter the hit KOs', () => {
    const fight = withHp(battle(['wolf', 'wolf'], { start: 'preemptive' }), 'wolf-a', 5);
    const events = eventsOf(fight, skill('fire', 'wolf-a'));
    expect(events).toContainEqual({ type: 'ko', target: 'wolf-a' });
    expect(events.filter((event) => event.type === 'stagger')).toEqual([]);
  });
});

describe('what the party learns', () => {
  test('is how a kind of enemy takes an element, the first time they hit one with it', () => {
    const fight = battle(['wolf', 'wolf'], { start: 'preemptive' });
    const first = play(fight, skill('fire', 'wolf-a'));
    expect(first.events).toContainEqual({ type: 'reveal', target: 'wolf-a', elements: ['fire'] });
    expect(first.battle.known).toEqual({ wolf: ['fire'] });
    // Liora's Fire on the other Wolf tells them nothing new.
    const second = play(first.battle, skill('fire', 'wolf-b'));
    expect(second.events.filter((event) => event.type === 'reveal')).toEqual([]);
    // Bram's Insight shows them everything.
    const third = play(second.battle, skill('insight', 'wolf-b'));
    expect(third.events).toContainEqual({ type: 'reveal', target: 'wolf-b', elements: ELEMENTS });
    expect(third.battle.known).toEqual({ wolf: ELEMENTS });
  });

  test('is nothing from a hit without an element, or a miss', () => {
    const fight = battle(['wolf'], { start: 'preemptive' });
    expect(after(fight, attack('wolf-a')).known).toEqual({});
  });
});

describe('statuses', () => {
  test('Poison takes 8% of max HP at the start of each of the fighter’s turns', () => {
    // Rowan's Venom: half an Attack, and Poison.
    const fight = sturdy(battle(['wolf'], { start: 'preemptive' }), 'wolf-a');
    const { events } = play(fight, skill('venom', 'wolf-a'));
    expect(events).toEqual([
      { type: 'action', actor: 'rowan', action: skill('venom', 'wolf-a'), targets: ['wolf-a'] },
      { type: 'mp', target: 'rowan', amount: -2, mp: 18 },
      { type: 'damage', target: 'wolf-a', amount: 8, hp: 991 },
      { type: 'status-added', target: 'wolf-a', status: 'poison' },
      { type: 'turn', fighter: 'liora' },
    ]);
    // Liora and Bram guard, and Liora's Guard comes round again before the Wolf's turn.
    const wolfs = play(fight, skill('venom', 'wolf-a'), GUARD, GUARD, GUARD);
    expect(wolfs.battle.active).toBe('wolf-a');
    expect(wolfs.events.slice(-2)).toEqual([
      { type: 'turn', fighter: 'wolf-a' },
      { type: 'damage', target: 'wolf-a', amount: 79, hp: 912, cause: 'poison' },
    ]);
  });

  test('Poison can KO, which ends that fighter’s turn before it starts', () => {
    const fight = withHp(
      withStatus(battle(['wolf', 'slime'], { start: 'preemptive' }), 'wolf-a', 'poison'),
      'wolf-a',
      3,
    );
    // Rowan, Liora and Bram guard, then Rowan and Liora again; then the Wolf's turn comes.
    const { battle: next, events } = play(fight, GUARD, GUARD, GUARD, GUARD, GUARD);
    expect(events).toContainEqual({ type: 'turn', fighter: 'wolf-a' });
    expect(events).toContainEqual({
      type: 'damage',
      target: 'wolf-a',
      amount: 4,
      hp: 0,
      cause: 'poison',
    });
    expect(events).toContainEqual({ type: 'ko', target: 'wolf-a' });
    expect(next.active).toBe('bram');
    // With nobody else left, it wins the battle.
    const alone = withHp(
      withStatus(battle(['wolf'], { start: 'preemptive' }), 'wolf-a', 'poison'),
      'wolf-a',
      3,
    );
    expect(after(alone, GUARD, GUARD, GUARD, GUARD, GUARD).outcome).toBe('victory');
  });

  test('Regen gives back 8% of max HP at the start of each of the fighter’s next 3 turns', () => {
    const fight = after(withHp(battle(['slime'], { start: 'preemptive' }), 'rowan', 50), GUARD);
    let { battle: next } = play(fight, skill('regen', 'rowan'));
    const heals: number[] = [];
    for (let turn = 0; turn < 12 && next.active !== null; turn++) {
      const played = play(next, GUARD);
      next = played.battle;
      for (const event of played.events) {
        if (event.type === 'heal' && event.cause === 'regen') heals.push(event.hp);
      }
    }
    expect(heals).toEqual([58, 66, 74]);
  });

  test('Sleep skips the fighter’s turns, until it wears off or they’re hit', () => {
    const fight = sturdy(battle(['wolf'], { start: 'preemptive' }), 'wolf-a');
    const { battle: asleep, events } = play(fight, skill('sleep', 'wolf-a'));
    expect(events).toContainEqual({
      type: 'status-added',
      target: 'wolf-a',
      status: 'sleep',
      turns: 3,
    });
    // Everyone guards for a while: the Wolf sleeps through three turns, then wakes and acts.
    let next = asleep;
    const skipped: BattleEvent[] = [];
    while (next.active !== 'wolf-a') {
      const played = play(next, GUARD);
      next = played.battle;
      skipped.push(
        ...played.events.filter(
          (event) =>
            (event.type === 'asleep' && event.fighter === 'wolf-a') ||
            (event.type === 'status-removed' && event.target === 'wolf-a'),
        ),
      );
    }
    expect(skipped).toEqual([
      { type: 'asleep', fighter: 'wolf-a' },
      { type: 'asleep', fighter: 'wolf-a' },
      { type: 'asleep', fighter: 'wolf-a' },
      { type: 'status-removed', target: 'wolf-a', status: 'sleep', reason: 'expired' },
    ]);
    // A hit wakes it.
    expect(eventsOf(asleep, GUARD, attack('wolf-a'))).toContainEqual({
      type: 'status-removed',
      target: 'wolf-a',
      status: 'sleep',
      reason: 'woke',
    });
  });

  test('Sleep doesn’t take on a boss, and Poison doesn’t wake a sleeper', () => {
    const fight = battle(['warden'], { start: 'preemptive' });
    expect(eventsOf(fight, skill('sleep', 'warden-a'))).toContainEqual({
      type: 'status-resisted',
      target: 'warden-a',
      status: 'sleep',
    });
    const both = withStatus(
      withStatus(sturdy(battle(['wolf'], { start: 'preemptive' }), 'wolf-a'), 'wolf-a', 'poison'),
      'wolf-a',
      'sleep',
    );
    const events = eventsOf(both, GUARD, GUARD, GUARD, GUARD, GUARD);
    expect(events).toContainEqual({ type: 'asleep', fighter: 'wolf-a' });
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'damage', target: 'wolf-a', cause: 'poison' }),
    );
    const wolfs = events.filter(
      (event) => event.type === 'status-removed' && event.target === 'wolf-a',
    );
    expect(wolfs).toEqual([]);
  });

  test('a status left to chance takes about that share of the time', () => {
    const fight = battle(['wolf'], { start: 'preemptive' });
    const share = shareOf(400, (rng) =>
      applyAction(fight, skill('lullaby', 'wolf-a'), rng).events.some(
        (event) => event.type === 'status-added',
      ),
    );
    expect(share).toBeGreaterThan(0.4);
    expect(share).toBeLessThan(0.6);
    expect(eventsOf(fight, skill('lullaby', 'wolf-a'))).toContainEqual(
      expect.objectContaining({ target: 'wolf-a', status: 'sleep' }),
    );
  });

  test('Silence stops magical and healing skills', () => {
    const fight = withStatus(
      after(battle(['wolf'], { start: 'preemptive' }), GUARD),
      'liora',
      'silence',
    );
    expect(checkAction(fight, skill('fire', 'wolf-a'))).toBe("Liora can't use Fire while silenced");
    expect(checkCommand(fight, { type: 'skill', skill: 'heal' })).toBe(
      "Liora can't use Heal while silenced",
    );
    expect(checkAction(fight, skill('haste', 'rowan'))).toBeUndefined();
    expect(checkAction(fight, skill('jab', 'wolf-a'))).toBeUndefined();
    expect(checkAction(fight, attack('wolf-a'))).toBeUndefined();
  });

  test('Blind makes physical attacks miss half the time, but not magic', () => {
    const fight = withStatus(battle(['wolf'], { start: 'preemptive' }), 'rowan', 'blind');
    const missed = (action: Action) => (rng: Rng) =>
      applyAction(fight, action, rng).events.some((event) => event.type === 'miss');
    const share = shareOf(400, missed(attack('wolf-a')));
    expect(share).toBeGreaterThan(0.4);
    expect(share).toBeLessThan(0.6);
    expect(shareOf(100, missed(skill('fire', 'wolf-a')))).toBe(0);
    // A miss does nothing more: no damage, and no effects.
    const misses = (rng: Rng) => applyAction(fight, skill('bash', 'wolf-a'), rng).events;
    const missedBash = Array.from({ length: 20 }, (_, seed) => misses(Rng.fromSeed(seed))).find(
      (events) => events.some((event) => event.type === 'miss'),
    );
    expect(missedBash?.map((event) => event.type)).toEqual(['action', 'mp', 'miss', 'turn']);
  });

  test('Haste brings a fighter’s turns sooner for their next 3, and Slow makes them later', () => {
    // The Wolf has gone; Rowan is up, Liora due in 6 and Bram in 17.
    const fight = after(battle(['wolf']), attack('liora'));
    expect(cts(fight)).toEqual({ rowan: 0, bram: 17, liora: 6, 'wolf-a': 40 });
    // Haste on Bram cuts his 17 to 10 at once; then Liora's 6 passes.
    expect(of(after(fight, skill('haste', 'bram')), 'bram').ct).toBe(4);
    // Slow on the Wolf stretches its 40 to 64.
    expect(of(after(fight, skill('slow', 'wolf-a')), 'wolf-a').ct).toBe(58);
    // Hasted at the start, when Bram is due straight after her, Liora's Attack takes 33, not 56.
    const preemptive = battle(['wolf'], { start: 'preemptive' });
    const hasted = after(preemptive, skill('haste', 'liora'));
    expect(hasted.active).toBe('liora');
    expect(of(after(hasted, attack('wolf-a')), 'liora').ct).toBe(33);
    // It lasts three of her turns, then wears off at the end of the third.
    let next = hasted;
    const left: (number | undefined)[] = [];
    while (left.length < 3) {
      const lioras = next.active === 'liora';
      next = after(next, GUARD);
      if (lioras) left.push(of(next, 'liora').statuses.haste?.turns);
    }
    expect(left).toEqual([2, 1, undefined]);
  });

  test('Up and Down change the stats the damage comes from', () => {
    const fight = battle(['wolf'], { start: 'preemptive' });
    // Focus: Rowan's ATK goes up to 25, so 25² / (25 + 6) = 20.2.
    const focused = withStatus(fight, 'rowan', 'atk-up');
    expect(eventsOf(focused, attack('wolf-a'))).toContainEqual({
      type: 'damage',
      target: 'wolf-a',
      amount: 20,
      hp: 40,
    });
    // Weaken: the Wolf's DEF goes down to 4, so 20² / (20 + 4) = 16.7.
    const weakened = withStatus(fight, 'wolf-a', 'def-down');
    expect(eventsOf(weakened, attack('wolf-a'))).toContainEqual({
      type: 'damage',
      target: 'wolf-a',
      amount: 17,
      hp: 43,
    });
    // Bulwark raises everyone's DEF: the Wolf's 12² / (12 + 12) is 6 on Rowan.
    const { battle: walled, events } = play(battle(['wolf']), GUARD, skill('bulwark'));
    expect(events.filter((event) => event.type === 'status-added')).toHaveLength(4);
    const wolfs = after(walled, GUARD, GUARD);
    expect(wolfs.active).toBe('wolf-a');
    expect(eventsOf(wolfs, attack('rowan'))).toContainEqual({
      type: 'damage',
      target: 'rowan',
      amount: 6,
      hp: 94,
    });
  });

  test('Provoke makes a fighter aim at the provoker, while it lasts and they stand', () => {
    const fight = battle(['wolf', 'wolf'], { start: 'preemptive' });
    const { battle: provoked, events } = play(fight, GUARD, GUARD, skill('provoke'));
    expect(events.filter((event) => event.type === 'status-added')).toEqual([
      { type: 'status-added', target: 'rowan', status: 'guard' },
      { type: 'status-added', target: 'liora', status: 'guard' },
      { type: 'status-added', target: 'wolf-a', status: 'provoke', turns: 2 },
      { type: 'status-added', target: 'wolf-b', status: 'provoke', turns: 2 },
    ]);
    // Rowan and Liora go again, then the Wolves.
    const wolfs = after(provoked, GUARD, GUARD);
    expect(wolfs.active).toBe('wolf-a');
    expect(targetChoices(wolfs, { type: 'attack' })).toEqual(['bram']);
    expect(checkAction(wolfs, attack('rowan'))).toBe('Wolf A is provoked, so can only aim at Bram');
    const unprovoked = changed(wolfs, 'bram', knockedOut);
    expect(targetChoices(unprovoked, { type: 'attack' })).toEqual(['rowan', 'liora']);
  });
});

describe('KO', () => {
  test('comes at 0 HP, and takes the fighter off the timeline', () => {
    const fight = withHp(battle(['wolf', 'wolf'], { start: 'preemptive' }), 'wolf-a', 10);
    const { battle: next, events } = play(fight, attack('wolf-a'));
    expect(events.slice(1, 3)).toEqual([
      { type: 'damage', target: 'wolf-a', amount: 15, hp: 0 },
      { type: 'ko', target: 'wolf-a' },
    ]);
    expect(next.outcome).toBe('ongoing');
    expect(of(next, 'wolf-a')).toMatchObject({ hp: 0, statuses: {} });
    expect(previewTurnOrder(next)).not.toContain('wolf-a');
    expect(targetChoices(next, { type: 'attack' })).toEqual(['wolf-b']);
    expect(checkAction(next, attack('wolf-a'))).toBe("Liora can't aim Attack at Wolf A");
  });

  test('can be undone by reviving, with a share of HP, after a Normal delay', () => {
    const fight = changed(battle(['wolf'], { start: 'preemptive' }), 'bram', knockedOut);
    const { battle: next, events } = play(fight, use('feather', 'bram'));
    expect(events.slice(0, 2)).toEqual([
      { type: 'action', actor: 'rowan', action: use('feather', 'bram'), targets: ['bram'] },
      { type: 'revive', target: 'bram', hp: 37 },
    ]);
    expect(of(next, 'bram')).toMatchObject({ hp: 37, ct: 67 });
    expect(next.inventory).toEqual({ potion: 3, 'fire-bomb': 2 });
    expect(of(after(fight, skill('raise', 'bram')), 'bram').hp).toBe(75);
  });

  test('can only be undone by reviving, which only works on the KO’d', () => {
    const fight = changed(battle(['wolf'], { start: 'preemptive' }), 'bram', knockedOut);
    expect(targetChoices(fight, { type: 'item', item: 'feather' })).toEqual(['bram']);
    expect(targetChoices(fight, { type: 'item', item: 'potion' })).toEqual(['rowan', 'liora']);
    expect(checkAction(fight, use('potion', 'bram'))).toBe("Rowan can't aim Potion at Bram");
    expect(checkAction(fight, use('feather', 'rowan'))).toBe("Rowan can't aim Feather at Rowan");
    expect(eventsOf(fight, skill('rebirth'))).toContainEqual({
      type: 'revive',
      target: 'bram',
      hp: 37,
    });
    expect(checkAction(battle(['wolf'], { start: 'preemptive' }), skill('rebirth'))).toBe(
      "There's nobody for Rebirth to work on",
    );
  });
});

describe('items', () => {
  const fight = battle(['wolf'], { start: 'preemptive' });

  test('are used up', () => {
    const hurt = withHp(fight, 'rowan', 30);
    const { battle: next, events } = play(hurt, use('potion', 'rowan'));
    expect(events.slice(0, 2)).toEqual([
      { type: 'action', actor: 'rowan', action: use('potion', 'rowan'), targets: ['rowan'] },
      { type: 'heal', target: 'rowan', amount: 50, hp: 80 },
    ]);
    expect(next.inventory).toEqual({ potion: 2, feather: 1, 'fire-bomb': 2 });
  });

  test('do what their effects say', () => {
    const stocked = { ...fight, inventory: { ether: 1, antidote: 1, smoke: 1, 'fire-bomb': 1 } };
    const tired = changed(stocked, 'rowan', (rowan) => ({ ...rowan, mp: 4 }));
    expect(eventsOf(tired, use('ether', 'rowan'))).toContainEqual({
      type: 'mp',
      target: 'rowan',
      amount: 10,
      mp: 14,
    });
    expect(eventsOf(withStatus(stocked, 'bram', 'poison'), use('antidote', 'bram'))).toContainEqual(
      {
        type: 'status-removed',
        target: 'bram',
        status: 'poison',
        reason: 'cured',
      },
    );
    // A bomb's damage is what it says, times the element's reaction, and staggers on a weakness.
    const bombed = eventsOf(sturdy(stocked, 'wolf-a'), use('fire-bomb', 'wolf-a'));
    expect(bombed).toContainEqual({
      type: 'damage',
      target: 'wolf-a',
      amount: 60,
      hp: 939,
      element: 'fire',
      reaction: 'weak',
    });
    expect(bombed).toContainEqual({ type: 'stagger', target: 'wolf-a', push: 11 });
    // Smoke gets the party out.
    const { battle: gone, events } = play(stocked, use('smoke'));
    expect(events).toEqual([
      { type: 'action', actor: 'rowan', action: use('smoke'), targets: ['rowan'] },
      { type: 'flee', escaped: true },
    ]);
    expect(gone).toMatchObject({ outcome: 'fled', active: null });
  });

  test('can only be the party’s consumables, ones they have', () => {
    const stocked = { ...fight, inventory: { 'flame-sword': 1, shard: 1 } };
    expect(checkAction(stocked, use('potion', 'rowan'))).toBe('The party has no Potion');
    expect(checkAction(stocked, use('flame-sword', 'rowan'))).toBe("Flame Sword can't be used");
    expect(checkAction(stocked, use('shard'))).toBe("Shard can't be used");
    expect(checkAction(stocked, use('elixir', 'rowan'))).toBe("There's no item called elixir");
    const wolfs = battle(['wolf']);
    expect(checkAction(wolfs, use('potion', 'wolf-a'))).toBe("Wolf can't use items");
  });
});

describe('skills', () => {
  test('cost MP, and need enough of it', () => {
    const fight = battle(['wolf'], { start: 'preemptive' });
    expect(of(after(fight, skill('slash', 'wolf-a')), 'rowan').mp).toBe(17);
    const tired = changed(fight, 'rowan', (rowan) => ({ ...rowan, mp: 2 }));
    expect(checkAction(tired, skill('slash', 'wolf-a'))).toBe(
      'Rowan needs 3 MP for Slash, and has 2',
    );
    expect(checkAction(tired, skill('bash', 'wolf-a'))).toBeUndefined();
  });

  test('must be ones the fighter knows', () => {
    expect(checkAction(battle(['wolf']), skill('slash', 'rowan'))).toBe("Wolf doesn't know Slash");
    expect(checkAction(battle(['wolf'], { start: 'preemptive' }), skill('meteor'))).toBe(
      "There's no skill called meteor",
    );
  });
});

describe('targets', () => {
  const fight = battle(['wolf', 'wolf'], { start: 'preemptive' });

  test('are those an action can be aimed at', () => {
    expect(targetChoices(fight, { type: 'attack' })).toEqual(['wolf-a', 'wolf-b']);
    expect(targetChoices(fight, { type: 'skill', skill: 'heal' })).toEqual([
      'rowan',
      'bram',
      'liora',
    ]);
    expect(targetChoices(fight, { type: 'skill', skill: 'sweep' })).toEqual([]);
    expect(targetChoices(fight, { type: 'item', item: 'feather' })).toEqual([]);
  });

  test('must be named for an action aimed at one fighter, and only then', () => {
    expect(checkAction(fight, attack('liora'))).toBe("Rowan can't aim Attack at Liora");
    expect(checkAction(fight, skill('heal', 'wolf-a'))).toBe("Rowan can't aim Heal at Wolf A");
    expect(checkAction(fight, skill('slash'))).toBe('Slash needs a target');
    expect(checkAction(fight, skill('sweep', 'wolf-a'))).toBe("Sweep doesn't take a target");
    expect(checkAction(fight, skill('focus', 'rowan'))).toBe("Focus doesn't take a target");
    expect(checkAction(fight, attack('wolf-z'))).toBe(
      "There's nobody called wolf-z in this battle",
    );
    expect(() => applyAction(fight, attack('liora'), Rng.fromSeed(1))).toThrow(RangeError);
  });
});

describe('the outcome', () => {
  test('is victory once every enemy is KO’d, and then nobody can act', () => {
    const fight = withHp(battle(['wolf'], { start: 'preemptive' }), 'wolf-a', 10);
    const { battle: won, events } = play(fight, attack('wolf-a'));
    expect(won).toMatchObject({ outcome: 'victory', active: null });
    expect(events.at(-1)).toEqual({ type: 'ko', target: 'wolf-a' });
    expect(checkAction(won, GUARD)).toBe('The battle is over');
    expect(() => applyAction(won, GUARD, Rng.fromSeed(1))).toThrow('The battle is over');
  });

  test('is defeat once the whole party is KO’d', () => {
    // Liora alone, and the Wolf goes first: 12² / (12 + 8) = 7.2.
    const fight = withHp(battle(['wolf'], { game: gameWith(['liora']) }), 'liora', 7);
    const { battle: lost, events } = play(fight, attack('liora'));
    expect(lost).toMatchObject({ outcome: 'defeat', active: null });
    expect(events.at(-1)).toEqual({ type: 'ko', target: 'liora' });
    // Poison can do it too, as a turn starts.
    const poisoned = withHp(
      withStatus(battle(['wolf'], { game: gameWith(['liora']) }), 'liora', 'poison'),
      'liora',
      1,
    );
    expect(after(poisoned, GUARD).outcome).toBe('defeat');
  });
});

describe('fleeing', () => {
  test('works 50% of the time, plus 2% for each point of SPD the party averages above the enemies', () => {
    // The party's SPD averages (10 + 5 + 8) / 3.
    expect(fleeChance(battle(['wolf'], { start: 'preemptive' }))).toBeCloseTo(
      0.5 + 0.02 * (23 / 3 - 12),
    );
    expect(fleeChance(battle(['slime'], { start: 'preemptive' }))).toBeCloseTo(
      0.5 + 0.02 * (23 / 3 - 2),
    );
    // Only those standing count.
    const bramless = changed(battle(['wolf'], { start: 'preemptive' }), 'bram', knockedOut);
    expect(fleeChance(bramless)).toBeCloseTo(0.5 + 0.02 * (9 - 12));
  });

  test('works from 20% to 95% of the time, however the SPDs compare', () => {
    const fast = changed(battle(['slime'], { start: 'preemptive' }), 'rowan', (rowan) => ({
      ...rowan,
      stats: { ...rowan.stats, spd: 200 },
    }));
    expect(fleeChance(fast)).toBe(0.95);
    const slow = changed(battle(['wolf'], { start: 'preemptive' }), 'wolf-a', (wolf) => ({
      ...wolf,
      stats: { ...wolf.stats, spd: 200 },
    }));
    expect(fleeChance(slow)).toBe(0.2);
  });

  test('gets away about that share of the time, and a try that fails takes the turn', () => {
    const fight = battle(['wolf'], { start: 'preemptive' });
    const escaped = shareOf(400, (rng) => applyAction(fight, FLEE, rng).battle.outcome === 'fled');
    expect(escaped).toBeGreaterThan(fleeChance(fight) - 0.06);
    expect(escaped).toBeLessThan(fleeChance(fight) + 0.06);
    for (let seed = 0; seed < 10; seed++) {
      const { battle: next, events } = applyAction(fight, FLEE, Rng.fromSeed(seed));
      const flee = events.find((event) => event.type === 'flee');
      if (flee?.type === 'flee' && flee.escaped) {
        expect(next).toMatchObject({ outcome: 'fled', active: null });
      } else {
        expect(next.outcome).toBe('ongoing');
        expect(of(next, 'rowan').ct).toBe(50);
      }
    }
  });

  test('is only for the party, and never from a boss', () => {
    expect(checkAction(battle(['wolf']), FLEE)).toBe("Wolf can't flee");
    const boss = { ...battle(['warden'], { start: 'preemptive' }), inventory: { smoke: 1 } };
    expect(checkAction(boss, FLEE)).toBe("There's no fleeing from a boss");
    expect(checkAction(boss, use('smoke'))).toBe("There's no escaping a boss");
  });
});

describe('the engine', () => {
  test('never changes the battle it’s given', () => {
    const fight = withStatus(battle(['wolf', 'wolf'], { start: 'preemptive' }), 'wolf-a', 'poison');
    const copy = structuredClone(fight);
    applyAction(fight, skill('sweep'), Rng.fromSeed(1));
    applyAction(fight, skill('haste', 'liora'), Rng.fromSeed(1));
    applyAction(fight, use('potion', 'rowan'), Rng.fromSeed(1));
    expect(fight).toEqual(copy);
  });

  test('plays the same battle from the same seed', () => {
    const tuning: BattleTuning = {
      ...TUNING,
      variance: [0.9, 1.1],
      critChance: 0.2,
      startCt: [0.4, 1],
    };
    const playThrough = (seed: number): BattleEvent[] => {
      const rng = Rng.fromSeed(seed);
      let fight = battle(['wolf', 'slime'], { tuning, seed });
      const events: BattleEvent[] = [];
      while (fight.active !== null) {
        const actor = activeFighter(fight);
        const targets = targetChoices(fight, { type: 'attack' });
        const target = actor.side === 'party' ? targets[0] : targets.at(-1);
        const result = applyAction(fight, attack(target ?? ''), rng);
        fight = result.battle;
        events.push(...result.events);
      }
      return events;
    };
    expect(playThrough(5)).toEqual(playThrough(5));
    expect(playThrough(5)).not.toEqual(playThrough(6));
  });
});

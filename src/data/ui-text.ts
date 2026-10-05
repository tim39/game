import type { FighterStatus } from '../core/battle/fighter';
import type { Element } from '../core/battle/terms';
import type { ChestText } from '../core/chest';
import { itemName } from './items';

/** Player-facing text that isn't dialogue: prompts, hints and system messages. */
export const UI_TEXT = {
  /** Under the title screen's menu, for a keyboard and for the touch controls. */
  chooseWithKeys: 'Z or Enter to choose',
  chooseWithTouch: 'A to choose',
  /** Covers the game on a phone held upright, where the game is too small to play. */
  turnSideways: 'Turn your phone sideways to play.',
} as const;

/**
 * The save menu: saving in a slot from the field, and loading one from the title screen's
 * Continue. `slot` is `autosave` or a slot's number.
 */
export const SAVE_MENU_TEXT = {
  title: { save: 'Save', load: 'Load' },
  slot: (slot: 'autosave' | number) => (slot === 'autosave' ? 'Autosave' : `Slot ${slot}`),
  empty: 'Empty',
  damaged: "Can't be loaded",
  newer: 'Saved by a newer version',
  level: (level: number) => `Lv ${level}`,
  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  /** Asked before saving over a slot that holds something, with Yes and No to pick from. */
  overwrite: (slot: string) => `Save over ${slot}?`,
  yes: 'Yes',
  no: 'No',
  saved: (slot: string) => `Saved in ${slot}.`,
  failed: "Couldn't save: the browser wouldn't keep it.",
  /** What Confirm and Cancel do, for a keyboard and for the touch controls. */
  hint: {
    keys: { save: 'Z: save   X: back', load: 'Z: load   X: back' },
    touch: { save: 'A: save   B: back', load: 'A: load   B: back' },
  },
} as const;

/** What opening a chest says, in the plain box signs use: what was inside, or that it's empty. */
export const CHEST_TEXT: ChestText = {
  speaker: 'sign',
  found: (contents) =>
    'gold' in contents ? `Found ${contents.gold} gold!` : `Found ${itemName(contents.item)}!`,
  empty: 'The chest is empty.',
};

/**
 * The battle screen's words: the commands, what pops up over the fighters as things happen, the
 * names and short tags of statuses, and what the banner at the top says.
 */
export const BATTLE_TEXT = {
  commands: { attack: 'Attack', skill: 'Skill', item: 'Item', guard: 'Guard', flee: 'Flee' },
  /** Labels in the party's status panel. */
  hp: 'HP',
  mp: 'MP',
  /** The help line while choosing a target, for an action on a whole side. */
  allEnemies: 'All enemies',
  allAllies: 'The whole party',
  /** Over a fighter, as things happen to them. */
  pop: {
    miss: 'Miss',
    critical: 'Critical!',
    stagger: 'Stagger!',
    delay: 'Delay',
    weak: 'Weak',
    resist: 'Resist',
    immune: 'Immune',
    absorb: 'Absorb',
    resisted: 'Resisted',
    asleep: 'Zzz',
    revived: 'Back up!',
    mp: (amount: number) => `${amount} MP`,
  },
  /** Each status's name, as it pops up when given, and a short tag for the party's status panel. */
  statuses: {
    poison: { name: 'Poison', tag: 'Psn' },
    regen: { name: 'Regen', tag: 'Rgn' },
    sleep: { name: 'Sleep', tag: 'Slp' },
    silence: { name: 'Silence', tag: 'Sil' },
    blind: { name: 'Blind', tag: 'Bld' },
    haste: { name: 'Haste', tag: 'Hst' },
    slow: { name: 'Slow', tag: 'Slw' },
    'atk-up': { name: 'ATK Up', tag: 'Atk+' },
    'atk-down': { name: 'ATK Down', tag: 'Atk-' },
    'def-up': { name: 'DEF Up', tag: 'Def+' },
    'def-down': { name: 'DEF Down', tag: 'Def-' },
    'mag-up': { name: 'MAG Up', tag: 'Mag+' },
    'mag-down': { name: 'MAG Down', tag: 'Mag-' },
    'res-up': { name: 'RES Up', tag: 'Res+' },
    'res-down': { name: 'RES Down', tag: 'Res-' },
    provoke: { name: 'Provoke', tag: 'Prv' },
    guard: { name: 'Guard', tag: 'Grd' },
  } satisfies Record<FighterStatus, { name: string; tag: string }>,
  elements: {
    fire: 'Fire',
    water: 'Water',
    wind: 'Wind',
    earth: 'Earth',
    light: 'Light',
    gloam: 'Gloam',
  } satisfies Record<Element, string>,
  /** The banner at the top, as things happen. */
  readies: (who: string, skill: string, target?: string) =>
    target === undefined ? `${who} readies ${skill}!` : `${who} readies ${skill} at ${target}!`,
  weakTo: (who: string, elements: readonly string[]) =>
    elements.length > 0
      ? `${who} is weak to ${elements.join(' and ')}.`
      : `${who} has no weakness.`,
  gotAway: 'The party got away!',
  cantGetAway: "Couldn't get away!",
  victory: 'Victory!',
  defeat: 'The party has fallen...',
  /** Under the result, until Confirm goes on. */
  onwards: { keys: 'Z: go on', touch: 'A: go on' },
};

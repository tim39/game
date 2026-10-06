import type { FighterStatus } from '../core/battle/fighter';
import type { Element } from '../core/battle/terms';
import type { ChestText } from '../core/chest';
import type { Stat } from '../core/stats';
import { itemName } from './items';

/** Player-facing text that isn't dialogue: prompts, hints and system messages. */
export const UI_TEXT = {
  /** Under the title screen's menu and the Game Over's, for a keyboard and for the touch controls. */
  chooseWithKeys: 'Z or Enter to choose',
  chooseWithTouch: 'A to choose',
  /** Covers the game on a phone held upright, where the game is too small to play. */
  turnSideways: 'Turn your phone sideways to play.',
} as const;

/**
 * The save menu: saving in a slot from the main menu, and loading one from the title screen's
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

/**
 * The main menu, which Menu opens on the field: its commands, the party's summary, and what its
 * pages say. Stats' short names are BATTLE_TEXT.stats.
 */
export const MENU_TEXT = {
  commands: {
    items: 'Items',
    skills: 'Skills',
    equip: 'Equip',
    status: 'Status',
    options: 'Options',
    save: 'Save',
  },
  /** What each page asks for, at the bottom, while nothing else is said there. */
  ask: {
    whose: { skills: 'Whose skills?', equip: 'Who will change gear?', status: 'Whose status?' },
    on: (name: string) => `${name}: on whom?`,
    onAll: (name: string) => `${name}: on everyone it helps.`,
  },
  slots: { weapon: 'Weapon', armor: 'Armor', accessory: 'Accessory' },
  /** In a slot with nothing in it. */
  nothing: '-',
  /** Takes off what's in a slot, at the end of what could go in it. */
  remove: 'Remove',
  level: (level: number) => `Lv ${level}`,
  hp: 'HP',
  mp: 'MP',
  /** EXP to the next level, or at the last level, none. */
  next: 'Next',
  maxed: '-',
  exp: 'EXP',
  gold: (gold: number) => `${gold} gold`,
  /** The Status page's heading over the skills a member knows, and what it says if none. */
  skills: 'Skills',
  noSkills: 'None yet',
  /** The last line of a list of skills too long to show, saying how many more Skills lists. */
  moreSkills: (count: number) => `and ${count} more`,
};

/** The Game Over screen, once a battle is lost: what it says, and what it offers. */
export const GAME_OVER_TEXT = {
  heading: 'Game Over',
  choices: { retry: 'Retry battle', load: 'Load save', title: 'Title' },
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
  preemptive: 'Preemptive strike!',
  ambush: 'Ambush!',
  readies: (who: string, skill: string, target?: string) =>
    target === undefined ? `${who} readies ${skill}!` : `${who} readies ${skill} at ${target}!`,
  weakTo: (who: string, elements: readonly string[]) =>
    elements.length > 0
      ? `${who} is weak to ${elements.join(' and ')}.`
      : `${who} has no weakness.`,
  gotAway: 'The party got away!',
  cantGetAway: "Couldn't get away!",
  victory: 'Victory!',
  /** The victory panel, after a battle won: what the party gained, then each level-up. */
  won: {
    exp: (exp: number) => `Gained ${exp} EXP.`,
    gold: (gold: number) => `Found ${gold} gold.`,
    items: (items: readonly string[]) => `Found ${listed(items)}.`,
    /** An item that dropped more than once. */
    several: (item: string, count: number) => `${item} x${count}`,
    levelUp: (who: string, level: number) => `${who} reached level ${level}!`,
    learned: (skills: readonly string[]) => `Learned ${listed(skills)}!`,
    /** What a level-up raised a stat by. */
    gain: (amount: number) => `+${amount}`,
  },
  /** Stats' short names. */
  stats: {
    hp: 'HP',
    mp: 'MP',
    atk: 'ATK',
    def: 'DEF',
    mag: 'MAG',
    res: 'RES',
    spd: 'SPD',
  } satisfies Record<Stat, string>,
  defeat: 'The party has fallen...',
  /** Under the result, until Confirm goes on. */
  onwards: { keys: 'Z: go on', touch: 'A: go on' },
};

/** Things in a list, as said: "Potion", "Potion and Ether", "Potion, Ether and Antidote". */
function listed(things: readonly string[]): string {
  const last = things.at(-1) ?? '';
  return things.length > 1 ? `${things.slice(0, -1).join(', ')} and ${last}` : last;
}

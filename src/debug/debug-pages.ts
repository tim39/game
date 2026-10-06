import { MAX_ENEMIES } from '../core/battle/battle';
import type { GameDb } from '../core/db';
import { ENCOUNTER_RATES, type EncounterRate } from '../core/encounters';
import { SLOTS, canEquip, slotOf, type Slot } from '../core/equipment';
import { expToReach, type ExpCurve } from '../core/levels';
import type { MapDef, SpawnObject } from '../core/map/types';
import type { ItemDef } from '../core/schema';
import {
  addGold,
  addItem,
  equip,
  hasFlag,
  itemCount,
  restoreParty,
  setFlag,
  setLevel,
  unequip,
  type CharacterId,
  type GameState,
  type ItemId,
} from '../core/state';
import { STATS } from '../core/stats';
import type { StoryPoint } from '../data/story';
import type { DebugSwitches } from '../systems/debug-switches';
import type { SaveSlot } from '../systems/saves';
import type { DebugItem, DebugPage } from './debug-menu';

/** What the debug menu's pages work with. */
export interface DebugMenuContext {
  readonly maps: Readonly<Record<string, MapDef>>;
  readonly switches: DebugSwitches;
  /** The options the debug menu sets until the Options screen exists. */
  readonly settings: { battleSpeed: number; encounterRate: EncounterRate };
  /** The game being played, which the Party pages change: `session.state`, in the game. */
  readonly game: { get(): GameState; set(state: GameState): void };
  /** The content the Party pages and Build a battle draw on. */
  readonly db: GameDb;
  /** How much EXP each level takes. */
  readonly curve: ExpCurve;
  /** Puts the player on `map` at one of its spawns. */
  warp(map: string, spawn: string): void;
  /** The ready-made battles there are to start (see `debugBattles`). */
  readonly battles: readonly DebugBattle[];
  /** The battle Build a battle puts together, which it keeps from one visit to the next. */
  readonly plan: DebugBattlePlan;
  /** What a battle can be fought in front of: the backdrops' IDs. */
  readonly backdrops: readonly string[];
  /** Starts a battle, with the party as it is, which goes back to the field once it's won or fled. */
  battle(battle: DebugBattle): void;
  /** Who could join the party: everyone with a sprite to fight as, and whether they're in it. */
  recruits(): readonly { readonly id: string; readonly name: string; readonly joined: boolean }[];
  /** Has someone join the party, at level 1 in the gear they start with. */
  join(id: string): void;
  /** The main story's points, in order (src/data/story.ts), which the Story page jumps between. */
  readonly story: readonly StoryPoint[];
  /**
   * Starts the field over where the player stands, if the menu is over it, so who's about is as the
   * story now has them.
   */
  restartField(): void;
  readonly saves: DebugSaves;
  /** Says something at the bottom of the menu: how an export or an import went. */
  notify(notice: string): void;
}

/** What the debug menu does with the save slots: exporting saves to files, and importing them. */
export interface DebugSaves {
  /** The slots, autosave first, each with what's in it. */
  slots(): readonly DebugSlot[];
  /** Downloads a slot's save as a file, and says how that went. */
  exportSlot(slot: SaveSlot): string;
  /** Asks for a save file, puts it in a slot, and then says how that went. */
  importInto(slot: SaveSlot, report: (notice: string) => void): void;
}

export interface DebugSlot {
  readonly slot: SaveSlot;
  readonly label: string;
  /** What's in it, briefly: where and how long it's been played, `empty` or `damaged`. */
  readonly detail: string;
  readonly empty: boolean;
}

/** How much gold Give gold gives, each time: enough to try out a shop. */
export const DEBUG_GOLD = 1000;

/** The battle speeds the debug menu goes round: the Options screen's 1x to 3x, and 4x. */
export const DEBUG_BATTLE_SPEEDS = [1, 2, 3, 4] as const;

/**
 * The debug menu's first page: warping, battles, the party, the story, the switches, the battle
 * speed and encounter rate, and exporting and importing saves.
 */
export function debugRootPage(context: DebugMenuContext): DebugPage {
  const { switches, settings } = context;
  const toggle = (label: string, name: keyof DebugSwitches): DebugItem => ({
    label,
    on: switches[name],
    choose: () => {
      switches[name] = !switches[name];
    },
  });
  return {
    title: 'Debug',
    items: () => [
      { label: 'Warp to a map', choose: () => warpPage(context) },
      { label: 'Start a battle', choose: () => battlePage(context) },
      { label: 'Party', choose: () => partyPage(context) },
      {
        label: 'Story',
        detail: storyPointName(context.story, storyReached(context.game.get(), context.story)),
        choose: () => storyPage(context),
      },
      toggle('Noclip', 'noclip'),
      toggle('Show collision', 'showCollision'),
      {
        label: 'Battle speed',
        detail: `${settings.battleSpeed}x`,
        // 1x, 2x, 3x, 4x, and round again.
        choose: () => {
          settings.battleSpeed = nextOf(DEBUG_BATTLE_SPEEDS, settings.battleSpeed);
        },
      },
      {
        label: 'Encounter rate',
        detail: RATE_NAMES[settings.encounterRate],
        // Off, Low, Normal, High, and round again.
        choose: () => {
          settings.encounterRate = nextOf(ENCOUNTER_RATES, settings.encounterRate);
        },
      },
      { label: 'Export a save', choose: () => exportPage(context) },
      { label: 'Import a save', choose: () => importPage(context) },
    ],
  };
}

const RATE_NAMES: Readonly<Record<EncounterRate, string>> = {
  off: 'Off',
  low: 'Low',
  normal: 'Normal',
  high: 'High',
};

/** The one after `current` in `list`, round from the last to the first: the first, if it's not there. */
function nextOf<T>(list: readonly T[], current: T): T {
  const next = list[(list.indexOf(current) + 1) % list.length];
  return next === undefined ? current : next;
}

/** A battle the debug menu can start. */
export interface DebugBattle {
  /** Whom it's against, as the menu lists them: `Cave Bat x3`. */
  readonly label: string;
  /** Where they're met: an encounter table's ID, or `boss`. */
  readonly detail: string;
  readonly enemies: readonly string[];
  /** What it's fought in front of. */
  readonly backdrop: string;
  /** Who gets the jump: the party, with a preemptive strike, or the enemies, with an ambush. */
  readonly start?: FirstTurn;
}

type FirstTurn = 'preemptive' | 'ambush';

/** A battle being put together on Build a battle, which changes it as choices are made. */
export interface DebugBattlePlan {
  /** Whom it's against, left to right. */
  enemies: string[];
  backdrop: string;
  /** Who gets the jump, if anyone does. */
  start: FirstTurn | null;
}

/** Where a debug battle's enemies come from, and what to fight them in front of. */
export interface DebugBattleSources {
  readonly enemies: Readonly<Record<string, { readonly name: string }>>;
  readonly encounters: Readonly<
    Record<string, { readonly groups: readonly { readonly enemies: readonly string[] }[] }>
  >;
  /** Each area's boss, and the encounter table of the area it's met in (src/data/balance.ts). */
  readonly bosses: readonly { readonly enemies: readonly string[]; readonly table: string }[];
  /** The backdrop for an encounter table's battles. */
  readonly backdrop: (table: string) => string;
}

/**
 * The ready-made battles the debug menu offers: every group of every encounter table, and each
 * area's boss, in front of the area's backdrop. Build a battle makes any other.
 */
export function debugBattles(sources: DebugBattleSources): DebugBattle[] {
  const { enemies, encounters, bosses, backdrop } = sources;
  const battle = (group: readonly string[], detail: string, table: string): DebugBattle => ({
    label: groupName(group, enemies),
    detail,
    enemies: group,
    backdrop: backdrop(table),
  });
  return [
    ...Object.entries(encounters).flatMap(([table, { groups }]) =>
      groups.map((group) => battle(group.enemies, table, table)),
    ),
    ...bosses.map(({ enemies: group, table }) => battle(group, 'boss', table)),
  ];
}

/** A group of enemies by name, each kind once with how many there are: `Bat x3, Snail`. */
function groupName(
  group: readonly string[],
  enemies: Readonly<Record<string, { readonly name: string }>>,
): string {
  const counts = new Map<string, number>();
  for (const id of group) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts]
    .map(([id, count]) => `${nameIn(enemies, id)}${count > 1 ? ` x${count}` : ''}`)
    .join(', ');
}

/** Build a battle against anyone, or start a ready-made one. */
function battlePage(context: DebugMenuContext): DebugPage {
  return {
    title: 'Start a battle',
    items: () => [
      { label: 'Build a battle', choose: () => buildPage(context) },
      ...context.battles.map((battle) => ({
        label: battle.label,
        detail: battle.detail,
        choose: () => context.battle(battle),
      })),
    ],
  };
}

const FIRST_TURNS = [null, 'preemptive', 'ambush'] as const;
const FIRST_TURN_NAMES: Readonly<Record<FirstTurn | 'either', string>> = {
  either: 'Either side',
  preemptive: 'The party',
  ambush: 'The enemies',
};

/**
 * A battle against up to six of any enemies, left to right as they're added, in front of any
 * backdrop, with either side getting the jump. The enemies in it are listed below, and choosing
 * one takes it out.
 */
function buildPage(context: DebugMenuContext): DebugPage {
  const { plan, db } = context;
  return {
    title: 'Build a battle',
    items: () => [
      {
        label: 'Fight',
        detail: plan.enemies.length > 0 ? groupName(plan.enemies, db.enemies) : 'no one yet',
        choose:
          plan.enemies.length > 0
            ? () =>
                context.battle({
                  label: groupName(plan.enemies, db.enemies),
                  detail: 'built',
                  enemies: [...plan.enemies],
                  backdrop: plan.backdrop,
                  ...(plan.start === null ? {} : { start: plan.start }),
                })
            : undefined,
      },
      {
        label: 'Backdrop',
        detail: plan.backdrop,
        choose: () => {
          plan.backdrop = nextOf(context.backdrops, plan.backdrop);
        },
      },
      {
        label: 'First turn',
        detail: FIRST_TURN_NAMES[plan.start ?? 'either'],
        choose: () => {
          plan.start = nextOf(FIRST_TURNS, plan.start);
        },
      },
      {
        label: 'Add an enemy',
        detail: `${plan.enemies.length} of ${MAX_ENEMIES}`,
        choose: plan.enemies.length < MAX_ENEMIES ? () => enemyPage(context) : undefined,
      },
      ...plan.enemies.map((id, index) => ({
        label: nameIn(db.enemies, id),
        detail: 'take out',
        choose: () => {
          plan.enemies.splice(index, 1);
        },
      })),
    ],
  };
}

/** Every enemy there is: choosing one adds it to the battle being built, up to six. */
function enemyPage(context: DebugMenuContext): DebugPage {
  const { plan, db } = context;
  return {
    title: 'Add an enemy',
    items: () =>
      Object.entries(db.enemies).map(([id, enemy]) => ({
        label: enemy.name,
        detail: enemy.boss ? `${id}, boss` : id,
        choose:
          plan.enemies.length < MAX_ENEMIES
            ? () => {
                plan.enemies.push(id);
                context.notify(`Added ${enemy.name}: ${plan.enemies.length} of ${MAX_ENEMIES}.`);
              }
            : undefined,
      })),
  };
}

/**
 * The party: each member, to set their level and gear; someone joining; items to give; and a rest,
 * which puts everyone back to their most HP and MP.
 */
function partyPage(context: DebugMenuContext): DebugPage {
  const { game, db } = context;
  return {
    title: 'Party',
    items: () => [
      ...game.get().party.map((id) => ({
        label: nameIn(db.characters, id),
        detail: `Lv ${game.get().members[id]?.level ?? '?'}`,
        choose: () => memberPage(context, id),
      })),
      { label: 'Join the party', choose: () => joinPage(context) },
      { label: 'Give an item', choose: () => itemPage(context) },
      {
        label: 'Give gold',
        detail: `${game.get().gold} gold`,
        choose: () => {
          game.set(addGold(game.get(), DEBUG_GOLD));
          context.notify(`Gave the party ${DEBUG_GOLD} gold.`);
        },
      },
      {
        label: 'Rest',
        detail: 'full HP and MP',
        choose: () => {
          game.set(restoreParty(game.get()));
          context.notify('Everyone is back to full HP and MP.');
        },
      },
    ],
  };
}

const SLOT_NAMES: Readonly<Record<Slot, string>> = {
  weapon: 'Weapon',
  armor: 'Armor',
  accessory: 'Accessory',
};

/** A member of the party: their level, and what they have on in each slot. */
function memberPage(context: DebugMenuContext, id: CharacterId): DebugPage {
  const { game, db } = context;
  return {
    title: nameIn(db.characters, id),
    items: () => {
      const member = game.get().members[id];
      return [
        {
          label: 'Level',
          detail: String(member?.level ?? '?'),
          choose: () => levelPage(context, id),
        },
        ...SLOTS.map((slot) => {
          const worn = member?.equipment[slot];
          return {
            label: SLOT_NAMES[slot],
            detail: worn === undefined ? 'nothing' : nameIn(db.items, worn),
            choose: () => gearPage(context, id, slot),
          };
        }),
      ];
    },
  };
}

/** Every level there is, with the EXP it takes: choosing one puts the member at it. */
function levelPage(context: DebugMenuContext, id: CharacterId): DebugPage {
  const { game, db, curve } = context;
  return {
    title: `${nameIn(db.characters, id)}'s level`,
    items: () =>
      Array.from({ length: curve.maxLevel }, (_, index) => {
        const level = index + 1;
        const now = game.get().members[id]?.level === level;
        return {
          label: `Level ${level}`,
          detail: now ? 'now' : `${expToReach(level, curve)} EXP`,
          choose: now ? undefined : () => game.set(setLevel(game.get(), id, level, curve)),
        };
      }),
  };
}

/**
 * Everything a member can wear in a slot, which choosing puts on them, out of thin air; and
 * Nothing, which takes off what's there. What comes off goes into the inventory, as it does.
 */
function gearPage(context: DebugMenuContext, id: CharacterId, slot: Slot): DebugPage {
  const { game, db } = context;
  const character = db.characters[id];
  const pieces = Object.entries(db.items).filter(
    ([, item]) => character !== undefined && slotOf(item) === slot && canEquip(character, item),
  );
  return {
    title: `${nameIn(db.characters, id)}'s ${SLOT_NAMES[slot].toLowerCase()}`,
    items: () => {
      const worn = game.get().members[id]?.equipment[slot];
      return [
        ...pieces.map(([item, def]) => ({
          label: def.name,
          detail: item === worn ? 'worn' : bonusesOf(def),
          choose: item === worn ? undefined : () => game.set(putOn(game.get(), id, item, db)),
        })),
        {
          label: 'Nothing',
          detail: worn === undefined ? 'worn' : undefined,
          choose: worn === undefined ? undefined : () => game.set(unequip(game.get(), id, slot)),
        },
      ];
    },
  };
}

/**
 * Puts a piece of gear on a member of the party, out of thin air, as the debug menu does: what it
 * replaces goes into the inventory.
 */
export const putOn = (state: GameState, id: CharacterId, item: ItemId, db: GameDb): GameState =>
  equip(addItem(state, item), id, item, db);

/** What a piece of gear adds to its wearer's stats, briefly: `ATK +8 SPD -1`. */
function bonusesOf(item: ItemDef): string {
  if (!('stats' in item)) return '';
  return STATS.flatMap((stat) => {
    const bonus = item.stats[stat];
    return bonus === undefined ? [] : [`${stat.toUpperCase()} ${bonus > 0 ? '+' : ''}${bonus}`];
  }).join(' ');
}

/** Every item there is, with how many the party has: choosing one gives the party another. */
function itemPage(context: DebugMenuContext): DebugPage {
  const { game, db } = context;
  return {
    title: 'Give an item',
    items: () =>
      Object.entries(db.items).map(([id, item]) => {
        const count = itemCount(game.get(), id);
        return {
          label: item.name,
          detail: count > 0 ? `x${count}` : undefined,
          choose: () => game.set(addItem(game.get(), id)),
        };
      }),
  };
}

/** Everyone who could join the party; those in it already can't be chosen. */
function joinPage(context: DebugMenuContext): DebugPage {
  return {
    title: 'Join the party',
    items: () =>
      context.recruits().map(({ id, name, joined }) => ({
        label: name,
        detail: joined ? 'in the party' : id,
        choose: joined ? undefined : () => context.join(id),
      })),
  };
}

/** How far the story has got: the latest of its points whose flag is set, or -1 before the first. */
export function storyReached(state: GameState, story: readonly StoryPoint[]): number {
  return story.reduce((reached, { flag }, index) => (hasFlag(state, flag) ? index : reached), -1);
}

/**
 * The game with the story at one of its points, as if it had got there: that point's flag and those
 * before it set, and those after it clear. Point -1 is the start, before any of them.
 */
export function storyAt(state: GameState, story: readonly StoryPoint[], point: number): GameState {
  return story.reduce((next, { flag }, index) => setFlag(next, flag, index <= point), state);
}

const storyPointName = (story: readonly StoryPoint[], point: number): string =>
  story[point]?.name ?? 'The start';

/**
 * The story: the start, then each of its points, which choosing jumps to. The field then starts
 * over where the player stands, so whoever's about is as the story has them.
 */
function storyPage(context: DebugMenuContext): DebugPage {
  const { game, story } = context;
  return {
    title: 'Story',
    items: () => {
      const reached = storyReached(game.get(), story);
      return [-1, ...story.keys()].map((point) => ({
        label: storyPointName(story, point),
        detail: point === reached ? 'now' : (story[point]?.flag ?? 'no story flags'),
        choose: () => {
          game.set(storyAt(game.get(), story, point));
          context.notify(`The story is at ${storyPointName(story, point)}.`);
          context.restartField();
        },
      }));
    },
  };
}

/** Every slot that holds something can be exported to a file, even one that can't be loaded. */
function exportPage(context: DebugMenuContext): DebugPage {
  const { saves } = context;
  return {
    title: 'Export',
    items: () =>
      saves.slots().map(({ slot, label, detail, empty }) => ({
        label,
        detail,
        choose: empty ? undefined : () => context.notify(saves.exportSlot(slot)),
      })),
  };
}

/** A save file can be imported into any slot, replacing what's there. */
function importPage(context: DebugMenuContext): DebugPage {
  const { saves } = context;
  return {
    title: 'Import into',
    items: () =>
      saves.slots().map(({ slot, label, detail }) => ({
        label,
        detail,
        choose: () => saves.importInto(slot, (notice) => context.notify(notice)),
      })),
  };
}

/** Every map, by name. A map with no spawns can't be warped to, so it's shown but can't be chosen. */
function warpPage(context: DebugMenuContext): DebugPage {
  return {
    title: 'Warp to',
    items: () =>
      Object.values(context.maps).map((map) => {
        const spawns = spawnsOf(map);
        return {
          label: map.name,
          detail: spawns.length > 0 ? map.id : `${map.id}: no spawns`,
          choose: spawns.length > 0 ? () => spawnPage(context, map, spawns) : undefined,
        };
      }),
  };
}

/** A map's spawns, where arrivals appear. Choosing one warps there. */
function spawnPage(context: DebugMenuContext, map: MapDef, spawns: SpawnObject[]): DebugPage {
  return {
    title: map.name,
    items: () =>
      spawns.map((spawn) => ({
        label: spawn.id,
        detail: `${spawn.at[0]}, ${spawn.at[1]}`,
        choose: () => context.warp(map.id, spawn.id),
      })),
  };
}

const spawnsOf = (map: MapDef): SpawnObject[] =>
  (map.objects ?? []).filter((object): object is SpawnObject => object.type === 'spawn');

/** Something's name, by its ID, or the ID itself if there's nothing by that ID. */
const nameIn = (record: Readonly<Record<string, { readonly name: string }>>, id: string): string =>
  (Object.hasOwn(record, id) ? record[id]?.name : undefined) ?? id;

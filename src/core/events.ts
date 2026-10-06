import type { Direction } from './direction';

/**
 * Event scripts: cutscenes and interactions, written as async functions run against an
 * EventContext (see Event scripts in docs/TECH.md). Verbs that happen on screen return promises
 * that resolve once they're done; music and sound, and the verbs that read or change the game
 * state, are immediate. The context grows a verb at a time as content needs it.
 */
export interface EventContext {
  /**
   * Shows a line in the dialogue box, typed out, and resolves once the player has read it.
   * `speaker` is an ID from src/data/speakers.ts, which gives the name and portrait.
   */
  say(speaker: string, text: string): Promise<void>;
  /**
   * Offers the player one to four choices, over the last line said, and resolves with the index
   * of the one they pick.
   */
  choice(options: readonly string[]): Promise<number>;

  /** Waits a while: `ms` milliseconds of the game running. */
  wait(ms: number): Promise<void>;
  /**
   * Turns someone to face a way, or to look at someone else. `actor` is `player`, or an NPC on the
   * map by its ID. `toward` is a direction (`up`, `down`, `left` or `right`), or someone to look at.
   */
  face(actor: string, toward: string): Promise<void>;
  /**
   * Walks someone along a route, a step at a time, and resolves once they're there. A step into a
   * wall or someone else, or off the map, fails the script.
   */
  move(actor: string, route: readonly Direction[]): Promise<void>;
  /** Fades the screen to black over `ms` milliseconds (the map fade's length by default). */
  fadeOut(ms?: number): Promise<void>;
  /** Fades the screen back in from black. */
  fadeIn(ms?: number): Promise<void>;
  /**
   * Takes the player to a spawn on a map, this one or another, and resolves once they're there.
   * Like a door, it fades through black; if the screen is black already, it stays black.
   */
  teleport(map: string, spawn: string): Promise<void>;
  /**
   * Opens a shop, by its ID in src/data/shops.ts, and resolves once the player leaves it, having
   * bought and sold whatever they liked.
   */
  shop(id: string): Promise<void>;
  /**
   * Plays a jingle, a sound effect from the asset manifest like `sfx.rest`, with the music paused,
   * and resolves once it's over. The music then carries on where it was.
   */
  jingle(sound: string): Promise<void>;
  /**
   * Changes the music to a track from the asset manifest, like `bgm.saltmere`, or with null fades
   * it out. It crossfades while the script carries on. Arriving on a map plays that map's music.
   */
  bgm(track: string | null): void;
  /** Plays a sound effect from the asset manifest, like `sfx.chest`, while the script carries on. */
  sfx(sound: string): void;

  /** Whether a flag is set, like `story.beacon-out`. */
  flag(name: string): boolean;
  /** Sets a flag, or with `on` false clears it. */
  setFlag(name: string, on?: boolean): void;
  /** A story counter, like `saltmere.lamps-lit`: 0 until it's set. */
  var(name: string): number;
  setVar(name: string, value: number): void;
  hasItem(item: string, count?: number): boolean;
  giveItem(item: string, count?: number): void;
  /** Takes items from the party, which must have them: check with `hasItem` first. */
  takeItem(item: string, count?: number): void;
  gold(): number;
  giveGold(amount: number): void;
  /** Takes gold from the party, which must have enough. */
  takeGold(amount: number): void;
  /** Someone joins the party. */
  joinParty(character: string): void;
  /** Everyone in the party back to their most HP and MP, KO'd or not: a night's rest. */
  heal(): void;
}

export type EventScript = (ev: EventContext) => Promise<void>;

export const defineEvent = (script: EventScript): EventScript => script;

/** The ID `move` and `face` know the player by. NPCs can't have it. */
export const PLAYER = 'player';

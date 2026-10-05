import type { Direction } from '../core/direction';
import type { EncounterRate } from '../core/encounters';
import type { GameState, Vitals } from '../core/state';
import type { AudioInfo } from '../systems/audio';

/**
 * What dev and e2e builds expose as `window.__game`, for tests and for poking at the game by hand.
 * It grows with the game; see "Debug hooks" in docs/TECH.md. Production builds never include it.
 */
export interface DebugApi {
  /** Keys of the scenes that are running right now. */
  activeScenes(): string[];
  /** Stops every running scene and starts `key`. */
  startScene(key: string, data?: object): void;
  /** What a scene reports about itself through its `debugInfo()` method, if it has one. */
  inspect(sceneKey: string): Record<string, unknown> | undefined;
  /** Stops every running scene and puts the player on `map` at cell (x, y). */
  warp(map: string, x: number, y: number, facing?: Direction): void;
  /** The actions the game read as held this frame, from any device. */
  held(): string[];
  /** The debug menu's Noclip: the player walks through walls, water and people. */
  noclip(on: boolean): void;
  /** The debug menu's Show collision: marks solid cells, ways out, spawns and people. */
  showCollision(on: boolean): void;
  /** The game being played: flags, items, the party, where the player is and so on. */
  state(): GameState;
  /** Sets a flag, like `story.beacon-out`, or with `on` false clears it. */
  setFlag(flag: string, on?: boolean): void;
  /** Gives the party `count` of an item (1 if left out). */
  give(item: string, count?: number): void;
  /** Has a character join the party, at level 1 in the gear they start with. */
  join(character: string): void;
  /**
   * A party member's HP and MP, and the most they can have. With `set`, first sets how much of
   * either they have, as a battle might leave them: 0 HP is KO'd.
   */
  vitals(character: string, set?: Partial<Vitals>): { now: Vitals; most: Vitals };
  /** Runs an event script on the field, as if something had set it off. Throws if one is running. */
  run(script: string): void;
  /** The music playing and fading, and the latest sound effects. */
  audio(): AudioInfo;
  /**
   * Stops every running scene and starts a battle against `enemies`, left to right, with the party
   * as the game has it. Once it's over, the field starts where the game says the player is.
   */
  battle(enemies: readonly string[], options?: DebugBattleOptions): void;
  /** How fast battles play out: 1 is normal, 4 is the debug menu's fast. */
  battleSpeed(speed: number): void;
  /**
   * Random battles: sets the Encounter rate option; the countdown to the next battle, in steps at
   * the Normal rate (so 1 brings one on the next step); and the seed they're drawn from, which
   * also starts a fresh countdown. Each is left as it is if not given. Returns how they stand.
   */
  encounters(options?: DebugEncounterOptions): {
    readonly rate: EncounterRate;
    readonly countdown: number;
  };
}

export interface DebugEncounterOptions {
  readonly rate?: EncounterRate;
  readonly countdown?: number;
  readonly seed?: number | string;
}

export interface DebugBattleOptions {
  /** What it's fought in front of: `meadow` if left out. */
  readonly backdrop?: string;
  /** Where its luck comes from, for a battle that plays the same every time; the clock if left out. */
  readonly seed?: number | string;
  /** A preemptive strike lets the party act first; an ambush, the enemies. */
  readonly start?: 'preemptive' | 'ambush';
}

declare global {
  interface Window {
    __game?: DebugApi;
  }
}

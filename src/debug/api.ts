import type { Direction } from '../core/direction';
import type { GameState } from '../core/state';
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
  /** Runs an event script on the field, as if something had set it off. Throws if one is running. */
  run(script: string): void;
  /** The music playing and fading, and the latest sound effects. */
  audio(): AudioInfo;
}

declare global {
  interface Window {
    __game?: DebugApi;
  }
}

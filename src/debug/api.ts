import type { Direction } from '../core/direction';

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
}

declare global {
  interface Window {
    __game?: DebugApi;
  }
}

/**
 * What dev and e2e builds expose as `window.__game`, for tests and for poking at the game by hand.
 * It grows with the game; see "Debug hooks" in docs/TECH.md. Production builds never include it.
 */
export interface DebugApi {
  /** Keys of the scenes that are running right now. */
  activeScenes(): string[];
  /** Stops every running scene and starts `key`. */
  startScene(key: string, data?: object): void;
}

declare global {
  interface Window {
    __game?: DebugApi;
  }
}

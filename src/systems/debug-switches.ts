/**
 * Cheats for testing, which the field obeys. Only the debug menu and `window.__game` turn them on,
 * and production builds include neither, so there they stay off. See "Debug hooks" in docs/TECH.md.
 */
export interface DebugSwitches {
  /** The player walks through walls, water and people; ways out still work. */
  noclip: boolean;
  /** The field marks which cells are solid, lead elsewhere, are spawns or have people in them. */
  showCollision: boolean;
}

export const debugSwitches: DebugSwitches = { noclip: false, showCollision: false };

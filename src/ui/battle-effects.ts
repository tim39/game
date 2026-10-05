import type { Side } from '../core/battle/fighter';
import type { Element } from '../core/battle/terms';
import type { AssetKey } from '../systems/asset-manifest';

/**
 * The effects the battle screen plays over fighters (see Art and audio in docs/DESIGN.md): one
 * for each element's hits, and for plain hits, healing and statuses. Each is a sheet in the asset
 * manifest, played through once, maybe tinted.
 */
export interface Effect {
  readonly key: AssetKey;
  readonly tint?: number;
}

/**
 * What each element's hits look like. The pack has no wind effect, so wind is its white wisps
 * tinted green; and gloam is its smoke, tinted violet.
 */
export const ELEMENT_EFFECTS: Readonly<Record<Element, Effect>> = {
  fire: { key: 'vfx.fire' },
  water: { key: 'vfx.water' },
  wind: { key: 'vfx.wind', tint: 0x9be8a4 },
  earth: { key: 'vfx.earth' },
  light: { key: 'vfx.light' },
  gloam: { key: 'vfx.gloam', tint: 0xa58ad8 },
};

/** Healing and reviving, curing, and statuses that help. */
export const HEAL_EFFECT: Effect = { key: 'vfx.heal' };
/** Statuses that hurt. */
export const AILMENT_EFFECT: Effect = { key: 'vfx.ailment' };
export const GUARD_EFFECT: Effect = { key: 'vfx.guard' };
/** The party disappearing in a puff of smoke, as it gets away. */
export const SMOKE_EFFECT: Effect = { key: 'vfx.gloam' };

/**
 * A hit's effect: its element's, or for a hit of no element, a slash from the party, claws from
 * an enemy, or a flash of light for magic.
 */
export function hitEffect(
  element: Element | undefined,
  from: Side,
  kind: 'physical' | 'magical',
): Effect {
  if (element !== undefined) return ELEMENT_EFFECTS[element];
  if (kind === 'magical') return ELEMENT_EFFECTS.light;
  return { key: from === 'party' ? 'vfx.slash' : 'vfx.claw' };
}

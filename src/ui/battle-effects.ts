import type { Side } from '../core/battle/fighter';
import type { Element } from '../core/battle/terms';
import type { AssetKey } from '../systems/asset-manifest';

/**
 * The effects the battle screen plays over fighters (see Art and audio in docs/DESIGN.md): one
 * for each element's hits, and for plain hits, healing and statuses. Each is a sheet in the asset
 * manifest, played through once, maybe tinted, with the sound it makes as it starts.
 */
export interface Effect {
  readonly key: AssetKey;
  readonly tint?: number;
  readonly sound: AssetKey;
}

/**
 * What each element's hits look and sound like. The pack has no wind effect, so wind is its white
 * wisps tinted green; and gloam is its smoke, tinted violet.
 */
export const ELEMENT_EFFECTS: Readonly<Record<Element, Effect>> = {
  fire: { key: 'vfx.fire', sound: 'sfx.hit-fire' },
  water: { key: 'vfx.water', sound: 'sfx.hit-water' },
  wind: { key: 'vfx.wind', tint: 0x9be8a4, sound: 'sfx.hit-wind' },
  earth: { key: 'vfx.earth', sound: 'sfx.hit-earth' },
  light: { key: 'vfx.light', sound: 'sfx.hit-light' },
  gloam: { key: 'vfx.gloam', tint: 0xa58ad8, sound: 'sfx.hit-gloam' },
};

/** Plain hits: a slash from the party's weapons, and claws from an enemy. */
const SLASH_EFFECT: Effect = { key: 'vfx.slash', sound: 'sfx.slash' };
const CLAW_EFFECT: Effect = { key: 'vfx.claw', sound: 'sfx.hit' };
/** Healing and reviving, curing, and restoring MP. */
export const HEAL_EFFECT: Effect = { key: 'vfx.heal', sound: 'sfx.heal' };
/** Statuses that help: they sparkle like healing, but sound like a power-up. */
export const BUFF_EFFECT: Effect = { key: 'vfx.heal', sound: 'sfx.buff' };
/** Statuses that hurt. */
export const AILMENT_EFFECT: Effect = { key: 'vfx.ailment', sound: 'sfx.ailment' };
export const GUARD_EFFECT: Effect = { key: 'vfx.guard', sound: 'sfx.guard' };
/** The party disappearing in a puff of smoke, as it gets away. */
export const SMOKE_EFFECT: Effect = { key: 'vfx.gloam', sound: 'sfx.whoosh' };

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
  return from === 'party' ? SLASH_EFFECT : CLAW_EFFECT;
}

/** The battle's sounds besides its effects' (see Sound effects in docs/DESIGN.md). */
export const BATTLE_SOUNDS = {
  /** Over a critical hit's own sound. */
  critical: 'sfx.critical',
  /** A miss, and a status shrugged off. */
  miss: 'sfx.whoosh',
  /** Poison taking its toll as a turn starts. */
  poison: 'sfx.ailment',
  /** Knocked back in line: a stagger, or a delay. */
  knock: 'sfx.knock',
  ko: 'sfx.ko',
  /** A telegraphed attack being readied. */
  telegraph: 'sfx.alert',
  /** A boss changing, as its phase starts. */
  phase: 'sfx.phase',
} as const satisfies Record<string, AssetKey>;

/** A hit taking at least this share of its target's most HP lands heavily, as a critical does. */
export const HEAVY_HIT = 0.25;

/**
 * Whether a hit lands heavily: a critical one, or one taking `HEAVY_HIT` of its target's most HP.
 * A heavy hit shakes the screen, and holds it still longer.
 */
export const isHeavyHit = (amount: number, mostHp: number, critical: boolean): boolean =>
  critical || amount >= mostHp * HEAVY_HIT;

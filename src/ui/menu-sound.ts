import type { AssetKey } from '../systems/asset-manifest';

/**
 * The sounds a press in a menu makes (see Sound effects in docs/DESIGN.md): the cursor moving,
 * something chosen, going back, or choosing something that can't be chosen now. A press that
 * changes nothing (the cursor at the end of a setting, say) makes none, and nor does reading: the
 * Confirm that turns a dialogue box's or the victory panel's page is quiet. Each menu's flow says
 * which sound a press made, and its scene plays it (`audio.playMenuSound`).
 */
export type MenuSound = 'cursor' | 'confirm' | 'cancel' | 'buzzer';

/** The sound effect each kind of press plays. */
export const MENU_SOUNDS = {
  cursor: 'sfx.cursor',
  confirm: 'sfx.confirm',
  cancel: 'sfx.cancel',
  buzzer: 'sfx.buzzer',
} as const satisfies Record<MenuSound, AssetKey>;

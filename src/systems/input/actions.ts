/** Everything the player can do, whatever device they use. Game code reads only these. */
export const ACTIONS = ['up', 'down', 'left', 'right', 'confirm', 'cancel', 'menu', 'run'] as const;
export type Action = (typeof ACTIONS)[number];

/** Keyboard bindings, by `KeyboardEvent.code` (physical key position). See Controls in docs/DESIGN.md. */
export const KEYBOARD: Readonly<Record<Action, readonly string[]>> = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  confirm: ['KeyZ', 'Space', 'Enter', 'NumpadEnter'],
  cancel: ['KeyX', 'Escape', 'Backspace'],
  menu: ['KeyC', 'Tab'],
  run: ['ShiftLeft', 'ShiftRight'],
};

/** Every bound key, so the browser's own use of them (scrolling, Tab focus) can be suppressed. */
export const BOUND_KEYS: ReadonlySet<string> = new Set(Object.values(KEYBOARD).flat());

/** The parts of the browser's Gamepad object that input needs. */
export interface GamepadLike {
  readonly buttons: readonly { readonly pressed: boolean }[];
  readonly axes: readonly number[];
}

const STICK_DEADZONE = 0.5;

/**
 * The actions held on any connected gamepad, using the browser's "standard" button layout:
 * 0 = bottom face button, 1 = right, 3 = top, 9 = Start, 12–15 = d-pad up, down, left, right.
 * The right face button cancels in menus and runs while walking, as in docs/DESIGN.md.
 */
export function gamepadActions(pads: readonly (GamepadLike | null)[]): Set<Action> {
  const held = new Set<Action>();
  for (const pad of pads) {
    if (!pad) continue;
    const button = (index: number): boolean => pad.buttons[index]?.pressed ?? false;
    const x = pad.axes[0] ?? 0;
    const y = pad.axes[1] ?? 0;
    if (button(12) || y < -STICK_DEADZONE) held.add('up');
    if (button(13) || y > STICK_DEADZONE) held.add('down');
    if (button(14) || x < -STICK_DEADZONE) held.add('left');
    if (button(15) || x > STICK_DEADZONE) held.add('right');
    if (button(0)) held.add('confirm');
    if (button(1)) {
      held.add('cancel');
      held.add('run');
    }
    if (button(9) || button(3)) held.add('menu');
  }
  return held;
}

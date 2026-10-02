import { describe, expect, it } from 'vitest';
import { BOUND_KEYS, KEYBOARD, gamepadActions, type GamepadLike } from './actions';

function pad({ pressed = [] as number[], axes = [0, 0] } = {}): GamepadLike {
  return {
    buttons: Array.from({ length: 17 }, (_, index) => ({ pressed: pressed.includes(index) })),
    axes,
  };
}

describe('keyboard bindings', () => {
  it('match the controls table in DESIGN.md', () => {
    expect(KEYBOARD.confirm).toEqual(expect.arrayContaining(['KeyZ', 'Space', 'Enter']));
    expect(KEYBOARD.cancel).toEqual(expect.arrayContaining(['KeyX', 'Escape', 'Backspace']));
    expect(KEYBOARD.up).toEqual(expect.arrayContaining(['ArrowUp', 'KeyW']));
    expect(BOUND_KEYS.has('Tab')).toBe(true);
  });

  it('never binds one key to two actions', () => {
    const all = Object.values(KEYBOARD).flat();
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('gamepadActions', () => {
  it('reads nothing from no pads or empty slots', () => {
    expect(gamepadActions([])).toEqual(new Set());
    expect(gamepadActions([null, null])).toEqual(new Set());
    expect(gamepadActions([pad()])).toEqual(new Set());
  });

  it('maps the d-pad', () => {
    expect(gamepadActions([pad({ pressed: [12] })])).toEqual(new Set(['up']));
    expect(gamepadActions([pad({ pressed: [13] })])).toEqual(new Set(['down']));
    expect(gamepadActions([pad({ pressed: [14] })])).toEqual(new Set(['left']));
    expect(gamepadActions([pad({ pressed: [15] })])).toEqual(new Set(['right']));
  });

  it('maps the left stick past its dead zone only', () => {
    expect(gamepadActions([pad({ axes: [0.3, -0.3] })])).toEqual(new Set());
    expect(gamepadActions([pad({ axes: [0.9, 0] })])).toEqual(new Set(['right']));
    expect(gamepadActions([pad({ axes: [-0.9, -0.9] })])).toEqual(new Set(['left', 'up']));
  });

  it('maps the face buttons and Start', () => {
    expect(gamepadActions([pad({ pressed: [0] })])).toEqual(new Set(['confirm']));
    expect(gamepadActions([pad({ pressed: [1] })])).toEqual(new Set(['cancel', 'run']));
    expect(gamepadActions([pad({ pressed: [9] })])).toEqual(new Set(['menu']));
    expect(gamepadActions([pad({ pressed: [3] })])).toEqual(new Set(['menu']));
  });

  it('combines every connected pad', () => {
    expect(gamepadActions([pad({ pressed: [12] }), null, pad({ pressed: [0] })])).toEqual(
      new Set(['up', 'confirm']),
    );
  });

  it('ignores pads with missing buttons or axes', () => {
    expect(gamepadActions([{ buttons: [], axes: [] }])).toEqual(new Set());
  });
});

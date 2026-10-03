import { describe, expect, it } from 'vitest';
import { ActionState, REPEAT_DELAY_MS, REPEAT_INTERVAL_MS } from './action-state';
import type { Action } from './actions';

/** Runs one frame and reports what the state says about `action`. */
function frame(
  state: ActionState,
  held: readonly Action[],
  nowMs: number,
  action: Action,
  fresh: readonly Action[] = [],
) {
  state.update(new Set(held), nowMs, new Set(fresh));
  return {
    held: state.held(action),
    pressed: state.pressed(action),
    repeated: state.pressedOrRepeated(action),
  };
}

describe('ActionState', () => {
  it('reports a press only on the first frame of a hold', () => {
    const state = new ActionState();
    expect(frame(state, ['confirm'], 0, 'confirm')).toEqual({
      held: true,
      pressed: true,
      repeated: true,
    });
    expect(frame(state, ['confirm'], 16, 'confirm')).toEqual({
      held: true,
      pressed: false,
      repeated: false,
    });
    expect(frame(state, [], 32, 'confirm')).toEqual({
      held: false,
      pressed: false,
      repeated: false,
    });
  });

  it('counts a second press in the very next frame, quicker than a release could show', () => {
    const state = new ActionState();
    expect(frame(state, ['confirm'], 0, 'confirm', ['confirm']).pressed).toBe(true);
    // Released and pressed again between frames: held in both, but pressed again.
    expect(frame(state, ['confirm'], 16, 'confirm', ['confirm']).pressed).toBe(true);
    // Simply still held: not a press.
    expect(frame(state, ['confirm'], 32, 'confirm').pressed).toBe(false);
  });

  it('repeats a held action after the delay, then at the interval', () => {
    const state = new ActionState();
    const repeatsAt: number[] = [];
    for (let now = 0; now <= 700; now += 10) {
      if (frame(state, ['down'], now, 'down').repeated) repeatsAt.push(now);
    }
    const first = REPEAT_DELAY_MS;
    expect(repeatsAt).toEqual([
      0,
      first,
      first + 80,
      first + 160,
      first + 240,
      first + 320,
      first + 400,
    ]);
    expect(REPEAT_INTERVAL_MS).toBe(80);
  });

  it('starts the repeat timing over after a release', () => {
    const state = new ActionState();
    frame(state, ['up'], 0, 'up');
    frame(state, ['up'], 250, 'up');
    frame(state, [], 260, 'up');
    expect(frame(state, ['up'], 270, 'up').repeated).toBe(true); // a fresh press
    expect(frame(state, ['up'], 310, 'up').repeated).toBe(false); // not 300 ms since *this* press
    expect(frame(state, ['up'], 570, 'up').repeated).toBe(true);
  });

  it('tracks each action separately', () => {
    const state = new ActionState();
    state.update(new Set<Action>(['left']), 0);
    state.update(new Set<Action>(['left', 'confirm']), 16);
    expect(state.pressed('confirm')).toBe(true);
    expect(state.pressed('left')).toBe(false);
    expect(state.held('left')).toBe(true);
    expect(state.held('cancel')).toBe(false);
  });
});

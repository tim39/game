import { ACTIONS, type Action } from './actions';

/** Holding a direction in a menu repeats after this long… */
export const REPEAT_DELAY_MS = 300;
/** …and then this often. */
export const REPEAT_INTERVAL_MS = 80;

/**
 * Turns "what's held right now" into per-frame answers: held, just pressed, and pressed-or-repeating
 * (for menus). Feed it once per frame with `update`. It knows nothing about devices, so it's testable.
 */
export class ActionState {
  private current = new Set<Action>();
  private pressedNow = new Set<Action>();
  private repeatedNow = new Set<Action>();
  private readonly nextRepeatAt = new Map<Action, number>();

  update(held: ReadonlySet<Action>, nowMs: number): void {
    this.pressedNow = new Set();
    this.repeatedNow = new Set();
    for (const action of ACTIONS) {
      const isDown = held.has(action);
      const wasDown = this.current.has(action);
      if (isDown && !wasDown) {
        this.pressedNow.add(action);
        this.repeatedNow.add(action);
        this.nextRepeatAt.set(action, nowMs + REPEAT_DELAY_MS);
      } else if (isDown && nowMs >= (this.nextRepeatAt.get(action) ?? Infinity)) {
        this.repeatedNow.add(action);
        this.nextRepeatAt.set(action, nowMs + REPEAT_INTERVAL_MS);
      } else if (!isDown) {
        this.nextRepeatAt.delete(action);
      }
    }
    this.current = new Set(held);
  }

  /** Down right now. */
  held(action: Action): boolean {
    return this.current.has(action);
  }

  /** Went down this frame. */
  pressed(action: Action): boolean {
    return this.pressedNow.has(action);
  }

  /** Went down this frame, or has been held long enough to auto-repeat. Use for menu movement. */
  pressedOrRepeated(action: Action): boolean {
    return this.repeatedNow.has(action);
  }
}

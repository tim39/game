import type { Action } from '../core/battle/actions';
import { activeFighter, previewTurnOrder, type BattleState } from '../core/battle/battle';
import type { BattleEvent } from '../core/battle/events';
import { isKo, type FighterId } from '../core/battle/fighter';

/**
 * The timeline across the top of the battle screen, without the drawing (see Turn order in
 * docs/DESIGN.md): whose turn it is, then whose the next ten are. While a party member chooses, it
 * previews the order their choice will lead to, and the turns that change are highlighted; as an
 * action plays out, it keeps up with what happens. The battle engine's `previewTurnOrder` decides
 * the order; this says what the strip shows of it, and when.
 */

/** How many turns after this one the timeline shows. */
export const TIMELINE_TURNS = 10;

/** One turn on the timeline. */
export interface TimelineSlot {
  /** Whose turn it is. */
  readonly id: FighterId;
  /** Whether it's the turn a telegraphed skill comes on: marked with a !. */
  readonly telegraph: boolean;
}

/** Whose turn it is now, then whose the turns after it are, in order. Empty once it's over. */
export type Timeline = readonly TimelineSlot[];

/**
 * The timeline as it will be if the fighter whose turn it is takes `pending`, or a Normal action
 * without it, and everyone after takes Normal actions: whose turn it is, then whose the next
 * `turns` are. A skill that's been telegraphed comes on its user's next turn: this one, if it's
 * theirs.
 */
export function timelineOf(
  battle: BattleState,
  pending?: Action,
  turns = TIMELINE_TURNS,
): Timeline {
  if (battle.active === null) return [];
  const actor = activeFighter(battle);
  // Those whose next turn brings a telegraphed skill, until it's been marked.
  const telegraphing = new Set(
    battle.fighters
      .filter((fighter) => fighter.telegraph !== null && fighter !== actor && !isKo(fighter))
      .map((fighter) => fighter.id),
  );
  if (pending?.type === 'telegraph') telegraphing.add(actor.id);
  return [
    { id: actor.id, telegraph: actor.telegraph !== null },
    ...previewTurnOrder(battle, pending, turns).map((id) => ({
      id,
      telegraph: telegraphing.delete(id),
    })),
  ];
}

/** Which turns of `shown` aren't the same fighter's as in `base`: the preview's highlights. */
export const changedSlots = (base: Timeline, shown: Timeline): boolean[] =>
  shown.map((slot, index) => slot.id !== base[index]?.id);

/**
 * Where each turn of `to` was in `from`, so the strip can slide it along: the same fighter's turn,
 * counting their turns in order, or null for one that's new. With `advanced`, a turn has gone by,
 * and the first of `from` has left.
 */
export function slotOrigins(
  from: readonly FighterId[],
  to: readonly FighterId[],
  advanced: boolean,
): (number | null)[] {
  const taken = new Set<number>();
  return to.map((id) => {
    const origin = from.findIndex(
      (each, index) => each === id && !taken.has(index) && (index > 0 || !advanced),
    );
    if (origin < 0) return null;
    taken.add(origin);
    return origin;
  });
}

/** What the timeline shows after an event, and whether a turn went by with it. */
export interface TimelineChange {
  readonly timeline: Timeline;
  readonly advanced: boolean;
}

/**
 * What the timeline shows as an action's events play out, from the battle `before` it and the
 * result of it: for each event, what the timeline becomes, or null where it stays as it is. The
 * action shows as the preview foresaw it. A stagger on a weakness it couldn't foresee pushes the
 * target back; the KO'd leave the timeline; and each turn that starts takes the first slot away,
 * until the last brings the timeline as the battle now stands.
 */
export function playTimeline(
  before: BattleState,
  action: Action,
  result: { readonly battle: BattleState; readonly events: readonly BattleEvent[] },
): (TimelineChange | null)[] {
  const { battle: after, events } = result;
  // More turns than are shown, to fill in for those the KO'd leave.
  const turns = TIMELINE_TURNS * 2;
  const foreseen = timelineOf(before, action, turns);
  // As the preview would have shown it, knowing the weaknesses the action revealed.
  const revealed = timelineOf({ ...before, known: after.known }, action, turns);
  const final = timelineOf(after);
  // Once the battle's over, there's no next turn to bring: turns that start just go by.
  const lastTurn = after.active === null ? -1 : events.map(({ type }) => type).lastIndexOf('turn');
  const gone = new Set<FighterId>();
  let shown = foreseen;
  let turnsGone = 0;
  return events.map((event, index): TimelineChange | null => {
    switch (event.type) {
      case 'action':
        return { timeline: shorten(shown), advanced: false };
      case 'stagger':
        // Staggers come from the action, before any turn goes by.
        if (turnsGone > 0) return null;
        shown = without(revealed, gone);
        return { timeline: shorten(shown), advanced: false };
      case 'ko':
        gone.add(event.target);
        shown = without(shown, gone);
        return { timeline: shorten(shown), advanced: false };
      case 'turn':
        turnsGone++;
        shown = index === lastTurn ? final : advance(shown, event.fighter);
        return { timeline: shorten(shown), advanced: true };
      // Delay, Haste, Slow and revivals were foreseen, misses and resisted statuses are put right
      // by the next turn, and the rest change nobody's place in line.
      case 'delay':
      case 'revive':
      case 'status-added':
      case 'status-removed':
      case 'status-resisted':
      case 'miss':
      case 'damage':
      case 'heal':
      case 'mp':
      case 'reveal':
      case 'phase':
      case 'asleep':
      case 'flee':
        return null;
    }
  });
}

/** The timeline as many turns long as it shows. */
const shorten = (timeline: Timeline): Timeline => timeline.slice(0, TIMELINE_TURNS + 1);

/** The timeline without the turns to come of those who've left it. */
const without = (timeline: Timeline, gone: ReadonlySet<FighterId>): Timeline =>
  timeline.filter((slot, index) => index === 0 || !gone.has(slot.id));

/** The timeline once a turn has gone by and `next`'s has started, wherever it was foreseen. */
function advance(timeline: Timeline, next: FighterId): Timeline {
  const rest = timeline.slice(1);
  const at = rest.findIndex((slot) => slot.id === next);
  const slot = rest[at] ?? { id: next, telegraph: false };
  return [slot, ...rest.filter((_, index) => index !== at)];
}

/**
 * The letter that tells an enemy from others of its kind on the timeline, as in Wolf A and Wolf B,
 * or '' for one that's alone, or a party member.
 */
export function letterOf(battle: BattleState, id: FighterId): string {
  const fighter = battle.fighters.find((each) => each.id === id);
  if (fighter?.side !== 'enemies') return '';
  const kin = battle.fighters.filter(
    (each) => each.side === 'enemies' && each.kind === fighter.kind,
  );
  // Enemies' IDs are their kind and a letter: wolf-a.
  return kin.length > 1 ? fighter.id.slice(fighter.kind.length + 1).toUpperCase() : '';
}

/** A rectangle within a sprite's frame. */
export interface FrameWindow {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Where a fighter's icon on the timeline is cut from the first frame of their sheet: a `size`
 * square at `at`, where a sheet says its fighter's face is, or else across the middle of a frame
 * that's wider and at the bottom of one that's taller, where they stand. A frame no bigger than
 * the icon is all of it.
 */
export function iconWindow(
  frame: { readonly width: number; readonly height: number },
  size: number,
  at?: { readonly x: number; readonly y: number },
): FrameWindow {
  const width = Math.min(size, frame.width);
  const height = Math.min(size, frame.height);
  const x = at?.x ?? Math.floor((frame.width - width) / 2);
  const y = at?.y ?? frame.height - height;
  return { x, y, width, height };
}

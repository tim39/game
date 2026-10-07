import type { GameDb } from './db';
import type { EventContext } from './events';
import { recruit } from './party';
import {
  addGold,
  addItem,
  getVar,
  hasFlag,
  hasItem,
  removeGold,
  removeItem,
  restoreParty,
  setFlag,
  setVar,
  type GameState,
} from './state';

/**
 * The verbs that happen on screen. The field scene provides them; tests and the validator stand
 * in for it.
 */
export type Stage = Pick<
  EventContext,
  | 'say'
  | 'choice'
  | 'wait'
  | 'face'
  | 'move'
  | 'fadeOut'
  | 'fadeIn'
  | 'teleport'
  | 'shop'
  | 'battle'
  | 'jingle'
  | 'bgm'
  | 'sfx'
>;

/** Where the game state lives while a script reads and changes it. */
export interface StateStore {
  get(): GameState;
  set(state: GameState): void;
}

/**
 * A script's context: the stage's verbs, and the ones that read and change the game state, done
 * with the operations in state.ts, so they check what they're given as those do. Someone who
 * joins the party comes with the gear their character in `db` starts with.
 */
export function createScriptContext(stage: Stage, store: StateStore, db: GameDb): EventContext {
  const change = (operation: (state: GameState) => GameState): void => {
    store.set(operation(store.get()));
  };
  return {
    say: (speaker, text) => stage.say(speaker, text),
    choice: (options) => stage.choice(options),
    wait: (ms) => stage.wait(ms),
    face: (actor, toward) => stage.face(actor, toward),
    move: (actor, route) => stage.move(actor, route),
    fadeOut: (ms) => stage.fadeOut(ms),
    fadeIn: (ms) => stage.fadeIn(ms),
    teleport: (map, spawn) => stage.teleport(map, spawn),
    shop: (id) => stage.shop(id),
    battle: (enemies, backdrop) => stage.battle(enemies, backdrop),
    jingle: (sound) => stage.jingle(sound),
    bgm: (track) => stage.bgm(track),
    sfx: (sound) => stage.sfx(sound),
    flag: (name) => hasFlag(store.get(), name),
    setFlag: (name, on = true) => change((state) => setFlag(state, name, on)),
    var: (name) => getVar(store.get(), name),
    setVar: (name, value) => change((state) => setVar(state, name, value)),
    hasItem: (item, count = 1) => hasItem(store.get(), item, count),
    giveItem: (item, count = 1) => change((state) => addItem(state, item, count)),
    takeItem: (item, count = 1) => change((state) => removeItem(state, item, count)),
    gold: () => store.get().gold,
    giveGold: (amount) => change((state) => addGold(state, amount)),
    takeGold: (amount) => change((state) => removeGold(state, amount)),
    joinParty: (character) => change((state) => recruit(state, character, db)),
    heal: () => change(restoreParty),
  };
}

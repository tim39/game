import { expect, test } from 'vitest';
import type { Action, Command } from '../core/battle/actions';
import {
  activeFighter,
  applyAction,
  checkCommand,
  fighterOf,
  startBattle,
  targetChoices,
  type BattleState,
} from '../core/battle/battle';
import { knockedOut } from '../core/battle/statuses';
import { expToReach } from '../core/levels';
import { recruit, startGame } from '../core/party';
import { Rng } from '../core/rng';
import { addItem, gainExp, setFlag, type GameState } from '../core/state';
import { BATTLE_TUNING, EXP_CURVE } from './balance';
import { DB } from './db';
import { ITEMS } from './items';
import { NEW_GAME } from './new-game';
import { SKILLS } from './skills';

// The battle engine with the game's own content and tuning (its rules are tested on small
// fixtures in src/core/battle).

/** An action aimed at the first fighter the command could be aimed at, if it's aimed at one. */
function aimed(battle: BattleState, command: Command): Action {
  const [target] = targetChoices(battle, command);
  return (target === undefined ? command : { ...command, target }) as Action;
}

test('Rowan and Bram, at the start of the game, see off a pair of wolves', () => {
  const game = recruit(startGame(NEW_GAME, DB), 'bram', DB);
  for (let seed = 0; seed < 50; seed++) {
    const rng = Rng.fromSeed(seed);
    let battle = startBattle({ enemies: ['wolf', 'wolf'] }, game, DB, BATTLE_TUNING, rng);
    while (battle.active !== null) {
      // Everyone attacks: the party the first wolf standing, the wolves whoever's first.
      battle = applyAction(battle, aimed(battle, { type: 'attack' }), rng).battle;
      expect(battle.turn).toBeLessThan(100);
    }
    expect(battle.outcome).toBe('victory');
  }
});

test('every skill the party learns in Act 1, and every consumable, works in battle', () => {
  // Rowan, Bram and Liora at level 10, with Tide Edge, and one of every consumable.
  let game: GameState = recruit(recruit(startGame(NEW_GAME, DB), 'bram', DB), 'liora', DB);
  for (const id of game.party) game = gainExp(game, id, expToReach(10, EXP_CURVE), EXP_CURVE);
  game = setFlag(game, 'story.tide-spark');
  const consumables = Object.entries(ITEMS).filter(([, item]) => item.kind === 'consumable');
  for (const [id] of consumables) game = addItem(game, id);
  const rng = Rng.fromSeed(1);
  // In a preemptive strike, the whole party is up at once: any of them can take the turn.
  const fresh = startBattle(
    { enemies: ['wolf', 'wolf'], start: 'preemptive' },
    game,
    DB,
    BATTLE_TUNING,
    rng,
  );
  const used: string[] = [];
  for (const id of game.party) {
    const battle = { ...fresh, active: id };
    for (const skill of fighterOf(battle, id).skills) {
      const command: Command = { type: 'skill', skill };
      expect(checkCommand(battle, command)).toBeUndefined();
      const { events } = applyAction(battle, aimed(battle, command), rng);
      expect(events[0]).toMatchObject({ type: 'action', actor: id });
      used.push(skill);
    }
  }
  expect(used.sort()).toEqual(Object.keys(SKILLS).sort());

  // With Bram KO'd, so the Ember Feather has someone to revive.
  const hurt = {
    ...fresh,
    fighters: fresh.fighters.map((fighter) =>
      fighter.id === 'bram' ? knockedOut(fighter) : fighter,
    ),
  };
  expect(activeFighter(hurt).id).toBe('rowan');
  for (const [item] of consumables) {
    const command: Command = { type: 'item', item };
    expect(checkCommand(hurt, command)).toBeUndefined();
    const { events } = applyAction(hurt, aimed(hurt, command), rng);
    expect(events[0]).toMatchObject({ type: 'action', actor: 'rowan' });
  }
});

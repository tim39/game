import type { SkillDef } from '../schema';
import type { Action, Command } from './actions';
import {
  activeFighter,
  checkAction,
  checkCommand,
  fighterOf,
  targetChoices,
  type BattleState,
} from './battle';
import { isKo, type Fighter, type FighterId } from './fighter';

/**
 * A simple AI for the party, for the simulator (see Levels in docs/DESIGN.md): what a sensible but
 * unadventurous player does. In order, it gets a KO'd ally back up; heals an ally below half their
 * HP; guards against a telegraphed attack coming its way when it's hurt; hits a weakness the party
 * knows of with a skill; uses a skill on every enemy when there are three or more; and otherwise
 * attacks the enemy with the least HP. It keeps back the MP its healing takes, never flees, and
 * leaves bombs, buffs and statuses alone.
 */
export function choosePartyAction(battle: BattleState): Action {
  const actor = activeFighter(battle);
  if (actor.side !== 'party') throw new RangeError(`It's ${actor.name}'s turn, not the party's`);
  return (
    revive(battle) ??
    heal(battle) ??
    brace(battle, actor) ??
    exploit(battle, actor) ??
    sweep(battle, actor) ??
    attack(battle)
  );
}

/** A KO'd ally gets back up, by a skill or an item that revives. */
function revive(battle: BattleState): Action | undefined {
  const fallen = battle.fighters.some((fighter) => fighter.side === 'party' && isKo(fighter));
  if (!fallen) return undefined;
  const revives = (effects: SkillDef['effects']): boolean =>
    (effects ?? []).some((effect) => effect.type === 'revive');
  return firstAimed(battle, [
    ...skills(battle)
      .filter(([, skill]) => revives(skill.effects))
      .map(([command]) => command),
    ...items(battle, (effects) => revives(effects)),
  ]);
}

/** The most hurt ally below half their HP gets healed, by a skill or an item. */
function heal(battle: BattleState): Action | undefined {
  const hurt = battle.fighters
    .filter((fighter) => fighter.side === 'party' && !isKo(fighter) && share(fighter) < 0.5)
    .sort((a, b) => share(a) - share(b));
  const [worst] = hurt;
  if (!worst) return undefined;
  const healing = skills(battle).filter(([, skill]) => skill.kind === 'healing');
  // A skill that heals everyone, when more than one needs it; one that heals one, at the worst.
  const all = healing.filter(([, skill]) => skill.target === 'all-allies');
  if (hurt.length > 1 && all[0]) return usable(battle, all[0][0], undefined);
  const restores = items(battle, (effects) =>
    (effects ?? []).some((effect) => effect.type === 'restore' && effect.hp !== undefined),
  );
  for (const command of [...healing.map(([command]) => command), ...restores]) {
    const action = usable(battle, command, worst.id);
    if (action) return action;
  }
  return undefined;
}

/** Guard, when hurt and an enemy has telegraphed something at this fighter, or at them all. */
function brace(battle: BattleState, actor: Fighter): Action | undefined {
  if (share(actor) >= 0.7) return undefined;
  const coming = battle.fighters.some((fighter) => {
    const { telegraph } = fighter;
    if (fighter.side === 'party' || isKo(fighter) || telegraph === null) return false;
    return (
      telegraph.target === actor.id ||
      battle.rules.skills[telegraph.skill]?.target === 'all-enemies'
    );
  });
  return coming ? { type: 'guard' } : undefined;
}

/** A skill of an element some enemy standing is known to be weak to, at that enemy. */
function exploit(battle: BattleState, actor: Fighter): Action | undefined {
  for (const [command, skill] of skills(battle)) {
    if (!damages(skill) || skill.element === undefined || !spares(battle, actor, skill)) continue;
    const { element } = skill;
    const weak = (id: FighterId): boolean => {
      const foe = fighterOf(battle, id);
      return foe.reactions[element] === 'weak' && (battle.known[foe.kind] ?? []).includes(element);
    };
    if (skill.target === 'all-enemies') {
      const foes = battle.fighters.filter((foe) => foe.side === 'enemies' && !isKo(foe));
      if (foes.some((foe) => weak(foe.id))) {
        const action = usable(battle, command, undefined);
        if (action) return action;
      }
      continue;
    }
    const target = leastHp(battle, targetChoices(battle, command).filter(weak));
    if (target !== undefined) return usable(battle, command, target);
  }
  return undefined;
}

/** A skill that hits every enemy, when there are three or more. */
function sweep(battle: BattleState, actor: Fighter): Action | undefined {
  const foes = battle.fighters.filter((fighter) => fighter.side === 'enemies' && !isKo(fighter));
  if (foes.length < 3) return undefined;
  for (const [command, skill] of skills(battle)) {
    if (damages(skill) && skill.target === 'all-enemies' && spares(battle, actor, skill)) {
      const action = usable(battle, command, undefined);
      if (action) return action;
    }
  }
  return undefined;
}

/** Attack the enemy with the least HP of those it could aim at. */
function attack(battle: BattleState): Action {
  const target = leastHp(battle, targetChoices(battle, { type: 'attack' }));
  if (target === undefined) throw new RangeError('There is nobody to attack');
  return { type: 'attack', target };
}

// Helpers.

const share = (fighter: Fighter): number => fighter.hp / fighter.stats.hp;

/** A skill that does damage: a physical or a magical one. */
const damages = (skill: SkillDef): skill is Extract<SkillDef, { kind: 'physical' | 'magical' }> =>
  skill.kind === 'physical' || skill.kind === 'magical';

/** The skills the fighter whose turn it is can use now, with their content, in menu order. */
function skills(battle: BattleState): [Command, SkillDef][] {
  return activeFighter(battle).skills.flatMap((id): [Command, SkillDef][] => {
    const skill = battle.rules.skills[id];
    const command: Command = { type: 'skill', skill: id };
    return skill && checkCommand(battle, command) === undefined ? [[command, skill]] : [];
  });
}

/** The consumables the party carries whose effects pass `wanted`, as commands. */
function items(battle: BattleState, wanted: (effects: SkillDef['effects']) => boolean): Command[] {
  return Object.keys(battle.inventory).flatMap((id): Command[] => {
    const item = battle.rules.items[id];
    const command: Command = { type: 'item', item: id };
    return item?.kind === 'consumable' &&
      wanted(item.effects) &&
      checkCommand(battle, command) === undefined
      ? [command]
      : [];
  });
}

/**
 * Whether spending a skill's MP leaves enough for the fighter's healing and reviving skills. Those
 * skills spare themselves.
 */
function spares(battle: BattleState, actor: Fighter, skill: SkillDef): boolean {
  const keeps = actor.skills
    .map((id) => battle.rules.skills[id])
    .filter(
      (kept): kept is SkillDef =>
        kept !== undefined &&
        (kept.kind === 'healing' ||
          (kept.effects ?? []).some((effect) => effect.type === 'revive')),
    );
  if (keeps.includes(skill)) return true;
  return actor.mp - skill.mp >= Math.max(0, ...keeps.map((kept) => kept.mp));
}

/** A command aimed at `target`, or at nobody in particular, if it can be taken that way. */
function usable(
  battle: BattleState,
  command: Command,
  target: FighterId | undefined,
): Action | undefined {
  if (command.type === 'attack' && target === undefined) return undefined;
  const action = (target === undefined ? command : { ...command, target }) as Action;
  return checkAction(battle, action) === undefined ? action : undefined;
}

/** The first command that can be taken, at the first fighter it can be aimed at, if it's aimed. */
function firstAimed(battle: BattleState, commands: readonly Command[]): Action | undefined {
  for (const command of commands) {
    const [target] = targetChoices(battle, command);
    const action = usable(battle, command, target);
    if (action) return action;
  }
  return undefined;
}

/** Of these fighters, the one with the least HP, the first of them in battle order on a tie. */
function leastHp(battle: BattleState, ids: readonly FighterId[]): FighterId | undefined {
  return ids
    .map((id) => fighterOf(battle, id))
    .sort((a, b) => a.hp - b.hp)
    .at(0)?.id;
}

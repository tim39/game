import Phaser from 'phaser';
import type { Action } from '../core/battle/actions';
import { chooseEnemyAction } from '../core/battle/ai';
import {
  activeFighter,
  applyAction,
  fighterOf,
  startBattle,
  type BattleSetup,
  type BattleState,
  type Outcome,
} from '../core/battle/battle';
import type { BattleEvent } from '../core/battle/events';
import type { Fighter, FighterId, Side } from '../core/battle/fighter';
import { DIRECTIONS } from '../core/direction';
import { compileBackdrop } from '../core/map/backdrop';
import { Rng } from '../core/rng';
import { addPlayTime } from '../core/state';
import { BACKDROPS } from '../data/backdrops';
import { BATTLE_PACING, BATTLE_TUNING } from '../data/balance';
import { DB } from '../data/db';
import { MAP_CONTENT } from '../data/terrain';
import { BATTLE_TEXT } from '../data/ui-text';
import { ASSETS, type AssetEntry } from '../systems/asset-manifest';
import { audio } from '../systems/audio';
import { BATTLE_POSES } from '../systems/character-frames';
import { input } from '../systems/input/game-input';
import { session } from '../systems/session';
import { settings } from '../systems/settings';
import { createTilemap } from '../systems/tilemap';
import {
  AILMENT_EFFECT,
  GUARD_EFFECT,
  HEAL_EFFECT,
  SMOKE_EFFECT,
  hitEffect,
  type Effect,
} from '../ui/battle-effects';
import {
  BATTLE_HEIGHT,
  BATTLE_LAYOUT,
  BATTLE_SCALE,
  BATTLE_WIDTH,
  enemySpots,
  partySpots,
  type Point,
} from '../ui/battle-layout';
import {
  aimedAt,
  helpLine,
  openBattleMenu,
  previewAction,
  stepBattleMenu,
  type BattleMenu,
} from '../ui/battle-menu';
import { BattlePanels, isHelpful } from '../ui/battle-panels';
import {
  changedSlots,
  letterOf,
  playTimeline,
  timelineOf,
  type TimelineChange,
} from '../ui/battle-timeline';
import { applyEvent, fighterView, viewOf, type BattleView } from '../ui/battle-view';
import { FONT } from '../ui/fonts';
import { TimelineStrip, type TimelineFigure } from '../ui/timeline-strip';

export const BATTLE_SCENE = 'battle';

/** What battles are fought to: it pauses whatever was playing, which carries on afterwards. */
export const BATTLE_MUSIC = 'bgm.battle';

/** How a battle ended: won, lost, or got away from. */
export type BattleResult = Exclude<Outcome, 'ongoing'>;

/** How a battle starts, `scene.start(BATTLE_SCENE, start)`, and who to tell how it ended. */
export interface BattleStart {
  /** Who it's against, and who gets the jump. The party is the game's, as it is now. */
  readonly setup: BattleSetup;
  /** What it's fought in front of: one of BACKDROPS, in src/data/backdrops.ts. */
  readonly backdrop: string;
  /** Where its luck comes from: the same seed, and the same choices, play the same battle. */
  readonly seed: number | string;
  /**
   * Called once it has ended and the screen has faded out, after the scene has stopped, with how
   * it ended and the battle as it was then: who's standing, with what HP and MP, and what's left of
   * the party's items.
   */
  readonly onEnd: (result: BattleResult, battle: BattleState) => void;
}

type ActionEvent = Extract<BattleEvent, { type: 'action' }>;

/** Above the backdrop's layers, back to front. */
const DEPTH = { shadows: 9, fighters: 10, effects: 20, marks: 30, pops: 31, panels: 40 };

/** A frame longer than this (say, after the tab was hidden) counts as this long. */
const MAX_FRAME_MS = 100;

/** How fast the party's walk cycle, enemies' idle loops and effects play, in frames a second. */
const WALK_FPS = 10;
const IDLE_FPS = 6;
const EFFECT_FPS = 20;

/** How far a fighter lunges at what they hit, a hit shakes its target, and a stagger knocks it. */
const LUNGE = { party: 18, enemies: 10 };
const SHAKE = 2;
const KNOCK = 10;
/**
 * How high a word or number rises over someone, how far apart several are stacked, and how far
 * down a big fighter the first starts.
 */
const POP_RISE = 6;
const POP_GAP = 9;
const POP_DEPTH = 12;

const COLOURS = {
  damage: 0xffffff,
  critical: 0xffd86b,
  heal: 0x8cf09a,
  mp: 0x8ac8ff,
  poison: 0xd2a0ff,
  word: 0xf5c46b,
  dim: 0xc8c0d4,
  helpful: 0x8ac8ff,
  harmful: 0xe0a0ff,
  outline: 0x14101c,
  alert: 0xff5a4a,
  marker: 0xf5c46b,
  down: 0x8a7fa3,
};

/**
 * A fighter on the battle screen: their sprite, standing on its feet, and its shadow; where they
 * stand; and how many words or numbers are rising over them, so the next goes above.
 */
class Figure {
  pops = 0;
  constructor(
    readonly id: FighterId,
    readonly side: Side,
    readonly sprite: Phaser.GameObjects.Sprite,
    readonly shadow: Phaser.GameObjects.Image,
    readonly home: Point,
  ) {}

  get x(): number {
    return this.sprite.x;
  }

  /** The top of their head. */
  get top(): number {
    return this.sprite.y - this.sprite.height;
  }

  /** Where numbers rise from over them: their middle, or for someone big, near the top. */
  get popAt(): number {
    return this.top + Math.min(this.sprite.height / 2, POP_DEPTH);
  }

  /** Their middle, where effects play. */
  get middle(): Point {
    return { x: this.sprite.x, y: this.sprite.y - this.sprite.height / 2 };
  }

  /** Puts their feet at (x, y), shadow and all, in front of those higher up. */
  place(x: number, y: number): void {
    this.sprite.setPosition(x, y).setDepth(DEPTH.fighters + y / 1000);
    this.shadow.setPosition(x, y - 1);
  }
}

/**
 * A battle (see Battle system in docs/DESIGN.md). The battle engine in src/core/battle decides
 * everything, a whole turn at a time; this shows it. A party member's turn opens the command menu
 * (src/ui/battle-menu.ts), and an enemy's asks its AI; either way the action goes to the engine at
 * once, and the events it hands back play out one by one: the actor lunges or casts, effects play
 * over the targets as they flash and shake, numbers and words rise over them, and the panels catch
 * up (src/ui/battle-view.ts). Then the next turn comes. Once it's over, it says how, and after
 * Confirm fades out and hands the result back.
 */
export class BattleScene extends Phaser.Scene {
  private start?: BattleStart;
  private battle?: BattleState;
  private rng = Rng.fromSeed(0);
  /** The battle as the screen shows it, which catches up with the battle event by event. */
  private view: BattleView = [];
  private figures = new Map<FighterId, Figure>();
  private panels?: BattlePanels;
  /** The timeline across the top. */
  private strip?: TimelineStrip;
  /** The ▼ over whoever the menu is aiming at, and the ! over whoever has telegraphed. */
  private marks?: Phaser.GameObjects.Graphics;
  private alerts = new Map<FighterId, Phaser.GameObjects.BitmapText>();
  /** The command menu, while a party member chooses what to do. */
  private menu: BattleMenu | null = null;
  private chosen?: (action: Action) => void;
  /** Waiting for Confirm, at the end. */
  private confirmed?: () => void;
  /** Whose turn it is, as far as the events shown have got. */
  private turnOf: FighterId | null = null;
  /** A party member who has stepped forward, to step back once their turn is done. */
  private forward: FighterId | null = null;
  /** The action playing out, which the hits that follow it come from. */
  private acting: ActionEvent | null = null;
  /** Bumped as the scene starts and stops, so a battle left behind stops where it is. */
  private run = 0;
  private result: BattleResult | null = null;
  /** The words and numbers that have risen over fighters, the latest last, for the debug info. */
  private popped: string[] = [];

  constructor() {
    super(BATTLE_SCENE);
  }

  create(start: BattleStart): void {
    const run = ++this.run;
    // Stopped, it has nothing to show or report, and a battle left playing out stops where it is.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.run++;
      this.menu = null;
      this.battle = undefined;
      this.anims.globalTimeScale = 1;
      audio.resumeMusic();
    });
    this.start = start;
    audio.interruptMusic(BATTLE_MUSIC);
    this.cameras.main.setZoom(BATTLE_SCALE).centerOn(BATTLE_WIDTH / 2, BATTLE_HEIGHT / 2);
    this.drawBackdrop(start.backdrop);

    this.rng = Rng.fromSeed(start.seed);
    const battle = startBattle(start.setup, session.state, DB, BATTLE_TUNING, this.rng);
    this.battle = battle;
    this.view = viewOf(battle);
    this.figures = new Map();
    this.alerts = new Map();
    this.placeFighters(battle);
    this.panels = new BattlePanels(this, DEPTH.panels);
    this.strip = new TimelineStrip(this, DEPTH.panels, timelineFigures(battle));
    this.strip.show(timelineOf(battle));
    this.marks = this.add.graphics().setDepth(DEPTH.marks);
    this.menu = null;
    this.chosen = undefined;
    this.confirmed = undefined;
    this.turnOf = null;
    this.forward = null;
    this.acting = null;
    this.result = null;
    this.popped = [];
    this.panels.showStatus(this.view, null);
    this.fight(run).catch((error: unknown) => console.error('The battle failed:', error));
  }

  override update(): void {
    // Play time is real time, in battle as on the field.
    session.state = addPlayTime(session.state, Math.min(this.game.loop.rawDelta, MAX_FRAME_MS));
    // Everything that plays out goes at the battle speed: moves, waits and animations.
    const speed = settings.battleSpeed;
    this.tweens.timeScale = speed;
    this.time.timeScale = speed;
    this.anims.globalTimeScale = speed;
    const { menu, battle } = this;
    if (menu && battle && this.chosen) {
      const step = stepBattleMenu(menu, battle, {
        move: DIRECTIONS.find((direction) => input.pressedOrRepeated(direction)) ?? null,
        confirm: input.pressed('confirm'),
        cancel: input.pressed('cancel'),
      });
      if (step.action) this.chosen(step.action);
      else if (step.menu !== menu) this.showMenu(step.menu);
    } else if (this.confirmed && input.pressed('confirm')) {
      this.confirmed();
    }
    this.drawMarks();
  }

  /** Read by `window.__game.inspect('battle')` in dev and test builds: empty once it's over. */
  debugInfo(): Record<string, unknown> {
    const { battle, menu, panels } = this;
    if (!battle || !this.start) return {};
    const page = menu?.page ?? null;
    const list = page === 'skills' || page === 'items' ? (menu?.[page] ?? []) : [];
    return {
      backdrop: this.start.backdrop,
      outcome: battle.outcome,
      result: this.result,
      active: battle.active,
      turn: battle.turn,
      // The menu is waiting for the player; otherwise something is playing out, or it's over.
      choosing: this.chosen !== undefined,
      waiting: this.confirmed !== undefined,
      page,
      selected: menu ? this.selectedLabel(menu) : null,
      commands: menu?.commands.map(({ label, enabled }) => ({ label, enabled })) ?? [],
      list: list.map(({ label, detail, enabled }) => ({ label, detail, enabled })),
      aimed: menu ? aimedAt(menu) : [],
      banner: panels?.bannerShown ?? null,
      timeline: this.strip?.debugInfo() ?? [],
      status: panels?.statusText() ?? [],
      popped: this.popped,
      fighters: this.view.map((fighter) => {
        const figure = this.figures.get(fighter.id);
        return {
          ...fighter,
          x: figure?.sprite.x ?? null,
          y: figure?.sprite.y ?? null,
          home: figure?.home ?? null,
          visible: (figure?.sprite.alpha ?? 0) > 0,
          frame: figure ? Number(figure.sprite.frame.name) : null,
        };
      }),
    };
  }

  // The battle, turn by turn.

  /**
   * Plays the battle out: each turn, the party member whose turn it is chooses, or the enemy's AI
   * does, the engine plays the action, and its events play out on screen. Then it ends.
   */
  private async fight(run: number): Promise<void> {
    let battle = this.current();
    await this.fade('in');
    // Who got the jump says so first.
    const jump = this.start?.setup.start;
    if (jump !== undefined && this.live(run)) {
      this.panels?.banner(BATTLE_TEXT[jump]);
      await this.wait(BATTLE_PACING.banner);
      this.panels?.banner(null);
    }
    if (battle.active) await this.turnStarts(battle.active);
    while (battle.outcome === 'ongoing' && this.live(run)) {
      const actor = activeFighter(battle);
      const action =
        actor.side === 'party' ? await this.choose(battle) : chooseEnemyAction(battle, this.rng);
      if (!this.live(run)) return;
      const result = applyAction(battle, action, this.rng);
      const timeline = playTimeline(battle, action, result);
      battle = result.battle;
      this.battle = battle;
      await this.play(result.events, timeline, run);
    }
    if (this.live(run) && battle.outcome !== 'ongoing') await this.finish(battle.outcome, run);
  }

  /** Opens the command menu, and resolves with the action the player chooses. */
  private choose(battle: BattleState): Promise<Action> {
    return new Promise((resolve) => {
      this.chosen = (action) => {
        this.chosen = undefined;
        this.showMenu(null);
        resolve(action);
      };
      this.showMenu(openBattleMenu(battle));
    });
  }

  /**
   * Plays out what an action led to, event by event, up to the next turn that needs a choice, with
   * the timeline keeping up as each starts.
   */
  private async play(
    events: readonly BattleEvent[],
    timeline: readonly (TimelineChange | null)[],
    run: number,
  ): Promise<void> {
    for (const [index, event] of events.entries()) {
      const change = timeline[index];
      if (change) this.strip?.show(change.timeline, { advanced: change.advanced });
      await this.show(event);
      if (!this.live(run)) return;
    }
    if (this.current().outcome !== 'ongoing') await this.stepBack();
    await this.wait(BATTLE_PACING.between);
  }

  /** Says how the battle ended, and once the player has seen it, fades out and hands it back. */
  private async finish(outcome: BattleResult, run: number): Promise<void> {
    const panels = this.panels;
    this.result = outcome;
    // There are no more turns to come.
    this.strip?.hide();
    switch (outcome) {
      case 'victory':
        panels?.banner(BATTLE_TEXT.victory);
        for (const figure of this.standing('party')) this.cheer(figure);
        await this.confirm();
        break;
      case 'defeat':
        panels?.banner(BATTLE_TEXT.defeat);
        await this.confirm();
        break;
      case 'fled':
        await this.wait(BATTLE_PACING.banner);
        break;
    }
    if (!this.live(run)) return;
    await this.fade('out');
    if (!this.live(run)) return;
    const { onEnd } = this.start ?? {};
    const battle = this.current();
    this.scene.stop();
    audio.resumeMusic();
    onEnd?.(outcome, battle);
  }

  /** Fades the screen in from black, or out to it, at the battle speed. Resolves once it's done. */
  private fade(to: 'in' | 'out'): Promise<void> {
    const camera = this.cameras.main;
    const ms = BATTLE_PACING.fade / settings.battleSpeed;
    return new Promise((resolve) => {
      if (to === 'in') {
        camera.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, () => resolve());
        camera.fadeIn(ms, 0, 0, 0);
      } else {
        camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => resolve());
        camera.fadeOut(ms, 0, 0, 0);
      }
    });
  }

  /** Resolves once the player presses Confirm. */
  private confirm(): Promise<void> {
    this.panels?.prompt(true);
    return new Promise((resolve) => {
      this.confirmed = () => {
        this.confirmed = undefined;
        this.panels?.prompt(false);
        resolve();
      };
    });
  }

  // Events, as they play out.

  private async show(event: BattleEvent): Promise<void> {
    switch (event.type) {
      case 'turn':
        await this.stepBack();
        this.panels?.banner(null);
        this.acting = null;
        await this.turnStarts(event.fighter);
        return;
      case 'action':
        this.catchUp(event);
        await this.showAction(event);
        return;
      case 'miss': {
        const figure = this.figure(event.target);
        this.pop(figure, [{ text: BATTLE_TEXT.pop.miss, tint: COLOURS.dim }]);
        await this.dodge(figure);
        return;
      }
      case 'damage':
        await this.showDamage(event);
        return;
      case 'heal':
        await this.showHeal(event);
        return;
      case 'mp': {
        this.catchUp(event);
        if (event.amount > 0) {
          const figure = this.figure(event.target);
          void this.effect(figure, HEAL_EFFECT);
          this.pop(figure, [{ text: BATTLE_TEXT.pop.mp(event.amount), tint: COLOURS.mp }]);
          await this.wait(BATTLE_PACING.hit);
        }
        return;
      }
      case 'status-added':
        await this.showStatus(event);
        return;
      case 'status-removed': {
        this.catchUp(event);
        if (event.reason === 'cured') {
          void this.effect(this.figure(event.target), HEAL_EFFECT);
          await this.wait(BATTLE_PACING.hit);
        }
        return;
      }
      case 'status-resisted': {
        const figure = this.figure(event.target);
        this.pop(figure, [{ text: BATTLE_TEXT.pop.resisted, tint: COLOURS.dim }]);
        await this.wait(BATTLE_PACING.hit);
        return;
      }
      case 'stagger':
      case 'delay': {
        const figure = this.figure(event.target);
        const word = event.type === 'stagger' ? BATTLE_TEXT.pop.stagger : BATTLE_TEXT.pop.delay;
        this.pop(figure, [{ text: word, tint: COLOURS.word }]);
        await this.knockBack(figure);
        return;
      }
      case 'reveal':
        await this.showReveal(event);
        return;
      case 'ko':
        this.catchUp(event);
        await this.fall(this.figure(event.target));
        return;
      case 'revive': {
        this.catchUp(event);
        const figure = this.figure(event.target);
        this.rise(figure);
        void this.effect(figure, HEAL_EFFECT);
        this.pop(figure, [
          { text: BATTLE_TEXT.pop.revived, tint: COLOURS.heal },
          { text: String(event.hp), tint: COLOURS.heal },
        ]);
        await this.wait(BATTLE_PACING.hit);
        return;
      }
      case 'phase': {
        this.catchUp(event);
        const figure = this.figure(event.fighter);
        this.cameras.main.shake(BATTLE_PACING.hit, 0.004);
        await this.flash(figure, COLOURS.alert, 3);
        return;
      }
      case 'asleep': {
        const figure = this.figure(event.fighter);
        this.pop(figure, [{ text: BATTLE_TEXT.pop.asleep, tint: COLOURS.dim }]);
        await this.wait(BATTLE_PACING.pop / 2);
        return;
      }
      case 'flee':
        await this.showFlee(event.escaped);
        return;
    }
  }

  /** Someone's turn starts: a party member steps forward, ready to act. */
  private async turnStarts(id: FighterId): Promise<void> {
    const figure = this.figure(id);
    this.turnOf = id;
    this.panels?.showStatus(this.view, id);
    if (figure.side !== 'party' || this.down(id)) return;
    this.forward = id;
    const { x, y } = figure.home;
    await this.walk(figure, x - BATTLE_LAYOUT.stepForward, y, BATTLE_PACING.step);
  }

  /** Whoever stepped forward for their turn goes back to their place. */
  private async stepBack(): Promise<void> {
    const id = this.forward;
    this.forward = null;
    if (id === null || this.down(id)) return;
    const figure = this.figure(id);
    await this.walk(figure, figure.home.x, figure.home.y, BATTLE_PACING.step);
    figure.sprite.setFrame(BATTLE_POSES.stand);
  }

  /** The actor goes at it: a lunge at what they hit, or a gesture for a skill or item. */
  private async showAction(event: ActionEvent): Promise<void> {
    this.acting = event;
    const { action, targets } = event;
    const actor = this.figure(event.actor);
    const { skills, items } = this.current().rules;
    switch (action.type) {
      case 'attack':
        await this.lunge(actor, targets[0]);
        return;
      case 'skill': {
        const skill = skills[action.skill];
        this.panels?.banner(skill?.name ?? null);
        if (skill?.kind === 'physical') await this.lunge(actor, targets[0]);
        else await this.gesture(actor);
        return;
      }
      case 'item':
        this.panels?.banner(items[action.item]?.name ?? null);
        await this.gesture(actor);
        return;
      case 'telegraph': {
        const target = action.target === undefined ? undefined : this.nameOf(action.target);
        const skill = skills[action.skill]?.name ?? action.skill;
        this.panels?.banner(BATTLE_TEXT.readies(this.nameOf(event.actor), skill, target));
        await this.flash(actor, COLOURS.alert, 2);
        await this.wait(BATTLE_PACING.banner);
        return;
      }
      case 'guard':
      case 'flee':
        return;
    }
  }

  private async showDamage(event: Extract<BattleEvent, { type: 'damage' }>): Promise<void> {
    const figure = this.figure(event.target);
    if (event.cause === 'poison') {
      this.catchUp(event);
      void this.flash(figure, COLOURS.poison, 1);
      this.pop(figure, [{ text: String(event.amount), tint: COLOURS.poison }]);
      await this.wait(BATTLE_PACING.hit);
      return;
    }
    void this.effect(figure, this.hitEffectOf(event.element));
    await this.wait(BATTLE_PACING.hit / 3);
    this.catchUp(event);
    const words: { text: string; tint: number }[] = [];
    if (event.critical) words.push({ text: BATTLE_TEXT.pop.critical, tint: COLOURS.critical });
    const reaction = event.reaction;
    if (reaction === 'weak') words.push({ text: BATTLE_TEXT.pop.weak, tint: COLOURS.word });
    if (reaction === 'resist') words.push({ text: BATTLE_TEXT.pop.resist, tint: COLOURS.dim });
    if (reaction === 'immune') words.push({ text: BATTLE_TEXT.pop.immune, tint: COLOURS.dim });
    const tint = event.critical ? COLOURS.critical : COLOURS.damage;
    this.pop(figure, [...words, { text: String(event.amount), tint }]);
    if (event.amount > 0) {
      void this.flash(figure, 0xffffff, 1);
      if (event.critical) this.cameras.main.shake(BATTLE_PACING.lunge, 0.003);
      await this.shake(figure);
    }
    await this.wait(BATTLE_PACING.hit / 2);
  }

  private async showHeal(event: Extract<BattleEvent, { type: 'heal' }>): Promise<void> {
    const figure = this.figure(event.target);
    const words: { text: string; tint: number }[] = [];
    if (event.cause === 'absorb') {
      void this.effect(figure, this.hitEffectOf(this.hitElement()));
      words.push({ text: BATTLE_TEXT.pop.absorb, tint: COLOURS.heal });
    } else if (event.cause !== 'regen') {
      void this.effect(figure, HEAL_EFFECT);
    }
    await this.wait(BATTLE_PACING.hit / 3);
    this.catchUp(event);
    this.pop(figure, [...words, { text: String(event.amount), tint: COLOURS.heal }]);
    await this.wait(BATTLE_PACING.hit);
  }

  private async showStatus(event: Extract<BattleEvent, { type: 'status-added' }>): Promise<void> {
    this.catchUp(event);
    const figure = this.figure(event.target);
    if (event.status === 'guard') {
      await this.effect(figure, GUARD_EFFECT);
      return;
    }
    const helpful = isHelpful(event.status);
    void this.effect(figure, helpful ? HEAL_EFFECT : AILMENT_EFFECT);
    const tint = helpful ? COLOURS.helpful : COLOURS.harmful;
    this.pop(figure, [{ text: BATTLE_TEXT.statuses[event.status].name, tint }]);
    await this.wait(BATTLE_PACING.hit);
  }

  /** Insight shows what an enemy is weak to; a hit's own reveal shows in the words it pops. */
  private async showReveal(event: Extract<BattleEvent, { type: 'reveal' }>): Promise<void> {
    if (event.elements.length < 2) return;
    const fighter = fighterOf(this.current(), event.target);
    const weak = event.elements
      .filter((element) => fighter.reactions[element] === 'weak')
      .map((element) => BATTLE_TEXT.elements[element]);
    this.panels?.banner(BATTLE_TEXT.weakTo(fighter.name, weak));
    await this.wait(BATTLE_PACING.banner);
  }

  /** The party runs off to the right, in a puff of smoke; or, failing, says so. */
  private async showFlee(escaped: boolean): Promise<void> {
    if (!escaped) {
      this.panels?.banner(BATTLE_TEXT.cantGetAway);
      await this.wait(BATTLE_PACING.banner);
      return;
    }
    this.panels?.banner(BATTLE_TEXT.gotAway);
    const runners = this.standing('party');
    await Promise.all(
      runners.map(async (figure) => {
        figure.sprite.play(this.walkAnim(figure, 'run'));
        void this.effect(figure, SMOKE_EFFECT);
        await this.tweenTo(figure, BATTLE_WIDTH + 16, figure.sprite.y, BATTLE_PACING.banner / 2);
        figure.sprite.stop();
      }),
    );
  }

  // Animations: each resolves once it's done.

  /** A lunge: a party member strides at the enemy, an enemy springs at the party and back. */
  private async lunge(figure: Figure, targetId: FighterId | undefined): Promise<void> {
    const { sprite } = figure;
    if (figure.side === 'party') {
      await this.walk(figure, sprite.x - LUNGE.party, sprite.y, BATTLE_PACING.lunge);
      sprite.setFrame(BATTLE_POSES.strike);
      return;
    }
    const target = targetId === undefined ? undefined : this.figures.get(targetId);
    const toward = target && target.x < sprite.x ? -1 : 1;
    void this.flash(figure, 0xffffff, 1);
    const { x, y } = figure.home;
    await this.tweenTo(figure, x + toward * LUNGE.enemies, y, BATTLE_PACING.lunge);
    void this.tweenTo(figure, x, y, BATTLE_PACING.lunge);
  }

  /** Using a skill or item: a party member holds it up; an enemy glows. */
  private async gesture(figure: Figure): Promise<void> {
    if (figure.side === 'party') {
      figure.sprite.setFrame(BATTLE_POSES.use);
      await this.wait(BATTLE_PACING.lunge);
      return;
    }
    await this.flash(figure, 0xffffff, 1);
  }

  // Whoever's hit is back in their place, so they shudder, dodge and stagger from there.

  /** Steps a little aside from a hit that misses, and back. */
  private async dodge(figure: Figure): Promise<void> {
    const away = figure.side === 'party' ? SHAKE * 2 : -SHAKE * 2;
    const { x, y } = figure.home;
    await this.tweenTo(figure, x + away, y, BATTLE_PACING.lunge / 2);
    await this.tweenTo(figure, x, y, BATTLE_PACING.lunge / 2);
  }

  /** A shudder from a hit. */
  private async shake(figure: Figure): Promise<void> {
    const { x, y } = figure.home;
    for (const offset of [SHAKE, -SHAKE, SHAKE / 2, 0]) {
      await this.tweenTo(figure, x + offset, y, BATTLE_PACING.hit / 8);
    }
  }

  /** Knocked back in line: pushed away from the other side, and slowly back. */
  private async knockBack(figure: Figure): Promise<void> {
    const away = figure.side === 'enemies' ? -KNOCK : KNOCK;
    const { x, y } = figure.home;
    await this.tweenTo(figure, x + away, y, BATTLE_PACING.lunge, 'Cubic.easeOut');
    await this.wait(BATTLE_PACING.hit / 2);
    void this.tweenTo(figure, x, y, BATTLE_PACING.hit, 'Sine.easeInOut');
  }

  /** Out of HP: a party member drops where they stand; an enemy flashes and fades away. */
  private async fall(figure: Figure): Promise<void> {
    const { sprite, shadow } = figure;
    if (this.forward === figure.id) this.forward = null;
    if (figure.side === 'party') {
      sprite.stop();
      figure.place(figure.home.x, figure.home.y);
      sprite.setFrame(BATTLE_POSES.down);
      this.untint(figure);
      await this.wait(BATTLE_PACING.ko / 2);
      return;
    }
    await this.flash(figure, 0xffffff, 2);
    await this.tween({
      targets: [sprite, shadow],
      alpha: 0,
      duration: BATTLE_PACING.ko,
    });
  }

  /** Back up: a party member stands again. */
  private rise(figure: Figure): void {
    const { sprite, shadow } = figure;
    this.untint(figure);
    sprite.setAlpha(1);
    shadow.setAlpha(1);
    if (figure.side === 'party') sprite.setFrame(BATTLE_POSES.stand);
  }

  /** The party, having won, leaps for joy. */
  private cheer(figure: Figure): void {
    const { sprite } = figure;
    figure.place(figure.home.x, figure.home.y);
    sprite.setFrame(BATTLE_POSES.leap);
    this.tweens.add({
      targets: sprite,
      y: figure.home.y - 4,
      duration: BATTLE_PACING.step,
      yoyo: true,
      repeat: -1,
      repeatDelay: BATTLE_PACING.step,
      onUpdate: () => figure.shadow.setPosition(sprite.x, figure.home.y - 1),
    });
  }

  /** Flashes a fighter in a colour, `times` times. */
  private async flash(figure: Figure, colour: number, times: number): Promise<void> {
    for (let flash = 0; flash < times; flash++) {
      figure.sprite.setTint(colour).setTintMode(Phaser.TintModes.FILL);
      await this.wait(BATTLE_PACING.hit / 6);
      this.untint(figure);
      await this.wait(BATTLE_PACING.hit / 8);
    }
  }

  /** Takes a flash's tint off: a party member who's down stays greyed out. */
  private untint(figure: Figure): void {
    figure.sprite.clearTint();
    if (figure.side === 'party' && this.down(figure.id)) figure.sprite.setTint(COLOURS.down);
  }

  /** Plays an effect over a fighter, once through. Resolves as it ends. */
  private effect(figure: Figure, effect: Effect): Promise<void> {
    const { x, y } = figure.middle;
    const sprite = this.add.sprite(x, y, effect.key).setDepth(DEPTH.effects);
    if (effect.tint !== undefined) sprite.setTint(effect.tint);
    return new Promise((resolve) => {
      sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        sprite.destroy();
        resolve();
      });
      sprite.play(this.effectAnim(effect.key));
    });
  }

  /**
   * Words and numbers rising over a fighter and fading: the last of `lines` lowest, and each new
   * lot above any still rising.
   */
  private pop(figure: Figure, lines: readonly { text: string; tint: number }[]): void {
    const base = figure.popAt - figure.pops * POP_GAP;
    figure.pops += lines.length;
    lines.forEach(({ text, tint }, index) => {
      const y = base - (lines.length - 1 - index) * POP_GAP;
      const outline = this.add.bitmapText(1, 1, FONT.body, text).setTint(COLOURS.outline);
      const word = this.add.bitmapText(0, 0, FONT.body, text).setTint(tint);
      outline.setOrigin(0.5, 1);
      word.setOrigin(0.5, 1);
      const container = this.add.container(Math.round(figure.x), y, [outline, word]);
      container.setDepth(DEPTH.pops);
      this.tweens.add({
        targets: container,
        y: y - POP_RISE,
        duration: BATTLE_PACING.pop,
        ease: 'Cubic.easeOut',
      });
      this.tweens.add({
        targets: container,
        alpha: 0,
        delay: BATTLE_PACING.pop * 0.7,
        duration: BATTLE_PACING.pop * 0.3,
        onComplete: () => {
          container.destroy();
          figure.pops = Math.max(0, figure.pops - 1);
        },
      });
      this.popped.push(text);
    });
    this.popped = this.popped.slice(-40);
  }

  /** Walks a party member to (x, y) in their walk cycle, facing the enemies. */
  private async walk(figure: Figure, x: number, y: number, ms: number): Promise<void> {
    const { sprite } = figure;
    sprite.play(this.walkAnim(figure, 'walk'));
    await this.tweenTo(figure, x, y, ms);
    sprite.stop();
    sprite.setFrame(BATTLE_POSES.stand);
  }

  /** Moves a fighter's feet to (x, y), shadow and all, from wherever an earlier move had got to. */
  private tweenTo(figure: Figure, x: number, y: number, ms: number, ease = 'Sine.easeOut') {
    const { sprite } = figure;
    this.tweens.killTweensOf(sprite);
    return this.tween({
      targets: sprite,
      x,
      y,
      duration: ms,
      ease,
      onUpdate: () => figure.place(sprite.x, sprite.y),
    });
  }

  private tween(config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((resolve) => {
      this.tweens.add({ ...config, onComplete: () => resolve() });
    });
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.time.delayedCall(ms, () => resolve());
    });
  }

  // Setting the stage.

  private drawBackdrop(id: string): void {
    const backdrop = Object.hasOwn(BACKDROPS, id) ? BACKDROPS[id] : undefined;
    if (!backdrop) throw new Error(`There's no backdrop called ${id}`);
    createTilemap(this, compileBackdrop(id, backdrop, MAP_CONTENT));
  }

  /** Puts everyone in their places: the enemies on the left, the party on the right. */
  private placeFighters(battle: BattleState): void {
    const sides: [Side, Point[]][] = [
      ['party', partySpots(battle.fighters.filter((f) => f.side === 'party').length)],
      ['enemies', enemySpots(battle.fighters.filter((f) => f.side === 'enemies').length)],
    ];
    for (const [side, spots] of sides) {
      for (const fighter of battle.fighters.filter((each) => each.side === side)) {
        const home = spots[fighter.slot];
        if (!home) continue;
        const key = sheetOf(fighter);
        const sprite = this.add.sprite(home.x, home.y, key).setOrigin(0.5, 1);
        if (side === 'party') sprite.setFrame(BATTLE_POSES.stand);
        else sprite.play(this.idleAnim(key));
        const shadow = this.add.image(home.x, home.y, 'sprite.shadow').setDepth(DEPTH.shadows);
        shadow.setScale(Math.max(1, Math.round(Math.min(sprite.width, sprite.height) / 16)), 1);
        const figure = new Figure(fighter.id, side, sprite, shadow, home);
        figure.place(home.x, home.y);
        this.figures.set(fighter.id, figure);
      }
    }
  }

  /** An enemy's idle loop: every frame of its sheet, round and round. */
  private idleAnim(key: string): string {
    const anim = `battle-idle:${key}`;
    if (!this.anims.exists(anim)) {
      this.anims.create({
        key: anim,
        frames: this.anims.generateFrameNumbers(key),
        frameRate: IDLE_FPS,
        repeat: -1,
      });
    }
    return anim;
  }

  /** A party member's walk cycle, towards the enemies or running away from them. */
  private walkAnim(figure: Figure, way: 'walk' | 'run'): string {
    const key = figure.sprite.texture.key;
    const anim = `battle-${way}:${key}`;
    if (!this.anims.exists(anim)) {
      this.anims.create({
        key: anim,
        frames: this.anims.generateFrameNumbers(key, { frames: [...BATTLE_POSES[way]] }),
        frameRate: WALK_FPS,
        repeat: -1,
      });
    }
    return anim;
  }

  /** An effect, once through. */
  private effectAnim(key: string): string {
    const anim = `battle-fx:${key}`;
    if (!this.anims.exists(anim)) {
      this.anims.create({
        key: anim,
        frames: this.anims.generateFrameNumbers(key),
        frameRate: EFFECT_FPS,
      });
    }
    return anim;
  }

  // The menu and the marks over fighters.

  /**
   * Shows the menu, or with null, puts it away. The timeline previews what's under the cursor, and
   * highlights the turns it changes.
   */
  private showMenu(menu: BattleMenu | null): void {
    this.menu = menu;
    this.panels?.showMenu(menu);
    if (!menu) {
      this.panels?.banner(null);
      return;
    }
    const battle = this.current();
    this.panels?.banner(helpLine(menu, battle));
    const preview = timelineOf(battle, previewAction(menu, battle));
    this.strip?.show(preview, { changed: changedSlots(timelineOf(battle), preview) });
  }

  /** The ▼ bobbing over whoever the menu aims at, and a ! over whoever has telegraphed. */
  private drawMarks(): void {
    const marks = this.marks;
    if (!marks) return;
    marks.clear();
    const bob = Math.round(Math.sin(this.time.now / 120));
    for (const id of this.menu ? aimedAt(this.menu) : []) {
      const figure = this.figures.get(id);
      if (!figure) continue;
      const x = Math.round(figure.x);
      const y = figure.top - 3 + bob;
      marks.fillStyle(COLOURS.outline).fillTriangle(x - 4, y - 4, x + 4, y - 4, x, y + 1);
      marks.fillStyle(COLOURS.marker).fillTriangle(x - 3, y - 3.5, x + 3, y - 3.5, x, y);
    }
    for (const fighter of this.view) {
      const alert = this.alertFor(fighter.id);
      const figure = this.figures.get(fighter.id);
      if (!alert || !figure) continue;
      // Over their head, or over a big one's face, below the banner.
      const { banner } = BATTLE_LAYOUT;
      alert.setVisible(fighter.telegraph !== null);
      alert.setPosition(
        Math.round(figure.x),
        Math.max(figure.top - 2, banner.y + banner.height + 9) + bob,
      );
    }
  }

  private alertFor(id: FighterId): Phaser.GameObjects.BitmapText | undefined {
    const existing = this.alerts.get(id);
    if (existing) return existing;
    if (fighterView(this.view, id).side !== 'enemies') return undefined;
    const alert = this.add
      .bitmapText(0, 0, FONT.body, '!')
      .setOrigin(0.5, 1)
      .setTint(COLOURS.alert)
      .setDepth(DEPTH.marks)
      .setVisible(false);
    this.alerts.set(id, alert);
    return alert;
  }

  // Small helpers.

  /** Brings the screen up to an event: HP, MP and statuses in the panels, and telegraphs. */
  private catchUp(event: BattleEvent): void {
    this.view = applyEvent(this.view, event);
    this.panels?.showStatus(this.view, this.turnOf);
  }

  private hitEffectOf(element: Parameters<typeof hitEffect>[0]): Effect {
    const acting = this.acting;
    const from = acting ? fighterView(this.view, acting.actor).side : 'enemies';
    return hitEffect(element, from, this.hitKind());
  }

  /** Whether the action playing out hits with steel or with magic. */
  private hitKind(): 'physical' | 'magical' {
    const action = this.acting?.action;
    if (action?.type !== 'skill') return 'physical';
    return this.current().rules.skills[action.skill]?.kind === 'magical' ? 'magical' : 'physical';
  }

  /** The element of the action playing out's own hit, for one an enemy absorbs. */
  private hitElement(): Parameters<typeof hitEffect>[0] {
    const action = this.acting?.action;
    if (action?.type === 'skill') {
      const skill = this.current().rules.skills[action.skill];
      return skill && 'element' in skill ? skill.element : undefined;
    }
    if (action?.type === 'item') {
      const item = this.current().rules.items[action.item];
      if (item?.kind !== 'consumable') return undefined;
      return item.effects.find((effect) => effect.type === 'damage')?.element;
    }
    if (action?.type === 'attack' && this.acting) {
      return fighterOf(this.current(), this.acting.actor).attackElement;
    }
    return undefined;
  }

  private selectedLabel(menu: BattleMenu): string | null {
    switch (menu.page) {
      case 'commands':
        return menu.commands[menu.cursor.commands]?.label ?? null;
      case 'skills':
      case 'items':
        return menu[menu.page][menu.cursor[menu.page]]?.label ?? null;
      case 'target':
        return helpLine(menu, this.current());
    }
  }

  private figure(id: FighterId): Figure {
    const figure = this.figures.get(id);
    if (!figure) throw new Error(`There's nobody called ${id} on the battle screen`);
    return figure;
  }

  private standing(side: Side): Figure[] {
    return this.view
      .filter((fighter) => fighter.side === side && fighter.hp > 0)
      .map((fighter) => this.figure(fighter.id));
  }

  private down(id: FighterId): boolean {
    return fighterView(this.view, id).hp === 0;
  }

  private nameOf(id: FighterId): string {
    return fighterView(this.view, id).name;
  }

  private current(): BattleState {
    if (!this.battle) throw new Error('The battle scene has no battle');
    return this.battle;
  }

  /** Whether this run of the scene is still going: false once it has stopped or started again. */
  private live(run: number): boolean {
    return run === this.run;
  }
}

/** The sheet a fighter fights as: a party member's field sprite, or an enemy's monster. */
const sheetOf = (fighter: Fighter): string =>
  fighter.side === 'party' ? `sprite.${fighter.kind}` : `monster.${fighter.kind}`;

/** Who's who on the timeline: everyone's icon, and the letters that tell enemies of a kind apart. */
function timelineFigures(battle: BattleState): TimelineFigure[] {
  return battle.fighters.map((fighter) => {
    const sheet = sheetOf(fighter);
    const entry: AssetEntry | undefined = (ASSETS as Record<string, AssetEntry>)[sheet];
    return {
      id: fighter.id,
      side: fighter.side,
      sheet,
      face: entry?.type === 'spritesheet' ? entry.icon : undefined,
      letter: letterOf(battle, fighter.id),
    };
  });
}

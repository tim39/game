import Phaser from 'phaser';
import { chestScript } from '../core/chest';
import { DIRECTIONS, STEP, directionTowards, isDirection, type Direction } from '../core/direction';
import { MAX_ENEMIES, type BattleSetup } from '../core/battle/battle';
import { battleDue, countStep, encounterCountdown, rollEncounter } from '../core/encounters';
import { PLAYER, type BattleEnd, type EventContext, type EventScript } from '../core/events';
import {
  autoTrigger,
  chestAt,
  compileMap,
  enterTrigger,
  exitAt,
  isBlocked,
  isOutOfBounds,
  mapFlags,
  mapLook,
  moodFlags,
  npcsAbout,
  scriptAt,
  sideOf,
  touchAt,
  type ChestPlacement,
  type CompiledMap,
  type LayerName,
  type MapLook,
  type Spawn,
  type Trigger,
} from '../core/map/compile';
import type { WarpTarget } from '../core/map/types';
import { createNpc, lookAt, updateNpc, type Npc } from '../core/npc';
import { Rng } from '../core/rng';
import { walkRoute, type RouteWalk } from '../core/route';
import { createScriptContext, type Stage } from '../core/script-context';
import { addPlayTime, hasFlag, setLocation } from '../core/state';
import {
  facingCell,
  occupies,
  standingWalker,
  updateWalker,
  walkerPosition,
  type Walker,
  type WalkWorld,
} from '../core/walker';
import {
  AREA_BANNER_MS,
  ENCOUNTER_TUNING,
  FIELD_SPEEDS,
  LEAVE_FADE_MS,
  MAP_FADE_MS,
  NPC_TUNING,
} from '../data/balance';
import { BACKDROPS } from '../data/backdrops';
import { DB } from '../data/db';
import { ENCOUNTERS } from '../data/encounters';
import { EVENTS } from '../data/events';
import { MAPS } from '../data/maps';
import { SPEAKERS } from '../data/speakers';
import { MAP_CONTENT } from '../data/terrain';
import { CHEST_TEXT } from '../data/ui-text';
import { audio } from '../systems/audio';
import { cameraBounds } from '../systems/camera';
import { characterFrame, sheetRows } from '../systems/character-frames';
import { CollisionView } from '../systems/collision-view';
import { debugSwitches } from '../systems/debug-switches';
import { encounters } from '../systems/encounters';
import { input } from '../systems/input/game-input';
import { saveSlots } from '../systems/saves';
import { session } from '../systems/session';
import { settings } from '../systems/settings';
import { DEPTH, TILE, createTilemap, driftMist, mistMap, shadeMap } from '../systems/tilemap';
import { bannerOnArrival } from '../ui/area-banner';
import { showAreaBanner, type AreaBannerBox } from '../ui/area-banner-box';
import { playBattleTransition } from '../ui/battle-transition';
import type { DialogueLine } from '../ui/dialogue-box';
import { MAX_CHOICES } from '../ui/dialogue-layout';
import { BATTLE_SCENE, battleMusic, type BattleStart } from './battle';
import type { DialogueRequest } from './dialogue';
import { MAIN_MENU_SCENE, type MainMenuStart } from './main-menu';
import { PICTURE_SCENE, type PictureScene } from './picture';
import { SHOP_SCENE, type ShopStart } from './shop';

/**
 * Where to put the player, `scene.start('field', start)`: a cell, or one of the map's spawns. With
 * `dark`, the map starts black, for a script that will fade it in (see `teleport`). With
 * `autosave`, it's a map change, which saves the game in the autosave slot on arrival.
 */
export type FieldStart = {
  readonly map: string;
  readonly dark?: boolean;
  readonly autosave?: boolean;
} & (
  | { readonly x: number; readonly y: number; readonly facing?: Direction }
  | { readonly spawn: string }
);

/** The world is drawn at 2×, so the view is 20 by 11¼ tiles. */
const WORLD_ZOOM = 2;

/** A frame longer than this (say, after the tab was hidden) counts as this long, so nobody teleports. */
const MAX_FRAME_MS = 100;

const PLAYER_SPRITE = 'sprite.rowan';

/** A chest's sprite sheet: shut, then open. Its frames are shorter than a tile. */
const CHEST_SPRITE = 'object.chest';
const CHEST_FRAME = { shut: 0, open: 1 } as const;
/** Plays as a chest opens. */
const CHEST_SOUND = 'sfx.chest';
/** A battle coming, as the field breaks up for it. */
const ENCOUNTER_SOUND = 'sfx.encounter';

/** A character on screen: their sprite, and how many rows their sheet has. */
interface Figure {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly rows: number;
}

interface NpcOnMap extends Figure {
  npc: Npc;
}

/** A chest on screen, shut or open as its flag says. */
interface ChestOnMap {
  readonly chest: ChestPlacement;
  readonly sprite: Phaser.GameObjects.Sprite;
}

/** Someone a script is walking along a route, and the promise to keep once they're there. */
interface ScriptedWalk {
  walk: RouteWalk;
  readonly arrived: () => void;
  readonly blocked: (error: Error) => void;
}

/** How fast NPCs walk when a script walks them, as when they wander. */
const NPC_SPEEDS = { walkMs: NPC_TUNING.stepMs, runMs: NPC_TUNING.stepMs };

function spawnOn(map: CompiledMap, id: string): Spawn {
  const spawn = map.spawns[id];
  if (!spawn) throw new Error(`Map ${map.id} has no spawn called ${id}`);
  return spawn;
}

/** Walking around a map, with the people on it. */
export class FieldScene extends Phaser.Scene {
  private map?: CompiledMap;
  private world?: WalkWorld;
  private player?: Figure;
  private layers?: Record<LayerName, Phaser.Tilemaps.TilemapLayer>;
  private overhead?: Phaser.Tilemaps.TilemapLayer;
  /** How the map sounds and looks now: its music on arrival, its shade and its mist. */
  private look?: MapLook;
  private shade?: Phaser.GameObjects.Rectangle;
  private mist?: Phaser.GameObjects.TileSprite;
  /** The flags the map's terrain, prefabs and moods change with (see `mapFlags`, `moodFlags`). */
  private flags: readonly string[] = [];
  /** Which of them were set when the map was last drawn, to tell when to draw it afresh. */
  private drawnWith = '';
  private walker: Walker = standingWalker(0, 0);
  private npcs: NpcOnMap[] = [];
  private chests: ChestOnMap[] = [];
  /** Where the NPCs' wandering comes from. */
  private rng = Rng.fromSeed(0);
  /** The direction pressed most recently, which wins while several are held. */
  private lastDirection: Direction | null = null;
  /** A direction tapped during a step, taken when the step ends if nothing is held by then. */
  private buffered: Direction | null = null;
  /** Set once the player steps into a way out: the screen fades and the controls stop. */
  private leaving = false;
  /** The event script running, if any: until it ends, the player can't move and nobody wanders. */
  private script: { readonly id: string } | null = null;
  /** People the script is walking somewhere, by who they are (`player`, or an NPC's ID). */
  private walks = new Map<string, ScriptedWalk>();
  /** Set while a script has faded the screen to black. */
  private dark = false;
  /** Keeps a script's teleport promise once the player arrives. */
  private arrival?: () => void;
  /** A script brought the player to this map: its enter script runs once that one ends. */
  private enterPending = false;
  /** A script brought the player to this map: the autosave waits for it to end. */
  private autosavePending = false;
  /** Menu was pressed: the main menu opens once the player stands still. */
  private menuPending = false;
  /** Auto scripts that have run since the player arrived. */
  private autosRun = new Set<Trigger>();
  /** The player's step count when they last came to a stop, to tell when they stop somewhere new. */
  private stoppedAt = 0;
  /** Marks which cells block the way, while the debug switch for it is on. */
  private collisionView?: CollisionView;
  /** A random battle is on its way, or under way: until it's over, the field stands still. */
  private encountering = false;
  /** The screen is breaking up into a battle, which hasn't started yet. */
  private transitioning = false;
  /** What covers the field as a battle starts, until it's over. */
  private curtain?: Phaser.GameObjects.Graphics;
  /** The area banner, naming the area the player has arrived in. */
  private banner?: AreaBannerBox;
  /** A script brought the player to a new area: the banner naming it waits for the script to end. */
  private bannerPending: string | null = null;

  constructor() {
    super('field');
  }

  create(start: FieldStart): void {
    const def = MAPS[start.map];
    if (!def) throw new Error(`There's no map called ${start.map}`);
    // A script's teleport carries on here. Any other start leaves whatever was running behind.
    const arrival = this.arrival;
    this.arrival = undefined;
    if (!arrival) {
      this.script = null;
      // And any picture it left up.
      this.pictures()?.clear();
    }
    this.stopWalks();
    // The map left, on a map change; any other start (a new game, a load) has none.
    const left = start.autosave ? this.map?.id : undefined;
    // The last map's layers, shade, mist and collision view went with it, as the scene started over.
    this.layers = undefined;
    this.look = undefined;
    this.shade = undefined;
    this.mist = undefined;
    this.collisionView = undefined;
    this.flags = [...new Set([...mapFlags(def), ...moodFlags(def)])];
    const map = this.draw(compileMap(def, MAP_CONTENT, isSet));
    const look = mapLook(def, isSet);
    this.showLook(map, look);
    // The same music as the last map's plays on.
    audio.playMusic(look.music);
    this.rng = Rng.fromSeed(`field:${map.id}`);
    // Who's about follows the story, as it is on arrival.
    this.npcs = npcsAbout(map, session.state).map((placement) => ({
      npc: createNpc(placement, this.rng, NPC_TUNING),
      ...this.figure(`sprite.${placement.sprite}`),
    }));
    // A chest stands on the bottom of its cell, sorted with the characters as they are by height.
    this.chests = map.chests.map((chest) => ({
      chest,
      sprite: this.add
        .sprite(chest.x * TILE + TILE / 2, (chest.y + 1) * TILE, CHEST_SPRITE, chestFrame(chest))
        .setOrigin(0.5, 1)
        .setDepth(DEPTH.characters + (chest.y * TILE) / 100_000),
    }));
    const at = 'spawn' in start ? spawnOn(map, start.spawn) : start;
    this.walker = standingWalker(at.x, at.y, at.facing);
    this.trackLocation(map);
    this.lastDirection = null;
    this.buffered = null;
    this.leaving = false;
    // Arriving doesn't count as stopping on a touch.
    this.stoppedAt = this.walker.steps;
    this.autosRun = new Set();
    // Any battle on the way went with the last map.
    this.encountering = false;
    this.transitioning = false;
    this.curtain = undefined;
    // Left as a battle comes (a debug warp, say), the battle's music gives way to what it paused.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.transitioning) audio.resumeMusic();
      this.transitioning = false;
    });
    const player = this.figure(PLAYER_SPRITE);
    this.player = player;
    this.drawFigures();

    const camera = this.cameras.main.setZoom(WORLD_ZOOM);
    const bounds = cameraBounds(
      map.width * TILE,
      map.height * TILE,
      camera.width / WORLD_ZOOM,
      camera.height / WORLD_ZOOM,
    );
    camera.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    camera.startFollow(player.sprite, true);
    this.dark = start.dark ?? false;
    if (this.dark) camera.fade(0, 0, 0, 0, true);
    else camera.fadeIn(MAP_FADE_MS, 0, 0, 0);

    // A map change saves the game, as it is on arrival, before anything the map sets off; if a
    // script brought the player, once it ends, as cutscenes can't be saved halfway through.
    this.autosavePending = start.autosave === true && arrival !== undefined;
    if (start.autosave && !arrival) this.autosave();
    this.menuPending = false;
    // The map's enter script runs on arrival; if a script brought the player, once that ends.
    this.enterPending = arrival !== undefined;
    // Arriving in another area names it; if a script brought the player, once that ends.
    // Starting black (a new game, whose opening fades it in), it waits for that script too.
    this.banner = undefined;
    const banner = bannerOnArrival(MAPS, map.id, left);
    const waits = arrival !== undefined || this.dark;
    this.bannerPending = waits ? banner : null;
    if (!waits && banner !== null) this.showBanner(banner);
    if (!arrival) {
      this.runTrigger(enterTrigger(map, session.state));
      // A map started black for a script to fade in, with no script to, fades in by itself.
      if (this.dark && !this.script) {
        void this.fade('in', MAP_FADE_MS);
        if (banner !== null) this.showBanner(banner);
        this.bannerPending = null;
      }
    } else if (this.dark) arrival();
    else camera.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, () => arrival());
  }

  override update(_time: number, delta: number): void {
    // A flag the map's terrain, prefabs or moods go by has changed (the tide has turned, say): it's
    // drawn afresh, with everyone where they are. Its music waits for the next arrival.
    if (this.map && this.flagsSet() !== this.drawnWith) {
      const def = MAPS[this.map.id];
      if (def) this.showLook(this.draw(compileMap(def, MAP_CONTENT, isSet)), mapLook(def, isSet));
    }
    const { map, world } = this;
    if (!map || !world) return;
    const dt = Math.min(delta, MAX_FRAME_MS);
    if (this.mist) driftMist(this.mist, dt);
    // Play time is real time. Phaser smooths `delta`, and holds it to 1/60 s while the window
    // isn't focused, so it counts the time that really passed instead.
    session.state = addPlayTime(session.state, Math.min(this.game.loop.rawDelta, MAX_FRAME_MS));
    // As a battle comes, everyone stands still.
    if (this.encountering) return;

    // Confirm while standing still talks to whoever is in front, or examines what's there.
    if (!this.leaving && !this.script && !this.walker.step && input.pressed('confirm')) {
      this.interact(map);
    }
    if (this.script) {
      this.walkScripted(map, dt);
      // Where a script walks the player isn't somewhere they stopped by themselves.
      this.stoppedAt = this.walker.steps;
      this.drawFigures();
      this.updateCollisionView(map);
      return;
    }

    // Menu opens the main menu once the player stands still. Pressed mid-step, it lets the step
    // finish and then stops there, as if the direction had been let go.
    if (!this.leaving && input.pressed('menu')) this.menuPending = true;
    // While leaving, the step into the way out finishes, and nothing else happens.
    const still = this.leaving || this.menuPending;
    const pressed = still ? undefined : DIRECTIONS.find((d) => input.pressed(d));
    if (pressed) this.buffered = pressed;
    const direction = still ? null : (this.heldDirection(pressed) ?? this.buffered);
    const before = this.walker;
    this.walker = updateWalker(
      before,
      { direction, run: input.held('run') !== settings.alwaysRun },
      dt,
      world,
      FIELD_SPEEDS,
    );
    // A buffered tap is used up once the walker sets off again or comes to a stop.
    if (!this.walker.step || this.walker.steps !== before.steps) this.buffered = null;
    if (this.walker.steps !== before.steps) {
      const exit = exitAt(map, this.walker.x, this.walker.y);
      if (exit) this.leave(exit);
    }
    // The step into a way out can be off the map, so until they arrive somewhere new, the player
    // is still where they last stood.
    if (!this.leaving) this.trackLocation(map);
    // Each step onto open ground where there are random battles counts down to the next one.
    if (!this.leaving && arrived(before, this.walker)) {
      const { x, y } = arrivedAt(this.walker);
      if (this.countsTowardsBattle(map, x, y)) {
        const rate = settings.encounterRate;
        encounters.countdown = countStep(encounters.countdown, rate, ENCOUNTER_TUNING);
        if (encounters.countdown <= 0 && !this.walker.step) {
          this.encounter(map);
          this.drawFigures();
          return;
        }
      }
    }
    // Stopping somewhere new, on a touch, runs its script.
    if (!this.leaving && !this.walker.step && this.walker.steps !== this.stoppedAt) {
      this.stoppedAt = this.walker.steps;
      this.runTrigger(touchAt(map, this.walker.x, this.walker.y, session.state));
    }

    // Walking into someone makes them turn and look.
    if (direction && !this.walker.step) {
      const [dx, dy] = STEP[direction];
      const bumped = this.npcAt(this.walker.x + dx, this.walker.y + dy);
      if (bumped) bumped.npc = lookAt(bumped.npc, this.walker.x, this.walker.y, NPC_TUNING);
    }

    // NPCs keep to themselves: no walls, ways out, the player, or each other.
    for (const entry of this.npcs) {
      const npcWorld: WalkWorld = {
        isBlocked: (x, y) =>
          isBlocked(map, x, y) ||
          exitAt(map, x, y) !== null ||
          occupies(this.walker, x, y) ||
          this.npcs.some((other) => other !== entry && occupies(other.npc.walker, x, y)),
      };
      entry.npc = updateNpc(entry.npc, dt, npcWorld, this.rng, NPC_TUNING);
    }

    // An auto script runs as soon as its condition holds, with the player standing still.
    if (!this.script && !this.leaving && !this.walker.step) {
      const auto = autoTrigger(map, session.state, this.autosRun);
      if (auto) {
        this.autosRun.add(auto);
        this.run(auto.script);
      }
    }
    // The menu waits for the fade in too. A script or a way out it stopped on goes first.
    if (this.menuPending && !this.walker.step && !this.cameras.main.fadeEffect.isRunning) {
      this.menuPending = false;
      if (!this.script && !this.leaving) this.openMainMenu();
    }
    this.drawFigures();
    this.updateCollisionView(map);
  }

  /** Runs an event script now, as a trigger would: `window.__game.run(id)` in dev and test builds. */
  runScript(id: string): void {
    if (this.script || this.leaving) throw new Error(`Can't run ${id}: the field is busy`);
    this.run(id);
  }

  /** Read by `window.__game.inspect('field')` in dev and test builds. */
  debugInfo(): Record<string, unknown> {
    const { map, world, overhead, player, walker } = this;
    if (!map || !world || !overhead || !player) return {};
    const camera = this.cameras.main;
    const view = camera.worldView;
    const sprite = player.sprite;
    return {
      map: map.id,
      leaving: this.leaving,
      running: this.script !== null,
      script: this.script?.id ?? null,
      dark: this.dark,
      fading: camera.fadeEffect.isRunning,
      banner: this.banner?.showing ? this.banner.name : null,
      picture: this.pictures()?.showing ?? null,
      shade: this.look?.shade ?? null,
      mist: this.mist !== undefined,
      noclip: debugSwitches.noclip,
      collision: this.collisionView?.marked ?? null,
      encounters: map.encounters,
      countdown: encounters.countdown,
      encountering: this.encountering,
      x: walker.x,
      y: walker.y,
      facing: walker.facing,
      moving: walker.step !== null,
      stepMs: walker.step?.duration ?? null,
      frame: Number(sprite.frame.name),
      // The sprite's top-left, in world pixels.
      pixel: { x: sprite.x - TILE / 2, y: sprite.y - TILE / 2 },
      view: { x: view.x, y: view.y, width: view.width, height: view.height },
      size: { width: map.width * TILE, height: map.height * TILE },
      blocked: Object.fromEntries(
        DIRECTIONS.map((d) => [d, world.isBlocked(walker.x + STEP[d][0], walker.y + STEP[d][1])]),
      ),
      // Something on the overhead layer covers the player's cell, drawn over the player.
      underOverhead: overhead.hasTileAt(walker.x, walker.y) && overhead.depth > sprite.depth,
      npcs: this.npcs.map(({ npc }) => ({
        id: npc.placement.id,
        x: npc.walker.x,
        y: npc.walker.y,
        facing: npc.walker.facing,
        moving: npc.walker.step !== null,
        home: { x: npc.placement.x, y: npc.placement.y },
        wander: npc.placement.wander,
      })),
      chests: this.chests.map(({ chest, sprite }) => ({
        x: chest.x,
        y: chest.y,
        flag: chest.flag,
        // As drawn.
        open: Number(sprite.frame.name) === CHEST_FRAME.open,
      })),
    };
  }

  /** Which of the map's flags are set, as a key: `10` for the first set and the second not. */
  private flagsSet(): string {
    return this.flags.map((flag) => (isSet(flag) ? '1' : '0')).join('');
  }

  /**
   * Puts a compiled map on screen in place of the last one, and walks on it: its layers, what blocks
   * the way and where a walk stops. Returns it.
   */
  private draw(map: CompiledMap): CompiledMap {
    this.layers?.ground.tilemap.destroy();
    this.map = map;
    this.layers = createTilemap(this, map);
    this.overhead = this.layers.overhead;
    this.drawnWith = this.flagsSet();
    this.world = {
      // Noclip, a debug switch, walks through walls and people, but not off the map.
      isBlocked: (x, y) =>
        debugSwitches.noclip
          ? isOutOfBounds(map, x, y)
          : isBlocked(map, x, y) || this.npcAt(x, y) !== undefined,
      // A walk stops at a way out, at a touch, which runs its script, and where a battle comes.
      stopsAt: (x, y) =>
        exitAt(map, x, y) !== null ||
        touchAt(map, x, y, session.state) !== null ||
        (this.countsTowardsBattle(map, x, y) &&
          battleDue(encounters.countdown, settings.encounterRate, ENCOUNTER_TUNING)),
    };
    // The collision view marks the cells as they were: it's made afresh.
    this.collisionView?.destroy();
    this.collisionView = undefined;
    return map;
  }

  /**
   * Lays the map's shade and the Gloam's mist over it as its look says, putting away what it no
   * longer has.
   */
  private showLook(map: CompiledMap, look: MapLook): void {
    const was = this.look;
    this.look = look;
    if (was?.shade !== look.shade) {
      this.shade?.destroy();
      this.shade = look.shade === null ? undefined : shadeMap(this, map, look.shade, DEPTH.shade);
    }
    if (look.mist && !this.mist) {
      this.mist = mistMap(this, map, DEPTH.mist);
    } else if (!look.mist && this.mist) {
      this.mist.destroy();
      this.mist = undefined;
    }
  }

  private figure(key: string): Figure {
    const sprite = this.add.sprite(0, 0, key);
    return { sprite, rows: sheetRows(this.textures.get(key).getFrameNames().length) };
  }

  /**
   * Whether stepping onto (x, y) counts towards the next random battle: on a map that has them,
   * but not on a way out or a touch, which have their own business.
   */
  private countsTowardsBattle(map: CompiledMap, x: number, y: number): boolean {
    return (
      map.encounters !== null &&
      exitAt(map, x, y) === null &&
      touchAt(map, x, y, session.state) === null
    );
  }

  /** A random battle from the map's encounter table, with a fresh countdown to the next. */
  private encounter(map: CompiledMap): void {
    const area = map.encounters;
    const table =
      area && Object.hasOwn(ENCOUNTERS, area.table) ? ENCOUNTERS[area.table] : undefined;
    if (!area || !table) return;
    const setup = rollEncounter(table, encounters.rng, ENCOUNTER_TUNING);
    encounters.countdown = encounterCountdown(encounters.rng, ENCOUNTER_TUNING);
    this.fight(map, setup, area.backdrop, () => this.afterBattle(false));
  }

  /**
   * A battle a script fights: it comes as a random battle does, and once it's won or fled the
   * field wakes but stays black, for the script to set the scene, and the promise keeps with how
   * it ended. Lost, it's the Game Over screen, as after any battle.
   */
  private scriptBattle(enemies: readonly string[], backdrop: string): Promise<BattleEnd> {
    const unknown = enemies.find((id) => !Object.hasOwn(DB.enemies, id));
    if (unknown !== undefined) {
      return Promise.reject(new Error(`There's no enemy called ${unknown}`));
    }
    if (enemies.length < 1 || enemies.length > MAX_ENEMIES) {
      return Promise.reject(
        new RangeError(`A battle is against 1 to ${MAX_ENEMIES} enemies, not ${enemies.length}`),
      );
    }
    if (!Object.hasOwn(BACKDROPS, backdrop)) {
      return Promise.reject(new Error(`There's no backdrop called ${backdrop}`));
    }
    const { map } = this;
    if (!map) return Promise.reject(new Error('There is no map to fight on'));
    return new Promise((resolve) => {
      this.fight(map, { enemies }, backdrop, (end) => this.afterBattle(true, () => resolve(end)));
    });
  }

  /**
   * Starts a battle over the field: the battle's music starts, the screen breaks up into black,
   * and the battle starts, while the field sleeps until it's won or fled; then `onEnd`, with how
   * it ended. Lost, the Game Over screen takes over from the battle, and the field sleeps on
   * through any retry, until it's won or fled, or the screen leaves it for good.
   */
  private fight(
    map: CompiledMap,
    setup: BattleSetup,
    backdrop: string,
    onEnd: (end: BattleEnd) => void,
  ): void {
    const seed = encounters.rng.nextUint32();
    // Fought under the field's shade, at night or in the Gloam.
    const shade = this.look?.shade ?? null;
    this.encountering = true;
    this.transitioning = true;
    this.buffered = null;
    this.menuPending = false;
    // A battle cuts the banner short.
    this.banner?.destroy();
    audio.interruptMusic(battleMusic(setup.enemies));
    audio.playSound(ENCOUNTER_SOUND);
    void playBattleTransition(this, DEPTH.transition, !settings.reduceFlashing).then((curtain) => {
      // The field may have started over meanwhile: a debug warp, say.
      if (this.map !== map) {
        curtain.destroy();
        return;
      }
      this.transitioning = false;
      this.curtain = curtain;
      this.scene.launch(BATTLE_SCENE, {
        setup,
        backdrop,
        ...(shade === null ? {} : { shade }),
        seed,
        onEnd: (end) => onEnd(end),
      } satisfies BattleStart);
      this.scene.sleep();
    });
  }

  /**
   * Once a battle is won or fled, the field wakes where it was and fades back in; or, for a
   * script to fade in once it has set the scene, stays black. Then `woken`: not before, as the
   * field only wakes on the next frame, and a script that faded in before then would be left black.
   */
  private afterBattle(dark: boolean, woken?: () => void): void {
    this.events.once(Phaser.Scenes.Events.WAKE, () => {
      this.curtain?.destroy();
      this.curtain = undefined;
      this.encountering = false;
      this.lastDirection = null;
      const camera = this.cameras.main;
      this.dark = dark;
      if (dark) camera.fade(0, 0, 0, 0, true);
      else camera.fadeIn(MAP_FADE_MS, 0, 0, 0);
      woken?.();
    });
    this.scene.wake();
  }

  /** Names the area the player has arrived in, across the top of the screen. */
  private showBanner(name: string): void {
    this.banner?.destroy();
    this.banner = showAreaBanner(this, name, DEPTH.banner, AREA_BANNER_MS);
  }

  /** Saves the game as it is in the autosave slot, which every map change does. */
  private autosave(): void {
    saveSlots.autosave(session.state, new Date());
  }

  /** Opens the main menu over the field, which waits until it closes. */
  private openMainMenu(): void {
    this.buffered = null;
    audio.playMenuSound('confirm');
    this.scene.pause();
    this.scene.launch(MAIN_MENU_SCENE, {
      onClose: () => this.scene.resume(),
    } satisfies MainMenuStart);
  }

  /** Keeps the game state's location up to date with the player's, for saves to keep. */
  private trackLocation(map: CompiledMap): void {
    const { x, y, facing } = this.walker;
    session.state = setLocation(session.state, { map: map.id, x, y, facing });
  }

  /** The NPC taking up (x, y), if any. */
  private npcAt(x: number, y: number): NpcOnMap | undefined {
    return this.npcs.find(({ npc }) => occupies(npc.walker, x, y));
  }

  /**
   * Talks to the NPC in front of the player, who turns to face them, opens the chest there, or else
   * runs the script of whatever is there. Someone partway through a step can't be talked to until
   * they've finished it.
   */
  private interact(map: CompiledMap): void {
    const [x, y] = facingCell(this.walker);
    const someone = this.npcAt(x, y);
    if (someone) {
      if (someone.npc.walker.step) return;
      someone.npc = lookAt(someone.npc, this.walker.x, this.walker.y, NPC_TUNING);
      if (someone.npc.placement.script) this.run(someone.npc.placement.script);
      return;
    }
    // A chest's script is named after its flag, in the debug info.
    const chest = chestAt(map, x, y);
    if (chest) {
      this.start(chest.flag, chestScript(chest, CHEST_TEXT));
      return;
    }
    const script = scriptAt(map, x, y);
    if (script) this.run(script);
  }

  private runTrigger(trigger: Trigger | null): void {
    if (trigger) this.run(trigger.script);
  }

  /** Runs an event script, by its ID. */
  private run(id: string): void {
    const script = EVENTS[id];
    if (!script) {
      console.error(`There's no event script called ${id}`);
      return;
    }
    this.start(id, script);
  }

  /** Starts a script, which `id` names; until it ends the field stands still. */
  private start(id: string, script: EventScript): void {
    const running = { id };
    this.script = running;
    this.menuPending = false;
    void script(this.scriptContext())
      .catch((error: unknown) => console.error(`Event script ${id} failed:`, error))
      .finally(() => {
        // A start somewhere else (a debug warp, say) may have left this script behind.
        if (this.script === running) this.scriptEnded();
      });
  }

  /**
   * Once a script ends, anyone it set walking without waiting stops, the screen comes back if it
   * left it black, and a map it brought the player to names its area, autosaves and runs its enter
   * script.
   */
  private scriptEnded(): void {
    this.script = null;
    this.stopWalks();
    // A picture left up goes with the script.
    if (this.pictures()?.showing) void this.pictures()?.hide();
    if (this.dark) void this.fade('in', MAP_FADE_MS);
    if (this.bannerPending !== null) {
      this.showBanner(this.bannerPending);
      this.bannerPending = null;
    }
    if (this.autosavePending) {
      this.autosavePending = false;
      this.autosave();
    }
    if (this.enterPending && this.map) {
      this.enterPending = false;
      this.runTrigger(enterTrigger(this.map, session.state));
    }
  }

  /** What a script runs against: the stage is this field, and the state is the game being played. */
  private scriptContext(): EventContext {
    // Choices come up under the last line said, which stays on screen while the player picks.
    let lastLine: DialogueLine | undefined;
    const stage: Stage = {
      say: async (speakerId, text) => {
        const speaker = SPEAKERS[speakerId];
        if (!speaker) throw new Error(`There's no speaker called ${speakerId}`);
        lastLine = { ...speaker, text };
        await this.dialogue({ line: lastLine });
      },
      choice: async (options) => {
        if (options.length < 1 || options.length > MAX_CHOICES) {
          throw new RangeError(
            `A choice offers 1 to ${MAX_CHOICES} options, not ${options.length}`,
          );
        }
        const pick = await this.dialogue({ line: lastLine, typed: false, choices: options });
        return pick ?? 0;
      },
      wait: (ms) =>
        new Promise((resolve) => {
          this.time.delayedCall(checkedMs(ms), () => resolve());
        }),
      face: (actor, toward) => Promise.resolve().then(() => this.face(actor, toward)),
      move: (actor, route) => this.walkAlong(actor, route),
      leave: (actor) => this.seeOff(actor),
      fadeOut: (ms = MAP_FADE_MS) => this.fade('out', checkedMs(ms)),
      fadeIn: (ms = MAP_FADE_MS) => this.fade('in', checkedMs(ms)),
      picture: (id) => this.showPicture(id),
      teleport: (map, spawn) => this.teleport(map, spawn),
      shop: (id) =>
        new Promise((resolve) => {
          this.scene.launch(SHOP_SCENE, { shop: id, onClose: () => resolve() } satisfies ShopStart);
        }),
      battle: (enemies, backdrop) => this.scriptBattle(enemies, backdrop),
      jingle: (sound) => this.jingle(sound),
      bgm: (track) => audio.playMusic(track),
      sfx: (sound) => audio.playSound(sound),
    };
    return createScriptContext(
      stage,
      {
        get: () => session.state,
        set: (state) => {
          session.state = state;
        },
      },
      DB,
    );
  }

  /** The NPC on this map a script calls `id`. */
  private npcCalled(id: string): NpcOnMap {
    const entry = this.npcs.find(({ npc }) => npc.placement.id === id);
    if (!entry) throw new Error(`There's no one called ${id} on ${this.map?.id ?? 'this map'}`);
    return entry;
  }

  /** The walker of someone a script names: the player, or an NPC on this map. */
  private walkerOf(actor: string): Walker {
    return actor === PLAYER ? this.walker : this.npcCalled(actor).npc.walker;
  }

  private setWalkerOf(actor: string, walker: Walker): void {
    if (actor === PLAYER) {
      this.walker = walker;
      return;
    }
    const entry = this.npcCalled(actor);
    entry.npc = { ...entry.npc, walker };
  }

  /** Turns someone to face a way, or towards someone else. */
  private face(actor: string, toward: string): void {
    const walker = this.walkerOf(actor);
    let facing: Direction;
    if (isDirection(toward)) facing = toward;
    else {
      const other = this.walkerOf(toward);
      facing = directionTowards(walker.x, walker.y, other.x, other.y);
    }
    this.setWalkerOf(actor, { ...walker, facing });
  }

  /** Walks someone along a route; it resolves once they're there, and fails if they're blocked. */
  private walkAlong(actor: string, route: readonly Direction[]): Promise<void> {
    return new Promise((arrived, blocked) => {
      this.walkerOf(actor);
      const wrong = route.find((step) => !isDirection(step));
      if (wrong !== undefined) throw new Error(`"${String(wrong)}" isn't a direction to step in`);
      if (this.walks.has(actor)) throw new Error(`${actor} is already walking somewhere`);
      this.walks.set(actor, { walk: { route, taken: 0 }, arrived, blocked });
    });
  }

  /**
   * Sees an NPC off: they fade from the map, and resolves once they're gone. They're back on the
   * next arrival, if their condition still holds.
   */
  private seeOff(actor: string): Promise<void> {
    return new Promise((gone) => {
      if (actor === PLAYER) throw new Error("The player can't leave: teleport them instead");
      const entry = this.npcCalled(actor);
      if (this.walks.has(actor)) throw new Error(`${actor} can't leave while walking somewhere`);
      this.tweens.add({
        targets: entry.sprite,
        alpha: 0,
        duration: LEAVE_FADE_MS,
        onComplete: () => {
          this.npcs = this.npcs.filter((other) => other !== entry);
          entry.sprite.destroy();
          gone();
        },
      });
    });
  }

  /** Moves everyone a script is walking on by a frame, and keeps its promises as they arrive. */
  private walkScripted(map: CompiledMap, dt: number): void {
    for (const [actor, scripted] of this.walks) {
      const speeds = actor === PLAYER ? FIELD_SPEEDS : NPC_SPEEDS;
      const world = this.scriptedWorld(map, actor);
      const progress = walkRoute(this.walkerOf(actor), scripted.walk, dt, world, speeds);
      this.setWalkerOf(actor, progress.walker);
      scripted.walk = progress.walk;
      if (progress.status === 'walking') continue;
      this.walks.delete(actor);
      if (progress.status === 'arrived') {
        scripted.arrived();
      } else {
        const { x, y, facing } = progress.walker;
        scripted.blocked(new Error(`${actor} can't step ${facing} from (${x}, ${y})`));
      }
    }
  }

  /** Where a script can walk someone: anywhere on the map that's open and not taken by someone else. */
  private scriptedWorld(map: CompiledMap, actor: string): WalkWorld {
    return {
      isBlocked: (x, y) =>
        sideOf(map, x, y) !== null ||
        isBlocked(map, x, y) ||
        (actor !== PLAYER && occupies(this.walker, x, y)) ||
        this.npcs.some(({ npc }) => npc.placement.id !== actor && occupies(npc.walker, x, y)),
    };
  }

  /** Stops anyone still walking for a script, where they are; their promises resolve. */
  private stopWalks(): void {
    for (const scripted of this.walks.values()) scripted.arrived();
    this.walks.clear();
  }

  /** The picture scene, if it's running: a script's `picture` starts it. */
  private pictures(): PictureScene | undefined {
    return this.scene.isActive(PICTURE_SCENE)
      ? (this.scene.get(PICTURE_SCENE) as PictureScene)
      : undefined;
  }

  /**
   * Shows a picture over the field, or with null takes it away, starting the picture scene the
   * first time; resolves once it has faded in or away.
   */
  private async showPicture(id: string | null): Promise<void> {
    const running = this.pictures();
    const pictures =
      running ??
      (await new Promise<PictureScene>((ready) => {
        const scene = this.scene.get(PICTURE_SCENE) as PictureScene;
        scene.events.once(Phaser.Scenes.Events.CREATE, () => ready(scene));
        this.scene.launch(PICTURE_SCENE);
      }));
    if (id === null) await pictures.hide();
    else await pictures.show(id);
  }

  /** Fades the screen out to black, or back in, and resolves once it's done. */
  private fade(to: 'out' | 'in', ms: number): Promise<void> {
    const camera = this.cameras.main;
    const done =
      to === 'out'
        ? Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE
        : Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE;
    return new Promise((resolve) => {
      this.dark = to === 'out';
      camera.once(done, () => resolve());
      // Forced, in case another fade is running.
      camera.fadeEffect.start(to === 'out', ms, 0, 0, 0, true);
    });
  }

  /**
   * Takes the player to a spawn on a map. Like a door, it fades out and the field starts over
   * there; if a script has the screen black already, it stays black. Resolves once the player
   * has arrived, and the screen has faded back in unless it's staying black.
   */
  private teleport(mapId: string, spawn: string): Promise<void> {
    const there = MAPS[mapId]?.objects?.some((o) => o.type === 'spawn' && o.id === spawn);
    if (!there) return Promise.reject(new Error(`There's no spawn called ${spawn} on ${mapId}`));
    return new Promise((resolve) => {
      this.arrival = resolve;
      const start: FieldStart = { map: mapId, spawn, dark: this.dark, autosave: true };
      if (this.dark) {
        this.scene.restart(start);
        return;
      }
      const camera = this.cameras.main;
      camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.restart(start);
      });
      camera.fade(MAP_FADE_MS, 0, 0, 0, true);
    });
  }

  /**
   * Opens the dialogue box over the field, and resolves once the player is done with it: with the
   * index of the choice they picked, or null for a line they read.
   */
  private dialogue(request: Omit<DialogueRequest, 'onDone'>): Promise<number | null> {
    return new Promise((onDone) => {
      this.scene.launch('dialogue', { ...request, onDone } satisfies DialogueRequest);
    });
  }

  /**
   * Plays a jingle with the music paused, as a battle's music pauses it, and resolves once the
   * jingle is over and the music is coming back.
   */
  private jingle(sound: string): Promise<void> {
    audio.interruptMusic(null);
    audio.playSound(sound);
    return new Promise((resolve) => {
      this.time.delayedCall(audio.soundLength(sound), () => {
        audio.resumeMusic();
        resolve();
      });
    });
  }

  /** Fades out while the step into the way out finishes, then starts the field over there. */
  private leave(to: WarpTarget): void {
    this.leaving = true;
    const camera = this.cameras.main;
    camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.restart({ map: to.map, spawn: to.spawn, autosave: true } satisfies FieldStart);
    });
    // Forced, in case the fade in from arriving is still running.
    camera.fade(MAP_FADE_MS, 0, 0, 0, true);
  }

  /** The direction held: the most recently pressed one while it's held, else any held one. */
  private heldDirection(pressed: Direction | undefined): Direction | null {
    if (pressed) this.lastDirection = pressed;
    if (this.lastDirection && input.held(this.lastDirection)) return this.lastDirection;
    this.lastDirection = DIRECTIONS.find((direction) => input.held(direction)) ?? null;
    return this.lastDirection;
  }

  /**
   * Draws the characters where they are, and the chests shut or open as their flags say, with a
   * sound as one opens.
   */
  private drawFigures(): void {
    if (this.player) draw(this.player, this.walker);
    for (const { npc, sprite, rows } of this.npcs) draw({ sprite, rows }, npc.walker);
    for (const { chest, sprite } of this.chests) {
      const frame = chestFrame(chest);
      if (Number(sprite.frame.name) === frame) continue;
      sprite.setFrame(frame);
      if (frame === CHEST_FRAME.open) audio.playSound(CHEST_SOUND);
    }
  }

  /** Shows or hides the collision view as its debug switch says, and keeps up with the people. */
  private updateCollisionView(map: CompiledMap): void {
    if (debugSwitches.showCollision && !this.collisionView) {
      this.collisionView = new CollisionView(this, map);
    } else if (!debugSwitches.showCollision && this.collisionView) {
      this.collisionView.destroy();
      this.collisionView = undefined;
    }
    this.collisionView?.update(this.npcs.map(({ npc }) => npc.walker));
  }
}

/** Whether a walker has finished a step since it was `before`. */
const arrived = (before: Walker, after: Walker): boolean => finished(after) > finished(before);

/** How many steps a walker has finished: those started, less one under way. */
const finished = (walker: Walker): number => walker.steps - (walker.step ? 1 : 0);

/** Where a walker last arrived: where they stand, or the cell a step under way is leaving. */
const arrivedAt = (walker: Walker): { x: number; y: number } =>
  walker.step ? { x: walker.step.fromX, y: walker.step.fromY } : { x: walker.x, y: walker.y };

/** Whether a flag is set in the game being played. */
const isSet = (flag: string): boolean => hasFlag(session.state, flag);

/** A chest's frame: open once its flag is set. */
const chestFrame = (chest: ChestPlacement): number =>
  hasFlag(session.state, chest.flag) ? CHEST_FRAME.open : CHEST_FRAME.shut;

/** A time a script asks for, which has to be a real one. */
function checkedMs(ms: number): number {
  if (!(ms >= 0 && Number.isFinite(ms))) throw new RangeError(`${ms} ms isn't a length of time`);
  return ms;
}

/**
 * Puts a character where its walker is, in whole pixels so it never shimmers against the camera,
 * showing the right frame. Lower characters are drawn in front, staying under the overhead layer.
 */
function draw({ sprite, rows }: Figure, walker: Walker): void {
  const { x, y } = walkerPosition(walker);
  const px = Math.round(x * TILE);
  const py = Math.round(y * TILE);
  sprite
    .setPosition(px + TILE / 2, py + TILE / 2)
    .setFrame(characterFrame(walker, rows))
    .setDepth(DEPTH.characters + py / 100_000);
}

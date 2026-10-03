import Phaser from 'phaser';
import { DIRECTIONS, STEP, type Direction } from '../core/direction';
import type { EventContext } from '../core/events';
import {
  compileMap,
  exitAt,
  isBlocked,
  isOutOfBounds,
  scriptAt,
  type CompiledMap,
  type Spawn,
} from '../core/map/compile';
import type { WarpTarget } from '../core/map/types';
import { createNpc, lookAt, updateNpc, type Npc } from '../core/npc';
import { Rng } from '../core/rng';
import {
  facingCell,
  occupies,
  standingWalker,
  updateWalker,
  walkerPosition,
  type Walker,
  type WalkWorld,
} from '../core/walker';
import { FIELD_SPEEDS, MAP_FADE_MS, NPC_TUNING } from '../data/balance';
import { EVENTS } from '../data/events';
import { MAPS } from '../data/maps';
import { SPEAKERS } from '../data/speakers';
import { MAP_CONTENT } from '../data/terrain';
import { cameraBounds } from '../systems/camera';
import { characterFrame, sheetRows } from '../systems/character-frames';
import { CollisionView } from '../systems/collision-view';
import { debugSwitches } from '../systems/debug-switches';
import { input } from '../systems/input/game-input';
import { settings } from '../systems/settings';
import { DEPTH, TILE, createTilemap } from '../systems/tilemap';
import type { DialogueRequest } from './dialogue';

/** Where to put the player, `scene.start('field', start)`: a cell, or one of the map's spawns. */
export type FieldStart = { readonly map: string } & (
  | { readonly x: number; readonly y: number; readonly facing?: Direction }
  | { readonly spawn: string }
);

/** The world is drawn at 2×, so the view is 20 by 11¼ tiles. */
const WORLD_ZOOM = 2;

/** A frame longer than this (say, after the tab was hidden) counts as this long, so nobody teleports. */
const MAX_FRAME_MS = 100;

const PLAYER_SPRITE = 'sprite.rowan';

/** A character on screen: their sprite, and how many rows their sheet has. */
interface Figure {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly rows: number;
}

interface NpcOnMap extends Figure {
  npc: Npc;
}

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
  private overhead?: Phaser.Tilemaps.TilemapLayer;
  private walker: Walker = standingWalker(0, 0);
  private npcs: NpcOnMap[] = [];
  /** Where the NPCs' wandering comes from. */
  private rng = Rng.fromSeed(0);
  /** The direction pressed most recently, which wins while several are held. */
  private lastDirection: Direction | null = null;
  /** A direction tapped during a step, taken when the step ends if nothing is held by then. */
  private buffered: Direction | null = null;
  /** Set once the player steps into a way out: the screen fades and the controls stop. */
  private leaving = false;
  /** Set while an event script runs: the player can't move, and everyone else waits. */
  private running = false;
  /** Marks which cells block the way, while the debug switch for it is on. */
  private collisionView?: CollisionView;

  constructor() {
    super('field');
  }

  create(start: FieldStart): void {
    const def = MAPS[start.map];
    if (!def) throw new Error(`There's no map called ${start.map}`);
    const map = compileMap(def, MAP_CONTENT);
    this.map = map;
    this.overhead = createTilemap(this, map).overhead;
    this.rng = Rng.fromSeed(`field:${map.id}`);
    this.npcs = map.npcs.map((placement) => ({
      npc: createNpc(placement, this.rng, NPC_TUNING),
      ...this.figure(`sprite.${placement.sprite}`),
    }));
    this.world = {
      // Noclip, a debug switch, walks through walls and people, but not off the map.
      isBlocked: (x, y) =>
        debugSwitches.noclip
          ? isOutOfBounds(map, x, y)
          : isBlocked(map, x, y) || this.npcAt(x, y) !== undefined,
      stopsAt: (x, y) => exitAt(map, x, y) !== null,
    };

    const at = 'spawn' in start ? spawnOn(map, start.spawn) : start;
    this.walker = standingWalker(at.x, at.y, at.facing);
    this.lastDirection = null;
    this.buffered = null;
    this.leaving = false;
    this.running = false;
    // The last map's view went with it.
    this.collisionView = undefined;
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
    camera.fadeIn(MAP_FADE_MS, 0, 0, 0);
  }

  override update(_time: number, delta: number): void {
    const { map, world } = this;
    if (!map || !world) return;
    const dt = Math.min(delta, MAX_FRAME_MS);

    // Confirm while standing still talks to whoever is in front, or examines what's there.
    if (!this.leaving && !this.running && !this.walker.step && input.pressed('confirm')) {
      this.interact(map);
    }
    if (this.running) {
      this.drawFigures();
      this.updateCollisionView(map);
      return;
    }

    // While leaving, the step into the way out finishes, and nothing else happens.
    const pressed = this.leaving ? undefined : DIRECTIONS.find((d) => input.pressed(d));
    if (pressed) this.buffered = pressed;
    const direction = this.leaving ? null : (this.heldDirection(pressed) ?? this.buffered);
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
    this.drawFigures();
    this.updateCollisionView(map);
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
      running: this.running,
      fading: camera.fadeEffect.isRunning,
      noclip: debugSwitches.noclip,
      collision: this.collisionView?.marked ?? null,
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
    };
  }

  private figure(key: string): Figure {
    const sprite = this.add.sprite(0, 0, key);
    return { sprite, rows: sheetRows(this.textures.get(key).getFrameNames().length) };
  }

  /** The NPC taking up (x, y), if any. */
  private npcAt(x: number, y: number): NpcOnMap | undefined {
    return this.npcs.find(({ npc }) => occupies(npc.walker, x, y));
  }

  /**
   * Talks to the NPC in front of the player, who turns to face them, or else runs the script of
   * whatever is there. Someone partway through a step can't be talked to until they've finished it.
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
    const script = scriptAt(map, x, y);
    if (script) this.run(script);
  }

  /** Runs an event script; until it ends the field stands still. */
  private run(id: string): void {
    const script = EVENTS[id];
    if (!script) {
      console.error(`There's no event script called ${id}`);
      return;
    }
    this.running = true;
    const ev: EventContext = { say: (speaker, text) => this.say(speaker, text) };
    void script(ev)
      .catch((error: unknown) => console.error(`Event script ${id} failed:`, error))
      .finally(() => (this.running = false));
  }

  /** Opens the dialogue box over the field, and resolves once the player closes it. */
  private say(speakerId: string, text: string): Promise<void> {
    const speaker = SPEAKERS[speakerId];
    if (!speaker) return Promise.reject(new Error(`There's no speaker called ${speakerId}`));
    return new Promise((resolve) => {
      this.scene.launch('dialogue', {
        line: { ...speaker, text },
        onClose: resolve,
      } satisfies DialogueRequest);
    });
  }

  /** Fades out while the step into the way out finishes, then starts the field over there. */
  private leave(to: WarpTarget): void {
    this.leaving = true;
    const camera = this.cameras.main;
    camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.restart({ map: to.map, spawn: to.spawn } satisfies FieldStart);
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

  private drawFigures(): void {
    if (this.player) draw(this.player, this.walker);
    for (const { npc, sprite, rows } of this.npcs) draw({ sprite, rows }, npc.walker);
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

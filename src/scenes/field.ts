import Phaser from 'phaser';
import { DIRECTIONS, STEP, type Direction } from '../core/direction';
import { compileMap, exitAt, isBlocked, type CompiledMap, type Spawn } from '../core/map/compile';
import type { WarpTarget } from '../core/map/types';
import {
  standingWalker,
  updateWalker,
  walkerPosition,
  type Walker,
  type WalkWorld,
} from '../core/walker';
import { FIELD_SPEEDS, MAP_FADE_MS } from '../data/balance';
import { MAPS } from '../data/maps';
import { MAP_CONTENT } from '../data/terrain';
import { cameraBounds } from '../systems/camera';
import { characterFrame, sheetRows } from '../systems/character-frames';
import { input } from '../systems/input/game-input';
import { DEPTH, TILE, createTilemap } from '../systems/tilemap';

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

function spawnOn(map: CompiledMap, id: string): Spawn {
  const spawn = map.spawns[id];
  if (!spawn) throw new Error(`Map ${map.id} has no spawn called ${id}`);
  return spawn;
}

/** Walking around a map. */
export class FieldScene extends Phaser.Scene {
  private map?: CompiledMap;
  private world?: WalkWorld;
  private player?: Phaser.GameObjects.Sprite;
  private playerRows = 1;
  private overhead?: Phaser.Tilemaps.TilemapLayer;
  private walker: Walker = standingWalker(0, 0);
  /** The direction pressed most recently, which wins while several are held. */
  private lastDirection: Direction | null = null;
  /** A direction tapped during a step, taken when the step ends if nothing is held by then. */
  private buffered: Direction | null = null;
  /** Set once the player steps into a way out: the screen fades and the controls stop. */
  private leaving = false;

  constructor() {
    super('field');
  }

  create(start: FieldStart): void {
    const def = MAPS[start.map];
    if (!def) throw new Error(`There's no map called ${start.map}`);
    const map = compileMap(def, MAP_CONTENT);
    this.map = map;
    this.world = {
      isBlocked: (x, y) => isBlocked(map, x, y),
      stopsAt: (x, y) => exitAt(map, x, y) !== null,
    };
    this.overhead = createTilemap(this, map).overhead;

    const at = 'spawn' in start ? spawnOn(map, start.spawn) : start;
    this.walker = standingWalker(at.x, at.y, at.facing);
    this.lastDirection = null;
    this.buffered = null;
    this.leaving = false;
    this.player = this.add.sprite(0, 0, PLAYER_SPRITE).setDepth(DEPTH.characters);
    this.playerRows = sheetRows(this.textures.get(PLAYER_SPRITE).getFrameNames().length);
    this.drawPlayer();

    const camera = this.cameras.main.setZoom(WORLD_ZOOM);
    const bounds = cameraBounds(
      map.width * TILE,
      map.height * TILE,
      camera.width / WORLD_ZOOM,
      camera.height / WORLD_ZOOM,
    );
    camera.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    camera.startFollow(this.player, true);
    camera.fadeIn(MAP_FADE_MS, 0, 0, 0);
  }

  override update(_time: number, delta: number): void {
    const { map, world } = this;
    if (!map || !world) return;
    // While leaving, the step into the way out finishes, and nothing else happens.
    const pressed = this.leaving ? undefined : DIRECTIONS.find((d) => input.pressed(d));
    if (pressed) this.buffered = pressed;
    const direction = this.leaving ? null : (this.heldDirection(pressed) ?? this.buffered);
    const before = this.walker;
    this.walker = updateWalker(
      before,
      { direction, run: input.held('run') },
      Math.min(delta, MAX_FRAME_MS),
      world,
      FIELD_SPEEDS,
    );
    // A buffered tap is used up once the walker sets off again or comes to a stop.
    if (!this.walker.step || this.walker.steps !== before.steps) this.buffered = null;
    if (this.walker.steps !== before.steps) {
      const exit = exitAt(map, this.walker.x, this.walker.y);
      if (exit) this.leave(exit);
    }
    this.drawPlayer();
  }

  /** Read by `window.__game.inspect('field')` in dev and test builds. */
  debugInfo(): Record<string, unknown> {
    const { map, overhead, player, walker } = this;
    if (!map || !overhead || !player) return {};
    const camera = this.cameras.main;
    const view = camera.worldView;
    return {
      map: map.id,
      leaving: this.leaving,
      fading: camera.fadeEffect.isRunning,
      x: walker.x,
      y: walker.y,
      facing: walker.facing,
      moving: walker.step !== null,
      stepMs: walker.step?.duration ?? null,
      frame: Number(player.frame.name),
      // The sprite's top-left, in world pixels.
      pixel: { x: player.x - TILE / 2, y: player.y - TILE / 2 },
      view: { x: view.x, y: view.y, width: view.width, height: view.height },
      size: { width: map.width * TILE, height: map.height * TILE },
      blocked: Object.fromEntries(
        DIRECTIONS.map((d) => [d, isBlocked(map, walker.x + STEP[d][0], walker.y + STEP[d][1])]),
      ),
      // Something on the overhead layer covers the player's cell, drawn over the player.
      underOverhead: overhead.hasTileAt(walker.x, walker.y) && overhead.depth > player.depth,
    };
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

  private drawPlayer(): void {
    const { x, y } = walkerPosition(this.walker);
    // Whole pixels, so the sprite and the camera that follows it never shimmer.
    this.player
      ?.setPosition(Math.round(x * TILE) + TILE / 2, Math.round(y * TILE) + TILE / 2)
      .setFrame(characterFrame(this.walker, this.playerRows));
  }
}

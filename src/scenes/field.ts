import Phaser from 'phaser';
import { DIRECTIONS, STEP, type Direction } from '../core/direction';
import { compileMap, isBlocked, type CompiledMap } from '../core/map/compile';
import { standingWalker, updateWalker, walkerPosition, type Walker } from '../core/walker';
import { FIELD_SPEEDS } from '../data/balance';
import { MAPS } from '../data/maps';
import { MAP_CONTENT } from '../data/terrain';
import { cameraBounds } from '../systems/camera';
import { characterFrame, sheetRows } from '../systems/character-frames';
import { input } from '../systems/input/game-input';
import { DEPTH, TILE, createTilemap } from '../systems/tilemap';

/** Where to put the player: `scene.start('field', start)`. */
export interface FieldStart {
  readonly map: string;
  readonly x: number;
  readonly y: number;
  readonly facing?: Direction;
}

/** The world is drawn at 2×, so the view is 20 by 11¼ tiles. */
const WORLD_ZOOM = 2;

/** A frame longer than this (say, after the tab was hidden) counts as this long, so nobody teleports. */
const MAX_FRAME_MS = 100;

const PLAYER_SPRITE = 'sprite.rowan';

/** Walking around a map. */
export class FieldScene extends Phaser.Scene {
  private map?: CompiledMap;
  private player?: Phaser.GameObjects.Sprite;
  private playerRows = 1;
  private overhead?: Phaser.Tilemaps.TilemapLayer;
  private walker: Walker = standingWalker(0, 0);
  /** The direction pressed most recently, which wins while several are held. */
  private lastDirection: Direction | null = null;
  /** A direction tapped during a step, taken when the step ends if nothing is held by then. */
  private buffered: Direction | null = null;

  constructor() {
    super('field');
  }

  create(start: FieldStart): void {
    const def = MAPS[start.map];
    if (!def) throw new Error(`There's no map called ${start.map}`);
    const map = compileMap(def, MAP_CONTENT);
    this.map = map;
    this.overhead = createTilemap(this, map).overhead;

    this.walker = standingWalker(start.x, start.y, start.facing);
    this.lastDirection = null;
    this.buffered = null;
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
  }

  override update(_time: number, delta: number): void {
    const { map } = this;
    if (!map) return;
    const pressed = DIRECTIONS.find((direction) => input.pressed(direction));
    if (pressed) this.buffered = pressed;
    const direction = this.heldDirection(pressed) ?? this.buffered;
    const before = this.walker;
    this.walker = updateWalker(
      before,
      { direction, run: input.held('run') },
      Math.min(delta, MAX_FRAME_MS),
      (x, y) => isBlocked(map, x, y),
      FIELD_SPEEDS,
    );
    // A buffered tap is used up once the walker sets off again or comes to a stop.
    if (!this.walker.step || this.walker.steps !== before.steps) this.buffered = null;
    this.drawPlayer();
  }

  /** Read by `window.__game.inspect('field')` in dev and test builds. */
  debugInfo(): Record<string, unknown> {
    const { map, overhead, player, walker } = this;
    if (!map || !overhead || !player) return {};
    const view = this.cameras.main.worldView;
    return {
      map: map.id,
      x: walker.x,
      y: walker.y,
      facing: walker.facing,
      moving: walker.step !== null,
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

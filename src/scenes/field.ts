import Phaser from 'phaser';
import { DIRECTIONS, STEP, type Direction } from '../core/direction';
import { compileMap, isBlocked, type CompiledMap } from '../core/map/compile';
import { MAPS } from '../data/maps';
import { MAP_CONTENT } from '../data/terrain';
import { input } from '../systems/input/game-input';
import { DEPTH, TILE, createTilemap } from '../systems/tilemap';

/** Where to put the player: `scene.start('field', start)`. */
export interface FieldStart {
  readonly map: string;
  readonly x: number;
  readonly y: number;
  readonly facing?: Direction;
}

/** The first row of a character sheet faces down, up, left and right. */
const FACING_FRAME: Readonly<Record<Direction, number>> = { down: 0, up: 1, left: 2, right: 3 };

/** The world is drawn at 2×, so 20×11 tiles fill the screen. */
const WORLD_ZOOM = 2;

/**
 * While a direction is held, the player hops a tile this often. A stand-in: the grid movement task
 * (M1) replaces the hops with smooth walking, running and a camera that follows.
 */
const STEP_INTERVAL_MS = 180;

/** Walking around a map. */
export class FieldScene extends Phaser.Scene {
  private map?: CompiledMap;
  private player?: Phaser.GameObjects.Sprite;
  private overhead?: Phaser.Tilemaps.TilemapLayer;
  private x = 0;
  private y = 0;
  private facing: Direction = 'down';
  private nextStepAt = 0;

  constructor() {
    super('field');
  }

  create(start: FieldStart): void {
    const def = MAPS[start.map];
    if (!def) throw new Error(`There's no map called ${start.map}`);
    const map = compileMap(def, MAP_CONTENT);
    this.map = map;
    this.overhead = createTilemap(this, map).overhead;
    this.cameras.main.setZoom(WORLD_ZOOM).centerOn((map.width * TILE) / 2, (map.height * TILE) / 2);

    this.x = start.x;
    this.y = start.y;
    this.facing = start.facing ?? 'down';
    this.nextStepAt = 0;
    this.player = this.add.sprite(0, 0, 'sprite.rowan').setOrigin(0).setDepth(DEPTH.characters);
    this.drawPlayer();
  }

  override update(time: number): void {
    const pressed = DIRECTIONS.find((direction) => input.pressed(direction));
    const held = DIRECTIONS.find((direction) => input.held(direction));
    if (pressed) this.step(pressed, time);
    else if (held && time >= this.nextStepAt) this.step(held, time);
  }

  /** Read by `window.__game.inspect('field')` in dev and test builds. */
  debugInfo(): Record<string, unknown> {
    const { map, overhead, player } = this;
    if (!map || !overhead || !player) return {};
    return {
      map: map.id,
      x: this.x,
      y: this.y,
      facing: this.facing,
      blocked: Object.fromEntries(
        DIRECTIONS.map((d) => [d, isBlocked(map, this.x + STEP[d][0], this.y + STEP[d][1])]),
      ),
      // Something on the overhead layer covers the player's cell, drawn over the player.
      underOverhead: overhead.hasTileAt(this.x, this.y) && overhead.depth > player.depth,
    };
  }

  private step(direction: Direction, time: number): void {
    if (!this.map) return;
    const [dx, dy] = STEP[direction];
    this.facing = direction;
    if (!isBlocked(this.map, this.x + dx, this.y + dy)) {
      this.x += dx;
      this.y += dy;
    }
    this.nextStepAt = time + STEP_INTERVAL_MS;
    this.drawPlayer();
  }

  private drawPlayer(): void {
    this.player?.setPosition(this.x * TILE, this.y * TILE).setFrame(FACING_FRAME[this.facing]);
  }
}

import type Phaser from 'phaser';
import type { CompiledMap } from '../core/map/compile';
import { SIDES, type Side } from '../core/map/types';
import type { Walker } from '../core/walker';
import { DEPTH, TILE } from './tilemap';

const SHADE = 0x000000;
const SOLID = 0xff3b3b;
const WAY_OUT = 0x3b8bff;
const SPAWN = 0x3bff7a;
const PERSON = 0xffb02e;

/** How thick an open edge's bar is, in world pixels. */
const EDGE_BAR = 3;

/** What a collision view marks: the counts of each kind of cell, and which edges lead elsewhere. */
export interface CollisionMarks {
  readonly solid: number;
  readonly waysOut: number;
  readonly openEdges: readonly Side[];
  readonly spawns: number;
  /** Cells people take up right now: one each, two for someone partway through a step. */
  readonly people: number;
}

/**
 * The debug menu's Show collision, drawn over the field: solid cells darkened and ringed in red, ways
 * out in blue (and a blue bar along each edge that leads somewhere), spawns as green rings with a
 * dot, and the cells people take up as orange rings that follow them about. Rings rather than tints
 * alone, so they show up on art of any colour, and a run of cells still shows where each one is.
 */
export class CollisionView {
  private readonly cells: Phaser.GameObjects.Graphics;
  private readonly people: Phaser.GameObjects.Graphics;
  private readonly map: Omit<CollisionMarks, 'people'>;
  private peopleCells = 0;

  constructor(scene: Phaser.Scene, map: CompiledMap) {
    this.cells = scene.add.graphics().setDepth(DEPTH.debug);
    this.people = scene.add.graphics().setDepth(DEPTH.debug);
    this.map = drawMap(this.cells, map);
  }

  get marked(): CollisionMarks {
    return { ...this.map, people: this.peopleCells };
  }

  /** Marks the cells `walkers` take up: each one's own, and mid-step the one it's leaving too. */
  update(walkers: readonly Walker[]): void {
    const graphics = this.people.clear();
    this.peopleCells = 0;
    for (const walker of walkers) {
      ring(graphics, walker.x, walker.y, PERSON);
      this.peopleCells += 1;
      if (walker.step) {
        ring(graphics, walker.step.fromX, walker.step.fromY, PERSON);
        this.peopleCells += 1;
      }
    }
  }

  destroy(): void {
    this.cells.destroy();
    this.people.destroy();
  }
}

function drawMap(
  graphics: Phaser.GameObjects.Graphics,
  map: CompiledMap,
): Omit<CollisionMarks, 'people'> {
  let solid = 0;
  let waysOut = 0;
  map.solid.forEach((isSolid, index) => {
    const x = index % map.width;
    const y = Math.floor(index / map.width);
    if (isSolid) {
      fillCell(graphics, x, y, SHADE, 0.4);
      ring(graphics, x, y, SOLID);
      solid += 1;
    }
    if (map.warps[index]) {
      fillCell(graphics, x, y, WAY_OUT, 0.5);
      ring(graphics, x, y, WAY_OUT);
      waysOut += 1;
    }
  });

  const openEdges = SIDES.filter((side) => map.edges[side]);
  const width = map.width * TILE;
  const height = map.height * TILE;
  graphics.fillStyle(WAY_OUT, 0.8);
  for (const side of openEdges) {
    switch (side) {
      case 'north':
        graphics.fillRect(0, 0, width, EDGE_BAR);
        break;
      case 'south':
        graphics.fillRect(0, height - EDGE_BAR, width, EDGE_BAR);
        break;
      case 'west':
        graphics.fillRect(0, 0, EDGE_BAR, height);
        break;
      case 'east':
        graphics.fillRect(width - EDGE_BAR, 0, EDGE_BAR, height);
        break;
    }
  }

  const spawns = Object.values(map.spawns);
  for (const { x, y } of spawns) {
    ring(graphics, x, y, SPAWN);
    graphics.fillStyle(SPAWN, 1).fillRect(x * TILE + 6, y * TILE + 6, 3, 3);
  }
  return { solid, waysOut, openEdges, spawns: spawns.length };
}

function fillCell(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  color: number,
  alpha: number,
): void {
  graphics.fillStyle(color, alpha).fillRect(x * TILE, y * TILE, TILE, TILE);
}

/** A one-pixel ring just inside a cell, from filled rectangles so it stays on whole pixels. */
function ring(graphics: Phaser.GameObjects.Graphics, x: number, y: number, color: number): void {
  const left = x * TILE + 1;
  const top = y * TILE + 1;
  const size = TILE - 3;
  graphics
    .fillStyle(color, 1)
    .fillRect(left, top, size, 1)
    .fillRect(left, top + size - 1, size, 1)
    .fillRect(left, top, 1, size)
    .fillRect(left + size - 1, top, 1, size);
}

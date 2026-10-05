import Phaser from 'phaser';
import type { FighterId, Side } from '../core/battle/fighter';
import { BATTLE_PACING } from '../data/balance';
import { BATTLE_LAYOUT, timelineSpot } from './battle-layout';
import { iconWindow, slotOrigins, type Timeline } from './battle-timeline';
import { FONT } from './fonts';

/** Who a fighter is on the timeline: their side, their icon, and the letter that tells them apart. */
export interface TimelineFigure {
  readonly id: FighterId;
  readonly side: Side;
  /** The sheet their icon is cut from, and where their face is in its first frame, if it says. */
  readonly sheet: string;
  readonly face?: { readonly x: number; readonly y: number } | undefined;
  /** A, B and so on for enemies of a kind, as in Wolf A; '' for anyone else. */
  readonly letter: string;
}

/** A turn on the strip, for the debug info: whose, and what marks it. */
export interface TimelineTileInfo {
  readonly id: FighterId;
  readonly telegraph: boolean;
  readonly changed: boolean;
}

/**
 * The pack's ink for outlines; the panels' cream, and gold for a turn the preview changed; the
 * frame's orange for whoever's turn it is, blue for the party and red for the enemies; and the
 * telegraph's red, as over the enemy that readied it.
 */
const COLOURS = {
  ink: 0x141b1b,
  cream: 0xf2eaf1,
  changed: 0xffe18d,
  now: 0xffad5d,
  party: 0x79b8ce,
  enemies: 0xe0394c,
  alert: 0xff5a4a,
  letter: 0xffffff,
} as const;

/** The name of the frame each sheet's icon is cut into. */
const ICON_FRAME = 'timeline-icon';

const { tile: TILE, icon: ICON } = BATTLE_LAYOUT.timeline;

/** A turn on the strip: a fighter's icon in a frame, maybe lettered, maybe marked with a !. */
interface Tile {
  readonly id: FighterId;
  readonly container: Phaser.GameObjects.Container;
  readonly back: Phaser.GameObjects.Graphics;
  readonly alert: Phaser.GameObjects.Container;
}

/**
 * The timeline across the top of the battle screen (see src/ui/battle-timeline.ts for what it
 * shows): a tile for whose turn it is, a ▸, then one for each of the turns after it. When it
 * changes, each fighter's turns slide along to their new places, turns that are new fade in, and
 * those gone fade out: the first slides off to the left when a turn goes by.
 */
export class TimelineStrip {
  private tiles: Tile[] = [];
  private shown: Timeline = [];
  private changed: readonly boolean[] = [];
  private readonly figures: ReadonlyMap<FighterId, TimelineFigure>;
  private readonly arrow: Phaser.GameObjects.Graphics;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth: number,
    figures: readonly TimelineFigure[],
  ) {
    this.figures = new Map(figures.map((figure) => [figure.id, figure]));
    for (const figure of figures) cutIcon(scene, figure);
    // ▸, between whose turn it is and those to come.
    const { x, y, tile, after } = BATTLE_LAYOUT.timeline;
    const middle = y + tile / 2;
    const left = x + tile + Math.floor((after - 3) / 2);
    this.arrow = scene.add
      .graphics()
      .fillStyle(COLOURS.ink)
      .fillTriangle(left - 1, middle - 4, left - 1, middle + 4, left + 4, middle)
      .fillStyle(COLOURS.cream)
      .fillTriangle(left, middle - 2.5, left, middle + 2.5, left + 2.5, middle)
      .setDepth(depth)
      .setVisible(false);
  }

  /**
   * Shows a timeline: with `changed`, the turns to highlight; with `advanced`, a turn has gone by,
   * and the first slides away.
   */
  show(
    timeline: Timeline,
    options: { readonly changed?: readonly boolean[]; readonly advanced?: boolean } = {},
  ): void {
    const { changed = [], advanced = false } = options;
    const origins = slotOrigins(
      this.tiles.map((tile) => tile.id),
      timeline.map((slot) => slot.id),
      advanced,
    );
    const tiles = timeline.map((slot, index) => {
      const origin = origins[index] ?? null;
      return (origin === null ? undefined : this.tiles[origin]) ?? this.enter(slot.id, index);
    });
    this.tiles.forEach((tile, index) => {
      if (!tiles.includes(tile)) this.leave(tile, advanced && index === 0);
    });
    this.tiles = tiles;
    tiles.forEach((tile, index) => {
      const slot = timeline[index];
      this.paint(tile, index, changed[index] ?? false);
      tile.alert.setVisible(slot?.telegraph ?? false);
      this.slide(tile, index);
    });
    this.arrow.setVisible(timeline.length > 1);
    this.shown = timeline;
    this.changed = changed;
  }

  /** Clears the strip, every turn fading out: once the battle's over. */
  hide(): void {
    this.show([]);
  }

  /** The turns on the strip, for the debug info. */
  debugInfo(): TimelineTileInfo[] {
    return this.shown.map(({ id, telegraph }, index) => ({
      id,
      telegraph,
      changed: this.changed[index] ?? false,
    }));
  }

  /** A new turn, fading in a little to the right of its place. */
  private enter(id: FighterId, index: number): Tile {
    const figure = this.figures.get(id);
    if (!figure) throw new Error(`There's nobody called ${id} on the timeline`);
    const { scene } = this;
    const back = scene.add.graphics();
    const parts: Phaser.GameObjects.GameObject[] = [back];
    const frame = scene.textures.getFrame(figure.sheet, ICON_FRAME);
    const inset = (TILE - ICON) / 2;
    parts.push(
      scene.add
        .image(inset + (ICON - frame.width) / 2, inset + (ICON - frame.height) / 2, figure.sheet)
        .setFrame(ICON_FRAME)
        .setOrigin(0),
    );
    if (figure.letter !== '') parts.push(...badge(scene, figure.letter, COLOURS.ink));
    const alert = scene.add.container(0, 0, badge(scene, '!', COLOURS.alert, 'top'));
    parts.push(alert);
    const { x, y } = timelineSpot(index);
    const container = scene.add
      .container(x + TILE / 2, y, parts)
      .setDepth(this.depth)
      .setAlpha(0);
    return { id, container, back, alert };
  }

  /** A turn that's gone: it fades out, and the one that's just gone by slides off to the left. */
  private leave(tile: Tile, gone: boolean): void {
    const { container } = tile;
    this.scene.tweens.killTweensOf(container);
    this.scene.tweens.add({
      targets: container,
      x: container.x - (gone ? TILE : 0),
      alpha: 0,
      duration: BATTLE_PACING.slide,
      ease: 'Sine.easeIn',
      onComplete: () => container.destroy(),
    });
  }

  /** Slides a turn to its place, and brings it all the way in. */
  private slide(tile: Tile, index: number): void {
    const { container } = tile;
    const { x, y } = timelineSpot(index);
    this.scene.tweens.killTweensOf(container);
    if (container.x === x && container.y === y && container.alpha === 1) return;
    this.scene.tweens.add({
      targets: container,
      x,
      y,
      alpha: 1,
      duration: BATTLE_PACING.slide,
      ease: 'Sine.easeOut',
    });
  }

  /**
   * Draws a tile's frame: orange for whoever's turn it is, then blue for the party and red for
   * the enemies, round cream, or gold where the preview changed the turn.
   */
  private paint(tile: Tile, index: number, changed: boolean): void {
    const side = this.figures.get(tile.id)?.side ?? 'party';
    const frame = index === 0 ? COLOURS.now : COLOURS[side];
    tile.back
      .clear()
      .fillStyle(changed ? COLOURS.letter : COLOURS.ink)
      .fillRect(0, 0, TILE, TILE)
      .fillStyle(frame)
      .fillRect(1, 1, TILE - 2, TILE - 2)
      .fillStyle(changed ? COLOURS.changed : COLOURS.cream)
      .fillRect(2, 2, TILE - 4, TILE - 4);
  }
}

/**
 * Cuts a fighter's icon from the first frame of their sheet, as a frame of its own, once: where the
 * sheet says their face is, or else at their feet.
 */
function cutIcon(scene: Phaser.Scene, figure: TimelineFigure): void {
  const texture = scene.textures.get(figure.sheet);
  if (texture.has(ICON_FRAME)) return;
  const first = texture.get(0);
  const cut = iconWindow({ width: first.width, height: first.height }, ICON, figure.face);
  texture.add(
    ICON_FRAME,
    first.sourceIndex,
    first.cutX + cut.x,
    first.cutY + cut.y,
    cut.width,
    cut.height,
  );
}

/**
 * A small badge on a tile's corner, its text in white on `colour`, outlined in ink: a letter at
 * the bottom right, or the telegraph's ! at the top right.
 */
function badge(
  scene: Phaser.Scene,
  text: string,
  colour: number,
  corner: 'top' | 'bottom' = 'bottom',
): Phaser.GameObjects.GameObject[] {
  const label = scene.add.bitmapText(0, 0, FONT.body, text).setTint(COLOURS.letter);
  const width = Math.ceil(label.width) + 3;
  const height = 10;
  const x = TILE - width + 1;
  const y = corner === 'top' ? -2 : TILE - height;
  const back = scene.add
    .graphics()
    .fillStyle(COLOURS.ink)
    .fillRect(x, y, width, height)
    .fillStyle(colour)
    .fillRect(x + 1, y + 1, width - 2, height - 2);
  label.setPosition(x + 2, y + 1);
  return [back, label];
}

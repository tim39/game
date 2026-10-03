import { GAME_HEIGHT, GAME_WIDTH } from '../systems/display';
import { FONT_CELL } from './glyph-metrics';

/**
 * Where things go inside the pack's dialogue boxes (`DialogBoxFaceset.png` and `DialogBox.png`,
 * both 300×58), in box pixels. Measured from the images; the UI draws the box at 2×.
 */
export const DIALOGUE_BOX = {
  width: 300,
  height: 58,
  /**
   * The box under the name tab. Lines with no name draw the pack's tab-less box
   * (`DialogueBoxSimple.png`, the same frame in another size) here instead, sliced at its 8-pixel
   * corners and stretched to fit.
   */
  panel: { x: 0, y: 8, width: 300, height: 50, corner: 8 },
  /** The dark frame for a 38×38 portrait (portrait box only). */
  portrait: { x: 6, y: 14, size: 38 },
  /** The brown tab above the box, for the speaker's name. */
  nameTab: { x: 4, y: 1, width: 66, height: 9 },
  /** The light text panel, with and without a portrait. */
  textArea: {
    withPortrait: { x: 50, y: 14, width: 244, height: 38 },
    plain: { x: 6, y: 14, width: 288, height: 38 },
  },
  /** Gap between the panel's edge and the text. */
  inset: { x: 4, y: 3 },
} as const;

/** The box is drawn at 2×, like the world. */
export const DIALOGUE_SCALE = 2;

/**
 * Where the box sits on the 640×360 screen, in game pixels: centred along the bottom, 12 pixels up
 * from the edge. Touch controls keep clear of it.
 */
export const DIALOGUE_BOX_ON_SCREEN = {
  x: (GAME_WIDTH - DIALOGUE_BOX.width * DIALOGUE_SCALE) / 2,
  y: GAME_HEIGHT - DIALOGUE_BOX.height * DIALOGUE_SCALE - 12,
  width: DIALOGUE_BOX.width * DIALOGUE_SCALE,
  height: DIALOGUE_BOX.height * DIALOGUE_SCALE,
} as const;

/** Three lines of body text (8 pixels tall, 12 apart) fill the panel's height. */
export const MAX_LINES = 3;

/** How wide a line of text can be inside the box, in font pixels. */
export function lineWidth(withPortrait: boolean): number {
  const area = withPortrait ? DIALOGUE_BOX.textArea.withPortrait : DIALOGUE_BOX.textArea.plain;
  return area.width - 2 * DIALOGUE_BOX.inset.x;
}

/** The most choices the choice box offers at once. */
export const MAX_CHOICES = 4;

/**
 * The choice box: the pack's `ChoiceBox.png` (64×20), sliced at its frame and stretched to fit
 * its choices, one to a line with a ▶ cursor before them. In box pixels, drawn at 2× like the
 * dialogue box.
 */
export const CHOICE_BOX = {
  /** How thick the frame is, corners included. */
  frame: 5,
  /** Gap between the frame and the text, as in the dialogue box. */
  inset: { x: 4, y: 3 },
  /** Room for the ▶ cursor, and the gap after it. */
  cursor: 6,
  /** One choice to a line, spaced like the dialogue box's lines. */
  lineHeight: 12,
  /**
   * The widest a choice may be, in font pixels: about 28 characters. Centred, a box this wide
   * stays clear of the touch controls on phones held sideways.
   */
  maxTextWidth: 140,
  /** Gap between the choice box and the dialogue box under it. */
  gap: 2,
} as const;

/**
 * Where the choice box goes on the 640×360 screen, in game pixels, for `count` choices up to
 * `textWidth` font pixels wide: centred, just above the dialogue box.
 */
export function choiceBoxOnScreen(
  textWidth: number,
  count: number,
): { x: number; y: number; width: number; height: number } {
  const { frame, inset, cursor, lineHeight, gap } = CHOICE_BOX;
  const width = 2 * (frame + inset.x) + cursor + textWidth;
  const textHeight = (count - 1) * lineHeight + FONT_CELL.body.height;
  const height = 2 * (frame + inset.y) + textHeight;
  // In whole box pixels, so the art lines up with the dialogue box's.
  const left = Math.round((GAME_WIDTH / DIALOGUE_SCALE - width) / 2);
  const bottom = DIALOGUE_BOX_ON_SCREEN.y - gap * DIALOGUE_SCALE;
  return {
    x: left * DIALOGUE_SCALE,
    y: bottom - height * DIALOGUE_SCALE,
    width: width * DIALOGUE_SCALE,
    height: height * DIALOGUE_SCALE,
  };
}

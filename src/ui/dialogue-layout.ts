/**
 * Where things go inside the pack's dialogue boxes (`DialogBoxFaceset.png` and `DialogBox.png`,
 * both 300×58), in box pixels. Measured from the images; the UI draws the box at 2×.
 */
export const DIALOGUE_BOX = {
  width: 300,
  height: 58,
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

/** Three lines of body text (8 pixels tall, 12 apart) fill the panel's height. */
export const MAX_LINES = 3;

/** How wide a line of text can be inside the box, in font pixels. */
export function lineWidth(withPortrait: boolean): number {
  const area = withPortrait ? DIALOGUE_BOX.textArea.withPortrait : DIALOGUE_BOX.textArea.plain;
  return area.width - 2 * DIALOGUE_BOX.inset.x;
}

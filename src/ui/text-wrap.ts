/**
 * Breaks text into lines no wider than `maxWidth`, at spaces where possible. `widthOf` measures
 * a string (in pixels for a real font); by default it counts characters. Runs of spaces collapse
 * to one, newlines in the text are kept, and a word wider than a whole line is split across lines.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  widthOf: (text: string) => number = (t) => t.length,
): string[] {
  if (!(maxWidth > 0)) throw new RangeError(`wrapText needs a positive width, got ${maxWidth}`);
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ').filter((w) => w.length > 0)) {
      let rest = word;
      while (widthOf(rest) > maxWidth) {
        if (line) lines.push(line);
        line = '';
        const fits = longestFittingPrefix(rest, maxWidth, widthOf);
        lines.push(rest.slice(0, fits));
        rest = rest.slice(fits);
      }
      if (!rest) continue;
      const joined = line ? `${line} ${rest}` : rest;
      if (widthOf(joined) <= maxWidth) line = joined;
      else {
        lines.push(line);
        line = rest;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** How many leading characters of `word` fit in `maxWidth`; at least one, so wrapping always moves on. */
function longestFittingPrefix(
  word: string,
  maxWidth: number,
  widthOf: (text: string) => number,
): number {
  let length = 1;
  while (length < word.length && widthOf(word.slice(0, length + 1)) <= maxWidth) length += 1;
  return length;
}

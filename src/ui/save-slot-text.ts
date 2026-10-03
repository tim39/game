/** How long a game has been played, in hours, minutes and seconds: `0:12:34`, `12:05:00`. */
export function formatPlayTime(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(seconds / 3600);
  return `${hours}:${twoDigits(Math.floor(seconds / 60) % 60)}:${twoDigits(seconds % 60)}`;
}

/** When a game was saved, in the player's own time zone: `3 Oct 14:22`. */
export function formatSavedAt(savedAt: string, months: readonly string[]): string {
  const date = new Date(savedAt);
  const month = months[date.getMonth()] ?? '';
  return `${date.getDate()} ${month} ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}

const twoDigits = (n: number): string => String(n).padStart(2, '0');

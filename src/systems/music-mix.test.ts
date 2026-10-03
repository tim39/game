import { describe, expect, test } from 'vitest';
import { SILENCE, crossfadeTo, stepMix, type MusicMix } from './music-mix';

/** Each track as "key level→target", for readable expectations. */
const levels = (mix: MusicMix): string[] =>
  mix.tracks.map((track) => `${track.key} ${track.level}→${track.target}`);

describe('crossfadeTo and stepMix', () => {
  test('a track fades in from silence', () => {
    const mix = crossfadeTo(SILENCE, 'town', 1000);
    expect(mix.current).toBe('town');
    expect(levels(mix)).toEqual(['town 0→1']);
    expect(levels(stepMix(mix, 250))).toEqual(['town 0.25→1']);
    expect(levels(stepMix(mix, 5000))).toEqual(['town 1→1']);
  });

  test('a new track crossfades with the old one, which stops once it is silent', () => {
    const town = stepMix(crossfadeTo(SILENCE, 'town', 1000), 1000);
    const crossfading = stepMix(crossfadeTo(town, 'caves', 1000), 400);
    expect(crossfading.current).toBe('caves');
    expect(levels(crossfading)).toEqual(['town 0.6→0', 'caves 0.4→1']);
    expect(levels(stepMix(crossfading, 600))).toEqual(['caves 1→1']);
  });

  test('asking for the track already playing changes nothing', () => {
    const town = stepMix(crossfadeTo(SILENCE, 'town', 1000), 500);
    expect(crossfadeTo(town, 'town', 1000)).toBe(town);
  });

  test('a track fading out fades back in from where it is, rather than starting over', () => {
    const town = stepMix(crossfadeTo(SILENCE, 'town', 1000), 1000);
    const away = stepMix(crossfadeTo(town, 'caves', 1000), 300);
    const back = crossfadeTo(away, 'town', 1000);
    expect(levels(back)).toEqual(['town 0.7→1', 'caves 0.3→0']);
    expect(levels(stepMix(back, 300))).toEqual(['town 1→1']);
  });

  test('silence fades everything out', () => {
    const town = stepMix(crossfadeTo(SILENCE, 'town', 1000), 1000);
    const quiet = crossfadeTo(town, null, 500);
    expect(quiet.current).toBeNull();
    expect(levels(stepMix(quiet, 250))).toEqual(['town 0.5→0']);
    expect(stepMix(quiet, 500)).toEqual(SILENCE);
  });

  test('a fade of 0 ms changes over at once', () => {
    const town = crossfadeTo(SILENCE, 'town', 0);
    const caves = stepMix(crossfadeTo(stepMix(town, 16), 'caves', 0), 16);
    expect(levels(caves)).toEqual(['caves 1→1']);
  });

  test('a step changes nothing that has nowhere to go', () => {
    const town = stepMix(crossfadeTo(SILENCE, 'town', 1000), 1000);
    const later = stepMix(town, 16);
    expect(later.tracks[0]).toBe(town.tracks[0]);
  });
});

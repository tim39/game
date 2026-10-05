/**
 * The music playing, as tracks at levels that fade: the track asked for fades in while the others
 * fade out, and a track that has faded out stops. Pure, so the crossfades are unit-tested; the
 * audio manager (src/systems/audio.ts) plays what it says.
 */

/** A track in the mix, at a level from 0 (silent) to 1 (full), on its way to `target`. */
export interface MixTrack {
  readonly key: string;
  readonly level: number;
  readonly target: 0 | 1;
  /** How long fading all the way in or out takes, in milliseconds. 0 jumps there. */
  readonly fadeMs: number;
}

export interface MusicMix {
  /** The track asked for, or null for silence. */
  readonly current: string | null;
  /** Every track that can still be heard, fading or not, the current one included. */
  readonly tracks: readonly MixTrack[];
}

export const SILENCE: MusicMix = { current: null, tracks: [] };

/**
 * Asks for a track, or for silence with null: it fades in over `fadeMs` as the others fade out.
 * Asking for the track already asked for changes nothing, so it plays on. One that's fading out
 * fades back in from where it is, rather than starting over.
 */
export function crossfadeTo(mix: MusicMix, key: string | null, fadeMs: number): MusicMix {
  if (key === mix.current) return mix;
  const tracks = mix.tracks.map((track): MixTrack => ({
    ...track,
    target: track.key === key ? 1 : 0,
    fadeMs,
  }));
  if (key !== null && !tracks.some((track) => track.key === key)) {
    tracks.push({ key, level: 0, target: 1, fadeMs });
  }
  return { current: key, tracks };
}

/**
 * The mix coming back after a battle's music: the tracks it paused, from nothing, each fading back
 * up over `fadeMs` to where it was going. One that was on its way out is gone.
 */
export function resumed(mix: MusicMix, fadeMs: number): MusicMix {
  return {
    ...mix,
    tracks: mix.tracks
      .filter((track) => track.target === 1)
      .map((track): MixTrack => ({ ...track, level: 0, fadeMs })),
  };
}

/** Moves every track's level `dtMs` further towards its target, and drops the ones faded out. */
export function stepMix(mix: MusicMix, dtMs: number): MusicMix {
  const tracks = mix.tracks
    .map((track): MixTrack => {
      const step = track.fadeMs > 0 ? dtMs / track.fadeMs : 1;
      const level =
        track.target === 1 ? Math.min(1, track.level + step) : Math.max(0, track.level - step);
      return level === track.level ? track : { ...track, level };
    })
    .filter((track) => track.target === 1 || track.level > 0);
  return { ...mix, tracks };
}

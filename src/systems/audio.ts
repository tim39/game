import Phaser from 'phaser';
import { MUSIC_FADE_MS, SOUND_REPEAT_MS } from '../data/balance';
import { ASSETS, type AssetEntry } from './asset-manifest';
import { SILENCE, crossfadeTo, resumed, stepMix, type MusicMix } from './music-mix';
import { settings } from './settings';

/** A sound as Phaser plays it, with whichever audio the browser has: Web Audio, HTML5 or none. */
type Sound = ReturnType<Phaser.Game['sound']['add']>;

/** A frame longer than this (say, after the tab was hidden) counts as this long. */
const MAX_FRAME_MS = 100;

/** How many of the latest sound effects the debug info lists. */
const SOUNDS_LISTED = 10;

/** What `window.__game.audio()` reports, in dev and test builds. */
export interface AudioInfo {
  /** Audio waits for the player's first key press or touch, as browsers require. */
  readonly locked: boolean;
  /** The music asked for, or null for silence. */
  readonly music: string | null;
  /** Every track that can be heard, with its place in its fade and the volume it plays at. */
  readonly tracks: readonly {
    readonly key: string;
    readonly level: number;
    readonly target: 0 | 1;
    readonly volume: number;
  }[];
  /** How many times a track has started from the top: music that plays on doesn't count again. */
  readonly starts: number;
  /** The tracks a battle's music has paused, to carry on where they were once it's over. */
  readonly paused: readonly string[];
  /** The latest sound effects played, oldest first. */
  readonly sounds: readonly string[];
  /** The sound effects playing right now. */
  readonly playing: readonly string[];
}

/**
 * The music and the sound effects. Music loops, and crossfades from track to track as the mix in
 * src/systems/music-mix.ts says; sound effects play over it. Browsers keep audio locked until the
 * player first presses a key or touches the screen, which Phaser listens for: until then music
 * waits at the start of its fade, and sound effects are skipped rather than all going off at once.
 * See Audio in docs/TECH.md.
 */
class AudioManager {
  private game?: Phaser.Game;
  private mix: MusicMix = SILENCE;
  /** The sound playing each track in the mix. */
  private tracks = new Map<string, Sound>();
  /** The music a battle's has interrupted: the mix as it was, and its sounds, paused. */
  private interrupted: { mix: MusicMix; tracks: Map<string, Sound> } | null = null;
  /** When each sound effect last played, in the game's time. */
  private readonly lastPlayed = new Map<string, number>();
  private readonly played: string[] = [];
  private starts = 0;

  /** Keeps the music in step with the mix, every frame. */
  install(game: Phaser.Game): void {
    this.game = game;
    game.events.on(Phaser.Core.Events.STEP, (_time: number, delta: number) => {
      this.update(delta);
    });
  }

  /**
   * Crossfades to a track, `bgm.*` in the asset manifest, or with null fades out to silence. The
   * track playing already plays on.
   */
  playMusic(key: string | null, fadeMs = MUSIC_FADE_MS): void {
    if (key !== null) checkKey(key, 'bgm.');
    // During a battle, it's the music the battle's will give way to that changes.
    if (this.interrupted) {
      this.interrupted.mix = crossfadeTo(this.interrupted.mix, key, fadeMs);
      return;
    }
    this.mix = crossfadeTo(this.mix, key, fadeMs);
    this.sync();
  }

  /**
   * Plays a battle's music, `bgm.*`, at once: the music playing pauses where it is, until
   * `resumeMusic`. Asked for again before then, it changes the battle's track, crossfading over
   * `fadeMs`, or with null fades it out, as a battle won gives way to its fanfare.
   */
  interruptMusic(key: string | null, fadeMs = 0): void {
    if (key !== null) checkKey(key, 'bgm.');
    if (!this.interrupted) {
      for (const sound of this.tracks.values()) sound.pause();
      this.interrupted = { mix: this.mix, tracks: this.tracks };
      this.tracks = new Map();
      this.mix = SILENCE;
    }
    this.mix = crossfadeTo(this.mix, key, fadeMs);
    this.sync();
  }

  /**
   * Once a battle is over, its music stops, and what it paused fades back in from where it was.
   * Without a battle's music playing, it does nothing.
   */
  resumeMusic(): void {
    const { interrupted } = this;
    if (!interrupted) return;
    this.interrupted = null;
    for (const sound of this.tracks.values()) {
      sound.stop();
      sound.destroy();
    }
    this.tracks = interrupted.tracks;
    for (const sound of this.tracks.values()) sound.resume();
    this.mix = resumed(interrupted.mix, MUSIC_FADE_MS);
    this.sync();
  }

  /**
   * Plays a sound effect, `sfx.*` in the asset manifest, over the music: once, if it's asked for
   * again within SOUND_REPEAT_MS.
   */
  playSound(key: string): void {
    checkKey(key, 'sfx.');
    const { game } = this;
    if (!game || game.sound.locked || !game.cache.audio.exists(key)) return;
    const now = game.loop.time;
    const last = this.lastPlayed.get(key);
    if (last !== undefined && now - last < SOUND_REPEAT_MS) return;
    this.lastPlayed.set(key, now);
    game.sound.play(key, { volume: settings.soundVolume });
    this.played.push(key);
    if (this.played.length > SOUNDS_LISTED) this.played.shift();
  }

  /** How long a sound effect, `sfx.*`, lasts, in ms: 0 if it hasn't loaded. */
  soundLength(key: string): number {
    checkKey(key, 'sfx.');
    const data: unknown = this.game?.cache.audio.get(key);
    return data instanceof AudioBuffer ? Math.round(data.duration * 1000) : 0;
  }

  /**
   * Stops a sound effect, `sfx.*`, wherever it's playing: a jingle cut short by the next, rather
   * than heard under it.
   */
  stopSound(key: string): void {
    checkKey(key, 'sfx.');
    for (const sound of this.game?.sound.getAll(key) ?? []) {
      // Played once, a sound is let go when it finishes; stopped, it never does.
      sound.stop();
      sound.destroy();
    }
  }

  debugInfo(): AudioInfo {
    return {
      locked: this.game?.sound.locked ?? true,
      music: this.mix.current,
      tracks: this.mix.tracks.map(({ key, level, target }) => ({
        key,
        level,
        target,
        volume: this.tracks.get(key)?.volume ?? 0,
      })),
      starts: this.starts,
      paused: [...(this.interrupted?.tracks.keys() ?? [])],
      sounds: [...this.played],
      playing: (this.game?.sound.getAllPlaying() ?? [])
        .map((sound) => sound.key)
        .filter((key) => key.startsWith('sfx.')),
    };
  }

  private update(delta: number): void {
    if (!this.game || this.game.sound.locked) return;
    this.mix = stepMix(this.mix, Math.min(delta, MAX_FRAME_MS));
    this.sync();
  }

  /** Plays what the mix says: starts the tracks new to it, sets volumes, stops the ones gone. */
  private sync(): void {
    const { game } = this;
    if (!game) return;
    for (const { key, level } of this.mix.tracks) {
      let sound = this.tracks.get(key);
      if (!sound) {
        // A sound that didn't load (the browser plays neither file, say) stays quiet.
        if (!game.cache.audio.exists(key)) continue;
        sound = game.sound.add(key, { loop: true, volume: 0 });
        sound.play();
        this.tracks.set(key, sound);
        this.starts += 1;
      }
      // Web Audio keeps volumes as 32-bit floats, so they come back a little off.
      const volume = level * settings.musicVolume;
      if (Math.abs(sound.volume - volume) > 0.001) sound.setVolume(volume);
    }
    for (const [key, sound] of this.tracks) {
      if (this.mix.tracks.some((track) => track.key === key)) continue;
      sound.stop();
      sound.destroy();
      this.tracks.delete(key);
    }
  }
}

/**
 * Throws unless `key` is a sound of the kind asked for in the asset manifest: asking for one that
 * isn't is a mistake, which `npm run validate` catches in maps and scripts.
 */
function checkKey(key: string, kind: 'bgm.' | 'sfx.'): void {
  const entry: AssetEntry | undefined = (ASSETS as Readonly<Record<string, AssetEntry>>)[key];
  if (!key.startsWith(kind) || entry?.type !== 'audio') {
    throw new Error(`There's no ${kind === 'bgm.' ? 'music' : 'sound effect'} called ${key}`);
  }
}

/** The game's music and sound effects. `main.ts` installs it on the game. */
export const audio = new AudioManager();

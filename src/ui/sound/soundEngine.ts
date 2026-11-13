// Plays the sounds in soundConfig.ts with the Web Audio API.
// - Every sound goes through its own gain and a stereo pan, then the master
//   gain (volume, lowered while the AI voice speaks) and a limiter, so it can
//   never clip.
// - Small random changes of pitch and volume per play; at most MAX_VOICES at
//   once (more are skipped, not queued); fades in and out on every layer, so
//   there is no click at the start or end.
// - Nothing plays before the first tap or key press (browsers, iOS above all,
//   only allow audio after one), nor while the page is hidden.
// - A sound with a `file` plays that recording once loaded; callers do not
//   change.
import { MAX_PAN, MAX_VOICES, PITCH_VARIATION, SOUNDS, VOLUME_VARIATION } from "./soundConfig";
import type { SoundDefinition, SoundLayer, SoundName } from "./soundConfig";

// The parts of AudioContext the engine uses (tests pass a fake).
export type AudioContextLike = Pick<
  AudioContext,
  | "currentTime"
  | "state"
  | "sampleRate"
  | "destination"
  | "resume"
  | "createGain"
  | "createOscillator"
  | "createBiquadFilter"
  | "createBufferSource"
  | "createBuffer"
  | "createStereoPanner"
  | "createDynamicsCompressor"
>;

export interface PlayOptions {
  pitch?: number; // a multiplier on top of the variation (multi jump hops rise)
  pan?: number; // -1 (left edge of the board) to 1 (right edge)
  gain?: number; // a multiplier (softer variants)
}

export interface SoundEngine {
  /** Creates or resumes the audio context; call from a tap or key press. */
  unlock(): void;
  /** Schedules a sound now; false when it was skipped (locked, hidden, too many). */
  play(name: SoundName, options?: PlayOptions): boolean;
  setVolume(volume: number): void; // 0 to 1
  setDuck(factor: number): void; // 1 normally, lower while the voice speaks
  activeVoices(): number;
}

export interface SoundEngineOptions {
  createContext: () => AudioContextLike | null;
  random?: () => number;
  isHidden?: () => boolean;
  loadFile?: (context: AudioContextLike, url: string) => Promise<AudioBuffer>;
  sounds?: Readonly<Record<string, SoundDefinition>>;
}

const SILENT = 0.0001; // exponential ramps cannot reach 0

/** A random factor in [1 - spread, 1 + spread]. */
export function vary(random: () => number, spread: number): number {
  return 1 + (random() * 2 - 1) * spread;
}

/** The stereo position of a board column (0 to 7): gentle, at most MAX_PAN. */
export function columnPan(column: number): number {
  return Math.max(-1, Math.min(1, (column - 3.5) / 3.5));
}

export function createSoundEngine(options: SoundEngineOptions): SoundEngine {
  const random = options.random ?? Math.random;
  const isHidden = options.isHidden ?? (() => false);
  const sounds: Readonly<Record<string, SoundDefinition>> = options.sounds ?? SOUNDS;
  let context: AudioContextLike | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let volume = 0.6;
  let duck = 1;
  let voiceEnds: number[] = [];
  const recordings = new Map<string, AudioBuffer | "loading" | "failed">();

  const applyVolume = () => {
    if (context && master) master.gain.setTargetAtTime(volume * duck, context.currentTime, 0.03);
  };

  const setUp = (ctx: AudioContextLike) => {
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 4;
    limiter.ratio.value = 14;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    limiter.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = volume * duck;
    master.connect(limiter);
    // One second of white noise, shared by every noise layer.
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;
  };

  // A fade in to `peak` and an exponential fade out: no clicks.
  const envelope = (param: AudioParam, start: number, layer: SoundLayer, peak: number) => {
    const top = start + layer.attack / 1000;
    const end = top + layer.decay / 1000;
    param.setValueAtTime(0, start);
    param.linearRampToValueAtTime(peak, top);
    param.exponentialRampToValueAtTime(SILENT, end);
    return end;
  };

  const playLayer = (ctx: AudioContextLike, out: AudioNode, layer: SoundLayer, start: number, pitch: number): number => {
    const gain = ctx.createGain();
    gain.connect(out);
    const end = envelope(gain.gain, start, layer, layer.gain);
    if (layer.kind === "tone") {
      const osc = ctx.createOscillator();
      osc.type = layer.wave;
      osc.frequency.setValueAtTime(layer.freq * pitch, start);
      if (layer.freqEnd) osc.frequency.exponentialRampToValueAtTime(layer.freqEnd * pitch, end);
      osc.connect(gain);
      osc.start(start);
      osc.stop(end + 0.02);
    } else {
      const source = ctx.createBufferSource();
      source.buffer = noise;
      const filter = ctx.createBiquadFilter();
      filter.type = layer.filter;
      filter.Q.value = layer.q;
      filter.frequency.setValueAtTime(layer.freq * pitch, start);
      if (layer.freqEnd) filter.frequency.exponentialRampToValueAtTime(layer.freqEnd * pitch, end);
      source.connect(filter);
      filter.connect(gain);
      source.start(start, random() * 0.5); // a different slice of noise each time
      source.stop(end + 0.02);
    }
    return end;
  };

  const playRecording = (ctx: AudioContextLike, out: AudioNode, buffer: AudioBuffer, start: number, pitch: number): number => {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = pitch;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(1, start + 0.003);
    source.connect(gain);
    gain.connect(out);
    source.start(start);
    return start + buffer.duration / pitch;
  };

  const recordingFor = (ctx: AudioContextLike, definition: SoundDefinition): AudioBuffer | null => {
    if (!definition.file || !options.loadFile) return null;
    const known = recordings.get(definition.file);
    if (known && known !== "loading" && known !== "failed") return known;
    if (!known) {
      recordings.set(definition.file, "loading");
      options
        .loadFile(ctx, definition.file)
        .then((buffer) => recordings.set(definition.file!, buffer))
        .catch(() => recordings.set(definition.file!, "failed")); // keep the synthesized sound
    }
    return null;
  };

  return {
    unlock() {
      if (!context) {
        context = options.createContext();
        if (!context) return; // no Web Audio here: the game stays silent
        setUp(context);
      }
      if (context.state === "suspended") void context.resume().catch(() => {});
    },

    play(name, playOptions = {}) {
      const ctx = context;
      const definition = sounds[name];
      if (!ctx || !master || !definition || isHidden()) return false;
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
      const now = ctx.currentTime;
      voiceEnds = voiceEnds.filter((end) => end > now);
      if (voiceEnds.length >= MAX_VOICES) return false;

      const pitch = (playOptions.pitch ?? 1) * vary(random, PITCH_VARIATION);
      const level = definition.gain * (playOptions.gain ?? 1) * vary(random, VOLUME_VARIATION);
      const voice = ctx.createGain();
      voice.gain.value = level;
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, playOptions.pan ?? 0)) * MAX_PAN;
      voice.connect(panner);
      panner.connect(master);

      const start = now + 0.005; // a hair ahead, so the first ramp is exact
      const recording = recordingFor(ctx, definition);
      const end = recording
        ? playRecording(ctx, voice, recording, start, pitch)
        : Math.max(...definition.layers.map((layer) => playLayer(ctx, voice, layer, start + (layer.delay ?? 0) / 1000, pitch)));
      voiceEnds.push(end);
      return true;
    },

    setVolume(next) {
      volume = Math.max(0, Math.min(1, next));
      applyVolume();
    },

    setDuck(factor) {
      duck = Math.max(0, Math.min(1, factor));
      applyVolume();
    },

    activeVoices() {
      const now = context?.currentTime ?? 0;
      voiceEnds = voiceEnds.filter((end) => end > now);
      return voiceEnds.length;
    },
  };
}

// ---------- The app's engine ----------

function browserContext(): AudioContextLike | null {
  if (typeof window === "undefined") return null;
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  try {
    return Context ? new Context({ latencyHint: "interactive" }) : null;
  } catch {
    return null;
  }
}

async function fetchRecording(context: AudioContextLike, url: string): Promise<AudioBuffer> {
  const response = await fetch(url);
  const data = await response.arrayBuffer();
  return (context as AudioContext).decodeAudioData(data);
}

let shared: SoundEngine | null = null;

/** The app's one sound engine (created on first use). */
export function soundEngine(): SoundEngine {
  shared ??= createSoundEngine({
    createContext: browserContext,
    isHidden: () => typeof document !== "undefined" && document.hidden,
    loadFile: fetchRecording,
  });
  return shared;
}

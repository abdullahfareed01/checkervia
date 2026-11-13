// Every sound in the game, as numbers you can tune. The engine
// (soundEngine.ts) builds them with the Web Audio API: no audio files.
//
// HOW TO TUNE A SOUND
// - Each sound is a list of layers that start together (or after `delay`).
// - "noise" layer: a burst of white noise through a filter. `freq` is the
//   filter's centre in Hz (higher sounds brighter, wood sits around 2000 to
//   4000), `q` how narrow it is (higher is more ringing), `freqEnd` sweeps it.
// - "tone" layer: an oscillator. `wave` is its colour (sine is pure,
//   triangle a little richer), `freq` its pitch in Hz, `freqEnd` a glide.
// - `attack` is the fade in and `decay` the fade out, in milliseconds. Keep
//   attack at 1 ms or more, so there is never a click at the start.
// - `gain` is loudness from 0 to 1 per layer; the sound's own `gain`
//   scales all of its layers. The master limiter stops any clipping.
// - A sound must end within 300 ms (win and loss within 1200 ms); a test
//   checks this, so a too long tweak shows up at once.
// - To use a recording instead, set `file` (for example "/sounds/clack.mp3"
//   in public/sounds). The engine plays the file once it has loaded and
//   the synthesized layers until then; nothing else changes.

export interface NoiseLayer {
  readonly kind: "noise";
  readonly filter: "bandpass" | "lowpass" | "highpass";
  readonly freq: number;
  readonly freqEnd?: number;
  readonly q: number;
  readonly attack: number;
  readonly decay: number;
  readonly gain: number;
  readonly delay?: number;
}

export interface ToneLayer {
  readonly kind: "tone";
  readonly wave: "sine" | "triangle" | "square" | "sawtooth";
  readonly freq: number;
  readonly freqEnd?: number;
  readonly attack: number;
  readonly decay: number;
  readonly gain: number;
  readonly delay?: number;
}

export type SoundLayer = NoiseLayer | ToneLayer;

export interface SoundDefinition {
  readonly gain: number;
  readonly layers: readonly SoundLayer[];
  readonly file?: string; // a recording to use instead, when it has loaded
}

// The common wood clack: a short bright burst plus a low body.
const clackLayers = (body: number, bright: number): SoundLayer[] => [
  { kind: "noise", filter: "bandpass", freq: bright, q: 1.3, attack: 1, decay: 42, gain: 0.55 },
  { kind: "tone", wave: "sine", freq: body, freqEnd: body * 0.82, attack: 2, decay: 70, gain: 0.38 },
];

export const SOUNDS = {
  // Picking up a piece: a soft high tick.
  tick: {
    gain: 0.5,
    layers: [
      { kind: "tone", wave: "sine", freq: 1750, freqEnd: 1500, attack: 1, decay: 38, gain: 0.3 },
      { kind: "noise", filter: "highpass", freq: 5200, q: 0.7, attack: 1, decay: 14, gain: 0.12 },
    ],
  },
  // Putting it back: softer and a little lower.
  tickSoft: {
    gain: 0.35,
    layers: [{ kind: "tone", wave: "sine", freq: 1400, freqEnd: 1250, attack: 1, decay: 30, gain: 0.3 }],
  },
  // A simple move landing.
  clack: { gain: 0.7, layers: clackLayers(220, 3000) },
  // A capture: a heavier clack and a low thud.
  clackHeavy: {
    gain: 0.8,
    layers: [
      ...clackLayers(190, 2400),
      { kind: "tone", wave: "sine", freq: 92, freqEnd: 60, attack: 4, decay: 150, gain: 0.5 },
    ],
  },
  // One hop of a multi jump (the caller raises the pitch a little per hop).
  hop: { gain: 0.72, layers: clackLayers(230, 2900) },
  // Crowning: a soft two partial chime and a low thump.
  crown: {
    gain: 0.55,
    layers: [
      { kind: "tone", wave: "sine", freq: 1046, attack: 6, decay: 260, gain: 0.22 },
      { kind: "tone", wave: "sine", freq: 1568, attack: 6, decay: 200, gain: 0.12, delay: 30 },
      { kind: "tone", wave: "sine", freq: 110, freqEnd: 72, attack: 4, decay: 130, gain: 0.45 },
    ],
  },
  // A tap that does nothing: a dull low thud.
  thud: {
    gain: 0.6,
    layers: [
      { kind: "tone", wave: "sine", freq: 140, freqEnd: 92, attack: 3, decay: 110, gain: 0.5 },
      { kind: "noise", filter: "lowpass", freq: 650, q: 0.7, attack: 2, decay: 60, gain: 0.18 },
    ],
  },
  // The AI's bubble appears: a soft pop.
  pop: {
    gain: 0.45,
    layers: [
      { kind: "tone", wave: "sine", freq: 520, freqEnd: 780, attack: 3, decay: 70, gain: 0.32 },
      { kind: "noise", filter: "bandpass", freq: 1600, q: 1, attack: 1, decay: 24, gain: 0.08 },
    ],
  },
  // A new game: the pieces settle on the board, three soft clacks.
  settle: {
    gain: 0.4,
    layers: [
      { kind: "noise", filter: "bandpass", freq: 2700, q: 1.2, attack: 1, decay: 40, gain: 0.45 },
      { kind: "noise", filter: "bandpass", freq: 2500, q: 1.2, attack: 1, decay: 40, gain: 0.32, delay: 65 },
      { kind: "noise", filter: "bandpass", freq: 2300, q: 1.2, attack: 1, decay: 50, gain: 0.22, delay: 135 },
      { kind: "tone", wave: "sine", freq: 170, freqEnd: 140, attack: 3, decay: 120, gain: 0.25 },
    ],
  },
  // A win: a warm two note rising motif (C5 then G5, with a soft octave).
  win: {
    gain: 0.5,
    layers: [
      { kind: "tone", wave: "triangle", freq: 523.25, attack: 18, decay: 480, gain: 0.32 },
      { kind: "tone", wave: "sine", freq: 1046.5, attack: 18, decay: 300, gain: 0.08 },
      { kind: "tone", wave: "triangle", freq: 783.99, attack: 18, decay: 720, gain: 0.34, delay: 220 },
      { kind: "tone", wave: "sine", freq: 1567.98, attack: 18, decay: 420, gain: 0.07, delay: 220 },
    ],
  },
  // A loss: a low soft descending motif (A3 then E3).
  loss: {
    gain: 0.45,
    layers: [
      { kind: "tone", wave: "sine", freq: 220, attack: 22, decay: 480, gain: 0.4 },
      { kind: "tone", wave: "sine", freq: 164.81, attack: 22, decay: 680, gain: 0.42, delay: 260 },
    ],
  },
  // Resigning: a low thud.
  resign: {
    gain: 0.6,
    layers: [{ kind: "tone", wave: "sine", freq: 110, freqEnd: 70, attack: 4, decay: 170, gain: 0.55 }],
  },
  // A button: a very soft click.
  click: {
    gain: 0.3,
    layers: [
      { kind: "noise", filter: "highpass", freq: 3600, q: 0.7, attack: 1, decay: 12, gain: 0.25 },
      { kind: "tone", wave: "sine", freq: 2400, attack: 1, decay: 14, gain: 0.08 },
    ],
  },
  // A toggle: a tiny tick.
  toggle: {
    gain: 0.3,
    layers: [{ kind: "tone", wave: "sine", freq: 3000, freqEnd: 2600, attack: 1, decay: 18, gain: 0.22 }],
  },
  // A sheet opening or closing: a very soft air whoosh.
  whoosh: {
    gain: 0.3,
    layers: [{ kind: "noise", filter: "bandpass", freq: 700, freqEnd: 2200, q: 0.8, attack: 60, decay: 170, gain: 0.3 }],
  },
  // Consent accepted: a soft confirm, two notes up.
  confirm: {
    gain: 0.4,
    layers: [
      { kind: "tone", wave: "sine", freq: 660, attack: 3, decay: 110, gain: 0.25 },
      { kind: "tone", wave: "sine", freq: 880, attack: 3, decay: 130, gain: 0.25, delay: 70 },
    ],
  },
  // An error: a soft low double note.
  error: {
    gain: 0.45,
    layers: [
      { kind: "tone", wave: "sine", freq: 300, attack: 3, decay: 90, gain: 0.3 },
      { kind: "tone", wave: "sine", freq: 255, attack: 3, decay: 110, gain: 0.3, delay: 120 },
    ],
  },
} as const satisfies Record<string, SoundDefinition>;

export type SoundName = keyof typeof SOUNDS;

// Variation per play, so repeats do not sound mechanical.
export const PITCH_VARIATION = 0.03; // plus or minus 3 percent
export const VOLUME_VARIATION = 0.05; // plus or minus 5 percent
export const MAX_VOICES = 6; // sounds playing at once
export const MAX_PAN = 0.3; // stereo spread across the board's columns
export const MAX_SOUND_MS = 300;
export const MAX_LONG_SOUND_MS = 1200; // win and loss
export const LONG_SOUNDS: readonly SoundName[] = ["win", "loss"];

/** How long a sound lasts in milliseconds: its longest layer. */
export function soundLength(definition: SoundDefinition): number {
  return Math.max(...definition.layers.map((layer) => (layer.delay ?? 0) + layer.attack + layer.decay));
}

// Turns the text shown on screen into text that sounds right when spoken.
// It only ever gets text that is already on screen (after the dash rule and
// the language rules), and it only changes how that text is said:
// - emoji and decorative symbols go;
// - "lol" is said "L O L" and "lmao" "L M A O" (haha stays as it is);
// - square names are said letter then number ("C5" is "C 5"), and the move
//   arrow between them is said "to";
// - spaces are tidied and very long text is cut at a word.
import type { AiLevel } from "../../ai";

export const MAX_SPEECH_LENGTH = 400;

// Pictographs (emoji), their joiners and variation selectors, and skin tones.
const EMOJI = /[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}‍︎️]/gu;
// Symbols that mean nothing out loud (the capture count "×2" goes whole).
const SYMBOLS = /×\d*|[*#_~|<>[\]{}^=+\\/@$%&♛♚•·]/g;

export function prepareSpeech(text: string): string {
  let out = text.replace(EMOJI, " ");
  out = out.replace(/\s*(?:→|->|⟶|➜|➔)\s*/g, " to ");
  out = out.replace(SYMBOLS, " ");
  out = out.replace(/\bl+m+a+o+\b/gi, "L M A O");
  out = out.replace(/\bl+o+l+\b/gi, "L O L");
  // Square names: a board letter and a row number, said apart.
  out = out.replace(/\b([a-hA-H])([1-8])\b/g, (_, file: string, rank: string) => `${file.toUpperCase()} ${rank}`);
  out = out.replace(/\s+([,.!?;:])/g, "$1").replace(/\s+/g, " ").trim();
  if (out.length > MAX_SPEECH_LENGTH) {
    const cut = out.slice(0, MAX_SPEECH_LENGTH);
    out = cut.slice(0, Math.max(cut.lastIndexOf(" "), 1)).trim();
  }
  return out;
}

// Each level's voice, as small offsets on top of the player's own rate and
// pitch: Easy warmer and a little faster, Strongest a little lower and slower.
export const LEVEL_VOICE: Readonly<Record<AiLevel, { rate: number; pitch: number }>> = {
  1: { rate: 0.06, pitch: 0.08 },
  2: { rate: 0.02, pitch: 0.02 },
  3: { rate: -0.02, pitch: -0.04 },
  4: { rate: -0.08, pitch: -0.12 },
};

/** The rate and pitch to speak with, kept inside the browser's safe range. */
export function voiceStyle(level: AiLevel, rate: number, pitch: number): { rate: number; pitch: number } {
  const offset = LEVEL_VOICE[level];
  const clamp = (value: number) => Math.min(2, Math.max(0.5, Math.round(value * 100) / 100));
  return { rate: clamp(rate + offset.rate), pitch: clamp(pitch + offset.pitch) };
}

export interface VoiceLike {
  readonly name: string;
  readonly lang: string;
  readonly voiceURI: string;
  readonly localService?: boolean;
  readonly default?: boolean;
}

const GOOD_NAMES = /Natural|Neural|Online|Google|Enhanced|Premium/i;

/**
 * The voice to use: the player's choice if this device has it, otherwise the
 * best English one (names with Natural, Neural, Online, Google or Enhanced
 * first, then US or UK English, then the device default).
 */
export function pickVoice<V extends VoiceLike>(voices: readonly V[], chosen: string | null): V | null {
  if (chosen) {
    const found = voices.find((voice) => voice.voiceURI === chosen);
    if (found) return found;
  }
  const english = voices.filter((voice) => /^en([-_]|$)/i.test(voice.lang));
  if (english.length === 0) return voices.find((voice) => voice.default) ?? voices[0] ?? null;
  const score = (voice: V) =>
    (GOOD_NAMES.test(voice.name) ? 4 : 0) + (/^en[-_](US|GB)$/i.test(voice.lang) ? 2 : 0) + (voice.default ? 1 : 0);
  return [...english].sort((a, b) => score(b) - score(a))[0]!;
}

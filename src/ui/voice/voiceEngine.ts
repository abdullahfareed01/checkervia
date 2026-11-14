// The AI's voice, through the browser's speechSynthesis: no cost, no key, no
// network. Off by default. Rules:
// - never before the player has tapped or pressed a key on the page;
// - only the latest message: anything still speaking is cancelled first, so
//   lines never pile up in a queue;
// - silent while the page is hidden (and hiding it stops the voice);
// - the sound effects are lowered while it speaks.
import type { AiLevel } from "../../ai";
import { hasInteracted } from "../interaction";
import type { Settings } from "../settings";
import { soundEngine } from "../sound/soundEngine";
import { pickVoice, prepareSpeech, voiceStyle } from "./speechText";

// The parts of speechSynthesis and SpeechSynthesisUtterance used (tests fake them).
export interface SynthLike {
  speak(utterance: SpeechSynthesisUtterance): void;
  cancel(): void;
  getVoices(): SpeechSynthesisVoice[];
  readonly speaking: boolean;
  addEventListener?(type: "voiceschanged", listener: () => void): void;
}

export interface VoiceEngineOptions {
  synth: SynthLike | null;
  createUtterance: ((text: string) => SpeechSynthesisUtterance) | null;
  isHidden?: () => boolean;
  hasInteracted?: () => boolean;
  onSpeaking?: (speaking: boolean) => void; // lower and restore the effects
}

export interface VoiceEngine {
  /** Speech exists in this browser and it has at least one voice. */
  available(): boolean;
  voices(): SpeechSynthesisVoice[];
  /** Speaks `text` (prepared for speech) at this level and these settings. */
  speak(text: string, level: AiLevel, settings: Settings["voice"]): boolean;
  cancel(): void;
  /** On a first tap: iOS only allows speech after one. */
  unlock(): void;
  /** Calls `listener` when the device's voices arrive or change. */
  onVoicesChanged(listener: () => void): () => void;
}

// How far the sound effects drop while the voice speaks.
export const DUCK_LEVEL = 0.35;

export function createVoiceEngine(options: VoiceEngineOptions): VoiceEngine {
  const { synth, createUtterance } = options;
  const isHidden = options.isHidden ?? (() => false);
  const hasInteracted = options.hasInteracted ?? (() => true);
  const listeners = new Set<() => void>();
  let unlocked = false;
  let current: SpeechSynthesisUtterance | null = null;
  synth?.addEventListener?.("voiceschanged", () => listeners.forEach((listener) => listener()));

  const setSpeaking = (speaking: boolean) => options.onSpeaking?.(speaking);
  const stop = () => {
    if (!synth) return;
    current = null;
    synth.cancel();
    setSpeaking(false);
  };

  return {
    available: () => synth !== null && createUtterance !== null && synth.getVoices().length > 0,
    voices: () => synth?.getVoices() ?? [],

    speak(text, level, settings) {
      if (!synth || !createUtterance || !settings.enabled || isHidden() || !hasInteracted()) return false;
      const spoken = prepareSpeech(text);
      if (!spoken) return false;
      stop(); // only the latest message
      const utterance = createUtterance(spoken);
      const voice = pickVoice(synth.getVoices(), settings.voiceURI);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      }
      const style = voiceStyle(level, settings.rate, settings.pitch);
      utterance.rate = style.rate;
      utterance.pitch = style.pitch;
      utterance.volume = settings.volume;
      const done = () => {
        if (current === utterance) {
          current = null;
          setSpeaking(false);
        }
      };
      utterance.onend = done;
      utterance.onerror = done;
      current = utterance;
      setSpeaking(true);
      synth.speak(utterance);
      return true;
    },

    cancel: stop,

    unlock() {
      if (unlocked || !synth || !createUtterance) return;
      unlocked = true;
      // An empty, silent utterance inside the gesture lets iOS speak later.
      const warmUp = createUtterance(" ");
      warmUp.volume = 0;
      synth.speak(warmUp);
    },

    onVoicesChanged(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// ---------- The app's voice ----------

let shared: VoiceEngine | null = null;

/**
 * The app's one voice engine (created on first use): it waits for the first
 * tap and lowers the sound effects while it speaks.
 */
export function voiceEngine(): VoiceEngine {
  if (!shared) {
    const hasSpeech = typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";
    shared = createVoiceEngine({
      synth: hasSpeech ? window.speechSynthesis : null,
      createUtterance: hasSpeech ? (text) => new window.SpeechSynthesisUtterance(text) : null,
      isHidden: () => typeof document !== "undefined" && document.hidden,
      hasInteracted,
      onSpeaking: (speaking) => soundEngine().setDuck(speaking ? DUCK_LEVEL : 1),
    });
  }
  return shared;
}

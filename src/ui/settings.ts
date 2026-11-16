// The player's settings (sound, haptics, AI voice, animation, board, chat).
// One typed store: defaults, a version number, saved to localStorage, checked
// field by field on load (anything broken falls back to its default), and
// change subscriptions for React. No personal data is kept here.
import { useSyncExternalStore } from "react";

export const SETTINGS_VERSION = 1;
export const SETTINGS_KEY = "checkervia.settings";

export type HapticIntensity = "off" | "light" | "standard" | "strong";
export type AnimationLevel = "off" | "reduced" | "standard" | "cinematic";
export type BoardTheme = "classic" | "slate" | "felt" | "minimal";
export type PieceStyle = "classic" | "flat" | "ringed";
export type Coordinates = "off" | "edge" | "squares";

export interface Settings {
  readonly version: typeof SETTINGS_VERSION;
  readonly sound: {
    readonly enabled: boolean;
    readonly volume: number; // 0 to 1
    readonly effects: boolean; // board and game sounds
    readonly interface: boolean; // buttons, toggles, sheets
  };
  readonly haptics: HapticIntensity;
  readonly voice: {
    readonly enabled: boolean;
    readonly voiceURI: string | null; // null: the best English voice on the device
    readonly rate: number; // 0.5 to 2
    readonly pitch: number; // 0.5 to 2
    readonly volume: number; // 0 to 1
    readonly read: {
      readonly reactions: boolean;
      readonly greetings: boolean;
      readonly gameOver: boolean;
      readonly idle: boolean;
      readonly tips: boolean; // Tips and Why content
    };
  };
  readonly animation: {
    readonly level: AnimationLevel;
    readonly speed: number; // 0.75 to 1.5
  };
  readonly board: {
    readonly theme: BoardTheme;
    readonly pieces: PieceStyle;
    readonly coordinates: Coordinates;
    readonly legalMoves: boolean;
    readonly lastMove: boolean;
  };
  readonly chat: {
    readonly bubbles: boolean; // off: the AI's lines are neither shown nor spoken (D87)
  };
  readonly view: {
    readonly focus: boolean; // focus mode: the big board, the cards and the AI only (D87)
  };
}

/** The defaults. Animation is Reduced when the system asks for less motion. */
export function defaultSettings(prefersReducedMotion: boolean): Settings {
  return {
    version: SETTINGS_VERSION,
    sound: { enabled: true, volume: 0.6, effects: true, interface: true },
    haptics: "standard",
    voice: {
      enabled: false,
      voiceURI: null,
      rate: 1,
      pitch: 1,
      volume: 1,
      read: { reactions: true, greetings: true, gameOver: true, idle: false, tips: false },
    },
    animation: { level: prefersReducedMotion ? "reduced" : "standard", speed: 1 },
    board: { theme: "classic", pieces: "classic", coordinates: "squares", legalMoves: true, lastMove: true },
    chat: { bubbles: true },
    view: { focus: false },
  };
}

// ---------- Checking stored data ----------

type Raw = Record<string, unknown>;

const isRecord = (value: unknown): value is Raw => typeof value === "object" && value !== null && !Array.isArray(value);
const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);
const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;
// A number inside [min, max]; anything else (NaN, text, out of range) is the default.
const range = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
const part = (value: unknown): Raw => (isRecord(value) ? value : {});

export const HAPTIC_INTENSITIES: readonly HapticIntensity[] = ["off", "light", "standard", "strong"];
export const ANIMATION_LEVELS: readonly AnimationLevel[] = ["off", "reduced", "standard", "cinematic"];
export const BOARD_THEMES: readonly BoardTheme[] = ["classic", "slate", "felt", "minimal"];
export const PIECE_STYLES: readonly PieceStyle[] = ["classic", "flat", "ringed"];
export const COORDINATES: readonly Coordinates[] = ["off", "edge", "squares"];

/**
 * Settings from stored text. Unreadable text or another version gives the
 * defaults; otherwise each field is checked on its own and a bad one takes
 * its default, so one broken value never resets everything.
 */
export function parseSettings(text: string | null, defaults: Settings): Settings {
  if (!text) return defaults;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return defaults;
  }
  if (!isRecord(data) || data.version !== SETTINGS_VERSION) return defaults;
  return sanitize(data, defaults);
}

/** Every field checked against its type and range, with the defaults for gaps. */
export function sanitize(data: Raw, d: Settings): Settings {
  const sound = part(data.sound);
  const voice = part(data.voice);
  const read = part(voice.read);
  const animation = part(data.animation);
  const board = part(data.board);
  const chat = part(data.chat);
  const view = part(data.view);
  return {
    version: SETTINGS_VERSION,
    sound: {
      enabled: bool(sound.enabled, d.sound.enabled),
      volume: range(sound.volume, 0, 1, d.sound.volume),
      effects: bool(sound.effects, d.sound.effects),
      interface: bool(sound.interface, d.sound.interface),
    },
    haptics: oneOf(data.haptics, HAPTIC_INTENSITIES, d.haptics),
    voice: {
      enabled: bool(voice.enabled, d.voice.enabled),
      voiceURI: typeof voice.voiceURI === "string" && voice.voiceURI.length < 300 ? voice.voiceURI : d.voice.voiceURI,
      rate: range(voice.rate, 0.5, 2, d.voice.rate),
      pitch: range(voice.pitch, 0.5, 2, d.voice.pitch),
      volume: range(voice.volume, 0, 1, d.voice.volume),
      read: {
        reactions: bool(read.reactions, d.voice.read.reactions),
        greetings: bool(read.greetings, d.voice.read.greetings),
        gameOver: bool(read.gameOver, d.voice.read.gameOver),
        idle: bool(read.idle, d.voice.read.idle),
        tips: bool(read.tips, d.voice.read.tips),
      },
    },
    animation: {
      level: oneOf(animation.level, ANIMATION_LEVELS, d.animation.level),
      speed: range(animation.speed, 0.75, 1.5, d.animation.speed),
    },
    board: {
      theme: oneOf(board.theme, BOARD_THEMES, d.board.theme),
      pieces: oneOf(board.pieces, PIECE_STYLES, d.board.pieces),
      coordinates: oneOf(board.coordinates, COORDINATES, d.board.coordinates),
      legalMoves: bool(board.legalMoves, d.board.legalMoves),
      lastMove: bool(board.lastMove, d.board.lastMove),
    },
    chat: { bubbles: bool(chat.bubbles, d.chat.bubbles) },
    view: { focus: bool(view.focus, d.view.focus) },
  };
}

// ---------- The store ----------

export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SettingsStore {
  get(): Settings;
  /** Applies a change (checked like stored data) and saves it. */
  update(change: (current: Settings) => Settings): void;
  reset(): void;
  subscribe(listener: () => void): () => void;
}

export function createSettingsStore(options: { storage: SettingsStorage | null; prefersReducedMotion: boolean }): SettingsStore {
  const defaults = defaultSettings(options.prefersReducedMotion);
  let current = defaults;
  try {
    current = parseSettings(options.storage?.getItem(SETTINGS_KEY) ?? null, defaults);
  } catch {
    // Storage blocked (private mode, sandbox): defaults, kept in memory only.
  }
  const listeners = new Set<() => void>();

  const commit = (next: Settings) => {
    current = next;
    try {
      options.storage?.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      // Full or blocked storage: the change still applies for this visit.
    }
    listeners.forEach((listener) => listener());
  };

  return {
    get: () => current,
    update: (change) => commit(sanitize(change(current) as unknown as Raw, defaults)),
    reset: () => {
      try {
        options.storage?.removeItem(SETTINGS_KEY);
      } catch {
        // As above.
      }
      current = defaults;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function browserStorage(): SettingsStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function systemPrefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

let shared: SettingsStore | null = null;

/** The app's one store (created on first use, so tests can work without a browser). */
export function settingsStore(): SettingsStore {
  shared ??= createSettingsStore({ storage: browserStorage(), prefersReducedMotion: systemPrefersReducedMotion() });
  return shared;
}

/** The current settings in a component; it re-renders when they change. */
export function useSettings(): Settings {
  const store = settingsStore();
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

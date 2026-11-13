// What the player hears and feels for each event in the game: one sound
// (from sound/soundConfig.ts) and one vibration pattern per event, filtered
// by the settings. Turn changes and the AI thinking make no sound and no
// vibration on purpose (they would be constant noise).
import type { Move, Position } from "../engine";
import { pieceAt, samePosition } from "../engine";
import type { GameState } from "../state/gameReducer";
import { isCaptureMandatory } from "../state/selectors";
import { haptics } from "./haptics";
import type { Settings } from "./settings";
import { settingsStore } from "./settings";
import { columnPan, soundEngine } from "./sound/soundEngine";
import type { PlayOptions } from "./sound/soundEngine";
import type { SoundName } from "./sound/soundConfig";

export type FeedbackEvent =
  | "select"
  | "deselect"
  | "move"
  | "capture"
  | "hop"
  | "crown"
  | "invalid"
  | "captureRequired"
  | "aiBubble"
  | "idleBubble"
  | "gameStart"
  | "win"
  | "loss"
  | "resign"
  | "button"
  | "toggle"
  | "sheet"
  | "consent"
  | "error";

interface FeedbackEntry {
  readonly sound: SoundName;
  readonly gain?: number; // a softer variant of a shared sound
  readonly haptic: readonly number[] | null; // vibrate, pause, vibrate, ... in ms
  readonly group: "effects" | "interface"; // which sound switch controls it
}

export const FEEDBACK: Readonly<Record<FeedbackEvent, FeedbackEntry>> = {
  select: { sound: "tick", haptic: [8], group: "effects" },
  deselect: { sound: "tickSoft", haptic: null, group: "effects" },
  move: { sound: "clack", haptic: [12], group: "effects" },
  capture: { sound: "clackHeavy", haptic: [25], group: "effects" },
  hop: { sound: "hop", haptic: [10], group: "effects" }, // the last hop: FINAL_HOP_HAPTIC
  crown: { sound: "crown", haptic: [20, 40, 30], group: "effects" },
  invalid: { sound: "thud", haptic: [15, 40, 15], group: "effects" },
  captureRequired: { sound: "thud", gain: 0.6, haptic: [10, 30, 10], group: "effects" },
  aiBubble: { sound: "pop", haptic: null, group: "effects" },
  idleBubble: { sound: "pop", gain: 0.55, haptic: null, group: "effects" },
  gameStart: { sound: "settle", haptic: null, group: "effects" },
  win: { sound: "win", haptic: [30, 60, 30, 60, 80], group: "effects" },
  loss: { sound: "loss", haptic: [60], group: "effects" },
  resign: { sound: "resign", haptic: [40], group: "effects" },
  button: { sound: "click", haptic: [6], group: "interface" },
  toggle: { sound: "toggle", haptic: [8], group: "interface" },
  sheet: { sound: "whoosh", haptic: null, group: "interface" },
  consent: { sound: "confirm", haptic: [10], group: "interface" },
  error: { sound: "error", haptic: [20, 50, 20], group: "effects" },
};

// The last hop of a multi jump lands harder.
export const FINAL_HOP_HAPTIC: readonly number[] = [25];
// Each hop of a multi jump sounds a little higher than the one before.
export const HOP_PITCH_STEP = 0.04;

export interface FeedbackOptions {
  column?: number; // the board column it happens on (stereo position)
  hop?: number; // which hop of a multi jump, from 0
  finalHop?: boolean;
}

export interface FeedbackPlan {
  sound: { name: SoundName; options: PlayOptions } | null;
  haptic: readonly number[] | null;
}

/** What to play for an event under these settings (pure, for tests). */
export function planFeedback(event: FeedbackEvent, options: FeedbackOptions, settings: Settings): FeedbackPlan {
  const entry = FEEDBACK[event];
  const soundOn = settings.sound.enabled && settings.sound.volume > 0 && settings.sound[entry.group];
  const pitch = event === "hop" ? 1 + HOP_PITCH_STEP * (options.hop ?? 0) : 1;
  const haptic = event === "hop" && options.finalHop ? FINAL_HOP_HAPTIC : entry.haptic;
  return {
    sound: soundOn
      ? { name: entry.sound, options: { pitch, gain: entry.gain ?? 1, pan: options.column === undefined ? 0 : columnPan(options.column) } }
      : null,
    haptic: settings.haptics === "off" ? null : haptic,
  };
}

/** Plays an event's sound and vibration, as the current settings allow. */
export function playFeedback(event: FeedbackEvent, options: FeedbackOptions = {}): void {
  const settings = settingsStore().get();
  const plan = planFeedback(event, options, settings);
  const engine = soundEngine();
  engine.setVolume(settings.sound.volume);
  if (plan.sound) engine.play(plan.sound.name, plan.sound.options);
  if (plan.haptic) haptics().pulse(plan.haptic, settings.haptics);
}

// ---------- Which event a board click or a move is ----------

/**
 * The event for a click on the board, from the state before and after it.
 * Moves are not reported here (they sound when the piece lands); clicks on
 * an empty square with nothing picked up, or while the board is locked, make
 * no sound.
 */
export function clickFeedback(before: GameState, after: GameState, position: Position): FeedbackEvent | null {
  if (before.winner || before.aiPhase !== "idle" || before.viewIndex !== null) return null;
  if (after.history.length !== before.history.length) return null; // a move: it sounds on landing
  if (after.selected && (!before.selected || !samePosition(after.selected, before.selected))) return "select";
  if (after.pendingRoutes.length > 0) return "select"; // two routes: pick the next landing square

  const piece = pieceAt(before.board, position);
  const ownPiece = piece?.player === before.currentPlayer;
  if (before.selected && samePosition(before.selected, position)) return "deselect";
  // Tapping a piece that cannot move, or a square the picked up piece cannot
  // reach. When a capture is mandatory, that is the likely reason: softer.
  if (ownPiece || (before.selected && !piece)) return isCaptureMandatory(before) ? "captureRequired" : "invalid";
  if (piece) return "invalid"; // the other side's piece
  return null;
}

export interface MoveBeat {
  event: FeedbackEvent;
  options: FeedbackOptions;
}

/**
 * What a move sounds like, landing by landing: a clack for a step, a heavy
 * clack for one capture, rising hops for a multi jump (the last one harder),
 * then the crown if the piece became a King.
 */
export function moveFeedback(move: Move, crowned: boolean): MoveBeat[] {
  const hops = move.path.length;
  const beats: MoveBeat[] = move.path.map((square, index) => {
    if (move.captured.length === 0) return { event: "move", options: { column: square.col } };
    if (hops === 1) return { event: "capture", options: { column: square.col } };
    return { event: "hop", options: { column: square.col, hop: index, finalHop: index === hops - 1 } };
  });
  if (crowned) beats.push({ event: "crown", options: { column: move.to.col } });
  return beats;
}

// The AI's face (D64b): how the robot looks right now, worked out from the
// game state alone, so it can be tested without a browser. The robot is a
// cocky rival (D43): it laughs at the player's slips and at its own big
// captures, looks pleased with a capture, gets angry when the player plays
// well or takes its pieces, and is shocked (but still confident: one brow
// up and a smirk) when the player takes two or more at once (D69).
import { aiSideOf } from "../state/gameReducer";
import type { GameState, HistoryEntry } from "../state/gameReducer";

export type AiMood =
  | "neutral"
  | "thinking"
  | "happy"
  | "laughing"
  | "angry"
  | "shocked"
  | "smug"
  | "nervous"
  | "defeated"
  | "wink" // D72: the start of a game
  | "starstruck" // D72: it took three or more pieces in one move
  | "proud" // D72: it made a King
  | "annoyed" // D72: the player made a King
  | "sleepy"; // D72: the player has been idle a long time (set by App)

// With nothing else going on (D71), its face follows its chance to win:
// smug when it is clearly winning, nervous when it is clearly losing.
export const SMUG_FROM = 0.8;
export const NERVOUS_UNDER = 0.2;

const capturedBy = (entry: HistoryEntry | undefined, player: string): number =>
  entry?.player === player && entry.move ? entry.move.captured.length : 0;

/** True when `entry`'s move, by `player`, made a King (D72). */
function crownedBy(entry: HistoryEntry | undefined, previous: HistoryEntry | undefined, player: string): boolean {
  if (entry?.player !== player || !entry.move || !previous) return false;
  const { from, to } = entry.move;
  return previous.board[from.row]?.[from.col]?.kind === "man" && entry.board[to.row]?.[to.col]?.kind === "king";
}

/**
 * The robot's face for the game as it is now:
 * - the game is over: laughing when the AI won, sulking (defeated) when it
 *   lost (D71);
 * - while it thinks: thinking, or shocked right after the player took two
 *   or more of its pieces;
 * - after its move: laughing at the player's blunder or at its own capture
 *   of two or more pieces, angry after the player's great move, shocked
 *   when the player's move before took two or more of its pieces, angry
 *   when it took one, happy after taking one piece;
 * - after the player's move (before it replies): shocked if it took two or
 *   more of its pieces, angry if it took one;
 * - a new game: a wink (D72); its move took three or more pieces:
 *   starstruck; it made a King: proud; the player made a King: annoyed;
 * - otherwise its chance to win decides (D71): smug from 80%, nervous under
 *   20%, else neutral; and in two player games or while reviewing: neutral.
 */
export function aiMood(state: GameState, aiChance = 0.5): AiMood {
  if (state.mode !== "vs-ai" || state.viewIndex !== null) return "neutral";
  const ai = aiSideOf(state);
  if (state.abandoned) return "angry"; // it reported the player (D85)
  if (state.winner) return state.winner === ai ? "laughing" : "defeated";
  const calm = aiChance >= SMUG_FROM ? "smug" : aiChance < NERVOUS_UNDER ? "nervous" : "neutral";

  const last = state.history[state.history.length - 1];
  const before = state.history[state.history.length - 2];
  const human = state.humanSide;
  const earlier = state.history[state.history.length - 3];
  // The shock (D69) or the eye roll at the player's new King (D72) come at
  // once, while it thinks about its reply.
  if (state.aiPhase === "thinking") {
    if (capturedBy(last, human) >= 2) return "shocked";
    return crownedBy(last, before, human) ? "annoyed" : "thinking";
  }
  if (state.history.length === 1) return "wink"; // a new game (D72)
  if (last?.player === ai) {
    const verdict = last.judgement?.verdict;
    if (verdict === "blunder") return "laughing";
    if (verdict === "great") return "angry";
    const took = capturedBy(last, ai);
    if (took >= 3) return "starstruck";
    if (took >= 2) return "laughing";
    if (capturedBy(before, human) >= 2) return "shocked";
    if (crownedBy(last, before, ai)) return "proud";
    if (capturedBy(before, human) > 0) return "angry";
    if (crownedBy(before, earlier, human)) return "annoyed";
    if (took === 1) return "happy";
    return calm;
  }
  if (capturedBy(last, human) >= 2) return "shocked";
  if (capturedBy(last, human) > 0) return "angry";
  if (crownedBy(last, before, human)) return "annoyed";
  return calm;
}

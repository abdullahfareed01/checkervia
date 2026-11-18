// What the AI's chat bubble shows (Changes 2 to 4). Pure: worked out from
// the game state and the AI's local lines, so it can be tested without a
// browser.
import { aiSideOf, isGameOver } from "../state/gameReducer";
import type { GameState } from "../state/gameReducer";
import type { BubbleMessage } from "./ChatBubble";

// Lines from the local banks (Change 4), already picked for this game.
export interface ExtraLines {
  readonly greeting?: string | null | undefined; // at the start of a game
  readonly idle?: { readonly key: string; readonly text: string; readonly count: number } | null | undefined; // the player is slow (count: the n-th idle line this turn)
  readonly hint?: { readonly index: number; readonly text: string } | null | undefined; // the resign hint, for one AI move
  readonly pressure?: { readonly key: string; readonly text: string | null; readonly count: number } | null | undefined; // an ask to resign, or the dots before it (D69, D70)
}

/**
 * The bubble for the live game, most recent event first:
 * - typing dots while the AI thinks;
 * - once the position is proven lost and the AI's own line has had its 10
 *   seconds: typing dots for 5 seconds, then an ask to resign (D69, D70;
 *   only the first of a turn is read out);
 * - an idle line (no Why?; only the first of a turn is read out);
 * - after an AI move: the resign hint if the engine proved the position
 *   lost, else the AI's reaction (with Why?), else nothing (D65: no "I
 *   played E3 → D4." line);
 * - at the start of a game: the greeting (no Why?). When the AI opens (the
 *   player is White, D81) its opening line comes after its first move,
 *   unless the model already said something then (D85).
 * A line stays while the player picks up and puts back pieces, and goes
 * when their move is played (the last entry is then theirs) (D65).
 * Nothing in two player games, while reviewing an older position, or once
 * the game is over (the result panel speaks then).
 */
export function reactionBubble(state: GameState, extra: ExtraLines = {}): BubbleMessage | null {
  if (state.mode !== "vs-ai" || state.viewIndex !== null || isGameOver(state)) return null;
  if (state.aiPhase === "thinking") return { key: `thinking-${state.aiRequestId}`, text: null, tone: "banter", why: false };
  if (extra.pressure) {
    const { key, text, count } = extra.pressure;
    return { key, text, tone: "banter", why: false, announce: text !== null && count === 1 };
  }
  if (extra.idle) return { key: extra.idle.key, text: extra.idle.text, tone: "banter", why: false, announce: extra.idle.count === 1 };

  const index = state.history.length - 1;
  const last = state.history[index]!;
  if (last.player === aiSideOf(state) && last.move) {
    if (extra.hint?.index === index) return { key: `hint-${index}`, text: extra.hint.text, tone: "banter", why: true };
    if (!last.reaction) return index === 1 && extra.greeting ? { key: "greeting", text: extra.greeting, tone: "banter", why: false } : null;
    const tone = last.judgement ? (last.judgement.verdict === "great" ? "respect" : "roast") : "banter";
    return { key: `move-${index}`, text: last.reaction, tone, why: true };
  }
  if (index === 0 && extra.greeting) return { key: "greeting", text: extra.greeting, tone: "banter", why: false };
  return null;
}

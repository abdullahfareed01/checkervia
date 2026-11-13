// What the AI's chat bubble shows (Changes 2 to 4). Pure: worked out from
// the game state and the AI's local lines, so it can be tested without a
// browser.
import { AI_PLAYER } from "../state/gameReducer";
import type { GameState } from "../state/gameReducer";
import type { BubbleMessage } from "./ChatBubble";
import { moveText } from "./notation";

// Lines from the local banks (Change 4), already picked for this game.
export interface ExtraLines {
  readonly greeting?: string | null | undefined; // at the start of a game
  readonly idle?: { readonly key: string; readonly text: string } | null | undefined; // the player is slow
  readonly hint?: { readonly index: number; readonly text: string } | null | undefined; // the resign hint, for one AI move
}

/**
 * The bubble for the live game, most recent event first:
 * - typing dots while the AI thinks;
 * - an idle line (no Why?);
 * - nothing once the player picked up a piece in this position
 *   (`dismissedAt` is the history length when they did);
 * - after an AI move: the resign hint if the engine proved the position
 *   lost, else the AI's reaction, or "I played E3 → D4." (with Why?);
 * - at the start of a game: the greeting (no Why?).
 * Nothing in two player games, while reviewing an older position, or once
 * the game is over (the result panel speaks then).
 */
export function reactionBubble(state: GameState, dismissedAt: number, extra: ExtraLines = {}): BubbleMessage | null {
  if (state.mode !== "vs-ai" || state.viewIndex !== null || state.winner) return null;
  if (state.aiPhase === "thinking") return { key: `thinking-${state.aiRequestId}`, text: null, tone: "banter", why: false };
  if (extra.idle) return { key: extra.idle.key, text: extra.idle.text, tone: "banter", why: false };
  if (dismissedAt === state.history.length) return null;

  const index = state.history.length - 1;
  const last = state.history[index]!;
  if (last.player === AI_PLAYER && last.move) {
    if (extra.hint?.index === index) return { key: `hint-${index}`, text: extra.hint.text, tone: "banter", why: true };
    const tone = last.judgement ? (last.judgement.verdict === "great" ? "respect" : "roast") : "banter";
    return { key: `move-${index}`, text: last.reaction ?? `I played ${moveText(last.move)}.`, tone, why: true };
  }
  if (index === 0 && extra.greeting) return { key: "greeting", text: extra.greeting, tone: "banter", why: false };
  return null;
}

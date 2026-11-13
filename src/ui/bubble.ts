// What the AI's chat bubble shows (Changes 2 and 3). Pure: worked out from
// the game state, so it can be tested without a browser.
import { AI_PLAYER } from "../state/gameReducer";
import type { GameState } from "../state/gameReducer";
import type { BubbleMessage } from "./ChatBubble";
import { moveText } from "./notation";

/**
 * The bubble for the live game: typing dots while the AI thinks, then its
 * reaction to the player's move (or "I played E3 → D4." when it had none),
 * until the player starts their next move. `dismissedAt` is the history
 * length at which the player last picked up a piece: the bubble for that
 * position is cleared. Nothing in two player games, while reviewing an
 * older position, or once the game is over.
 */
export function reactionBubble(state: GameState, dismissedAt: number): BubbleMessage | null {
  if (state.mode !== "vs-ai" || state.viewIndex !== null || state.winner) return null;
  if (state.aiPhase === "thinking") return { key: `thinking-${state.aiRequestId}`, text: null, tone: "banter", why: false };

  const last = state.history[state.history.length - 1]!;
  if (last.player !== AI_PLAYER || !last.move || dismissedAt === state.history.length) return null;
  const tone = last.judgement ? (last.judgement.verdict === "great" ? "respect" : "roast") : "banter";
  return {
    key: `move-${state.history.length - 1}`,
    text: last.reaction ?? `I played ${moveText(last.move)}.`,
    tone,
    why: true,
  };
}

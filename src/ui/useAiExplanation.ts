import { useCallback, useEffect, useMemo, useState } from "react";
import { AI_PLAYER } from "../state/gameReducer";
import type { GameMode } from "../state/gameReducer";
import type { DisplayedPosition } from "../state/history";
import { describeFacts, describeLookahead, moveFacts } from "../state/moveFacts";
import type { FactLine } from "../state/moveFacts";
import { moveText } from "./notation";

// Everything shown about the AI move on screen: in the speech bubble, the
// sidebar note and the "Why this move?" popup.
export interface AiExplanation {
  readonly index: number; // history index of the move (its move number)
  readonly label: string; // e.g. "3,2 → 4,1"
  readonly reason: string | null; // the model's own words (not checked)
  readonly reaction: string | null; // its line about the player's move before
  readonly facts: readonly FactLine[]; // checked by the engine
}

/** The explanation of the AI move on screen, or null if it is not an AI move. */
export function explainShown(mode: GameMode, shown: DisplayedPosition): AiExplanation | null {
  if (mode !== "vs-ai" || shown.player !== AI_PLAYER || !shown.move || !shown.previousBoard) return null;
  return {
    index: shown.index,
    label: moveText(shown.move),
    reason: shown.reason,
    reaction: shown.reaction,
    facts: [
      // The engine's verdict on the player's move, which the reaction was about.
      ...(shown.judgement
        ? [
            {
              tone: shown.judgement.verdict === "great" ? ("good" as const) : ("bad" as const),
              text: `Your previous move: ${shown.judgement.verdict === "great" ? "a great move" : "a blunder"}. ${shown.judgement.detail}`,
            },
          ]
        : []),
      ...describeFacts(moveFacts(shown.previousBoard, shown.move, AI_PLAYER)),
      ...(shown.lookahead ? describeLookahead(shown.lookahead) : []),
    ],
  };
}

/**
 * The explanation for the position on screen, plus whether the popup is
 * open. Showing another position closes the popup.
 */
export function useAiExplanation(mode: GameMode, shown: DisplayedPosition) {
  const explanation = useMemo(() => explainShown(mode, shown), [mode, shown.index, shown.move]);
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [shown.index]);
  const openWhy = useCallback(() => setOpen(true), []);
  const closeWhy = useCallback(() => setOpen(false), []);
  return { explanation, open: open && explanation !== null, openWhy, closeWhy };
}

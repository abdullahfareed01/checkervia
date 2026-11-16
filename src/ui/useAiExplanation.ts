import { useCallback, useEffect, useMemo, useState } from "react";
import type { Player } from "../engine";
import type { GameMode } from "../state/gameReducer";
import type { DisplayedPosition } from "../state/history";
import { describeFacts, describeLookahead, moveFacts } from "../state/moveFacts";
import type { FactLine } from "../state/moveFacts";
import { moveText } from "./notation";

// Everything shown about the AI move on screen: in the chat bubble, the
// sidebar note and behind "Why?".
export interface AiExplanation {
  readonly index: number; // history index of the move (its move number)
  readonly label: string; // e.g. "3,2 → 4,1"
  readonly reason: string | null; // the model's own words (not checked)
  readonly reaction: string | null; // its line about the player's move before
  readonly facts: readonly FactLine[]; // checked by the engine
}

/**
 * The explanation of the AI move on screen, or null if it is not an AI move.
 * `aiSide`: the AI's colour in this game (D81).
 */
export function explainShown(mode: GameMode, shown: DisplayedPosition, aiSide: Player = "white"): AiExplanation | null {
  if (mode !== "vs-ai" || shown.player !== aiSide || !shown.move || !shown.previousBoard) return null;
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
      ...describeFacts(moveFacts(shown.previousBoard, shown.move, aiSide)),
      ...(shown.lookahead ? describeLookahead(shown.lookahead, shown.level) : []),
    ],
  };
}

/**
 * The explanation for the position on screen, plus whether "Why?" is open.
 * It starts collapsed for every new move and every new game (a mode or level
 * change starts a new game), and when another position is shown.
 */
export function useAiExplanation(mode: GameMode, shown: DisplayedPosition, aiSide: Player) {
  const explanation = useMemo(() => explainShown(mode, shown, aiSide), [mode, shown.index, shown.move, aiSide]);
  const [open, setOpen] = useState(false);
  // A new game (also after a mode or level change) goes back to move 0.
  useEffect(() => setOpen(false), [shown.index, shown.move, mode]);
  const toggleWhy = useCallback(() => setOpen((value) => !value), []);
  const closeWhy = useCallback(() => setOpen(false), []);
  return { explanation, open: open && explanation !== null, toggleWhy, closeWhy };
}

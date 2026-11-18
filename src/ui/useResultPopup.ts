import { useEffect, useRef, useState } from "react";
import type { Move, Player } from "../engine";

/** How a game ended: the winner, "draw" (D89), or null while it goes on. */
export type Ending = Player | "draw" | null;
import { moveAnimationTime } from "./animation/plan";
import { settingsStore } from "./settings";

// Short pause after the final move's animation, so the last capture is seen
// before the popup covers the board.
const PAUSE_AFTER_LAST_MOVE_MS = 450;

// Game time: from the first move until the game ends (a win or a draw). Time is UI business,
// so it lives here and not in the pure reducer.
export function useGameDuration(movesPlayed: number, winner: Ending): number | null {
  const startedAt = useRef<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);

  useEffect(() => {
    if (movesPlayed === 0) startedAt.current = null; // a new game
    else if (startedAt.current === null) startedAt.current = Date.now();
  }, [movesPlayed]);

  useEffect(() => {
    if (winner === null) setDuration(null);
    else if (startedAt.current !== null) setDuration(Date.now() - startedAt.current);
  }, [winner]);

  return duration;
}

// Opens the result popup when the game ends, won or drawn (after the last move has been
// animated), and lets the player close it to look at the board or open it
// again. A new game closes it. `extraMs` waits longer (an abandoned game:
// the AI's last line is read first, D85).
export function useResultPopup(winner: Ending, lastMove: Move | null, extraMs = 0) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (winner === null) {
      setOpen(false);
      return undefined;
    }
    const animation = lastMove ? moveAnimationTime(lastMove, settingsStore().get().animation) : 0;
    const timer = setTimeout(() => setOpen(true), animation + PAUSE_AFTER_LAST_MOVE_MS + extraMs);
    return () => clearTimeout(timer);
  }, [winner, lastMove]);

  return { open, close: () => setOpen(false), reopen: () => setOpen(true) };
}

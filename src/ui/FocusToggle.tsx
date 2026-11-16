import { useEffect, useRef, useState } from "react";
import { FocusExitIcon, FocusIcon } from "./icons";
import { CloseIcon } from "./leaderboard/lbIcons";

interface FocusToggleProps {
  focus: boolean;
  onChange: (on: boolean) => void;
  gameOver: boolean; // the game is over and its result panel is closed
  gameKey: number; // a new game brings the hint back after the next result
}

// The top bar's left slot (D88): the big screen symbol turns focus mode on,
// the small screen symbol turns it off. Once a game in focus mode is over, a
// hint points at the small screen symbol, as the way back to the move list
// and the action bar; it stays until used or closed, and comes back after
// the next game.
export function FocusToggle({ focus, onChange, gameOver, gameKey }: FocusToggleProps) {
  const [closedFor, setClosedFor] = useState<number | null>(null);

  if (!focus) {
    return (
      <button type="button" className="icon-button focus-toggle" aria-label="Focus mode" onClick={() => onChange(true)}>
        <FocusIcon />
      </button>
    );
  }
  const hint = gameOver && closedFor !== gameKey;
  return (
    <span className="focus-lead">
      <button type="button" className="icon-button focus-toggle" aria-label="Leave focus mode" onClick={() => onChange(false)}>
        <FocusExitIcon />
      </button>
      {hint && (
        <span className="focus-hint" role="group" aria-label="Game over">
          <button type="button" className="focus-hint-leave" onClick={() => onChange(false)}>
            Leave focus mode
          </button>
          <button type="button" className="focus-hint-close" aria-label="Stay in focus mode" onClick={() => setClosedFor(gameKey)}>
            <CloseIcon />
          </button>
        </span>
      )}
    </span>
  );
}

/**
 * The offer of focus mode (D88): at the start of a game outside focus mode,
 * a slim pill until the player's first move, a tap on it or Close; it comes
 * back with the next game. It floats where nothing is lost: over the chance
 * bar, which shows 50 to 50 at the start (one column), or in the empty move
 * list (two columns). No space of its own, so nothing moves when it goes.
 * A tap anywhere else on the screen closes it too (the owner's choice), and
 * that tap still does what it was for (a move, a button).
 */
export function FocusOffer({ onFocus, onClose }: { onFocus: () => void; onClose: () => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close.current();
    };
    document.addEventListener("pointerdown", onPointer, true);
    return () => document.removeEventListener("pointerdown", onPointer, true);
  }, []);
  return (
    <span ref={ref} className="focus-offer" role="group" aria-label="Focus mode">
      <button type="button" className="focus-offer-go" onClick={onFocus}>
        <FocusIcon />
        Try focus mode
      </button>
      <button type="button" className="focus-offer-close" aria-label="Not now" onClick={onClose}>
        <CloseIcon />
      </button>
    </span>
  );
}

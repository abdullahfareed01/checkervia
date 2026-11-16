// The result panel's buttons in an online game (D93): Rematch and Leave
// room. After you ask, the button waits for your friend; when your friend
// asked first, it accepts. A friend who left cannot play again.
import { useEffect, useRef } from "react";
import type { RoomView } from "../../online/protocol";
import { PlayIcon } from "../icons";
import { LeaveIcon } from "./LeaveRoom";

interface RematchActionsProps {
  view: RoomView;
  theirName: string;
  onRematch: () => void;
  onLeave: () => void;
}

export function RematchActions({ view, theirName, onRematch, onLeave }: RematchActionsProps) {
  const mainRef = useRef<HTMLButtonElement>(null);
  useEffect(() => mainRef.current?.focus({ preventScroll: true }), []);
  const gone = view.status === "closed" || view.status === "expired" || view.opponent?.left === true;
  const label = view.rematch === "opponent" ? "Accept rematch" : view.rematch === "you" ? "Waiting for your friend…" : "Rematch";
  const note = gone
    ? `${theirName} left the room. You can leave too.`
    : view.rematch === "opponent"
      ? `${theirName} wants a rematch. The colours swap.`
      : view.rematch === "you"
        ? `We asked ${theirName}. The colours swap in the next game.`
        : null;
  return (
    <div className="result-actions online-result-actions">
      {!gone && (
        <button ref={mainRef} type="button" className="result-play" disabled={view.rematch === "you"} aria-busy={view.rematch === "you"} onClick={onRematch}>
          <PlayIcon />
          {label}
        </button>
      )}
      <button ref={gone ? mainRef : undefined} type="button" className="result-review" onClick={onLeave}>
        <LeaveIcon />
        Leave room
      </button>
      <p className="online-result-note" aria-live="polite">
        {note ?? "\u00a0"}
      </p>
    </div>
  );
}

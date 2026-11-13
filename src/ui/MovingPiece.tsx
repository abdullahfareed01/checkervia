import { useLayoutEffect, useRef } from "react";
import { pieceAt } from "../engine";
import type { Board, Move, Position } from "../engine";
import { captureTimes, hopKeyframes, moveDuration } from "./moveGeometry";
import { Piece } from "./Piece";

interface MovingPieceProps {
  move: Move;
  before: Board; // the board before the move: who moved, and who was captured
  onDone: () => void;
}

// Position of a square inside the board, as CSS percentages.
function squareStyle({ row, col }: Position) {
  return { left: `${col * 12.5}%`, top: `${row * 12.5}%` };
}

// True when the visitor asked their system for less motion.
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// Plays the last move: a copy of the piece hops along every landing square,
// and each captured piece fades as it is jumped. The real board already shows
// the result; the board hides the real piece on the destination until done.
export function MovingPiece({ move, before, onDone }: MovingPieceProps) {
  const moverRef = useRef<HTMLDivElement>(null);
  const mover = pieceAt(before, move.from);
  const duration = moveDuration(move);
  const times = captureTimes(move);

  useLayoutEffect(() => {
    const element = moverRef.current;
    if (!element || typeof element.animate !== "function") {
      onDone(); // no animation support: just show the result
      return undefined;
    }
    const keyframes = hopKeyframes(move).map((frame) => ({
      transform: `translate(${frame.dx * 100}%, ${frame.dy * 100}%) scale(${frame.scale})`,
      offset: frame.offset,
    }));
    const animation = element.animate(keyframes, { duration, easing: "ease-in-out", fill: "forwards" });
    animation.onfinish = onDone;
    return () => animation.cancel();
    // Runs once per move; onDone may be a new function on every render.
  }, [move]);

  if (!mover) return null;

  return (
    <div className="move-layer" aria-hidden="true">
      {move.captured.map((square, index) => {
        const victim = pieceAt(before, square);
        return victim ? (
          <div
            key={index}
            className="ghost ghost-captured"
            style={{ ...squareStyle(square), animationDelay: `${times[index]! * duration}ms` }}
          >
            <Piece piece={victim} />
          </div>
        ) : null;
      })}
      <div ref={moverRef} className="ghost ghost-mover" style={squareStyle(move.from)}>
        <Piece piece={mover} />
      </div>
    </div>
  );
}

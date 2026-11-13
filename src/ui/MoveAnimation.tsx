import { useLayoutEffect, useRef } from "react";
import { pieceAt } from "../engine";
import type { Board, Move, Position } from "../engine";
import type { MovePlan } from "./animation/plan";
import { playPlan } from "./animation/player";
import type { PlayerHandlers } from "./animation/player";
import { Piece } from "./Piece";

interface MoveAnimationProps {
  move: Move;
  before: Board; // the board before the move: who moved, and who was captured
  plan: MovePlan;
  handlers: PlayerHandlers;
}

// Position of a square inside the board, as CSS percentages.
function squareStyle({ row, col }: Position) {
  return { left: `${col * 12.5}%`, top: `${row * 12.5}%` };
}

// Plays the last move from a snapshot of the board before it: a copy of the
// piece travels hop by hop with a lift and a shadow, each jumped piece fades
// as it lands, and a new King gets its crown. The real board already shows
// the result (the board hides the real piece on the destination until the
// plan is done). Unmounting cancels everything at once, with no leftovers.
export function MoveAnimation({ move, before, plan, handlers }: MoveAnimationProps) {
  const travel = useRef<HTMLDivElement>(null);
  const shadow = useRef<HTMLDivElement>(null);
  const lift = useRef<HTMLDivElement>(null);
  const piece = useRef<HTMLDivElement>(null);
  const crown = useRef<HTMLDivElement>(null);
  const sheen = useRef<HTMLDivElement>(null);
  const captured = useRef<(HTMLDivElement | null)[]>([]);
  const dust = useRef<(HTMLDivElement | null)[]>([]);
  const mover = pieceAt(before, move.from);

  useLayoutEffect(
    () =>
      playPlan(
        plan,
        {
          travel: travel.current,
          shadow: shadow.current,
          lift: lift.current,
          piece: piece.current,
          crown: crown.current,
          sheen: sheen.current,
          captured: captured.current,
          dust: dust.current,
        },
        handlers,
      ),
    // One run per plan; the handlers are read when the plan starts.
    [plan],
  );

  if (!mover) return null;
  const crowns = plan.steps.some((step) => step.kind === "crown");

  return (
    <div className="move-layer" aria-hidden="true">
      {move.captured.map((square, index) => {
        const victim = pieceAt(before, square);
        return victim ? (
          <div key={index} className="ghost" style={squareStyle(square)}>
            <div className="ghost-dust" ref={(element) => void (dust.current[index] = element)} />
            <div className="ghost-captured" ref={(element) => void (captured.current[index] = element)}>
              <Piece piece={victim} />
            </div>
          </div>
        ) : null;
      })}
      <div ref={travel} className="ghost ghost-mover" style={squareStyle(move.from)}>
        <div ref={shadow} className="ghost-shadow" />
        <div ref={lift} className="ghost-lift">
          <div ref={piece} className="ghost-piece">
            <Piece piece={mover} />
            {crowns && (
              <>
                <div className="ghost-sheen-clip">
                  <div ref={sheen} className="ghost-sheen" />
                </div>
                <div ref={crown} className="ghost-crown">
                  ♛
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

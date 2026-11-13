import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import type { Board as BoardType, Move, Piece, Position } from "../engine";
import { isDarkSquare, pieceAt, samePosition } from "../engine";
import type { Destination } from "../state/selectors";
import { planMove, staggerOrder } from "./animation/plan";
import type { AnimationOptions, MovePlan } from "./animation/plan";
import { playPlan } from "./animation/player";
import type { PlayerHandlers } from "./animation/player";
import type { MoveBeat } from "./feedback";
import { MoveAnimation } from "./MoveAnimation";
import { useSettings } from "./settings";
import { RouteOverlay } from "./RouteOverlay";
import { Square, sameMarks } from "./Square";
import type { SquareMarks } from "./Square";

// What the board needs to draw. All of it comes from the state layer.
export interface BoardView {
  board: BoardType;
  selected: Position | null;
  selectable: Position[];
  mustCapture: Position[];
  destinations: Destination[];
  routeChoices: Position[];
  lastMove: Move | null;
  locked: boolean;
  // For the move animation: the board before lastMove, and a number that
  // changes with every move (so the same move is not animated twice).
  previousBoard?: BoardType | null;
  moveKey?: number;
}

interface BoardProps {
  view: BoardView;
  onSquareClick: (position: Position) => void;
  // The move animation tells the game when each landing happens (its sound
  // and vibration) and while input must wait (the hops), never longer.
  onMoveBeat?: ((beat: MoveBeat) => void) | undefined;
  onMoveLock?: ((locked: boolean) => void) | undefined;
}

function includes(list: readonly Position[], position: Position): boolean {
  return list.some((item) => samePosition(item, position));
}

function marksFor(view: BoardView, position: Position): SquareMarks {
  const destination = view.destinations.find((d) => samePosition(d.position, position));
  const lastMove = view.lastMove;

  return {
    // Cinematic: legal destinations appear one ring of distance at a time.
    order: destination && view.selected ? staggerOrder(view.selected, position) : 0,
    selected: view.selected !== null && samePosition(view.selected, position),
    selectable: !view.locked && includes(view.selectable, position),
    mustCapture: includes(view.mustCapture, position),
    destination: destination ? (destination.capture ? "capture" : "move") : null,
    routeChoice: includes(view.routeChoices, position),
    lastMove:
      lastMove !== null &&
      (samePosition(lastMove.from, position) || samePosition(lastMove.to, position)),
  };
}

interface Playback {
  key: number;
  plan: MovePlan;
}

/**
 * Plans the move on screen when the board's animation key changes to a new
 * positive number (a new move, or one step forward in the history), from
 * the board before it. Animated levels show it with MoveAnimation; Off and
 * Reduced show the result at once but still sound each landing.
 */
function useMovePlayback(
  view: BoardView,
  options: AnimationOptions,
  onBeat: BoardProps["onMoveBeat"],
  onLock: BoardProps["onMoveLock"],
): [Playback | null, PlayerHandlers] {
  const [active, setActive] = useState<Playback | null>(null);
  const key = view.moveKey ?? 0;
  // The latest callbacks, read when a landing happens.
  const callbacks = useRef({ onBeat, onLock });
  callbacks.current = { onBeat, onLock };

  useLayoutEffect(() => {
    const move = view.lastMove;
    const before = view.previousBoard;
    if (key <= 0 || !move || !before) {
      setActive(null);
      return undefined;
    }
    const crowned = pieceAt(before, move.from)?.kind === "man" && pieceAt(view.board, move.to)?.kind === "king";
    const plan = planMove(move, crowned, options);
    if (!plan.animated) {
      setActive(null);
      return playPlan(plan, {}, { onBeat: (beat) => callbacks.current.onBeat?.(beat) });
    }
    setActive({ key, plan });
    callbacks.current.onLock?.(true);
    // A new move, a new game or leaving: the lock never outlives the plan.
    return () => callbacks.current.onLock?.(false);
    // Only a new key starts a plan.
  }, [key]);

  const handlers = useMemo<PlayerHandlers>(
    () => ({
      onBeat: (beat) => callbacks.current.onBeat?.(beat),
      onUnlock: () => callbacks.current.onLock?.(false),
      onDone: () => setActive(null),
    }),
    [],
  );
  return [active && active.key === key ? active : null, handlers];
}

interface BoardRowProps {
  row: number;
  pieces: readonly (Piece | null)[];
  marks: readonly SquareMarks[];
  locked: boolean;
  hiddenCol: number | null; // the square whose piece is still being animated in
  onSquareClick: (position: Position) => void;
}

// True when a row would look exactly the same: same pieces, same marks.
// Compared by value, because every move builds new row arrays.
function sameRow(a: BoardRowProps, b: BoardRowProps): boolean {
  if (a.row !== b.row || a.locked !== b.locked || a.hiddenCol !== b.hiddenCol || a.onSquareClick !== b.onSquareClick) return false;
  return a.pieces.every((piece, col) => {
    const other = b.pieces[col];
    return piece?.player === other?.player && piece?.kind === other?.kind && sameMarks(a.marks[col]!, b.marks[col]!);
  });
}

// One row of eight squares. Memoised by value: in development, React records
// a stack trace for every element it creates, so re-creating all 64 squares
// on every click was the slowest part of a move. Now only changed rows do.
const BoardRow = memo(function BoardRow({ row, pieces, marks, locked, hiddenCol, onSquareClick }: BoardRowProps) {
  return (
    <div className="board-row">
      {pieces.map((piece, col) => (
        <Square
          key={col}
          row={row}
          col={col}
          dark={isDarkSquare(row, col)}
          piece={piece}
          marks={marks[col]!}
          locked={locked}
          hidePiece={hiddenCol === col}
          onClick={onSquareClick}
        />
      ))}
    </div>
  );
}, sameRow);

// Identifies a move on screen, for restarting the route animation.
function routeKey(move: Move, moveKey: number): string {
  const squares = [move.from, ...move.path].map(({ row, col }) => `${row}${col}`).join("-");
  return `${moveKey}:${squares}`;
}

// Draws the 8x8 grid. It only renders what it is given and reports clicks.
export function Board({ view, onSquareClick, onMoveBeat, onMoveLock }: BoardProps) {
  const settings = useSettings();
  const [playback, handlers] = useMovePlayback(view, settings.animation, onMoveBeat, onMoveLock);
  const animating = playback !== null;
  const lastMove = view.lastMove;
  const mover = lastMove ? pieceAt(view.board, lastMove.to) : null;

  return (
    // A thin wooden frame; the coordinates are in the squares' corners.
    <div className="board-frame">
      <div
        className={`board${view.locked ? " board-locked" : ""}`}
        aria-label="Checkers board"
        // The last move highlight fades in once the piece has landed.
        style={{ "--land-delay": `${playback ? playback.plan.landing : 0}ms` } as React.CSSProperties}
      >
        {view.board.map((rowSquares, row) => (
          <BoardRow
            key={row}
            row={row}
            pieces={rowSquares}
            marks={rowSquares.map((_, col) => marksFor(view, { row, col }))}
            locked={view.locked}
            hiddenCol={animating && lastMove !== null && lastMove.to.row === row ? lastMove.to.col : null}
            onSquareClick={onSquareClick}
          />
        ))}
        {lastMove && mover && (
          // A new key for each move on screen, so the route's draw-in
          // animation plays again for every move.
          <RouteOverlay key={routeKey(lastMove, view.moveKey ?? 0)} move={lastMove} player={mover.player} />
        )}
        {playback && lastMove && view.previousBoard && (
          <MoveAnimation move={lastMove} before={view.previousBoard} plan={playback.plan} handlers={handlers} />
        )}
      </div>
    </div>
  );
}

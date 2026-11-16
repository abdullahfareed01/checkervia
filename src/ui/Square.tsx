import { memo } from "react";
import type React from "react";
import type { Piece as PieceType, Position } from "../engine";
import { FILE_LABELS, RANK_LABELS } from "./notation";
import { Piece } from "./Piece";

// Everything the board wants a square to show. Computed by the state layer.
export interface SquareMarks {
  order: number; // Cinematic: when a legal destination appears (by distance)
  selected: boolean;
  selectable: boolean;
  mustCapture: boolean;
  destination: "move" | "capture" | null;
  routeChoice: boolean;
  lastMove: boolean;
}

interface SquareProps {
  row: number; // the board's square (clicks, screen readers)
  col: number;
  // The square is in the left column or the bottom row on screen, where the
  // coordinates go (D50); with the board turned round (D81) these are not
  // row 7 and column 0.
  rankEdge?: boolean;
  fileEdge?: boolean;
  dark: boolean;
  piece: PieceType | null;
  marks: SquareMarks;
  locked: boolean;
  // True while the move animation is still travelling to this square.
  hidePiece?: boolean;
  onClick: (position: Position) => void;
}

// Text a screen reader hears for a dark square.
function describe(row: number, col: number, piece: PieceType | null, marks: SquareMarks): string {
  const parts = [`Row ${row + 1}, column ${col + 1}`];
  parts.push(piece ? `${piece.player} ${piece.kind === "king" ? "king" : "piece"}` : "empty");
  if (marks.selected) parts.push("selected");
  if (marks.mustCapture) parts.push("must capture");
  if (marks.destination === "move") parts.push("move here");
  if (marks.destination === "capture") parts.push("capture here");
  if (marks.routeChoice) parts.push("next landing square option");
  return parts.join(", ");
}

function classNames(dark: boolean, marks: SquareMarks): string {
  return [
    "square",
    dark ? "square-dark" : "square-light",
    marks.selected && "square-selected",
    marks.selectable && "square-selectable",
    marks.mustCapture && "square-must-capture",
    marks.destination === "move" && "square-destination",
    marks.destination === "capture" && "square-destination-capture",
    marks.routeChoice && "square-route-choice",
    marks.lastMove && "square-last-move",
  ]
    .filter(Boolean)
    .join(" ");
}

// The board's coordinates, in the corners of the edge squares (D50): the row
// number top left in the left column, the column letter bottom right in the
// bottom row. Decoration for sighted players; screen readers get the square
// names from each square's label.
function Coords({ row, col, rankEdge, fileEdge }: { row: number; col: number; rankEdge: boolean; fileEdge: boolean }) {
  return (
    <>
      {rankEdge && (
        <span className="coord coord-rank" aria-hidden="true">
          {RANK_LABELS[row]}
        </span>
      )}
      {fileEdge && (
        <span className="coord coord-file" aria-hidden="true">
          {FILE_LABELS[col]}
        </span>
      )}
    </>
  );
}

// Light squares are plain. Dark squares are buttons: the only squares a piece
// can ever stand on, so the only ones worth clicking.
function SquareView({ row, col, rankEdge = col === 0, fileEdge = row === 7, dark, piece, marks, locked, hidePiece = false, onClick }: SquareProps) {
  const coords = <Coords row={row} col={col} rankEdge={rankEdge} fileEdge={fileEdge} />;
  if (!dark)
    return (
      <div className={classNames(dark, marks)} aria-hidden="true">
        {coords}
      </div>
    );

  return (
    <button
      type="button"
      className={classNames(dark, marks)}
      aria-label={describe(row, col, piece, marks)}
      aria-pressed={marks.selected}
      disabled={locked}
      style={marks.destination ? ({ "--order": marks.order } as React.CSSProperties) : undefined}
      onClick={() => onClick({ row, col })}
    >
      {coords}
      {piece && <Piece piece={piece} hidden={hidePiece} />}
    </button>
  );
}

// True when two sets of marks look the same.
export function sameMarks(a: SquareMarks, b: SquareMarks): boolean {
  return (
    a.order === b.order &&
    a.selected === b.selected &&
    a.selectable === b.selectable &&
    a.mustCapture === b.mustCapture &&
    a.destination === b.destination &&
    a.routeChoice === b.routeChoice &&
    a.lastMove === b.lastMove
  );
}

// A square only re-draws when something it shows changes. The board builds
// a new marks object for every square on every render, so the marks are
// compared by value. Pieces are compared by what they are, not by object.
export const Square = memo(SquareView, (before, after) =>
  before.row === after.row &&
  before.col === after.col &&
  before.rankEdge === after.rankEdge &&
  before.fileEdge === after.fileEdge &&
  before.dark === after.dark &&
  before.locked === after.locked &&
  (before.hidePiece ?? false) === (after.hidePiece ?? false) &&
  before.onClick === after.onClick &&
  before.piece?.player === after.piece?.player &&
  before.piece?.kind === after.piece?.kind &&
  sameMarks(before.marks, after.marks),
);

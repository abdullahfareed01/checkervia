// Core data types for the rules engine. Pure TypeScript: no UI, no network.

export type Player = "black" | "white";

// A "man" is a regular piece; it becomes a "king" on the far row.
export type PieceKind = "man" | "king";

export interface Piece {
  readonly player: Player;
  readonly kind: PieceKind;
}

// Row 0 is the top of the board, column 0 is the left.
export interface Position {
  readonly row: number;
  readonly col: number;
}

// board[row][col] holds a piece, or null for an empty square.
export type Board = ReadonlyArray<ReadonlyArray<Piece | null>>;

// One complete turn for one piece.
// - from: the square the piece starts on.
// - to: the square it ends on (the last landing square).
// - path: every square it lands on, in order. A simple step has one entry.
// - captured: the opponent pieces jumped along the way, in order.
export interface Move {
  readonly from: Position;
  readonly to: Position;
  readonly path: ReadonlyArray<Position>;
  readonly captured: ReadonlyArray<Position>;
}

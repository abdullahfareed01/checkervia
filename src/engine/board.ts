import type { Board, Piece, Player, Position } from "./types";

export const BOARD_SIZE = 8;

// Each side starts with three rows of pieces: 3 rows x 4 dark squares = 12.
const STARTING_ROWS = 3;

// Pieces only ever stand on dark squares, which are the squares where
// row + col is odd.
export function isDarkSquare(row: number, col: number): boolean {
  return (row + col) % 2 === 1;
}

// True if the position is on the 8x8 board.
export function isInside({ row, col }: Position): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

// The piece on a square, or null if the square is empty or off the board.
export function pieceAt(board: Board, { row, col }: Position): Piece | null {
  return board[row]?.[col] ?? null;
}

// True if two positions are the same square.
export function samePosition(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

// The other side.
export function opponentOf(player: Player): Player {
  return player === "black" ? "white" : "black";
}

// Which way a regular piece moves along the rows: black moves up the board
// (row numbers go down), white moves down the board (row numbers go up).
export function forwardStep(player: Player): number {
  return player === "black" ? -1 : 1;
}

// The far row where a regular piece becomes a King: black crowns on row 0,
// white crowns on row 7.
export function crownRow(player: Player): number {
  return player === "black" ? 0 : BOARD_SIZE - 1;
}

// Every piece belonging to a player, with its square, scanned row by row.
export function piecesOf(
  board: Board,
  player: Player,
): { position: Position; piece: Piece }[] {
  return board.flatMap((rowSquares, row) =>
    rowSquares.flatMap((piece, col) =>
      piece && piece.player === player ? [{ position: { row, col }, piece }] : [],
    ),
  );
}

// White fills rows 0-2 (top, moves down); black fills rows 5-7 (bottom,
// moves up). Rows 3 and 4 start empty.
export function initialBoard(): Board {
  const white: Piece = { player: "white", kind: "man" };
  const black: Piece = { player: "black", kind: "man" };

  return Array.from({ length: BOARD_SIZE }, (_, row) =>
    Array.from({ length: BOARD_SIZE }, (_, col): Piece | null => {
      if (!isDarkSquare(row, col)) return null;
      if (row < STARTING_ROWS) return white;
      if (row >= BOARD_SIZE - STARTING_ROWS) return black;
      return null;
    }),
  );
}

const SYMBOLS: Record<string, Piece> = {
  b: { player: "black", kind: "man" },
  B: { player: "black", kind: "king" },
  w: { player: "white", kind: "man" },
  W: { player: "white", kind: "king" },
};

// Builds a board from 8 strings of 8 characters, row 0 first.
// '.' empty, 'b' black man, 'B' black king, 'w' white man, 'W' white king.
// Throws if a piece is placed on a light square, so a typo in a test layout
// cannot silently create an impossible position.
export function boardFrom(rows: readonly string[]): Board {
  if (rows.length !== BOARD_SIZE) throw new Error("boardFrom: need 8 rows");

  return rows.map((line, row) => {
    if (line.length !== BOARD_SIZE) throw new Error(`boardFrom: row ${row} needs 8 columns`);
    return [...line].map((symbol, col): Piece | null => {
      if (symbol === ".") return null;
      const piece = SYMBOLS[symbol];
      if (!piece) throw new Error(`boardFrom: unknown symbol '${symbol}'`);
      if (!isDarkSquare(row, col)) throw new Error(`boardFrom: light square ${row},${col}`);
      return piece;
    });
  });
}

// Square names as printed around the board, like a chess board: columns A to
// H from the left, rows 8 (top) to 1 (bottom). The UI and the AI prompt both
// use them, so the player and the model talk about the same squares.
const FILES = "ABCDEFGH";

/** "E3" for row index 5, column index 4 (row 0 is the top). */
export function squareName({ row, col }: Position): string {
  return `${FILES[col]}${BOARD_SIZE - row}`;
}

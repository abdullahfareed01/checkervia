// The Learn mode script: short scenes played by two robots, Gold (Black) and
// Cyan (White). Each scene teaches one or two rules. Squares are [row, column]
// counted from 0 (row 0 is the top); captions use the board's labels (A to H,
// rows 8 to 1), e.g. [2, 3] is D6. Every move is checked against the engine (src/learn/frames.ts).
import { boardFrom, initialBoard } from "../engine";
import type { Scene } from "./frames";

export const LESSONS: readonly Scene[] = [
  {
    title: "First moves and forced capture",
    intro:
      "Black always moves first. Gold Bot plays Black from the bottom, Cyan Bot plays White from the top. Pieces stand on the dark squares only.",
    board: initialBoard(),
    toMove: "black",
    steps: [
      {
        path: [[5, 2], [4, 3]],
        caption: "A regular piece moves one square diagonally forward, onto an empty square.",
      },
      {
        path: [[2, 5], [3, 4]],
        caption:
          "White steps forward too, right next to a black piece with an empty square behind it. Black's piece now glows red: it must capture.",
      },
      {
        path: [[4, 3], [2, 5]],
        caption:
          "A capture jumps over the opponent's piece into the empty square behind it, and the jumped piece is removed. Capturing is mandatory: when a capture is possible, no other move is allowed.",
      },
      {
        path: [[1, 6], [3, 4]],
        caption:
          "Now White must capture back. White had two pieces that could; it may pick either. Trading pieces like this is common.",
      },
    ],
  },
  {
    title: "Multi jump, King and a win",
    intro:
      "If a piece can keep jumping after a capture, it must continue in the same turn. Gold Bot's piece can jump twice.",
    board: boardFrom([
      ".......w",
      "........",
      "........",
      "....w...",
      "........",
      "..w.....",
      ".b......",
      "........",
    ]),
    toMove: "black",
    steps: [
      {
        path: [[6, 1], [4, 3], [2, 5]],
        caption: "A multi jump: two captures in one move. Both white pieces are removed when the move ends.",
      },
      {
        path: [[0, 7], [1, 6]],
        caption: "White's last piece has only one legal move, and it walks into a capture.",
      },
      {
        path: [[2, 5], [0, 7]],
        caption:
          "Black captures and lands on the far row, so the piece becomes a King (crowning ends the turn). White has no pieces left: Black wins.",
      },
    ],
  },
  {
    title: "Kings go backward",
    intro:
      "A King moves and captures one square diagonally in any direction, forward or backward. Here Black has a King on D6.",
    board: boardFrom([
      ".w......",
      "........",
      "...B....",
      "....w...",
      "........",
      "........",
      "........",
      "........",
    ]),
    toMove: "black",
    steps: [
      {
        path: [[2, 3], [4, 5]],
        caption: "The King captures backward, toward its own side. A regular piece could not do this.",
      },
      {
        path: [[0, 1], [1, 2]],
        caption: "White moves its last piece forward.",
      },
      {
        path: [[4, 5], [3, 4]],
        caption: "The King steps forward again, toward White's last piece.",
      },
    ],
  },
  {
    title: "Winning by blocking",
    intro:
      "You also win when your opponent cannot move at all. White's last piece, on A5, can only go one way.",
    board: boardFrom([
      "........",
      "........",
      "........",
      "w.......",
      ".b......",
      "........",
      "...b....",
      "........",
    ]),
    toMove: "black",
    steps: [
      {
        path: [[6, 3], [5, 2]],
        caption:
          "Black fills the square behind its own piece. White cannot step (the square is taken) and cannot jump (nowhere to land). No legal move: Black wins.",
      },
    ],
  },
];

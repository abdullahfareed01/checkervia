// All prompt text lives in this file, so changing the prompt means changing
// one place and bumping PROMPT_VERSION (and logging it in
// docs/03-technical/ai-opponent.md).
import { squareName } from "../engine";
import type { Board, Move, Piece, Player } from "../engine";
import type { Lookahead } from "./analyzer";
import type { MoveJudgement } from "./judge";
import { isForced, turnsToResult } from "./search";

export const PROMPT_VERSION = "v6";

const SYSTEM_RULES = `You are playing checkers on an 8x8 board.

Rules:
- A piece moves one step diagonally forward onto an empty square.
- A capture jumps diagonally over an opponent piece into the empty square behind it. A capture may continue with more jumps in the same turn.
- Capturing is mandatory. Kings move and capture both forward and backward.
- A piece that reaches the far row becomes a King.
- You win when the opponent has no pieces or no legal moves.

The legal moves are already worked out for you. Choose exactly one move from the list.
Reply with exactly {"move": <number>, "reason": "<why>", "reaction": "<line>"}, where <number> is the number of your chosen move, <why> is one short sentence (at most 20 words) saying why you chose it, and <line> is your reaction to your opponent's last move as described below (an empty string "" when there is nothing to react to). Write nothing else.`;

const DIRECTIONS = "Black moves up toward row 8. White moves down toward row 1.";

const LEGEND = "b = black piece, B = black king, w = white piece, W = white king, . = empty square.";

function symbolFor(piece: Piece | null): string {
  if (!piece) return ".";
  const letter = piece.player === "black" ? "b" : "w";
  return piece.kind === "king" ? letter.toUpperCase() : letter;
}

// A square as the player sees it on the board, e.g. "E3".
const square = squareName;

// The board as a text grid with the column letters on top and the row number
// (8 at the top down to 1) at the start of each line, as on the screen.
export function describeBoard(board: Board): string {
  const header = "  A B C D E F G H";
  const rows = board.map(
    (rowSquares, row) => `${board.length - row} ${rowSquares.map(symbolFor).join(" ")}`,
  );
  return [header, ...rows].join("\n");
}

// A look-ahead score in words: "+1.0", "-0.6", "0.0", or a forced result.
// Material is counted in pieces (a regular piece 1.0, a King 1.6).
export function describeScore(score: number): string {
  if (isForced(score)) {
    const turns = turnsToResult(score);
    if (score > 0) return turns === 1 ? "wins the game at once" : `forced win in ${turns} turns`;
    return `forced loss in ${turns} turns`;
  }
  const pieces = score / 100;
  const text = Math.abs(pieces).toFixed(1);
  if (text === "0.0") return "0.0";
  return `${pieces > 0 ? "+" : "-"}${text}`;
}

// How the scores were made, so the model can trust and use them.
function explainLookahead(depth: number): string {
  return [
    `Engine look-ahead: for every move below, the game engine tried every possible sequence of moves for the next ${depth} turns (your move is the first turn), with both sides always choosing their best option.`,
    `"score" is your material lead at the end of that line, in pieces (a regular piece counts 1.0, a King 1.6). Higher is better for you. "forced win in N turns" means you can win by force; "forced loss in N turns" means your opponent can.`,
    "The scores are exact for that many turns. Choose the move with the highest score unless you see a clear reason not to.",
  ].join("\n");
}

// The opponent's last move, as the engine judged it, for the "reaction".
export interface OpponentMove {
  readonly label: string; // e.g. "C3 -> D4"
  readonly judgement: MoveJudgement | null; // null: the engine found nothing special
  readonly recentLines?: readonly string[]; // the AI's last reactions, newest last
}

// The AI's voice for its reactions: a cocky, savage, funny rival with a free
// hand. The only limits keep it about the game (see D43).
const PERSONA =
  'For "reaction" you are a cocky, trash-talking checkers rival. Say whatever you like about your opponent\'s play: roast their mistakes hard, brag about your own moves, taunt them, mock their plan, give grudging respect when they play well. Be savage, confident and funny; mild swearing is fine. Vary your wording every time: never open with "Nice try". It is checkers: say pieces and kings, never pawns. Keep it about the game: no slurs, no hate, nothing about real-world looks, family, identity or sex, no threats. One short line, at most 20 words. Use "" only if you really have nothing to say.';

// The AI's own recent lines, so it does not repeat itself.
function describeRecentLines(lines: readonly string[] | undefined): string {
  if (!lines || lines.length === 0) return "";
  return ` Your last lines were: ${lines.map((line) => `"${line}"`).join(", ")}. Say something new; do not reuse their words or openings.`;
}

// What the AI is reacting to: the opponent's last move and, when the engine
// found it remarkable, its verdict (so a roast or a compliment is deserved).
function describeOpponentMove(opponent: OpponentMove | undefined): string {
  if (!opponent) return 'This is the first move of the game: set "reaction" to "" or open with some confident trash talk.';
  const about = `Your opponent's last move was ${opponent.label}.`;
  const recent = describeRecentLines(opponent.recentLines);
  if (!opponent.judgement) return `${about} The game engine found nothing special about it. ${PERSONA}${recent}`;
  const { verdict, detail } = opponent.judgement;
  return verdict === "blunder"
    ? `${about} The game engine judged it a blunder: ${detail} Roast them for it. ${PERSONA}${recent}`
    : `${about} The game engine judged it an excellent move: ${detail} Give them grudging respect, with a dig. ${PERSONA}${recent}`;
}

// One line of the move list, e.g. "3: C3 -> E5 | captures D4".
// The route is shown for multi jumps, because two different chains can start
// and end on the same squares. With a look-ahead score, the line ends with
// e.g. "| score +1.0" or "| forced win in 3 turns".
export function describeMove(move: Move, number: number, score?: number): string {
  const parts = [`${number}: ${square(move.from)} -> ${square(move.to)}`];
  if (move.path.length > 1) parts.push(`route ${move.path.map(square).join(", ")}`);
  if (move.captured.length > 0) parts.push(`captures ${move.captured.map(square).join(", ")}`);
  if (score !== undefined) parts.push(isForced(score) ? describeScore(score) : `score ${describeScore(score)}`);
  return parts.join(" | ");
}

// The numbered list of legal moves, starting at 1.
export function describeMoves(moves: readonly Move[], scores?: readonly number[]): string {
  return moves.map((move, index) => describeMove(move, index + 1, scores?.[index])).join("\n");
}

// The full prompt: rules, then the position, then (for the higher levels)
// how the look-ahead works, then the numbered legal moves. Scores are only
// used when there is exactly one per move.
export function buildPrompt(
  board: Board,
  player: Player,
  moves: readonly Move[],
  lookahead?: Lookahead,
  opponent?: OpponentMove,
): string {
  const side = player === "black" ? "Black" : "White";
  const scores = lookahead && lookahead.scores.length === moves.length ? lookahead.scores : undefined;
  return [
    SYSTEM_RULES,
    `Position (columns A to H from the left, rows 8 to 1 from the top):\n${describeBoard(board)}`,
    `${LEGEND}\n${DIRECTIONS}\nYou are playing ${side}.`,
    ...(scores && lookahead ? [explainLookahead(lookahead.depth)] : []),
    describeOpponentMove(opponent),
    `Legal moves:\n${describeMoves(moves, scores)}`,
  ].join("\n\n");
}

// The note sent with a retry, explaining why the last answer was rejected.
export function buildRetryNote(reason: string, moveCount: number): string {
  return `Your previous answer was rejected: ${reason} Reply with exactly {"move": <number>, "reason": "<why>", "reaction": "<line>"} using a number from 1 to ${moveCount}, and nothing else.`;
}

// Facts about a move that the rules engine can prove, shown next to the AI's
// own reason. The model's reason is just text; these are worked out from the
// board, so they are always true. Pure TypeScript: no React.
import { applyMove, getLegalMoves, getWinner, opponentOf, pieceAt, samePosition } from "../engine";
import type { Board, Move, Player, Position } from "../engine";
import type { ChosenLookahead } from "../ai/chooseMove";
import { AI_LEVELS } from "../ai/difficulty";
import type { AiLevel } from "../ai/difficulty";
import { describeScore } from "../ai/prompt";

export interface MoveFacts {
  readonly choices: number; // legal moves the mover had
  readonly captured: number; // opponent pieces taken by this move
  readonly crowned: boolean; // the moving piece became a King
  readonly wins: boolean; // the opponent is left with no legal move
  // The moved piece can be jumped on the opponent's next turn.
  readonly movedPieceAtRisk: boolean;
  // The mover's other pieces that can be jumped on the opponent's next turn.
  readonly othersAtRisk: number;
}

// "good" facts help the mover, "bad" ones are a risk, "info" is neutral.
export type FactTone = "good" | "bad" | "info";

export interface FactLine {
  readonly tone: FactTone;
  readonly text: string;
}

// Every square of `player` that the opponent could capture next turn.
function squaresAtRisk(after: Board, player: Player): Position[] {
  const risky: Position[] = [];
  for (const reply of getLegalMoves(after, opponentOf(player))) {
    for (const square of reply.captured) {
      if (!risky.some((seen) => samePosition(seen, square))) risky.push(square);
    }
  }
  return risky;
}

// Works out the facts for `move`, played by `player` on the board `before`.
export function moveFacts(before: Board, move: Move, player: Player): MoveFacts {
  const after = applyMove(before, move);
  const risky = squaresAtRisk(after, player);
  const movedPieceAtRisk = risky.some((square) => samePosition(square, move.to));

  return {
    choices: getLegalMoves(before, player).length,
    captured: move.captured.length,
    crowned: pieceAt(before, move.from)?.kind === "man" && pieceAt(after, move.to)?.kind === "king",
    wins: getWinner(after, opponentOf(player)) === player,
    movedPieceAtRisk,
    othersAtRisk: risky.length - (movedPieceAtRisk ? 1 : 0),
  };
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

// The facts as short sentences, most important first.
export function describeFacts(facts: MoveFacts): FactLine[] {
  const lines: FactLine[] = [];

  if (facts.wins) lines.push({ tone: "good", text: "This move wins the game." });
  if (facts.captured > 1) {
    lines.push({ tone: "good", text: `Multi jump: it captured ${plural(facts.captured, "piece")} in one move.` });
  } else if (facts.captured === 1) {
    lines.push({ tone: "good", text: "It captured 1 piece. Capturing was mandatory." });
  }
  if (facts.crowned) lines.push({ tone: "good", text: "The piece reached the far row and became a King." });

  lines.push({
    tone: "info",
    text: facts.choices === 1 ? "This was the only legal move." : `It chose 1 of ${facts.choices} legal moves.`,
  });

  if (!facts.wins) {
    lines.push(
      facts.movedPieceAtRisk
        ? { tone: "bad", text: "The moved piece can be captured next turn." }
        : { tone: "good", text: "The moved piece cannot be captured next turn." },
    );
    if (facts.othersAtRisk > 0) {
      lines.push({
        tone: "bad",
        text: `${plural(facts.othersAtRisk, "other piece")} can be captured next turn.`,
      });
    }
  }
  return lines;
}

// What the model was offered at its level: every move or the best few, and
// whether it saw the scores (an Easy slip hides them).
function describeOffer(level: AiLevel | null, { depth, offered, legal, scoresShown }: ChosenLookahead): FactLine {
  const name = level ? `${AI_LEVELS[level].name} level` : "This level";
  const turns = `${depth} ${depth === 1 ? "turn" : "turns"}`;
  if (!scoresShown) return { tone: "info", text: `${name}: a deliberate slip. The AI chose without the engine's scores this time.` };
  const choice = offered < legal ? `its best ${offered} of ${legal} moves` : `all ${legal} legal moves`;
  return { tone: "info", text: `${name}: the engine looked ${turns} ahead and offered the AI ${choice}.` };
}

/**
 * What the engine's look-ahead said about the AI's move: what the AI was
 * offered at its level, the move's score, and whether it was one of the
 * engine's best moves.
 */
export function describeLookahead(lookahead: ChosenLookahead, level: AiLevel | null = null): FactLine[] {
  const { depth, score, best } = lookahead;
  const lines: FactLine[] = [
    describeOffer(level, lookahead),
    { tone: "info", text: `Looking ${depth} ${depth === 1 ? "turn" : "turns"} ahead, the engine scored this move ${describeScore(score)}.` },
  ];
  lines.push(
    score >= best
      ? { tone: "good", text: "It is one of the engine's top-scored moves." }
      : { tone: "bad", text: `The engine's best move scored ${describeScore(best)}.` },
  );
  return lines;
}

// Development only (?lb=<state>&form=1): the real result panel with the real
// leaderboard form, for a real legal win made here (the engine's best move
// 4 turns deep for Black against White's first listed move), so the
// development server's replay accepts it. Never in a production build.
import { useState } from "react";
import { analyzeMoves } from "../../ai/search";
import { applyMove, getLegalMoves, getWinner, initialBoard, opponentOf } from "../../engine";
import type { Board, Player } from "../../engine";
import { encodeMove } from "../../leaderboard/protocol";
import type { EncodedMove } from "../../leaderboard/protocol";
import { ResultDialog } from "../ResultDialog";
import { TermsDialog } from "../TermsDialog";
import { LeaderboardScreen } from "./LeaderboardScreen";
import { randomId } from "./profile";
import { SubmitWin } from "./SubmitWin";

function legalWin(): EncodedMove[] {
  let board: Board = initialBoard();
  let toMove: Player = "black";
  const moves: EncodedMove[] = [];
  while (getWinner(board, toMove) === null && moves.length < 600) {
    const move =
      toMove === "black"
        ? analyzeMoves(board, "black", 4).reduce((best, option) => (option.score > best.score ? option : best)).move
        : getLegalMoves(board, toMove)[0]!;
    moves.push(encodeMove(move));
    board = applyMove(board, move);
    toMove = opponentOf(toMove);
  }
  return moves;
}

export function DevResultPreview() {
  const [win] = useState(() => ({ gameId: randomId(), level: 4 as const, moves: legalWin() }));
  const [terms, setTerms] = useState(false);
  const [board, setBoard] = useState(false);
  const side = { moves: Math.ceil(win.moves.length / 2), captured: 12, kingsMade: 2, bestChain: 2 };
  return (
    <>
      <ResultDialog
        winner="black"
        mode="vs-ai"
        reason="White has no pieces left."
        stats={{ black: side, white: { moves: Math.floor(win.moves.length / 2), captured: 7, kingsMade: 0, bestChain: 1 } }}
        pieces={{ black: 5, white: 0 }}
        totalMoves={win.moves.length}
        durationMs={332_000}
        onPlayAgain={() => {}}
        onReview={() => {}}
        onClose={() => {}}
        leaderboard={<SubmitWin win={win} placement="result" onTerms={() => setTerms(true)} onViewLeaderboard={() => setBoard(true)} />}
      />
      {board && <LeaderboardScreen onClose={() => setBoard(false)} />}
      {terms && <TermsDialog onClose={() => setTerms(false)} />}
    </>
  );
}

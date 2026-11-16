// Development only (?lb=<state>&result=1): the real result panel with the
// automatic leaderboard line, for a real legal win (the first recorded game
// of the ?testwin= helper, D60), so the development server's replay accepts
// it. With ?lb=offline, error, limited or slow the line shows that state.
// Never in a production build.
import { useState } from "react";
import type { EncodedMove } from "../../leaderboard/protocol";
import { ResultDialog } from "../ResultDialog";
import games from "../testWin/testWinGames.json";
import { LeaderboardScreen } from "./LeaderboardScreen";
import { leaderboardStore, randomId } from "./profile";
import { WinStatus } from "./WinStatus";

export function DevResultPreview() {
  const [win] = useState(() => {
    const made = { gameId: randomId(), level: 4 as const, colour: "black" as const, moves: (games as EncodedMove[][])[0]! };
    leaderboardStore.enqueue(made);
    return made;
  });
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
        leaderboard={<WinStatus win={win} onViewLeaderboard={() => setBoard(true)} />}
      />
      {board && <LeaderboardScreen onClose={() => setBoard(false)} />}
    </>
  );
}

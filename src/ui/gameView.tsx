// Small helpers that turn game state into what the game screen shows.
import { AI_LEVELS } from "../ai";
import { opponentOf } from "../engine";
import type { Board as BoardType, Player } from "../engine";
import { AI_PLAYER, canHumanAct } from "../state/gameReducer";
import type { GameMode, GameState } from "../state/gameReducer";
import type { DisplayedPosition } from "../state/history";
import {
  destinations,
  mustCapturePieces,
  pieceCounts,
  routeChoiceSquares,
  selectablePieces,
} from "../state/selectors";
import type { BoardView } from "./Board";
import { PlayerCard } from "./PlayerCard";

const PIECES_PER_SIDE = 12;

// The board shows the position on screen: the live one, or an older one while
// reviewing the history (then it is locked and shows no move hints).
export function boardViewOf(state: GameState, shown: DisplayedPosition, moveKey: number): BoardView {
  return {
    board: shown.board,
    selected: state.selected,
    selectable: selectablePieces(state),
    mustCapture: mustCapturePieces(state),
    destinations: destinations(state),
    routeChoices: routeChoiceSquares(state),
    lastMove: shown.move,
    // Locked after a win, while the AI is thinking or has failed, and while
    // reviewing an older position.
    locked: !canHumanAct(state),
    previousBoard: shown.previousBoard,
    moveKey,
  };
}

// Plain-language reason for a win: the loser has no pieces, or none can move.
export function winReasonOf(state: GameState): string | null {
  if (!state.winner) return null;
  const loser = opponentOf(state.winner);
  const name = loser === "black" ? "Black" : "White";
  return pieceCounts(state.board)[loser] === 0
    ? `${name} has no pieces left.`
    : `${name} has no legal moves.`;
}

export function nameOf(mode: GameMode, player: Player): string {
  if (mode === "vs-ai") return player === AI_PLAYER ? "AI" : "You";
  return player === "black" ? "Black" : "White";
}

// Card details for one side. Piece counts follow the board on screen, so they
// match the position being reviewed. The AI's card shows its level.
export function cardFor(state: GameState, board: BoardType, player: Player, placement: "top" | "bottom") {
  const counts = pieceCounts(board);
  const isAi = state.mode === "vs-ai" && player === AI_PLAYER;
  const toMove = state.winner === null && state.currentPlayer === player;

  return (
    <PlayerCard
      player={player}
      name={nameOf(state.mode, player)}
      robot={isAi}
      level={isAi ? AI_LEVELS[state.aiLevel].name : undefined}
      pieces={counts[player]}
      captured={PIECES_PER_SIDE - counts[opponentOf(player)]}
      toMove={toMove}
      thinking={isAi && state.aiPhase === "thinking"}
      winner={state.winner === player}
      placement={placement}
    />
  );
}

import type { ReactNode } from "react";
// Small helpers that turn game state into what the game screen shows.
import { AI_LEVELS } from "../ai";
import { strongLanguage } from "../ai/language";
import { opponentOf } from "../engine";
import type { Board as BoardType, Player } from "../engine";
import { aiSideOf, canHumanAct } from "../state/gameReducer";
import type { GameMode, GameState } from "../state/gameReducer";
import type { DisplayedPosition } from "../state/history";
import {
  destinations,
  mustCapturePieces,
  pieceCounts,
  routeChoiceSquares,
  selectablePieces,
} from "../state/selectors";
import type { AiMood } from "./aiMood";
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
    // You play White against the AI: White at the bottom (D81).
    flipped: state.mode === "vs-ai" && state.humanSide === "white",
  };
}

// Plain-language reason for a win: the loser has no pieces, or none can move.
export function winReasonOf(state: GameState): string | null {
  if (!state.winner) return null;
  const loser = opponentOf(state.winner);
  const name = loser === "black" ? "Black" : "White";
  if (state.abandoned) return "Game abandoned: you did not move."; // D85
  if (state.resignedBy) return state.mode === "vs-ai" ? "You resigned." : `${name} resigned.`;
  return pieceCounts(state.board)[loser] === 0
    ? `${name} has no pieces left.`
    : `${name} has no legal moves.`;
}

/** "You" or "AI" against the AI (`aiSide`: its colour, D81), else the colour. */
export function nameOf(mode: GameMode, player: Player, aiSide: Player = "white"): string {
  if (mode === "vs-ai") return player === aiSide ? "AI" : "You";
  return player === "black" ? "Black" : "White";
}

// Card details for one side. Piece counts follow the board on screen, so they
// match the position being reviewed. The AI's card shows its level.
export function cardFor(
  state: GameState,
  board: BoardType,
  player: Player,
  placement: "top" | "bottom",
  onAdultInfo?: () => void, // opens the language rules (Strongest's 18+ badge)
  mood: AiMood = "neutral", // the AI's face (D64)
  portrait: string | null = null, // the player's chosen avatar id (D65)
  action?: ReactNode, // focus mode's small Resign, after the turn (D87)
) {
  const counts = pieceCounts(board);
  const isAi = state.mode === "vs-ai" && player === aiSideOf(state);
  const toMove = state.winner === null && state.currentPlayer === player;

  return (
    <PlayerCard
      player={player}
      name={nameOf(state.mode, player, aiSideOf(state))}
      robot={isAi}
      chips={
        isAi
          ? {
              level: AI_LEVELS[state.aiLevel].name,
              voice: AI_LEVELS[state.aiLevel].voice,
              onAdultInfo: strongLanguage(state.aiLevel) ? onAdultInfo : undefined,
            }
          : undefined
      }
      pieces={counts[player]}
      captured={PIECES_PER_SIDE - counts[opponentOf(player)]}
      toMove={toMove}
      thinking={isAi && state.aiPhase === "thinking"}
      mood={isAi ? mood : undefined}
      portrait={isAi ? null : portrait}
      winner={state.winner === player}
      placement={placement}
      action={action}
    />
  );
}

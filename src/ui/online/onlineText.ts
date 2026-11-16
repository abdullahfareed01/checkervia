// The words of an online game (D92, D93), worked out from the room and the
// board: the status line's phase, why the game ended, and the names. "You"
// for the local player, the username for the opponent. Pure.
import { opponentOf } from "../../engine";
import type { Board, Player } from "../../engine";
import type { FinishReason, RoomView } from "../../online/protocol";
import { pieceCounts } from "../../state/selectors";
import type { OnlinePhase } from "./OnlineStatus";

export function namesOf(view: RoomView, me: Player): Record<Player, string> {
  const them = view.opponent?.username ?? "Your friend";
  return me === "black" ? { black: "You", white: them } : { black: them, white: "You" };
}

/** Why the game ended, from the winner's side: "Sara resigned.", "You have no pieces left." */
export function endReason(reason: FinishReason | null, winner: Player, me: Player, names: Record<Player, string>, board: Board): string {
  const loser = opponentOf(winner);
  const you = loser === me;
  const name = names[loser];
  switch (reason) {
    case "resign":
      return `${name} resigned.`;
    case "forfeit":
      return you ? "You were gone too long, so the game went to your opponent." : `${name} was gone too long, so the game is yours.`;
    case "left":
      return `${name} left the room.`;
    default:
      if (pieceCounts(board)[loser] === 0) return you ? "You have no pieces left." : `${name} has no pieces left.`;
      return you ? "You have no legal moves." : `${name} has no legal moves.`;
  }
}

export interface PhaseInput {
  readonly view: RoomView;
  readonly me: Player;
  readonly names: Record<Player, string>;
  readonly board: Board;
  readonly winner: Player | null;
  readonly startsIn: number; // ms
  readonly myTurn: boolean;
  readonly choosingRoute: boolean;
  readonly sending: boolean;
  readonly forfeitIn: number | null; // ms, while the opponent is offline in a game
}

export function phaseOf(input: PhaseInput): OnlinePhase {
  const { view, me, names, winner } = input;
  if (winner) return { kind: "over", winner, winnerName: names[winner], reason: endReason(view.match?.reason ?? "board", winner, me, names, input.board) };
  if (view.status === "expired") return { kind: "closed", text: "This room has expired." };
  if (view.status === "closed") return { kind: "closed", text: view.opponent?.left ? `${view.opponent.username} left the room.` : "This room is closed." };
  if (input.startsIn > 0) return { kind: "starting", seconds: Math.ceil(input.startsIn / 1000) };
  if (input.forfeitIn !== null) return { kind: "disconnected", seconds: Math.max(0, Math.ceil(input.forfeitIn / 1000)) };
  return input.myTurn ? { kind: "yourTurn", choosingRoute: input.choosingRoute } : { kind: "theirTurn", sending: input.sending };
}

/** Under the result title. */
export const resultSubtitle = (won: boolean) => (won ? "Well played!" : "Good game. Want a rematch?");
